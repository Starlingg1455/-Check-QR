import cors from 'cors';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { xuLyLoi } from './tienIch.js';
import { taoApi } from './api.js';
import { taiLieuApi } from './taiLieuApi.js';

// Service 4: Thống kê (cổng 4004)
// Service này không lưu dữ liệu riêng: nó gọi API của 3 service kia rồi tính toán.

const CONG_MAY_CHU = process.env.PORT || process.env.STATISTICS_PORT || 4004;

const app = express();
app.use(cors());
app.use(express.json());
app.get('/health', (_req, res) => res.json({ service: 'statistics', ok: true }));
app.get('/openapi.json', (_req, res) => res.json(taiLieuApi));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(taiLieuApi));
app.use(taoApi());
app.use(xuLyLoi);

app.listen(CONG_MAY_CHU, (loi) => {
  if (loi) {
    console.error(`Không mở được cổng ${CONG_MAY_CHU}:`, loi.message);
    process.exit(1);
  }
  console.log(`[statistics] chạy tại http://localhost:${CONG_MAY_CHU}  (Swagger: /docs)`);
});
