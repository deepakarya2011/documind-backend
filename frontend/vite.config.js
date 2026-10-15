import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Optional: same-origin /api in dev (App.jsx uses VITE_API_URL first).
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
})
