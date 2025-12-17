
import { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { memoryService } from '../../services/memory.service'
import { updateMemorySchema, memorySchema, Memory } from '../../types/memory.types'

export const config: ApiRouteConfig = {
  type: 'api',
  name: 'UpdateMemory',
  description: 'Updates an existing memory',
  method: 'PATCH',
  path: '/memories/:id',
  flows: ['memory-flow'],
  bodySchema: updateMemorySchema,
  responseSchema: {
    200: memorySchema,
    400: z.object({ error: z.string() }),
    404: z.object({ error: z.string() }),
  },
  emits: [
    { topic: 'memory-updated', label: 'Memory Updated' },
    { topic: 'track-analytics', label: 'Track Analytics Event' },
  ],
  includeFiles: ['../../types/memory.types.ts', '../../services/memory.service.ts'],
}

export const handler: Handlers['UpdateMemory'] = async (req: any, { emit, logger, streams, state }: any) => {
  const { id } = req.pathParams

  try {
    const input = updateMemorySchema.parse(req.body)

    logger.info('Updating memory', { memoryId: id, updates: Object.keys(input) })

    // Get current memory
    const existingMemory = await memoryService.getById(id, state)

    if (!existingMemory) {
      logger.warn('Memory not found', { memoryId: id })
      return {
        status: 404,
        body: { error: 'Memory not found' },
      }
    }

    // Update the memory
    const memory = await memoryService.update(id, input, state)

    if (!memory) {
      return {
        status: 404,
        body: { error: 'Memory not found' },
      }
    }

    // Update the real-time stream
    await streams.memory.set('all-memories', memory.id, memory)

    // Emit generic update event
    await emit({
      topic: 'memory-updated',
      data: {
        memoryId: memory.id,
        updates: input,
        timestamp: memory.updatedAt,
      },
    })

    // Track analytics
    await emit({
      topic: 'track-analytics',
      data: {
        event: 'memory_updated',
        memoryId: memory.id,
        previousStatus: existingMemory.status,
        newStatus: memory.status,
        timestamp: memory.updatedAt,
      },
    })

    logger.info('Memory updated successfully', { memoryId: memory.id })

    return {
      status: 200,
      body: memory,
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error('Validation error updating memory', { error: error.message })
      return {
        status: 400,
        body: {
          error: 'Validation failed: ' + error.issues.map((e: any) => e.message).join(', ')
        },
      }
    }

    logger.error('Error updating memory', { error: String(error) })
    return {
      status: 400,
      body: { error: 'Failed to update memory' },
    }
  }
}