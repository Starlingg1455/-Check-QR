import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import { Loading } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import TeacherHome from './pages/TeacherHome.jsx';
import ClassPage from './pages/ClassPage.jsx';
import SessionPage from './pages/SessionPage.jsx';
import StudentHome from './pages/StudentHome.jsx';
import StudentClass from './pages/StudentClass.jsx';
import ScanPage from './pages/ScanPage.jsx';

// Chưa đăng nhập: nhớ trang đang mở (vd link QR /scan?t=...) rồi chuyển sang đăng nhập
function RequireLogin() {
  const loc = useLocation();
  try { sessionStorage.setItem('next', loc.pathname + loc.search); } catch { /* bỏ qua */ }
  return <Navigate to="/login" replace />;
}

const nextPath = () => {
  try { return sessionStorage.getItem('next') || '/'; } catch { return '/'; }
};

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  const teacher = user?.role === 'teacher';

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={nextPath()} replace /> : <Login />} />
      <Route element={user ? <Layout /> : <RequireLogin />}>
        <Route index element={teacher ? <TeacherHome /> : <StudentHome />} />
        <Route path="classes/:id" element={teacher ? <ClassPage /> : <StudentClass />} />
        <Route path="classes/:id/sessions/:sid" element={<SessionPage />} />
        <Route path="scan" element={<ScanPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
