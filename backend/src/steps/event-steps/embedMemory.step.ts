// src/steps/embedMemory.step.ts
import { EventConfig, Handlers } from 'motia'
import { z } from 'zod'
import { generateEmbedding } from '../../utils/openAI'
import { storeMemoryEmbedding, createSchema } from '../../utils/weaviate'
import { Memory } from 'src/types/memory.types'

/**
 * Embed Memory Event Step
 *
 * Background job that creates vector embedding and stores in Weaviate
 * for semantic search capabilities.
 */

const inputSchema = z.object({
  memoryId: z.string(),
  analysis: z.object({
    summary: z.string(),
    category: z.string(),
    rootCause: z.string().optional(),
    lessons: z.array(z.string()),
  }),
  timestamp: z.string(),
})

export const config: EventConfig = {
  type: 'event',
  name: 'EmbedMemory',
  description: 'Generate vector embedding and store in Weaviate',
  subscribes: ['memory-analyzed'],
  flows: ['memory-flow'],
  input: inputSchema,
  emits: [{ topic: 'memory-embedded', label: 'Memory Embedded' }],
}

export const handler: Handlers['EmbedMemory'] = async (input:any, { logger, state, emit }:any) => {
  const { memoryId } = input

  logger.info('🔢 Generating embedding', { memoryId })

  try {
    // Retrieve memory from state
    const memory = await (state.get('memories', memoryId)) as Memory | null

    if (!memory) {
      logger.error('Memory not found', { memoryId })
      throw new Error(`Memory ${memoryId} not found`)
    }

    // Ensure Weaviate schema exists
    await createSchema()

    // Create text for embedding (title + description + summary + lessons)
    const textToEmbed = [
      memory.title,
      memory.description,
      memory.aiSummary || '',
      ...(memory.keyLessons || []),
    ].join(' ')

    // Generate embedding
    const embedding = await generateEmbedding(textToEmbed)

    // Store in Weaviate
    const embeddingId = await storeMemoryEmbedding(memoryId, memory, embedding)

    // Update memory state with embedding ID
    const updatedMemory: Memory = {
      ...memory,
      embeddingId,
      updatedAt: new Date().toISOString(),
    }

    await state.set('memories', memoryId, updatedMemory)
    await state.set('workflow', 'currentMemory', updatedMemory)

    // Emit embedded event
    await emit({
      topic: 'memory-embedded',
      data: {
        memoryId,
        embeddingId,
        timestamp: new Date().toISOString(),
      },
    })

    logger.info('✅ Embedding stored', { memoryId, embeddingId })
  } catch (error) {
    logger.error('Failed to embed memory', {
      memoryId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    throw error
  }
}