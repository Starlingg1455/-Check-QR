// Các thành phần giao diện dùng chung: nút, thẻ, hộp thoại, ảnh, menu, khung trang...

import { AlertTriangle, ArrowRight, Ban, CheckCircle2, ChevronDown, Clock, GraduationCap, ImageOff, Info, LayoutDashboard, Loader2, LogOut, Minus, Moon, Paperclip, Plus, QrCode, Save, ScanLine, ShieldAlert, ShieldCheck, Sun, Undo2, X, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { taiAnhVeUrl } from './api.js';
import { useXacThuc, useGiaoDien, useCoChu } from './ngu-canh.jsx';

// ============ Thành phần giao diện cơ bản ============

/* ---------- Hằng số trạng thái (luôn có icon + nhãn, không chỉ dựa vào màu) ---------- */
export const TRANG_THAI = {
  present: { label: 'Có mặt', icon: CheckCircle2, tone: 'good', cssVar: '--good' },
  late: { label: 'Đi trễ', icon: Clock, tone: 'warning', cssVar: '--warning' },
  excused: { label: 'Vắng có phép', icon: ShieldCheck, tone: 'info', cssVar: '--info' },
  absent: { label: 'Vắng', icon: XCircle, tone: 'critical', cssVar: '--critical' },
  pending: { label: 'Chưa điểm danh', icon: Clock, tone: '', cssVar: '--muted' },
};
export const MUC_CANH_BAO = {
  ok: { label: 'Bình thường', icon: CheckCircle2, tone: 'good', cssVar: '--good' },
  warning: { label: 'Cần chú ý', icon: AlertTriangle, tone: 'warning', cssVar: '--warning' },
  danger: { label: 'Sắp cấm thi', icon: ShieldAlert, tone: 'serious', cssVar: '--serious' },
  banned: { label: 'Vượt giới hạn', icon: Ban, tone: 'critical', cssVar: '--critical' },
};

/* ---------- Định dạng ---------- */
export const dinhDangNgay = (d) => new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
export const dinhDangGio = (d) => new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
export const dinhDangNgayGio = (d) => `${dinhDangGio(d)} · ${dinhDangNgay(d)}`;
export const phanTram = (v) => (v === null || v === undefined ? '—' : `${v}%`);
export const chuCaiDau = (name = '') => name.trim().split(/\s+/).slice(-2).map((w) => w[0]).join('').toUpperCase() || '?';

/* ---------- Toast ---------- */
const ToastContext = createContext(null);
export const useThongBao = () => useContext(ToastContext);

export function NhaCungCapThongBao({ children }) {
  const [items, setItems] = useState([]);
  const idRef = useRef(0);
  const push = useCallback((message, type = 'info') => {
    const id = ++idRef.current;
    setItems((x) => [...x, { id, message, type }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4200);
  }, []);
  const toast = useRef({
    success: (m) => push(m, 'success'),
    error: (m) => push(m, 'error'),
    info: (m) => push(m, 'info'),
  }).current;

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.type === 'success' ? <CheckCircle2 size={18} color="var(--good)" /> : t.type === 'error' ? <XCircle size={18} color="var(--critical)" /> : <Info size={18} color="var(--accent)" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ---------- Thành phần nhỏ ---------- */
export function NhanTrangThai({ tone = '', icon: Icon, children, title }) {
  return (
    <span className={`badge ${tone}`} title={title}>
      {Icon && <Icon size={13} strokeWidth={2.4} />}
      {children}
    </span>
  );
}
export function NhanTrangThaiDiemDanh({ status }) {
  const s = TRANG_THAI[status] || TRANG_THAI.pending;
  return <NhanTrangThai tone={s.tone} icon={s.icon}>{s.label}</NhanTrangThai>;
}
export function NhanMucCanhBao({ level }) {
  const s = MUC_CANH_BAO[level] || MUC_CANH_BAO.ok;
  return <NhanTrangThai tone={s.tone} icon={s.icon}>{s.label}</NhanTrangThai>;
}

export function AnhDaiDien({ user, name, size }) {
  const n = name || user?.name || '';
  return (
    <div className={`avatar ${size === 'lg' ? 'lg' : ''}`}>
      {user?.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" /> : chuCaiDau(n)}
    </div>
  );
}

export function VongXoay() { return <div className="spinner" role="progressbar" aria-label="Đang tải" />; }
export function DangTai() { return <div className="loading"><VongXoay /></div>; }
export function VongXoayNut() { return <Loader2 size={16} className="spin-icon" style={{ animation: 'spin 0.8s linear infinite' }} />; }

export function TrangRong({ icon: Icon, title, children, action }) {
  return (
    <div className="empty">
      {Icon && <div className="empty-icon"><Icon size={24} /></div>}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function KhungLoi({ message, onRetry }) {
  return (
    <div className="alert error" role="alert">
      <XCircle size={18} style={{ flex: 'none', marginTop: 2 }} />
      <div className="grow">{message}</div>
      {onRetry && <button className="btn btn-secondary btn-sm" onClick={onRetry}>Thử lại</button>}
    </div>
  );
}

export function The({ title, subtitle, actions, children, pad = true, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          <div>{title && <h2>{title}</h2>}{subtitle && <p>{subtitle}</p>}</div>
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      <div className={pad ? 'card-body' : ''} style={!pad && title ? { paddingTop: 16 } : undefined}>{children}</div>
    </section>
  );
}

export function OSoLieu({ icon: Icon, tone = '', label, value, unit, sub }) {
  return (
    <div className="card tile">
      <div className="tile-label">
        <span className={`tile-icon ${tone}`}><Icon size={16} /></span>
        {label}
      </div>
      <div className="tile-value num">{value}{unit && <small>{unit}</small>}</div>
      {sub && <div className="tile-sub">{sub}</div>}
    </div>
  );
}

/* Vòng tròn hiển thị tỉ lệ phần trăm */
export function VongTiLe({ value, size = 64, stroke = 7, tone }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value === null || value === undefined ? 0 : Math.max(0, Math.min(100, value));
  const color = tone || (value === null ? 'var(--border-strong)' : value >= 80 ? 'var(--good)' : value >= 60 ? 'var(--warning)' : 'var(--critical)');
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={`Tỉ lệ ${phanTram(value)}`}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <span className="ring-label" style={{ fontSize: size * 0.24 }}>{value === null || value === undefined ? '—' : Math.round(value)}<span style={{ fontSize: size * 0.15, color: 'var(--muted)' }}>{value === null || value === undefined ? '' : '%'}</span></span>
    </div>
  );
}

// Danh sách các cửa sổ đang mở (cái cuối là trên cùng) để Esc chỉ đóng đúng cửa sổ trên cùng
const modalStack = [];

export function HopThoai({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const token = Symbol('modal');
    modalStack.push(token);
    const onKey = (e) => { if (e.key === 'Escape' && modalStack[modalStack.length - 1] === token) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = modalStack.indexOf(token);
      if (i >= 0) modalStack.splice(i, 1);
    };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={wide ? { maxWidth: typeof wide === 'number' ? wide : 620 } : undefined}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function TruongNhap({ label, hint, children }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function DauTrang({ title, subtitle, actions, back }) {
  return (
    <>
      {back}
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions && <div className="row wrap">{actions}</div>}
      </div>
    </>
  );
}

/* Hook tải dữ liệu: { data, error, loading, reload } */
export function useTaiDuLieu(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const run = useCallback(async (silent) => {
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fn();
      setState({ data, error: null, loading: false });
    } catch (e) {
      setState((s) => ({ data: silent ? s.data : null, error: e.message, loading: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(false); }, [run]);
  return { ...state, reload: () => run(false), refresh: () => run(true) };
}

// ============ Ảnh có xác thực, xem ảnh lớn, menu trạng thái ============

/* Ảnh cần đăng nhập mới xem được: tải bằng token rồi hiển thị */
export function AnhCoXacThuc({ path, alt, className, onClick }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let url;
    let alive = true;
    taiAnhVeUrl(path).then((u) => { url = u; if (alive) setSrc(u); }).catch(() => alive && setFailed(true));
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [path]);
  if (failed) return <div className={`thumb thumb-empty ${className || ''}`}><ImageOff size={18} /></div>;
  if (!src) return <div className={`thumb skeleton ${className || ''}`} />;
  return <img src={src} alt={alt} className={className} onClick={onClick} />;
}

/* Xem ảnh lớn; bấm ra ngoài hoặc Esc để đóng */
export function XemAnhLon({ path, title, onClose }) {
  useEffect(() => {
    // Nghe ở pha capture và chặn lan truyền để Esc chỉ đóng ảnh, không đóng luôn hộp thoại bên dưới
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="overlay lightbox" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <button className="btn btn-secondary btn-icon lightbox-close" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
      <div onClick={(e) => e.stopPropagation()}>
        <AnhCoXacThuc path={path} alt={title} />
        {title && <div className="lightbox-cap">{title}</div>}
      </div>
    </div>
  );
}

/* Hàng ảnh thu nhỏ của một đơn xin vắng, bấm để xem lớn */
export function AnhThuNhoDon({ request }) {
  const [open, setOpen] = useState(null);
  if (!request.files?.length) return null;
  const path = (f) => `/attendance/requests/${request.id}/files/${f.id}`;
  return (
    <>
      <div className="thumbs">
        {request.files.map((f) => (
          <button key={f.id} className="thumb-btn" onClick={() => setOpen(f)} aria-label={`Xem ảnh ${f.name}`}>
            <AnhCoXacThuc path={path(f)} alt={f.name} className="thumb" />
          </button>
        ))}
      </div>
      {open && <XemAnhLon path={path(open)} title={open.name} onClose={() => setOpen(null)} />}
    </>
  );
}

export function SoAnhDinhKem({ count }) {
  if (!count) return null;
  return <span className="badge"><Paperclip size={12} />{count} ảnh</span>;
}

/* Chọn trạng thái điểm danh bằng một menu nhỏ, thay cho 4 nút icon mỗi dòng */
export function MenuTrangThai({ status, onChange, dirty }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <div className="menu-wrap" ref={ref}>
      <button className={`status-trigger ${dirty ? 'dirty' : ''}`} onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open} title={dirty ? 'Chưa lưu' : undefined}>
        <NhanTrangThaiDiemDanh status={status} /><ChevronDown size={14} className="muted" />
      </button>
      {open && (
        <div className="menu" role="listbox">
          {['present', 'late', 'excused', 'absent'].map((k) => {
            const S = TRANG_THAI[k];
            return (
              <button key={k} role="option" aria-selected={status === k} className={`menu-item ${status === k ? 'on' : ''}`} onClick={() => { setOpen(false); if (k !== status) onChange(k); }}>
                <S.icon size={16} color={`var(${S.cssVar})`} />{S.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============ Sửa tay: đánh dấu chưa lưu, hỏi xác nhận rồi mới lưu ============

// Luồng sửa tay an toàn: chọn trạng thái mới => chỉ đánh dấu "chưa lưu"; bấm Lưu => hộp xác nhận liệt kê
// từng thay đổi; xác nhận mới ghi (tất cả trong một lần). Dùng chung cho trang điểm danh và chi tiết sinh viên.

/* Giữ các thay đổi chưa lưu: key -> trạng thái mới. Đổi về đúng trạng thái gốc thì tự bỏ khỏi danh sách. */
export function useThayDoiChuaLuu() {
  const [map, setMap] = useState({});
  const set = useCallback((key, original, next) => {
    setMap((m) => {
      const n = { ...m };
      if (next === original) delete n[key]; else n[key] = next;
      return n;
    });
  }, []);
  const clear = useCallback(() => setMap({}), []);
  return { map, count: Object.keys(map).length, set, clear };
}

/* Cảnh báo khi đóng/tải lại tab trình duyệt mà còn thay đổi chưa lưu */
export function useCanhBaoChuaLuu(active) {
  useEffect(() => {
    if (!active) return undefined;
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [active]);
}

/* Thanh "N thay đổi chưa lưu" (Huỷ / Lưu). inline = đặt trong chân hộp thoại, mặc định dính ở đáy trang. */
export function ThanhLuuThayDoi({ count, onDiscard, onSave, inline }) {
  if (count === 0) return null;
  return (
    <div className={`save-bar ${inline ? 'inline' : ''}`} role="status">
      <span className="save-bar-text"><span className="dot" style={{ color: 'var(--warning)' }} /><b className="num">{count}</b> thay đổi chưa lưu</span>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-secondary btn-sm" onClick={onDiscard}><Undo2 size={15} />Huỷ thay đổi</button>
        <button className="btn btn-primary btn-sm" onClick={onSave}><Save size={15} />Lưu thay đổi</button>
      </div>
    </div>
  );
}

/* Hộp hỏi xác nhận chung */
export function HopThoaiXacNhan({ title, message, confirmText = 'Xác nhận', cancelText = 'Quay lại', danger, busy, onConfirm, onClose, children }) {
  return (
    <HopThoai
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>{cancelText}</button>
          <button className="btn btn-primary" style={danger ? { background: 'var(--critical)' } : undefined} onClick={onConfirm} disabled={busy}>{busy && <VongXoayNut />}{confirmText}</button>
        </>
      }
    >
      <div className="stack">
        {message && <p className="text-2">{message}</p>}
        {children}
      </div>
    </HopThoai>
  );
}

/* Hộp xác nhận lưu: liệt kê từng thay đổi "trước -> sau". items = [{ id, title, sub, from, to }] */
export function HopThoaiXacNhanLuu({ items, busy, onConfirm, onClose }) {
  return (
    <HopThoaiXacNhan
      title="Xác nhận lưu thay đổi?"
      message={`Bạn sắp thay đổi ${items.length} mục điểm danh. Hãy kiểm tra lại trước khi lưu.`}
      confirmText={`Xác nhận lưu ${items.length} thay đổi`}
      cancelText="Quay lại sửa"
      busy={busy}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      <div className="drill-list" style={{ maxHeight: 300 }}>
        {items.map((it) => (
          <div className="drill-row" key={it.id}>
            <div className="grow"><div className="bold truncate">{it.title}</div>{it.sub && <div className="xs muted num">{it.sub}</div>}</div>
            <span className="row" style={{ gap: 8 }}><NhanTrangThaiDiemDanh status={it.from} /><ArrowRight size={14} className="muted" /><NhanTrangThaiDiemDanh status={it.to} /></span>
          </div>
        ))}
      </div>
      {items.some((it) => it.to === 'absent') && (
        <div className="alert warn small"><AlertTriangle size={16} style={{ flex: 'none' }} /><span>Có mục chuyển sang <b>Vắng</b>: số buổi vắng tăng và có thể ảnh hưởng điều kiện dự thi.</span></div>
      )}
    </HopThoaiXacNhan>
  );
}

// ============ Nén ảnh trước khi gửi ============

// Nén ảnh ngay trên trình duyệt trước khi gửi: tối đa 1600px, JPEG chất lượng 0.82.
// Ảnh chụp điện thoại thường 3-8MB, sau khi nén chỉ còn khoảng 200-500KB.
const CANH_DAI_TOI_DA = 1600;

export async function nenAnh(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error(`"${file.name}" không phải ảnh JPG, PNG hoặc WebP`);
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, CANH_DAI_TOI_DA / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // nền trắng cho ảnh PNG trong suốt
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  if (!blob) throw new Error('Không xử lý được ảnh');
  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
  return new File([blob], name, { type: 'image/jpeg' });
}

export const dinhDangDungLuong = (n) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

// ============ Khung trang (thanh bên) ============

export function KhungTrang() {
  const { user, logout } = useXacThuc();
  const { theme, toggle } = useGiaoDien();
  const zoom = useCoChu();
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
            <AnhDaiDien user={user} />
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
