// Kiểm thử toàn bộ hệ thống qua API Gateway.  Chạy:  npm run kiem-thu   (hoặc: node scripts/kiem-thu.mjs)
// Cần chạy sau khi đã bật backend và tạo dữ liệu giả (npm run tao-du-lieu-gia), vì các kiểm thử dựa vào lớp giả lập
// TH4318_23CN1 (40 sinh viên, 15 buổi). Các kiểm thử sẽ làm thay đổi dữ liệu: xoá thư mục .data và tạo lại sau khi chạy.
const DIA_CHI_API = process.env.API_URL || 'http://localhost:4000/api';

// ---------------------------------------------------------------------------------------------
// Luồng chính: đăng nhập, phân quyền, mở buổi, mã QR, điểm danh, thống kê, xuất Excel, email cảnh báo, Swagger
// ---------------------------------------------------------------------------------------------
async function kiemThuLuongChinh() {
  let soLoi = 0;

  async function goiApi(path, { token, method = 'GET', body } = {}) {
    const res = await fetch(DIA_CHI_API + path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data };
  }
  const kiemTra = (name, ok, extra = '') => {
    console.log(`${ok ? '  OK ' : ' LỖI'}  ${name} ${extra}`);
    if (!ok) soLoi++;
  };

  const gv = (await goiApi('/account/auth/dev-login', { method: 'POST', body: { email: 'gv@demo.vn', role: 'teacher' } })).data.token;
  const sv = (await goiApi('/account/auth/dev-login', { method: 'POST', body: { email: 'sv01@demo.vn', role: 'student' } })).data.token;
  const outsider = (await goiApi('/account/auth/dev-login', { method: 'POST', body: { email: 'la@demo.vn', role: 'student' } })).data.token;

  const classes = (await goiApi('/account/classes', { token: gv })).data;
  const classId = classes[0].id;
  kiemTra('Danh sách lớp của giảng viên', classes.length >= 1, `(${classes[0].code}, ${classes[0].student_count} SV)`);

  // Phân quyền
  kiemTra('Sinh viên không tạo được lớp', (await goiApi('/account/classes', { token: sv, method: 'POST', body: { code: 'X', name: 'Y' } })).status === 403);
  kiemTra('Không đăng nhập bị 401', (await goiApi('/account/classes')).status === 401);

  // Mở buổi + QR + quét
  const open = await goiApi('/sessions/sessions', { token: gv, method: 'POST', body: { classId, title: 'Buổi test QR' } });
  kiemTra('Mở buổi điểm danh', open.status === 201, `(buổi #${open.data.sessionNo})`);
  const again = await goiApi('/sessions/sessions', { token: gv, method: 'POST', body: { classId } });
  kiemTra('Không mở được buổi thứ 2 khi chưa đóng', again.status === 409);
  const sessionId = open.data.id;

  const qr = (await goiApi(`/sessions/sessions/${sessionId}/qr`, { token: gv })).data;
  kiemTra('Lấy mã QR', Boolean(qr.token) && qr.ttl === 30, `(${qr.token})`);
  kiemTra('Sinh viên không lấy được QR', (await goiApi(`/sessions/sessions/${sessionId}/qr`, { token: sv })).status === 403);

  const bad = await goiApi('/attendance/scan', { token: sv, method: 'POST', body: { token: qr.token.slice(0, -3) + 'abc' } });
  kiemTra('Mã QR giả bị từ chối', bad.status === 400);
  const stale = qr.token.split('.');
  stale[1] = String(Number(stale[1]) - 5);
  kiemTra('Mã QR cũ (hết hạn) bị từ chối', (await goiApi('/attendance/scan', { token: sv, method: 'POST', body: { token: stale.join('.') } })).status === 400);
  kiemTra('Người ngoài lớp không điểm danh được', (await goiApi('/attendance/scan', { token: outsider, method: 'POST', body: { token: qr.token } })).status === 403);

  const scan = await goiApi('/attendance/scan', { token: sv, method: 'POST', body: { token: qr.token } });
  kiemTra('Sinh viên quét QR điểm danh', scan.status === 200 && scan.data.status === 'present', `(${scan.data.status})`);
  const scan2 = await goiApi('/attendance/scan', { token: sv, method: 'POST', body: { token: qr.token } });
  kiemTra('Quét lần 2 báo đã điểm danh', scan2.data.alreadyCheckedIn === true);

  const roster = (await goiApi(`/attendance/sessions/${sessionId}/roster`, { token: gv })).data;
  kiemTra('Bảng điểm danh buổi', roster.summary.present === 1 && roster.summary.total === 40, JSON.stringify(roster.summary));

  const edit = await goiApi(`/attendance/sessions/${sessionId}/students/sv02%40demo.vn`, { token: gv, method: 'PUT', body: { status: 'late', note: 'Kẹt xe' } });
  kiemTra('Giảng viên sửa tay (đi trễ)', edit.status === 200 && edit.data.status === 'late');

  const closed = await goiApi(`/sessions/sessions/${sessionId}/close`, { token: gv, method: 'POST' });
  kiemTra('Đóng buổi', closed.data.status === 'closed');
  const afterClose = await goiApi('/attendance/scan', { token: sv, method: 'POST', body: { token: qr.token } });
  kiemTra('Quét sau khi đóng buổi bị từ chối', afterClose.status === 410 || afterClose.data.alreadyCheckedIn === undefined);

  // Đơn xin vắng
  // Dùng một sinh viên khác (sv03) gửi đơn cho buổi test để không đụng tới đơn demo
  const sv3 = (await goiApi('/account/auth/dev-login', { method: 'POST', body: { email: 'sv03@demo.vn', role: 'student' } })).data.token;
  const sent = await goiApi('/attendance/requests', { token: sv3, method: 'POST', body: { classId, sessionId, reason: 'Test' } });
  kiemTra('Sinh viên gửi đơn xin vắng', sent.status === 201);
  const dup = await goiApi('/attendance/requests', { token: sv3, method: 'POST', body: { classId, sessionId, reason: 'Test lại' } });
  kiemTra('Không gửi trùng đơn cho cùng buổi', dup.status === 409);
  const ok = await goiApi(`/attendance/requests/${sent.data.id}`, { token: gv, method: 'PUT', body: { status: 'approved', teacherNote: 'OK' } });
  kiemTra('Duyệt đơn => vắng có phép', ok.data.status === 'approved');

  // Thống kê
  const stats = (await goiApi(`/statistics/classes/${classId}/overview`, { token: gv })).data;
  kiemTra('Thống kê lớp', stats.closedSessions === 16 && stats.perSession.length === 16 && stats.perStudent.length === 40,
    `(tỉ lệ TB ${stats.avgRate}%, giới hạn vắng ${stats.absentLimit}, mức: ${JSON.stringify(stats.levels)})`);
  const risk = (await goiApi(`/statistics/classes/${classId}/risk`, { token: gv })).data;
  kiemTra('Danh sách sắp cấm thi', risk.students.length > 0, `(${risk.students.length} SV)`);
  const home = (await goiApi('/statistics/overview', { token: gv })).data;
  kiemTra('Tổng quan giảng viên', home.classCount >= 1);
  const xlsx = await goiApi(`/statistics/classes/${classId}/export.xlsx`, { token: gv });
  kiemTra('Xuất Excel', xlsx.status === 200 && xlsx.data.length > 4000 && xlsx.data[0] === 0x50, `(${xlsx.data.length} byte)`);

  // Email cảnh báo (không có SMTP => ghi log)
  const warn = await goiApi('/attendance/warnings/send', { token: gv, method: 'POST', body: { classId } });
  kiemTra('Gửi email cảnh báo', warn.status === 200 && warn.data.count === risk.students.length, `(${warn.data.count} email, chế độ: ${warn.data.results?.[0]?.status})`);

  // Lịch sử của sinh viên
  const me = (await goiApi(`/attendance/classes/${classId}/me`, { token: sv })).data;
  kiemTra('Sinh viên xem lịch sử của mình', me.history.length === 16 && me.summary.sessions === 16, `(tỉ lệ ${me.summary.rate}%)`);

  // Swagger
  for (const p of ['account', 'sessions', 'attendance', 'statistics']) {
    const r = await goiApi(`/${p}/openapi.json`);
    kiemTra(`Swagger ${p}`, r.status === 200 && Boolean(r.data.paths));
  }

  // Dọn dẹp: xoá buổi test để không làm bẩn dữ liệu demo
  await goiApi(`/sessions/sessions/${sessionId}`, { token: gv, method: 'DELETE' });
  return soLoi;
}

