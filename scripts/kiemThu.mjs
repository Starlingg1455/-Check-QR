// Kiểm thử toàn bộ hệ thống qua API Gateway.  Chạy:  npm run kiem-thu   (hoặc: node scripts/kiemThu.mjs)
// Cần chạy sau khi đã bật backend và tạo dữ liệu giả (npm run tao-du-lieu-gia), vì các kiểm thử dựa vào lớp giả lập
// TH4318_23CN1 (40 sinh viên, 15 buổi). Các kiểm thử sẽ làm thay đổi dữ liệu: xoá thư mục dữ liệu (~/.diem-danh-qr) và tạo lại sau khi chạy.
const DIA_CHI_API = process.env.API_URL || 'http://localhost:4000/api';

// ---------------------------------------------------------------------------------------------
// Luồng chính: đăng nhập, phân quyền, mở buổi, mã QR, điểm danh, thống kê, xuất Excel, email cảnh báo, Swagger
// ---------------------------------------------------------------------------------------------
async function kiemThuLuongChinh() {
  let soLoi = 0;

  async function goiApi(path, { token, method = 'GET', body } = {}) {
    const res = await fetch(DIA_CHI_API + path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const loaiNoiDung = res.headers.get('content-type') || '';
    const data = loaiNoiDung.includes('json')
      ? await res.json()
      : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data };
  }
  const kiemTra = (name, dat, extra = '') => {
    console.log(`${dat ? '  OK ' : ' LỖI'}  ${name} ${extra}`);
    if (!dat) soLoi++;
  };

  const giangVien = (
    await goiApi('/account/auth/dev-login', {
      method: 'POST',
      body: { email: 'gv@demo.vn', role: 'teacher' },
    })
  ).data.token;
  const sinhVien = (
    await goiApi('/account/auth/dev-login', {
      method: 'POST',
      body: { email: 'sv01@demo.vn', role: 'student' },
    })
  ).data.token;
  const outsider = (
    await goiApi('/account/auth/dev-login', {
      method: 'POST',
      body: { email: 'la@demo.vn', role: 'student' },
    })
  ).data.token;

  const classes = (await goiApi('/account/classes', { token: giangVien })).data;
  const classId = classes[0].id;
  kiemTra(
    'Danh sách lớp của giảng viên',
    classes.length >= 1,
    `(${classes[0].code}, ${classes[0].student_count} SV)`,
  );

  // Phân quyền
  kiemTra(
    'Sinh viên không tạo được lớp',
    (
      await goiApi('/account/classes', {
        token: sinhVien,
        method: 'POST',
        body: { code: 'X', name: 'Y' },
      })
    ).status === 403,
  );
  kiemTra('Không đăng nhập bị 401', (await goiApi('/account/classes')).status === 401);

  // Mở buổi + QR + quét
  const open = await goiApi('/sessions/sessions', {
    token: giangVien,
    method: 'POST',
    body: { classId, title: 'Buổi test QR' },
  });
  kiemTra('Mở buổi điểm danh', open.status === 201, `(buổi #${open.data.sessionNo})`);
  const again = await goiApi('/sessions/sessions', {
    token: giangVien,
    method: 'POST',
    body: { classId },
  });
  kiemTra('Không mở được buổi thứ 2 khi chưa đóng', again.status === 409);
  const sessionId = open.data.id;

  const maQr = (await goiApi(`/sessions/sessions/${sessionId}/qr`, { token: giangVien })).data;
  kiemTra('Lấy mã QR', Boolean(maQr.token) && maQr.ttl === 30, `(${maQr.token})`);
  kiemTra(
    'Sinh viên không lấy được QR',
    (await goiApi(`/sessions/sessions/${sessionId}/qr`, { token: sinhVien })).status === 403,
  );

  const phanHoiLoi = await goiApi('/attendance/scan', {
    token: sinhVien,
    method: 'POST',
    body: { token: maQr.token.slice(0, -3) + 'abc' },
  });
  kiemTra('Mã QR giả bị từ chối', phanHoiLoi.status === 400);
  const stale = maQr.token.split('.');
  stale[1] = String(Number(stale[1]) - 5);
  kiemTra(
    'Mã QR cũ (hết hạn) bị từ chối',
    (
      await goiApi('/attendance/scan', {
        token: sinhVien,
        method: 'POST',
        body: { token: stale.join('.') },
      })
    ).status === 400,
  );
  kiemTra(
    'Người ngoài lớp không điểm danh được',
    (
      await goiApi('/attendance/scan', {
        token: outsider,
        method: 'POST',
        body: { token: maQr.token },
      })
    ).status === 403,
  );

  const scan = await goiApi('/attendance/scan', {
    token: sinhVien,
    method: 'POST',
    body: { token: maQr.token },
  });
  kiemTra(
    'Sinh viên quét QR điểm danh',
    scan.status === 200 && scan.data.status === 'present',
    `(${scan.data.status})`,
  );
  const scan2 = await goiApi('/attendance/scan', {
    token: sinhVien,
    method: 'POST',
    body: { token: maQr.token },
  });
  kiemTra('Quét lần 2 báo đã điểm danh', scan2.data.alreadyCheckedIn === true);

  const roster = (await goiApi(`/attendance/sessions/${sessionId}/roster`, { token: giangVien }))
    .data;
  kiemTra(
    'Bảng điểm danh buổi',
    roster.summary.present === 1 && roster.summary.total === 40,
    JSON.stringify(roster.summary),
  );

  const edit = await goiApi(`/attendance/sessions/${sessionId}/students/sv02%40demo.vn`, {
    token: giangVien,
    method: 'PUT',
    body: { status: 'late', note: 'Kẹt xe' },
  });
  kiemTra(
    'Giảng viên sửa tay (đi trễ)',
    edit.status === 200 && edit.data.status === 'late',
  );

  const closed = await goiApi(`/sessions/sessions/${sessionId}/close`, {
    token: giangVien,
    method: 'POST',
  });
  kiemTra('Đóng buổi', closed.data.status === 'closed');
  const afterClose = await goiApi('/attendance/scan', {
    token: sinhVien,
    method: 'POST',
    body: { token: maQr.token },
  });
  kiemTra(
    'Quét sau khi đóng buổi bị từ chối',
    afterClose.status === 410 || afterClose.data.alreadyCheckedIn === undefined,
  );

  // Đơn xin vắng
  // Dùng một sinh viên khác (sv03) gửi đơn cho buổi test để không đụng tới đơn demo
  const sinhVien3 = (
    await goiApi('/account/auth/dev-login', {
      method: 'POST',
      body: { email: 'sv03@demo.vn', role: 'student' },
    })
  ).data.token;
  const sent = await goiApi('/attendance/requests', {
    token: sinhVien3,
    method: 'POST',
    body: { classId, sessionId, reason: 'Test' },
  });
  kiemTra('Sinh viên gửi đơn xin vắng', sent.status === 201);
  const trung = await goiApi('/attendance/requests', {
    token: sinhVien3,
    method: 'POST',
    body: { classId, sessionId, reason: 'Test lại' },
  });
  kiemTra('Không gửi trùng đơn cho cùng buổi', trung.status === 409);
  const phanHoiTot = await goiApi(`/attendance/requests/${sent.data.id}`, {
    token: giangVien,
    method: 'PUT',
    body: { status: 'approved', teacherNote: 'OK' },
  });
  kiemTra('Duyệt đơn => vắng có phép', phanHoiTot.data.status === 'approved');

  // Thống kê
  const stats = (await goiApi(`/statistics/classes/${classId}/overview`, { token: giangVien }))
    .data;
  kiemTra(
    'Thống kê lớp',
    stats.closedSessions === 16 &&
      stats.perSession.length === 16 &&
      stats.perStudent.length === 40,
    `(tỉ lệ TB ${stats.avgRate}%, giới hạn vắng ${stats.absentLimit}, mức: ${JSON.stringify(stats.levels)})`,
  );
  const risk = (await goiApi(`/statistics/classes/${classId}/risk`, { token: giangVien })).data;
  kiemTra(
    'Danh sách sắp cấm thi',
    risk.students.length > 0,
    `(${risk.students.length} SV)`,
  );
  const home = (await goiApi('/statistics/overview', { token: giangVien })).data;
  kiemTra('Tổng quan giảng viên', home.classCount >= 1);
  const xlsx = await goiApi(`/statistics/classes/${classId}/export.xlsx`, { token: giangVien });
  kiemTra(
    'Xuất Excel',
    xlsx.status === 200 && xlsx.data.length > 4000 && xlsx.data[0] === 0x50,
    `(${xlsx.data.length} byte)`,
  );

  // Email cảnh báo (không có SMTP => ghi log)
  const warn = await goiApi('/attendance/warnings/send', {
    token: giangVien,
    method: 'POST',
    body: { classId },
  });
  kiemTra(
    'Gửi email cảnh báo',
    warn.status === 200 && warn.data.count === risk.students.length,
    `(${warn.data.count} email, chế độ: ${warn.data.results?.[0]?.status})`,
  );

  // Lịch sử của sinh viên
  const banThan = (await goiApi(`/attendance/classes/${classId}/me`, { token: sinhVien })).data;
  kiemTra(
    'Sinh viên xem lịch sử của mình',
    banThan.history.length === 16 && banThan.summary.sessions === 16,
    `(tỉ lệ ${banThan.summary.rate}%)`,
  );

  // Swagger
  for (const dichVu of ['account', 'sessions', 'attendance', 'statistics']) {
    const phanHoi = await goiApi(`/${dichVu}/openapi.json`);
    kiemTra(`Swagger ${dichVu}`, phanHoi.status === 200 && Boolean(phanHoi.data.paths));
  }

  // Dọn dẹp: xoá buổi test để không làm bẩn dữ liệu demo
  await goiApi(`/sessions/sessions/${sessionId}`, { token: giangVien, method: 'DELETE' });
  return soLoi;
}

