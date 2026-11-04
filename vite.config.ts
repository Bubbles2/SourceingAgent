import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The collector uses port 3000. This site runs on 3001, with its API on 4000.
// Proxying /api keeps the site and API on one origin for cookie sessions.
const apiProxy = {
  '/api': { target: 'http://localhost:4000' },
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    strictPort: true,
    proxy: apiProxy,
  },
  preview: {
    proxy: apiProxy,
  },
})
