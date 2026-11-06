// API REST của dịch vụ "Thống kê": các đường dẫn (GET/POST/PUT/DELETE) và xử lý nghiệp vụ.
// Tài liệu Swagger của các đường dẫn này nằm ở taiLieuApi.js.

import ExcelJS from 'exceljs';
import { Router } from 'express';
import { goiDichVu, batBuocDangNhap, batBuocVaiTro } from './tienIch.js';

// ============ Tính toán thống kê ============

// Tính toán thống kê điểm danh từ dữ liệu lấy qua API

const DIA_CHI_TAI_KHOAN = process.env.ACCOUNT_URL || 'http://localhost:4001';
const DIA_CHI_BUOI_HOC = process.env.SESSION_URL || 'http://localhost:4002';
const DIA_CHI_DIEM_DANH = process.env.ATTENDANCE_URL || 'http://localhost:4003';

const lamTron1 = (so) => Math.round(so * 10) / 10;

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
  const lop = await goiDichVu(DIA_CHI_TAI_KHOAN, `/classes/${classId}`, { token });
  if (!lop.isOwner) {
    const loi = new Error('Chỉ giảng viên của lớp được xem thống kê');
    loi.status = 403;
    throw loi;
  }
  const [students, sessions, records] = await Promise.all([
    goiDichVu(DIA_CHI_TAI_KHOAN, `/classes/${classId}/students`, { token }),
    goiDichVu(DIA_CHI_BUOI_HOC, `/sessions?classId=${classId}`, { token }),
    goiDichVu(DIA_CHI_DIEM_DANH, `/classes/${classId}/records`, { token }),
  ]);

  // Chỉ tính các buổi đã đóng (buổi đang mở chưa chốt nên chưa tính vắng)
  const closed = sessions.filter((buoi) => buoi.status === 'closed');
  const absentLimit = Math.floor((lop.total_sessions * lop.max_absent_percent) / 100);

  // Tra nhanh: "sessionId|email" -> trạng thái
  const statusOf = new Map(
    records.map((banGhi) => [`${banGhi.sessionId}|${banGhi.studentEmail}`, banGhi.status]),
  );
  const layTrangThai = (sessionId, email) =>
    statusOf.get(`${sessionId}|${email.toLowerCase()}`) || 'absent';

  // --- Theo sinh viên ---
  const perStudent = students.map((sinhVien) => {
    const soLuong = { present: 0, late: 0, excused: 0, absent: 0 };
    for (const sess of closed) soLuong[layTrangThai(sess.id, sinhVien.email)]++;
    return {
      studentCode: sinhVien.student_code,
      fullName: sinhVien.full_name,
      email: sinhVien.email,
      ...soLuong,
      rate: closed.length ? lamTron1(((soLuong.present + soLuong.late) / closed.length) * 100) : null,
      level: xepMucCanhBao(soLuong.absent, absentLimit),
    };
  });

  // --- Theo buổi ---
  const perSession = closed.map((sess) => {
    const soLuong = { present: 0, late: 0, excused: 0, absent: 0 };
    // Danh sách ai ở trạng thái nào trong buổi này (để bấm vào biểu đồ xem chi tiết)
    const lists = { present: [], late: [], excused: [], absent: [] };
    for (const sinhVien of students) {
      const status = layTrangThai(sess.id, sinhVien.email);
      soLuong[status]++;
      lists[status].push({ studentCode: sinhVien.student_code, fullName: sinhVien.full_name });
    }
    return {
      sessionId: sess.id,
      sessionNo: sess.sessionNo,
      title: sess.title,
      date: sess.openedAt,
      ...soLuong,
      lists,
      rate: students.length
        ? lamTron1(((soLuong.present + soLuong.late) / students.length) * 100)
        : null,
    };
  });

  // --- Tổng quan ---
  const totalSlots = students.length * closed.length;
  const tinhTong = (key) => perStudent.reduce((tong, sinhVien) => tong + sinhVien[key], 0);
  const overall = {
    present: tinhTong('present'),
    late: tinhTong('late'),
    excused: tinhTong('excused'),
    absent: tinhTong('absent'),
  };
  const avgRate = totalSlots
    ? lamTron1(((overall.present + overall.late) / totalSlots) * 100)
    : null;
  const levels = { ok: 0, warning: 0, danger: 0, banned: 0 };
  perStudent.forEach((sinhVien) => {
    levels[sinhVien.level]++;
  });

  return {
    class: {
      id: lop.id,
      code: lop.code,
      name: lop.name,
      totalSessions: lop.total_sessions,
      maxAbsentPercent: lop.max_absent_percent,
      teacherName: lop.teacher_name,
    },
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

const TEN_MUC_CANH_BAO = {
  ok: 'Bình thường',
  warning: 'Cần chú ý',
  danger: 'Sắp cấm thi',
  banned: 'Vượt giới hạn',
};
// Cùng quy ước mã với file điểm danh Excel: x = có mặt, m = muộn, p = có phép, v = vắng
const KY_HIEU_TRANG_THAI = { present: 'x', late: 'm', excused: 'p', absent: 'v' };

export function taoApi() {
  const dinhTuyen = Router();
  const teacherOnly = [batBuocDangNhap, batBuocVaiTro('teacher')];

  // Số liệu đầy đủ của một lớp (dashboard)
  dinhTuyen.get('/classes/:id/overview', ...teacherOnly, async (req, res) => {
    res.json(await tinhThongKeLop(req.params.id, req.token));
  });

  // Danh sách sinh viên sắp bị cấm thi (cũng được service điểm danh dùng để gửi email)
  dinhTuyen.get('/classes/:id/risk', ...teacherOnly, async (req, res) => {
    const thongKe = await tinhThongKeLop(req.params.id, req.token);
    const order = { banned: 0, danger: 1, warning: 2 };
    const students = thongKe.perStudent
      .filter((sinhVien) => sinhVien.level !== 'ok')
      .sort((a, b) => order[a.level] - order[b.level] || b.absent - a.absent)
      .map((sinhVien) => ({
        studentCode: sinhVien.studentCode,
        fullName: sinhVien.fullName,
        email: sinhVien.email,
        absent: sinhVien.absent,
        rate: sinhVien.rate,
        level: sinhVien.level,
      }));
    res.json({ closedSessions: thongKe.closedSessions, absentLimit: thongKe.absentLimit, students });
  });

  // Tổng quan tất cả lớp của giảng viên (trang chủ)
  dinhTuyen.get('/overview', ...teacherOnly, async (req, res) => {
    const classes = await goiDichVu(DIA_CHI_TAI_KHOAN, '/classes', { token: req.token });
    const items = await Promise.all(
      classes.map(async (lop) => {
        try {
          const thongKe = await tinhThongKeLop(lop.id, req.token);
          return {
            classId: lop.id,
            code: lop.code,
            name: lop.name,
            studentCount: thongKe.studentCount,
            closedSessions: thongKe.closedSessions,
            avgRate: thongKe.avgRate,
            atRisk: thongKe.levels.warning + thongKe.levels.danger + thongKe.levels.banned,
            banned: thongKe.levels.banned,
          };
        } catch {
          return {
            classId: lop.id,
            code: lop.code,
            name: lop.name,
            studentCount: lop.student_count,
            closedSessions: 0,
            avgRate: null,
            atRisk: 0,
            banned: 0,
          };
        }
      }),
    );
    const rated = items.filter((muc) => muc.avgRate !== null);
    res.json({
      classCount: items.length,
      studentCount: items.reduce((tong, muc) => tong + muc.studentCount, 0),
      sessionCount: items.reduce((tong, muc) => tong + muc.closedSessions, 0),
      atRisk: items.reduce((tong, muc) => tong + muc.atRisk, 0),
      avgRate: rated.length
        ? Math.round((rated.reduce((tong, muc) => tong + muc.avgRate, 0) / rated.length) * 10) / 10
        : null,
      classes: items,
    });
  });

  // Xuất Excel: tổng quan + theo sinh viên + theo buổi + ma trận điểm danh
  dinhTuyen.get('/classes/:id/export.xlsx', ...teacherOnly, async (req, res) => {
    const thongKe = await tinhThongKeLop(req.params.id, req.token);
    const records = await goiDichVu(
      process.env.ATTENDANCE_URL || 'http://localhost:4003',
      `/classes/${thongKe.class.id}/records`,
      { token: req.token },
    );
    const sessions = await goiDichVu(
      process.env.SESSION_URL || 'http://localhost:4002',
      `/sessions?classId=${thongKe.class.id}`,
      { token: req.token },
    );
    const closed = sessions.filter((buoi) => buoi.status === 'closed');
    const statusOf = new Map(
      records.map((banGhi) => [`${banGhi.sessionId}|${banGhi.studentEmail}`, banGhi.status]),
    );

    const sach = new ExcelJS.Workbook();
    sach.creator = 'Hệ thống điểm danh QR';
    const header = (trang) => {
      const dong = trang.getRow(1);
      dong.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      dong.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
      dong.alignment = { vertical: 'middle' };
      trang.views = [{ state: 'frozen', ySplit: 1 }];
    };

    // Sheet 1: tổng quan
    const trangTongQuan = sach.addWorksheet('Tổng quan');
    trangTongQuan.columns = [{ width: 32 }, { width: 28 }];
    trangTongQuan.addRows([
      ['Lớp', `${thongKe.class.code} - ${thongKe.class.name}`],
      ['Giảng viên', thongKe.class.teacherName],
      ['Số sinh viên', thongKe.studentCount],
      ['Số buổi đã học', thongKe.closedSessions],
      ['Tỉ lệ đi học trung bình (%)', thongKe.avgRate ?? ''],
      ['Số buổi vắng tối đa cho phép', thongKe.absentLimit],
      ['Sinh viên cần chú ý', thongKe.levels.warning],
      ['Sinh viên sắp cấm thi', thongKe.levels.danger],
      ['Sinh viên vượt giới hạn', thongKe.levels.banned],
    ]);
    trangTongQuan.getColumn(1).font = { bold: true };

    // Sheet 2: theo sinh viên
    const trangSinhVien = sach.addWorksheet('Theo sinh viên');
    trangSinhVien.columns = [
      { header: 'MSSV', key: 'studentCode', width: 14 },
      { header: 'Họ tên', key: 'fullName', width: 28 },
      { header: 'Email', key: 'email', width: 32 },
      { header: 'Có mặt', key: 'present', width: 9 },
      { header: 'Đi trễ', key: 'late', width: 9 },
      { header: 'Vắng có phép', key: 'excused', width: 13 },
      { header: 'Vắng', key: 'absent', width: 9 },
      { header: 'Tỉ lệ đi học (%)', key: 'rate', width: 16 },
      { header: 'Tình trạng', key: 'levelText', width: 16 },
    ];
    header(trangSinhVien);
    const levelFill = { warning: 'FFFEF3C7', danger: 'FFFFEDD5', banned: 'FFFEE2E2' };
    thongKe.perStudent.forEach((sinhVien) => {
      const dong = trangSinhVien.addRow({
        ...sinhVien,
        rate: sinhVien.rate ?? '',
        levelText: TEN_MUC_CANH_BAO[sinhVien.level],
      });
      if (levelFill[sinhVien.level])
        dong.eachCell((oBang) => {
          oBang.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: levelFill[sinhVien.level] },
          };
        });
    });

    // Sheet 3: theo buổi
    const trangBuoi = sach.addWorksheet('Theo buổi');
    trangBuoi.columns = [
      { header: 'Buổi', key: 'sessionNo', width: 8 },
      { header: 'Tiêu đề', key: 'title', width: 24 },
      { header: 'Ngày', key: 'date', width: 18 },
      { header: 'Có mặt', key: 'present', width: 9 },
      { header: 'Đi trễ', key: 'late', width: 9 },
      { header: 'Vắng có phép', key: 'excused', width: 13 },
      { header: 'Vắng', key: 'absent', width: 9 },
      { header: 'Tỉ lệ đi học (%)', key: 'rate', width: 16 },
    ];
    header(trangBuoi);
    thongKe.perSession.forEach((buoi) =>
      trangBuoi.addRow({ ...buoi, date: new Date(buoi.date), rate: buoi.rate ?? '' }),
    );
    trangBuoi.getColumn('date').numFmt = 'dd/mm/yyyy hh:mm';

    // Sheet 4: ma trận (P = có mặt, T = trễ, V* = vắng có phép, V = vắng)
    const trangMaTran = sach.addWorksheet('Ma trận điểm danh');
    trangMaTran.columns = [
      { header: 'MSSV', width: 14 },
      { header: 'Họ tên', width: 28 },
      ...closed.map((buoi) => ({ header: `B${buoi.sessionNo}`, width: 6 })),
      { header: 'Tổng vắng', width: 11 },
    ];
    header(trangMaTran);
    const fills = { x: 'FFDCFCE7', m: 'FFFEF3C7', p: 'FFDBEAFE', v: 'FFFEE2E2' };
    thongKe.perStudent.forEach((sinhVien) => {
      const cells = closed.map(
        (buoi) =>
          KY_HIEU_TRANG_THAI[
            statusOf.get(`${buoi.id}|${sinhVien.email.toLowerCase()}`) || 'absent'
          ],
      );
      const dong = trangMaTran.addRow([sinhVien.studentCode, sinhVien.fullName, ...cells, sinhVien.absent]);
      cells.forEach((giaTri, chiSo) => {
        const cell = dong.getCell(3 + chiSo);
        cell.alignment = { horizontal: 'center' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fills[giaTri] } };
      });
    });
    trangMaTran.addRow([]);
    trangMaTran.addRow(['Chú thích: x = có mặt, m = muộn, p = có phép, v = vắng']);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="thong-ke-${encodeURIComponent(thongKe.class.code)}.xlsx"`,
    );
    await sach.xlsx.write(res);
    res.end();
  });

  return dinhTuyen;
}
