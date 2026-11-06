// Luồng sửa tay an toàn: chọn trạng thái mới => chỉ đánh dấu "chưa lưu"; bấm Lưu => hộp xác nhận liệt kê
// từng thay đổi; xác nhận mới ghi (tất cả trong một lần). Dùng chung cho trang điểm danh và chi tiết sinh viên.
import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Save, Undo2, AlertTriangle } from 'lucide-react';
import { Modal, StatusBadge, BtnSpinner } from './ui.jsx';

/* Giữ các thay đổi chưa lưu: key -> trạng thái mới. Đổi về đúng trạng thái gốc thì tự bỏ khỏi danh sách. */
export function useStaged() {
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
export function useUnsavedWarning(active) {
  useEffect(() => {
    if (!active) return undefined;
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [active]);
}

/* Thanh "N thay đổi chưa lưu" (Huỷ / Lưu). inline = đặt trong chân hộp thoại, mặc định dính ở đáy trang. */
export function SaveBar({ count, onDiscard, onSave, inline }) {
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
export function ConfirmModal({ title, message, confirmText = 'Xác nhận', cancelText = 'Quay lại', danger, busy, onConfirm, onClose, children }) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>{cancelText}</button>
          <button className="btn btn-primary" style={danger ? { background: 'var(--critical)' } : undefined} onClick={onConfirm} disabled={busy}>{busy && <BtnSpinner />}{confirmText}</button>
        </>
      }
    >
      <div className="stack">
        {message && <p className="text-2">{message}</p>}
        {children}
      </div>
    </Modal>
  );
}

/* Hộp xác nhận lưu: liệt kê từng thay đổi "trước -> sau". items = [{ id, title, sub, from, to }] */
export function ConfirmChangesModal({ items, busy, onConfirm, onClose }) {
  return (
    <ConfirmModal
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
            <span className="row" style={{ gap: 8 }}><StatusBadge status={it.from} /><ArrowRight size={14} className="muted" /><StatusBadge status={it.to} /></span>
          </div>
        ))}
      </div>
      {items.some((it) => it.to === 'absent') && (
        <div className="alert warn small"><AlertTriangle size={16} style={{ flex: 'none' }} /><span>Có mục chuyển sang <b>Vắng</b>: số buổi vắng tăng và có thể ảnh hưởng điều kiện dự thi.</span></div>
      )}
    </ConfirmModal>
  );
}
