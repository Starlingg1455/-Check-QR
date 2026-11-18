// Kiểm thử luồng buổi học mới: tạo sẵn đủ buổi, sửa tên buổi, chặn mở khi đang có buổi mở,
// và trang sinh viên thấy buổi "planned" để xin vắng trước.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

for (const dong of readFileSync(fileURLToPath(new URL('../.env', import.meta.url)), 'utf8').split(/\r?\n/)) {
  const m = dong.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const GATEWAY = 'http://localhost:4000/api';
const LOP = 4;

async function doiCho(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function goi(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(GATEWAY + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

// Chờ cả 5 service sẵn sàng
let sanSang = false;
for (let lan = 0; lan < 60; lan++) {
  try {
    const res = await fetch('http://localhost:4000/health');
    const data = await res.json();
    if (data.gateway && (data.services || []).every((s) => s.ok)) {
      sanSang = true;
      break;
    }
  } catch {
    /* chưa lên */
  }
  await doiCho(1000);
}
if (!sanSang) {
  console.error('Backend chưa sẵn sàng sau 60 giây');
  process.exit(1);
}

const db = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await db.connect();
const gv = (
  await db.query(
    `SELECT u.* FROM account.users u JOIN account.classes c ON c.teacher_id = u.id WHERE c.id = $1`,
    [LOP],
  )
).rows[0];
const sv = (
  await db.query(
    'SELECT * FROM account.class_students WHERE class_id=$1 ORDER BY student_code LIMIT 1',
    [LOP],
  )
).rows[0];
const lopHienTai = (await db.query('SELECT * FROM account.classes WHERE id=$1', [LOP])).rows[0];

const { kyToken } = await import('../backend/services/tai-khoan-lop-hoc/src/tienIch.js');
const tokenGv = kyToken(gv);

const ketQua = [];
const ghi = (ten, ok, chiTiet) => ketQua.push({ ten, ok, chiTiet });

// 1) Danh sách buổi tự tạo đủ 15
let ds = await goi(`/sessions/sessions?classId=${LOP}`, { token: tokenGv });
const soBuoi = ds.data?.length;
const soPlanned = (ds.data || []).filter((b) => b.status === 'planned').length;
ghi(
  'GET /sessions tự tạo đủ số buổi',
  soBuoi === lopHienTai.total_sessions,
  `${soBuoi}/${lopHienTai.total_sessions} buổi, ${soPlanned} chưa mở`,
);
ghi(
  'Không trùng số buổi',
  new Set((ds.data || []).map((b) => b.sessionNo)).size === soBuoi,
  (ds.data || []).map((b) => b.sessionNo).join(','),
);

// 2) Sửa tên một buổi planned rồi trả về như cũ
const buoiSua = (ds.data || []).find((b) => b.status === 'planned');
if (buoiSua) {
  const tenCu = buoiSua.title;
  const sua1 = await goi(`/sessions/sessions/${buoiSua.id}`, {
    token: tokenGv,
    method: 'PUT',
    body: { title: 'Buổi kiểm thử' },
  });
  const sua2 = await goi(`/sessions/sessions/${buoiSua.id}`, {
    token: tokenGv,
    method: 'PUT',
    body: { title: tenCu },
  });
  ghi(
    'PUT sửa tên buổi',
    sua1.status === 200 && sua1.data.title === 'Buổi kiểm thử' && sua2.data.title === tenCu,
    `mã ${sua1.status}, đổi lại thành "${sua2.data?.title}"`,
  );
  const tenRong = await goi(`/sessions/sessions/${buoiSua.id}`, {
    token: tokenGv,
    method: 'PUT',
    body: { title: '   ' },
  });
  ghi('Chặn tên buổi rỗng', tenRong.status === 400, `mã ${tenRong.status}`);

  // 3) Đang có buổi mở khác -> mở buổi planned phải bị chặn 409
  const dangMo = (ds.data || []).find((b) => b.status === 'open');
  if (dangMo) {
    const mo = await goi(`/sessions/sessions/${buoiSua.id}/open`, {
      token: tokenGv,
      method: 'POST',
    });
    ghi(
      'Chặn mở khi lớp đang có buổi chưa đóng',
      mo.status === 409,
      `mã ${mo.status} — ${mo.data?.error || ''}`,
    );
  }
}

// 4) Tăng tổng số buổi lên 16 -> tự thêm buổi 16; giảm về lại -> xoá buổi 16 (planned)
const tang = await goi(`/account/classes/${LOP}`, {
  token: tokenGv,
  method: 'PUT',
  body: {
    code: lopHienTai.code,
    name: lopHienTai.name,
    room: lopHienTai.room,
    semester: lopHienTai.semester,
    totalSessions: lopHienTai.total_sessions + 1,
    maxAbsentPercent: lopHienTai.max_absent_percent,
  },
});
await doiCho(2500); // chờ đồng bộ chạy nền
const demDbTang = await db.query(
  'SELECT count(*)::int AS n FROM session_qr.sessions WHERE class_id=$1',
  [LOP],
);
ghi(
  'Tăng số buổi -> DB có ngay buổi mới (đồng bộ nền)',
  demDbTang.rows[0].n === lopHienTai.total_sessions + 1,
  `${demDbTang.rows[0].n} buổi trong DB`,
);
let ds16 = await goi(`/sessions/sessions?classId=${LOP}`, { token: tokenGv });
ghi(
  'Tăng số buổi -> tự thêm buổi mới',
  tang.status === 200 && ds16.data.length === lopHienTai.total_sessions + 1,
  `mã ${tang.status}, ${ds16.data.length} buổi`,
);

await goi(`/account/classes/${LOP}`, {
  token: tokenGv,
  method: 'PUT',
  body: {
    code: lopHienTai.code,
    name: lopHienTai.name,
    room: lopHienTai.room,
    semester: lopHienTai.semester,
    totalSessions: lopHienTai.total_sessions,
    maxAbsentPercent: lopHienTai.max_absent_percent,
  },
});
await doiCho(2500);
ds = await goi(`/sessions/sessions?classId=${LOP}`, { token: tokenGv });
ghi(
  'Giảm số buổi -> dọn buổi chưa mở dư',
  ds.data.length === lopHienTai.total_sessions,
  `${ds.data.length} buổi`,
);

// 5) Sinh viên thấy buổi planned trong trang của mình
const dangNhap = await goi('/account/auth/login', {
  method: 'POST',
  body: { email: sv.email, password: sv.student_code },
});
const tokenSv = dangNhap.data?.token;
const me = tokenSv
  ? await goi(`/attendance/classes/${LOP}/me`, { token: tokenSv })
  : { status: 0, data: null };
const plannedTrongMe = (me.data?.history || []).filter((b) => b.attendance === 'planned');
ghi(
  'Sinh viên thấy buổi chưa diễn ra',
  me.status === 200 && plannedTrongMe.length > 0,
  `${plannedTrongMe.length} buổi planned`,
);
ghi(
  'Sinh viên thấy đủ lịch',
  me.data?.history?.length === lopHienTai.total_sessions,
  `${me.data?.history?.length || 0}/${lopHienTai.total_sessions} buổi`,
);
ghi(
  'Buổi planned có openedAt = null',
  plannedTrongMe.every((b) => b.openedAt === null),
  plannedTrongMe.slice(0, 3).map((b) => `${b.sessionNo}:${b.openedAt}`).join(', '),
);

// 6) Lớp demo trống (#1): mở buổi kế tiếp, xem điểm danh, đóng rồi xoá để trả lại trạng thái sạch
let ds1 = await goi('/sessions/sessions?classId=1', { token: tokenGv });
ghi('Lớp 1 tự tạo đủ buổi', ds1.data.length === 15, `${ds1.data.length} buổi`);
const mo1 = await goi('/sessions/sessions', {
  token: tokenGv,
  method: 'POST',
  body: { classId: 1 },
});
ghi(
  'POST /sessions mở buổi kế tiếp',
  mo1.status === 201 && mo1.data.status === 'open' && mo1.data.sessionNo === 1,
  `mã ${mo1.status}, buổi ${mo1.data?.sessionNo}, ${mo1.data?.status}`,
);
const roster1 = await goi(`/attendance/sessions/${mo1.data.id}/roster`, { token: tokenGv });
ghi(
  'Xem điểm danh buổi vừa mở',
  roster1.status === 200 && roster1.data.summary.total === 0,
  `mã ${roster1.status}, ${roster1.data.summary?.total} sinh viên`,
);
const dong1 = await goi(`/sessions/sessions/${mo1.data.id}/close`, {
  token: tokenGv,
  method: 'POST',
});
ghi(
  'Đóng buổi vừa mở',
  dong1.status === 200 && dong1.data.status === 'closed',
  `mã ${dong1.status}, ${dong1.data?.status}`,
);
const xoa1 = await goi(`/sessions/sessions/${mo1.data.id}`, {
  token: tokenGv,
  method: 'DELETE',
});
const ds1b = await goi('/sessions/sessions?classId=1', { token: tokenGv });
ghi(
  'Xoá buổi thử và tự tạo lại planned',
  xoa1.status === 204 &&
    ds1b.data.length === 15 &&
    ds1b.data.every((b) => b.status === 'planned'),
  `${ds1b.data.length} buổi, ${[...new Set(ds1b.data.map((b) => b.status))].join(',')}`,
);

await db.end();
console.table(ketQua.map((k) => ({ ...k, ok: k.ok ? 'OK' : 'LỖI' })));
if (ketQua.some((k) => !k.ok)) process.exit(1);
