// Co giãn cỡ chữ/giao diện theo màn hình: màn càng rộng (vd máy chiếu, màn lớn) thì giao diện càng to.
// Người dùng có thể chỉnh thêm bằng nút A- / A+.
import { createContext, useContext, useEffect, useState } from 'react';

const ZoomContext = createContext(null);
export const useZoom = () => useContext(ZoomContext);

const BASE_WIDTH = 1440; // từ bề rộng này trở lên mới bắt đầu phóng to
const MIN_FACTOR = 0.9;
const MAX_FACTOR = 1.5;

const readFactor = () => {
  try { const v = Number(localStorage.getItem('zoom')); return v >= MIN_FACTOR && v <= MAX_FACTOR ? v : 1; } catch { return 1; }
};

export function ZoomProvider({ children }) {
  const [factor, setFactor] = useState(readFactor);
  const [width, setWidth] = useState(window.innerWidth);

  useEffect(() => {
    const on = () => setWidth(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  // Điện thoại/máy tính bảng nhỏ: không phóng to
  const auto = width >= 1000 ? Math.min(1.8, Math.max(1, width / BASE_WIDTH)) : 1;
  const total = width >= 1000 ? Math.round(auto * factor * 100) / 100 : 1;

  useEffect(() => {
    const root = document.getElementById('root');
    if (root) root.style.zoom = total === 1 ? '' : String(total);
    // Biến CSS để khung biểu đồ "đối zoom" (Chart.js tự đo kích thước theo pixel màn hình)
    document.documentElement.style.setProperty('--ui-zoom', String(total));
  }, [total]);

  const change = (delta) => {
    const next = Math.round(Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, factor + delta)) * 10) / 10;
    setFactor(next);
    try { localStorage.setItem('zoom', String(next)); } catch { /* bỏ qua */ }
  };

  return (
    <ZoomContext.Provider value={{ factor, total, enabled: width >= 1000, bigger: () => change(0.1), smaller: () => change(-0.1), reset: () => change(1 - factor) }}>
      {children}
    </ZoomContext.Provider>
  );
}
