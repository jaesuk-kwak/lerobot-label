import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/dataset': 'http://localhost:8000',
      '/episodes': 'http://localhost:8000',
      '/episode': 'http://localhost:8000',
    },
  },
})
