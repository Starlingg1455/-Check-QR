// Nhập bảng điểm danh mẫu của trường (file .xlsx) vào hệ thống qua API Gateway.
//
//   node scripts/nhapLopTruong.mjs <file.xlsx> [--start=YYYY-MM-DD] [--time=HH:MM] [--room=M-M7.03]
//        [--teacher=gv@demo.vn] [--teacher-name="Họ tên"] [--semester="HK1 2025-2026"] [--all]
//
// Cấu trúc file được nhận diện tự động:
//   - Dòng tiêu đề "BẢNG ĐIỂM DANH ... HỌC PHẦN <tên> - LỚP <mã>"   => tên môn + mã lớp
//   - Dòng header có "Mã SV", "Họ và tên", "Lớp", các cột T1..Tn, "Ghi chú"
//   - Mỗi tiêu đề T<n> là MỘT buổi (T1 = Buổi 1, T2 = Buổi 2...). Ô gộp trải nhiều cột (vd T2 rộng 2 cột) vẫn chỉ là một buổi:
//     chỉ đọc cột đầu của ô gộp, các cột còn lại là bản lặp (thư viện đọc file lặp lại giá trị của ô gộp)
//   - Ô trống = có mặt, X = vắng, P = có phép, M = đi muộn   (suy ra từ cách ghi trong file mẫu)
//   - Mặc định chỉ tạo các buổi đến cột cuối cùng có ghi dấu; dùng --all để tạo tất cả các cột
//
// Lưu ý: file mẫu không có email và không có ngày, nên email được tạo dạng <MSSV>@sv.local và
// ngày học tính từ --start (ngày của Buổi 1) và --time (giờ bắt đầu), mỗi buổi cách nhau một tuần.
// File chứa dữ liệu cá nhân thật: để trong thư mục du-lieu-truong/ (đã nằm trong .gitignore), đừng commit.
import ExcelJS from 'exceljs';

const DIA_CHI_API = process.env.API_URL || 'http://localhost:4000/api';
const args = process.argv.slice(2);
const file = args.find((doiSo) => !doiSo.startsWith('--'));
const tuyChon = (name, macDinh) =>
  args.find((doiSo) => doiSo.startsWith(`--${name}=`))?.split('=')[1] ?? macDinh;
if (!file) {
  console.error(
    'Cách dùng: node scripts/nhapLopTruong.mjs <file.xlsx> [--start=YYYY-MM-DD] [--all]',
  );
  process.exit(1);
}

// ---- Quy ước mã trong ô của file mẫu ----
const MA_SANG_TRANG_THAI = { '': 'present', X: 'absent', P: 'excused', M: 'late' };
const NGAY_BAT_DAU = new Date(
  `${tuyChon('start', '2025-09-08')}T${tuyChon('time', '07:30')}:00`,
); // ngày + giờ của Buổi 1
const PHONG = tuyChon('room', '');
const TEN_GIANG_VIEN = tuyChon('teacher-name', '');
const HOC_KY = tuyChon('semester', '');
const TAT_CA = args.includes('--all');
const GIANG_VIEN = tuyChon('teacher', 'gv@demo.vn');

const docOText = (cell) => {
  let giaTri = cell.value;
  if (giaTri && typeof giaTri === 'object')
    giaTri = giaTri.result ?? giaTri.text ?? (giaTri.richText ? giaTri.richText.map((manh) => manh.text).join('') : '');
  return giaTri === null || giaTri === undefined ? '' : String(giaTri).replace(/\s+/g, ' ').trim();
};
const vietHoaChuDau = (chuoi) => chuoi.charAt(0).toUpperCase() + chuoi.slice(1).toLowerCase();

// ===================== 1) Đọc file =====================
const sach = new ExcelJS.Workbook();
await sach.xlsx.readFile(file);
const trang = sach.worksheets[0];
if (!trang) throw new Error('File không có sheet nào');

// tiêu đề: tên môn + mã lớp
let title = '';
for (let hang = 1; hang <= 8 && !title; hang++)
  for (let cot = 1; cot <= trang.columnCount; cot++)
    if (/BẢNG ĐIỂM DANH/i.test(docOText(trang.getCell(hang, cot)))) {
      title = docOText(trang.getCell(hang, cot));
      break;
    }
