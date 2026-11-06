// Các "ngữ cảnh" dùng toàn ứng dụng: đăng nhập, giao diện sáng/tối, cỡ chữ theo màn hình.

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, layToken, datToken } from './api.js';

// ============ Đăng nhập (xác thực) ============

const AuthContext = createContext(null);
export const useXacThuc = () => useContext(AuthContext);

export function NhaCungCapXacThuc({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(layToken()));

  // Mở lại trang: nếu còn token thì lấy thông tin người dùng
  useEffect(() => {
    if (!layToken()) return;
    api('/account/auth/me')
      .then(setUser)
      .catch(() => datToken(null))
      .finally(() => setLoading(false));
  }, []);

  // Token hết hạn => về trang đăng nhập
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  const login = useCallback((token, nguoiDung) => {
    datToken(token);
    setUser(nguoiDung);
  }, []);
  const logout = useCallback(() => {
    datToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ============ Giao diện sáng / tối ============

const ThemeContext = createContext(null);
export const useGiaoDien = () => useContext(ThemeContext);

const heThongDangToi = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches;

export function NhaCungCapGiaoDien({ children }) {
  // 'light' | 'dark' | null (theo hệ điều hành)
  const [choice, setChoice] = useState(() => {
    try {
      const giaoDienLuu = localStorage.getItem('theme');
      return giaoDienLuu === 'light' || giaoDienLuu === 'dark' ? giaoDienLuu : null;
    } catch {
      return null;
    }
  });
  const [osDark, setOsDark] = useState(heThongDangToi());

  useEffect(() => {
    const truyVanToiMau = window.matchMedia('(prefers-color-scheme: dark)');
    const khiDoi = () => setOsDark(truyVanToiMau.matches);
    truyVanToiMau.addEventListener('change', khiDoi);
    return () => truyVanToiMau.removeEventListener('change', khiDoi);
  }, []);

  const resolved = choice || (osDark ? 'dark' : 'light');

  const toggle = useCallback(() => {
    const next = resolved === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next); // đặt trước để biểu đồ đọc đúng màu
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* bỏ qua */
    }
    setChoice(next);
  }, [resolved]);

  return (
    <ThemeContext.Provider value={{ theme: resolved, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ============ Cỡ chữ tự co giãn theo màn hình ============

// Co giãn cỡ chữ/giao diện theo màn hình: màn càng rộng (vd máy chiếu, màn lớn) thì giao diện càng to.
// Người dùng có thể chỉnh thêm bằng nút A- / A+.

const ZoomContext = createContext(null);
export const useCoChu = () => useContext(ZoomContext);

const DO_RONG_CO_SO = 1440; // từ bề rộng này trở lên mới bắt đầu phóng to
const HE_SO_NHO_NHAT = 0.8;
const HE_SO_LON_NHAT = 1.6;
const BUOC_CHINH = 0.05; // mỗi lần bấm A- / A+ đổi 5%

const docHeSoCoChu = () => {
  try {
    const giaTri = Number(localStorage.getItem('zoom'));
    return giaTri >= HE_SO_NHO_NHAT && giaTri <= HE_SO_LON_NHAT ? giaTri : 1;
  } catch {
    return 1;
  }
};

export function NhaCungCapCoChu({ children }) {
  const [factor, setFactor] = useState(docHeSoCoChu);
  const [width, setWidth] = useState(window.innerWidth);

  useEffect(() => {
    const khiDoi = () => setWidth(window.innerWidth);
    window.addEventListener('resize', khiDoi);
    return () => window.removeEventListener('resize', khiDoi);
  }, []);

  // Điện thoại/máy tính bảng nhỏ: không phóng to
  const auto = width >= 1000 ? Math.min(1.8, Math.max(1, width / DO_RONG_CO_SO)) : 1;
  const total = width >= 1000 ? Math.round(auto * factor * 100) / 100 : 1;

  useEffect(() => {
    const root = document.getElementById('root');
    if (root) root.style.zoom = total === 1 ? '' : String(total);
    // Biến CSS để khung biểu đồ "đối zoom" (Chart.js tự đo kích thước theo pixel màn hình)
    document.documentElement.style.setProperty('--ui-zoom', String(total));
  }, [total]);

  const change = (delta) => {
    const next =
      Math.round(
        Math.min(HE_SO_LON_NHAT, Math.max(HE_SO_NHO_NHAT, factor + delta)) * 20,
      ) / 20; // làm tròn theo bước 5%
    setFactor(next);
    try {
      localStorage.setItem('zoom', String(next));
    } catch {
      /* bỏ qua */
    }
  };

  return (
    <ZoomContext.Provider
      value={{
        factor,
        total,
        enabled: width >= 1000,
        bigger: () => change(BUOC_CHINH),
        smaller: () => change(-STEP),
        reset: () => change(1 - factor),
      }}
    >
      {children}
    </ZoomContext.Provider>
  );
}
