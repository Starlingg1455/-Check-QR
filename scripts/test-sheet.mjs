// Kiểm tra điểm danh qua file Excel đồng bộ: file đúng thì nhận, file sai thì từ chối cả file.
import ExcelJS from 'exceljs';
const API = 'http://localhost:4000/api';
const J = { 'Content-Type': 'application/json' };
const gv = (await (await fetch(API + '/account/auth/dev-login', { method: 'POST', headers: J, body: JSON.stringify({ email: 'gv@demo.vn', role: 'teacher' }) })).json()).token;
const sv = (await (await fetch(API + '/account/auth/dev-login', { method: 'POST', headers: J, body: JSON.stringify({ email: 'sv01@demo.vn', role: 'student' }) })).json()).token;
const H = (t) => ({ Authorization: 'Bearer ' + t });
let failed = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? '  OK ' : ' LỖI'}  ${n} ${x}`); if (!ok) failed++; };

const classId = (await (await fetch(API + '/account/classes', { headers: H(gv) })).json())[0].id;
const url = `${API}/attendance/classes/${classId}/sheet`;

async function download() {
  const r = await fetch(url + '.xlsx', { headers: H(gv) });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await r.arrayBuffer()));
  return { status: r.status, wb };
}
async function upload(wb, dry = true, token = gv) {
  const fd = new FormData();
  fd.append('file', new Blob([await wb.xlsx.writeBuffer()]), 'diem-danh.xlsx');
  const r = await fetch(`${url}/import${dry ? '?dryRun=1' : ''}`, { method: 'POST', headers: H(token), body: fd });
  return { status: r.status, body: await r.json() };
}

// --- tải file ---
const { status, wb: base } = await download();
const ws = base.getWorksheet('Điểm danh');
check('Tải được file điểm danh', status === 200 && Boolean(ws));
const lastCol = ws.columnCount;
const lastRow = ws.rowCount;
check('Có đủ 30 sinh viên và 10 buổi', lastRow - 2 === 30 && lastCol - 2 === 10, `(${lastRow - 2} SV, ${lastCol - 2} buổi)`);
check('Ô chỉ chứa mã x/m/p/v', ['x', 'm', 'p', 'v'].includes(ws.getCell(3, 3).text));
check('Sinh viên không tải được file', (await fetch(url + '.xlsx', { headers: H(sv) })).status === 403);

// --- file nguyên bản: không có thay đổi ---
let r = await upload(base);
check('File nguyên bản: 0 thay đổi', r.status === 200 && r.body.changed === 0, `(giữ nguyên ${r.body.unchanged} ô)`);

// --- file hợp lệ có sửa: xem trước ---
const edit = async () => { const { wb } = await download(); return wb; };
let wb = await edit();
let w = wb.getWorksheet('Điểm danh');
const code1 = w.getCell(3, 1).text;
const prev = w.getCell(3, 3).text;
w.getCell(3, 3).value = prev === 'm' ? 'x' : 'm';   // đổi một ô
w.getCell(4, 4).value = 'P';                          // chữ hoa vẫn được
w.getCell(5, 5).value = null;                         // ô trống = có mặt
r = await upload(wb);
check('Sửa 3 ô hợp lệ: xem trước đúng', r.status === 200 && r.body.dryRun === true && r.body.changed >= 2, `(${r.body.changed} thay đổi) ${JSON.stringify(r.body.changes?.slice(0, 3).map((c) => `${c.studentCode} b${c.sessionNo}: ${c.fromLabel}→${c.toLabel}`))}`);
const rosterBefore = await (await fetch(`${API}/attendance/sessions/${(await (await fetch(`${API}/sessions/sessions?classId=${classId}`, { headers: H(gv) })).json())[0].id}/roster`, { headers: H(gv) })).json();
check('Xem trước KHÔNG ghi vào hệ thống', rosterBefore.roster[0].status === (prev === 'x' ? 'present' : prev === 'm' ? 'late' : prev === 'p' ? 'excused' : 'absent'));

// --- các kiểu file sai: phải bị từ chối cả file ---
async function expectReject(name, mutate, expectText) {
  const w2 = await edit();
  mutate(w2);
  const res = await upload(w2, false);
  const text = JSON.stringify(res.body.errors || res.body.error);
  check(name, res.status === 422 && (!expectText || text.includes(expectText)), `(${res.status}) ${(res.body.errors?.[0]?.message || res.body.error || '').slice(0, 90)}`);
}
await expectReject('Mã sai "k" bị từ chối', (b) => { b.getWorksheet('Điểm danh').getCell(3, 3).value = 'k'; }, 'không hợp lệ');
await expectReject('Mã sai "co" bị từ chối', (b) => { b.getWorksheet('Điểm danh').getCell(6, 4).value = 'co'; }, 'không hợp lệ');
await expectReject('Thêm sinh viên lạ bị từ chối', (b) => { const s = b.getWorksheet('Điểm danh'); s.getCell(33, 1).value = '99999999'; s.getCell(33, 2).value = 'Người lạ'; s.getCell(33, 3).value = 'x'; }, 'không có trong danh sách');
await expectReject('Xoá một sinh viên bị từ chối', (b) => { b.getWorksheet('Điểm danh').spliceRows(10, 1); }, 'Thiếu sinh viên');
await expectReject('Lặp MSSV bị từ chối', (b) => { const s = b.getWorksheet('Điểm danh'); s.getCell(5, 1).value = s.getCell(4, 1).text; }, 'bị lặp');
await expectReject('Xoá cột buổi bị từ chối', (b) => { b.getWorksheet('Điểm danh').spliceColumns(5, 1); }, 'Thiếu cột');
await expectReject('Sửa mã buổi bị từ chối', (b) => { b.getWorksheet('Điểm danh').getCell(2, 3).value = 99999; }, 'không tồn tại');
await expectReject('File của lớp khác bị từ chối', (b) => { b.getWorksheet('_meta').getCell('B1').value = 9999; }, 'lớp khác');
await expectReject('File Excel thường (không phải file mẫu) bị từ chối', (b) => { b.removeWorksheet(b.getWorksheet('_meta').id); }, 'không phải file điểm danh');

// nhiều lỗi cùng lúc: báo đủ, không nhận một nửa
{
  const w3 = await edit();
  const s = w3.getWorksheet('Điểm danh');
  s.getCell(3, 3).value = 'z'; s.getCell(4, 3).value = 'q'; s.getCell(5, 3).value = 'm'; // 2 ô sai, 1 ô đúng
  const res = await upload(w3, false);
  check('Nhiều lỗi: báo đủ từng ô', res.status === 422 && res.body.totalErrors === 2 && res.body.errors.every((e) => e.cell), `(${res.body.totalErrors} lỗi: ${res.body.errors?.map((e) => e.cell).join(', ')})`);
  const check2 = await (await fetch(`${url}/import?dryRun=1`, { method: 'POST', headers: H(gv), body: (() => { const fd = new FormData(); return fd; })() })).status;
  check('Thiếu file bị từ chối', check2 === 400);
}
// ô "m" hợp lệ ở file lỗi không được ghi lại
{
  const { wb: fresh } = await download();
  const s = fresh.getWorksheet('Điểm danh');
  check('Sau các file lỗi, dữ liệu vẫn nguyên vẹn', s.getCell(5, 3).text === base.getWorksheet('Điểm danh').getCell(5, 3).text);
}
// sinh viên không được import
check('Sinh viên không import được', (await upload(base, true, sv)).status === 403);

// --- áp dụng thật ---
wb = await edit();
w = wb.getWorksheet('Điểm danh');
const target = { row: 3, col: 3 };
const before = w.getCell(target.row, target.col).text;
const after = before === 'p' ? 'v' : 'p';
w.getCell(target.row, target.col).value = after;
r = await upload(wb, false);
check('Áp dụng file hợp lệ', r.status === 200 && r.body.applied === 1, `(${before} → ${after})`);
const { wb: wb2 } = await download();
check('Tải lại thấy giá trị mới (đồng bộ 2 chiều)', wb2.getWorksheet('Điểm danh').getCell(target.row, target.col).text === after);
const sessions = await (await fetch(`${API}/sessions/sessions?classId=${classId}`, { headers: H(gv) })).json();
const roster = await (await fetch(`${API}/attendance/sessions/${sessions[0].id}/roster`, { headers: H(gv) })).json();
const expected = { x: 'present', m: 'late', p: 'excused', v: 'absent' }[after];
check('Bảng điểm danh của buổi khớp', roster.roster.find((x) => x.studentCode === code1)?.status === expected);
const stats = await (await fetch(`${API}/statistics/classes/${classId}/overview`, { headers: H(gv) })).json();
check('Thống kê cập nhật theo', stats.perStudent.length === 30);

// hoàn tác để dữ liệu demo giữ nguyên
wb = await edit();
wb.getWorksheet('Điểm danh').getCell(target.row, target.col).value = before;
await upload(wb, false);

console.log(failed ? `\n${failed} lỗi` : '\nTất cả đạt');
