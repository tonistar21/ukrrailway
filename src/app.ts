import { bot } from './bot/bot.js'
import { fullGroupAdministratorRights } from './bot/utils/chat-admin-rights.js'
import { env } from './config/env.js'
import { prisma } from './db/prisma.js'
import { createHttpServer } from './server/http.js'
import { startEventReminderScheduler } from './services/event-reminder.service.js'
import { startInterestingEventsScheduler } from './services/interesting-events-scheduler.service.js'

async function bootstrap() {
  await prisma.$connect()

  await bot.api.setMyDefaultAdministratorRights({
    rights: fullGroupAdministratorRights
  })

  await Promise.all([
    bot.api.setMyCommands(
      [
        {
          command: 'start',
          description: 'Відкрити бота в особистих повідомленнях'
        }
      ],
      {
        scope: {
          type: 'all_private_chats'
        }
      }
    ),
    bot.api.setMyCommands(
      [
        {
          command: 'chat_tools',
          description: 'Відкрити функції цього групового чату'
        },
        {
          command: 'city_top',
          description: 'Показати топ учнів міста за оцінками'
        },
        {
          command: 'interesting_events',
          description: 'Показати цікаві події в цьому чаті'
        }
      ],
      {
        scope: {
          type: 'all_group_chats'
        }
      }
    )
  ])

  const app = createHttpServer()

  app.listen(env.PORT, () => {
    console.log(`HTTP server started on port ${env.PORT}`)
  })

  const stopEventReminderScheduler = startEventReminderScheduler(bot)
  const stopInterestingEventsScheduler = startInterestingEventsScheduler()

  process.on('SIGINT', async () => {
    stopEventReminderScheduler()
    stopInterestingEventsScheduler()
    await prisma.$disconnect()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    stopEventReminderScheduler()
    stopInterestingEventsScheduler()
    await prisma.$disconnect()
    process.exit(0)
  })

  await bot.start()
  console.log('Telegram bot started')
}

bootstrap().catch(async (error) => {
  console.error('APP_START_ERROR', error)
  await prisma.$disconnect()
  process.exit(1)
})
