import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Bind to all network interfaces for LAN access
    port: 3000,


    // !!!!SECURITY: Replace 'all' with specific hostnames/IPs for production
    // Examples: ['localhost', '192.168.1.100', 'jetson.local', 'your-domain.com']
    // true allows any host - I use it for development/testing
    allowedHosts: true
    // Remove proxy - let frontend connect directly to backend
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/components': path.resolve(__dirname, './src/components'),
      '@/hooks': path.resolve(__dirname, './src/hooks'),
      '@/services': path.resolve(__dirname, './src/services'),
      '@/styles': path.resolve(__dirname, './src/styles'),
      '@/utils': path.resolve(__dirname, './src/utils')
    }
  }
})
