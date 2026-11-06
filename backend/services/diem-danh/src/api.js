// API REST của dịch vụ "Điểm danh & Thông báo": các đường dẫn (GET/POST/PUT/DELETE) và xử lý nghiệp vụ.
// Tài liệu Swagger của các đường dẫn này nằm ở taiLieuApi.js.

import { Router } from 'express';
import multer from 'multer';
import {
  LoiHttp,
  goiDichVu,
  coMail,
  batBuocDangNhap,
  batBuocVaiTro,
  guiMail,
} from './tienIch.js';

// ============ Các đường dẫn REST ============

const DIA_CHI_TAI_KHOAN = process.env.ACCOUNT_URL || 'http://localhost:4001';
const DIA_CHI_BUOI_HOC = process.env.SESSION_URL || 'http://localhost:4002';
const DIA_CHI_THONG_KE = process.env.STATISTICS_URL || 'http://localhost:4004';
const SO_PHUT_DI_MUON = Number(process.env.LATE_MINUTES || 15);

// Ảnh minh chứng: tối đa 3 ảnh/đơn, mỗi ảnh tối đa 3MB (trình duyệt đã nén trước khi gửi)
const TOI_DA_ANH = 3;
const LOAI_ANH_CHO_PHEP = ['image/jpeg', 'image/png', 'image/webp'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024, files: TOI_DA_ANH },
});

const CAC_TRANG_THAI = ['present', 'late', 'excused', 'absent'];

const chuyenBanGhi = (banGhi) => ({
  sessionId: banGhi.session_id,
  classId: banGhi.class_id,
  studentEmail: banGhi.student_email,
  studentCode: banGhi.student_code,
  studentName: banGhi.student_name,
  status: banGhi.status,
  source: banGhi.source,
  note: banGhi.note,
  checkedAt: banGhi.checked_at,
});

const chuyenDon = (don, files = []) => ({
  files,
  id: don.id,
  classId: don.class_id,
  sessionId: don.session_id,
  sessionNo: don.session_no,
  studentEmail: don.student_email,
  studentCode: don.student_code,
  studentName: don.student_name,
  reason: don.reason,
  status: don.status,
  teacherNote: don.teacher_note,
  createdAt: don.created_at,
  reviewedAt: don.reviewed_at,
});

