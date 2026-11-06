import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Paperclip, X, ImageOff } from 'lucide-react';
import { fetchBlobUrl } from '../api.js';
import { STATUS, StatusBadge } from './ui.jsx';

/* Ảnh cần đăng nhập mới xem được: tải bằng token rồi hiển thị */
export function AuthImage({ path, alt, className, onClick }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let url;
    let alive = true;
    fetchBlobUrl(path).then((u) => { url = u; if (alive) setSrc(u); }).catch(() => alive && setFailed(true));
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [path]);
  if (failed) return <div className={`thumb thumb-empty ${className || ''}`}><ImageOff size={18} /></div>;
  if (!src) return <div className={`thumb skeleton ${className || ''}`} />;
  return <img src={src} alt={alt} className={className} onClick={onClick} />;
}

/* Xem ảnh lớn; bấm ra ngoài hoặc Esc để đóng */
export function Lightbox({ path, title, onClose }) {
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
        <AuthImage path={path} alt={title} />
        {title && <div className="lightbox-cap">{title}</div>}
      </div>
    </div>
  );
}

/* Hàng ảnh thu nhỏ của một đơn xin vắng, bấm để xem lớn */
export function RequestThumbs({ request }) {
  const [open, setOpen] = useState(null);
  if (!request.files?.length) return null;
  const path = (f) => `/attendance/requests/${request.id}/files/${f.id}`;
  return (
    <>
      <div className="thumbs">
        {request.files.map((f) => (
          <button key={f.id} className="thumb-btn" onClick={() => setOpen(f)} aria-label={`Xem ảnh ${f.name}`}>
            <AuthImage path={path(f)} alt={f.name} className="thumb" />
          </button>
        ))}
      </div>
      {open && <Lightbox path={path(open)} title={open.name} onClose={() => setOpen(null)} />}
    </>
  );
}

export function AttachmentCount({ count }) {
  if (!count) return null;
  return <span className="badge"><Paperclip size={12} />{count} ảnh</span>;
}

/* Chọn trạng thái điểm danh bằng một menu nhỏ, thay cho 4 nút icon mỗi dòng */
export function StatusMenu({ status, onChange, dirty }) {
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
        <StatusBadge status={status} /><ChevronDown size={14} className="muted" />
      </button>
      {open && (
        <div className="menu" role="listbox">
          {['present', 'late', 'excused', 'absent'].map((k) => {
            const S = STATUS[k];
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
