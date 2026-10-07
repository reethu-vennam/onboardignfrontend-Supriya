import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'
export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 8877,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  preview: {
    port: 8877,
    host: '0.0.0.0',
    allowedHosts: ['onboardinguat.sabbpe.com', 'onboardingbckenduat.sabbpe.com', 'sabbpe.com']

  },
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  }
})
