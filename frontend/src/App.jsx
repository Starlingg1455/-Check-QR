import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useXacThuc } from './ngu-canh.jsx';
import { KhungTrang, DangTai } from './thanh-phan.jsx';
import { TrangDangNhap } from './trang-dang-nhap.jsx';
import { TrangLopHoc, TrangChuGiangVien } from './trang-giang-vien.jsx';
import { TrangBuoiDiemDanh } from './trang-diem-danh.jsx';
import { TrangQuetQr, TrangLopCuaSinhVien, TrangChuSinhVien } from './trang-sinh-vien.jsx';

// Chưa đăng nhập: nhớ trang đang mở (vd link QR /scan?t=...) rồi chuyển sang đăng nhập
function YeuCauDangNhap() {
  const loc = useLocation();
  try { sessionStorage.setItem('next', loc.pathname + loc.search); } catch { /* bỏ qua */ }
  return <Navigate to="/login" replace />;
}

const duongDanSauDangNhap = () => {
  try { return sessionStorage.getItem('next') || '/'; } catch { return '/'; }
};

export function App() {
  const { user, loading } = useXacThuc();
  if (loading) return <DangTai />;
  const teacher = user?.role === 'teacher';

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={duongDanSauDangNhap()} replace /> : <TrangDangNhap />} />
      <Route element={user ? <KhungTrang /> : <YeuCauDangNhap />}>
        <Route index element={teacher ? <TrangChuGiangVien /> : <TrangChuSinhVien />} />
        <Route path="classes/:id" element={teacher ? <TrangLopHoc /> : <TrangLopCuaSinhVien />} />
        <Route path="classes/:id/sessions/:sid" element={<TrangBuoiDiemDanh />} />
        <Route path="scan" element={<TrangQuetQr />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
