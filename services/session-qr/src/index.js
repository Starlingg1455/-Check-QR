// Service 2: Buổi học & Mã QR (cổng 4002)
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { createDb } from './db.js';
import { errorHandler } from './http.js';
import { createRoutes } from './routes.js';
import { openapi } from './openapi.js';

const PORT = process.env.PORT || process.env.SESSION_PORT || 4002;

const db = await createDb('session_qr');
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
app.get('/openapi.json', (_req, res) => res.json(openapi));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));
app.use(createRoutes(db));
app.use(errorHandler);

app.listen(PORT, (err) => {
  if (err) { console.error(`Không mở được cổng ${PORT}:`, err.message); process.exit(1); }
  console.log(`[session-qr] chạy tại http://localhost:${PORT}  (Swagger: /docs)`);
});
