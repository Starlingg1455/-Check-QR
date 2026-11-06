// API REST của dịch vụ "Buổi học & Mã QR": các đường dẫn (GET/POST/PUT/DELETE) và xử lý nghiệp vụ.
// Tài liệu Swagger của các đường dẫn này nằm ở taiLieuApi.js.

import { Router } from 'express';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { LoiHttp, goiDichVu, batBuocDangNhap, batBuocVaiTro } from './tienIch.js';

const DIA_CHI_TAI_KHOAN = process.env.ACCOUNT_URL || 'http://localhost:4001';
const KHOA_BI_MAT_QR = process.env.QR_SECRET || 'dev-qr-secret-chi-dung-khi-phat-trien';
// Mã QR đổi mỗi 30 giây
const THOI_GIAN_DOI_QR = 30;

// Mã QR = "<mã buổi>.<khung thời gian 30s>.<chữ ký>". Chữ ký dùng HMAC nên không thể đoán/giả mạo.
const khungThoiGian = (miliGiay = Date.now()) => Math.floor(miliGiay / 1000 / THOI_GIAN_DOI_QR);
const kyMaQr = (sessionId, slot, secret) =>
  createHmac('sha256', KHOA_BI_MAT_QR + secret)
    .update(`${sessionId}.${slot}`)
    .digest('base64url')
    .slice(0, 16);

const buoiHocCongKhai = ({ qr_secret, ...rest }) => ({
  id: rest.id,
  classId: rest.class_id,
  sessionNo: rest.session_no,
  title: rest.title,
  status: rest.status,
  openedAt: rest.opened_at,
  closedAt: rest.closed_at,
});

