// API REST của dịch vụ "Tài khoản & Lớp học": các đường dẫn (GET/POST/PUT/DELETE) và xử lý nghiệp vụ.
// Tài liệu Swagger của các đường dẫn này nằm ở taiLieuApi.js.

import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import {
  LoiHttp,
  batBuocDangNhap,
  batBuocVaiTro,
  goiDichVu,
  kiemTraMatKhau,
  kyToken,
  maHoaMatKhau,
} from './tienIch.js';

const teacherEmails = (process.env.TEACHER_EMAILS || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

// Dịch vụ buổi học: nhận yêu cầu tạo sẵn đủ số buổi khi lớp được tạo/sửa.
const DIA_CHI_BUOI_HOC = process.env.SESSION_URL || 'http://localhost:4002';

export function taoApi(db) {
  const dinhTuyen = Router();
  const googleClient = process.env.GOOGLE_CLIENT_ID
    ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
    : null;
  const devLoginEnabled = process.env.ALLOW_DEV_LOGIN !== 'false';

  // ---------- Hàm dùng chung ----------
  async function luuNguoiDung({ email, name, picture, role, password }) {
    const passwordHash = password ? await maHoaMatKhau(password) : null;
    const rows = await db.query(
      `INSERT INTO account.users (email, name, picture, role, password_hash) VALUES ($1, COALESCE($2, split_part($1, '@', 1)), $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET name = COALESCE($2, account.users.name), role = EXCLUDED.role,
         picture = COALESCE(EXCLUDED.picture, account.users.picture),
         password_hash = COALESCE($5, account.users.password_hash)
       RETURNING *`,
      [email.toLowerCase(), name || null, picture || null, role, passwordHash],
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

  // Đăng nhập thử nghiệm (không cần Google) - dùng khi phát triển/demo.
  // Có nhập mật khẩu: tài khoản đã có mật khẩu thì kiểm tra đúng/sai; tài khoản chưa có
  // mật khẩu (hoặc tài khoản mới) thì lưu mật khẩu vừa nhập để lần sau đăng nhập lại được.
  dinhTuyen.post('/auth/dev-login', async (req, res) => {
    if (!devLoginEnabled) throw new LoiHttp(403, 'Đăng nhập thử nghiệm đã tắt');
    const { email, name, password, role } = req.body || {};
    if (!email || !/^\S+@\S+\.\S+$/.test(email))
      throw new LoiHttp(400, 'Email không hợp lệ');

    const found = await db.query(
      'SELECT * FROM account.users WHERE lower(email)=lower($1)',
      [email],
    );
    let user = found[0];

    if (password) {
      if (user?.password_hash) {
        if (!(await kiemTraMatKhau(password, user.password_hash)))
          throw new LoiHttp(401, 'Email hoặc mật khẩu không đúng');
      } else if (user) {
        // Tài khoản cũ chưa từng có mật khẩu: lưu mật khẩu vừa nhập (mã hoá scrypt)
        user = (
          await db.query(
            'UPDATE account.users SET password_hash=$1 WHERE id=$2 RETURNING *',
            [await maHoaMatKhau(password), user.id],
          )
        )[0];
      } else {
        // Tài khoản mới ở chế độ thử nghiệm: tạo theo vai trò chọn trong form
        if (!['teacher', 'student'].includes(role))
          throw new LoiHttp(400, 'Vai trò phải là teacher hoặc student');
        user = await luuNguoiDung({ email, name, role, password });
      }
      return res.json({ token: kyToken(user), user: nguoiDungCongKhai(user) });
    }

    // Không nhập mật khẩu: chỉ chấp nhận khi tài khoản chưa đặt mật khẩu (giống hành vi cũ)
    if (user?.password_hash)
      throw new LoiHttp(
        401,
        'Tài khoản này đã đặt mật khẩu, hãy nhập mật khẩu để đăng nhập',
      );
    if (!['teacher', 'student'].includes(role))
      throw new LoiHttp(400, 'Vai trò phải là teacher hoặc student');
    user = await luuNguoiDung({ email, name, role });
    res.json({ token: kyToken(user), user: nguoiDungCongKhai(user) });
  });

  // Chặn thử mật khẩu tràn lan: mỗi email tối đa 10 lần sai trong 15 phút (chống dò mật khẩu)
  const soLanSai = new Map(); // email -> { count, resetAt }
  const GIOI_HAN_SAI = 10;
  const THOI_GIAN_KHOA = 15 * 60 * 1000;
  function choPhepThu(email) {
    const muc = soLanSai.get(email);
    if (!muc || Date.now() > muc.resetAt) {
      soLanSai.set(email, { count: 0, resetAt: Date.now() + THOI_GIAN_KHOA });
      return true;
    }
    return muc.count < GIOI_HAN_SAI;
  }
  const ghiSai = (email) => {
    const muc = soLanSai.get(email);
    if (muc) muc.count++;
  };

  // Đăng nhập bằng email + mật khẩu — dùng cho cả giảng viên và sinh viên.
  // Mật khẩu mặc định của sinh viên là MSSV (giảng viên nhập khi thêm lớp), lưu đã mã hoá.
  // Ở chế độ thử nghiệm (ALLOW_DEV_LOGIN bật): tài khoản chưa từng có mật khẩu sẽ nhận
  // mật khẩu vừa nhập; tài khoản hoàn toàn mới được tạo theo vai trò chọn trong form.
  dinhTuyen.post('/auth/login', async (req, res) => {
    const { email, password, role } = req.body || {};
    const emailThu = String(email || '').trim().toLowerCase();
    if (!emailThu || !password) throw new LoiHttp(400, 'Cần nhập email và mật khẩu');
    if (!choPhepThu(emailThu))
      throw new LoiHttp(429, 'Bạn nhập sai quá nhiều lần. Hãy thử lại sau 15 phút.');

    const rows = await db.query(
      'SELECT * FROM account.users WHERE lower(email)=$1',
      [emailThu],
    );
    let user = rows[0];

    if (user?.password_hash) {
      // Tài khoản đã có mật khẩu: kiểm tra đúng/sai
      if (!(await kiemTraMatKhau(password, user.password_hash))) {
        ghiSai(emailThu);
        throw new LoiHttp(401, 'Email hoặc mật khẩu không đúng');
      }
    } else if (user) {
      // Tài khoản đã tồn tại nhưng chưa từng đặt mật khẩu
      if (!devLoginEnabled)
        throw new LoiHttp(
          401,
          'Tài khoản này chưa có mật khẩu. Hãy đăng nhập bằng Google.',
        );
      user = (
        await db.query(
          'UPDATE account.users SET password_hash=$1 WHERE id=$2 RETURNING *',
          [await maHoaMatKhau(password), user.id],
        )
      )[0];
    } else {
      // Tài khoản mới: chỉ được tạo khi đang ở chế độ thử nghiệm
      if (!devLoginEnabled) {
        ghiSai(emailThu);
        throw new LoiHttp(401, 'Email hoặc mật khẩu không đúng');
      }
      if (!['teacher', 'student'].includes(role))
        throw new LoiHttp(400, 'Hãy chọn vai trò giảng viên hoặc sinh viên');
      user = await luuNguoiDung({ email, role, password });
    }

    // Người dùng chọn vai trò ở form: báo lỗi thân thiện nếu chọn không khớp
    // (quyền thật vẫn luôn lấy từ database trong token, đây chỉ là gợi ý)
    if (role && ['teacher', 'student'].includes(role) && user.role !== role)
      throw new LoiHttp(
        403,
        `Tài khoản này là ${user.role === 'teacher' ? 'giảng viên' : 'sinh viên'} — hãy chọn đúng vai trò ở trên.`,
      );
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

  // Sửa thông tin của chính mình: giảng viên đổi được email + mật khẩu,
  // sinh viên chỉ đổi được mật khẩu (email của SV là khoá ghép với danh sách lớp).
  dinhTuyen.put('/auth/me', batBuocDangNhap, async (req, res) => {
    const { email, password } = req.body || {};
    const capNhat = {};

    if (password) {
      if (String(password).length < 4)
        throw new LoiHttp(400, 'Mật khẩu phải có ít nhất 4 ký tự');
      capNhat.password_hash = await maHoaMatKhau(password);
    }

    if (email && String(email).trim().toLowerCase() !== req.user.email.toLowerCase()) {
      if (req.user.role !== 'teacher')
        throw new LoiHttp(403, 'Sinh viên chỉ có thể đổi mật khẩu');
      const emailMoi = String(email).trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(emailMoi)) throw new LoiHttp(400, 'Email không hợp lệ');
      const trung = await db.query(
        'SELECT id FROM account.users WHERE lower(email)=$1 AND id<>$2',
        [emailMoi, req.user.id],
      );
      if (trung[0]) throw new LoiHttp(409, 'Email này đã được tài khoản khác dùng');
      capNhat.email = emailMoi;
    }

    const cacTruong = Object.keys(capNhat);
    if (cacTruong.length === 0) throw new LoiHttp(400, 'Không có gì thay đổi để lưu');

    const rows = await db.query(
      `UPDATE account.users
       SET ${cacTruong.map((truong, i) => `${truong} = $${i + 1}`).join(', ')}
       WHERE id = $${cacTruong.length + 1}
       RETURNING id, email, name, picture, role`,
      [...cacTruong.map((truong) => capNhat[truong]), req.user.id],
    );
    if (!rows[0]) throw new LoiHttp(401, 'Tài khoản không tồn tại');
    // Token chứa email/role nên phải cấp token mới — frontend thay luôn token + thông tin cũ
    res.json({ token: kyToken(rows[0]), user: nguoiDungCongKhai(rows[0]) });
  });

  const nguoiDungCongKhai = (nguoiDung) => ({
    id: nguoiDung.id,
    email: nguoiDung.email,
    name: nguoiDung.name,
    picture: nguoiDung.picture,
    role: nguoiDung.role,
  });

  // ---------- Lớp học ----------
  // Đồng bộ số buổi sang dịch vụ buổi học (chạy nền, không chặn thao tác của giảng viên).
  // Lỗi mạng không làm hỏng việc tạo/sửa lớp — lần mở tab "Buổi học" sẽ tự đồng bộ lại.
  function dongBoBuoiHoc(classId, token) {
    goiDichVu(DIA_CHI_BUOI_HOC, '/sessions/sync', {
      token,
      method: 'POST',
      body: { classId },
    }).catch((loi) => {
      console.warn('[account] Không đồng bộ được buổi học:', loi.message);
    });
  }

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
    dongBoBuoiHoc(rows[0].id, req.token);
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
    dongBoBuoiHoc(rows[0].id, req.token);
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
      // Tạo/cập nhật tài khoản đăng nhập cho sinh viên: mật khẩu chính là MSSV (mã hoá scrypt trước khi lưu)
      const passwordHash = await maHoaMatKhau(String(studentCode).trim());
      await db.query(
        `INSERT INTO account.users (email, name, role, password_hash) VALUES ($1,$2,'student',$3)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash`,
        [String(email).trim().toLowerCase(), String(fullName).trim(), passwordHash],
      );
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

  // Thêm nhanh nhiều sinh viên bằng một ô văn bản, mỗi dòng "MSSV|Họ tên|Email".
  // Mật khẩu đăng nhập của sinh viên chính là MSSV của họ, được mã hoá scrypt trước khi lưu.
  // Các dòng hợp lệ được lưu, dòng sai được trả về kèm lý do để giảng viên sửa.
  dinhTuyen.post(
    '/classes/:id/students/bulk',
    batBuocDangNhap,
    batBuocVaiTro('teacher'),
    async (req, res) => {
      const lop = await layLopCuaGiangVien(req.user, req.params.id);
      const cacDong = String(req.body?.text || '').split(/\r?\n/);
      const emailDaDung = new Set(); // chống trùng email ngay trong lần dán này
      const invalid = [];
      const hopLe = [];

      cacDong.forEach((dong, chiSo) => {
        const banGoc = dong.trim();
        if (!banGoc) return; // bỏ qua dòng trống
        const boiLoi = (reason) => invalid.push({ line: chiSo + 1, text: banGoc, reason });
        const cacPhan = banGoc.split('|').map((phan) => phan.trim());
        if (cacPhan.length !== 3)
          return boiLoi('Cần đúng định dạng "MSSV|Họ tên|Email"');
        const [studentCode, fullName, email] = cacPhan;
        if (!studentCode) return boiLoi('Thiếu MSSV');
        if (!fullName) return boiLoi('Thiếu họ tên');
        if (!/^\S+@\S+\.\S+$/.test(email)) return boiLoi('Email không hợp lệ');
        const emailThuong = email.toLowerCase();
        if (emailDaDung.has(emailThuong))
          return boiLoi('Email bị trùng với dòng phía trên');
        emailDaDung.add(emailThuong);
        hopLe.push({ line: chiSo + 1, studentCode, fullName, emailThuong });
      });
      if (hopLe.length > 500)
        throw new LoiHttp(400, 'Tối đa 500 sinh viên mỗi lần thêm');

      let imported = 0;
      for (const sinhVien of hopLe) {
        try {
          // Tài khoản đăng nhập: mật khẩu = MSSV, mã hoá scrypt trước khi lưu.
          // Không đụng vào cột role để không hạ quyền nếu email đó đã là giảng viên.
          const passwordHash = await maHoaMatKhau(sinhVien.studentCode);
          await db.query(
            `INSERT INTO account.users (email, name, role, password_hash) VALUES ($1,$2,'student',$3)
           ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash`,
            [sinhVien.emailThuong, sinhVien.fullName, passwordHash],
          );
          await db.query(
            `INSERT INTO account.class_students (class_id, student_code, full_name, email) VALUES ($1,$2,$3,$4)
           ON CONFLICT (class_id, student_code) DO UPDATE SET full_name=EXCLUDED.full_name, email=EXCLUDED.email`,
            [lop.id, sinhVien.studentCode, sinhVien.fullName, sinhVien.emailThuong],
          );
          imported++;
        } catch (loi) {
          invalid.push({
            line: sinhVien.line,
            text: `${sinhVien.studentCode}|${sinhVien.fullName}|${sinhVien.emailThuong}`,
            reason:
              loi.code === '23505'
                ? 'Email này đã được dùng cho một MSSV khác trong lớp'
                : `Không lưu được: ${String(loi.message).split('\n')[0]}`,
          });
        }
      }
      res.json({ imported, invalid });
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
