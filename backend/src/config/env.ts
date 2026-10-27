// Reads and validates configuration from environment variables once, at startup.
// Problems are reported by variable name only; values (such as DB_PASSWORD) are never echoed.
import { z } from 'zod'

export type Config = {
  env: 'development' | 'test' | 'production'
  port: number
  /** Contains the database password: never log this object. */
  database: {
    host: string
    port: number
    name: string
    user: string
    password: string
    ssl: boolean
    poolMax: number
  }
  corsOrigins: readonly string[]
}

function isOrigin(value: string): boolean {
  try {
    return new URL(value).origin === value
  } catch {
    return false
  }
}

const booleanFlag = z.enum(['true', 'false']).transform((value) => value === 'true')
const portNumber = z.coerce.number().int().min(1).max(65535)
const origin = z.string().refine(isOrigin, 'must be an origin such as http://localhost:3000, without a path or *')

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: portNumber.default(4000),
  DB_HOST: z.string().min(1),
  DB_PORT: portNumber.default(5432),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  // May be empty when the local server trusts the connection
  DB_PASSWORD: z.string(),
  DB_SSL: booleanFlag.default(false),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((value) => value.split(',').map((item) => item.trim()).filter(Boolean))
    .pipe(z.array(origin).min(1)),
})

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env)
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`).join('\n')
    throw new Error(`Invalid environment configuration. Check backend/.env against .env.example:\n${problems}`)
  }

  const values = result.data
  return Object.freeze({
    env: values.NODE_ENV,
    port: values.PORT,
    database: Object.freeze({
      host: values.DB_HOST,
      port: values.DB_PORT,
      name: values.DB_NAME,
      user: values.DB_USER,
      password: values.DB_PASSWORD,
      ssl: values.DB_SSL,
      poolMax: values.DB_POOL_MAX,
    }),
    corsOrigins: Object.freeze(values.CORS_ORIGINS),
  })
}

export const config = loadConfig()
