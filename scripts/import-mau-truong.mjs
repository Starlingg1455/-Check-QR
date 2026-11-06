// Nhập bảng điểm danh mẫu của trường (file .xlsx) vào hệ thống qua API Gateway.
//
//   node scripts/import-mau-truong.mjs <file.xlsx> [--start=YYYY-MM-DD] [--time=HH:MM] [--room=M-M7.03]
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

const API = process.env.API_URL || 'http://localhost:4000/api';
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const opt = (name, def) => (args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]) ?? def;
if (!file) { console.error('Cách dùng: node scripts/import-mau-truong.mjs <file.xlsx> [--start=YYYY-MM-DD] [--all]'); process.exit(1); }

// ---- Quy ước mã trong ô của file mẫu ----
const CODE_TO_STATUS = { '': 'present', X: 'absent', P: 'excused', M: 'late' };
const START = new Date(`${opt('start', '2025-09-08')}T${opt('time', '07:30')}:00`); // ngày + giờ của Buổi 1
const ROOM = opt('room', '');
const TEACHER_NAME = opt('teacher-name', '');
const SEMESTER = opt('semester', '');
const ALL = args.includes('--all');
const TEACHER = opt('teacher', 'gv@demo.vn');

const text = (cell) => {
  let v = cell.value;
  if (v && typeof v === 'object') v = v.result ?? v.text ?? (v.richText ? v.richText.map((x) => x.text).join('') : '');
  return v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim();
};
const sentenceCase = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

// ===================== 1) Đọc file =====================
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);
const ws = wb.worksheets[0];
if (!ws) throw new Error('File không có sheet nào');

// tiêu đề: tên môn + mã lớp
let title = '';
for (let r = 1; r <= 8 && !title; r++) for (let c = 1; c <= ws.columnCount; c++) if (/BẢNG ĐIỂM DANH/i.test(text(ws.getCell(r, c)))) { title = text(ws.getCell(r, c)); break; }
const m = title.match(/HỌC PHẦN\s+(.+?)\s*-\s*LỚP\s+(.+)$/i);
const batch = (title.match(/ĐỢT\s*(\d+)/i) || [])[1];
const courseName = m ? sentenceCase(m[1]) : 'Học phần chưa rõ tên';
const classCode = m ? m[2].trim() : 'LOP-NHAP';

// dòng header
let headerRow = 0;
for (let r = 1; r <= 15 && !headerRow; r++) for (let c = 1; c <= ws.columnCount; c++) if (/^Mã SV$/i.test(text(ws.getCell(r, c)))) { headerRow = r; break; }
if (!headerRow) throw new Error('Không tìm thấy dòng tiêu đề cột (cần có cột "Mã SV")');
const colOf = {};
for (let c = 1; c <= ws.columnCount; c++) {
  const h = text(ws.getCell(headerRow, c));
  if (/^Mã SV$/i.test(h)) colOf.code ??= c;
  else if (/^Họ và tên$/i.test(h)) colOf.name ??= c;
  else if (/^Lớp$/i.test(h)) colOf.klass ??= c;
  else if (/^Ghi chú$/i.test(h)) colOf.note ??= c;
}
if (!colOf.code || !colOf.name) throw new Error('Thiếu cột "Mã SV" hoặc "Họ và tên"');

// các cột buổi: từ sau cột "Lớp" đến trước "Ghi chú", tiêu đề dạng T<số>. Mỗi tiêu đề là MỘT buổi.
// Tiêu đề/ô gộp trải nhiều cột (vd T2): chỉ giữ cột đầu, bỏ các cột phụ (cùng một ô, chỉ là bản lặp).
const sessionCols = [];
for (let c = (colOf.klass || colOf.name) + 1; c < (colOf.note || ws.columnCount + 1); c++) {
  const cell = ws.getCell(headerRow, c);
  const mm = text(cell).match(/^T\s*(\d+)$/i);
  if (!mm) continue;
  const master = cell.master?.address || cell.address;
  if (master !== cell.address) continue; // cột phụ của ô gộp
  sessionCols.push({ col: c, week: Number(mm[1]) });
}

// sinh viên: các dòng có Mã SV là số
const students = [];
for (let r = headerRow + 1; r <= ws.rowCount; r++) {
  const code = text(ws.getCell(r, colOf.code));
  if (!/^\d{5,}$/.test(code)) continue;
  const marks = sessionCols.map((s) => text(ws.getCell(r, s.col)).toUpperCase());
  students.push({ row: r, code, name: text(ws.getCell(r, colOf.name)), klass: colOf.klass ? text(ws.getCell(r, colOf.klass)) : '', marks });
}
if (students.length === 0) throw new Error('Không có sinh viên nào trong file');

