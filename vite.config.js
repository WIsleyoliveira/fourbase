import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// WEB_PORT / API_PORT permitem subir uma segunda cópia do projeto em paralelo
// (a porta padrão pode já estar ocupada por outro servidor).
const webPort = Number(process.env.WEB_PORT) || 5173
const apiPort = process.env.API_PORT || 3001

export default defineConfig({
  plugins: [react()],
  server: {
    port: webPort,
    proxy: {
      '/api': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
})
