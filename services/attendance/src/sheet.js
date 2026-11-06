// Điểm danh qua file Excel "đồng bộ":
//   - Tải về: file chứa đúng danh sách sinh viên + các buổi hiện tại của lớp, mỗi ô là một mã.
//   - Tải lên: file phải khớp hoàn toàn với hệ thống (cùng lớp, cùng sinh viên, cùng các buổi, mã hợp lệ),
//     nếu có BẤT KỲ lỗi nào thì từ chối cả file và liệt kê các ô lỗi. Không có chuyện nhận một nửa.
import { Router } from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import { requireAuth, requireRole } from './auth.js';
import { HttpError, callService } from './http.js';

const ACCOUNT_URL = process.env.ACCOUNT_URL || 'http://localhost:4001';
const SESSION_URL = process.env.SESSION_URL || 'http://localhost:4002';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Quy ước mã trong ô
const TO_CODE = { present: 'x', late: 'm', excused: 'p', absent: 'v' };
const FROM_CODE = { '': 'present', x: 'present', m: 'late', p: 'excused', v: 'absent' }; // ô trống = có mặt
const LABEL = { present: 'Có mặt', late: 'Đi muộn', excused: 'Có phép', absent: 'Vắng' };

const SHEET = 'Điểm danh';
const META = '_meta';
const FIRST_COL = 3; // cột C: buổi đầu tiên (A = MSSV, B = Họ tên)
const FIRST_ROW = 3; // dòng 1 = tên buổi, dòng 2 = mã buổi, từ dòng 3 là sinh viên
const MAX_CHANGES = 6000;

