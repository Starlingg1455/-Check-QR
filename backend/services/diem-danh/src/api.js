// API REST của dịch vụ "Điểm danh & Thông báo": các đường dẫn (GET/POST/PUT/DELETE) và xử lý nghiệp vụ.
// Tài liệu Swagger của các đường dẫn này nằm ở tai-lieu-api.js.

import { Router } from 'express';
import multer from 'multer';
import { LoiHttp, goiDichVu, coMail, batBuocDangNhap, batBuocVaiTro, guiMail } from './tien-ich.js';

// ============ Các đường dẫn REST ============

const DIA_CHI_TAI_KHOAN = process.env.ACCOUNT_URL || 'http://localhost:4001';
const DIA_CHI_BUOI_HOC = process.env.SESSION_URL || 'http://localhost:4002';
const DIA_CHI_THONG_KE = process.env.STATISTICS_URL || 'http://localhost:4004';
const SO_PHUT_DI_MUON = Number(process.env.LATE_MINUTES || 15);

// Ảnh minh chứng: tối đa 3 ảnh/đơn, mỗi ảnh tối đa 3MB (trình duyệt đã nén trước khi gửi)
const TOI_DA_ANH = 3;
const LOAI_ANH_CHO_PHEP = ['image/jpeg', 'image/png', 'image/webp'];
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024, files: TOI_DA_ANH } });

const CAC_TRANG_THAI = ['present', 'late', 'excused', 'absent'];

const chuyenBanGhi = (r) => ({
  sessionId: r.session_id,
  classId: r.class_id,
  studentEmail: r.student_email,
  studentCode: r.student_code,
  studentName: r.student_name,
  status: r.status,
  source: r.source,
  note: r.note,
  checkedAt: r.checked_at,
});

const chuyenDon = (q, files = []) => ({
  files,
  id: q.id,
  classId: q.class_id,
  sessionId: q.session_id,
  sessionNo: q.session_no,
  studentEmail: q.student_email,
  studentCode: q.student_code,
  studentName: q.student_name,
  reason: q.reason,
  status: q.status,
  teacherNote: q.teacher_note,
  createdAt: q.created_at,
  reviewedAt: q.reviewed_at,
});

