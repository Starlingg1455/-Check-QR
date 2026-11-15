// Nạp danh sách sinh viên thật vào một lớp và tạo dữ liệu điểm danh mẫu để thử tính năng cảnh báo.
// Chạy:  node scripts/nhapLop3.mjs [classId]   (mặc định classId = 3)
// Yêu cầu: backend đang chạy (npm run backend). Script cấp token cho chính chủ lớp (đọc từ DB).
// Script làm các việc sau, an toàn khi chạy lại:
//   1. Đăng nhập giảng viên (email + mật khẩu).
//   2. Đặt cài đặt lớp: 20 buổi, vắng tối đa 15%  =>  giới hạn vắng = 3 buổi.
//   3. Nạp danh sách sinh viên từ du-lieu-truong/lop-3.txt (mật khẩu = MSSV).
//   4. Tạo thêm các buổi đã đóng để 4 sinh viên mục tiêu đạt đúng mức cảnh báo,
//      các sinh viên còn lại được điểm danh có mặt. Số buổi vắng hiện có được cộng dồn,
//      không ghi đè dữ liệu cũ.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const DIA_CHI_API = process.env.API_URL || 'http://localhost:4000/api';
const LOP_ID = Number(process.argv[2] || 3);
const TEP_DANH_SACH = fileURLToPath(new URL('../du-lieu-truong/lop-3.txt', import.meta.url));

// Cài đặt lớp mong muốn: 20 buổi x 15% = giới hạn vắng 3 buổi
const TONG_BUOI = 20;
const PHAN_TRAM_VANG_TOI_DA = 15;
const GIOI_HAN = Math.floor((TONG_BUOI * PHAN_TRAM_VANG_TOI_DA) / 100); // = 3

// 4 sinh viên mẫu để thử cảnh báo + mức mong muốn
// (banned: vắng > giới hạn; danger: vắng = giới hạn; warning: vắng = giới hạn - 1)
const MUC_TIEU = [
  { email: 'quoct31234@gmail.com', vangMongMuon: GIOI_HAN + 1 }, // 4 => banned
  { email: 'thaohuong2608@gmail.com', vangMongMuon: GIOI_HAN }, // 3 => danger
  { email: 'vutrtuananh@gmail.com', vangMongMuon: GIOI_HAN - 1 }, // 2 => warning
  { email: 'tuquyenhau263@gmail.com', vangMongMuon: GIOI_HAN - 1 }, // 2 => warning
];

