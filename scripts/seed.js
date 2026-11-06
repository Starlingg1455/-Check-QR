// Tạo dữ liệu demo qua API Gateway (chạy khi hệ thống đang chạy):  npm run seed
// Giảng viên: gv@demo.vn   |   Sinh viên: sv01@demo.vn ... sv30@demo.vn   (đăng nhập thử nghiệm)
import ExcelJS from 'exceljs';

const API = process.env.API_URL || 'http://localhost:4000/api';

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

const hos = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi'];
const dem = ['Văn', 'Thị', 'Minh', 'Quốc', 'Ngọc', 'Hữu', 'Thanh', 'Gia'];
const ten = ['An', 'Bình', 'Chi', 'Dũng', 'Giang', 'Hà', 'Khoa', 'Lan', 'Mai', 'Nam', 'Phúc', 'Quân', 'Sơn', 'Trang', 'Vy'];
const pick = (arr, i) => arr[i % arr.length];

const teacher = await call('/account/auth/dev-login', { method: 'POST', body: { email: 'gv@demo.vn', name: 'TS. Lê Minh Hoàng', role: 'teacher' } });
const T = teacher.token;

// 1) Tạo lớp
const cls = await call('/account/classes', {
  token: T, method: 'POST',
  body: { code: 'INT3505', name: 'Phát triển phần mềm hướng dịch vụ', room: 'B3-201', semester: 'HK1 2025-2026', totalSessions: 15, maxAbsentPercent: 20 },
});
console.log('Đã tạo lớp', cls.id);

// 2) Import 30 sinh viên bằng file Excel (thử luôn chức năng import)
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet('Sinh viên');
ws.addRow(['MSSV', 'Họ tên', 'Email']);
const students = [];
for (let i = 1; i <= 30; i++) {
  const s = {
    code: `2100${String(1000 + i)}`,
    name: `${pick(hos, i * 3)} ${pick(dem, i * 5)} ${pick(ten, i * 7)}`,
    email: `sv${String(i).padStart(2, '0')}@demo.vn`,
  };
  students.push(s);
  ws.addRow([s.code, s.name, s.email]);
}
const buffer = await wb.xlsx.writeBuffer();
const form = new FormData();
form.append('file', new Blob([buffer]), 'sinh-vien.xlsx');
const imp = await call(`/account/classes/${cls.id}/students/import`, { token: T, method: 'POST', form });
console.log('Import:', imp);

// 3) Tạo 10 buổi học đã diễn ra (mỗi tuần 1 buổi), điểm danh theo "thói quen" từng sinh viên
// absentRate: xác suất vắng của từng sinh viên (một số em vắng nhiều để có người sắp cấm thi)
const absentRate = (i) => (i % 10 === 0 ? 0.55 : i % 7 === 0 ? 0.4 : i % 5 === 0 ? 0.25 : 0.06);
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296); // ngẫu nhiên cố định để lần nào cũng giống nhau

const SESSIONS = 10;
const start = Date.now() - SESSIONS * 7 * 86400000;
for (let n = 1; n <= SESSIONS; n++) {
  const openedAt = new Date(start + (n - 1) * 7 * 86400000);
  openedAt.setHours(7, 30, 0, 0);
  const s = await call('/sessions/sessions', { token: T, method: 'POST', body: { classId: cls.id, title: `Buổi ${n}`, openedAt: openedAt.toISOString() } });
  for (let i = 0; i < students.length; i++) {
    const roll = rand();
    const rate = absentRate(i + 1);
    let status = 'present';
    if (roll < rate) status = rand() < 0.2 ? 'excused' : 'absent';
    else if (roll > 0.93) status = 'late';
    if (status === 'absent') continue; // không ghi bản ghi => mặc định vắng
    await call(`/attendance/sessions/${s.id}/students/${encodeURIComponent(students[i].email)}`, { token: T, method: 'PUT', body: { status } });
  }
  await call(`/sessions/sessions/${s.id}/close`, { token: T, method: 'POST' });
  console.log(`Đã tạo buổi ${n}`);
}

// 4) Một đơn xin vắng đang chờ duyệt (để thấy chức năng duyệt đơn)
const sv = await call('/account/auth/dev-login', { method: 'POST', body: { email: students[4].email, name: students[4].name, role: 'student' } });
const sessions = await call(`/sessions/sessions?classId=${cls.id}`, { token: T });
await call('/attendance/requests', {
  token: sv.token, method: 'POST',
  body: { classId: cls.id, sessionId: sessions[sessions.length - 1].id, reason: 'Em bị ốm, có giấy khám bệnh đính kèm ạ.' },
});

console.log('\nXong! Đăng nhập thử nghiệm bằng:');
console.log('  Giảng viên: gv@demo.vn');
console.log('  Sinh viên : sv01@demo.vn ... sv30@demo.vn');
