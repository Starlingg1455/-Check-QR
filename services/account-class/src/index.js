// Service 1: Tài khoản & Lớp học (cổng 4001)
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { createDb } from './db.js';
import { errorHandler } from './http.js';
import { createRoutes } from './routes.js';
import { openapi } from './openapi.js';

const PORT = process.env.PORT || process.env.ACCOUNT_PORT || 4001;

const db = await createDb('account');
await db.exec(`
  CREATE TABLE IF NOT EXISTS account.users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    picture TEXT,
    role TEXT NOT NULL DEFAULT 'student',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS account.classes (
    id SERIAL PRIMARY KEY,
    teacher_id INT NOT NULL REFERENCES account.users(id),
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    room TEXT,
    semester TEXT,
    total_sessions INT NOT NULL DEFAULT 15,
    max_absent_percent INT NOT NULL DEFAULT 20,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS account.class_students (
    id SERIAL PRIMARY KEY,
    class_id INT NOT NULL REFERENCES account.classes(id) ON DELETE CASCADE,
    student_code TEXT NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    UNIQUE (class_id, student_code)
  );
  CREATE INDEX IF NOT EXISTS idx_class_students_email ON account.class_students (lower(email));
`);

const app = express();
app.use(cors());
app.use(express.json());
app.get('/health', (_req, res) => res.json({ service: 'account-class', ok: true }));
app.get('/openapi.json', (_req, res) => res.json(openapi));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));
app.use(createRoutes(db));
app.use(errorHandler);

app.listen(PORT, (err) => {
  if (err) { console.error(`Không mở được cổng ${PORT}:`, err.message); process.exit(1); }
  console.log(`[account-class] chạy tại http://localhost:${PORT}  (Swagger: /docs)`);
});
