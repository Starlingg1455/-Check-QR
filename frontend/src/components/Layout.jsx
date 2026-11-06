import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { QrCode, LayoutDashboard, ScanLine, GraduationCap, LogOut, Sun, Moon, Minus, Plus } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { useTheme } from '../theme.jsx';
import { useZoom } from '../zoom.jsx';
import { Avatar } from './ui.jsx';

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const zoom = useZoom();
  const isTeacher = user.role === 'teacher';

  // Đã vào được hệ thống thì xoá trang "đang chờ quay lại" đã lưu lúc bị chuyển sang đăng nhập
  useEffect(() => { try { sessionStorage.removeItem('next'); } catch { /* bỏ qua */ } }, []);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo"><QrCode size={20} /></div>
          <div>Điểm danh QR<small>{isTeacher ? 'Dành cho giảng viên' : 'Dành cho sinh viên'}</small></div>
        </div>

        <div className="nav-label">Menu</div>
        {isTeacher ? (
          <NavLink to="/" end className="nav-link"><LayoutDashboard size={19} />Lớp học</NavLink>
        ) : (
          <>
            <NavLink to="/" end className="nav-link"><GraduationCap size={19} />Lớp của tôi</NavLink>
            <NavLink to="/scan" className="nav-link"><ScanLine size={19} />Quét QR</NavLink>
          </>
        )}

        <div className="sidebar-foot">
          <div className="user-card">
            <Avatar user={user} />
            <div className="grow">
              <div className="bold small truncate">{user.name}</div>
              <div className="xs muted truncate">{user.email}</div>
            </div>
          </div>
          {zoom.enabled && (
            <div className="zoom-ctl" role="group" aria-label="Cỡ chữ">
              <span className="small text-2">Cỡ chữ</span>
              <div className="row" style={{ gap: 2 }}>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={zoom.smaller} aria-label="Giảm cỡ chữ"><Minus size={15} /></button>
                <button className="btn btn-ghost btn-sm num" onClick={zoom.reset} title="Về mặc định" style={{ minWidth: 52, padding: 0 }}>{Math.round(zoom.total * 100)}%</button>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={zoom.bigger} aria-label="Tăng cỡ chữ"><Plus size={15} /></button>
              </div>
            </div>
          )}
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-ghost btn-sm grow" onClick={toggle} aria-label="Đổi giao diện sáng/tối">
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}<span className="btn-label">{theme === 'dark' ? 'Sáng' : 'Tối'}</span>
            </button>
            <button className="btn btn-ghost btn-sm grow" onClick={logout} aria-label="Đăng xuất">
              <LogOut size={16} /><span className="btn-label">Thoát</span>
            </button>
          </div>
        </div>
      </aside>
      <main className="main">
        <div className="page"><Outlet /></div>
      </main>
    </div>
  );
}
