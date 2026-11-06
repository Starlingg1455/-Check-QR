// Tạo lớp dữ liệu GIẢ LẬP qua API Gateway (chạy khi hệ thống đang chạy):  npm run tao-du-lieu-gia
//   Lớp:        TH4318_23CN1 - Phát triển phần mềm hướng dịch vụ (môn đã hoàn thành: 15/15 buổi)
//   Giảng viên: gv@demo.vn   |   Sinh viên: sv01@demo.vn ... sv40@demo.vn   (đăng nhập thử nghiệm)
// Toàn bộ họ tên, MSSV và điểm danh ở đây là dữ liệu giả, sinh ngẫu nhiên có cố định để lần nào chạy cũng giống nhau.
import zlib from 'node:zlib';

const DIA_CHI_API = process.env.API_URL || 'http://localhost:4000/api';

async function goiApi(path, { token, method = 'GET', body, form } = {}) {
  const res = await fetch(DIA_CHI_API + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form || (body ? JSON.stringify(body) : undefined),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${data?.error}`);
  return data;
}

// Tạo ảnh PNG mô phỏng "giấy khám bệnh" (không cần thư viện ngoài) để demo đính kèm minh chứng
function tinhCrc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function khoiPng(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(tinhCrc32(body));
  return Buffer.concat([len, body, crc]);
}
function taoAnhPngMau(w = 720, h = 960) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < w; x++) {
      let [r, g, b] = [250, 250, 247]; // nền giấy
      if (y < 130) [r, g, b] = [42, 120, 214]; // dải tiêu đề màu xanh
      else if (y > 230 && y < 700 && (y - 230) % 52 < 4 && x > 60 && x < w - 60) [r, g, b] = [190, 190, 184]; // các dòng chữ
      else if (y > 760 && y < 880 && x > w - 300 && x < w - 60 && (x + y) % 18 < 2) [r, g, b] = [208, 59, 59]; // vùng "con dấu"
      const i = row + 1 + x * 3;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), khoiPng('IHDR', ihdr), khoiPng('IDAT', zlib.deflateSync(raw)), khoiPng('IEND', Buffer.alloc(0))]);
}

const hos = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi', 'Đỗ', 'Ngô'];
const dem = ['Văn', 'Thị', 'Minh', 'Quốc', 'Ngọc', 'Hữu', 'Thanh', 'Gia', 'Đức', 'Khánh'];
const ten = ['An', 'Bình', 'Chi', 'Dũng', 'Giang', 'Hà', 'Khoa', 'Lan', 'Mai', 'Nam', 'Phúc', 'Quân', 'Sơn', 'Trang', 'Vy', 'Hải', 'Linh', 'Tuấn'];
const chon = (arr, i) => arr[i % arr.length];

// Giảng viên (không đặt tên để không ghi đè tên đã có của tài khoản)
const teacher = await goiApi('/account/auth/dev-login', { method: 'POST', body: { email: 'gv@demo.vn', role: 'teacher' } });
const T = teacher.token;

// 1) Tạo lớp
const existing = await goiApi('/account/classes', { token: T });
if (existing.some((c) => c.code === 'TH4318_23CN1')) {
  console.error('Lớp TH4318_23CN1 đã có. Xoá thư mục .data (hoặc xoá lớp) rồi chạy lại để tránh trùng.');
  process.exit(1);
}
const cls = await goiApi('/account/classes', {
  token: T, method: 'POST',
  body: { code: 'TH4318_23CN1', name: 'Phát triển phần mềm hướng dịch vụ', room: 'A2-305', semester: 'HK1 2025-2026', totalSessions: 15, maxAbsentPercent: 20 },
});
console.log('Đã tạo lớp', cls.id, cls.code);

// 2) 40 sinh viên giả lập, thêm từng người
const students = [];
for (let i = 1; i <= 40; i++) {
  const s = {
    code: `2455${String(1000 + i)}`,
    name: `${chon(hos, i * 3)} ${chon(dem, i * 5)} ${chon(ten, i * 7)}`,
    email: `sv${String(i).padStart(2, '0')}@demo.vn`,
  };
  students.push(s);
  await goiApi(`/account/classes/${cls.id}/students`, { token: T, method: 'POST', body: { studentCode: s.code, fullName: s.name, email: s.email } });
}
console.log(`Đã thêm ${students.length} sinh viên`);

// 3) 15 buổi đã diễn ra (mỗi tuần 1 buổi), điểm danh theo "thói quen" từng sinh viên
// xacSuatVang: xác suất vắng của từng sinh viên (một vài em vắng nhiều để có người sắp cấm thi)
const xacSuatVang = (i) => (i % 10 === 0 ? 0.3 : i % 7 === 0 ? 0.2 : i % 5 === 0 ? 0.12 : 0.03);
let seed = 42;
const ngauNhien = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296); // ngẫu nhiên cố định

const SESSIONS = 15;
const changes = [];
for (let n = 1; n <= SESSIONS; n++) {
  const openedAt = new Date(2025, 8, 2 + (n - 1) * 7, 7, 30, 0); // thứ Ba hằng tuần từ 02/09/2025, 07:30
  const s = await goiApi('/sessions/sessions', { token: T, method: 'POST', body: { classId: cls.id, title: `Buổi ${n}`, openedAt: openedAt.toISOString() } });
  students.forEach((st, i) => {
    const roll = ngauNhien();
    const rate = xacSuatVang(i + 1);
    let status = 'present';
    if (roll < rate) status = ngauNhien() < 0.25 ? 'excused' : 'absent';
    else if (roll > 0.94) status = 'late';
    changes.push({ sessionId: s.id, email: st.email, status });
  });
  await goiApi(`/sessions/sessions/${s.id}/close`, { token: T, method: 'POST' });
}
// ghi tất cả điểm danh một lần
await goiApi(`/attendance/classes/${cls.id}/changes`, { token: T, method: 'POST', body: { changes } });
console.log(`Đã tạo ${SESSIONS} buổi và ${changes.length} ô điểm danh`);

// 4) Hai đơn xin vắng đang chờ duyệt (để thấy chức năng duyệt đơn).
// Chỉ chọn sinh viên THỰC SỰ đang vắng ở buổi đó, cho dữ liệu demo hợp lý.
const sessions = await goiApi(`/sessions/sessions?classId=${cls.id}`, { token: T });
async function timSinhVienVang(session, skipEmails = []) {
  const { roster } = await goiApi(`/attendance/sessions/${session.id}/roster`, { token: T });
  const found = roster.find((r) => r.status === 'absent' && !skipEmails.includes(r.email));
  if (!found) throw new Error(`Không có sinh viên vắng ở ${session.title} để tạo đơn demo`);
  return found;
}
const dangNhapSinhVien = (s) => goiApi('/account/auth/dev-login', { method: 'POST', body: { email: s.email, name: s.fullName, role: 'student' } });

// Đơn 1: có ảnh minh chứng (giấy khám bệnh), buổi gần nhất
const lastSession = sessions[sessions.length - 1];
const first = await timSinhVienVang(lastSession);
const svFirst = await dangNhapSinhVien(first);
const requestForm = new FormData();
requestForm.append('classId', cls.id);
requestForm.append('sessionId', lastSession.id);
requestForm.append('reason', 'Em bị sốt cao nên không thể đến lớp được ạ. Em xin gửi kèm giấy khám bệnh của bệnh viện.');
requestForm.append('files', new Blob([taoAnhPngMau()], { type: 'image/png' }), 'giay-kham-benh.png');
await goiApi('/attendance/requests', { token: svFirst.token, method: 'POST', form: requestForm });

// Đơn 2: không có ảnh (để thấy cả hai trường hợp), một buổi trước đó, sinh viên khác
const earlier = sessions[sessions.length - 3];
const second = await timSinhVienVang(earlier, [first.email]);
const svSecond = await dangNhapSinhVien(second);
await goiApi('/attendance/requests', {
  token: svSecond.token, method: 'POST',
  body: { classId: cls.id, sessionId: earlier.id, reason: 'Em có việc gia đình đột xuất nên xin phép nghỉ buổi này ạ.' },
});
console.log(`Đơn xin vắng demo: ${first.fullName} (${lastSession.title}, có ảnh), ${second.fullName} (${earlier.title}).`);

console.log('\nXong! Đăng nhập thử nghiệm bằng:');
console.log('  Giảng viên: gv@demo.vn');
console.log('  Sinh viên : sv01@demo.vn ... sv40@demo.vn');
