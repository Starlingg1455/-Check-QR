// Các hàm dùng chung của dịch vụ "Thống kê": gọi REST sang dịch vụ khác, cơ sở dữ liệu, xác thực JWT.
// (Mỗi dịch vụ có bản riêng để có thể triển khai độc lập.)

import jwt from 'jsonwebtoken';

// ============ Lỗi HTTP và gọi sang dịch vụ khác (REST) ============

// Lỗi HTTP có mã trạng thái + hàm gọi REST sang service khác
export class LoiHttp extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Gọi API của service khác, chuyển tiếp token của người dùng
export async function goiDichVu(baseUrl, path, { token, method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(baseUrl + path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new LoiHttp(502, `Không kết nối được service ${baseUrl}`);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new LoiHttp(res.status, data?.error || `Lỗi từ service (${res.status})`);
  return data;
}

// Middleware xử lý lỗi chung (đặt cuối cùng)
export function xuLyLoi(err, _req, res, _next) {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Lỗi máy chủ' });
}

// ============ Xác thực bằng JWT ============

// Xác thực bằng JWT. Cả 4 service dùng chung JWT_SECRET nên token do account-class cấp
// có thể được kiểm tra ở mọi service.

const KHOA_BI_MAT_JWT = process.env.JWT_SECRET || 'dev-secret-chi-dung-khi-phat-trien';

export function kyToken(user) {
  const payload = { id: user.id, email: user.email, name: user.name, role: user.role };
  return jwt.sign(payload, KHOA_BI_MAT_JWT, { expiresIn: '7d' });
}

// Middleware: bắt buộc đăng nhập, gắn req.user và req.token
export function batBuocDangNhap(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new LoiHttp(401, 'Chưa đăng nhập');
  try {
    req.user = jwt.verify(token, KHOA_BI_MAT_JWT);
    req.token = token;
    next();
  } catch {
    throw new LoiHttp(401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn');
  }
}

// Middleware: chỉ cho phép một vai trò ('teacher' hoặc 'student')
export const batBuocVaiTro = (role) => (req, _res, next) => {
  if (req.user?.role !== role) {
    throw new LoiHttp(403, role === 'teacher' ? 'Chỉ giảng viên được thực hiện' : 'Chỉ sinh viên được thực hiện');
  }
  next();
};
