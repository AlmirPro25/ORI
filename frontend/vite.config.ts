import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // Whether to polyfill `node:` protocol imports.
      protocolImports: true,
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    'process.env': {},
    'global': 'window',
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          if (id.includes('react') || id.includes('scheduler')) {
            return 'react-vendor';
          }

          if (id.includes('react-router')) {
            return 'router-vendor';
          }

          if (id.includes('framer-motion')) {
            return 'motion-vendor';
          }

          if (id.includes('react-hook-form') || id.includes('@hookform') || id.includes('zod')) {
            return 'forms-vendor';
          }

          if (
            id.includes('axios') ||
            id.includes('socket.io-client') ||
            id.includes('jwt-decode') ||
            id.includes('zustand') ||
            id.includes('date-fns')
          ) {
            return 'data-vendor';
          }

          if (id.includes('hls.js')) {
            return 'hls-vendor';
          }

          if (id.includes('webtorrent') || id.includes('node_modules/buffer') || id.includes('node_modules/events')) {
            return 'torrent-vendor';
          }

          if (
            id.includes('@radix-ui') ||
            id.includes('class-variance-authority') ||
            id.includes('clsx') ||
            id.includes('tailwind-merge') ||
            id.includes('tailwindcss-animate') ||
            id.includes('lucide-react')
          ) {
            return 'ui-vendor';
          }

          if (id.includes('vite-plugin-node-polyfills')) {
            return 'polyfills-vendor';
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      }
    }
  }
})
