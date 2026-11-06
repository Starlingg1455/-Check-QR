import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FilePlus2, CalendarCheck, Percent, ShieldAlert, Hourglass } from 'lucide-react';
import { api } from '../api.js';
import { Card, PageHead, StatTile, StatusBadge, Badge, Modal, Field, Loading, ErrorBox, Empty, useLoad, useToast, fmtDateTime, pct } from '../components/ui.jsx';

const REQ = { pending: ['warning', 'Đơn chờ duyệt'], approved: ['good', 'Đơn đã duyệt'], rejected: ['critical', 'Đơn bị từ chối'] };

export default function StudentClass() {
  const { id } = useParams();
  const toast = useToast();
  const data = useLoad(() => api(`/attendance/classes/${id}/me`), [id]);
  const [target, setTarget] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  if (data.loading) return <Loading />;
  if (data.error) return <ErrorBox message={data.error} onRetry={data.reload} />;
  const { class: c, summary, history, student } = data.data;
  const limit = Math.floor((c.totalSessions * c.maxAbsentPercent) / 100);
  const used = Math.min(100, limit ? (summary.absent / limit) * 100 : summary.absent ? 100 : 0);
  const over = summary.absent > limit;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/attendance/requests', { method: 'POST', body: { classId: Number(id), sessionId: target.sessionId, reason } });
      toast.success('Đã gửi đơn xin vắng');
      setTarget(null); setReason('');
      data.refresh();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHead
        back={<Link to="/" className="back-link"><ArrowLeft size={16} />Lớp của tôi</Link>}
        title={c.name}
        subtitle={<span className="row wrap" style={{ gap: 12 }}><span className="class-code">{c.code}</span><span>{student.full_name} · {student.student_code}</span></span>}
      />

      <div className="tiles">
        <StatTile icon={Percent} tone="good" label="Tỉ lệ đi học" value={summary.rate ?? '—'} unit={summary.rate === null ? '' : '%'} sub={`${summary.sessions} buổi đã học`} />
        <StatTile icon={CalendarCheck} label="Có mặt" value={summary.present + summary.late} sub={`${summary.late} lần đi trễ`} />
        <StatTile icon={ShieldAlert} tone={over ? 'critical' : summary.absent >= limit && limit > 0 ? 'serious' : ''} label="Vắng không phép" value={summary.absent} unit={`/${limit}`} sub="Quá giới hạn sẽ bị cấm thi" />
        <StatTile icon={Hourglass} label="Vắng có phép" value={summary.excused} sub="Không tính vào giới hạn" />
      </div>

      <div className="card card-pad" style={{ margin: '16px 0 24px' }}>
        <div className="row between">
          <b>Giới hạn vắng: {summary.absent}/{limit} buổi</b>
          {over ? <Badge tone="critical" icon={ShieldAlert}>Đã vượt giới hạn</Badge> : summary.absent >= limit && limit > 0 ? <Badge tone="serious" icon={ShieldAlert}>Sắp bị cấm thi</Badge> : <Badge tone="good">An toàn</Badge>}
        </div>
        <div className={`bar ${over ? 'critical' : used >= 66 ? 'warning' : 'good'}`} style={{ marginTop: 12 }}><span style={{ width: `${used}%` }} /></div>
        <p className="small muted" style={{ marginTop: 8 }}>Mỗi lớp cho phép vắng tối đa {c.maxAbsentPercent}% trong {c.totalSessions} buổi. Nếu có lý do chính đáng, hãy gửi đơn xin vắng để giảng viên duyệt.</p>
      </div>

      <Card title="Lịch sử điểm danh" pad={false}>
        {history.length === 0 ? (
          <Empty icon={CalendarCheck} title="Chưa có buổi học nào" />
        ) : (
          <div className="list">
            {history.map((h) => (
              <div className="timeline-item" key={h.sessionId}>
                <div className="timeline-no">{h.sessionNo}</div>
                <div className="grow">
                  <div className="bold">{h.title}</div>
                  <div className="small muted">{fmtDateTime(h.openedAt)}{h.checkedAt && h.attendance !== 'absent' && ` · điểm danh ${new Date(h.checkedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`}</div>
                </div>
                {h.request && <Badge tone={REQ[h.request.status][0]}>{REQ[h.request.status][1]}</Badge>}
                <StatusBadge status={h.attendance} />
                {h.attendance === 'absent' && !h.request && (
                  <button className="btn btn-secondary btn-sm" onClick={() => setTarget(h)}><FilePlus2 size={15} /><span className="hide-sm">Xin vắng</span></button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {target && (
        <Modal title={`Xin vắng buổi ${target.sessionNo}`} onClose={() => setTarget(null)}>
          <form className="stack" onSubmit={submit}>
            <p className="small text-2">{target.title} · {fmtDateTime(target.openedAt)}</p>
            <Field label="Lý do" hint="Nêu rõ lý do và minh chứng (nếu có). Giảng viên duyệt thì buổi này thành “vắng có phép”.">
              <textarea className="textarea" required autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD: Em bị ốm, có giấy khám bệnh ạ." />
            </Field>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setTarget(null)}>Huỷ</button>
              <button className="btn btn-primary" disabled={busy}>Gửi đơn</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