export function createSheetRoutes(db) {
  const r = Router();

  // Lấy dữ liệu hiện tại của lớp (đồng thời kiểm tra quyền giảng viên)
  async function load(classId, token) {
    const cls = await callService(ACCOUNT_URL, `/classes/${classId}`, { token });
    if (!cls.isOwner) throw new HttpError(403, 'Chỉ giảng viên của lớp được thực hiện');
    const [students, sessions] = await Promise.all([
      callService(ACCOUNT_URL, `/classes/${cls.id}/students`, { token }),
      callService(SESSION_URL, `/sessions?classId=${cls.id}`, { token }),
    ]);
    const records = await db.query('SELECT session_id, student_email, status FROM attendance.records WHERE class_id=$1', [cls.id]);
    const current = new Map(records.map((x) => [`${x.session_id}|${x.student_email}`, x.status]));
    return { cls, students, sessions, current };
  }

  // ---------- Tải file về ----------
  r.get('/classes/:classId/sheet.xlsx', requireAuth, requireRole('teacher'), async (req, res) => {
    const { cls, students, sessions, current } = await load(req.params.classId, req.token);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Hệ thống điểm danh QR';
    const ws = wb.addWorksheet(SHEET, { views: [{ state: 'frozen', xSplit: 2, ySplit: 2 }] });
    const lastCol = FIRST_COL + sessions.length - 1;

    ws.getColumn(1).width = 14;
    ws.getColumn(2).width = 28;
    ws.getCell('A1').value = 'MSSV';
    ws.getCell('B1').value = 'Họ tên';
    ws.getCell('A2').value = 'Mã buổi (không sửa)';
    ws.getCell('B2').value = '';
    sessions.forEach((s, i) => {
      const col = FIRST_COL + i;
      ws.getColumn(col).width = 9;
      ws.getCell(1, col).value = `Buổi ${s.sessionNo}`;
      ws.getCell(2, col).value = s.id;
    });
    // Tiêu đề + dòng mã buổi
    for (let c = 1; c <= Math.max(lastCol, 2); c++) {
      const h = ws.getCell(1, c);
      h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2A78D6' } };
      h.alignment = { horizontal: c >= FIRST_COL ? 'center' : 'left', vertical: 'middle' };
      const m = ws.getCell(2, c);
      m.font = { italic: true, size: 9, color: { argb: 'FF898781' } };
      m.alignment = { horizontal: c >= FIRST_COL ? 'center' : 'left' };
    }

    // Dòng sinh viên
    students.forEach((st, i) => {
      const row = FIRST_ROW + i;
      ws.getCell(row, 1).value = String(st.student_code);
      ws.getCell(row, 1).numFmt = '@';
      ws.getCell(row, 2).value = st.full_name;
      sessions.forEach((s, j) => {
        const status = current.get(`${s.id}|${st.email.toLowerCase()}`) || 'absent';
        const cell = ws.getCell(row, FIRST_COL + j);
        cell.value = TO_CODE[status];
        cell.alignment = { horizontal: 'center' };
      });
    });

    if (students.length && sessions.length) {
      const range = `${ws.getColumn(FIRST_COL).letter}${FIRST_ROW}:${ws.getColumn(lastCol).letter}${FIRST_ROW + students.length - 1}`;
      // Menu chọn x / m / p / v (cho phép để trống)
      for (let row = FIRST_ROW; row < FIRST_ROW + students.length; row++) {
        for (let col = FIRST_COL; col <= lastCol; col++) {
          ws.getCell(row, col).dataValidation = {
            type: 'list', allowBlank: true, formulae: ['"x,m,p,v"'], showErrorMessage: true,
            errorTitle: 'Mã không hợp lệ', error: 'Chỉ dùng x (có mặt), m (muộn), p (có phép), v (vắng) hoặc để trống (có mặt).',
          };
        }
      }
      // Tô màu theo mã, đổi mã là màu đổi theo
      const fill = (argb) => ({ fill: { type: 'pattern', pattern: 'solid', bgColor: { argb } } });
      ws.addConditionalFormatting({
        ref: range,
        rules: [
          { type: 'cellIs', operator: 'equal', formulae: ['"v"'], style: fill('FFFEE2E2') },
          { type: 'cellIs', operator: 'equal', formulae: ['"m"'], style: fill('FFFEF3C7') },
          { type: 'cellIs', operator: 'equal', formulae: ['"p"'], style: fill('FFDBEAFE') },
          { type: 'cellIs', operator: 'equal', formulae: ['"x"'], style: fill('FFDCFCE7') },
        ],
      });
    }

    // Sheet hướng dẫn
    const guide = wb.addWorksheet('Hướng dẫn');
    guide.getColumn(1).width = 12;
    guide.getColumn(2).width = 70;
    guide.addRows([
      ['Mã', 'Ý nghĩa'],
      ['x', 'Có mặt (để trống ô cũng là có mặt)'],
      ['m', 'Đi muộn (tính là có mặt)'],
      ['p', 'Vắng có phép (không tính vào số buổi vắng)'],
      ['v', 'Vắng không phép'],
      [],
      ['Lưu ý', 'Chỉ sửa các ô mã trong sheet "Điểm danh". Không thêm/xoá/đổi MSSV, không sửa dòng "Mã buổi", không xoá cột.'],
      ['', 'Khi tải lên, file phải khớp 100% với danh sách sinh viên và các buổi hiện có của lớp, nếu không hệ thống sẽ từ chối cả file.'],
      ['', 'Nếu lớp có thêm buổi/sinh viên mới sau khi bạn tải file này, hãy tải lại file mới rồi sửa.'],
    ]);
    guide.getRow(1).font = { bold: true };
    guide.getColumn(1).font = { bold: true };

    // Sheet ẩn: ghi nhớ file này thuộc lớp nào
    const meta = wb.addWorksheet(META, { state: 'hidden' });
    meta.getCell('A1').value = 'classId';
    meta.getCell('B1').value = cls.id;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="diem-danh-${encodeURIComponent(cls.code)}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  });

  // ---------- Tải file lên ----------
  // ?dryRun=1 : chỉ kiểm tra + cho xem trước các thay đổi, chưa ghi gì.
  r.post('/classes/:classId/sheet/import', requireAuth, requireRole('teacher'), upload.single('file'), async (req, res) => {
    const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';
    const { cls, students, sessions, current } = await load(req.params.classId, req.token);
    if (!req.file) throw new HttpError(400, 'Chưa chọn file Excel');

    const wb = new ExcelJS.Workbook();
    try { await wb.xlsx.load(req.file.buffer); } catch { throw new HttpError(400, 'Không đọc được file. Hãy dùng file .xlsx do hệ thống xuất.'); }

    const errors = [];
    const fail = (message, cell) => errors.push({ cell: cell || null, message });
    const reject = () => res.status(422).json({
      error: `File chưa đồng bộ với hệ thống (${errors.length} lỗi). Hãy sửa file rồi tải lại, hoặc tải file mới nếu lớp có thay đổi.`,
      errors: errors.slice(0, 50), totalErrors: errors.length,
    });

    const ws = wb.getWorksheet(SHEET);
    const meta = wb.getWorksheet(META);
    if (!ws || !meta) {
      fail('Đây không phải file điểm danh do hệ thống xuất (thiếu sheet "Điểm danh"). Hãy bấm "Tải file điểm danh" để lấy file mẫu.');
      return reject();
    }
    if (Number(meta.getCell('B1').value) !== cls.id) {
      fail('File này thuộc lớp khác. Hãy tải file điểm danh của đúng lớp này.');
      return reject();
    }

    // 1) Các cột buổi học phải khớp đúng với các buổi hiện có
    const sessionById = new Map(sessions.map((s) => [s.id, s]));
    const columns = []; // { col, session }
    const seenSessions = new Set();
    for (let c = FIRST_COL; c <= ws.columnCount; c++) {
      const letter = ws.getColumn(c).letter;
      const raw = ws.getCell(2, c).text.trim();
      if (!raw) {
        if (ws.getCell(1, c).text.trim()) fail(`Cột ${letter} ("${ws.getCell(1, c).text.trim()}") bị mất mã buổi ở dòng 2.`, `${letter}2`);
        continue;
      }
      const id = Number(raw);
      if (!Number.isInteger(id) || !sessionById.has(id)) fail(`Cột ${letter}: mã buổi "${raw}" không tồn tại trong lớp (buổi đã bị xoá hoặc file đã bị sửa).`, `${letter}2`);
      else if (seenSessions.has(id)) fail(`Cột ${letter}: buổi ${sessionById.get(id).sessionNo} bị lặp.`, `${letter}2`);
      else { seenSessions.add(id); columns.push({ col: c, session: sessionById.get(id) }); }
    }
    for (const s of sessions) {
      if (!seenSessions.has(s.id)) fail(`Thiếu cột "Buổi ${s.sessionNo}". Lớp có buổi mới hoặc bạn đã xoá cột. Hãy tải lại file mới.`);
    }

    // 2) Danh sách sinh viên phải khớp đúng (không thiếu, không thừa, không lặp)
    const byCode = new Map(students.map((s) => [String(s.student_code), s]));
    const seenStudents = new Set();
    const changes = [];
    let unchanged = 0;
    for (let rn = FIRST_ROW; rn <= ws.rowCount; rn++) {
      const code = ws.getCell(rn, 1).text.trim();
      const hasAny = ws.getCell(rn, 2).text.trim() || columns.some(({ col }) => ws.getCell(rn, col).text.trim());
      if (!code) {
        if (hasAny) fail(`Dòng ${rn}: thiếu MSSV.`, `A${rn}`);
        continue;
      }
      const student = byCode.get(code);
      if (!student) { fail(`Dòng ${rn}: MSSV "${code}" không có trong danh sách lớp.`, `A${rn}`); continue; }
      if (seenStudents.has(code)) { fail(`Dòng ${rn}: MSSV "${code}" bị lặp.`, `A${rn}`); continue; }
      seenStudents.add(code);

      // 3) Mỗi ô phải là x / m / p / v hoặc trống
      for (const { col, session } of columns) {
        const addr = `${ws.getColumn(col).letter}${rn}`;
        const raw = ws.getCell(rn, col).text.trim().toLowerCase();
        if (!Object.hasOwn(FROM_CODE, raw)) { fail(`Ô ${addr} (${student.full_name}, buổi ${session.sessionNo}): "${raw}" không hợp lệ. Chỉ dùng x, m, p, v hoặc để trống.`, addr); continue; }
        const to = FROM_CODE[raw];
        const from = current.get(`${session.id}|${student.email.toLowerCase()}`) || 'absent';
        if (from === to) unchanged++;
        else changes.push({ sessionId: session.id, sessionNo: session.sessionNo, email: student.email.toLowerCase(), studentCode: student.student_code, fullName: student.full_name, from, to });
      }
    }
    for (const s of students) {
      if (!seenStudents.has(String(s.student_code))) fail(`Thiếu sinh viên ${s.student_code} - ${s.full_name}. Hãy tải lại file mới nếu vừa thêm sinh viên.`);
    }

    if (errors.length > 0) return reject();
    if (changes.length > MAX_CHANGES) throw new HttpError(400, `Quá nhiều thay đổi một lần (${changes.length}). Tối đa ${MAX_CHANGES}.`);

    const summary = {
      ok: true, dryRun, changed: changes.length, unchanged,
      changes: changes.slice(0, 200).map((c) => ({ studentCode: c.studentCode, fullName: c.fullName, sessionNo: c.sessionNo, from: c.from, to: c.to, fromLabel: LABEL[c.from], toLabel: LABEL[c.to] })),
    };
    if (dryRun || changes.length === 0) return res.json(summary);

    // Ghi một lần bằng MỘT câu lệnh SQL (nguyên tử: hoặc ghi hết, hoặc không ghi gì)
    const studentByEmail = new Map(students.map((s) => [s.email.toLowerCase(), s]));
    const params = [];
    const values = changes.map((c) => {
      const st = studentByEmail.get(c.email);
      const base = params.length;
      params.push(c.sessionId, cls.id, c.email, st.student_code, st.full_name, c.to);
      return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},'import','Cập nhật từ file Excel')`;
    });
    await db.query(
      `INSERT INTO attendance.records (session_id, class_id, student_email, student_code, student_name, status, source, note)
       VALUES ${values.join(',')}
       ON CONFLICT (session_id, student_email)
       DO UPDATE SET status=EXCLUDED.status, source='import', note=EXCLUDED.note, checked_at=now()`,
      params,
    );
    res.json({ ...summary, applied: changes.length });
  });

  // ---------- Lưu nhiều thay đổi sửa tay cùng lúc ----------
  // Giảng viên sửa nhiều ô rồi bấm "Lưu" một lần: hoặc lưu hết, hoặc không lưu gì (một câu lệnh SQL).
  // Body: { changes: [{ sessionId, email, status }] }
  r.post('/classes/:classId/changes', requireAuth, requireRole('teacher'), async (req, res) => {
    const list = req.body?.changes;
    if (!Array.isArray(list) || list.length === 0) throw new HttpError(400, 'Không có thay đổi nào để lưu');
    if (list.length > MAX_CHANGES) throw new HttpError(400, `Quá nhiều thay đổi một lần (tối đa ${MAX_CHANGES})`);

    const { cls, students, sessions, current } = await load(req.params.classId, req.token);
    const sessionIds = new Set(sessions.map((s) => s.id));
    const byEmail = new Map(students.map((s) => [s.email.toLowerCase(), s]));

    // Kiểm tra TOÀN BỘ trước khi ghi: một thay đổi sai là từ chối cả lô
    const wanted = new Map(); // "sessionId|email" -> status (thay đổi sau ghi đè thay đổi trước)
    for (const [i, c] of list.entries()) {
      const email = String(c?.email || '').toLowerCase();
      if (!sessionIds.has(Number(c?.sessionId))) throw new HttpError(400, `Thay đổi #${i + 1}: buổi học không thuộc lớp này`);
      if (!byEmail.has(email)) throw new HttpError(400, `Thay đổi #${i + 1}: sinh viên không thuộc lớp này`);
      if (!Object.hasOwn(TO_CODE, c?.status)) throw new HttpError(400, `Thay đổi #${i + 1}: trạng thái phải là present, late, excused hoặc absent`);
      wanted.set(`${Number(c.sessionId)}|${email}`, c.status);
    }

    // Chỉ ghi những ô thật sự khác với hiện tại
    const diffs = [];
    for (const [key, status] of wanted) {
      const from = current.get(key) || 'absent';
      if (from !== status) diffs.push({ key, status });
    }
    if (diffs.length > 0) {
      const params = [];
      const values = diffs.map(({ key, status }) => {
        const [sid, email] = key.split('|');
        const st = byEmail.get(email);
        const base = params.length;
        params.push(Number(sid), cls.id, email, st.student_code, st.full_name, status);
        return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},'manual','Giảng viên sửa tay')`;
      });
      await db.query(
        `INSERT INTO attendance.records (session_id, class_id, student_email, student_code, student_name, status, source, note)
         VALUES ${values.join(',')}
         ON CONFLICT (session_id, student_email)
         DO UPDATE SET status=EXCLUDED.status, source='manual', note=EXCLUDED.note, checked_at=now()`,
        params,
      );
    }
    res.json({ ok: true, applied: diffs.length, unchanged: wanted.size - diffs.length });
  });

  return r;
}