export function taoApi(db) {
  const r = Router();

  const layLop = (classId, token) => goiDichVu(DIA_CHI_TAI_KHOAN, `/classes/${classId}`, { token });
  const layBuoiHoc = (id, token) => goiDichVu(DIA_CHI_BUOI_HOC, `/sessions/${id}`, { token });

  // Lấy buổi học và bắt buộc người gọi là giảng viên của lớp đó
  async function layBuoiCuaGiangVien(sessionId, token) {
    const session = await layBuoiHoc(sessionId, token);
    const cls = await layLop(session.classId, token);
    if (!cls.isOwner) throw new LoiHttp(403, 'Chỉ giảng viên của lớp được thực hiện');
    return { session, cls };
  }

  // Lấy thông tin (không gồm nội dung) các ảnh đính kèm rồi gắn vào từng đơn
  async function chuyenDonKemAnh(rows) {
    if (rows.length === 0) return [];
    const marks = rows.map((_, i) => '$' + (i + 1)).join(',');
    const files = await db.query(
      `SELECT id, request_id, filename, mime, size FROM attendance.request_files WHERE request_id IN (${marks}) ORDER BY id`,
      rows.map((q) => q.id),
    );
    return rows.map((q) => chuyenDon(q, files.filter((f) => f.request_id === q.id).map((f) => ({ id: f.id, name: f.filename, mime: f.mime, size: f.size }))));
  }

  // Ghi/đè một bản ghi điểm danh
  function luuBanGhi({ sessionId, classId, email, code, name, status, source, note }) {
    return db.query(
      `INSERT INTO attendance.records (session_id, class_id, student_email, student_code, student_name, status, source, note)
       VALUES ($1,$2,lower($3),$4,$5,$6,$7,$8)
       ON CONFLICT (session_id, student_email)
       DO UPDATE SET status=EXCLUDED.status, source=EXCLUDED.source, note=EXCLUDED.note, checked_at=now()
       RETURNING *`,
      [sessionId, classId, email, code, name, status, source, note || null],
    );
  }

  // ---------- Sinh viên quét QR ----------
  r.post('/scan', batBuocDangNhap, batBuocVaiTro('student'), async (req, res) => {
    const token = String(req.body?.token || '').trim();
    if (!token) throw new LoiHttp(400, 'Thiếu mã QR');

    // 1) Hỏi service buổi học xem mã QR có hợp lệ không
    const session = await goiDichVu(DIA_CHI_BUOI_HOC, '/sessions/verify', { token: req.token, method: 'POST', body: { token } });
    // 2) Hỏi service lớp học xem sinh viên có thuộc lớp không
    const cls = await layLop(session.classId, req.token);
    if (!cls.myStudent) throw new LoiHttp(403, 'Bạn không thuộc lớp này');
    const me = cls.myStudent;

    const existing = await db.query(
      'SELECT * FROM attendance.records WHERE session_id=$1 AND student_email=lower($2)',
      [session.id, req.user.email],
    );
    const base = { classId: cls.id, className: cls.name, classCode: cls.code, sessionNo: session.sessionNo, title: session.title };
    if (existing[0] && ['present', 'late'].includes(existing[0].status)) {
      return res.json({ ...base, alreadyCheckedIn: true, status: existing[0].status, checkedAt: existing[0].checked_at });
    }

    const minutesSinceOpen = (Date.now() - new Date(session.openedAt).getTime()) / 60000;
    const status = minutesSinceOpen > SO_PHUT_DI_MUON ? 'late' : 'present';
    const [rec] = await luuBanGhi({
      sessionId: session.id, classId: cls.id, email: req.user.email,
      code: me.student_code, name: me.full_name, status, source: 'qr',
    });
    res.json({ ...base, alreadyCheckedIn: false, status, checkedAt: rec.checked_at });
  });

  // ---------- Giảng viên xem/sửa điểm danh của một buổi ----------
  r.get('/sessions/:sessionId/roster', batBuocDangNhap, batBuocVaiTro('teacher'), async (req, res) => {
    const { session, cls } = await layBuoiCuaGiangVien(req.params.sessionId, req.token);
    const students = await goiDichVu(DIA_CHI_TAI_KHOAN, `/classes/${cls.id}/students`, { token: req.token });
    const records = await db.query('SELECT * FROM attendance.records WHERE session_id=$1', [session.id]);
    const byEmail = new Map(records.map((x) => [x.student_email, x]));

    const roster = students.map((s) => {
      const rec = byEmail.get(s.email.toLowerCase());
      return {
        studentCode: s.student_code,
        fullName: s.full_name,
        email: s.email,
        status: rec ? rec.status : 'absent',
        recorded: Boolean(rec),
        source: rec ? rec.source : null,
        note: rec ? rec.note : null,
        checkedAt: rec ? rec.checked_at : null,
      };
    });
    const summary = { total: roster.length, present: 0, late: 0, excused: 0, absent: 0 };
    roster.forEach((x) => { summary[x.status]++; });
    res.json({ session, summary, roster, lateMinutes: SO_PHUT_DI_MUON });
  });

  // Giảng viên sửa tay trạng thái: có mặt / đi trễ / có phép / vắng
  r.put('/sessions/:sessionId/students/:email', batBuocDangNhap, batBuocVaiTro('teacher'), async (req, res) => {
    const { session, cls } = await layBuoiCuaGiangVien(req.params.sessionId, req.token);
    const { status, note } = req.body || {};
    if (!CAC_TRANG_THAI.includes(status)) throw new LoiHttp(400, `Trạng thái phải là một trong: ${CAC_TRANG_THAI.join(', ')}`);
    const students = await goiDichVu(DIA_CHI_TAI_KHOAN, `/classes/${cls.id}/students`, { token: req.token });
    const email = decodeURIComponent(req.params.email).toLowerCase();
    const stu = students.find((s) => s.email.toLowerCase() === email);
    if (!stu) throw new LoiHttp(404, 'Sinh viên không thuộc lớp này');
    const [rec] = await luuBanGhi({
      sessionId: session.id, classId: cls.id, email, code: stu.student_code, name: stu.full_name,
      status, source: 'manual', note,
    });
    res.json(chuyenBanGhi(rec));
  });

  // Toàn bộ bản ghi của lớp (service thống kê gọi)
  r.get('/classes/:classId/records', batBuocDangNhap, batBuocVaiTro('teacher'), async (req, res) => {
    const cls = await layLop(req.params.classId, req.token);
    if (!cls.isOwner) throw new LoiHttp(403, 'Chỉ giảng viên của lớp được xem');
    const rows = await db.query('SELECT * FROM attendance.records WHERE class_id=$1', [cls.id]);
    res.json(rows.map(chuyenBanGhi));
  });

  // ---------- Sinh viên xem lịch sử điểm danh của mình trong một lớp ----------
  r.get('/classes/:classId/me', batBuocDangNhap, batBuocVaiTro('student'), async (req, res) => {
    const cls = await layLop(req.params.classId, req.token);
    const sessions = await goiDichVu(DIA_CHI_BUOI_HOC, `/sessions?classId=${cls.id}`, { token: req.token });
    const records = await db.query(
      'SELECT * FROM attendance.records WHERE class_id=$1 AND student_email=lower($2)',
      [cls.id, req.user.email],
    );
    const requests = await db.query(
      'SELECT * FROM attendance.absence_requests WHERE class_id=$1 AND student_email=lower($2)',
      [cls.id, req.user.email],
    );
    const byId = new Map(records.map((x) => [x.session_id, x]));
    const reqBySession = new Map((await chuyenDonKemAnh(requests)).map((x) => [x.sessionId, x]));

    const history = sessions.map((s) => {
      const rec = byId.get(s.id);
      return {
        sessionId: s.id, sessionNo: s.sessionNo, title: s.title, status: s.status, openedAt: s.openedAt,
        // Buổi còn đang mở mà chưa điểm danh thì chưa tính là vắng
        attendance: rec ? rec.status : s.status === 'open' ? 'pending' : 'absent',
        checkedAt: rec ? rec.checked_at : null,
        request: reqBySession.get(s.id) || null,
      };
    });
    const closed = history.filter((h) => h.status === 'closed');
    const count = (st) => closed.filter((h) => h.attendance === st).length;
    const summary = {
      sessions: closed.length, present: count('present'), late: count('late'), excused: count('excused'), absent: count('absent'),
    };
    summary.rate = closed.length ? Math.round(((summary.present + summary.late) / closed.length) * 1000) / 10 : null;
    res.json({
      class: { id: cls.id, code: cls.code, name: cls.name, totalSessions: cls.total_sessions, maxAbsentPercent: cls.max_absent_percent },
      student: cls.myStudent,
      summary,
      history: history.reverse(),
    });
  });

  // ---------- Đơn xin vắng ----------
  r.post('/requests', batBuocDangNhap, batBuocVaiTro('student'), upload.array('files', TOI_DA_ANH), async (req, res) => {
    const { classId, sessionId, reason } = req.body || {};
    const files = req.files || [];
    for (const f of files) {
      if (!LOAI_ANH_CHO_PHEP.includes(f.mimetype)) throw new LoiHttp(400, 'Chỉ nhận ảnh JPG, PNG hoặc WebP');
    }
    if (!String(reason || '').trim()) throw new LoiHttp(400, 'Vui lòng nhập lý do');
    const cls = await layLop(classId, req.token);
    const session = await layBuoiHoc(sessionId, req.token);
    if (session.classId !== cls.id) throw new LoiHttp(400, 'Buổi học không thuộc lớp này');
    const me = cls.myStudent;

    const dup = await db.query(
      `SELECT id FROM attendance.absence_requests WHERE session_id=$1 AND student_email=lower($2) AND status <> 'rejected'`,
      [session.id, req.user.email],
    );
    if (dup[0]) throw new LoiHttp(409, 'Bạn đã gửi đơn cho buổi này rồi');

    const rows = await db.query(
      `INSERT INTO attendance.absence_requests (class_id, session_id, session_no, student_email, student_code, student_name, reason)
       VALUES ($1,$2,$3,lower($4),$5,$6,$7) RETURNING *`,
      [cls.id, session.id, session.sessionNo, req.user.email, me.student_code, me.full_name, String(reason).trim()],
    );
    for (const f of files) {
      await db.query(
        'INSERT INTO attendance.request_files (request_id, filename, mime, size, data) VALUES ($1,$2,$3,$4,$5)',
        [rows[0].id, Buffer.from(f.originalname, 'latin1').toString('utf8').slice(0, 120), f.mimetype, f.size, f.buffer],
      );
    }
    res.status(201).json((await chuyenDonKemAnh(rows))[0]);
  });

  // Giảng viên: xem đơn của một lớp. Sinh viên: xem đơn của chính mình.
  r.get('/requests', batBuocDangNhap, async (req, res) => {
    if (req.user.role === 'teacher') {
      const cls = await layLop(req.query.classId, req.token);
      if (!cls.isOwner) throw new LoiHttp(403, 'Chỉ giảng viên của lớp được xem');
      const rows = await db.query(
        `SELECT * FROM attendance.absence_requests WHERE class_id=$1
         ORDER BY (status='pending') DESC, created_at DESC`,
        [cls.id],
      );
      return res.json(await chuyenDonKemAnh(rows));
    }
    const rows = await db.query(
      'SELECT * FROM attendance.absence_requests WHERE student_email=lower($1) ORDER BY created_at DESC',
      [req.user.email],
    );
    res.json(await chuyenDonKemAnh(rows));
  });

  // Giảng viên duyệt/từ chối. Duyệt => buổi đó chuyển thành "vắng có phép"
  r.put('/requests/:id', batBuocDangNhap, batBuocVaiTro('teacher'), async (req, res) => {
    const { status, teacherNote } = req.body || {};
    if (!['approved', 'rejected'].includes(status)) throw new LoiHttp(400, 'status phải là approved hoặc rejected');
    const found = await db.query('SELECT * FROM attendance.absence_requests WHERE id=$1', [Number(req.params.id)]);
    const q = found[0];
    if (!q) throw new LoiHttp(404, 'Không tìm thấy đơn');
    const cls = await layLop(q.class_id, req.token);
    if (!cls.isOwner) throw new LoiHttp(403, 'Chỉ giảng viên của lớp được duyệt');

    const rows = await db.query(
      `UPDATE attendance.absence_requests SET status=$1, teacher_note=$2, reviewed_at=now() WHERE id=$3 RETURNING *`,
      [status, teacherNote || null, q.id],
    );
    if (status === 'approved') {
      await luuBanGhi({
        sessionId: q.session_id, classId: q.class_id, email: q.student_email, code: q.student_code, name: q.student_name,
        status: 'excused', source: 'request', note: `Đơn xin vắng: ${q.reason}`,
      });
    }
    res.json((await chuyenDonKemAnh(rows))[0]);
  });

  // Xem ảnh minh chứng: giảng viên của lớp hoặc chính sinh viên gửi đơn
  r.get('/requests/:id/files/:fileId', batBuocDangNhap, async (req, res) => {
    const found = await db.query('SELECT * FROM attendance.absence_requests WHERE id=$1', [Number(req.params.id)]);
    const q = found[0];
    if (!q) throw new LoiHttp(404, 'Không tìm thấy đơn');
    if (req.user.role === 'teacher') {
      const cls = await layLop(q.class_id, req.token);
      if (!cls.isOwner) throw new LoiHttp(403, 'Không có quyền xem');
    } else if (q.student_email !== req.user.email.toLowerCase()) {
      throw new LoiHttp(403, 'Không có quyền xem');
    }
    const rows = await db.query('SELECT mime, data FROM attendance.request_files WHERE id=$1 AND request_id=$2', [Number(req.params.fileId), q.id]);
    if (!rows[0]) throw new LoiHttp(404, 'Không tìm thấy ảnh');
    res.setHeader('Content-Type', rows[0].mime);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(Buffer.from(rows[0].data));
  });

  // ---------- Email cảnh báo vắng nhiều ----------
  r.post('/warnings/send', batBuocDangNhap, batBuocVaiTro('teacher'), async (req, res) => {
    const cls = await layLop(req.body?.classId, req.token);
    if (!cls.isOwner) throw new LoiHttp(403, 'Chỉ giảng viên của lớp được gửi cảnh báo');

    // Hỏi service thống kê danh sách sinh viên có nguy cơ
    const risk = await goiDichVu(DIA_CHI_THONG_KE, `/classes/${cls.id}/risk`, { token: req.token });
    const labels = { warning: 'cần chú ý', danger: 'sắp bị cấm thi', banned: 'đã vượt giới hạn vắng (có thể bị cấm thi)' };

    const results = [];
    for (const s of risk.students) {
      const subject = `[${cls.code}] Cảnh báo vắng học - ${labels[s.level]}`;
      const html = `
        <p>Chào ${s.fullName},</p>
        <p>Theo ghi nhận điểm danh môn <b>${cls.name}</b> (${cls.code}), bạn đã vắng không phép
        <b>${s.absent}</b> buổi / ${risk.closedSessions} buổi đã học. Giới hạn cho phép của lớp là <b>${risk.absentLimit}</b> buổi.</p>
        <p>Tình trạng hiện tại: <b>${labels[s.level]}</b>.</p>
        <p>Nếu có lý do chính đáng, bạn hãy gửi đơn xin vắng trên hệ thống hoặc liên hệ giảng viên.</p>
        <p>Trân trọng,<br/>${cls.teacher_name}</p>`;
      const mail = await guiMail({ to: s.email, subject, html });
      await db.query(
        `INSERT INTO attendance.notifications (class_id, student_email, student_name, subject, status, detail) VALUES ($1,lower($2),$3,$4,$5,$6)`,
        [cls.id, s.email, s.fullName, subject, mail.status, mail.detail],
      );
      results.push({ email: s.email, fullName: s.fullName, level: s.level, status: mail.status, detail: mail.detail });
    }
    res.json({ mailConfigured: coMail, count: results.length, results });
  });

  r.get('/notifications', batBuocDangNhap, batBuocVaiTro('teacher'), async (req, res) => {
    const cls = await layLop(req.query.classId, req.token);
    if (!cls.isOwner) throw new LoiHttp(403, 'Chỉ giảng viên của lớp được xem');
    const rows = await db.query('SELECT * FROM attendance.notifications WHERE class_id=$1 ORDER BY created_at DESC LIMIT 100', [cls.id]);
    res.json(rows.map((n) => ({
      id: n.id, studentEmail: n.student_email, studentName: n.student_name, subject: n.subject,
      status: n.status, detail: n.detail, createdAt: n.created_at,
    })));
  });

  return r;
}