async function goiApi(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(DIA_CHI_API + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const loai = res.headers.get('content-type') || '';
  const data = loai.includes('json') ? await res.json() : await res.text();
  if (res.status >= 400) {
    throw new Error(
      `${method} ${path} -> ${res.status}: ${JSON.stringify(data).slice(0, 300)}`,
    );
  }
  return data;
}

// ---------- 1) Lấy chủ lớp từ DB và cấp token giảng viên (cùng JWT_SECRET với hệ thống) ----------
// Không đăng nhập bằng tài khoản demo: lớp thật thuộc về giảng viên thật (vd quocitdev29@gmail.com),
// nên script đọc trực tiếp chủ lớp và ký token như chính service tài khoản làm.
for (const dong of readFileSync(fileURLToPath(new URL('../.env', import.meta.url)), 'utf8').split(/\r?\n/)) {
  const m = dong.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const rowsLop = await db.query(
  `SELECT c.id, c.code, c.name, u.id AS teacher_id, u.email AS teacher_email, u.name AS teacher_name, u.role
   FROM account.classes c JOIN account.users u ON u.id = c.teacher_id WHERE c.id = $1`,
  [LOP_ID],
);
await db.end();
if (!rowsLop.rows[0]) {
  console.error(`✗ Không tìm thấy lớp #${LOP_ID}`);
  process.exit(1);
}
const thongTinLop = rowsLop.rows[0];

// Nạp helper ký token của service tài khoản (SAU khi đã nạp .env vì nó đọc JWT_SECRET lúc khởi tạo)
const { kyToken } = await import('../backend/services/tai-khoan-lop-hoc/src/tienIch.js');
const token = kyToken({
  id: thongTinLop.teacher_id,
  email: thongTinLop.teacher_email,
  name: thongTinLop.teacher_name,
  role: thongTinLop.role,
});
console.log(`✓ Lấy token giảng viên ${thongTinLop.teacher_email} (chủ lớp #${LOP_ID})`);

// ---------- 2) Thông tin + cài đặt lớp ----------
const lop = await goiApi(`/account/classes/${LOP_ID}`, { token });
console.log(
  `✓ Lớp #${lop.id}: ${lop.code} — ${lop.name} (trước đó: ${lop.total_sessions} buổi, vắng tối đa ${lop.max_absent_percent}%)`,
);

await goiApi(`/account/classes/${LOP_ID}`, {
  token,
  method: 'PUT',
  body: {
    code: lop.code,
    name: lop.name,
    room: lop.room,
    semester: lop.semester,
    totalSessions: TONG_BUOI,
    maxAbsentPercent: PHAN_TRAM_VANG_TOI_DA,
  },
});
console.log(
  `✓ Cài đặt lớp: ${TONG_BUOI} buổi / ${PHAN_TRAM_VANG_TOI_DA}% => giới hạn vắng ${GIOI_HAN} buổi`,
);

// ---------- 3) Nạp danh sách sinh viên ----------
const danhSach = readFileSync(TEP_DANH_SACH, 'utf8');
const ketQua = await goiApi(`/account/classes/${LOP_ID}/students/bulk`, {
  token,
  method: 'POST',
  body: { text: danhSach },
});
console.log(
  `✓ Nạp danh sách: ${ketQua.imported} sinh viên OK, ${ketQua.invalid.length} dòng bị từ chối`,
);
for (const dong of ketQua.invalid)
  console.log(`   - Dòng ${dong.line}: "${dong.text}" — ${dong.reason}`);

// ---------- 4) Danh sách sinh viên của lớp ----------
const sinhVien = await goiApi(`/account/classes/${LOP_ID}/students`, { token });
console.log(`✓ Lớp hiện có ${sinhVien.length} sinh viên`);

// ---------- 5) Buổi học + bản ghi hiện có ----------
let buoi = await goiApi(`/sessions/sessions?classId=${LOP_ID}`, { token });
const banGhi = await goiApi(`/attendance/classes/${LOP_ID}/records`, { token });

// Buổi đang mở phải đóng trước mới mở được buổi mới
for (const b of buoi.filter((x) => x.status === 'open')) {
  await goiApi(`/sessions/sessions/${b.id}/close`, { token, method: 'POST' });
  console.log(`✓ Đã đóng buổi #${b.sessionNo} đang mở`);
}
const daDong = buoi.filter((b) => b.status === 'closed');
console.log(`✓ Buổi học: ${daDong.length} đã đóng (giữ nguyên dữ liệu cũ)`);

// Số buổi vắng hiện tại của 4 sinh viên mục tiêu (tính trên các buổi đã đóng)
const soVangHienTai = new Map(MUC_TIEU.map((mt) => [mt.email, 0]));
for (const b of daDong) {
  for (const mt of MUC_TIEU) {
    const ghi = banGhi.find(
      (r) => r.sessionId === b.id && r.studentEmail.toLowerCase() === mt.email,
    );
    if (!ghi || ghi.status === 'absent')
      soVangHienTai.set(mt.email, soVangHienTai.get(mt.email) + 1);
  }
}

// Cần thêm bao nhiêu buổi vắng cho mỗi người
const canThem = new Map(
  MUC_TIEU.map((mt) => [mt.email, Math.max(0, mt.vangMongMuon - soVangHienTai.get(mt.email))]),
);
const SO_BUOI_MOI = Math.max(0, ...canThem.values());
if (SO_BUOI_MOI === 0) console.log('✓ 4 sinh viên mục tiêu đã đủ mức cảnh báo, không cần tạo buổi mới');
else console.log(`✓ Sẽ tạo thêm ${SO_BUOI_MOI} buổi đã đóng để 4 sinh viên mục tiêu đủ vắng`);

// ---------- 6) Tạo + đóng buổi mới, điểm danh có mặt cho những người khác ----------
for (let chiSo = 0; chiSo < SO_BUOI_MOI; chiSo++) {
  const buoiMoi = await goiApi('/sessions/sessions', {
    token,
    method: 'POST',
    body: {
      classId: LOP_ID,
      title: `Buổi mẫu ${daDong.length + chiSo + 1} (dữ liệu demo)`,
    },
  });
  await goiApi(`/sessions/sessions/${buoiMoi.id}/close`, { token, method: 'POST' });

  // Ai "vắng" ở buổi này: mục tiêu thứ chiSo (còn cần vắng thì tính từ buổi mới đầu tiên)
  const vangMoi = new Set(
    MUC_TIEU.filter((mt) => chiSo < canThem.get(mt.email)).map((mt) => mt.email),
  );

  // Những người còn lại => có mặt
  const changes = sinhVien
    .filter((sv) => !vangMoi.has(sv.email.toLowerCase()))
    .map((sv) => ({ sessionId: buoiMoi.id, email: sv.email, status: 'present' }));
  await goiApi(`/attendance/classes/${LOP_ID}/changes`, {
    token,
    method: 'POST',
    body: { changes },
  });
  console.log(
    `✓ Buổi #${buoiMoi.sessionNo}: ${changes.length} SV có mặt, ${vangMoi.size} SV vắng`,
  );
}

// ---------- 7) Kiểm tra lại kết quả ----------
const risk = await goiApi(`/statistics/classes/${LOP_ID}/risk`, { token });
console.log(
  `\n=== KẾT QUẢ: ${risk.closedSessions} buổi đã đóng, giới hạn vắng ${risk.absentLimit} buổi, ${risk.students.length} SV cần cảnh báo ===`,
);
const nhan = {
  warning: 'CẦN CHÚ Ý (warning)',
  danger: 'SẮP BỊ CẤM THI (danger)',
  banned: 'ĐÃ VƯỚT GIỚI HẠN (banned)',
};
for (const sv of risk.students)
  console.log(`   ${sv.studentCode} ${sv.fullName} — vắng ${sv.absent} — ${nhan[sv.level]}`);