const khop = title.match(/HỌC PHẦN\s+(.+?)\s*-\s*LỚP\s+(.+)$/i);
const batch = (title.match(/ĐỢT\s*(\d+)/i) || [])[1];
const courseName = khop ? vietHoaChuDau(khop[1]) : 'Học phần chưa rõ tên';
const classCode = khop ? khop[2].trim() : 'LOP-NHAP';

// dòng header
let headerRow = 0;
for (let hang = 1; hang <= 15 && !headerRow; hang++)
  for (let cot = 1; cot <= trang.columnCount; cot++)
    if (/^Mã SV$/i.test(docOText(trang.getCell(hang, cot)))) {
      headerRow = hang;
      break;
    }
if (!headerRow) throw new Error('Không tìm thấy dòng tiêu đề cột (cần có cột "Mã SV")');
const colOf = {};
for (let cot = 1; cot <= trang.columnCount; cot++) {
  const tieuDe = docOText(trang.getCell(headerRow, cot));
  if (/^Mã SV$/i.test(tieuDe)) colOf.code ??= cot;
  else if (/^Họ và tên$/i.test(tieuDe)) colOf.name ??= cot;
  else if (/^Lớp$/i.test(tieuDe)) colOf.klass ??= cot;
  else if (/^Ghi chú$/i.test(tieuDe)) colOf.note ??= cot;
}
if (!colOf.code || !colOf.name) throw new Error('Thiếu cột "Mã SV" hoặc "Họ và tên"');

// các cột buổi: từ sau cột "Lớp" đến trước "Ghi chú", tiêu đề dạng T<số>. Mỗi tiêu đề là MỘT buổi.
// Tiêu đề/ô gộp trải nhiều cột (vd T2): chỉ giữ cột đầu, bỏ các cột phụ (cùng một ô, chỉ là bản lặp).
const sessionCols = [];
for (
  let cot = (colOf.klass || colOf.name) + 1;
  cot < (colOf.note || trang.columnCount + 1);
  cot++
) {
  const cell = trang.getCell(headerRow, cot);
  const khopBuoi = docOText(cell).match(/^T\s*(\d+)$/i);
  if (!khopBuoi) continue;
  const master = cell.master?.address || cell.address;
  if (master !== cell.address) continue; // cột phụ của ô gộp
  sessionCols.push({ col: cot, week: Number(khopBuoi[1]) });
}

// sinh viên: các dòng có Mã SV là số
const students = [];
for (let hang = headerRow + 1; hang <= trang.rowCount; hang++) {
  const code = docOText(trang.getCell(hang, colOf.code));
  if (!/^\d{5,}$/.test(code)) continue;
  const marks = sessionCols.map((cotBuoi) => docOText(trang.getCell(hang, cotBuoi.col)).toUpperCase());
  students.push({
    row: hang,
    code,
    name: docOText(trang.getCell(hang, colOf.name)),
    klass: colOf.klass ? docOText(trang.getCell(hang, colOf.klass)) : '',
    marks,
  });
}
if (students.length === 0) throw new Error('Không có sinh viên nào trong file');

// kiểm tra dữ liệu trước khi nhập
const problems = [];
const trung = new Set();
const seen = new Set();
for (const sinhVien of students) {
  if (seen.has(sinhVien.code)) trung.add(sinhVien.code);
  seen.add(sinhVien.code);
  if (!sinhVien.name) problems.push(`Dòng ${sinhVien.row}: thiếu họ tên`);
}
if (trung.size) problems.push(`MSSV bị lặp: ${[...trung].join(', ')}`);
const unknown = new Set();
for (const sinhVien of students)
  for (const danhDau of sinhVien.marks) if (!Object.hasOwn(MA_SANG_TRANG_THAI, danhDau)) unknown.add(danhDau);
if (unknown.size)
  problems.push(
    `Có mã lạ trong ô điểm danh: ${[...unknown].map((ma) => `"${ma}"`).join(', ')} (chỉ nhận X, P, M hoặc trống)`,
  );
if (problems.length) {
  console.error('File chưa hợp lệ:\n - ' + problems.join('\n - '));
  process.exit(1);
}

// buổi đã diễn ra: đến cột cuối cùng có dấu (hoặc tất cả nếu --all)
let lastIdx = -1;
sessionCols.forEach((cotBuoi, chiSo) => {
  if (students.some((sinhVien) => sinhVien.marks[chiSo] !== '')) lastIdx = chiSo;
});
const held = TAT_CA ? sessionCols : sessionCols.slice(0, lastIdx + 1);

