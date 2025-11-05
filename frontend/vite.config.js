import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Bind to all network interfaces for LAN access
    port: 3000,
    // Remove proxy - let frontend connect directly to backend
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
})