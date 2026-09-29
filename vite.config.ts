import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // 127.0.0.1 rather than localhost: Node may resolve localhost to ::1 first on Windows
      // Regex (leading ^) so the frontend module /api.ts isn't proxied too
      '^/api/': 'http://127.0.0.1:3000',
      '/realtime': { target: 'ws://127.0.0.1:3000', ws: true },
    },
  },
});