console.log(`Môn: ${courseName} | Lớp: ${classCode}${batch ? ` | Đợt ${batch}` : ''}`);
console.log(
  `Sinh viên: ${students.length} | Số buổi trong file (T1..): ${sessionCols.length} | Buổi sẽ tạo: ${held.length}`,
);

// ===================== 2) Nhập qua API =====================
async function goiApi(path, { token, method = 'GET', body, form } = {}) {
  const res = await fetch(DIA_CHI_API + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: form || (body ? JSON.stringify(body) : undefined),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${data?.error}`);
  return data;
}

const login = await goiApi('/account/auth/dev-login', {
  method: 'POST',
  body: {
    email: GIANG_VIEN,
    role: 'teacher',
    ...(TEN_GIANG_VIEN ? { name: TEN_GIANG_VIEN } : {}),
  },
});
const T = login.token;

const existing = await goiApi('/account/classes', { token: T });
if (existing.some((lopCu) => lopCu.code === classCode)) {
  console.error(
    `Lớp "${classCode}" đã có trong hệ thống. Xoá lớp đó (hoặc xoá thư mục dữ liệu ~/.diem-danh-qr) rồi chạy lại để tránh nhập trùng.`,
  );
  process.exit(1);
}

const lop = await goiApi('/account/classes', {
  token: T,
  method: 'POST',
  body: {
    code: classCode,
    name: courseName,
    room: PHONG || undefined,
    semester: HOC_KY || (batch ? `Đợt ${batch}` : ''),
    totalSessions: sessionCols.length,
    maxAbsentPercent: 20,
  },
});

// sinh viên: thêm từng người qua API (hệ thống không còn chức năng nhập Excel)
for (const sinhVien of students) {
  await goiApi(`/account/classes/${lop.id}/students`, {
    token: T,
    method: 'POST',
    body: { studentCode: sinhVien.code, fullName: sinhVien.name, email: `${sinhVien.code}@sv.local` },
  });
}

// buổi học: mỗi cột một buổi, đóng ngay sau khi tạo (hệ thống chỉ cho 1 buổi mở)
const sessionIds = [];
for (const [chiSo, buoi] of held.entries()) {
  const when = new Date(NGAY_BAT_DAU.getTime() + (buoi.week - 1) * 7 * 86400000);
  const label = `Buổi ${buoi.week}`; // T1 = Buổi 1, T2 = Buổi 2...
  const ses = await goiApi('/sessions/sessions', {
    token: T,
    method: 'POST',
    body: { classId: lop.id, title: label, openedAt: when.toISOString() },
  });
  await goiApi(`/sessions/sessions/${ses.id}/close`, { token: T, method: 'POST' });
  sessionIds.push(ses.id);
}

// điểm danh: lưu một lần bằng API lưu theo lô (ô trống = có mặt cũng được ghi rõ vì hệ thống coi "chưa có bản ghi" là vắng)
const changes = [];
students.forEach((sinhVien) =>
  held.forEach((_, chiSo) => {
    changes.push({
      sessionId: sessionIds[chiSo],
      email: `${sinhVien.code}@sv.local`,
      status: MA_SANG_TRANG_THAI[sinhVien.marks[sessionCols.indexOf(held[chiSo])]],
    });
  }),
);
const saved = await goiApi(`/attendance/classes/${lop.id}/changes`, {
  token: T,
  method: 'POST',
  body: { changes },
});

// ===================== 3) Tổng kết (không in tên sinh viên) =====================
const tally = { present: 0, late: 0, excused: 0, absent: 0 };
changes.forEach((thayDoi) => {
  tally[thayDoi.status]++;
});
const stats = await goiApi(`/statistics/classes/${lop.id}/overview`, { token: T });
console.log(
  `\nĐã nhập lớp #${lop.id}: ${students.length} sinh viên, ${held.length} buổi, ${changes.length} ô điểm danh (đã ghi ${saved.applied} bản ghi).`,
);
console.log(
  `Có mặt ${tally.present} · Đi muộn ${tally.late} · Có phép ${tally.excused} · Vắng ${tally.absent}`,
);
console.log(
  `Tỉ lệ đi học trung bình: ${stats.avgRate}% | Giới hạn vắng: ${stats.absentLimit} buổi | Mức cảnh báo: ${JSON.stringify(stats.levels)}`,
);
console.log(
  `\nĐăng nhập giảng viên: ${GIANG_VIEN}. Sinh viên đăng nhập bằng email <MSSV>@sv.local.`,
);
