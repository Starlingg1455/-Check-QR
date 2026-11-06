// Kiểm tra ảnh đính kèm đơn xin vắng qua gateway
const API = 'http://localhost:4000/api';
const J = { 'Content-Type': 'application/json' };
const login = async (email, role) => (await (await fetch(API + '/account/auth/dev-login', { method: 'POST', headers: J, body: JSON.stringify({ email, role }) })).json()).token;
const gv = await login('gv@demo.vn', 'teacher');
const sv = await login('sv07@demo.vn', 'student');
const other = await login('sv08@demo.vn', 'student');
const H = (t) => ({ Authorization: 'Bearer ' + t });
let failed = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? '  OK ' : ' LỖI'}  ${n} ${x}`); if (!ok) failed++; };

const classId = (await (await fetch(API + '/account/classes', { headers: H(gv) })).json())[0].id;
const sessions = await (await fetch(`${API}/sessions/sessions?classId=${classId}`, { headers: H(gv) })).json();
const sessionId = sessions[2].id;

// ảnh PNG 1x1 hợp lệ
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const fd = new FormData();
fd.append('classId', classId); fd.append('sessionId', sessionId); fd.append('reason', 'Có giấy khám bệnh');
fd.append('files', new Blob([png], { type: 'image/png' }), 'giấy-khám.png');
const r = await fetch(API + '/attendance/requests', { method: 'POST', headers: H(sv), body: fd });
const req = await r.json();
check('Gửi đơn kèm ảnh', r.status === 201 && req.files.length === 1, `(${r.status}) ${JSON.stringify(req.files)}`);
check('Tên file tiếng Việt giữ nguyên', req.files[0]?.name === 'giấy-khám.png', req.files[0]?.name);

const f = req.files[0];
const ok = await fetch(`${API}/attendance/requests/${req.id}/files/${f.id}`, { headers: H(gv) });
const body = Buffer.from(await ok.arrayBuffer());
check('Giảng viên xem được ảnh', ok.status === 200 && ok.headers.get('content-type') === 'image/png' && body.equals(png));
check('Sinh viên gửi đơn xem được ảnh', (await fetch(`${API}/attendance/requests/${req.id}/files/${f.id}`, { headers: H(sv) })).status === 200);
check('Sinh viên khác không xem được', (await fetch(`${API}/attendance/requests/${req.id}/files/${f.id}`, { headers: H(other) })).status === 403);
check('Không đăng nhập bị chặn', (await fetch(`${API}/attendance/requests/${req.id}/files/${f.id}`)).status === 401);

const list = await (await fetch(`${API}/attendance/requests?classId=${classId}`, { headers: H(gv) })).json();
check('Danh sách đơn của giảng viên có kèm ảnh', list.find((x) => x.id === req.id)?.files.length === 1);

const hist = await (await fetch(`${API}/attendance/classes/${classId}/me`, { headers: H(sv) })).json();
check('Lịch sử sinh viên có kèm ảnh', hist.history.find((h) => h.sessionId === sessionId)?.request?.files.length === 1);

// file không phải ảnh bị từ chối
const fd2 = new FormData();
fd2.append('classId', classId); fd2.append('sessionId', sessions[3].id); fd2.append('reason', 'x');
fd2.append('files', new Blob(['hello'], { type: 'text/plain' }), 'a.txt');
const bad = await fetch(API + '/attendance/requests', { method: 'POST', headers: H(sv), body: fd2 });
check('Từ chối file không phải ảnh', bad.status === 400);

// gửi JSON không ảnh vẫn chạy (tương thích cũ)
const noimg = await fetch(API + '/attendance/requests', { method: 'POST', headers: { ...J, ...H(sv) }, body: JSON.stringify({ classId, sessionId: sessions[4].id, reason: 'Không ảnh' }) });
check('Gửi đơn không ảnh vẫn được', noimg.status === 201 && (await noimg.json()).files.length === 0);

console.log(failed ? `\n${failed} lỗi` : '\nTất cả đạt');
