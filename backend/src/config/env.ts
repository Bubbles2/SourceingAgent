// Reads and validates configuration from environment variables once, at startup.
// Problems are reported by variable name only; values (such as DB_PASSWORD) are never echoed.
import { z } from 'zod'

export type Config = {
  env: 'development' | 'test' | 'production'
  port: number
  /** The website's origin, for links in emails */
  appOrigin: string
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
  /** Contains the signing secret: never log this object. */
  auth: {
    secret: string
    sessionIdleMinutes: number
    sessionMaxAgeHours: number
    cookieSecure: boolean
  }
  /** Proxies in front of the API whose X-Forwarded-For can be trusted (0 = none) */
  trustProxyHops: number
  search: { webhookUrl: string; apiKey: string }
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
  APP_ORIGIN: origin.default('http://localhost:3000'),
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
  AUTH_SECRET: z
    .string()
    .min(32, 'must be at least 32 characters; see .env.example to generate one')
    .refine((value) => !value.startsWith('replace-with'), 'is still the placeholder from .env.example; generate a random one'),
  SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(10_080).default(720),
  SESSION_MAX_AGE_HOURS: z.coerce.number().int().min(1).max(2_160).default(168),
  // Defaults to true in production; browsers only send Secure cookies over HTTPS (and to localhost)
  COOKIE_SECURE: booleanFlag.optional(),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  N8N_SEARCH_WEBHOOK_URL: z.url().default('http://localhost:5678/webhook/auctionmonitor/search'),
  N8N_SEARCH_API_KEY: z.string().default(''),
}).refine((values) => !(values.NODE_ENV === 'production' && values.COOKIE_SECURE === false), {
  // A copied .env.example would otherwise send the session cookie over plain HTTP.
  message: 'must not be false in production; session cookies need HTTPS',
  path: ['COOKIE_SECURE'],
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
    appOrigin: values.APP_ORIGIN,
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
    auth: Object.freeze({
      secret: values.AUTH_SECRET,
      sessionIdleMinutes: values.SESSION_IDLE_MINUTES,
      sessionMaxAgeHours: values.SESSION_MAX_AGE_HOURS,
      cookieSecure: values.COOKIE_SECURE ?? values.NODE_ENV === 'production',
    }),
    trustProxyHops: values.TRUST_PROXY_HOPS,
    search: Object.freeze({ webhookUrl: values.N8N_SEARCH_WEBHOOK_URL, apiKey: values.N8N_SEARCH_API_KEY }),
  })
}

export const config = loadConfig()
