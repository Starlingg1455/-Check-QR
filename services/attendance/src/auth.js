// Xác thực bằng JWT. Cả 4 service dùng chung JWT_SECRET nên token do account-class cấp
// có thể được kiểm tra ở mọi service.
import jwt from 'jsonwebtoken';
import { HttpError } from './http.js';

const SECRET = process.env.JWT_SECRET || 'dev-secret-chi-dung-khi-phat-trien';

export function signToken(user) {
  const payload = { id: user.id, email: user.email, name: user.name, role: user.role };
  return jwt.sign(payload, SECRET, { expiresIn: '7d' });
}

// Middleware: bắt buộc đăng nhập, gắn req.user và req.token
export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new HttpError(401, 'Chưa đăng nhập');
  try {
    req.user = jwt.verify(token, SECRET);
    req.token = token;
    next();
  } catch {
    throw new HttpError(401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn');
  }
}

// Middleware: chỉ cho phép một vai trò ('teacher' hoặc 'student')
export const requireRole = (role) => (req, _res, next) => {
  if (req.user?.role !== role) {
    throw new HttpError(403, role === 'teacher' ? 'Chỉ giảng viên được thực hiện' : 'Chỉ sinh viên được thực hiện');
  }
  next();
};
