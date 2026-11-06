import { useState } from 'react';
import { Check, X, FileText, Eye, Paperclip, CalendarDays, Clock } from 'lucide-react';
import { api } from '../../api.js';
import { fmtSize } from '../../image.js';
import { Card, Empty, Loading, ErrorBox, Badge, Avatar, Modal, Field, BtnSpinner, useToast, fmtDateTime } from '../../components/ui.jsx';
import { AuthImage, Lightbox } from '../../components/extras.jsx';

const TONE = { pending: ['warning', 'Chờ duyệt'], approved: ['good', 'Đã duyệt'], rejected: ['critical', 'Từ chối'] };
const filePath = (r, f) => `/attendance/requests/${r.id}/files/${f.id}`;

/* Màn hình chi tiết: giảng viên xem đủ lý do + ảnh minh chứng rồi mới duyệt hoặc từ chối */
function RequestDetail({ request: r, onClose, onReviewed }) {
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
              <div className="row wrap" style={{ gap: 8 }}><b style={{ fontSize: 17 }}>{r.studentName}</b><Badge tone={TONE[r.status][0]}>{TONE[r.status][1]}</Badge></div>
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
                    <AuthImage path={filePath(r, f)} alt={f.name} />
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
      {zoom && <Lightbox path={filePath(r, zoom)} title={zoom.name} onClose={() => setZoom(null)} />}
    </>
  );
}

export default function RequestsTab({ requests, onChanged }) {
  const [open, setOpen] = useState(null);

  if (requests.loading) return <Loading />;
  if (requests.error) return <ErrorBox message={requests.error} onRetry={requests.reload} />;
  const current = open && requests.data.find((r) => r.id === open);
  const pending = requests.data.filter((r) => r.status === 'pending').length;

  return (
    <>
      <Card pad={false} title="Đơn xin vắng" subtitle={pending ? `${pending} đơn đang chờ bạn xem và duyệt` : 'Bấm vào một đơn để xem chi tiết và ảnh minh chứng.'}>
        {requests.data.length === 0 ? (
          <Empty icon={FileText} title="Chưa có đơn nào">Khi sinh viên gửi đơn xin vắng (kèm ảnh minh chứng), đơn sẽ hiện ở đây.</Empty>
        ) : (
          <div className="list">
            {requests.data.map((r) => (
              <div className="list-item request-row" key={r.id} onClick={() => setOpen(r.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(r.id)} style={{ alignItems: 'flex-start' }}>
                <Avatar name={r.studentName} />
                <div className="grow">
                  <div className="row wrap" style={{ gap: 8 }}>
                    <b>{r.studentName}</b><span className="small muted num">{r.studentCode}</span>
                    <Badge tone={TONE[r.status][0]}>{TONE[r.status][1]}</Badge>
                    {r.files.length > 0 && <Badge icon={Paperclip}>{r.files.length} ảnh</Badge>}
                  </div>
                  <div className="small muted">Xin vắng buổi {r.sessionNo} · gửi lúc {fmtDateTime(r.createdAt)}</div>
                  <p className="text-2 clamp-2" style={{ marginTop: 6 }}>{r.reason}</p>
                  {r.files.length > 0 && (
                    <div className="thumbs">
                      {r.files.map((f) => <AuthImage key={f.id} path={filePath(r, f)} alt={f.name} className="thumb" />)}
                    </div>
                  )}
                </div>
                <button className={`btn btn-sm ${r.status === 'pending' ? 'btn-primary' : 'btn-secondary'}`} onClick={(e) => { e.stopPropagation(); setOpen(r.id); }}>
                  <Eye size={15} />{r.status === 'pending' ? 'Xem & duyệt' : 'Xem'}
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
      {current && <RequestDetail request={current} onClose={() => setOpen(null)} onReviewed={() => { setOpen(null); onChanged(); }} />}
    </>
  );
}
