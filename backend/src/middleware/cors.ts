import cors from 'cors'
import { config } from '../config/env.ts'

// Only the listed browser origins get CORS headers; others are refused by the browser.
// Credentials are allowed for the cookie sessions that authentication will add.
export const corsMiddleware = cors({
  origin: [...config.corsOrigins],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
  exposedHeaders: ['X-Request-Id'],
  maxAge: 600,
})