// ---------------------------------------------------------------------------------------------
// Ảnh minh chứng của đơn xin vắng: gửi, xem, phân quyền, loại tệp
// ---------------------------------------------------------------------------------------------
async function kiemThuAnhMinhChung() {
  const DIA_CHI_API = 'http://localhost:4000/api';
  const TIEU_DE_JSON = { 'Content-Type': 'application/json' };
  const dangNhap = async (email, role) =>
    (
      await (
        await fetch(DIA_CHI_API + '/account/auth/dev-login', {
          method: 'POST',
          headers: TIEU_DE_JSON,
          body: JSON.stringify({ email, role }),
        })
      ).json()
    ).token;
  const giangVien = await dangNhap('gv@demo.vn', 'teacher');
  const sinhVien = await dangNhap('sv07@demo.vn', 'student');
  const other = await dangNhap('sv08@demo.vn', 'student');
  const tieuDeXacThuc = (token) => ({ Authorization: 'Bearer ' + token });
  let soLoi = 0;
  const kiemTra = (ten, dat, ghiChu = '') => {
    console.log(`${dat ? '  OK ' : ' LỖI'}  ${ten} ${ghiChu}`);
    if (!dat) soLoi++;
  };

  const classId = (
    await (await fetch(DIA_CHI_API + '/account/classes', { headers: tieuDeXacThuc(giangVien) })).json()
  )[0].id;
  const sessions = await (
    await fetch(`${DIA_CHI_API}/sessions/sessions?classId=${classId}`, { headers: tieuDeXacThuc(giangVien) })
  ).json();
  const sessionId = sessions[2].id;

  // ảnh PNG 1x1 hợp lệ
  const anhPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const duLieuForm = new FormData();
  duLieuForm.append('classId', classId);
  duLieuForm.append('sessionId', sessionId);
  duLieuForm.append('reason', 'Có giấy khám bệnh');
  duLieuForm.append('files', new Blob([anhPng], { type: 'image/png' }), 'giấy-khám.png');
  const phanHoi = await fetch(DIA_CHI_API + '/attendance/requests', {
    method: 'POST',
    headers: tieuDeXacThuc(sinhVien),
    body: duLieuForm,
  });
  const req = await phanHoi.json();
  kiemTra(
    'Gửi đơn kèm ảnh',
    phanHoi.status === 201 && req.files.length === 1,
    `(${phanHoi.status}) ${JSON.stringify(req.files)}`,
  );
  kiemTra(
    'Tên file tiếng Việt giữ nguyên',
    req.files[0]?.name === 'giấy-khám.png',
    req.files[0]?.name,
  );

  const tep = req.files[0];
  const phanHoiTot = await fetch(`${DIA_CHI_API}/attendance/requests/${req.id}/files/${tep.id}`, {
    headers: tieuDeXacThuc(giangVien),
  });
  const body = Buffer.from(await phanHoiTot.arrayBuffer());
  kiemTra(
    'Giảng viên xem được ảnh',
    phanHoiTot.status === 200 &&
      phanHoiTot.headers.get('content-type') === 'image/png' &&
      body.equals(anhPng),
  );
  kiemTra(
    'Sinh viên gửi đơn xem được ảnh',
    (
      await fetch(`${DIA_CHI_API}/attendance/requests/${req.id}/files/${tep.id}`, {
        headers: tieuDeXacThuc(sinhVien),
      })
    ).status === 200,
  );
  kiemTra(
    'Sinh viên khác không xem được',
    (
      await fetch(`${DIA_CHI_API}/attendance/requests/${req.id}/files/${tep.id}`, {
        headers: tieuDeXacThuc(other),
      })
    ).status === 403,
  );
  kiemTra(
    'Không đăng nhập bị chặn',
    (await fetch(`${DIA_CHI_API}/attendance/requests/${req.id}/files/${tep.id}`)).status ===
      401,
  );

  const list = await (
    await fetch(`${DIA_CHI_API}/attendance/requests?classId=${classId}`, {
      headers: tieuDeXacThuc(giangVien),
    })
  ).json();
  kiemTra(
    'Danh sách đơn của giảng viên có kèm ảnh',
    list.find((don) => don.id === req.id)?.files.length === 1,
  );

  const hist = await (
    await fetch(`${DIA_CHI_API}/attendance/classes/${classId}/me`, { headers: tieuDeXacThuc(sinhVien) })
  ).json();
  kiemTra(
    'Lịch sử sinh viên có kèm ảnh',
    hist.history.find((dong) => dong.sessionId === sessionId)?.request?.files.length === 1,
  );

  // file không phải ảnh bị từ chối
  const duLieuForm2 = new FormData();
  duLieuForm2.append('classId', classId);
  duLieuForm2.append('sessionId', sessions[3].id);
  duLieuForm2.append('reason', 'x');
  duLieuForm2.append('files', new Blob(['hello'], { type: 'text/plain' }), 'a.txt');
  const phanHoiLoi = await fetch(DIA_CHI_API + '/attendance/requests', {
    method: 'POST',
    headers: tieuDeXacThuc(sinhVien),
    body: duLieuForm2,
  });
  kiemTra('Từ chối file không phải ảnh', phanHoiLoi.status === 400);

  // gửi JSON không ảnh vẫn chạy (tương thích cũ)
  const noimg = await fetch(DIA_CHI_API + '/attendance/requests', {
    method: 'POST',
    headers: { ...TIEU_DE_JSON, ...tieuDeXacThuc(sinhVien) },
    body: JSON.stringify({ classId, sessionId: sessions[4].id, reason: 'Không ảnh' }),
  });
  kiemTra(
    'Gửi đơn không ảnh vẫn được',
    noimg.status === 201 && (await noimg.json()).files.length === 0,
  );
  return soLoi;
}

