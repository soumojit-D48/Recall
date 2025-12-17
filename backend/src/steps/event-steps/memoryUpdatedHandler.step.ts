

import { EventConfig, Handlers } from 'motia'
import { z } from 'zod'

/**
 * Memory Updated Handler Event Step
 *
 * Background job that handles memory update events.
 * Used for:
 * - Audit logging
 * - Cache invalidation
 * - Sync with external systems
 * - Re-indexing search if needed
 */

const inputSchema = z.object({
  memoryId: z.string(),
  updates: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    status: z.string().optional(),
    type: z.string().optional(),
    tags: z.array(z.string()).optional(),
    severity: z.string().optional(),
  }),
  timestamp: z.string(),
})

export const config: EventConfig = {
  type: 'event',
  name: 'MemoryUpdatedHandler',
  description: 'Handles memory update events for audit logging and sync',
  subscribes: ['memory-updated'],
  flows: ['memory-flow'],
  input: inputSchema,
  emits: [],
}

export const handler: Handlers['MemoryUpdatedHandler'] = async (input, { logger, state }) => {
  const { memoryId, updates, timestamp } = input

  logger.info('Processing memory update', { memoryId, updates, timestamp })

  // Create audit log entry
  const auditEntry = {
    memoryId,
    action: 'update',
    changes: updates,
    timestamp,
    recordedAt: new Date().toISOString(),
  }

  // Store audit log in state (append to history)
  const auditKey = `${memoryId}-update-${Date.now()}`
  await state.set('audit-log', auditKey, auditEntry)

  logger.info('Audit log entry created', { auditKey, memoryId })

  // Optional: Update aggregated update metrics
  const metricsKey = 'update-metrics'
  const todayKey = new Date().toISOString().split('T')[0]

  const existingMetrics = await state.get<Record<string, number>>(
    'update-aggregates',
    `${metricsKey}-${todayKey}`
  )

  const metrics = existingMetrics ?? {
    total_updates: 0,
    title_updates: 0,
    status_updates: 0,
    description_updates: 0,
  }

  metrics.total_updates++
  if (updates.title) metrics.title_updates++
  if (updates.status) metrics.status_updates++
  if (updates.description) metrics.description_updates++

  await state.set('update-aggregates', `${metricsKey}-${todayKey}`, metrics)

  logger.info('Memory update processed successfully', { memoryId })
}