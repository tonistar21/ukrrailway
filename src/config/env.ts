import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  BOT_TOKEN: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  INTERESTING_EVENTS_URL: z.string().url().default('https://dytiacha.uz.gov.ua/kyiv'),
  INTERESTING_EVENTS_SYNC_MINUTES: z.coerce.number().int().positive().default(30),
  ADMIN_PANEL_LOGIN: z.string().min(1).default('admin'),
  ADMIN_PANEL_PASSWORD: z.string().min(1).default('change-me'),
  ADMIN_PANEL_SESSION_SECRET: z.string().min(1).default('change-me-session-secret')
})

export const env = envSchema.parse(process.env)
