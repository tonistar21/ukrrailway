import { bot } from './bot/bot.js'
import { fullGroupAdministratorRights } from './bot/utils/chat-admin-rights.js'
import { env } from './config/env.js'
import { prisma } from './db/prisma.js'
import { createHttpServer } from './server/http.js'
import { startEventReminderScheduler } from './services/event-reminder.service.js'

async function bootstrap() {
  await prisma.$connect()

  await bot.api.setMyDefaultAdministratorRights({
    rights: fullGroupAdministratorRights
  })

  const app = createHttpServer()

  app.listen(env.PORT, () => {
    console.log(`HTTP server started on port ${env.PORT}`)
  })

  const stopEventReminderScheduler = startEventReminderScheduler(bot)

  process.on('SIGINT', async () => {
    stopEventReminderScheduler()
    await prisma.$disconnect()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    stopEventReminderScheduler()
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
