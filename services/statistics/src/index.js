// Service 4: Thống kê (cổng 4004)
// Service này không lưu dữ liệu riêng: nó gọi API của 3 service kia rồi tính toán.
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { errorHandler } from './http.js';
import { createRoutes } from './routes.js';
import { openapi } from './openapi.js';

const PORT = process.env.PORT || process.env.STATISTICS_PORT || 4004;

const app = express();
app.use(cors());
app.use(express.json());
app.get('/health', (_req, res) => res.json({ service: 'statistics', ok: true }));
app.get('/openapi.json', (_req, res) => res.json(openapi));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));
app.use(createRoutes());
app.use(errorHandler);

app.listen(PORT, (err) => {
  if (err) { console.error(`Không mở được cổng ${PORT}:`, err.message); process.exit(1); }
  console.log(`[statistics] chạy tại http://localhost:${PORT}  (Swagger: /docs)`);
});
