// src/steps/scheduleReactivation.step.ts
import { EventConfig, Handlers } from 'motia'
import { z } from 'zod'
import { differenceInMilliseconds } from 'date-fns'
// import { Memory } from '../../types/memory.types'
import {Memory} from 'src/types/memory.types' 

/**
 * Schedule Reactivation Event Step
 *
 * Handles scheduling of memories with date-based triggers.
 * Uses Motia's durable execution to wake up at the right time.
 */

const inputSchema = z.object({
  memoryId: z.string(),
  embeddingId: z.string(),
  timestamp: z.string(),
})

export const config: EventConfig = {
  type: 'event',
  name: 'ScheduleReactivation',
  description: 'Schedule memory to reactivate at trigger time',
  subscribes: ['memory-embedded'],
  flows: ['memory-flow'],
  input: inputSchema,
  emits: [{ topic: 'memory-reactivation-scheduled', label: 'Reactivation Scheduled', conditional: true }],
}

export const handler: Handlers['ScheduleReactivation'] = async (input:any, { logger, state, emit }:any) => {
  const { memoryId } = input

  logger.info('⏰ Checking for reactivation schedule', { memoryId })

  try {
    // Retrieve memory from state
    const memory = await (state.get('memories', memoryId)) as Memory | null

    if (!memory) {
      logger.error('Memory not found', { memoryId })
      return
    }

    // Only schedule if date-based trigger
    if (memory.triggerType !== 'date' || !memory.triggerDate) {
      logger.info('Memory has no date trigger, skipping schedule', {
        memoryId,
        triggerType: memory.triggerType,
      })
      return
    }

    const triggerDate = new Date(memory.triggerDate)
    const now = new Date()
    const delayMs = differenceInMilliseconds(triggerDate, now)

    if (delayMs <= 0) {
      logger.warn('Trigger date is in the past, activating immediately', {
        memoryId,
        triggerDate: memory.triggerDate,
      })
      
      // Emit immediate reactivation
      await emit({
        topic: 'memory-reactivation-scheduled',
        data: {
          memoryId,
          scheduledFor: memory.triggerDate,
          immediate: true,
        },
      })
      return
    }

    logger.info('Scheduling reactivation', {
      memoryId,
      triggerDate: memory.triggerDate,
      delayMs,
      delayHours: Math.round(delayMs / (1000 * 60 * 60)),
    })

    // Store schedule info in state
    await state.set('memory-schedules', memoryId, {
      memoryId,
      scheduledFor: triggerDate.toISOString(),
      scheduledAt: new Date().toISOString(),
      delayMs,
    })

    // Emit scheduled event (Motia will handle the durable wait)
    await emit({
      topic: 'memory-reactivation-scheduled',
      data: {
        memoryId,
        scheduledFor: memory.triggerDate,
        delayMs,
      },
    })

    logger.info('✅ Reactivation scheduled', { memoryId })
  } catch (error) {
    logger.error('Failed to schedule reactivation', {
      memoryId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    throw error
  }
}