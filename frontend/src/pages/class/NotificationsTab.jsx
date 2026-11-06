import { useState } from 'react';
import { Mail, Send, Bell } from 'lucide-react';
import { api } from '../../api.js';
import { Card, Empty, Loading, ErrorBox, Badge, useLoad, useToast, fmtDateTime, LevelBadge, BtnSpinner } from '../../components/ui.jsx';

const MAIL = { sent: ['good', 'Đã gửi'], logged: ['info', 'Ghi log (chưa có SMTP)'], failed: ['critical', 'Gửi lỗi'] };

export default function NotificationsTab({ cls, stats }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const history = useLoad(() => api(`/attendance/notifications?classId=${cls.id}`), [cls.id]);
  const atRisk = (stats?.perStudent || []).filter((s) => s.level !== 'ok');

  async function send() {
    setBusy(true);
    try {
      const r = await api('/attendance/warnings/send', { method: 'POST', body: { classId: cls.id } });
      toast.success(r.count ? `Đã xử lý ${r.count} email cảnh báo` : 'Không có sinh viên nào cần cảnh báo');
      history.refresh();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="stack">
      <div className="card card-pad row wrap">
        <div className="tile-icon serious"><Mail size={18} /></div>
        <div className="grow">
          <b>{atRisk.length} sinh viên đang ở mức cảnh báo</b>
          <div className="small text-2">Email nêu rõ số buổi đã vắng và giới hạn cho phép. Chỉ gửi cho sinh viên “cần chú ý” trở lên.</div>
        </div>
        <button className="btn btn-primary" onClick={send} disabled={busy || atRisk.length === 0}>{busy ? <BtnSpinner /> : <Send size={16} />}Gửi cảnh báo ngay</button>
      </div>

      {atRisk.length > 0 && (
        <Card title="Sẽ được gửi tới" pad={false}>
          <div className="list">
            {atRisk.map((s) => (
              <div className="list-item" key={s.email}>
                <div className="grow"><b>{s.fullName}</b><div className="small muted">{s.email}</div></div>
                <span className="small num text-2">Vắng {s.absent}/{stats.absentLimit}</span>
                <LevelBadge level={s.level} />
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Lịch sử email" pad={false}>
        {history.loading ? <Loading /> : history.error ? <ErrorBox message={history.error} /> : history.data.length === 0 ? (
          <Empty icon={Bell} title="Chưa gửi email nào" />
        ) : (
          <div className="list">
            {history.data.map((n) => (
              <div className="list-item" key={n.id}>
                <div className="grow">
                  <div className="bold">{n.studentName}</div>
                  <div className="small muted truncate">{n.subject}</div>
                </div>
                <span className="small muted hide-sm">{fmtDateTime(n.createdAt)}</span>
                <Badge tone={MAIL[n.status][0]} title={n.detail}>{MAIL[n.status][1]}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
