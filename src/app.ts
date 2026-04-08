import { bot } from './bot/bot.js'
import { env } from './config/env.js'
import { prisma } from './db/prisma.js'
import { createHttpServer } from './server/http.js'

async function bootstrap() {
  await prisma.$connect()

  const app = createHttpServer()

  app.listen(env.PORT, () => {
    console.log(`HTTP server started on port ${env.PORT}`)
  })

  await bot.start()
  console.log('Telegram bot started')
}

bootstrap().catch(async (error) => {
  console.error('APP_START_ERROR', error)
  await prisma.$disconnect()
  process.exit(1)
})

process.on('SIGINT', async () => {
  await prisma.$disconnect()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await prisma.$disconnect()
  process.exit(0)
})
