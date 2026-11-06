import { Router } from 'express';
import { requireAuth, requireRole } from './auth.js';
import { HttpError, callService } from './http.js';
import { sendMail, mailEnabled } from './mailer.js';

const ACCOUNT_URL = process.env.ACCOUNT_URL || 'http://localhost:4001';
const SESSION_URL = process.env.SESSION_URL || 'http://localhost:4002';
const STATISTICS_URL = process.env.STATISTICS_URL || 'http://localhost:4004';
const LATE_MINUTES = Number(process.env.LATE_MINUTES || 15);

const STATUSES = ['present', 'late', 'excused', 'absent'];

const mapRecord = (r) => ({
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

const mapRequest = (q) => ({
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

export function createRoutes(db) {
  const r = Router();

  const getClass = (classId, token) => callService(ACCOUNT_URL, `/classes/${classId}`, { token });
  const getSession = (id, token) => callService(SESSION_URL, `/sessions/${id}`, { token });

  // Lấy buổi học và bắt buộc người gọi là giảng viên của lớp đó
  async function ownedSession(sessionId, token) {
    const session = await getSession(sessionId, token);
    const cls = await getClass(session.classId, token);
    if (!cls.isOwner) throw new HttpError(403, 'Chỉ giảng viên của lớp được thực hiện');
    return { session, cls };
  }

  // Ghi/đè một bản ghi điểm danh
  function upsertRecord({ sessionId, classId, email, code, name, status, source, note }) {
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
  r.post('/scan', requireAuth, requireRole('student'), async (req, res) => {
    const token = String(req.body?.token || '').trim();
    if (!token) throw new HttpError(400, 'Thiếu mã QR');

    // 1) Hỏi service buổi học xem mã QR có hợp lệ không
    const session = await callService(SESSION_URL, '/sessions/verify', { token: req.token, method: 'POST', body: { token } });
    // 2) Hỏi service lớp học xem sinh viên có thuộc lớp không
    const cls = await getClass(session.classId, req.token);
    if (!cls.myStudent) throw new HttpError(403, 'Bạn không thuộc lớp này');
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
    const status = minutesSinceOpen > LATE_MINUTES ? 'late' : 'present';
    const [rec] = await upsertRecord({
      sessionId: session.id, classId: cls.id, email: req.user.email,
      code: me.student_code, name: me.full_name, status, source: 'qr',
    });
    res.json({ ...base, alreadyCheckedIn: false, status, checkedAt: rec.checked_at });
  });

  // ---------- Giảng viên xem/sửa điểm danh của một buổi ----------
  r.get('/sessions/:sessionId/roster', requireAuth, requireRole('teacher'), async (req, res) => {
    const { session, cls } = await ownedSession(req.params.sessionId, req.token);
    const students = await callService(ACCOUNT_URL, `/classes/${cls.id}/students`, { token: req.token });
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
    res.json({ session, summary, roster });
  });

  // Giảng viên sửa tay trạng thái: có mặt / đi trễ / có phép / vắng
  r.put('/sessions/:sessionId/students/:email', requireAuth, requireRole('teacher'), async (req, res) => {
    const { session, cls } = await ownedSession(req.params.sessionId, req.token);
    const { status, note } = req.body || {};
    if (!STATUSES.includes(status)) throw new HttpError(400, `Trạng thái phải là một trong: ${STATUSES.join(', ')}`);
    const students = await callService(ACCOUNT_URL, `/classes/${cls.id}/students`, { token: req.token });
    const email = decodeURIComponent(req.params.email).toLowerCase();
    const stu = students.find((s) => s.email.toLowerCase() === email);
    if (!stu) throw new HttpError(404, 'Sinh viên không thuộc lớp này');
    const [rec] = await upsertRecord({
      sessionId: session.id, classId: cls.id, email, code: stu.student_code, name: stu.full_name,
      status, source: 'manual', note,
    });
    res.json(mapRecord(rec));
  });

  // Toàn bộ bản ghi của lớp (service thống kê gọi)
  r.get('/classes/:classId/records', requireAuth, requireRole('teacher'), async (req, res) => {
    const cls = await getClass(req.params.classId, req.token);
    if (!cls.isOwner) throw new HttpError(403, 'Chỉ giảng viên của lớp được xem');
    const rows = await db.query('SELECT * FROM attendance.records WHERE class_id=$1', [cls.id]);
    res.json(rows.map(mapRecord));
  });

  // ---------- Sinh viên xem lịch sử điểm danh của mình trong một lớp ----------
  r.get('/classes/:classId/me', requireAuth, requireRole('student'), async (req, res) => {
    const cls = await getClass(req.params.classId, req.token);
    const sessions = await callService(SESSION_URL, `/sessions?classId=${cls.id}`, { token: req.token });
    const records = await db.query(
      'SELECT * FROM attendance.records WHERE class_id=$1 AND student_email=lower($2)',
      [cls.id, req.user.email],
    );
    const requests = await db.query(
      'SELECT * FROM attendance.absence_requests WHERE class_id=$1 AND student_email=lower($2)',
      [cls.id, req.user.email],
    );
    const byId = new Map(records.map((x) => [x.session_id, x]));
    const reqBySession = new Map(requests.map((x) => [x.session_id, x]));

    const history = sessions.map((s) => {
      const rec = byId.get(s.id);
      return {
        sessionId: s.id, sessionNo: s.sessionNo, title: s.title, status: s.status, openedAt: s.openedAt,
        // Buổi còn đang mở mà chưa điểm danh thì chưa tính là vắng
        attendance: rec ? rec.status : s.status === 'open' ? 'pending' : 'absent',
        checkedAt: rec ? rec.checked_at : null,
        request: reqBySession.has(s.id) ? mapRequest(reqBySession.get(s.id)) : null,
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
  r.post('/requests', requireAuth, requireRole('student'), async (req, res) => {
    const { classId, sessionId, reason } = req.body || {};
    if (!String(reason || '').trim()) throw new HttpError(400, 'Vui lòng nhập lý do');
    const cls = await getClass(classId, req.token);
    const session = await getSession(sessionId, req.token);
    if (session.classId !== cls.id) throw new HttpError(400, 'Buổi học không thuộc lớp này');
    const me = cls.myStudent;

    const dup = await db.query(
      `SELECT id FROM attendance.absence_requests WHERE session_id=$1 AND student_email=lower($2) AND status <> 'rejected'`,
      [session.id, req.user.email],
    );
    if (dup[0]) throw new HttpError(409, 'Bạn đã gửi đơn cho buổi này rồi');

    const rows = await db.query(
      `INSERT INTO attendance.absence_requests (class_id, session_id, session_no, student_email, student_code, student_name, reason)
       VALUES ($1,$2,$3,lower($4),$5,$6,$7) RETURNING *`,
      [cls.id, session.id, session.sessionNo, req.user.email, me.student_code, me.full_name, String(reason).trim()],
    );
    res.status(201).json(mapRequest(rows[0]));
  });

  // Giảng viên: xem đơn của một lớp. Sinh viên: xem đơn của chính mình.
  r.get('/requests', requireAuth, async (req, res) => {
    if (req.user.role === 'teacher') {
      const cls = await getClass(req.query.classId, req.token);
      if (!cls.isOwner) throw new HttpError(403, 'Chỉ giảng viên của lớp được xem');
      const rows = await db.query(
        `SELECT * FROM attendance.absence_requests WHERE class_id=$1
         ORDER BY (status='pending') DESC, created_at DESC`,
        [cls.id],
      );
      return res.json(rows.map(mapRequest));
    }
    const rows = await db.query(
      'SELECT * FROM attendance.absence_requests WHERE student_email=lower($1) ORDER BY created_at DESC',
      [req.user.email],
    );
    res.json(rows.map(mapRequest));
  });

  // Giảng viên duyệt/từ chối. Duyệt => buổi đó chuyển thành "vắng có phép"
  r.put('/requests/:id', requireAuth, requireRole('teacher'), async (req, res) => {
    const { status, teacherNote } = req.body || {};
    if (!['approved', 'rejected'].includes(status)) throw new HttpError(400, 'status phải là approved hoặc rejected');
    const found = await db.query('SELECT * FROM attendance.absence_requests WHERE id=$1', [Number(req.params.id)]);
    const q = found[0];
    if (!q) throw new HttpError(404, 'Không tìm thấy đơn');
    const cls = await getClass(q.class_id, req.token);
    if (!cls.isOwner) throw new HttpError(403, 'Chỉ giảng viên của lớp được duyệt');

    const rows = await db.query(
      `UPDATE attendance.absence_requests SET status=$1, teacher_note=$2, reviewed_at=now() WHERE id=$3 RETURNING *`,
      [status, teacherNote || null, q.id],
    );
    if (status === 'approved') {
      await upsertRecord({
        sessionId: q.session_id, classId: q.class_id, email: q.student_email, code: q.student_code, name: q.student_name,
        status: 'excused', source: 'request', note: `Đơn xin vắng: ${q.reason}`,
      });
    }
    res.json(mapRequest(rows[0]));
  });

  // ---------- Email cảnh báo vắng nhiều ----------
  r.post('/warnings/send', requireAuth, requireRole('teacher'), async (req, res) => {
    const cls = await getClass(req.body?.classId, req.token);
    if (!cls.isOwner) throw new HttpError(403, 'Chỉ giảng viên của lớp được gửi cảnh báo');

    // Hỏi service thống kê danh sách sinh viên có nguy cơ
    const risk = await callService(STATISTICS_URL, `/classes/${cls.id}/risk`, { token: req.token });
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
      const mail = await sendMail({ to: s.email, subject, html });
      await db.query(
        `INSERT INTO attendance.notifications (class_id, student_email, student_name, subject, status, detail) VALUES ($1,lower($2),$3,$4,$5,$6)`,
        [cls.id, s.email, s.fullName, subject, mail.status, mail.detail],
      );
      results.push({ email: s.email, fullName: s.fullName, level: s.level, status: mail.status, detail: mail.detail });
    }
    res.json({ mailConfigured: mailEnabled, count: results.length, results });
  });

  r.get('/notifications', requireAuth, requireRole('teacher'), async (req, res) => {
    const cls = await getClass(req.query.classId, req.token);
    if (!cls.isOwner) throw new HttpError(403, 'Chỉ giảng viên của lớp được xem');
    const rows = await db.query('SELECT * FROM attendance.notifications WHERE class_id=$1 ORDER BY created_at DESC LIMIT 100', [cls.id]);
    res.json(rows.map((n) => ({
      id: n.id, studentEmail: n.student_email, studentName: n.student_name, subject: n.subject,
      status: n.status, detail: n.detail, createdAt: n.created_at,
    })));
  });

  return r;
}
