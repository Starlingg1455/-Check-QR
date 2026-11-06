import { Router } from 'express';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { requireAuth, requireRole } from './auth.js';
import { HttpError, callService } from './http.js';

const ACCOUNT_URL = process.env.ACCOUNT_URL || 'http://localhost:4001';
const SERVER_SECRET = process.env.QR_SECRET || 'dev-qr-secret-chi-dung-khi-phat-trien';
// Mã QR đổi mỗi 30 giây
const QR_TTL = 30;

// Mã QR = "<mã buổi>.<khung thời gian 30s>.<chữ ký>". Chữ ký dùng HMAC nên không thể đoán/giả mạo.
const slotOf = (ms = Date.now()) => Math.floor(ms / 1000 / QR_TTL);
const sign = (sessionId, slot, secret) =>
  createHmac('sha256', SERVER_SECRET + secret).update(`${sessionId}.${slot}`).digest('base64url').slice(0, 16);

const publicSession = ({ qr_secret, ...rest }) => ({
  id: rest.id,
  classId: rest.class_id,
  sessionNo: rest.session_no,
  title: rest.title,
  status: rest.status,
  openedAt: rest.opened_at,
  closedAt: rest.closed_at,
});

export function createRoutes(db) {
  const r = Router();

  // Kiểm tra quyền với lớp thông qua account-class (API, không truy vấn chéo DB)
  const getClass = (classId, token) => callService(ACCOUNT_URL, `/classes/${classId}`, { token });

  async function findSession(id) {
    const rows = await db.query('SELECT * FROM session_qr.sessions WHERE id=$1', [Number(id)]);
    if (!rows[0]) throw new HttpError(404, 'Không tìm thấy buổi học');
    return rows[0];
  }

  // Giảng viên mở một buổi điểm danh mới
  r.post('/sessions', requireAuth, requireRole('teacher'), async (req, res) => {
    const { classId, title, openedAt } = req.body || {};
    const cls = await getClass(classId, req.token);
    if (!cls.isOwner) throw new HttpError(403, 'Chỉ giảng viên của lớp được mở buổi');

    const open = await db.query(`SELECT id FROM session_qr.sessions WHERE class_id=$1 AND status='open'`, [cls.id]);
    if (open[0]) throw new HttpError(409, 'Lớp đang có một buổi điểm danh chưa đóng. Hãy đóng buổi đó trước.');

    const [{ last }] = await db.query('SELECT COALESCE(MAX(session_no), 0)::int AS last FROM session_qr.sessions WHERE class_id=$1', [cls.id]);
    const sessionNo = last + 1;
    const when = openedAt ? new Date(openedAt) : new Date();
    if (Number.isNaN(when.getTime())) throw new HttpError(400, 'openedAt không hợp lệ');

    const rows = await db.query(
      `INSERT INTO session_qr.sessions (class_id, session_no, title, qr_secret, opened_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [cls.id, sessionNo, String(title || '').trim() || `Buổi ${sessionNo}`, randomBytes(16).toString('hex'), when, req.user.id],
    );
    res.status(201).json(publicSession(rows[0]));
  });

  // Danh sách buổi học của một lớp (giảng viên hoặc sinh viên của lớp)
  r.get('/sessions', requireAuth, async (req, res) => {
    const cls = await getClass(req.query.classId, req.token);
    const rows = await db.query('SELECT * FROM session_qr.sessions WHERE class_id=$1 ORDER BY session_no', [cls.id]);
    res.json(rows.map(publicSession));
  });

  // Mã QR hiện tại của buổi đang mở (giảng viên gọi mỗi vài giây để làm mới)
  // Đặt trước '/sessions/:id' không cần thiết vì khác đường dẫn, nhưng để cho dễ đọc
  r.get('/sessions/:id/qr', requireAuth, requireRole('teacher'), async (req, res) => {
    const s = await findSession(req.params.id);
    const cls = await getClass(s.class_id, req.token);
    if (!cls.isOwner) throw new HttpError(403, 'Chỉ giảng viên của lớp được xem mã QR');
    if (s.status !== 'open') throw new HttpError(409, 'Buổi học đã đóng');
    const slot = slotOf();
    res.json({
      token: `${s.id}.${slot}.${sign(s.id, slot, s.qr_secret)}`,
      ttl: QR_TTL,
      expiresAt: (slot + 1) * QR_TTL * 1000, // mili-giây
      serverTime: Date.now(),
    });
  });

  r.get('/sessions/:id', requireAuth, async (req, res) => {
    const s = await findSession(req.params.id);
    await getClass(s.class_id, req.token); // kiểm tra quyền xem
    res.json(publicSession(s));
  });

  r.post('/sessions/:id/close', requireAuth, requireRole('teacher'), async (req, res) => {
    const s = await findSession(req.params.id);
    const cls = await getClass(s.class_id, req.token);
    if (!cls.isOwner) throw new HttpError(403, 'Chỉ giảng viên của lớp được đóng buổi');
    if (s.status === 'closed') return res.json(publicSession(s));
    const rows = await db.query(`UPDATE session_qr.sessions SET status='closed', closed_at=now() WHERE id=$1 RETURNING *`, [s.id]);
    res.json(publicSession(rows[0]));
  });

  r.delete('/sessions/:id', requireAuth, requireRole('teacher'), async (req, res) => {
    const s = await findSession(req.params.id);
    const cls = await getClass(s.class_id, req.token);
    if (!cls.isOwner) throw new HttpError(403, 'Chỉ giảng viên của lớp được xoá buổi');
    await db.query('DELETE FROM session_qr.sessions WHERE id=$1', [s.id]);
    res.status(204).end();
  });

  // Service điểm danh gọi để kiểm tra mã QR mà sinh viên quét
  r.post('/sessions/verify', requireAuth, async (req, res) => {
    const parts = String(req.body?.token || '').split('.');
    if (parts.length !== 3 || !/^\d+$/.test(parts[0]) || !/^\d+$/.test(parts[1])) {
      throw new HttpError(400, 'Mã QR không hợp lệ');
    }
    const [sid, slotStr, sig] = parts;
    const rows = await db.query('SELECT * FROM session_qr.sessions WHERE id=$1', [Number(sid)]);
    const s = rows[0];
    if (!s) throw new HttpError(400, 'Mã QR không hợp lệ');

    const expected = Buffer.from(sign(s.id, Number(slotStr), s.qr_secret));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw new HttpError(400, 'Mã QR không hợp lệ');
    if (s.status !== 'open') throw new HttpError(410, 'Buổi điểm danh đã đóng');

    // Chấp nhận khung hiện tại và khung liền trước (bù độ trễ mạng/quét), tức tối đa ~60 giây
    const now = slotOf();
    if (Number(slotStr) !== now && Number(slotStr) !== now - 1) {
      throw new HttpError(410, 'Mã QR đã hết hạn, hãy quét lại mã đang hiển thị');
    }
    res.json({ valid: true, ...publicSession(s) });
  });

  return r;
}
