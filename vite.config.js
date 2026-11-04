import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Sorgenti in web/, build in public/ (servita da server/index.js).
export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: '../public', emptyOutDir: true },
  server: { proxy: { '/ws': { target: 'ws://localhost:3000', ws: true, changeOrigin: true, headers: { origin: 'http://localhost:3000' } } } },
});
