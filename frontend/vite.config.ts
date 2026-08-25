import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  const isVerify = mode === 'verify'
  return {
    plugins: [react(), tailwindcss()],
    envDir: rootDir,
    server: {
      port: 5173,
      host: true,
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
      outDir: isVerify ? path.resolve(rootDir, '../deploy/hostinger-static') : 'dist',
      emptyOutDir: true,
      sourcemap: false,
      rollupOptions: isVerify
        ? { input: path.resolve(rootDir, 'verify.html') }
        : undefined,
    },
  }
})
