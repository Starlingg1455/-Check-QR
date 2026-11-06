// Service 3: Điểm danh & Thông báo (cổng 4003)
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { createDb } from './db.js';
import { errorHandler } from './http.js';
import { createRoutes } from './routes.js';
import { openapi } from './openapi.js';

const PORT = process.env.PORT || process.env.ATTENDANCE_PORT || 4003;

const db = await createDb('attendance');
await db.exec(`
  CREATE TABLE IF NOT EXISTS attendance.records (
    id SERIAL PRIMARY KEY,
    session_id INT NOT NULL,
    class_id INT NOT NULL,
    student_email TEXT NOT NULL,
    student_code TEXT NOT NULL,
    student_name TEXT NOT NULL,
    status TEXT NOT NULL,            -- present | late | excused | absent
    source TEXT NOT NULL,            -- qr | manual | request
    note TEXT,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (session_id, student_email)
  );
  CREATE INDEX IF NOT EXISTS idx_records_class ON attendance.records (class_id);

  CREATE TABLE IF NOT EXISTS attendance.absence_requests (
    id SERIAL PRIMARY KEY,
    class_id INT NOT NULL,
    session_id INT NOT NULL,
    session_no INT NOT NULL,
    student_email TEXT NOT NULL,
    student_code TEXT NOT NULL,
    student_name TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
    teacher_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at TIMESTAMPTZ
  );

  -- Ảnh minh chứng đính kèm đơn xin vắng (ảnh đã được nén ở trình duyệt nên nhỏ)
  CREATE TABLE IF NOT EXISTS attendance.request_files (
    id SERIAL PRIMARY KEY,
    request_id INT NOT NULL,
    filename TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INT NOT NULL,
    data BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_request_files_req ON attendance.request_files (request_id);

  CREATE TABLE IF NOT EXISTS attendance.notifications (
    id SERIAL PRIMARY KEY,
    class_id INT NOT NULL,
    student_email TEXT NOT NULL,
    student_name TEXT NOT NULL,
    subject TEXT NOT NULL,
    status TEXT NOT NULL,            -- sent | logged | failed
    detail TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`);

const app = express();
app.use(cors());
app.use(express.json());
app.get('/health', (_req, res) => res.json({ service: 'attendance', ok: true }));
app.get('/openapi.json', (_req, res) => res.json(openapi));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));
app.use(createRoutes(db));
app.use(errorHandler);

app.listen(PORT, (err) => {
  if (err) { console.error(`Không mở được cổng ${PORT}:`, err.message); process.exit(1); }
  console.log(`[attendance] chạy tại http://localhost:${PORT}  (Swagger: /docs)`);
});
