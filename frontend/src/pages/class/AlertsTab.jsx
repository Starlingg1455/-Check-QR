import { useState } from 'react';
import { Send, ShieldAlert, PartyPopper, MailCheck } from 'lucide-react';
import { api } from '../../api.js';
import { Card, Empty, Loading, ErrorBox, Badge, LevelBadge, LEVEL, useLoad, useToast, fmtDateTime, BtnSpinner } from '../../components/ui.jsx';

const MAIL = { sent: ['good', 'Đã gửi'], logged: ['info', 'Ghi log'], failed: ['critical', 'Gửi lỗi'] };

/* Tab Cảnh báo: ai sắp bị cấm thi, gửi email nhắc, lịch sử email */
export default function AlertsTab({ cls, stats }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const history = useLoad(() => api(`/attendance/notifications?classId=${cls.id}`), [cls.id]);

  if (stats.loading) return <Loading />;
  if (stats.error) return <ErrorBox message={stats.error} onRetry={stats.reload} />;
  const s = stats.data;
  const risky = s.perStudent.filter((x) => x.level !== 'ok').sort((a, b) => b.absent - a.absent);

  async function send() {
    setBusy(true);
    try {
      const r = await api('/attendance/warnings/send', { method: 'POST', body: { classId: cls.id } });
      toast.success(r.mailConfigured ? `Đã gửi ${r.count} email cảnh báo` : `Đã ghi nhận ${r.count} cảnh báo (chưa cấu hình SMTP nên chưa gửi email thật)`);
      history.refresh();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="stack-lg">
      <Card
        pad={false}
        title="Sinh viên cần chú ý"
        subtitle={`Giới hạn: vắng quá ${s.absentLimit} buổi không phép (${s.class.maxAbsentPercent}% của ${s.class.totalSessions} buổi) sẽ bị cấm thi.`}
        actions={risky.length > 0 && <button className="btn btn-primary" onClick={send} disabled={busy}>{busy ? <BtnSpinner /> : <Send size={16} />}Gửi email cảnh báo</button>}
      >
        {risky.length === 0 ? (
          <Empty icon={PartyPopper} title="Tuyệt vời!">Chưa có sinh viên nào gần chạm giới hạn vắng.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Sinh viên</th><th className="right">Đã vắng</th><th className="hide-sm" style={{ width: '30%' }}>So với giới hạn</th><th>Tình trạng</th></tr></thead>
              <tbody>
                {risky.map((x) => (
                  <tr key={x.email}>
                    <td><div className="bold">{x.fullName}</div><div className="xs muted">{x.studentCode}</div></td>
                    <td className="right num bold">{x.absent}/{s.absentLimit}</td>
                    <td className="hide-sm"><div className="bar"><span style={{ width: `${Math.min(100, (x.absent / Math.max(1, s.absentLimit)) * 100)}%`, background: `var(${LEVEL[x.level].cssVar})` }} /></div></td>
                    <td><LevelBadge level={x.level} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Lịch sử email đã gửi" pad={false}>
        {history.loading ? <Loading /> : history.error ? <ErrorBox message={history.error} /> : history.data.length === 0 ? (
          <Empty icon={MailCheck} title="Chưa gửi email nào">Email nêu rõ số buổi đã vắng và giới hạn cho phép.</Empty>
        ) : (
          <div className="list">
            {history.data.map((n) => (
              <div className="list-item" key={n.id}>
                <div className="grow"><div className="bold">{n.studentName}</div><div className="small muted truncate">{n.subject}</div></div>
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