// ---------------------------------------------------------------------------------------------
// Ảnh minh chứng của đơn xin vắng: gửi, xem, phân quyền, loại tệp
// ---------------------------------------------------------------------------------------------
async function kiemThuAnhMinhChung() {
  const DIA_CHI_API = 'http://localhost:4000/api';
  const J = { 'Content-Type': 'application/json' };
  const dangNhap = async (email, role) => (await (await fetch(DIA_CHI_API + '/account/auth/dev-login', { method: 'POST', headers: J, body: JSON.stringify({ email, role }) })).json()).token;
  const gv = await dangNhap('gv@demo.vn', 'teacher');
  const sv = await dangNhap('sv07@demo.vn', 'student');
  const other = await dangNhap('sv08@demo.vn', 'student');
  const H = (t) => ({ Authorization: 'Bearer ' + t });
  let soLoi = 0;
  const kiemTra = (n, ok, x = '') => { console.log(`${ok ? '  OK ' : ' LỖI'}  ${n} ${x}`); if (!ok) soLoi++; };

  const classId = (await (await fetch(DIA_CHI_API + '/account/classes', { headers: H(gv) })).json())[0].id;
  const sessions = await (await fetch(`${DIA_CHI_API}/sessions/sessions?classId=${classId}`, { headers: H(gv) })).json();
  const sessionId = sessions[2].id;

  // ảnh PNG 1x1 hợp lệ
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const fd = new FormData();
  fd.append('classId', classId); fd.append('sessionId', sessionId); fd.append('reason', 'Có giấy khám bệnh');
  fd.append('files', new Blob([png], { type: 'image/png' }), 'giấy-khám.png');
  const r = await fetch(DIA_CHI_API + '/attendance/requests', { method: 'POST', headers: H(sv), body: fd });
  const req = await r.json();
  kiemTra('Gửi đơn kèm ảnh', r.status === 201 && req.files.length === 1, `(${r.status}) ${JSON.stringify(req.files)}`);
  kiemTra('Tên file tiếng Việt giữ nguyên', req.files[0]?.name === 'giấy-khám.png', req.files[0]?.name);

  const f = req.files[0];
  const ok = await fetch(`${DIA_CHI_API}/attendance/requests/${req.id}/files/${f.id}`, { headers: H(gv) });
  const body = Buffer.from(await ok.arrayBuffer());
  kiemTra('Giảng viên xem được ảnh', ok.status === 200 && ok.headers.get('content-type') === 'image/png' && body.equals(png));
  kiemTra('Sinh viên gửi đơn xem được ảnh', (await fetch(`${DIA_CHI_API}/attendance/requests/${req.id}/files/${f.id}`, { headers: H(sv) })).status === 200);
  kiemTra('Sinh viên khác không xem được', (await fetch(`${DIA_CHI_API}/attendance/requests/${req.id}/files/${f.id}`, { headers: H(other) })).status === 403);
  kiemTra('Không đăng nhập bị chặn', (await fetch(`${DIA_CHI_API}/attendance/requests/${req.id}/files/${f.id}`)).status === 401);

  const list = await (await fetch(`${DIA_CHI_API}/attendance/requests?classId=${classId}`, { headers: H(gv) })).json();
  kiemTra('Danh sách đơn của giảng viên có kèm ảnh', list.find((x) => x.id === req.id)?.files.length === 1);

  const hist = await (await fetch(`${DIA_CHI_API}/attendance/classes/${classId}/me`, { headers: H(sv) })).json();
  kiemTra('Lịch sử sinh viên có kèm ảnh', hist.history.find((h) => h.sessionId === sessionId)?.request?.files.length === 1);

  // file không phải ảnh bị từ chối
  const fd2 = new FormData();
  fd2.append('classId', classId); fd2.append('sessionId', sessions[3].id); fd2.append('reason', 'x');
  fd2.append('files', new Blob(['hello'], { type: 'text/plain' }), 'a.txt');
  const bad = await fetch(DIA_CHI_API + '/attendance/requests', { method: 'POST', headers: H(sv), body: fd2 });
  kiemTra('Từ chối file không phải ảnh', bad.status === 400);

  // gửi JSON không ảnh vẫn chạy (tương thích cũ)
  const noimg = await fetch(DIA_CHI_API + '/attendance/requests', { method: 'POST', headers: { ...J, ...H(sv) }, body: JSON.stringify({ classId, sessionId: sessions[4].id, reason: 'Không ảnh' }) });
  kiemTra('Gửi đơn không ảnh vẫn được', noimg.status === 201 && (await noimg.json()).files.length === 0);
  return soLoi;
}

