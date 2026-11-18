import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Loaded lazily, so without this Vite finds it mid-session and the open page 504s until a restart.
  optimizeDeps: { include: ['maplibre-gl'] },
  server: {
    host: true,
  },
})
