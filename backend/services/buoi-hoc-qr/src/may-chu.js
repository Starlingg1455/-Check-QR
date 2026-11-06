import cors from 'cors';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { taoCoSoDuLieu, xuLyLoi } from './tien-ich.js';
import { taoApi } from './api.js';
import { taiLieuApi } from './tai-lieu-api.js';

// Service 2: Buổi học & Mã QR (cổng 4002)

const CONG_MAY_CHU = process.env.PORT || process.env.SESSION_PORT || 4002;

const db = await taoCoSoDuLieu('session_qr');
await db.exec(`
  CREATE TABLE IF NOT EXISTS session_qr.sessions (
    id SERIAL PRIMARY KEY,
    class_id INT NOT NULL,
    session_no INT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    qr_secret TEXT NOT NULL,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at TIMESTAMPTZ,
    created_by INT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_class ON session_qr.sessions (class_id);
`);

const app = express();
app.use(cors());
app.use(express.json());
app.get('/health', (_req, res) => res.json({ service: 'session-qr', ok: true }));
app.get('/openapi.json', (_req, res) => res.json(taiLieuApi));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(taiLieuApi));
app.use(taoApi(db));
app.use(xuLyLoi);

app.listen(CONG_MAY_CHU, (err) => {
  if (err) { console.error(`Không mở được cổng ${CONG_MAY_CHU}:`, err.message); process.exit(1); }
  console.log(`[session-qr] chạy tại http://localhost:${CONG_MAY_CHU}  (Swagger: /docs)`);
});
