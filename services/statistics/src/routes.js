import { Router } from 'express';
import ExcelJS from 'exceljs';
import { requireAuth, requireRole } from './auth.js';
import { callService } from './http.js';
import { computeClassStats } from './compute.js';

const ACCOUNT_URL = process.env.ACCOUNT_URL || 'http://localhost:4001';
const LEVEL_TEXT = { ok: 'Bình thường', warning: 'Cần chú ý', danger: 'Sắp cấm thi', banned: 'Vượt giới hạn' };
// Cùng quy ước mã với file điểm danh Excel: x = có mặt, m = muộn, p = có phép, v = vắng
const CODE = { present: 'x', late: 'm', excused: 'p', absent: 'v' };

export function createRoutes() {
  const r = Router();
  const teacherOnly = [requireAuth, requireRole('teacher')];

  // Số liệu đầy đủ của một lớp (dashboard)
  r.get('/classes/:id/overview', ...teacherOnly, async (req, res) => {
    res.json(await computeClassStats(req.params.id, req.token));
  });

  // Danh sách sinh viên sắp bị cấm thi (cũng được service điểm danh dùng để gửi email)
  r.get('/classes/:id/risk', ...teacherOnly, async (req, res) => {
    const s = await computeClassStats(req.params.id, req.token);
    const order = { banned: 0, danger: 1, warning: 2 };
    const students = s.perStudent
      .filter((x) => x.level !== 'ok')
      .sort((a, b) => order[a.level] - order[b.level] || b.absent - a.absent)
      .map((x) => ({ studentCode: x.studentCode, fullName: x.fullName, email: x.email, absent: x.absent, rate: x.rate, level: x.level }));
    res.json({ closedSessions: s.closedSessions, absentLimit: s.absentLimit, students });
  });

  // Tổng quan tất cả lớp của giảng viên (trang chủ)
  r.get('/overview', ...teacherOnly, async (req, res) => {
    const classes = await callService(ACCOUNT_URL, '/classes', { token: req.token });
    const items = await Promise.all(
      classes.map(async (c) => {
        try {
          const s = await computeClassStats(c.id, req.token);
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
    const s = await computeClassStats(req.params.id, req.token);
    const records = await callService(process.env.ATTENDANCE_URL || 'http://localhost:4003', `/classes/${s.class.id}/records`, { token: req.token });
    const sessions = await callService(process.env.SESSION_URL || 'http://localhost:4002', `/sessions?classId=${s.class.id}`, { token: req.token });
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
      const row = w2.addRow({ ...st, rate: st.rate ?? '', levelText: LEVEL_TEXT[st.level] });
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
      const cells = closed.map((c) => CODE[statusOf.get(`${c.id}|${st.email.toLowerCase()}`) || 'absent']);
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
