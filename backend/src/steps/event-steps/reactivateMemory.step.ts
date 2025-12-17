

// src/steps/reactivateMemory.step.ts
import { EventConfig, Handlers } from 'motia'
import { z } from 'zod'
import { reanalyzeMemory } from '../../utils/openAI'
import { Memory } from '../../types/memory.types'
import { memoryService } from '../../services/memory.service'

/**
 * Reactivate Memory Event Step
 *
 * Handles memory reactivation when trigger conditions are met.
 * Re-analyzes with current context and prepares notification.
 */

const inputSchema = z.object({
  memoryId: z.string(),
  scheduledFor: z.string(),
  delayMs: z.number().optional(),
  immediate: z.boolean().optional(),
})

export const config: EventConfig = {
  type: 'event',
  name: 'ReactivateMemory',
  description: 'Reactivate a scheduled memory',
  subscribes: ['memory-reactivation-scheduled'],
  flows: ['memory-flow'],
  input: inputSchema,
  emits: [{ topic: 'memory-reactivated', label: 'Memory Reactivated' }],
}

export const handler: Handlers['ReactivateMemory'] = async (input:any, { logger, state, emit, streams }: any) => {
  const { memoryId, immediate, delayMs } = input

  logger.info('🔔 Reactivating memory', { memoryId, immediate })

  try {
    // If not immediate, wait for the scheduled time (Motia handles durable wait)
    if (!immediate && delayMs) {
      logger.info('Waiting for scheduled time', { memoryId, delayMs })
      await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, 60000))) // Cap at 1 min for demo
    }

    // Retrieve memory from state
    const memory = await (state.get('memories', memoryId)) as Memory | null

    if (!memory) {
      logger.error('Memory not found', { memoryId })
      throw new Error(`Memory ${memoryId} not found`)
    }

    logger.info('Re-analyzing memory with current context', { memoryId })

    // Re-analyze with current context
    const currentContext = `Memory is being reactivated on ${new Date().toISOString()}`
    const reanalysis = await reanalyzeMemory(memory, currentContext)

    // Update memory status to triggered
    await memoryService.update(
      memoryId,
      { status: 'triggered' },
      state
    )

    // Get updated memory
    const updatedMemory = await (state.get('memories', memoryId)) as Memory | null

    if (updatedMemory) {
      // Update real-time stream
      await streams.memory.set('all-memories', memoryId, updatedMemory)
    }

    // Store reanalysis
    await state.set('memory-reanalysis', memoryId, {
      memoryId,
      reanalysis,
      reactivatedAt: new Date().toISOString(),
    })

    // Emit reactivated event for notification
    await emit({
      topic: 'memory-reactivated',
      data: {
        memoryId,
        title: memory.title,
        reanalysis,
        reactivatedAt: new Date().toISOString(),
      },
    })

    logger.info('✅ Memory reactivated', { memoryId })
  } catch (error) {
    logger.error('Failed to reactivate memory', {
      memoryId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    throw error
  }
}