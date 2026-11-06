// API REST của dịch vụ "Tài khoản & Lớp học": các đường dẫn (GET/POST/PUT/DELETE) và xử lý nghiệp vụ.
// Tài liệu Swagger của các đường dẫn này nằm ở taiLieuApi.js.

import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { LoiHttp, batBuocDangNhap, batBuocVaiTro, kyToken } from './tienIch.js';

const teacherEmails = (process.env.TEACHER_EMAILS || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export function taoApi(db) {
  const dinhTuyen = Router();
  const googleClient = process.env.GOOGLE_CLIENT_ID
    ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
    : null;
  const devLoginEnabled = process.env.ALLOW_DEV_LOGIN !== 'false';

  // ---------- Hàm dùng chung ----------
  async function luuNguoiDung({ email, name, picture, role }) {
    const rows = await db.query(
      `INSERT INTO account.users (email, name, picture, role) VALUES ($1, COALESCE($2, split_part($1, '@', 1)),$3,$4)
       ON CONFLICT (email) DO UPDATE SET name = COALESCE($2, account.users.name), role = EXCLUDED.role,
         picture = COALESCE(EXCLUDED.picture, account.users.picture)
       RETURNING *`,
      [email.toLowerCase(), name || null, picture || null, role],
    );
    return rows[0];
  }

  // Lấy lớp mà người dùng được phép xem. Trả về lớp + isOwner + myStudent (nếu là sinh viên)
  async function layLopDuocXem(user, classId) {
    const id = Number(classId);
    if (!Number.isInteger(id)) throw new LoiHttp(400, 'Mã lớp không hợp lệ');
    const rows = await db.query(
      `SELECT c.*, u.name AS teacher_name,
              (SELECT count(*)::int FROM account.class_students s WHERE s.class_id = c.id) AS student_count
       FROM account.classes c JOIN account.users u ON u.id = c.teacher_id WHERE c.id = $1`,
      [id],
    );
    const lop = rows[0];
    if (!lop) throw new LoiHttp(404, 'Không tìm thấy lớp');
    if (lop.teacher_id === user.id) return { ...lop, isOwner: true, myStudent: null };
    const mine = await db.query(
      `SELECT student_code, full_name, email FROM account.class_students WHERE class_id = $1 AND lower(email) = lower($2)`,
      [id, user.email],
    );
    if (!mine[0]) throw new LoiHttp(403, 'Bạn không thuộc lớp này');
    return { ...lop, isOwner: false, myStudent: mine[0] };
  }

  async function layLopCuaGiangVien(user, classId) {
    const lop = await layLopDuocXem(user, classId);
    if (!lop.isOwner) throw new LoiHttp(403, 'Chỉ giảng viên của lớp được thực hiện');
    return lop;
  }

  // ---------- Đăng nhập ----------
  dinhTuyen.get('/auth/config', (_req, res) => {
    res.json({
      googleClientId: process.env.GOOGLE_CLIENT_ID || null,
      devLogin: devLoginEnabled,
    });
  });

  dinhTuyen.post('/auth/google', async (req, res) => {
    if (!googleClient) throw new LoiHttp(501, 'Server chưa cấu hình GOOGLE_CLIENT_ID');
    const { credential } = req.body || {};
    if (!credential) throw new LoiHttp(400, 'Thiếu credential');
    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch {
      throw new LoiHttp(401, 'Token Google không hợp lệ');
    }
    // Vai trò quyết định theo danh sách TEACHER_EMAILS, email khác là sinh viên
    const role = teacherEmails.includes(payload.email.toLowerCase())
      ? 'teacher'
      : 'student';
    const user = await luuNguoiDung({
      email: payload.email,
      name: payload.name || payload.email,
      picture: payload.picture,
      role,
    });
    res.json({ token: kyToken(user), user: nguoiDungCongKhai(user) });
  });

  // Đăng nhập thử nghiệm (không cần Google) - dùng khi phát triển/demo
  dinhTuyen.post('/auth/dev-login', async (req, res) => {
    if (!devLoginEnabled) throw new LoiHttp(403, 'Đăng nhập thử nghiệm đã tắt');
    const { email, name, role } = req.body || {};
    if (!email || !/^\S+@\S+\.\S+$/.test(email))
      throw new LoiHttp(400, 'Email không hợp lệ');
    if (!['teacher', 'student'].includes(role))
      throw new LoiHttp(400, 'Vai trò phải là teacher hoặc student');
    const user = await luuNguoiDung({ email, name, role });
    res.json({ token: kyToken(user), user: nguoiDungCongKhai(user) });
  });

  dinhTuyen.get('/auth/me', batBuocDangNhap, async (req, res) => {
    const rows = await db.query(
      'SELECT id,email,name,picture,role FROM account.users WHERE id=$1',
      [req.user.id],
    );
    if (!rows[0]) throw new LoiHttp(401, 'Tài khoản không tồn tại');
    res.json(rows[0]);
  });

  const nguoiDungCongKhai = (nguoiDung) => ({
    id: nguoiDung.id,
    email: nguoiDung.email,
    name: nguoiDung.name,
    picture: nguoiDung.picture,
    role: nguoiDung.role,
  });

  // ---------- Lớp học ----------
  dinhTuyen.get('/classes', batBuocDangNhap, async (req, res) => {
    if (req.user.role === 'teacher') {
      const rows = await db.query(
        `SELECT c.*, (SELECT count(*)::int FROM account.class_students s WHERE s.class_id = c.id) AS student_count
         FROM account.classes c WHERE c.teacher_id = $1 ORDER BY c.created_at DESC`,
        [req.user.id],
      );
      return res.json(rows);
    }
    const rows = await db.query(
      `SELECT c.*, u.name AS teacher_name, s.student_code, s.full_name
       FROM account.class_students s
       JOIN account.classes c ON c.id = s.class_id
       JOIN account.users u ON u.id = c.teacher_id
       WHERE lower(s.email) = lower($1) ORDER BY c.created_at DESC`,
      [req.user.email],
    );
    res.json(rows);
  });

  function docThongTinLop(body, current = {}) {
    const code = String(body.code ?? current.code ?? '').trim();
    const name = String(body.name ?? current.name ?? '').trim();
    if (!code || !name) throw new LoiHttp(400, 'Cần nhập mã lớp và tên lớp');
    const total = Number(body.totalSessions ?? current.total_sessions ?? 15);
    const percent = Number(body.maxAbsentPercent ?? current.max_absent_percent ?? 20);
    if (!Number.isInteger(total) || total < 1 || total > 100)
      throw new LoiHttp(400, 'Số buổi phải từ 1 đến 100');
    if (!Number.isInteger(percent) || percent < 0 || percent > 100)
      throw new LoiHttp(400, 'Tỉ lệ vắng tối đa phải từ 0 đến 100');
    return {
      code,
      name,
      room: String(body.room ?? current.room ?? '').trim() || null,
      semester: String(body.semester ?? current.semester ?? '').trim() || null,
      total,
      percent,
    };
  }

  dinhTuyen.post('/classes', batBuocDangNhap, batBuocVaiTro('teacher'), async (req, res) => {
    const duLieu = docThongTinLop(req.body || {});
    const rows = await db.query(
      `INSERT INTO account.classes (teacher_id, code, name, room, semester, total_sessions, max_absent_percent)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.id, duLieu.code, duLieu.name, duLieu.room, duLieu.semester, duLieu.total, duLieu.percent],
    );
    res.status(201).json({ ...rows[0], student_count: 0 });
  });

  dinhTuyen.get('/classes/:id', batBuocDangNhap, async (req, res) => {
    res.json(await layLopDuocXem(req.user, req.params.id));
  });

  dinhTuyen.put('/classes/:id', batBuocDangNhap, batBuocVaiTro('teacher'), async (req, res) => {
    const lop = await layLopCuaGiangVien(req.user, req.params.id);
    const duLieu = docThongTinLop(req.body || {}, lop);
    const rows = await db.query(
      `UPDATE account.classes SET code=$1, name=$2, room=$3, semester=$4, total_sessions=$5, max_absent_percent=$6
       WHERE id=$7 RETURNING *`,
      [duLieu.code, duLieu.name, duLieu.room, duLieu.semester, duLieu.total, duLieu.percent, lop.id],
    );
    res.json(rows[0]);
  });

  dinhTuyen.delete(
    '/classes/:id',
    batBuocDangNhap,
    batBuocVaiTro('teacher'),
    async (req, res) => {
      const lop = await layLopCuaGiangVien(req.user, req.params.id);
      await db.query('DELETE FROM account.classes WHERE id=$1', [lop.id]);
      res.status(204).end();
    },
  );

  // ---------- Sinh viên trong lớp ----------
  dinhTuyen.get(
    '/classes/:id/students',
    batBuocDangNhap,
    batBuocVaiTro('teacher'),
    async (req, res) => {
      const lop = await layLopCuaGiangVien(req.user, req.params.id);
      const rows = await db.query(
        `SELECT id, student_code, full_name, email FROM account.class_students WHERE class_id=$1 ORDER BY student_code`,
        [lop.id],
      );
      res.json(rows);
    },
  );

  dinhTuyen.post(
    '/classes/:id/students',
    batBuocDangNhap,
    batBuocVaiTro('teacher'),
    async (req, res) => {
      const lop = await layLopCuaGiangVien(req.user, req.params.id);
      const { studentCode, fullName, email } = req.body || {};
      if (!studentCode || !fullName || !/^\S+@\S+\.\S+$/.test(email || '')) {
        throw new LoiHttp(400, 'Cần nhập MSSV, họ tên và email hợp lệ');
      }
      const rows = await db.query(
        `INSERT INTO account.class_students (class_id, student_code, full_name, email) VALUES ($1,$2,$3,$4)
       ON CONFLICT (class_id, student_code) DO UPDATE SET full_name=EXCLUDED.full_name, email=EXCLUDED.email
       RETURNING id, student_code, full_name, email`,
        [
          lop.id,
          String(studentCode).trim(),
          String(fullName).trim(),
          String(email).trim().toLowerCase(),
        ],
      );
      res.status(201).json(rows[0]);
    },
  );

  dinhTuyen.delete(
    '/classes/:id/students/:studentId',
    batBuocDangNhap,
    batBuocVaiTro('teacher'),
    async (req, res) => {
      const lop = await layLopCuaGiangVien(req.user, req.params.id);
      await db.query('DELETE FROM account.class_students WHERE id=$1 AND class_id=$2', [
        Number(req.params.studentId),
        lop.id,
      ]);
      res.status(204).end();
    },
  );

  return dinhTuyen;
}
