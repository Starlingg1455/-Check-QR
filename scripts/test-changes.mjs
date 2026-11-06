// Kiểm tra API lưu nhiều thay đổi sửa tay cùng lúc (POST /attendance/classes/:id/changes).
// Chạy sau khi seed:  node scripts/test-changes.mjs   (thay đổi dữ liệu demo: xoá .data và seed lại sau khi chạy)
const API = process.env.API_URL || 'http://localhost:4000/api';
const J = { 'Content-Type': 'application/json' };
const login = async (email, role) => (await (await fetch(API + '/account/auth/dev-login', { method: 'POST', headers: J, body: JSON.stringify({ email, role }) })).json()).token;
const H = (t) => ({ Authorization: 'Bearer ' + t });
let failed = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? '  OK ' : ' LỖI'}  ${n} ${x}`); if (!ok) failed++; };
const call = async (path, token, method = 'GET', body) => {
  const r = await fetch(API + path, { method, headers: { ...H(token), ...(body ? J : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};

const gv = await login('gv@demo.vn', 'teacher');
const sv = await login('sv01@demo.vn', 'student');
const classId = (await call('/account/classes', gv)).body[0].id;
const sessions = (await call(`/sessions/sessions?classId=${classId}`, gv)).body;
const [s1, s2, s3] = sessions;
const url = `/attendance/classes/${classId}/changes`;
const statusOf = async (sid, email) => (await call(`/attendance/sessions/${sid}/roster`, gv)).body.roster.find((r) => r.email === email).status;

const before = [await statusOf(s1.id, 'sv01@demo.vn'), await statusOf(s2.id, 'sv01@demo.vn'), await statusOf(s3.id, 'sv02@demo.vn')];

// 1) lô hợp lệ nhiều buổi, nhiều sinh viên, lưu một lần
const ok = await call(url, gv, 'POST', { changes: [
  { sessionId: s1.id, email: 'sv01@demo.vn', status: 'late' },
  { sessionId: s2.id, email: 'sv01@demo.vn', status: 'excused' },
  { sessionId: s3.id, email: 'sv02@demo.vn', status: 'absent' },
] });
check('Lưu lô hợp lệ', ok.status === 200 && ok.body.applied >= 2, JSON.stringify(ok.body));
check('Các ô đã đổi đúng', (await statusOf(s1.id, 'sv01@demo.vn')) === 'late' && (await statusOf(s2.id, 'sv01@demo.vn')) === 'excused' && (await statusOf(s3.id, 'sv02@demo.vn')) === 'absent');
const rec = (await call(`/attendance/sessions/${s1.id}/roster`, gv)).body.roster.find((r) => r.email === 'sv01@demo.vn');
check('Ghi nhận nguồn "giảng viên sửa"', rec.source === 'manual');

// 2) lưu lại đúng giá trị cũ: không có gì thay đổi
const same = await call(url, gv, 'POST', { changes: [{ sessionId: s1.id, email: 'sv01@demo.vn', status: 'late' }] });
check('Lưu đúng giá trị hiện tại: không ghi gì', same.status === 200 && same.body.applied === 0);

// 3) một thay đổi sai => từ chối CẢ lô, không ghi một phần
const mid = await statusOf(s1.id, 'sv01@demo.vn');
const bad = await call(url, gv, 'POST', { changes: [
  { sessionId: s1.id, email: 'sv01@demo.vn', status: 'present' },   // hợp lệ
  { sessionId: s2.id, email: 'sv01@demo.vn', status: 'khong-hop-le' }, // sai
] });
check('Trạng thái sai: từ chối cả lô', bad.status === 400);
check('...và thay đổi hợp lệ đi kèm KHÔNG bị ghi', (await statusOf(s1.id, 'sv01@demo.vn')) === mid);
check('Buổi không thuộc lớp bị từ chối', (await call(url, gv, 'POST', { changes: [{ sessionId: 999999, email: 'sv01@demo.vn', status: 'present' }] })).status === 400);
check('Sinh viên lạ bị từ chối', (await call(url, gv, 'POST', { changes: [{ sessionId: s1.id, email: 'la@demo.vn', status: 'present' }] })).status === 400);
check('Danh sách rỗng bị từ chối', (await call(url, gv, 'POST', { changes: [] })).status === 400);

// 4) phân quyền
check('Sinh viên không lưu được', (await call(url, sv, 'POST', { changes: [{ sessionId: s1.id, email: 'sv01@demo.vn', status: 'present' }] })).status === 403);
check('Chưa đăng nhập bị chặn', (await call(url, '', 'POST', { changes: [] })).status === 401);

// 5) thay đổi lặp cho cùng một ô: lấy cái cuối
const last = await call(url, gv, 'POST', { changes: [
  { sessionId: s1.id, email: 'sv01@demo.vn', status: 'absent' },
  { sessionId: s1.id, email: 'sv01@demo.vn', status: 'present' },
] });
check('Cùng một ô sửa nhiều lần: lấy giá trị cuối', last.status === 200 && (await statusOf(s1.id, 'sv01@demo.vn')) === 'present');

// hoàn tác về như ban đầu
const back = (s) => ({ present: 'present', late: 'late', excused: 'excused', absent: 'absent' })[s];
await call(url, gv, 'POST', { changes: [
  { sessionId: s1.id, email: 'sv01@demo.vn', status: back(before[0]) },
  { sessionId: s2.id, email: 'sv01@demo.vn', status: back(before[1]) },
  { sessionId: s3.id, email: 'sv02@demo.vn', status: back(before[2]) },
] });
check('Hoàn tác về trạng thái ban đầu', (await statusOf(s1.id, 'sv01@demo.vn')) === before[0] && (await statusOf(s3.id, 'sv02@demo.vn')) === before[2]);

console.log(failed ? `\n${failed} lỗi` : '\nTất cả đạt');
process.exit(failed ? 1 : 0);
