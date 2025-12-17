


// src/steps/logMemory.step.ts
import { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { memoryService } from '../../services/memory.service'
import { createMemorySchema, memorySchema } from '../../types/memory.types'

/**
 * Log Memory API Step
 *
 * Creates a new memory entry and emits events for:
 * - AI analysis
 * - Analytics tracking
 * - Real-time stream updates
 */
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'LogMemory',
  description: 'Creates a new memory entry',
  method: 'POST',
  path: '/memories',
  flows: ['memory-flow'],
  bodySchema: createMemorySchema,
  responseSchema: {
    201: memorySchema,
    400: z.object({ error: z.string() }),
  },
  emits: [
    { topic: 'memory-created', label: 'Memory Created' },
    { topic: 'track-analytics', label: 'Track Analytics Event' },
  ],
  includeFiles: ['../../types/memory.types.ts', '../../services/memory.service.ts'],
}

export const handler: Handlers['LogMemory'] = async (req: any, { emit, logger, streams, state }: any) => {
  try {
    const input = createMemorySchema.parse(req.body)
    logger.info('Creating new memory', { title: input.title, type: input.type })

    // Create the memory in our service layer (using state for persistence)
    const memory = await memoryService.create(input, state)

    // Store in state for workflow
    await state.set('workflow', 'currentMemory', memory)

    // Update the real-time stream so clients get immediate updates
    await streams.memory.set('all-memories', memory.id, memory)

    // Emit event for AI analysis (background job)
    await emit({
      topic: 'memory-created',
      data: {
        memoryId: memory.id,
        title: memory.title,
        type: memory.type,
      },
    })

    // Emit event for analytics tracking (background job)
    await emit({
      topic: 'track-analytics',
      data: {
        event: 'memory_created',
        memoryId: memory.id,
        type: memory.type,
        timestamp: memory.createdAt,
      },
    })

    logger.info('Memory created successfully', { memoryId: memory.id })

    return {
      status: 201,
      body: memory,
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error('Validation error creating memory', { error: error.message })
      return {
        status: 400,
        body: {
          error: 'Validation failed: ' + error.issues.map((e: any) => e.message).join(', ')
        },
      }
    }

    logger.error('Error creating memory', { error: String(error) })
    return {
      status: 400,
      body: { error: 'Failed to create memory' },
    }
  }
}