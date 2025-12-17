

// src/steps/analyzeAI.step.ts
import { EventConfig, Handlers } from 'motia'
import { z } from 'zod'
import { classifyMemory } from '../../utils/openAI'
// import { Memory } from '../../types/memory.types'
import { Memory } from 'src/types/memory.types'


/**
 * AI Analysis Event Step
 *
 * Background job that analyzes memory content using OpenAI to extract:
 * - Concise summary
 * - Category classification
 * - Root cause (for failures)
 * - Key lessons learned
 */

const inputSchema = z.object({
  memoryId: z.string(),
  title: z.string(),
  type: z.string(),
})

export const config: EventConfig = {
  type: 'event',
  name: 'AnalyzeAI',
  description: 'Analyze memory with AI to extract insights and lessons',
  subscribes: ['memory-created'],
  flows: ['memory-flow'],
  input: inputSchema,
  emits: [{ topic: 'memory-analyzed', label: 'Memory Analyzed' }],
}

export const handler: Handlers['AnalyzeAI'] = async (input: any, { logger, state, emit }: any) => {
  const { memoryId, title, type } = input

  logger.info('🤖 Analyzing memory', { memoryId, title })

  try {
    // Retrieve full memory from state
    // const memory = await state.get<Memory>('memories', memoryId)
    const memory = (await state.get('memories', memoryId)) as Memory | null

    if (!memory) {
      logger.error('Memory not found', { memoryId })
      throw new Error(`Memory ${memoryId} not found`)
    }

    // Call OpenAI for classification and analysis
    const analysis = await classifyMemory(
      memory.title,
      memory.description,
      memory.type
    )

    // Update memory with AI insights
    const updatedMemory: Memory = {
      ...memory,
      aiSummary: analysis.summary,
      aiCategory: analysis.category,
      rootCause: analysis.rootCause,
      keyLessons: analysis.lessons,
      updatedAt: new Date().toISOString(),
    }

    // Store updated memory back to state
    await state.set('memories', memoryId, updatedMemory)
    await state.set('workflow', 'currentMemory', updatedMemory)

    // Store in analysis history for audit trail
    const historyKey = `${memoryId}-${Date.now()}`
    await state.set('memory-analysis-history', historyKey, {
      memoryId,
      analysis,
      analyzedAt: new Date().toISOString(),
    })

    // Emit analyzed event for next steps (embedding)
    await emit({
      topic: 'memory-analyzed',
      data: {
        memoryId,
        analysis,
        timestamp: new Date().toISOString(),
      },
    })

    logger.info('✅ AI analysis complete', {
      memoryId,
      category: analysis.category,
      lessonsCount: analysis.lessons?.length || 0,
    })
  } catch (error) {
    logger.error('Failed to analyze memory', {
      memoryId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    throw error
  }
}