// Gọi API Gateway. Khi deploy, đặt VITE_API_URL = địa chỉ gateway (vd https://gateway.onrender.com)
const DIA_CHI_GOC_API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api';

export const layToken = () => {
  try {
    return localStorage.getItem('token');
  } catch {
    return null;
  }
};
export const datToken = (token) => {
  try {
    token ? localStorage.setItem('token', token) : localStorage.removeItem('token');
  } catch {
    /* bỏ qua */
  }
};

async function request(path, { method = 'GET', body, form } = {}) {
  const token = layToken();
  let phanHoi;
  try {
    phanHoi = await fetch(DIA_CHI_GOC_API + path, {
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
  if (phanHoi.status === 401 && token) {
    datToken(null);
    window.dispatchEvent(new Event('auth:expired'));
  }
  return phanHoi;
}

export async function api(path, options) {
  const phanHoi = await request(path, options);
  if (phanHoi.status === 204) return null;
  const data = await phanHoi.json().catch(() => null);
  if (!phanHoi.ok) {
    const loi = new Error(data?.error || `Có lỗi xảy ra (${phanHoi.status})`);
    loi.data = data; // giữ lại chi tiết lỗi do máy chủ trả về
    throw loi;
  }
  return data;
}

// Tải ảnh có kèm token, trả về đường dẫn tạm dùng cho thẻ <img>
export async function taiAnhVeUrl(path) {
  const phanHoi = await request(path);
  if (!phanHoi.ok) throw new Error('Không tải được ảnh');
  return URL.createObjectURL(await phanHoi.blob());
}

// Tải file (Excel) có kèm token đăng nhập
export async function download(path, filename) {
  const phanHoi = await request(path);
  if (!phanHoi.ok) {
    const data = await phanHoi.json().catch(() => null);
    throw new Error(data?.error || 'Không tải được file');
  }
  const duongDan = URL.createObjectURL(await phanHoi.blob());
  const lienKet = document.createElement('a');
  lienKet.href = duongDan;
  lienKet.download = filename;
  lienKet.click();
  URL.revokeObjectURL(duongDan);
}
