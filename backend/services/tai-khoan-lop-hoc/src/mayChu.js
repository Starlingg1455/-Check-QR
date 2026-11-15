import cors from 'cors';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { taoCoSoDuLieu, xuLyLoi, maHoaMatKhau } from './tienIch.js';
import { taoApi } from './api.js';
import { taiLieuApi } from './taiLieuApi.js';

// Service 1: Tài khoản & Lớp học (cổng 4001)

const CONG_MAY_CHU = process.env.PORT || process.env.ACCOUNT_PORT || 4001;

const db = await taoCoSoDuLieu('account');
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
  ALTER TABLE account.users ADD COLUMN IF NOT EXISTS password_hash TEXT;
`);

// Mỗi email chỉ được dùng cho một MSSV trong một lớp, để hai tài khoản không ghi đè điểm danh của nhau.
// Bọc try/catch: nếu dữ liệu cũ đã có trùng lặp thì bỏ qua, không làm service chết khi khởi động.
try {
  await db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_class_students_email ON account.class_students (class_id, lower(email))',
  );
} catch (loi) {
  console.warn('Không tạo được ràng buộc email duy nhất (dữ liệu cũ có trùng?):', loi.message);
}

// Tài khoản giảng viên đăng nhập bằng mật khẩu: gv@demo.vn / admin.
// Chỉ gieo khi đang ở chế độ thử nghiệm (ALLOW_DEV_LOGIN khác 'false') — khi chạy thật
// (đặt 'false') tài khoản này sẽ không có mật khẩu, giảng viên đăng nhập bằng Google.
if (process.env.ALLOW_DEV_LOGIN !== 'false') {
  const passwordHash = await maHoaMatKhau('admin');
  await db.query(
    `INSERT INTO account.users (email, name, role, password_hash) VALUES ('gv@demo.vn','Giảng viên Demo','teacher',$1)
     ON CONFLICT (email) DO UPDATE SET role = 'teacher', password_hash = EXCLUDED.password_hash`,
    [passwordHash],
  );
}

const app = express();
app.use(cors());
app.use(express.json());
app.get('/health', (_req, res) => res.json({ service: 'account-class', ok: true }));
app.get('/openapi.json', (_req, res) => res.json(taiLieuApi));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(taiLieuApi));
app.use(taoApi(db));
app.use(xuLyLoi);

app.listen(CONG_MAY_CHU, (loi) => {
  if (loi) {
    console.error(`Không mở được cổng ${CONG_MAY_CHU}:`, loi.message);
    process.exit(1);
  }
  console.log(
    `[account-class] chạy tại http://localhost:${CONG_MAY_CHU}  (Swagger: /docs)`,
  );
});
