

import { EventConfig } from 'motia'
import { z } from 'zod'

const inputSchema = z.object({
  event: z.string(),
  memoryId: z.string().optional(),
  timestamp: z.string(),
  // Additional optional fields
  type: z.string().optional(),
  status: z.string().optional(),
  previousStatus: z.string().optional(),
  newStatus: z.string().optional(),
  priority: z.string().optional(),
  question: z.string().optional(),
  sourcesCount: z.number().optional(),
})

export const config: EventConfig = {
  type: 'event',
  name: 'AnalyticsTracker',
  description: 'Tracks analytics events for memories',
  subscribes: ['track-analytics'],
  flows: ['memory-flow', 'qa-flow'],
  input: inputSchema,
  emits: [],
}

export const handler = async (input: any, { logger, state }: any) => {
  const { event, memoryId, timestamp, ...metadata } = input

  logger.info('Tracking analytics event', { event, memoryId, timestamp })

  // Build analytics payload
  const analyticsPayload = {
    event,
    memoryId,
    timestamp,
    metadata,
    trackedAt: new Date().toISOString(),
    source: 'chronicle-app',
  }

  // Store in state for demo purposes (in production, send to analytics service)
  const analyticsKey = `${memoryId || 'system'}-${event}-${Date.now()}`
  await state.set('analytics-events', analyticsKey, analyticsPayload)

  // Update aggregated metrics
  const metricsKey = 'daily-metrics'
  const todayKey = new Date().toISOString().split('T')[0]

  const existingMetrics = await state.get( //<Record<string, number>>
    'analytics-aggregates',
    `${metricsKey}-${todayKey}`
  ) as Record<string, number> | null

  const metrics = existingMetrics ?? {
    memory_created: 0,
    memory_updated: 0,
    memory_deleted: 0,
    question_answered: 0,
  }

  // Increment the counter for this event type
  if (event in metrics) {
    metrics[event] = (metrics[event] ?? 0) + 1
  } else {
    metrics[event] = 1
  }

  await state.set('analytics-aggregates', `${metricsKey}-${todayKey}`, metrics)

  logger.info('Analytics event tracked', {
    event,
    memoryId,
    dailyMetrics: metrics,
  })
}