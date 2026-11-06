// Tính toán thống kê điểm danh từ dữ liệu lấy qua API
import { callService } from './http.js';

const ACCOUNT_URL = process.env.ACCOUNT_URL || 'http://localhost:4001';
const SESSION_URL = process.env.SESSION_URL || 'http://localhost:4002';
const ATTENDANCE_URL = process.env.ATTENDANCE_URL || 'http://localhost:4003';

const round1 = (n) => Math.round(n * 10) / 10;

// Quy tắc cấm thi: số buổi vắng KHÔNG phép tối đa = tổng số buổi x tỉ lệ vắng cho phép.
// Đi trễ tính là có mặt, vắng có phép không tính vào số buổi vắng.
//   vắng > giới hạn  => banned  (vượt giới hạn, có thể bị cấm thi)
//   vắng = giới hạn  => danger  (sắp cấm thi: vắng thêm 1 buổi là bị cấm)
//   vắng = giới hạn-1 => warning (cần chú ý)
export function levelOf(absent, limit) {
  if (absent > limit) return 'banned';
  if (absent === limit && limit > 0) return 'danger';
  if (limit > 0 && absent === limit - 1 && absent > 0) return 'warning';
  return 'ok';
}

export async function computeClassStats(classId, token) {
  const cls = await callService(ACCOUNT_URL, `/classes/${classId}`, { token });
  if (!cls.isOwner) {
    const err = new Error('Chỉ giảng viên của lớp được xem thống kê');
    err.status = 403;
    throw err;
  }
  const [students, sessions, records] = await Promise.all([
    callService(ACCOUNT_URL, `/classes/${classId}/students`, { token }),
    callService(SESSION_URL, `/sessions?classId=${classId}`, { token }),
    callService(ATTENDANCE_URL, `/classes/${classId}/records`, { token }),
  ]);

  // Chỉ tính các buổi đã đóng (buổi đang mở chưa chốt nên chưa tính vắng)
  const closed = sessions.filter((s) => s.status === 'closed');
  const absentLimit = Math.floor((cls.total_sessions * cls.max_absent_percent) / 100);

  // Tra nhanh: "sessionId|email" -> trạng thái
  const statusOf = new Map(records.map((r) => [`${r.sessionId}|${r.studentEmail}`, r.status]));
  const getStatus = (sessionId, email) => statusOf.get(`${sessionId}|${email.toLowerCase()}`) || 'absent';

  // --- Theo sinh viên ---
  const perStudent = students.map((s) => {
    const c = { present: 0, late: 0, excused: 0, absent: 0 };
    for (const sess of closed) c[getStatus(sess.id, s.email)]++;
    return {
      studentCode: s.student_code,
      fullName: s.full_name,
      email: s.email,
      ...c,
      rate: closed.length ? round1(((c.present + c.late) / closed.length) * 100) : null,
      level: levelOf(c.absent, absentLimit),
    };
  });

  // --- Theo buổi ---
  const perSession = closed.map((sess) => {
    const c = { present: 0, late: 0, excused: 0, absent: 0 };
    for (const s of students) c[getStatus(sess.id, s.email)]++;
    return {
      sessionId: sess.id,
      sessionNo: sess.sessionNo,
      title: sess.title,
      date: sess.openedAt,
      ...c,
      rate: students.length ? round1(((c.present + c.late) / students.length) * 100) : null,
    };
  });

  // --- Tổng quan ---
  const totalSlots = students.length * closed.length;
  const sum = (key) => perStudent.reduce((a, s) => a + s[key], 0);
  const overall = {
    present: sum('present'), late: sum('late'), excused: sum('excused'), absent: sum('absent'),
  };
  const avgRate = totalSlots ? round1(((overall.present + overall.late) / totalSlots) * 100) : null;
  const levels = { ok: 0, warning: 0, danger: 0, banned: 0 };
  perStudent.forEach((s) => { levels[s.level]++; });

  return {
    class: { id: cls.id, code: cls.code, name: cls.name, totalSessions: cls.total_sessions, maxAbsentPercent: cls.max_absent_percent, teacherName: cls.teacher_name },
    studentCount: students.length,
    closedSessions: closed.length,
    openSessions: sessions.length - closed.length,
    absentLimit,
    avgRate,
    overall,
    levels,
    perSession,
    perStudent,
  };
}
