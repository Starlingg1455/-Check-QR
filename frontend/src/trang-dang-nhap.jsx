import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';
import { ArrowRight, BarChart3, BellRing, GraduationCap, Presentation, QrCode, ScanLine } from 'lucide-react';
import { useState } from 'react';
import { api } from './api.js';
import { useXacThuc } from './ngu-canh.jsx';
import { KhungLoi, TruongNhap, VongXoay, useTaiDuLieu } from './thanh-phan.jsx';

const TINH_NANG = [
  { icon: ScanLine, title: 'Quét là xong', text: 'Sinh viên quét mã QR trên màn chiếu bằng camera điện thoại.' },
  { icon: QrCode, title: 'Chống điểm danh hộ', text: 'Mã QR tự đổi mỗi 30 giây, chụp ảnh gửi bạn cũng vô ích.' },
  { icon: BarChart3, title: 'Thống kê tự động', text: 'Biết ngay ai vắng nhiều, ai sắp bị cấm thi, xuất Excel một chạm.' },
  { icon: BellRing, title: 'Cảnh báo sớm', text: 'Email nhắc sinh viên trước khi vượt giới hạn vắng.' },
];

export function TrangDangNhap() {
  const { login } = useXacThuc();
  const { data: config, error: configError } = useTaiDuLieu(() => api('/account/auth/config'), []);
  const [role, setRole] = useState('teacher');
  const [email, setEmail] = useState('gv@demo.vn');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const chonVaiTro = (r) => {
    setRole(r);
    setEmail(r === 'teacher' ? 'gv@demo.vn' : 'sv01@demo.vn');
  };

  async function dangNhapThuNghiem(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const res = await api('/account/auth/dev-login', { method: 'POST', body: { email, name: name || undefined, role } });
      login(res.token, res.user);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function dangNhapGoogle(credentialResponse) {
    setError('');
    try {
      const res = await api('/account/auth/google', { method: 'POST', body: { credential: credentialResponse.credential } });
      login(res.token, res.user);
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="auth">
      <div className="auth-hero">
        <div className="row" style={{ gap: 12 }}>
          <div className="brand-logo" style={{ background: 'rgba(255,255,255,.18)', boxShadow: 'none', border: '1px solid rgba(255,255,255,.25)' }}><QrCode size={20} /></div>
          <b style={{ fontSize: 18 }}>Điểm danh QR</b>
        </div>
        <div>
          <h1>Điểm danh trong vài giây, thống kê trong một cái nhìn.</h1>
          <p>Giảng viên chiếu mã QR, sinh viên quét bằng điện thoại. Hệ thống lo phần còn lại.</p>
        </div>
        <div className="stack" style={{ gap: 18 }}>
          {TINH_NANG.map((f) => (
            <div className="feature" key={f.title}>
              <div className="feature-icon"><f.icon size={18} /></div>
              <div><b>{f.title}</b><span>{f.text}</span></div>
            </div>
          ))}
        </div>
      </div>

      <div className="auth-form-side">
        <div className="auth-box stack-lg">
          <div>
            <h1>Đăng nhập</h1>
            <p className="text-2" style={{ marginTop: 6 }}>Chào mừng bạn quay lại. Hãy đăng nhập để tiếp tục.</p>
          </div>

          {!config && !configError && <div className="row" style={{ justifyContent: 'center' }}><VongXoay /></div>}
          {configError && <KhungLoi message={configError} />}
          {error && <KhungLoi message={error} />}

          {config?.googleClientId && (
            <GoogleOAuthProvider clientId={config.googleClientId}>
              <div className="stack" style={{ alignItems: 'center' }}>
                <GoogleLogin onSuccess={dangNhapGoogle} onError={() => setError('Đăng nhập Google không thành công')} size="large" shape="pill" width="400" text="signin_with" locale="vi" />
              </div>
            </GoogleOAuthProvider>
          )}

          {config?.googleClientId && config?.devLogin && <div className="divider">hoặc</div>}

          {config?.devLogin && (
            <form className="stack" onSubmit={dangNhapThuNghiem}>
              <div className="segmented" role="tablist" style={{ alignSelf: 'stretch' }}>
                <button type="button" className={role === 'teacher' ? 'on' : ''} style={{ flex: 1, justifyContent: 'center' }} onClick={() => chonVaiTro('teacher')}><Presentation size={16} />Giảng viên</button>
                <button type="button" className={role === 'student' ? 'on' : ''} style={{ flex: 1, justifyContent: 'center' }} onClick={() => chonVaiTro('student')}><GraduationCap size={16} />Sinh viên</button>
              </div>
              <TruongNhap label="Email">
                <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ten@truong.edu.vn" />
              </TruongNhap>
              <TruongNhap label="Họ tên (không bắt buộc)">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nguyễn Văn A" />
              </TruongNhap>
              <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
                {busy ? <VongXoay /> : <>Vào hệ thống <ArrowRight size={18} /></>}
              </button>
              <div className="alert" style={{ alignItems: 'flex-start' }}>
                <span className="small">Đây là chế độ đăng nhập thử nghiệm. Tài khoản demo: <b>gv@demo.vn</b> hoặc <b>sv01@demo.vn</b> … <b>sv30@demo.vn</b>.</span>
              </div>
            </form>
          )}

          {config && !config.googleClientId && !config.devLogin && <KhungLoi message="Hệ thống chưa cấu hình đăng nhập." />}
        </div>
      </div>
    </div>
  );
}
