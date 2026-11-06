// Gọi API Gateway. Khi deploy, đặt VITE_API_URL = địa chỉ gateway (vd https://gateway.onrender.com)
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api';

export const getToken = () => {
  try { return localStorage.getItem('token'); } catch { return null; }
};
export const setToken = (t) => {
  try { t ? localStorage.setItem('token', t) : localStorage.removeItem('token'); } catch { /* bỏ qua */ }
};

async function request(path, { method = 'GET', body, form } = {}) {
  const token = getToken();
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: form || (body ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new Error('Không kết nối được máy chủ. Hãy kiểm tra mạng hoặc thử lại sau.');
  }
  if (res.status === 401 && token) {
    setToken(null);
    window.dispatchEvent(new Event('auth:expired'));
  }
  return res;
}

export async function api(path, options) {
  const res = await request(path, options);
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Có lỗi xảy ra (${res.status})`);
  return data;
}

// Tải ảnh có kèm token, trả về đường dẫn tạm dùng cho thẻ <img>
export async function fetchBlobUrl(path) {
  const res = await request(path);
  if (!res.ok) throw new Error('Không tải được ảnh');
  return URL.createObjectURL(await res.blob());
}

// Tải file (Excel) có kèm token đăng nhập
export async function download(path, filename) {
  const res = await request(path);
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'Không tải được file');
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