// kiểm tra dữ liệu trước khi nhập
const problems = [];
const dup = new Set(); const seen = new Set();
for (const s of students) { if (seen.has(s.code)) dup.add(s.code); seen.add(s.code); if (!s.name) problems.push(`Dòng ${s.row}: thiếu họ tên`); }
if (dup.size) problems.push(`MSSV bị lặp: ${[...dup].join(', ')}`);
const unknown = new Set();
for (const s of students) for (const mk of s.marks) if (!Object.hasOwn(CODE_TO_STATUS, mk)) unknown.add(mk);
if (unknown.size) problems.push(`Có mã lạ trong ô điểm danh: ${[...unknown].map((x) => `"${x}"`).join(', ')} (chỉ nhận X, P, M hoặc trống)`);
if (problems.length) { console.error('File chưa hợp lệ:\n - ' + problems.join('\n - ')); process.exit(1); }

// buổi đã diễn ra: đến cột cuối cùng có dấu (hoặc tất cả nếu --all)
let lastIdx = -1;
sessionCols.forEach((s, i) => { if (students.some((st) => st.marks[i] !== '')) lastIdx = i; });
const held = ALL ? sessionCols : sessionCols.slice(0, lastIdx + 1);

console.log(`Môn: ${courseName} | Lớp: ${classCode}${batch ? ` | Đợt ${batch}` : ''}`);
console.log(`Sinh viên: ${students.length} | Số buổi trong file (T1..): ${sessionCols.length} | Buổi sẽ tạo: ${held.length}`);

// ===================== 2) Nhập qua API =====================
async function call(path, { token, method = 'GET', body, form } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form || (body ? JSON.stringify(body) : undefined),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${data?.error}`);
  return data;
}

const login = await call('/account/auth/dev-login', { method: 'POST', body: { email: TEACHER, role: 'teacher', ...(TEACHER_NAME ? { name: TEACHER_NAME } : {}) } });
const T = login.token;

const existing = await call('/account/classes', { token: T });
if (existing.some((c) => c.code === classCode)) {
  console.error(`Lớp "${classCode}" đã có trong hệ thống. Xoá lớp đó (hoặc xoá thư mục .data) rồi chạy lại để tránh nhập trùng.`);
  process.exit(1);
}

const cls = await call('/account/classes', {
  token: T, method: 'POST',
  body: { code: classCode, name: courseName, room: ROOM || undefined, semester: SEMESTER || (batch ? `Đợt ${batch}` : ''), totalSessions: sessionCols.length, maxAbsentPercent: 20 },
});

// sinh viên: dùng chính chức năng import Excel của hệ thống (kiểm tra luôn đường nhập này với dữ liệu thật)
const xl = new ExcelJS.Workbook();
const sh = xl.addWorksheet('Sinh viên');
sh.addRow(['MSSV', 'Họ tên', 'Email']);
students.forEach((s) => sh.addRow([s.code, s.name, `${s.code}@sv.local`]));
const form = new FormData();
form.append('file', new Blob([await xl.xlsx.writeBuffer()]), 'sinh-vien.xlsx');
const imp = await call(`/account/classes/${cls.id}/students/import`, { token: T, method: 'POST', form });
if (imp.errors.length) { console.error('Import sinh viên có lỗi:', imp.errors); process.exit(1); }

// buổi học: mỗi cột một buổi, đóng ngay sau khi tạo (hệ thống chỉ cho 1 buổi mở)
const sessionIds = [];
for (const [i, s] of held.entries()) {
  const when = new Date(START.getTime() + (s.week - 1) * 7 * 86400000);
  const label = `Buổi ${s.week}`; // T1 = Buổi 1, T2 = Buổi 2...
  const ses = await call('/sessions/sessions', { token: T, method: 'POST', body: { classId: cls.id, title: label, openedAt: when.toISOString() } });
  await call(`/sessions/sessions/${ses.id}/close`, { token: T, method: 'POST' });
  sessionIds.push(ses.id);
}

// điểm danh: lưu một lần bằng API lưu theo lô (ô trống = có mặt cũng được ghi rõ vì hệ thống coi "chưa có bản ghi" là vắng)
const changes = [];
students.forEach((st) => held.forEach((_, i) => {
  changes.push({ sessionId: sessionIds[i], email: `${st.code}@sv.local`, status: CODE_TO_STATUS[st.marks[sessionCols.indexOf(held[i])]] });
}));
const saved = await call(`/attendance/classes/${cls.id}/changes`, { token: T, method: 'POST', body: { changes } });

// ===================== 3) Tổng kết (không in tên sinh viên) =====================
const tally = { present: 0, late: 0, excused: 0, absent: 0 };
changes.forEach((c) => { tally[c.status]++; });
const stats = await call(`/statistics/classes/${cls.id}/overview`, { token: T });
console.log(`\nĐã nhập lớp #${cls.id}: ${students.length} sinh viên, ${held.length} buổi, ${changes.length} ô điểm danh (đã ghi ${saved.applied} bản ghi).`);
console.log(`Có mặt ${tally.present} · Đi muộn ${tally.late} · Có phép ${tally.excused} · Vắng ${tally.absent}`);
console.log(`Tỉ lệ đi học trung bình: ${stats.avgRate}% | Giới hạn vắng: ${stats.absentLimit} buổi | Mức cảnh báo: ${JSON.stringify(stats.levels)}`);
console.log(`\nĐăng nhập giảng viên: ${TEACHER}. Sinh viên đăng nhập bằng email <MSSV>@sv.local.`);
