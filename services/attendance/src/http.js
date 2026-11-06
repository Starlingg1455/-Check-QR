// Lỗi HTTP có mã trạng thái + hàm gọi REST sang service khác
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Gọi API của service khác, chuyển tiếp token của người dùng
export async function callService(baseUrl, path, { token, method = 'GET', body } = {}) {
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
    throw new HttpError(502, `Không kết nối được service ${baseUrl}`);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new HttpError(res.status, data?.error || `Lỗi từ service (${res.status})`);
  return data;
}

// Middleware xử lý lỗi chung (đặt cuối cùng)
export function errorHandler(err, _req, res, _next) {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Lỗi máy chủ' });
}
