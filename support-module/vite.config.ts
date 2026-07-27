import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3002
  },
  plugins: [react()],
  preview: {
    host: '0.0.0.0',
    port: 6003,
    allowedHosts: ['suppprod.sabbpe.com', 'supp.sabbpe.com', 'localhost'],
  },
})