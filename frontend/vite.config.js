import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Khi chạy local, mọi request /api được chuyển tới API Gateway (cổng 4000)
export default defineConfig({
  plugins: [react()],
  envDir: '..', // dùng chung file .env ở thư mục gốc
  cacheDir: '../node_modules/.vite', // cache của Vite nằm chung node_modules ở gốc, không tạo frontend/node_modules
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } },
  },
});
