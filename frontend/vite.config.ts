import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true, // allow phone access on same Wi‑Fi (Android + iPhone)
    proxy: {
      '/api': 'http://127.0.0.1:5001',
      '/static': 'http://127.0.0.1:5001',
      '/generated': 'http://127.0.0.1:5001',
      '/qr': 'http://127.0.0.1:5001',
      '/verify': 'http://127.0.0.1:5001',
      '/manifest.json': 'http://127.0.0.1:5001',
      '/sw.js': 'http://127.0.0.1:5001',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
