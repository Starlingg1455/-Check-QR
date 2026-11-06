import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useXacThuc } from './nguCanh.jsx';
import { KhungTrang, DangTai } from './thanhPhan.jsx';
import { TrangDangNhap } from './trangDangNhap.jsx';
import { TrangLopHoc, TrangChuGiangVien } from './trangGiangVien.jsx';
import { TrangBuoiDiemDanh } from './trangDiemDanh.jsx';
import {
  TrangQuetQr,
  TrangLopCuaSinhVien,
  TrangChuSinhVien,
} from './trangSinhVien.jsx';

// Chưa đăng nhập: nhớ trang đang mở (vd link QR /scan?t=...) rồi chuyển sang đăng nhập
function YeuCauDangNhap() {
  const viTri = useLocation();
  try {
    sessionStorage.setItem('next', viTri.pathname + viTri.search);
  } catch {
    /* bỏ qua */
  }
  return <Navigate to="/login" replace />;
}

const duongDanSauDangNhap = () => {
  try {
    return sessionStorage.getItem('next') || '/';
  } catch {
    return '/';
  }
};

export function App() {
  const { user, loading } = useXacThuc();
  if (loading) return <DangTai />;
  const teacher = user?.role === 'teacher';

  return (
    <Routes>
      <Route
        path="/login"
        element={
          user ? <Navigate to={duongDanSauDangNhap()} replace /> : <TrangDangNhap />
        }
      />
      <Route element={user ? <KhungTrang /> : <YeuCauDangNhap />}>
        <Route index element={teacher ? <TrangChuGiangVien /> : <TrangChuSinhVien />} />
        <Route
          path="classes/:id"
          element={teacher ? <TrangLopHoc /> : <TrangLopCuaSinhVien />}
        />
        <Route path="classes/:id/sessions/:sid" element={<TrangBuoiDiemDanh />} />
        <Route path="scan" element={<TrangQuetQr />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
