import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: 'src/client',
  publicDir: 'public',
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3456',
      '/socket.io': {
        target: 'http://localhost:3456',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
});
