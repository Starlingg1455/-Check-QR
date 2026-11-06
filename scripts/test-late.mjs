// Kịch bản "đến muộn sau khi đã đóng QR": sinh viên không quét được nữa => giảng viên sửa tay trạng thái.
// Chạy sau khi seed:  node scripts/test-late.mjs   (thay đổi dữ liệu demo: xoá .data và seed lại sau khi chạy)
const API = process.env.API_URL || 'http://localhost:4000/api';
const J = { 'Content-Type': 'application/json' };
const login = async (email, role) => (await (await fetch(API + '/account/auth/dev-login', { method: 'POST', headers: J, body: JSON.stringify({ email, role }) })).json());
const H = (t) => ({ Authorization: 'Bearer ' + t });
let failed = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? '  OK ' : ' LỖI'}  ${n} ${x}`); if (!ok) failed++; };
const call = async (path, token, method = 'GET', body) => {
  const r = await fetch(API + path, { method, headers: { ...H(token), ...(body ? J : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};

const gv = (await login('gv@demo.vn', 'teacher')).token;
const classId = (await call('/account/classes', gv)).body[0].id;

// 1) Mở một buổi mới, một sinh viên quét QR đúng giờ, rồi đóng buổi
const open = (await call('/sessions/sessions', gv, 'POST', { classId, title: 'Buổi thử đến muộn' })).body;
const qr = (await call(`/sessions/sessions/${open.id}/qr`, gv)).body;
const onTime = await login('sv01@demo.vn', 'student');
const scan = await call('/attendance/scan', onTime.token, 'POST', { token: qr.token });
check('Sinh viên đến đúng giờ quét được', scan.status === 200 && scan.body.status === 'present');
check('Đóng buổi', (await call(`/sessions/sessions/${open.id}/close`, gv, 'POST')).body.status === 'closed');

// 2) Bạn đến muộn: không quét được nữa (QR đã đóng)
const late = await login('sv02@demo.vn', 'student');
check('Buổi đã đóng: không lấy được QR mới', (await call(`/sessions/sessions/${open.id}/qr`, gv)).status === 409);
check('Quét bằng mã cũ bị từ chối', (await call('/attendance/scan', late.token, 'POST', { token: qr.token })).status === 410);
const before = (await call(`/attendance/sessions/${open.id}/roster`, gv)).body.roster.find((r) => r.email === 'sv02@demo.vn');
check('Bạn đến muộn đang bị tính là vắng', before.status === 'absent');

// 3) Giảng viên sửa tay (buổi đã đóng vẫn sửa được)
check('Sinh viên không tự sửa được trạng thái', (await call(`/attendance/sessions/${open.id}/students/sv02%40demo.vn`, late.token, 'PUT', { status: 'present' })).status === 403);
const edit = await call(`/attendance/sessions/${open.id}/students/sv02%40demo.vn`, gv, 'PUT', { status: 'late' });
check('Giảng viên sửa tay thành "Đi muộn"', edit.status === 200 && edit.body.status === 'late' && edit.body.source === 'manual');
const after = (await call(`/attendance/sessions/${open.id}/roster`, gv)).body;
check('Bảng điểm danh cập nhật (đi muộn, nguồn giảng viên sửa)', after.roster.find((r) => r.email === 'sv02@demo.vn').status === 'late');
check('Roster có lateMinutes để hiện quy tắc đi muộn', Number.isInteger(after.lateMinutes), `(${after.lateMinutes} phút)`);

// 4) Sửa lại sai sót: đổi sang có phép rồi có mặt
check('Đổi sang "Có phép"', (await call(`/attendance/sessions/${open.id}/students/sv02%40demo.vn`, gv, 'PUT', { status: 'excused' })).body.status === 'excused');
check('Đổi sang "Có mặt"', (await call(`/attendance/sessions/${open.id}/students/sv02%40demo.vn`, gv, 'PUT', { status: 'present' })).body.status === 'present');
check('Trạng thái không hợp lệ bị từ chối', (await call(`/attendance/sessions/${open.id}/students/sv02%40demo.vn`, gv, 'PUT', { status: 'abc' })).status === 400);
await call(`/attendance/sessions/${open.id}/students/sv02%40demo.vn`, gv, 'PUT', { status: 'late' });

// 5) Thống kê tính bạn đi muộn là có mặt
const stats = (await call(`/statistics/classes/${classId}/overview`, gv)).body;
const row = stats.perSession.find((s) => s.sessionId === open.id);
check('Thống kê: bạn đi muộn nằm ở nhóm "Đi muộn" và được tính có mặt', row.lists.late.some((x) => x.fullName) && row.present === 1 && row.late === 1, `(có mặt ${row.present}, muộn ${row.late}, vắng ${row.absent})`);

// dọn: xoá buổi thử
await call(`/sessions/sessions/${open.id}`, gv, 'DELETE');
console.log(failed ? `\n${failed} lỗi` : '\nTất cả đạt');
process.exit(failed ? 1 : 0);
