
import { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { generateEmbedding, generateAnswer } from '../../utils/openAI'
import { searchMemories } from '../../utils/weaviate'
import { askQuestionSchema } from '../../types/memory.types'



const responseSchema = z.object({
  answer: z.string(),
  sources: z.array(
    z.object({
      memoryId: z.string(),
      title: z.string(),
      relevance: z.number(),
    })
  ),
})

export const config: ApiRouteConfig = {
  type: 'api',
  name: 'AnswerQuestion',
  description: 'Answer questions using RAG over stored memories',
  method: 'POST',
  path: '/ask',
  flows: ['qa-flow'],
  bodySchema: askQuestionSchema,
  responseSchema: {
    200: responseSchema,
    400: z.object({ error: z.string() }),
  },
  emits: [{ topic: 'track-analytics', label: 'Track Analytics Event' }],
  includeFiles: ['../../types/memory.types.ts', '../../utils/openAI.ts', '../../utils/weaviate.ts'],
}

export const handler: Handlers['AnswerQuestion'] = async (req: any, { logger, emit }: any) => {
  try {
    const input = askQuestionSchema.parse(req.body)
    
    logger.info('❓ Processing question', { 
      question: input.question.substring(0, 50) + '...', 
      teamId: input.teamId 
    })

    // Generate embedding for question
    const queryEmbedding = await generateEmbedding(input.question)

    // Search similar memories
    const relevantMemories = await searchMemories(
      queryEmbedding,
      input.teamId,
      input.limit
    )

    if (relevantMemories.length === 0) {
      logger.info('No relevant memories found')
      
      return {
        status: 200,
        body: {
          answer: "I couldn't find any relevant memories for that question. Try asking about past decisions, failures, or documented context.",
          sources: [],
        },
      }
    }

    // Prepare context for AI
    const context = relevantMemories.map((mem: any) => 
      `[${mem.type}] ${mem.title}\n${mem.description}\nCreated: ${mem.createdAt}`
    )

    // Generate answer using GPT
    const answer = await generateAnswer(input.question, context)

    // Format sources
    const sources = relevantMemories.map((mem: any) => ({
      memoryId: mem.memoryId,
      title: mem.title,
      relevance: 0.85, // Could use actual certainty from Weaviate
    }))

    // Track analytics
    await emit({
      topic: 'track-analytics',
      data: {
        event: 'question_answered',
        question: input.question,
        sourcesCount: sources.length,
        timestamp: new Date().toISOString(),
      },
    })

    logger.info('✅ Answer generated', { 
      sourcesUsed: sources.length,
      answerLength: answer.length 
    })

    return {
      status: 200,
      body: {
        answer,
        sources,
      },
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error('Validation error', { error: error.message })
      return {
        status: 400,
        body: { 
          error: 'Validation failed: ' + error.issues.map((e: any) => e.message).join(', ') 
        },
      }
    }

    logger.error('Error answering question', { error: String(error) })
    return {
      status: 400,
      body: { error: 'Failed to answer question' },
    }
  }
}