// ============ Lưu nhiều thay đổi sửa tay cùng lúc ============

// Lưu nhiều thay đổi điểm danh sửa tay cùng lúc.
// Giảng viên sửa nhiều ô (ở trang điểm danh của buổi hoặc trong chi tiết sinh viên) rồi bấm "Lưu" một lần:
// kiểm tra TOÀN BỘ trước khi ghi, hoặc lưu hết hoặc không lưu gì (một câu lệnh SQL duy nhất).


const TOI_DA_THAY_DOI = 6000;

export function taoApiLuuThayDoi(db) {
  const r = Router();

  // Lấy dữ liệu hiện tại của lớp (đồng thời kiểm tra quyền giảng viên)
  async function taiDuLieuLop(classId, token) {
    const cls = await goiDichVu(DIA_CHI_TAI_KHOAN, `/classes/${classId}`, { token });
    if (!cls.isOwner) throw new LoiHttp(403, 'Chỉ giảng viên của lớp được thực hiện');
    const [students, sessions] = await Promise.all([
      goiDichVu(DIA_CHI_TAI_KHOAN, `/classes/${cls.id}/students`, { token }),
      goiDichVu(DIA_CHI_BUOI_HOC, `/sessions?classId=${cls.id}`, { token }),
    ]);
    const records = await db.query('SELECT session_id, student_email, status FROM attendance.records WHERE class_id=$1', [cls.id]);
    const current = new Map(records.map((x) => [`${x.session_id}|${x.student_email}`, x.status]));
    return { cls, students, sessions, current };
  }

  // Body: { changes: [{ sessionId, email, status }] }
  r.post('/classes/:classId/changes', batBuocDangNhap, batBuocVaiTro('teacher'), async (req, res) => {
    const list = req.body?.changes;
    if (!Array.isArray(list) || list.length === 0) throw new LoiHttp(400, 'Không có thay đổi nào để lưu');
    if (list.length > TOI_DA_THAY_DOI) throw new LoiHttp(400, `Quá nhiều thay đổi một lần (tối đa ${TOI_DA_THAY_DOI})`);

    const { cls, students, sessions, current } = await taiDuLieuLop(req.params.classId, req.token);
    const sessionIds = new Set(sessions.map((s) => s.id));
    const byEmail = new Map(students.map((s) => [s.email.toLowerCase(), s]));

    // Kiểm tra toàn bộ trước khi ghi: một thay đổi sai là từ chối cả lô
    const wanted = new Map(); // "sessionId|email" -> status (thay đổi sau ghi đè thay đổi trước)
    for (const [i, c] of list.entries()) {
      const email = String(c?.email || '').toLowerCase();
      if (!sessionIds.has(Number(c?.sessionId))) throw new LoiHttp(400, `Thay đổi #${i + 1}: buổi học không thuộc lớp này`);
      if (!byEmail.has(email)) throw new LoiHttp(400, `Thay đổi #${i + 1}: sinh viên không thuộc lớp này`);
      if (!CAC_TRANG_THAI.includes(c?.status)) throw new LoiHttp(400, `Thay đổi #${i + 1}: trạng thái phải là present, late, excused hoặc absent`);
      wanted.set(`${Number(c.sessionId)}|${email}`, c.status);
    }

    // Chỉ ghi những ô thật sự khác với hiện tại
    const diffs = [];
    for (const [key, status] of wanted) {
      const from = current.get(key) || 'absent';
      if (from !== status) diffs.push({ key, status });
    }
    if (diffs.length > 0) {
      const params = [];
      const values = diffs.map(({ key, status }) => {
        const [sid, email] = key.split('|');
        const st = byEmail.get(email);
        const base = params.length;
        params.push(Number(sid), cls.id, email, st.student_code, st.full_name, status);
        return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},'manual','Giảng viên sửa tay')`;
      });
      await db.query(
        `INSERT INTO attendance.records (session_id, class_id, student_email, student_code, student_name, status, source, note)
         VALUES ${values.join(',')}
         ON CONFLICT (session_id, student_email)
         DO UPDATE SET status=EXCLUDED.status, source='manual', note=EXCLUDED.note, checked_at=now()`,
        params,
      );
    }
    res.json({ ok: true, applied: diffs.length, unchanged: wanted.size - diffs.length });
  });

  return r;
}
