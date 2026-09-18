import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  const port = Number(env.PORT_FE || 4007)
  return {
    plugins: [react(), tailwindcss()],
    server: { port, strictPort: true, host: true },
    preview: { port, strictPort: true, host: true },
  }
})
