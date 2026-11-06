import { useState } from 'react';
import { Check, X, Eye, Paperclip, CalendarDays, Clock } from 'lucide-react';
import { api } from '../../api.js';
import { fmtSize } from '../../image.js';
import { Avatar, Badge, Modal, Field, BtnSpinner, useToast, fmtDateTime } from '../../components/ui.jsx';
import { AuthImage, Lightbox } from '../../components/extras.jsx';

export const REQUEST_TONE = { pending: ['warning', 'Chờ duyệt'], approved: ['good', 'Đã duyệt'], rejected: ['critical', 'Từ chối'] };
export const requestFilePath = (r, f) => `/attendance/requests/${r.id}/files/${f.id}`;

/* Màn hình chi tiết một đơn xin vắng: giảng viên xem đủ lý do + ảnh minh chứng rồi mới duyệt/từ chối.
   Dùng chung ở tab "Đơn xin vắng" và trong cửa sổ chi tiết sinh viên. */
export function RequestDetailModal({ request: r, onClose, onReviewed }) {
  const toast = useToast();
  const [note, setNote] = useState(r.teacherNote || '');
  const [busy, setBusy] = useState('');
  const [zoom, setZoom] = useState(null);

  async function review(status) {
    setBusy(status);
    try {
      await api(`/attendance/requests/${r.id}`, { method: 'PUT', body: { status, teacherNote: note.trim() || undefined } });
      toast.success(status === 'approved' ? `Đã duyệt: ${r.studentName} vắng có phép buổi ${r.sessionNo}` : 'Đã từ chối đơn');
      onReviewed();
    } catch (e) { toast.error(e.message); setBusy(''); }
  }

  return (
    <>
      <Modal
        wide
        title="Chi tiết đơn xin vắng"
        onClose={onClose}
        footer={r.status === 'pending' ? (
          <>
            <button className="btn btn-secondary" disabled={Boolean(busy)} onClick={() => review('rejected')}>{busy === 'rejected' ? <BtnSpinner /> : <X size={16} />}Từ chối</button>
            <button className="btn btn-primary" disabled={Boolean(busy)} onClick={() => review('approved')}>{busy === 'approved' ? <BtnSpinner /> : <Check size={16} />}Duyệt (vắng có phép)</button>
          </>
        ) : <button className="btn btn-secondary" onClick={onClose}>Đóng</button>}
      >
        <div className="stack">
          <div className="row">
            <Avatar name={r.studentName} size="lg" />
            <div className="grow">
              <div className="row wrap" style={{ gap: 8 }}><b style={{ fontSize: 17 }}>{r.studentName}</b><Badge tone={REQUEST_TONE[r.status][0]}>{REQUEST_TONE[r.status][1]}</Badge></div>
              <div className="small muted">MSSV {r.studentCode} · {r.studentEmail}</div>
            </div>
          </div>

          <div className="detail-meta">
            <div><span className="muted small row" style={{ gap: 6 }}><CalendarDays size={14} />Xin vắng</span><b>Buổi {r.sessionNo}</b></div>
            <div><span className="muted small row" style={{ gap: 6 }}><Clock size={14} />Gửi lúc</span><b>{fmtDateTime(r.createdAt)}</b></div>
          </div>

          <div>
            <div className="small bold text-2" style={{ marginBottom: 6 }}>Lý do</div>
            <p className="detail-reason">{r.reason}</p>
          </div>

          <div>
            <div className="small bold text-2" style={{ marginBottom: 8 }}>Ảnh minh chứng ({r.files.length})</div>
            {r.files.length === 0 ? (
              <div className="alert warn small">Sinh viên không đính kèm ảnh minh chứng.</div>
            ) : (
              <div className="detail-gallery">
                {r.files.map((f) => (
                  <button key={f.id} className="detail-photo" onClick={() => setZoom(f)} aria-label={`Phóng to ${f.name}`}>
                    <AuthImage path={requestFilePath(r, f)} alt={f.name} />
                    <span>{f.name} · {fmtSize(f.size)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {r.status === 'pending' ? (
            <Field label="Ghi chú cho sinh viên (không bắt buộc)">
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: Đã nhận giấy khám bệnh" maxLength={200} />
            </Field>
          ) : r.teacherNote && (
            <div className="alert"><span className="small"><b>Ghi chú của giảng viên:</b> {r.teacherNote}</span></div>
          )}
        </div>
      </Modal>
      {zoom && <Lightbox path={requestFilePath(r, zoom)} title={zoom.name} onClose={() => setZoom(null)} />}
    </>
  );
}

/* Dòng tóm tắt một đơn (1 dòng): nhãn trạng thái, lý do ngắn, số ảnh, nút xem/duyệt. Bấm cả dòng để mở chi tiết. */
export function RequestChip({ request, onOpen }) {
  const [tone, label] = REQUEST_TONE[request.status];
  const pending = request.status === 'pending';
  return (
    <div className="request-chip" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()} aria-label={`${label}: ${request.reason}`}>
      <Badge tone={tone}>{label}</Badge>
      <span className="request-chip-text">{request.reason}</span>
      {request.files.length > 0 && <Badge icon={Paperclip}>{request.files.length}</Badge>}
      <span className={`btn btn-sm ${pending ? 'btn-primary' : 'btn-secondary'}`}><Eye size={14} />{pending ? 'Xem & duyệt' : 'Xem'}</span>
    </div>
  );
}
