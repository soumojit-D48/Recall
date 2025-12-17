

import { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { memoryService } from '../../services/memory.service'
// import {Memory} from '../../types/memory.types'

export const config: ApiRouteConfig = {
  type: 'api',
  name: 'DeleteMemory',
  description: 'Deletes a memory by ID',
  method: 'DELETE',
  path: '/memories/:id',
  flows: ['memory-flow'],
  responseSchema: {
    200: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    404: z.object({ error: z.string() }),
  },
  emits: [
    { topic: 'memory-deleted', label: 'Memory Deleted' },
    { topic: 'track-analytics', label: 'Track Analytics Event' },
  ],
  // includeFiles: ['../../types/memory.types.ts', '../../services/memory.service.ts'],
  includeFiles: ['../../services/memory.service.ts'],
}

export const handler: Handlers['DeleteMemory'] = async (req:any, { emit, logger, streams, state }:any) => {
  const { id } = req.pathParams

  logger.info('Deleting memory', { memoryId: id })

  const deletedMemory = await memoryService.delete(id, state)

  if (!deletedMemory) {
    logger.warn('Memory not found', { memoryId: id })
    return {
      status: 404,
      body: { error: 'Memory not found' },
    }
  }

  // Remove from real-time stream
  await streams.memory.delete('all-memories', id)

  // Emit deletion event
  await emit({
    topic: 'memory-deleted',
    data: {
      memoryId: id,
      title: deletedMemory.title,
      timestamp: new Date().toISOString(),
    },
  })

  // Track analytics
  await emit({
    topic: 'track-analytics',
    data: {
      event: 'memory_deleted',
      memoryId: id,
      type: deletedMemory.type,
      status: deletedMemory.status,
      timestamp: new Date().toISOString(),
    },
  })

  logger.info('Memory deleted successfully', { memoryId: id })

  return {
    status: 200,
    body: {
      success: true,
      message: `Memory "${deletedMemory.title}" deleted successfully`,
    },
  }
}



