// API REST của dịch vụ "Thống kê": các đường dẫn (GET/POST/PUT/DELETE) và xử lý nghiệp vụ.
// Tài liệu Swagger của các đường dẫn này nằm ở tai-lieu-api.js.

import ExcelJS from 'exceljs';
import { Router } from 'express';
import { goiDichVu, batBuocDangNhap, batBuocVaiTro } from './tien-ich.js';

// ============ Tính toán thống kê ============

// Tính toán thống kê điểm danh từ dữ liệu lấy qua API

const DIA_CHI_TAI_KHOAN = process.env.ACCOUNT_URL || 'http://localhost:4001';
const DIA_CHI_BUOI_HOC = process.env.SESSION_URL || 'http://localhost:4002';
const DIA_CHI_DIEM_DANH = process.env.ATTENDANCE_URL || 'http://localhost:4003';

const lamTron1 = (n) => Math.round(n * 10) / 10;

// Quy tắc cấm thi: số buổi vắng KHÔNG phép tối đa = tổng số buổi x tỉ lệ vắng cho phép.
// Đi trễ tính là có mặt, vắng có phép không tính vào số buổi vắng.
//   vắng > giới hạn  => banned  (vượt giới hạn, có thể bị cấm thi)
//   vắng = giới hạn  => danger  (sắp cấm thi: vắng thêm 1 buổi là bị cấm)
//   vắng = giới hạn-1 => warning (cần chú ý)
export function xepMucCanhBao(absent, limit) {
  if (absent > limit) return 'banned';
  if (absent === limit && limit > 0) return 'danger';
  if (limit > 0 && absent === limit - 1 && absent > 0) return 'warning';
  return 'ok';
}

