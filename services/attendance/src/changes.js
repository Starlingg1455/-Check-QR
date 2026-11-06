// Lưu nhiều thay đổi điểm danh sửa tay cùng lúc.
// Giảng viên sửa nhiều ô (ở trang điểm danh của buổi hoặc trong chi tiết sinh viên) rồi bấm "Lưu" một lần:
// kiểm tra TOÀN BỘ trước khi ghi, hoặc lưu hết hoặc không lưu gì (một câu lệnh SQL duy nhất).
import { Router } from 'express';
import { requireAuth, requireRole } from './auth.js';
import { HttpError, callService } from './http.js';

const ACCOUNT_URL = process.env.ACCOUNT_URL || 'http://localhost:4001';
const SESSION_URL = process.env.SESSION_URL || 'http://localhost:4002';

const STATUSES = ['present', 'late', 'excused', 'absent'];
const MAX_CHANGES = 6000;

export function createChangesRoutes(db) {
  const r = Router();

  // Lấy dữ liệu hiện tại của lớp (đồng thời kiểm tra quyền giảng viên)
  async function load(classId, token) {
    const cls = await callService(ACCOUNT_URL, `/classes/${classId}`, { token });
    if (!cls.isOwner) throw new HttpError(403, 'Chỉ giảng viên của lớp được thực hiện');
    const [students, sessions] = await Promise.all([
      callService(ACCOUNT_URL, `/classes/${cls.id}/students`, { token }),
      callService(SESSION_URL, `/sessions?classId=${cls.id}`, { token }),
    ]);
    const records = await db.query('SELECT session_id, student_email, status FROM attendance.records WHERE class_id=$1', [cls.id]);
    const current = new Map(records.map((x) => [`${x.session_id}|${x.student_email}`, x.status]));
    return { cls, students, sessions, current };
  }

  // Body: { changes: [{ sessionId, email, status }] }
  r.post('/classes/:classId/changes', requireAuth, requireRole('teacher'), async (req, res) => {
    const list = req.body?.changes;
    if (!Array.isArray(list) || list.length === 0) throw new HttpError(400, 'Không có thay đổi nào để lưu');
    if (list.length > MAX_CHANGES) throw new HttpError(400, `Quá nhiều thay đổi một lần (tối đa ${MAX_CHANGES})`);

    const { cls, students, sessions, current } = await load(req.params.classId, req.token);
    const sessionIds = new Set(sessions.map((s) => s.id));
    const byEmail = new Map(students.map((s) => [s.email.toLowerCase(), s]));

    // Kiểm tra toàn bộ trước khi ghi: một thay đổi sai là từ chối cả lô
    const wanted = new Map(); // "sessionId|email" -> status (thay đổi sau ghi đè thay đổi trước)
    for (const [i, c] of list.entries()) {
      const email = String(c?.email || '').toLowerCase();
      if (!sessionIds.has(Number(c?.sessionId))) throw new HttpError(400, `Thay đổi #${i + 1}: buổi học không thuộc lớp này`);
      if (!byEmail.has(email)) throw new HttpError(400, `Thay đổi #${i + 1}: sinh viên không thuộc lớp này`);
      if (!STATUSES.includes(c?.status)) throw new HttpError(400, `Thay đổi #${i + 1}: trạng thái phải là present, late, excused hoặc absent`);
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
