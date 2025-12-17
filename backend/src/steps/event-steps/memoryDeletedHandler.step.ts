

import { EventConfig } from 'motia'
import { z } from 'zod'

const inputSchema = z.object({
  memoryId: z.string(),
  title: z.string(),
  timestamp: z.string(),
})

export const config: EventConfig = {
  type: 'event',
  name: 'MemoryDeletedHandler',
  description: 'Handles memory deletion cleanup and audit',
  subscribes: ['memory-deleted'],
  flows: ['memory-flow'],
  input: inputSchema,
  emits: [],
}

export const handler = async (input: any, { logger, state }: any) => {
  const { memoryId, title, timestamp } = input

  logger.info('Processing memory deletion', { memoryId, title, timestamp })

  try {
    // Create deletion audit log
    const auditEntry = {
      memoryId,
      title,
      action: 'delete',
      timestamp,
      recordedAt: new Date().toISOString(),
    }

    const auditKey = `deleted-${memoryId}-${Date.now()}`
    await state.set('audit-log', auditKey, auditEntry)

    // Clean up any related state data
    // Remove notification history
    try {
      await state.delete('notification-history', memoryId)
      logger.info('Notification history cleaned up', { memoryId })
    } catch (error) {
      logger.warn('No notification history to clean up', { memoryId })
    }

    // Remove analysis history (try known keys)
    const analysisKeysToTry = [
      `${memoryId}-analysis`,
      `${memoryId}-${Date.now()}`,
    ]
    
    for (const key of analysisKeysToTry) {
      try {
        await state.delete('memory-analysis-history', key)
        logger.info('Analysis history cleaned up', { memoryId, key })
      } catch (error) {
        // Key doesn't exist, that's fine
      }
    }

    // Remove reanalysis data
    try {
      await state.delete('memory-reanalysis', memoryId)
      logger.info('Reanalysis data cleaned up', { memoryId })
    } catch (error) {
      logger.warn('No reanalysis data to clean up', { memoryId })
    }

    // Remove schedule data if exists
    try {
      await state.delete('memory-schedules', memoryId)
      logger.info('Schedule data cleaned up', { memoryId })
    } catch (error) {
      logger.warn('No schedule data to clean up', { memoryId })
    }

    // Update deletion metrics
    const metricsKey = 'deletion-metrics'
    const todayKey = new Date().toISOString().split('T')[0]

    // <{
    //   total_deletions: number
    //   by_status: Record<string, number>
    // }>

    const existingMetrics = await state.get('deletion-aggregates', `${metricsKey}-${todayKey}`) as { total_deletions: number, by_status: Record<string, number>}

    const metrics = existingMetrics ?? {
      total_deletions: 0,
      by_status: {},
    }

    metrics.total_deletions++

    await state.set('deletion-aggregates', `${metricsKey}-${todayKey}`, metrics)

    logger.info('Memory deletion processed successfully', {
      memoryId,
      title,
      cleanupCompleted: true,
    })
  } catch (error) {
    logger.error('Error processing memory deletion', {
      memoryId,
      error: error instanceof Error ? error.message : String(error),
    })
    // Don't throw - we still want to log the deletion even if cleanup fails
  }
}