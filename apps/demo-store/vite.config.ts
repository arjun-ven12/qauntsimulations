import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { demoApi } from './src/demo-api.js';

export default defineConfig({
  plugins: [react(), demoApi()],
  server: {
    port: 5174,
    strictPort: true,
  },
});
