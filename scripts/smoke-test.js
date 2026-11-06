// Kiểm tra nhanh luồng chính qua gateway (chạy sau khi đã seed):  node scripts/smoke-test.js
const API = process.env.API_URL || 'http://localhost:4000/api';
let failed = 0;

async function call(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
  return { status: res.status, data };
}
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '  OK ' : ' LỖI'}  ${name} ${extra}`);
  if (!ok) failed++;
};

const gv = (await call('/account/auth/dev-login', { method: 'POST', body: { email: 'gv@demo.vn', role: 'teacher' } })).data.token;
const sv = (await call('/account/auth/dev-login', { method: 'POST', body: { email: 'sv01@demo.vn', role: 'student' } })).data.token;
const outsider = (await call('/account/auth/dev-login', { method: 'POST', body: { email: 'la@demo.vn', role: 'student' } })).data.token;

const classes = (await call('/account/classes', { token: gv })).data;
const classId = classes[0].id;
check('Danh sách lớp của giảng viên', classes.length >= 1, `(${classes[0].code}, ${classes[0].student_count} SV)`);

// Phân quyền
check('Sinh viên không tạo được lớp', (await call('/account/classes', { token: sv, method: 'POST', body: { code: 'X', name: 'Y' } })).status === 403);
check('Không đăng nhập bị 401', (await call('/account/classes')).status === 401);

// Mở buổi + QR + quét
const open = await call('/sessions/sessions', { token: gv, method: 'POST', body: { classId, title: 'Buổi test QR' } });
check('Mở buổi điểm danh', open.status === 201, `(buổi #${open.data.sessionNo})`);
const again = await call('/sessions/sessions', { token: gv, method: 'POST', body: { classId } });
check('Không mở được buổi thứ 2 khi chưa đóng', again.status === 409);
const sessionId = open.data.id;

const qr = (await call(`/sessions/sessions/${sessionId}/qr`, { token: gv })).data;
check('Lấy mã QR', Boolean(qr.token) && qr.ttl === 30, `(${qr.token})`);
check('Sinh viên không lấy được QR', (await call(`/sessions/sessions/${sessionId}/qr`, { token: sv })).status === 403);

const bad = await call('/attendance/scan', { token: sv, method: 'POST', body: { token: qr.token.slice(0, -3) + 'abc' } });
check('Mã QR giả bị từ chối', bad.status === 400);
const stale = qr.token.split('.');
stale[1] = String(Number(stale[1]) - 5);
check('Mã QR cũ (hết hạn) bị từ chối', (await call('/attendance/scan', { token: sv, method: 'POST', body: { token: stale.join('.') } })).status === 400);
check('Người ngoài lớp không điểm danh được', (await call('/attendance/scan', { token: outsider, method: 'POST', body: { token: qr.token } })).status === 403);

const scan = await call('/attendance/scan', { token: sv, method: 'POST', body: { token: qr.token } });
check('Sinh viên quét QR điểm danh', scan.status === 200 && scan.data.status === 'present', `(${scan.data.status})`);
const scan2 = await call('/attendance/scan', { token: sv, method: 'POST', body: { token: qr.token } });
check('Quét lần 2 báo đã điểm danh', scan2.data.alreadyCheckedIn === true);

const roster = (await call(`/attendance/sessions/${sessionId}/roster`, { token: gv })).data;
check('Bảng điểm danh buổi', roster.summary.present === 1 && roster.summary.total === 30, JSON.stringify(roster.summary));

const edit = await call(`/attendance/sessions/${sessionId}/students/sv02%40demo.vn`, { token: gv, method: 'PUT', body: { status: 'late', note: 'Kẹt xe' } });
check('Giảng viên sửa tay (đi trễ)', edit.status === 200 && edit.data.status === 'late');

const closed = await call(`/sessions/sessions/${sessionId}/close`, { token: gv, method: 'POST' });
check('Đóng buổi', closed.data.status === 'closed');
const afterClose = await call('/attendance/scan', { token: sv, method: 'POST', body: { token: qr.token } });
check('Quét sau khi đóng buổi bị từ chối', afterClose.status === 410 || afterClose.data.alreadyCheckedIn === undefined);

// Đơn xin vắng
// Dùng một sinh viên khác (sv03) gửi đơn cho buổi test để không đụng tới đơn demo
const sv3 = (await call('/account/auth/dev-login', { method: 'POST', body: { email: 'sv03@demo.vn', role: 'student' } })).data.token;
const sent = await call('/attendance/requests', { token: sv3, method: 'POST', body: { classId, sessionId, reason: 'Test' } });
check('Sinh viên gửi đơn xin vắng', sent.status === 201);
const dup = await call('/attendance/requests', { token: sv3, method: 'POST', body: { classId, sessionId, reason: 'Test lại' } });
check('Không gửi trùng đơn cho cùng buổi', dup.status === 409);
const ok = await call(`/attendance/requests/${sent.data.id}`, { token: gv, method: 'PUT', body: { status: 'approved', teacherNote: 'OK' } });
check('Duyệt đơn => vắng có phép', ok.data.status === 'approved');

// Thống kê
const stats = (await call(`/statistics/classes/${classId}/overview`, { token: gv })).data;
check('Thống kê lớp', stats.closedSessions === 11 && stats.perSession.length === 11 && stats.perStudent.length === 30,
  `(tỉ lệ TB ${stats.avgRate}%, giới hạn vắng ${stats.absentLimit}, mức: ${JSON.stringify(stats.levels)})`);
const risk = (await call(`/statistics/classes/${classId}/risk`, { token: gv })).data;
check('Danh sách sắp cấm thi', risk.students.length > 0, `(${risk.students.length} SV)`);
const home = (await call('/statistics/overview', { token: gv })).data;
check('Tổng quan giảng viên', home.classCount >= 1);
const xlsx = await call(`/statistics/classes/${classId}/export.xlsx`, { token: gv });
check('Xuất Excel', xlsx.status === 200 && xlsx.data.length > 4000 && xlsx.data[0] === 0x50, `(${xlsx.data.length} byte)`);

// Email cảnh báo (không có SMTP => ghi log)
const warn = await call('/attendance/warnings/send', { token: gv, method: 'POST', body: { classId } });
check('Gửi email cảnh báo', warn.status === 200 && warn.data.count === risk.students.length, `(${warn.data.count} email, chế độ: ${warn.data.results?.[0]?.status})`);

// Lịch sử của sinh viên
const me = (await call(`/attendance/classes/${classId}/me`, { token: sv })).data;
check('Sinh viên xem lịch sử của mình', me.history.length === 11 && me.summary.sessions === 11, `(tỉ lệ ${me.summary.rate}%)`);

// Swagger
for (const p of ['account', 'sessions', 'attendance', 'statistics']) {
  const r = await call(`/${p}/openapi.json`);
  check(`Swagger ${p}`, r.status === 200 && Boolean(r.data.paths));
}

// Dọn dẹp: xoá buổi test để không làm bẩn dữ liệu demo
await call(`/sessions/sessions/${sessionId}`, { token: gv, method: 'DELETE' });

console.log(failed ? `\n${failed} kiểm tra thất bại` : '\nTất cả kiểm tra đều đạt');
process.exit(failed ? 1 : 0);
