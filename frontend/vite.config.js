import { defineConfig } from 'vite';

// Khi chạy local, mọi request /api được chuyển tới API Gateway (cổng 4000)
export default defineConfig({
  // Vite tự biên dịch JSX bằng esbuild nên không cần plugin React (plugin đó kéo theo cả bộ công cụ Babel, hàng chục gói)
  esbuild: { jsx: 'automatic' },
  envDir: '..', // dùng chung file .env ở thư mục gốc
  cacheDir: '../node_modules/.vite', // cache của Vite nằm chung node_modules ở gốc, không tạo frontend/node_modules
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } },
  },
});