export function taoApi(db) {
  const dinhTuyen = Router();

  const layLop = (classId, token) =>
    goiDichVu(DIA_CHI_TAI_KHOAN, `/classes/${classId}`, { token });
  const layBuoiHoc = (id, token) =>
    goiDichVu(DIA_CHI_BUOI_HOC, `/sessions/${id}`, { token });

  // Lấy buổi học và bắt buộc người gọi là giảng viên của lớp đó
  async function layBuoiCuaGiangVien(sessionId, token) {
    const session = await layBuoiHoc(sessionId, token);
    const lop = await layLop(session.classId, token);
    if (!lop.isOwner) throw new LoiHttp(403, 'Chỉ giảng viên của lớp được thực hiện');
    return { session, cls: lop };
  }

  // Lấy thông tin (không gồm nội dung) các ảnh đính kèm rồi gắn vào từng đơn
  async function chuyenDonKemAnh(rows) {
    if (rows.length === 0) return [];
    const marks = rows.map((_, chiSo) => '$' + (chiSo + 1)).join(',');
    const files = await db.query(
      `SELECT id, request_id, filename, mime, size FROM attendance.request_files WHERE request_id IN (${marks}) ORDER BY id`,
      rows.map((don) => don.id),
    );
    return rows.map((don) =>
      chuyenDon(
        don,
        files
          .filter((tep) => tep.request_id === don.id)
          .map((tep) => ({ id: tep.id, name: tep.filename, mime: tep.mime, size: tep.size })),
      ),
    );
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
  dinhTuyen.post('/scan', batBuocDangNhap, batBuocVaiTro('student'), async (req, res) => {
    const token = String(req.body?.token || '').trim();
    if (!token) throw new LoiHttp(400, 'Thiếu mã QR');

    // 1) Hỏi service buổi học xem mã QR có hợp lệ không
    const session = await goiDichVu(DIA_CHI_BUOI_HOC, '/sessions/verify', {
      token: req.token,
      method: 'POST',
      body: { token },
    });
    // 2) Hỏi service lớp học xem sinh viên có thuộc lớp không
    const lop = await layLop(session.classId, req.token);
    if (!lop.myStudent) throw new LoiHttp(403, 'Bạn không thuộc lớp này');
    const banThan = lop.myStudent;

    const existing = await db.query(
      'SELECT * FROM attendance.records WHERE session_id=$1 AND student_email=lower($2)',
      [session.id, req.user.email],
    );
    const base = {
      classId: lop.id,
      className: lop.name,
      classCode: lop.code,
      sessionNo: session.sessionNo,
      title: session.title,
    };
    if (existing[0] && ['present', 'late'].includes(existing[0].status)) {
      return res.json({
        ...base,
        alreadyCheckedIn: true,
        status: existing[0].status,
        checkedAt: existing[0].checked_at,
      });
    }

    const minutesSinceOpen = (Date.now() - new Date(session.openedAt).getTime()) / 60000;
    const status = minutesSinceOpen > SO_PHUT_DI_MUON ? 'late' : 'present';
    const [banGhi] = await luuBanGhi({
      sessionId: session.id,
      classId: lop.id,
      email: req.user.email,
      code: banThan.student_code,
      name: banThan.full_name,
      status,
      source: 'qr',
    });
    res.json({ ...base, alreadyCheckedIn: false, status, checkedAt: banGhi.checked_at });
  });

  // ---------- Giảng viên xem/sửa điểm danh của một buổi ----------
  dinhTuyen.get(
    '/sessions/:sessionId/roster',
    batBuocDangNhap,
    batBuocVaiTro('teacher'),
    async (req, res) => {
      const { session, cls: lop } = await layBuoiCuaGiangVien(req.params.sessionId, req.token);
      const students = await goiDichVu(DIA_CHI_TAI_KHOAN, `/classes/${lop.id}/students`, {
        token: req.token,
      });
      const records = await db.query(
        'SELECT * FROM attendance.records WHERE session_id=$1',
        [session.id],
      );
      const byEmail = new Map(records.map((banGhi) => [banGhi.student_email, banGhi]));

      const roster = students.map((sinhVien) => {
        const banGhi = byEmail.get(sinhVien.email.toLowerCase());
        return {
          studentCode: sinhVien.student_code,
          fullName: sinhVien.full_name,
          email: sinhVien.email,
          status: banGhi ? banGhi.status : 'absent',
          recorded: Boolean(banGhi),
          source: banGhi ? banGhi.source : null,
          note: banGhi ? banGhi.note : null,
          checkedAt: banGhi ? banGhi.checked_at : null,
        };
      });
      const summary = {
        total: roster.length,
        present: 0,
        late: 0,
        excused: 0,
        absent: 0,
      };
      roster.forEach((dong) => {
        summary[dong.status]++;
      });
      res.json({ session, summary, roster, lateMinutes: SO_PHUT_DI_MUON });
    },
  );

  // Giảng viên sửa tay trạng thái: có mặt / đi trễ / có phép / vắng
  dinhTuyen.put(
    '/sessions/:sessionId/students/:email',
    batBuocDangNhap,
    batBuocVaiTro('teacher'),
    async (req, res) => {
      const { session, cls: lop } = await layBuoiCuaGiangVien(req.params.sessionId, req.token);
      const { status, note } = req.body || {};
      if (!CAC_TRANG_THAI.includes(status))
        throw new LoiHttp(
          400,
          `Trạng thái phải là một trong: ${CAC_TRANG_THAI.join(', ')}`,
        );
      const students = await goiDichVu(DIA_CHI_TAI_KHOAN, `/classes/${lop.id}/students`, {
        token: req.token,
      });
      const email = decodeURIComponent(req.params.email).toLowerCase();
      const sinhVienTim = students.find((sinhVien) => sinhVien.email.toLowerCase() === email);
      if (!sinhVienTim) throw new LoiHttp(404, 'Sinh viên không thuộc lớp này');
      const [banGhi] = await luuBanGhi({
        sessionId: session.id,
        classId: lop.id,
        email,
        code: sinhVienTim.student_code,
        name: sinhVienTim.full_name,
        status,
        source: 'manual',
        note,
      });
      res.json(chuyenBanGhi(banGhi));
    },
  );

  // Toàn bộ bản ghi của lớp (service thống kê gọi)
  dinhTuyen.get(
    '/classes/:classId/records',
    batBuocDangNhap,
    batBuocVaiTro('teacher'),
    async (req, res) => {
      const lop = await layLop(req.params.classId, req.token);
      if (!lop.isOwner) throw new LoiHttp(403, 'Chỉ giảng viên của lớp được xem');
      const rows = await db.query('SELECT * FROM attendance.records WHERE class_id=$1', [
        lop.id,
      ]);
      res.json(rows.map(chuyenBanGhi));
    },
  );

  // ---------- Sinh viên xem lịch sử điểm danh của mình trong một lớp ----------
  dinhTuyen.get(
    '/classes/:classId/me',
    batBuocDangNhap,
    batBuocVaiTro('student'),
    async (req, res) => {
      const lop = await layLop(req.params.classId, req.token);
      const sessions = await goiDichVu(DIA_CHI_BUOI_HOC, `/sessions?classId=${lop.id}`, {
        token: req.token,
      });
      const records = await db.query(
        'SELECT * FROM attendance.records WHERE class_id=$1 AND student_email=lower($2)',
        [lop.id, req.user.email],
      );
      const requests = await db.query(
        'SELECT * FROM attendance.absence_requests WHERE class_id=$1 AND student_email=lower($2)',
        [lop.id, req.user.email],
      );
      const byId = new Map(records.map((banGhi) => [banGhi.session_id, banGhi]));
      const reqBySession = new Map(
        (await chuyenDonKemAnh(requests)).map((don) => [don.sessionId, don]),
      );

      const history = sessions.map((buoi) => {
        const banGhi = byId.get(buoi.id);
        return {
          sessionId: buoi.id,
          sessionNo: buoi.sessionNo,
          title: buoi.title,
          status: buoi.status,
          openedAt: buoi.openedAt,
          // Buổi còn đang mở mà chưa điểm danh thì chưa tính là vắng
          attendance: banGhi ? banGhi.status : buoi.status === 'open' ? 'pending' : 'absent',
          checkedAt: banGhi ? banGhi.checked_at : null,
          request: reqBySession.get(buoi.id) || null,
        };
      });
      const closed = history.filter((dong) => dong.status === 'closed');
      const count = (trangThai) => closed.filter((dong) => dong.attendance === trangThai).length;
      const summary = {
        sessions: closed.length,
        present: count('present'),
        late: count('late'),
        excused: count('excused'),
        absent: count('absent'),
      };
      summary.rate = closed.length
        ? Math.round(((summary.present + summary.late) / closed.length) * 1000) / 10
        : null;
      res.json({
        class: {
          id: lop.id,
          code: lop.code,
          name: lop.name,
          totalSessions: lop.total_sessions,
          maxAbsentPercent: lop.max_absent_percent,
        },
        student: lop.myStudent,
        summary,
        history: history.reverse(),
      });
    },
  );

  // ---------- Đơn xin vắng ----------
  dinhTuyen.post(
    '/requests',
    batBuocDangNhap,
    batBuocVaiTro('student'),
    upload.array('files', TOI_DA_ANH),
    async (req, res) => {
      const { classId, sessionId, reason } = req.body || {};
      const files = req.files || [];
      for (const tep of files) {
        if (!LOAI_ANH_CHO_PHEP.includes(tep.mimetype))
          throw new LoiHttp(400, 'Chỉ nhận ảnh JPG, PNG hoặc WebP');
      }
      if (!String(reason || '').trim()) throw new LoiHttp(400, 'Vui lòng nhập lý do');
      const lop = await layLop(classId, req.token);
      const session = await layBuoiHoc(sessionId, req.token);
      if (session.classId !== lop.id)
        throw new LoiHttp(400, 'Buổi học không thuộc lớp này');
      const banThan = lop.myStudent;

      const trung = await db.query(
        `SELECT id FROM attendance.absence_requests WHERE session_id=$1 AND student_email=lower($2) AND status <> 'rejected'`,
        [session.id, req.user.email],
      );
      if (trung[0]) throw new LoiHttp(409, 'Bạn đã gửi đơn cho buổi này rồi');

      const rows = await db.query(
        `INSERT INTO attendance.absence_requests (class_id, session_id, session_no, student_email, student_code, student_name, reason)
       VALUES ($1,$2,$3,lower($4),$5,$6,$7) RETURNING *`,
        [
          lop.id,
          session.id,
          session.sessionNo,
          req.user.email,
          banThan.student_code,
          banThan.full_name,
          String(reason).trim(),
        ],
      );
      for (const tep of files) {
        await db.query(
          'INSERT INTO attendance.request_files (request_id, filename, mime, size, data) VALUES ($1,$2,$3,$4,$5)',
          [
            rows[0].id,
            Buffer.from(tep.originalname, 'latin1').toString('utf8').slice(0, 120),
            tep.mimetype,
            tep.size,
            tep.buffer,
          ],
        );
      }
      res.status(201).json((await chuyenDonKemAnh(rows))[0]);
    },
  );

  // Giảng viên: xem đơn của một lớp. Sinh viên: xem đơn của chính mình.
  dinhTuyen.get('/requests', batBuocDangNhap, async (req, res) => {
    if (req.user.role === 'teacher') {
      const lop = await layLop(req.query.classId, req.token);
      if (!lop.isOwner) throw new LoiHttp(403, 'Chỉ giảng viên của lớp được xem');
      const rows = await db.query(
        `SELECT * FROM attendance.absence_requests WHERE class_id=$1
         ORDER BY (status='pending') DESC, created_at DESC`,
        [lop.id],
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
  dinhTuyen.put('/requests/:id', batBuocDangNhap, batBuocVaiTro('teacher'), async (req, res) => {
    const { status, teacherNote } = req.body || {};
    if (!['approved', 'rejected'].includes(status))
      throw new LoiHttp(400, 'status phải là approved hoặc rejected');
    const found = await db.query(
      'SELECT * FROM attendance.absence_requests WHERE id=$1',
      [Number(req.params.id)],
    );
    const don = found[0];
    if (!don) throw new LoiHttp(404, 'Không tìm thấy đơn');
    const lop = await layLop(don.class_id, req.token);
    if (!lop.isOwner) throw new LoiHttp(403, 'Chỉ giảng viên của lớp được duyệt');

    const rows = await db.query(
      `UPDATE attendance.absence_requests SET status=$1, teacher_note=$2, reviewed_at=now() WHERE id=$3 RETURNING *`,
      [status, teacherNote || null, don.id],
    );
    if (status === 'approved') {
      await luuBanGhi({
        sessionId: don.session_id,
        classId: don.class_id,
        email: don.student_email,
        code: don.student_code,
        name: don.student_name,
        status: 'excused',
        source: 'request',
        note: `Đơn xin vắng: ${don.reason}`,
      });
    }
    res.json((await chuyenDonKemAnh(rows))[0]);
  });

  // Xem ảnh minh chứng: giảng viên của lớp hoặc chính sinh viên gửi đơn
  dinhTuyen.get('/requests/:id/files/:fileId', batBuocDangNhap, async (req, res) => {
    const found = await db.query(
      'SELECT * FROM attendance.absence_requests WHERE id=$1',
      [Number(req.params.id)],
    );
    const don = found[0];
    if (!don) throw new LoiHttp(404, 'Không tìm thấy đơn');
    if (req.user.role === 'teacher') {
      const lop = await layLop(don.class_id, req.token);
      if (!lop.isOwner) throw new LoiHttp(403, 'Không có quyền xem');
    } else if (don.student_email !== req.user.email.toLowerCase()) {
      throw new LoiHttp(403, 'Không có quyền xem');
    }
    const rows = await db.query(
      'SELECT mime, data FROM attendance.request_files WHERE id=$1 AND request_id=$2',
      [Number(req.params.fileId), don.id],
    );
    if (!rows[0]) throw new LoiHttp(404, 'Không tìm thấy ảnh');
    res.setHeader('Content-Type', rows[0].mime);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(Buffer.from(rows[0].data));
  });

  // ---------- Email cảnh báo vắng nhiều ----------
  dinhTuyen.post(
    '/warnings/send',
    batBuocDangNhap,
    batBuocVaiTro('teacher'),
    async (req, res) => {
      const lop = await layLop(req.body?.classId, req.token);
      if (!lop.isOwner)
        throw new LoiHttp(403, 'Chỉ giảng viên của lớp được gửi cảnh báo');

      // Hỏi service thống kê danh sách sinh viên có nguy cơ
      const risk = await goiDichVu(DIA_CHI_THONG_KE, `/classes/${lop.id}/risk`, {
        token: req.token,
      });
      const labels = {
        warning: 'cần chú ý',
        danger: 'sắp bị cấm thi',
        banned: 'đã vượt giới hạn vắng (có thể bị cấm thi)',
      };

      const results = [];
      for (const sinhVien of risk.students) {
        const subject = `[${lop.code}] Cảnh báo vắng học - ${labels[sinhVien.level]}`;
        const html = `
        <p>Chào ${sinhVien.fullName},</p>
        <p>Theo ghi nhận điểm danh môn <b>${lop.name}</b> (${lop.code}), bạn đã vắng không phép
        <b>${sinhVien.absent}</b> buổi / ${risk.closedSessions} buổi đã học. Giới hạn cho phép của lớp là <b>${risk.absentLimit}</b> buổi.</p>
        <p>Tình trạng hiện tại: <b>${labels[sinhVien.level]}</b>.</p>
        <p>Nếu có lý do chính đáng, bạn hãy gửi đơn xin vắng trên hệ thống hoặc liên hệ giảng viên.</p>
        <p>Trân trọng,<br/>${lop.teacher_name}</p>`;
        const mail = await guiMail({ to: sinhVien.email, subject, html });
        await db.query(
          `INSERT INTO attendance.notifications (class_id, student_email, student_name, subject, status, detail) VALUES ($1,lower($2),$3,$4,$5,$6)`,
          [lop.id, sinhVien.email, sinhVien.fullName, subject, mail.status, mail.detail],
        );
        results.push({
          email: sinhVien.email,
          fullName: sinhVien.fullName,
          level: sinhVien.level,
          status: mail.status,
          detail: mail.detail,
        });
      }
      res.json({ mailConfigured: coMail, count: results.length, results });
    },
  );

  dinhTuyen.get('/notifications', batBuocDangNhap, batBuocVaiTro('teacher'), async (req, res) => {
    const lop = await layLop(req.query.classId, req.token);
    if (!lop.isOwner) throw new LoiHttp(403, 'Chỉ giảng viên của lớp được xem');
    const rows = await db.query(
      'SELECT * FROM attendance.notifications WHERE class_id=$1 ORDER BY created_at DESC LIMIT 100',
      [lop.id],
    );
    res.json(
      rows.map((thongBao) => ({
        id: thongBao.id,
        studentEmail: thongBao.student_email,
        studentName: thongBao.student_name,
        subject: thongBao.subject,
        status: thongBao.status,
        detail: thongBao.detail,
        createdAt: thongBao.created_at,
      })),
    );
  });

  return dinhTuyen;
}

// ============ Lưu nhiều thay đổi sửa tay cùng lúc ============

// Lưu nhiều thay đổi điểm danh sửa tay cùng lúc.
// Giảng viên sửa nhiều ô (ở trang điểm danh của buổi hoặc trong chi tiết sinh viên) rồi bấm "Lưu" một lần:
// kiểm tra TOÀN BỘ trước khi ghi, hoặc lưu hết hoặc không lưu gì (một câu lệnh SQL duy nhất).

const TOI_DA_THAY_DOI = 6000;

export function taoApiLuuThayDoi(db) {
  const dinhTuyen = Router();

  // Lấy dữ liệu hiện tại của lớp (đồng thời kiểm tra quyền giảng viên)
  async function taiDuLieuLop(classId, token) {
    const lop = await goiDichVu(DIA_CHI_TAI_KHOAN, `/classes/${classId}`, { token });
    if (!lop.isOwner) throw new LoiHttp(403, 'Chỉ giảng viên của lớp được thực hiện');
    const [students, sessions] = await Promise.all([
      goiDichVu(DIA_CHI_TAI_KHOAN, `/classes/${lop.id}/students`, { token }),
      goiDichVu(DIA_CHI_BUOI_HOC, `/sessions?classId=${lop.id}`, { token }),
    ]);
    const records = await db.query(
      'SELECT session_id, student_email, status FROM attendance.records WHERE class_id=$1',
      [lop.id],
    );
    const current = new Map(
      records.map((banGhi) => [`${banGhi.session_id}|${banGhi.student_email}`, banGhi.status]),
    );
    return { cls: lop, students, sessions, current };
  }

  // Body: { changes: [{ sessionId, email, status }] }
  dinhTuyen.post(
    '/classes/:classId/changes',
    batBuocDangNhap,
    batBuocVaiTro('teacher'),
    async (req, res) => {
      const list = req.body?.changes;
      if (!Array.isArray(list) || list.length === 0)
        throw new LoiHttp(400, 'Không có thay đổi nào để lưu');
      if (list.length > TOI_DA_THAY_DOI)
        throw new LoiHttp(400, `Quá nhiều thay đổi một lần (tối đa ${TOI_DA_THAY_DOI})`);

      const { cls: lop, students, sessions, current } = await taiDuLieuLop(
        req.params.classId,
        req.token,
      );
      const sessionIds = new Set(sessions.map((buoi) => buoi.id));
      const byEmail = new Map(students.map((sinhVien) => [sinhVien.email.toLowerCase(), sinhVien]));

      // Kiểm tra toàn bộ trước khi ghi: một thay đổi sai là từ chối cả lô
      const wanted = new Map(); // "sessionId|email" -> status (thay đổi sau ghi đè thay đổi trước)
      for (const [chiSo, thayDoi] of list.entries()) {
        const email = String(thayDoi?.email || '').toLowerCase();
        if (!sessionIds.has(Number(thayDoi?.sessionId)))
          throw new LoiHttp(400, `Thay đổi #${chiSo + 1}: buổi học không thuộc lớp này`);
        if (!byEmail.has(email))
          throw new LoiHttp(400, `Thay đổi #${chiSo + 1}: sinh viên không thuộc lớp này`);
        if (!CAC_TRANG_THAI.includes(thayDoi?.status))
          throw new LoiHttp(
            400,
            `Thay đổi #${chiSo + 1}: trạng thái phải là present, late, excused hoặc absent`,
          );
        wanted.set(`${Number(thayDoi.sessionId)}|${email}`, thayDoi.status);
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
          const [maBuoi, email] = key.split('|');
          const sinhVien = byEmail.get(email);
          const base = params.length;
          params.push(Number(maBuoi), lop.id, email, sinhVien.student_code, sinhVien.full_name, status);
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
      res.json({
        ok: true,
        applied: diffs.length,
        unchanged: wanted.size - diffs.length,
      });
    },
  );

  return dinhTuyen;
}