export function taoApi(db) {
  const dinhTuyen = Router();

  // Kiểm tra quyền với lớp thông qua account-class (API, không truy vấn chéo DB)
  const layLop = (classId, token) =>
    goiDichVu(DIA_CHI_TAI_KHOAN, `/classes/${classId}`, { token });

  async function timBuoiHoc(id) {
    const rows = await db.query('SELECT * FROM session_qr.sessions WHERE id=$1', [
      Number(id),
    ]);
    if (!rows[0]) throw new LoiHttp(404, 'Không tìm thấy buổi học');
    return rows[0];
  }

  // Giảng viên mở một buổi điểm danh mới
  dinhTuyen.post('/sessions', batBuocDangNhap, batBuocVaiTro('teacher'), async (req, res) => {
    const { classId, title, openedAt } = req.body || {};
    const lop = await layLop(classId, req.token);
    if (!lop.isOwner) throw new LoiHttp(403, 'Chỉ giảng viên của lớp được mở buổi');

    const open = await db.query(
      `SELECT id FROM session_qr.sessions WHERE class_id=$1 AND status='open'`,
      [lop.id],
    );
    if (open[0])
      throw new LoiHttp(
        409,
        'Lớp đang có một buổi điểm danh chưa đóng. Hãy đóng buổi đó trước.',
      );

    const [{ last }] = await db.query(
      'SELECT COALESCE(MAX(session_no), 0)::int AS last FROM session_qr.sessions WHERE class_id=$1',
      [lop.id],
    );
    const sessionNo = last + 1;
    const when = openedAt ? new Date(openedAt) : new Date();
    if (Number.isNaN(when.getTime())) throw new LoiHttp(400, 'openedAt không hợp lệ');

    const rows = await db.query(
      `INSERT INTO session_qr.sessions (class_id, session_no, title, qr_secret, opened_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        lop.id,
        sessionNo,
        String(title || '').trim() || `Buổi ${sessionNo}`,
        randomBytes(16).toString('hex'),
        when,
        req.user.id,
      ],
    );
    res.status(201).json(buoiHocCongKhai(rows[0]));
  });

  // Danh sách buổi học của một lớp (giảng viên hoặc sinh viên của lớp)
  dinhTuyen.get('/sessions', batBuocDangNhap, async (req, res) => {
    const lop = await layLop(req.query.classId, req.token);
    const rows = await db.query(
      'SELECT * FROM session_qr.sessions WHERE class_id=$1 ORDER BY session_no',
      [lop.id],
    );
    res.json(rows.map(buoiHocCongKhai));
  });

  // Mã QR hiện tại của buổi đang mở (giảng viên gọi mỗi vài giây để làm mới)
  // Đặt trước '/sessions/:id' không cần thiết vì khác đường dẫn, nhưng để cho dễ đọc
  dinhTuyen.get(
    '/sessions/:id/qr',
    batBuocDangNhap,
    batBuocVaiTro('teacher'),
    async (req, res) => {
      const buoi = await timBuoiHoc(req.params.id);
      const lop = await layLop(buoi.class_id, req.token);
      if (!lop.isOwner) throw new LoiHttp(403, 'Chỉ giảng viên của lớp được xem mã QR');
      if (buoi.status !== 'open') throw new LoiHttp(409, 'Buổi học đã đóng');
      const slot = khungThoiGian();
      res.json({
        token: `${buoi.id}.${slot}.${kyMaQr(buoi.id, slot, buoi.qr_secret)}`,
        ttl: THOI_GIAN_DOI_QR,
        expiresAt: (slot + 1) * THOI_GIAN_DOI_QR * 1000, // mili-giây
        serverTime: Date.now(),
      });
    },
  );

  dinhTuyen.get('/sessions/:id', batBuocDangNhap, async (req, res) => {
    const buoi = await timBuoiHoc(req.params.id);
    await layLop(buoi.class_id, req.token); // kiểm tra quyền xem
    res.json(buoiHocCongKhai(buoi));
  });

  dinhTuyen.post(
    '/sessions/:id/close',
    batBuocDangNhap,
    batBuocVaiTro('teacher'),
    async (req, res) => {
      const buoi = await timBuoiHoc(req.params.id);
      const lop = await layLop(buoi.class_id, req.token);
      if (!lop.isOwner) throw new LoiHttp(403, 'Chỉ giảng viên của lớp được đóng buổi');
      if (buoi.status === 'closed') return res.json(buoiHocCongKhai(buoi));
      const rows = await db.query(
        `UPDATE session_qr.sessions SET status='closed', closed_at=now() WHERE id=$1 RETURNING *`,
        [buoi.id],
      );
      res.json(buoiHocCongKhai(rows[0]));
    },
  );

  dinhTuyen.delete(
    '/sessions/:id',
    batBuocDangNhap,
    batBuocVaiTro('teacher'),
    async (req, res) => {
      const buoi = await timBuoiHoc(req.params.id);
      const lop = await layLop(buoi.class_id, req.token);
      if (!lop.isOwner) throw new LoiHttp(403, 'Chỉ giảng viên của lớp được xoá buổi');
      await db.query('DELETE FROM session_qr.sessions WHERE id=$1', [buoi.id]);
      res.status(204).end();
    },
  );

  // Service điểm danh gọi để kiểm tra mã QR mà sinh viên quét
  dinhTuyen.post('/sessions/verify', batBuocDangNhap, async (req, res) => {
    const parts = String(req.body?.token || '').split('.');
    if (parts.length !== 3 || !/^\d+$/.test(parts[0]) || !/^\d+$/.test(parts[1])) {
      throw new LoiHttp(400, 'Mã QR không hợp lệ');
    }
    const [maBuoi, slotStr, chuKy] = parts;
    const rows = await db.query('SELECT * FROM session_qr.sessions WHERE id=$1', [
      Number(maBuoi),
    ]);
    const buoi = rows[0];
    if (!buoi) throw new LoiHttp(400, 'Mã QR không hợp lệ');

    const expected = Buffer.from(kyMaQr(buoi.id, Number(slotStr), buoi.qr_secret));
    const given = Buffer.from(chuKy);
    if (expected.length !== given.length || !timingSafeEqual(expected, given))
      throw new LoiHttp(400, 'Mã QR không hợp lệ');
    if (buoi.status !== 'open') throw new LoiHttp(410, 'Buổi điểm danh đã đóng');

    // Chấp nhận khung hiện tại và khung liền trước (bù độ trễ mạng/quét), tức tối đa ~60 giây
    const khungHienTai = khungThoiGian();
    if (Number(slotStr) !== khungHienTai && Number(slotStr) !== khungHienTai - 1) {
      throw new LoiHttp(410, 'Mã QR đã hết hạn, hãy quét lại mã đang hiển thị');
    }
    res.json({ valid: true, ...buoiHocCongKhai(buoi) });
  });

  return dinhTuyen;
}