export async function tinhThongKeLop(classId, token) {
  const cls = await goiDichVu(DIA_CHI_TAI_KHOAN, `/classes/${classId}`, { token });
  if (!cls.isOwner) {
    const err = new Error('Chỉ giảng viên của lớp được xem thống kê');
    err.status = 403;
    throw err;
  }
  const [students, sessions, records] = await Promise.all([
    goiDichVu(DIA_CHI_TAI_KHOAN, `/classes/${classId}/students`, { token }),
    goiDichVu(DIA_CHI_BUOI_HOC, `/sessions?classId=${classId}`, { token }),
    goiDichVu(DIA_CHI_DIEM_DANH, `/classes/${classId}/records`, { token }),
  ]);

  // Chỉ tính các buổi đã đóng (buổi đang mở chưa chốt nên chưa tính vắng)
  const closed = sessions.filter((s) => s.status === 'closed');
  const absentLimit = Math.floor((cls.total_sessions * cls.max_absent_percent) / 100);

  // Tra nhanh: "sessionId|email" -> trạng thái
  const statusOf = new Map(records.map((r) => [`${r.sessionId}|${r.studentEmail}`, r.status]));
  const layTrangThai = (sessionId, email) => statusOf.get(`${sessionId}|${email.toLowerCase()}`) || 'absent';

  // --- Theo sinh viên ---
  const perStudent = students.map((s) => {
    const c = { present: 0, late: 0, excused: 0, absent: 0 };
    for (const sess of closed) c[layTrangThai(sess.id, s.email)]++;
    return {
      studentCode: s.student_code,
      fullName: s.full_name,
      email: s.email,
      ...c,
      rate: closed.length ? lamTron1(((c.present + c.late) / closed.length) * 100) : null,
      level: xepMucCanhBao(c.absent, absentLimit),
    };
  });

  // --- Theo buổi ---
  const perSession = closed.map((sess) => {
    const c = { present: 0, late: 0, excused: 0, absent: 0 };
    // Danh sách ai ở trạng thái nào trong buổi này (để bấm vào biểu đồ xem chi tiết)
    const lists = { present: [], late: [], excused: [], absent: [] };
    for (const s of students) {
      const status = layTrangThai(sess.id, s.email);
      c[status]++;
      lists[status].push({ studentCode: s.student_code, fullName: s.full_name });
    }
    return {
      sessionId: sess.id,
      sessionNo: sess.sessionNo,
      title: sess.title,
      date: sess.openedAt,
      ...c,
      lists,
      rate: students.length ? lamTron1(((c.present + c.late) / students.length) * 100) : null,
    };
  });

  // --- Tổng quan ---
  const totalSlots = students.length * closed.length;
  const sum = (key) => perStudent.reduce((a, s) => a + s[key], 0);
  const overall = {
    present: sum('present'), late: sum('late'), excused: sum('excused'), absent: sum('absent'),
  };
  const avgRate = totalSlots ? lamTron1(((overall.present + overall.late) / totalSlots) * 100) : null;
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

// ============ Các đường dẫn REST ============

const TEN_MUC_CANH_BAO = { ok: 'Bình thường', warning: 'Cần chú ý', danger: 'Sắp cấm thi', banned: 'Vượt giới hạn' };
// Cùng quy ước mã với file điểm danh Excel: x = có mặt, m = muộn, p = có phép, v = vắng
const KY_HIEU_TRANG_THAI = { present: 'x', late: 'm', excused: 'p', absent: 'v' };

export function taoApi() {
  const r = Router();
  const teacherOnly = [batBuocDangNhap, batBuocVaiTro('teacher')];

  // Số liệu đầy đủ của một lớp (dashboard)
  r.get('/classes/:id/overview', ...teacherOnly, async (req, res) => {
    res.json(await tinhThongKeLop(req.params.id, req.token));
  });

  // Danh sách sinh viên sắp bị cấm thi (cũng được service điểm danh dùng để gửi email)
  r.get('/classes/:id/risk', ...teacherOnly, async (req, res) => {
    const s = await tinhThongKeLop(req.params.id, req.token);
    const order = { banned: 0, danger: 1, warning: 2 };
    const students = s.perStudent
      .filter((x) => x.level !== 'ok')
      .sort((a, b) => order[a.level] - order[b.level] || b.absent - a.absent)
      .map((x) => ({ studentCode: x.studentCode, fullName: x.fullName, email: x.email, absent: x.absent, rate: x.rate, level: x.level }));
    res.json({ closedSessions: s.closedSessions, absentLimit: s.absentLimit, students });
  });

  // Tổng quan tất cả lớp của giảng viên (trang chủ)
  r.get('/overview', ...teacherOnly, async (req, res) => {
    const classes = await goiDichVu(DIA_CHI_TAI_KHOAN, '/classes', { token: req.token });
    const items = await Promise.all(
      classes.map(async (c) => {
        try {
          const s = await tinhThongKeLop(c.id, req.token);
          return {
            classId: c.id, code: c.code, name: c.name, studentCount: s.studentCount, closedSessions: s.closedSessions,
            avgRate: s.avgRate, atRisk: s.levels.warning + s.levels.danger + s.levels.banned, banned: s.levels.banned,
          };
        } catch {
          return { classId: c.id, code: c.code, name: c.name, studentCount: c.student_count, closedSessions: 0, avgRate: null, atRisk: 0, banned: 0 };
        }
      }),
    );
    const rated = items.filter((i) => i.avgRate !== null);
    res.json({
      classCount: items.length,
      studentCount: items.reduce((a, i) => a + i.studentCount, 0),
      sessionCount: items.reduce((a, i) => a + i.closedSessions, 0),
      atRisk: items.reduce((a, i) => a + i.atRisk, 0),
      avgRate: rated.length ? Math.round((rated.reduce((a, i) => a + i.avgRate, 0) / rated.length) * 10) / 10 : null,
      classes: items,
    });
  });

  // Xuất Excel: tổng quan + theo sinh viên + theo buổi + ma trận điểm danh
  r.get('/classes/:id/export.xlsx', ...teacherOnly, async (req, res) => {
    const s = await tinhThongKeLop(req.params.id, req.token);
    const records = await goiDichVu(process.env.ATTENDANCE_URL || 'http://localhost:4003', `/classes/${s.class.id}/records`, { token: req.token });
    const sessions = await goiDichVu(process.env.SESSION_URL || 'http://localhost:4002', `/sessions?classId=${s.class.id}`, { token: req.token });
    const closed = sessions.filter((x) => x.status === 'closed');
    const statusOf = new Map(records.map((x) => [`${x.sessionId}|${x.studentEmail}`, x.status]));

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Hệ thống điểm danh QR';
    const header = (ws) => {
      const row = ws.getRow(1);
      row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
      row.alignment = { vertical: 'middle' };
      ws.views = [{ state: 'frozen', ySplit: 1 }];
    };

    // Sheet 1: tổng quan
    const w1 = wb.addWorksheet('Tổng quan');
    w1.columns = [{ width: 32 }, { width: 28 }];
    w1.addRows([
      ['Lớp', `${s.class.code} - ${s.class.name}`],
      ['Giảng viên', s.class.teacherName],
      ['Số sinh viên', s.studentCount],
      ['Số buổi đã học', s.closedSessions],
      ['Tỉ lệ đi học trung bình (%)', s.avgRate ?? ''],
      ['Số buổi vắng tối đa cho phép', s.absentLimit],
      ['Sinh viên cần chú ý', s.levels.warning],
      ['Sinh viên sắp cấm thi', s.levels.danger],
      ['Sinh viên vượt giới hạn', s.levels.banned],
    ]);
    w1.getColumn(1).font = { bold: true };

    // Sheet 2: theo sinh viên
    const w2 = wb.addWorksheet('Theo sinh viên');
    w2.columns = [
      { header: 'MSSV', key: 'studentCode', width: 14 }, { header: 'Họ tên', key: 'fullName', width: 28 },
      { header: 'Email', key: 'email', width: 32 }, { header: 'Có mặt', key: 'present', width: 9 },
      { header: 'Đi trễ', key: 'late', width: 9 }, { header: 'Vắng có phép', key: 'excused', width: 13 },
      { header: 'Vắng', key: 'absent', width: 9 }, { header: 'Tỉ lệ đi học (%)', key: 'rate', width: 16 },
      { header: 'Tình trạng', key: 'levelText', width: 16 },
    ];
    header(w2);
    const levelFill = { warning: 'FFFEF3C7', danger: 'FFFFEDD5', banned: 'FFFEE2E2' };
    s.perStudent.forEach((st) => {
      const row = w2.addRow({ ...st, rate: st.rate ?? '', levelText: TEN_MUC_CANH_BAO[st.level] });
      if (levelFill[st.level]) row.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: levelFill[st.level] } }; });
    });

    // Sheet 3: theo buổi
    const w3 = wb.addWorksheet('Theo buổi');
    w3.columns = [
      { header: 'Buổi', key: 'sessionNo', width: 8 }, { header: 'Tiêu đề', key: 'title', width: 24 },
      { header: 'Ngày', key: 'date', width: 18 }, { header: 'Có mặt', key: 'present', width: 9 },
      { header: 'Đi trễ', key: 'late', width: 9 }, { header: 'Vắng có phép', key: 'excused', width: 13 },
      { header: 'Vắng', key: 'absent', width: 9 }, { header: 'Tỉ lệ đi học (%)', key: 'rate', width: 16 },
    ];
    header(w3);
    s.perSession.forEach((x) => w3.addRow({ ...x, date: new Date(x.date), rate: x.rate ?? '' }));
    w3.getColumn('date').numFmt = 'dd/mm/yyyy hh:mm';

    // Sheet 4: ma trận (P = có mặt, T = trễ, V* = vắng có phép, V = vắng)
    const w4 = wb.addWorksheet('Ma trận điểm danh');
    w4.columns = [
      { header: 'MSSV', width: 14 }, { header: 'Họ tên', width: 28 },
      ...closed.map((c) => ({ header: `B${c.sessionNo}`, width: 6 })),
      { header: 'Tổng vắng', width: 11 },
    ];
    header(w4);
    const fills = { x: 'FFDCFCE7', m: 'FFFEF3C7', p: 'FFDBEAFE', v: 'FFFEE2E2' };
    s.perStudent.forEach((st) => {
      const cells = closed.map((c) => KY_HIEU_TRANG_THAI[statusOf.get(`${c.id}|${st.email.toLowerCase()}`) || 'absent']);
      const row = w4.addRow([st.studentCode, st.fullName, ...cells, st.absent]);
      cells.forEach((v, i) => {
        const cell = row.getCell(3 + i);
        cell.alignment = { horizontal: 'center' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fills[v] } };
      });
    });
    w4.addRow([]);
    w4.addRow(['Chú thích: x = có mặt, m = muộn, p = có phép, v = vắng']);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="thong-ke-${encodeURIComponent(s.class.code)}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  });

  return r;
}
