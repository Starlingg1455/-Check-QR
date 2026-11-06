import { useState } from 'react';
import { Check, X, FileText } from 'lucide-react';
import { api } from '../../api.js';
import { Card, Empty, Loading, ErrorBox, Badge, Avatar, useToast, fmtDateTime } from '../../components/ui.jsx';

const TONE = { pending: ['warning', 'Chờ duyệt'], approved: ['good', 'Đã duyệt'], rejected: ['critical', 'Từ chối'] };

export default function RequestsTab({ requests, onChanged }) {
  const toast = useToast();
  const [busyId, setBusyId] = useState(null);

  if (requests.loading) return <Loading />;
  if (requests.error) return <ErrorBox message={requests.error} onRetry={requests.reload} />;

  async function review(r, status) {
    setBusyId(r.id);
    try {
      await api(`/attendance/requests/${r.id}`, { method: 'PUT', body: { status } });
      toast.success(status === 'approved' ? `Đã duyệt: ${r.studentName} vắng có phép buổi ${r.sessionNo}` : 'Đã từ chối đơn');
      onChanged();
    } catch (e) { toast.error(e.message); } finally { setBusyId(null); }
  }

  return (
    <Card pad={false} title="Đơn xin vắng" subtitle="Duyệt đơn thì buổi đó chuyển thành “vắng có phép” và không tính vào số buổi vắng.">
      {requests.data.length === 0 ? (
        <Empty icon={FileText} title="Chưa có đơn nào">Khi sinh viên gửi đơn xin vắng, đơn sẽ hiện ở đây.</Empty>
      ) : (
        <div className="list">
          {requests.data.map((r) => (
            <div className="list-item" key={r.id} style={{ alignItems: 'flex-start' }}>
              <Avatar name={r.studentName} />
              <div className="grow">
                <div className="row wrap" style={{ gap: 8 }}>
                  <b>{r.studentName}</b><span className="small muted num">{r.studentCode}</span>
                  <Badge tone={TONE[r.status][0]}>{TONE[r.status][1]}</Badge>
                </div>
                <div className="small muted">Xin vắng buổi {r.sessionNo} · gửi lúc {fmtDateTime(r.createdAt)}</div>
                <p className="text-2" style={{ marginTop: 6 }}>{r.reason}</p>
              </div>
              {r.status === 'pending' && (
                <div className="row">
                  <button className="btn btn-secondary btn-sm" disabled={busyId === r.id} onClick={() => review(r, 'rejected')}><X size={15} />Từ chối</button>
                  <button className="btn btn-primary btn-sm" disabled={busyId === r.id} onClick={() => review(r, 'approved')}><Check size={15} />Duyệt</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
