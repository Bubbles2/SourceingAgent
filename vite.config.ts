import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The API (backend/) runs on port 4000. Proxying /api keeps the site and API on one origin, so the
// session cookie stays first-party and SameSite=Strict.
const apiProxy = {
  '/api': { target: 'http://localhost:4000' },
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
    proxy: apiProxy,
  },
  preview: {
    proxy: apiProxy,
  },
})