// ---------------------------------------------------------------------------------------------
// Đến muộn sau khi đóng QR: giảng viên sửa tay trạng thái
// ---------------------------------------------------------------------------------------------
async function kiemThuDenMuon() {
  const J = { 'Content-Type': 'application/json' };
  const dangNhap = async (email, role) => (await (await fetch(DIA_CHI_API + '/account/auth/dev-login', { method: 'POST', headers: J, body: JSON.stringify({ email, role }) })).json());
  const H = (t) => ({ Authorization: 'Bearer ' + t });
  let soLoi = 0;
  const kiemTra = (n, ok, x = '') => { console.log(`${ok ? '  OK ' : ' LỖI'}  ${n} ${x}`); if (!ok) soLoi++; };
  const goiApi = async (path, token, method = 'GET', body) => {
    const r = await fetch(DIA_CHI_API + path, { method, headers: { ...H(token), ...(body ? J : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  const gv = (await dangNhap('gv@demo.vn', 'teacher')).token;
  const classId = (await goiApi('/account/classes', gv)).body[0].id;

  // 1) Mở một buổi mới, một sinh viên quét QR đúng giờ, rồi đóng buổi
  const open = (await goiApi('/sessions/sessions', gv, 'POST', { classId, title: 'Buổi thử đến muộn' })).body;
  const qr = (await goiApi(`/sessions/sessions/${open.id}/qr`, gv)).body;
  const onTime = await dangNhap('sv01@demo.vn', 'student');
  const scan = await goiApi('/attendance/scan', onTime.token, 'POST', { token: qr.token });
  kiemTra('Sinh viên đến đúng giờ quét được', scan.status === 200 && scan.body.status === 'present');
  kiemTra('Đóng buổi', (await goiApi(`/sessions/sessions/${open.id}/close`, gv, 'POST')).body.status === 'closed');

  // 2) Bạn đến muộn: không quét được nữa (QR đã đóng)
  const late = await dangNhap('sv02@demo.vn', 'student');
  kiemTra('Buổi đã đóng: không lấy được QR mới', (await goiApi(`/sessions/sessions/${open.id}/qr`, gv)).status === 409);
  kiemTra('Quét bằng mã cũ bị từ chối', (await goiApi('/attendance/scan', late.token, 'POST', { token: qr.token })).status === 410);
  const before = (await goiApi(`/attendance/sessions/${open.id}/roster`, gv)).body.roster.find((r) => r.email === 'sv02@demo.vn');
  kiemTra('Bạn đến muộn đang bị tính là vắng', before.status === 'absent');

  // 3) Giảng viên sửa tay (buổi đã đóng vẫn sửa được)
  kiemTra('Sinh viên không tự sửa được trạng thái', (await goiApi(`/attendance/sessions/${open.id}/students/sv02%40demo.vn`, late.token, 'PUT', { status: 'present' })).status === 403);
  const edit = await goiApi(`/attendance/sessions/${open.id}/students/sv02%40demo.vn`, gv, 'PUT', { status: 'late' });
  kiemTra('Giảng viên sửa tay thành "Đi muộn"', edit.status === 200 && edit.body.status === 'late' && edit.body.source === 'manual');
  const after = (await goiApi(`/attendance/sessions/${open.id}/roster`, gv)).body;
  kiemTra('Bảng điểm danh cập nhật (đi muộn, nguồn giảng viên sửa)', after.roster.find((r) => r.email === 'sv02@demo.vn').status === 'late');
  kiemTra('Roster có lateMinutes để hiện quy tắc đi muộn', Number.isInteger(after.lateMinutes), `(${after.lateMinutes} phút)`);

  // 4) Sửa lại sai sót: đổi sang có phép rồi có mặt
  kiemTra('Đổi sang "Có phép"', (await goiApi(`/attendance/sessions/${open.id}/students/sv02%40demo.vn`, gv, 'PUT', { status: 'excused' })).body.status === 'excused');
  kiemTra('Đổi sang "Có mặt"', (await goiApi(`/attendance/sessions/${open.id}/students/sv02%40demo.vn`, gv, 'PUT', { status: 'present' })).body.status === 'present');
  kiemTra('Trạng thái không hợp lệ bị từ chối', (await goiApi(`/attendance/sessions/${open.id}/students/sv02%40demo.vn`, gv, 'PUT', { status: 'abc' })).status === 400);
  await goiApi(`/attendance/sessions/${open.id}/students/sv02%40demo.vn`, gv, 'PUT', { status: 'late' });

  // 5) Thống kê tính bạn đi muộn là có mặt
  const stats = (await goiApi(`/statistics/classes/${classId}/overview`, gv)).body;
  const row = stats.perSession.find((s) => s.sessionId === open.id);
  kiemTra('Thống kê: bạn đi muộn nằm ở nhóm "Đi muộn" và được tính có mặt', row.lists.late.some((x) => x.fullName) && row.present === 1 && row.late === 1, `(có mặt ${row.present}, muộn ${row.late}, vắng ${row.absent})`);

  // dọn: xoá buổi thử
  await goiApi(`/sessions/sessions/${open.id}`, gv, 'DELETE');
  return soLoi;
}

// ---------------------------------------------------------------------------------------------
// Lưu nhiều thay đổi sửa tay cùng lúc (cả lô hợp lệ hoặc không lưu gì)
// ---------------------------------------------------------------------------------------------
async function kiemThuLuuNhieuThayDoi() {
  const J = { 'Content-Type': 'application/json' };
  const dangNhap = async (email, role) => (await (await fetch(DIA_CHI_API + '/account/auth/dev-login', { method: 'POST', headers: J, body: JSON.stringify({ email, role }) })).json()).token;
  const H = (t) => ({ Authorization: 'Bearer ' + t });
  let soLoi = 0;
  const kiemTra = (n, ok, x = '') => { console.log(`${ok ? '  OK ' : ' LỖI'}  ${n} ${x}`); if (!ok) soLoi++; };
  const goiApi = async (path, token, method = 'GET', body) => {
    const r = await fetch(DIA_CHI_API + path, { method, headers: { ...H(token), ...(body ? J : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  const gv = await dangNhap('gv@demo.vn', 'teacher');
  const sv = await dangNhap('sv01@demo.vn', 'student');
  const classId = (await goiApi('/account/classes', gv)).body[0].id;
  const sessions = (await goiApi(`/sessions/sessions?classId=${classId}`, gv)).body;
  const [s1, s2, s3] = sessions;
  const url = `/attendance/classes/${classId}/changes`;
  const trangThaiCua = async (sid, email) => (await goiApi(`/attendance/sessions/${sid}/roster`, gv)).body.roster.find((r) => r.email === email).status;

  const before = [await trangThaiCua(s1.id, 'sv01@demo.vn'), await trangThaiCua(s2.id, 'sv01@demo.vn'), await trangThaiCua(s3.id, 'sv02@demo.vn')];

  // 1) lô hợp lệ nhiều buổi, nhiều sinh viên, lưu một lần
  const ok = await goiApi(url, gv, 'POST', { changes: [
    { sessionId: s1.id, email: 'sv01@demo.vn', status: 'late' },
    { sessionId: s2.id, email: 'sv01@demo.vn', status: 'excused' },
    { sessionId: s3.id, email: 'sv02@demo.vn', status: 'absent' },
  ] });
  kiemTra('Lưu lô hợp lệ', ok.status === 200 && ok.body.applied >= 2, JSON.stringify(ok.body));
  kiemTra('Các ô đã đổi đúng', (await trangThaiCua(s1.id, 'sv01@demo.vn')) === 'late' && (await trangThaiCua(s2.id, 'sv01@demo.vn')) === 'excused' && (await trangThaiCua(s3.id, 'sv02@demo.vn')) === 'absent');
  const rec = (await goiApi(`/attendance/sessions/${s1.id}/roster`, gv)).body.roster.find((r) => r.email === 'sv01@demo.vn');
  kiemTra('Ghi nhận nguồn "giảng viên sửa"', rec.source === 'manual');

  // 2) lưu lại đúng giá trị cũ: không có gì thay đổi
  const same = await goiApi(url, gv, 'POST', { changes: [{ sessionId: s1.id, email: 'sv01@demo.vn', status: 'late' }] });
  kiemTra('Lưu đúng giá trị hiện tại: không ghi gì', same.status === 200 && same.body.applied === 0);

  // 3) một thay đổi sai => từ chối CẢ lô, không ghi một phần
  const mid = await trangThaiCua(s1.id, 'sv01@demo.vn');
  const bad = await goiApi(url, gv, 'POST', { changes: [
    { sessionId: s1.id, email: 'sv01@demo.vn', status: 'present' },   // hợp lệ
    { sessionId: s2.id, email: 'sv01@demo.vn', status: 'khong-hop-le' }, // sai
  ] });
  kiemTra('Trạng thái sai: từ chối cả lô', bad.status === 400);
  kiemTra('...và thay đổi hợp lệ đi kèm KHÔNG bị ghi', (await trangThaiCua(s1.id, 'sv01@demo.vn')) === mid);
  kiemTra('Buổi không thuộc lớp bị từ chối', (await goiApi(url, gv, 'POST', { changes: [{ sessionId: 999999, email: 'sv01@demo.vn', status: 'present' }] })).status === 400);
  kiemTra('Sinh viên lạ bị từ chối', (await goiApi(url, gv, 'POST', { changes: [{ sessionId: s1.id, email: 'la@demo.vn', status: 'present' }] })).status === 400);
  kiemTra('Danh sách rỗng bị từ chối', (await goiApi(url, gv, 'POST', { changes: [] })).status === 400);

  // 4) phân quyền
  kiemTra('Sinh viên không lưu được', (await goiApi(url, sv, 'POST', { changes: [{ sessionId: s1.id, email: 'sv01@demo.vn', status: 'present' }] })).status === 403);
  kiemTra('Chưa đăng nhập bị chặn', (await goiApi(url, '', 'POST', { changes: [] })).status === 401);

  // 5) thay đổi lặp cho cùng một ô: lấy cái cuối
  const last = await goiApi(url, gv, 'POST', { changes: [
    { sessionId: s1.id, email: 'sv01@demo.vn', status: 'absent' },
    { sessionId: s1.id, email: 'sv01@demo.vn', status: 'present' },
  ] });
  kiemTra('Cùng một ô sửa nhiều lần: lấy giá trị cuối', last.status === 200 && (await trangThaiCua(s1.id, 'sv01@demo.vn')) === 'present');

  // hoàn tác về như ban đầu
  const back = (s) => ({ present: 'present', late: 'late', excused: 'excused', absent: 'absent' })[s];
  await goiApi(url, gv, 'POST', { changes: [
    { sessionId: s1.id, email: 'sv01@demo.vn', status: back(before[0]) },
    { sessionId: s2.id, email: 'sv01@demo.vn', status: back(before[1]) },
    { sessionId: s3.id, email: 'sv02@demo.vn', status: back(before[2]) },
  ] });
  kiemTra('Hoàn tác về trạng thái ban đầu', (await trangThaiCua(s1.id, 'sv01@demo.vn')) === before[0] && (await trangThaiCua(s3.id, 'sv02@demo.vn')) === before[2]);
  return soLoi;
}

// ===== Chạy lần lượt các bộ kiểm thử =====
const cacBo = [
  ['Luồng chính', kiemThuLuongChinh],
  ['Ảnh minh chứng của đơn xin vắng', kiemThuAnhMinhChung],
  ['Đến muộn sau khi đóng QR', kiemThuDenMuon],
  ['Lưu nhiều thay đổi sửa tay cùng lúc (cả lô hợp lệ hoặc không lưu gì)', kiemThuLuuNhieuThayDoi],
];
let tongLoi = 0;
for (const [ten, chay] of cacBo) {
  console.log(`\n=== ${ten} ===`);
  tongLoi += await chay();
}
console.log(tongLoi ? `\nCó ${tongLoi} kiểm tra thất bại` : '\nTất cả bộ kiểm thử đều đạt');
process.exit(tongLoi ? 1 : 0);
