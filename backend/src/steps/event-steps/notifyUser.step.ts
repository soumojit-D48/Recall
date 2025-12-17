
// src/steps/notifyUser.step.ts
import { EventConfig, Handlers } from 'motia'
import { z } from 'zod'

/**
 * Notify User Event Step
 *
 * Sends notification about reactivated memory.
 * In production, this would integrate with:
 * - Email services (SendGrid, AWS SES)
 * - Push notifications (FCM, APNs)
 * - Webhooks
 * - Slack/Discord
 */

const inputSchema = z.object({
  memoryId: z.string(),
  title: z.string(),
  reanalysis: z.string(),
  reactivatedAt: z.string(),
})

export const config: EventConfig = {
  type: 'event',
  name: 'NotifyUser',
  description: 'Send notification about reactivated memory',
  subscribes: ['memory-reactivated'],
  flows: ['memory-flow'],
  input: inputSchema,
  emits: [{ topic: 'notification-sent', label: 'Notification Sent' }],
  // have to handle success and fail sent with another event
}

export const handler: Handlers['NotifyUser'] = async (input:any, { logger, state, emit }:any) => {
  const { memoryId, title, reanalysis, reactivatedAt } = input

  logger.info('📧 Preparing notification', { memoryId, title })

  try {
    // Build notification payload
    const notification = {
      type: 'memory_reactivated',
      memoryId,
      title,
      reanalysis,
      reactivatedAt,
      channels: ['in-app', 'email'], // Could be dynamic based on user preferences
      message: `Memory "${title}" has been reactivated. ${reanalysis}`,
    }

    // Store notification history
    const notificationKey = `notification-${memoryId}-${Date.now()}`
    await state.set('notification-history', notificationKey, {
      ...notification,
      sentAt: new Date().toISOString(),
    })

    // Simulate notification sending (in production, call external services)
    logger.info('Sending notifications', {
      memoryId,
      channels: notification.channels,
    })

    
    // In production: await emailService.send(), await pushService.send(), etc.
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Update notification metrics
    const metricsKey = 'notification-metrics'
    const todayKey = new Date().toISOString().split('T')[0] 

    const existingMetrics = await (state.get( // <Record<string, number>>
      'notification-aggregates',
      `${metricsKey}-${todayKey}`
    )) as Record<string, number> | null

    const metrics = existingMetrics ?? {
      total: 0,
      'in-app': 0,
      email: 0,
      push: 0,
    }

    metrics.total++
    for (const channel of notification.channels) {
      if (channel in metrics) {
        metrics[channel]++
      }
    }

    await state.set('notification-aggregates', `${metricsKey}-${todayKey}`, metrics)

    // Emit notification sent event
    await emit({
      topic: 'notification-sent',
      data: {
        memoryId,
        channels: notification.channels,
        sentAt: new Date().toISOString(),
      },
    })

    logger.info('✅ Notification sent successfully', {
      memoryId,
      channels: notification.channels,
      dailyTotal: metrics.total,
    })
  } catch (error) {
    logger.error('Failed to send notification', {
      memoryId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    throw error
  }
}