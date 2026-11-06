import { useState } from 'react';
import { FileText, Eye, Paperclip } from 'lucide-react';
import { Card, Empty, Loading, ErrorBox, Badge, Avatar, fmtDateTime } from '../../components/ui.jsx';
import { AuthImage } from '../../components/extras.jsx';
import { RequestDetailModal, REQUEST_TONE, requestFilePath } from './RequestDetailModal.jsx';

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
                    <Badge tone={REQUEST_TONE[r.status][0]}>{REQUEST_TONE[r.status][1]}</Badge>
                    {r.files.length > 0 && <Badge icon={Paperclip}>{r.files.length} ảnh</Badge>}
                  </div>
                  <div className="small muted">Xin vắng buổi {r.sessionNo} · gửi lúc {fmtDateTime(r.createdAt)}</div>
                  <p className="text-2 clamp-2" style={{ marginTop: 6 }}>{r.reason}</p>
                  {r.files.length > 0 && (
                    <div className="thumbs">
                      {r.files.map((f) => <AuthImage key={f.id} path={requestFilePath(r, f)} alt={f.name} className="thumb" />)}
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
      {current && <RequestDetailModal request={current} onClose={() => setOpen(null)} onReviewed={() => { setOpen(null); onChanged(); }} />}
    </>
  );
}
