import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // 127.0.0.1 rather than localhost: Node may resolve localhost to ::1 first on Windows.
      // Keys are anchored regexes (leading ^): a plain '/api' or '/realtime' prefix would
      // also proxy the frontend modules /api.ts and /realtime.ts to the server.
      '^/api/': 'http://127.0.0.1:3000',
      '^/realtime(\\?|$)': { target: 'ws://127.0.0.1:3000', ws: true },
    },
  },
});