// ---------------------------------------------------------------------------------------------
// Đến muộn sau khi đóng QR: giảng viên sửa tay trạng thái
// ---------------------------------------------------------------------------------------------
async function kiemThuDenMuon() {
  const TIEU_DE_JSON = { 'Content-Type': 'application/json' };
  const dangNhap = async (email, role) =>
    await (
      await fetch(DIA_CHI_API + '/account/auth/dev-login', {
        method: 'POST',
        headers: TIEU_DE_JSON,
        body: JSON.stringify({ email, role }),
      })
    ).json();
  const tieuDeXacThuc = (token) => ({ Authorization: 'Bearer ' + token });
  let soLoi = 0;
  const kiemTra = (ten, dat, ghiChu = '') => {
    console.log(`${dat ? '  OK ' : ' LỖI'}  ${ten} ${ghiChu}`);
    if (!dat) soLoi++;
  };
  const goiApi = async (path, token, method = 'GET', body) => {
    const phanHoi = await fetch(DIA_CHI_API + path, {
      method,
      headers: { ...tieuDeXacThuc(token), ...(body ? TIEU_DE_JSON : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: phanHoi.status, body: await phanHoi.json().catch(() => null) };
  };

  const giangVien = (await dangNhap('gv@demo.vn', 'teacher')).token;
  const classId = (await goiApi('/account/classes', giangVien)).body[0].id;

  // 1) Mở một buổi mới, một sinh viên quét QR đúng giờ, rồi đóng buổi
  const open = (
    await goiApi('/sessions/sessions', giangVien, 'POST', {
      classId,
      title: 'Buổi thử đến muộn',
    })
  ).body;
  const maQr = (await goiApi(`/sessions/sessions/${open.id}/qr`, giangVien)).body;
  const onTime = await dangNhap('sv01@demo.vn', 'student');
  const scan = await goiApi('/attendance/scan', onTime.token, 'POST', {
    token: maQr.token,
  });
  kiemTra(
    'Sinh viên đến đúng giờ quét được',
    scan.status === 200 && scan.body.status === 'present',
  );
  kiemTra(
    'Đóng buổi',
    (await goiApi(`/sessions/sessions/${open.id}/close`, giangVien, 'POST')).body.status ===
      'closed',
  );

  // 2) Bạn đến muộn: không quét được nữa (QR đã đóng)
  const late = await dangNhap('sv02@demo.vn', 'student');
  kiemTra(
    'Buổi đã đóng: không lấy được QR mới',
    (await goiApi(`/sessions/sessions/${open.id}/qr`, giangVien)).status === 409,
  );
  kiemTra(
    'Quét bằng mã cũ bị từ chối',
    (await goiApi('/attendance/scan', late.token, 'POST', { token: maQr.token })).status ===
      410,
  );
  const before = (
    await goiApi(`/attendance/sessions/${open.id}/roster`, giangVien)
  ).body.roster.find((dong) => dong.email === 'sv02@demo.vn');
  kiemTra('Bạn đến muộn đang bị tính là vắng', before.status === 'absent');

  // 3) Giảng viên sửa tay (buổi đã đóng vẫn sửa được)
  kiemTra(
    'Sinh viên không tự sửa được trạng thái',
    (
      await goiApi(
        `/attendance/sessions/${open.id}/students/sv02%40demo.vn`,
        late.token,
        'PUT',
        { status: 'present' },
      )
    ).status === 403,
  );
  const edit = await goiApi(
    `/attendance/sessions/${open.id}/students/sv02%40demo.vn`,
    giangVien,
    'PUT',
    { status: 'late' },
  );
  kiemTra(
    'Giảng viên sửa tay thành "Đi muộn"',
    edit.status === 200 && edit.body.status === 'late' && edit.body.source === 'manual',
  );
  const after = (await goiApi(`/attendance/sessions/${open.id}/roster`, giangVien)).body;
  kiemTra(
    'Bảng điểm danh cập nhật (đi muộn, nguồn giảng viên sửa)',
    after.roster.find((dong) => dong.email === 'sv02@demo.vn').status === 'late',
  );
  kiemTra(
    'Roster có lateMinutes để hiện quy tắc đi muộn',
    Number.isInteger(after.lateMinutes),
    `(${after.lateMinutes} phút)`,
  );

  // 4) Sửa lại sai sót: đổi sang có phép rồi có mặt
  kiemTra(
    'Đổi sang "Có phép"',
    (
      await goiApi(`/attendance/sessions/${open.id}/students/sv02%40demo.vn`, giangVien, 'PUT', {
        status: 'excused',
      })
    ).body.status === 'excused',
  );
  kiemTra(
    'Đổi sang "Có mặt"',
    (
      await goiApi(`/attendance/sessions/${open.id}/students/sv02%40demo.vn`, giangVien, 'PUT', {
        status: 'present',
      })
    ).body.status === 'present',
  );
  kiemTra(
    'Trạng thái không hợp lệ bị từ chối',
    (
      await goiApi(`/attendance/sessions/${open.id}/students/sv02%40demo.vn`, giangVien, 'PUT', {
        status: 'abc',
      })
    ).status === 400,
  );
  await goiApi(`/attendance/sessions/${open.id}/students/sv02%40demo.vn`, giangVien, 'PUT', {
    status: 'late',
  });

  // 5) Thống kê tính bạn đi muộn là có mặt
  const stats = (await goiApi(`/statistics/classes/${classId}/overview`, giangVien)).body;
  const thongKeBuoi = stats.perSession.find((buoi) => buoi.sessionId === open.id);
  kiemTra(
    'Thống kê: bạn đi muộn nằm ở nhóm "Đi muộn" và được tính có mặt',
    thongKeBuoi.lists.late.some((sinhVien) => sinhVien.fullName) && thongKeBuoi.present === 1 && thongKeBuoi.late === 1,
    `(có mặt ${thongKeBuoi.present}, muộn ${thongKeBuoi.late}, vắng ${thongKeBuoi.absent})`,
  );

  // dọn: xoá buổi thử
  await goiApi(`/sessions/sessions/${open.id}`, giangVien, 'DELETE');
  return soLoi;
}

// ---------------------------------------------------------------------------------------------
// Lưu nhiều thay đổi sửa tay cùng lúc (cả lô hợp lệ hoặc không lưu gì)
// ---------------------------------------------------------------------------------------------
async function kiemThuLuuNhieuThayDoi() {
  const TIEU_DE_JSON = { 'Content-Type': 'application/json' };
  const dangNhap = async (email, role) =>
    (
      await (
        await fetch(DIA_CHI_API + '/account/auth/dev-login', {
          method: 'POST',
          headers: TIEU_DE_JSON,
          body: JSON.stringify({ email, role }),
        })
      ).json()
    ).token;
  const tieuDeXacThuc = (token) => ({ Authorization: 'Bearer ' + token });
  let soLoi = 0;
  const kiemTra = (ten, dat, ghiChu = '') => {
    console.log(`${dat ? '  OK ' : ' LỖI'}  ${ten} ${ghiChu}`);
    if (!dat) soLoi++;
  };
  const goiApi = async (path, token, method = 'GET', body) => {
    const phanHoi = await fetch(DIA_CHI_API + path, {
      method,
      headers: { ...tieuDeXacThuc(token), ...(body ? TIEU_DE_JSON : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: phanHoi.status, body: await phanHoi.json().catch(() => null) };
  };

  const giangVien = await dangNhap('gv@demo.vn', 'teacher');
  const sinhVien = await dangNhap('sv01@demo.vn', 'student');
  const classId = (await goiApi('/account/classes', giangVien)).body[0].id;
  const sessions = (await goiApi(`/sessions/sessions?classId=${classId}`, giangVien)).body;
  const [buoi1, buoi2, buoi3] = sessions;
  const duongDan = `/attendance/classes/${classId}/changes`;
  const trangThaiCua = async (maBuoi, email) =>
    (await goiApi(`/attendance/sessions/${maBuoi}/roster`, giangVien)).body.roster.find(
      (dong) => dong.email === email,
    ).status;

  const before = [
    await trangThaiCua(buoi1.id, 'sv01@demo.vn'),
    await trangThaiCua(buoi2.id, 'sv01@demo.vn'),
    await trangThaiCua(buoi3.id, 'sv02@demo.vn'),
  ];

  // 1) lô hợp lệ nhiều buổi, nhiều sinh viên, lưu một lần
  const phanHoiTot = await goiApi(duongDan, giangVien, 'POST', {
    changes: [
      { sessionId: buoi1.id, email: 'sv01@demo.vn', status: 'late' },
      { sessionId: buoi2.id, email: 'sv01@demo.vn', status: 'excused' },
      { sessionId: buoi3.id, email: 'sv02@demo.vn', status: 'absent' },
    ],
  });
  kiemTra(
    'Lưu lô hợp lệ',
    phanHoiTot.status === 200 && phanHoiTot.body.applied >= 2,
    JSON.stringify(phanHoiTot.body),
  );
  kiemTra(
    'Các ô đã đổi đúng',
    (await trangThaiCua(buoi1.id, 'sv01@demo.vn')) === 'late' &&
      (await trangThaiCua(buoi2.id, 'sv01@demo.vn')) === 'excused' &&
      (await trangThaiCua(buoi3.id, 'sv02@demo.vn')) === 'absent',
  );
  const banGhi = (await goiApi(`/attendance/sessions/${buoi1.id}/roster`, giangVien)).body.roster.find(
    (dong) => dong.email === 'sv01@demo.vn',
  );
  kiemTra('Ghi nhận nguồn "giảng viên sửa"', banGhi.source === 'manual');

  // 2) lưu lại đúng giá trị cũ: không có gì thay đổi
  const same = await goiApi(duongDan, giangVien, 'POST', {
    changes: [{ sessionId: buoi1.id, email: 'sv01@demo.vn', status: 'late' }],
  });
  kiemTra(
    'Lưu đúng giá trị hiện tại: không ghi gì',
    same.status === 200 && same.body.applied === 0,
  );

  // 3) một thay đổi sai => từ chối CẢ lô, không ghi một phần
  const trangThaiGiua = await trangThaiCua(buoi1.id, 'sv01@demo.vn');
  const phanHoiLoi = await goiApi(duongDan, giangVien, 'POST', {
    changes: [
      { sessionId: buoi1.id, email: 'sv01@demo.vn', status: 'present' }, // hợp lệ
      { sessionId: buoi2.id, email: 'sv01@demo.vn', status: 'khong-hop-le' }, // sai
    ],
  });
  kiemTra('Trạng thái sai: từ chối cả lô', phanHoiLoi.status === 400);
  kiemTra(
    '...và thay đổi hợp lệ đi kèm KHÔNG bị ghi',
    (await trangThaiCua(buoi1.id, 'sv01@demo.vn')) === trangThaiGiua,
  );
  kiemTra(
    'Buổi không thuộc lớp bị từ chối',
    (
      await goiApi(duongDan, giangVien, 'POST', {
        changes: [{ sessionId: 999999, email: 'sv01@demo.vn', status: 'present' }],
      })
    ).status === 400,
  );
  kiemTra(
    'Sinh viên lạ bị từ chối',
    (
      await goiApi(duongDan, giangVien, 'POST', {
        changes: [{ sessionId: buoi1.id, email: 'la@demo.vn', status: 'present' }],
      })
    ).status === 400,
  );
  kiemTra(
    'Danh sách rỗng bị từ chối',
    (await goiApi(duongDan, giangVien, 'POST', { changes: [] })).status === 400,
  );

  // 4) phân quyền
  kiemTra(
    'Sinh viên không lưu được',
    (
      await goiApi(duongDan, sinhVien, 'POST', {
        changes: [{ sessionId: buoi1.id, email: 'sv01@demo.vn', status: 'present' }],
      })
    ).status === 403,
  );
  kiemTra(
    'Chưa đăng nhập bị chặn',
    (await goiApi(duongDan, '', 'POST', { changes: [] })).status === 401,
  );

  // 5) thay đổi lặp cho cùng một ô: lấy cái cuối
  const last = await goiApi(duongDan, giangVien, 'POST', {
    changes: [
      { sessionId: buoi1.id, email: 'sv01@demo.vn', status: 'absent' },
      { sessionId: buoi1.id, email: 'sv01@demo.vn', status: 'present' },
    ],
  });
  kiemTra(
    'Cùng một ô sửa nhiều lần: lấy giá trị cuối',
    last.status === 200 && (await trangThaiCua(buoi1.id, 'sv01@demo.vn')) === 'present',
  );

  // hoàn tác về như ban đầu
  const back = (s) =>
    ({ present: 'present', late: 'late', excused: 'excused', absent: 'absent' })[s];
  await goiApi(duongDan, giangVien, 'POST', {
    changes: [
      { sessionId: buoi1.id, email: 'sv01@demo.vn', status: back(before[0]) },
      { sessionId: buoi2.id, email: 'sv01@demo.vn', status: back(before[1]) },
      { sessionId: buoi3.id, email: 'sv02@demo.vn', status: back(before[2]) },
    ],
  });
  kiemTra(
    'Hoàn tác về trạng thái ban đầu',
    (await trangThaiCua(buoi1.id, 'sv01@demo.vn')) === before[0] &&
      (await trangThaiCua(buoi3.id, 'sv02@demo.vn')) === before[2],
  );
  return soLoi;
}

// ===== Chạy lần lượt các bộ kiểm thử =====
const cacBo = [
  ['Luồng chính', kiemThuLuongChinh],
  ['Ảnh minh chứng của đơn xin vắng', kiemThuAnhMinhChung],
  ['Đến muộn sau khi đóng QR', kiemThuDenMuon],
  [
    'Lưu nhiều thay đổi sửa tay cùng lúc (cả lô hợp lệ hoặc không lưu gì)',
    kiemThuLuuNhieuThayDoi,
  ],
];
let tongLoi = 0;
for (const [ten, chay] of cacBo) {
  console.log(`\n=== ${ten} ===`);
  tongLoi += await chay();
}
console.log(
  tongLoi ? `\nCó ${tongLoi} kiểm tra thất bại` : '\nTất cả bộ kiểm thử đều đạt',
);
process.exit(tongLoi ? 1 : 0);
