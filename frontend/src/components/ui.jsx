import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import {
  CheckCircle2, Clock, ShieldCheck, XCircle, AlertTriangle, ShieldAlert, Ban, X, Info, Loader2,
} from 'lucide-react';

/* ---------- Hằng số trạng thái (luôn có icon + nhãn, không chỉ dựa vào màu) ---------- */
export const STATUS = {
  present: { label: 'Có mặt', icon: CheckCircle2, tone: 'good', cssVar: '--good' },
  late: { label: 'Đi trễ', icon: Clock, tone: 'warning', cssVar: '--warning' },
  excused: { label: 'Vắng có phép', icon: ShieldCheck, tone: 'info', cssVar: '--info' },
  absent: { label: 'Vắng', icon: XCircle, tone: 'critical', cssVar: '--critical' },
  pending: { label: 'Chưa điểm danh', icon: Clock, tone: '', cssVar: '--muted' },
};
export const LEVEL = {
  ok: { label: 'Bình thường', icon: CheckCircle2, tone: 'good', cssVar: '--good' },
  warning: { label: 'Cần chú ý', icon: AlertTriangle, tone: 'warning', cssVar: '--warning' },
  danger: { label: 'Sắp cấm thi', icon: ShieldAlert, tone: 'serious', cssVar: '--serious' },
  banned: { label: 'Vượt giới hạn', icon: Ban, tone: 'critical', cssVar: '--critical' },
};

/* ---------- Định dạng ---------- */
export const fmtDate = (d) => new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
export const fmtTime = (d) => new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
export const fmtDateTime = (d) => `${fmtTime(d)} · ${fmtDate(d)}`;
export const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`);
export const initials = (name = '') => name.trim().split(/\s+/).slice(-2).map((w) => w[0]).join('').toUpperCase() || '?';

/* ---------- Toast ---------- */
const ToastContext = createContext(null);
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
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
export function Badge({ tone = '', icon: Icon, children, title }) {
  return (
    <span className={`badge ${tone}`} title={title}>
      {Icon && <Icon size={13} strokeWidth={2.4} />}
      {children}
    </span>
  );
}
export function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.pending;
  return <Badge tone={s.tone} icon={s.icon}>{s.label}</Badge>;
}
export function LevelBadge({ level }) {
  const s = LEVEL[level] || LEVEL.ok;
  return <Badge tone={s.tone} icon={s.icon}>{s.label}</Badge>;
}

export function Avatar({ user, name, size }) {
  const n = name || user?.name || '';
  return (
    <div className={`avatar ${size === 'lg' ? 'lg' : ''}`}>
      {user?.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" /> : initials(n)}
    </div>
  );
}

export function Spinner() { return <div className="spinner" role="progressbar" aria-label="Đang tải" />; }
export function Loading() { return <div className="loading"><Spinner /></div>; }
export function BtnSpinner() { return <Loader2 size={16} className="spin-icon" style={{ animation: 'spin 0.8s linear infinite' }} />; }

export function Empty({ icon: Icon, title, children, action }) {
  return (
    <div className="empty">
      {Icon && <div className="empty-icon"><Icon size={24} /></div>}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorBox({ message, onRetry }) {
  return (
    <div className="alert error" role="alert">
      <XCircle size={18} style={{ flex: 'none', marginTop: 2 }} />
      <div className="grow">{message}</div>
      {onRetry && <button className="btn btn-secondary btn-sm" onClick={onRetry}>Thử lại</button>}
    </div>
  );
}

export function Card({ title, subtitle, actions, children, pad = true, className = '' }) {
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

export function StatTile({ icon: Icon, tone = '', label, value, unit, sub }) {
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
export function Ring({ value, size = 64, stroke = 7, tone }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value === null || value === undefined ? 0 : Math.max(0, Math.min(100, value));
  const color = tone || (value === null ? 'var(--border-strong)' : value >= 80 ? 'var(--good)' : value >= 60 ? 'var(--warning)' : 'var(--critical)');
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={`Tỉ lệ ${pct(value)}`}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <span className="ring-label" style={{ fontSize: size * 0.24 }}>{value === null || value === undefined ? '—' : Math.round(value)}<span style={{ fontSize: size * 0.15, color: 'var(--muted)' }}>{value === null || value === undefined ? '' : '%'}</span></span>
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
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

export function Field({ label, hint, children }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function PageHead({ title, subtitle, actions, back }) {
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
export function useLoad(fn, deps = []) {
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
