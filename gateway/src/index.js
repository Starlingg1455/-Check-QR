// API Gateway (cổng 4000): cửa ngõ duy nhất cho frontend, chuyển tiếp request tới từng service.
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { createProxyMiddleware } from 'http-proxy-middleware';

const PORT = process.env.PORT || process.env.GATEWAY_PORT || 4000;

// Tiền tố đường dẫn -> địa chỉ service
const routes = [
  { prefix: '/api/account', target: process.env.ACCOUNT_URL || 'http://localhost:4001', name: '1. Tài khoản & Lớp học' },
  { prefix: '/api/sessions', target: process.env.SESSION_URL || 'http://localhost:4002', name: '2. Buổi học & Mã QR' },
  { prefix: '/api/attendance', target: process.env.ATTENDANCE_URL || 'http://localhost:4003', name: '3. Điểm danh & Thông báo' },
  { prefix: '/api/statistics', target: process.env.STATISTICS_URL || 'http://localhost:4004', name: '4. Thống kê' },
];

const app = express();
const corsOrigin = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()) : true;
app.use(cors({ origin: corsOrigin }));

// Không dùng express.json() ở đây để proxy chuyển nguyên body (kể cả upload file)
for (const { prefix, target } of routes) {
  app.use(
    createProxyMiddleware({
      target,
      changeOrigin: true,
      pathFilter: prefix,
      pathRewrite: { [`^${prefix}`]: '' },
      on: {
        error: (_err, _req, res) => {
          res.writeHead?.(502, { 'Content-Type': 'application/json' });
          res.end?.(JSON.stringify({ error: `Service ${prefix} hiện không phản hồi` }));
        },
      },
    }),
  );
}

// Swagger tổng hợp của cả 4 service, chọn service ở ô dropdown phía trên
app.use(
  '/docs',
  swaggerUi.serve,
  swaggerUi.setup(null, {
    explorer: true,
    customSiteTitle: 'API - Hệ thống điểm danh QR',
    swaggerOptions: { urls: routes.map((r) => ({ url: `${r.prefix}/openapi.json`, name: r.name })) },
  }),
);

// Kiểm tra sức khoẻ cả hệ thống
app.get('/health', async (_req, res) => {
  const services = await Promise.all(
    routes.map(async ({ prefix, target }) => {
      try {
        const r = await fetch(`${target}/health`, { signal: AbortSignal.timeout(3000) });
        return { service: prefix, ok: r.ok };
      } catch {
        return { service: prefix, ok: false };
      }
    }),
  );
  res.json({ gateway: true, services });
});

app.get('/', (_req, res) => res.json({ name: 'API Gateway - Hệ thống điểm danh QR', docs: '/docs', health: '/health' }));

app.listen(PORT, (err) => {
  if (err) { console.error(`Không mở được cổng ${PORT}:`, err.message); process.exit(1); }
  console.log(`[gateway] chạy tại http://localhost:${PORT}  (Swagger tổng hợp: /docs)`);
});
