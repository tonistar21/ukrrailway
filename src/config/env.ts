import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  BOT_TOKEN: z.string().min(1),
  DATABASE_URL: z.string().min(1)
})

export const env = envSchema.parse(process.env)
