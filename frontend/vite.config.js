import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001', // Local backend for development
        changeOrigin: true,
        secure: false, // Allow self-signed certificates if needed
        configure: (proxy, _options) => {
          proxy.on('proxyRes', (proxyRes, req, res) => {
            // Handle binary responses (audio files)
            if (req.url.includes('/text-to-speech')) {
              proxyRes.headers['access-control-allow-origin'] = '*';
            }
          });
        }
      }
    }
  }
});

