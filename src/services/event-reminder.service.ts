import { Bot } from 'grammy'
import { BotContext } from '../bot/context.js'
import { getEventReminderCandidates, markEventReminderSent } from './event.service.js'
import { buildEventReminderText } from './event-notification.service.js'

const REMINDER_INTERVAL_MS = 60_000

async function processEventReminders(bot: Bot<BotContext>) {
  const now = new Date()
  const candidates = await getEventReminderCandidates(now)

  for (const delivery of candidates) {
    if (!delivery.chat.telegramChatId) {
      continue
    }

    const diffMs = delivery.event.scheduledFor.getTime() - now.getTime()

    if (diffMs <= 0) {
      continue
    }

    if (diffMs <= 60 * 60 * 1000 && !delivery.reminderHourSentAt) {
      try {
        await bot.api.sendMessage(
          Number(delivery.chat.telegramChatId),
          buildEventReminderText({
            title: delivery.event.title,
            text: delivery.event.text,
            scheduledFor: delivery.event.scheduledFor,
            type: 'hour'
          }),
          {
            link_preview_options: {
              is_disabled: true
            }
          }
        )
        await markEventReminderSent({
          deliveryId: delivery.id,
          type: 'hour'
        })
      } catch {
        continue
      }

      continue
    }

    if (diffMs <= 24 * 60 * 60 * 1000 && diffMs > 60 * 60 * 1000 && !delivery.reminderDaySentAt) {
      try {
        await bot.api.sendMessage(
          Number(delivery.chat.telegramChatId),
          buildEventReminderText({
            title: delivery.event.title,
            text: delivery.event.text,
            scheduledFor: delivery.event.scheduledFor,
            type: 'day'
          }),
          {
            link_preview_options: {
              is_disabled: true
            }
          }
        )
        await markEventReminderSent({
          deliveryId: delivery.id,
          type: 'day'
        })
      } catch {
        continue
      }
    }
  }
}

export function startEventReminderScheduler(bot: Bot<BotContext>) {
  const run = () => {
    void processEventReminders(bot).catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`EVENT_REMINDER_SYNC_SKIPPED: ${message}`)
    })
  }

  run()
  const timer = setInterval(run, REMINDER_INTERVAL_MS)

  return () => {
    clearInterval(timer)
  }
}
