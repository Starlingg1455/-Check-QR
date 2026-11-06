import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Play, QrCode, ClipboardCheck, Trash2, CalendarDays, Radio } from 'lucide-react';
import { api } from '../../api.js';
import { Card, Badge, Empty, Loading, ErrorBox, Modal, Field, useToast, fmtDateTime, pct, Ring } from '../../components/ui.jsx';

export default function SessionsTab({ cls, sessions, stats, onChanged }) {
  const nav = useNavigate();
  const toast = useToast();
  const [opening, setOpening] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  if (sessions.loading) return <Loading />;
  if (sessions.error) return <ErrorBox message={sessions.error} onRetry={sessions.reload} />;

  const list = [...sessions.data].reverse();
  const openOne = list.find((s) => s.status === 'open');
  const rateOf = (id) => stats?.perSession.find((x) => x.sessionId === id);

  async function openSession(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const s = await api('/sessions/sessions', { method: 'POST', body: { classId: cls.id, title } });
      toast.success(`Đã mở buổi ${s.sessionNo}`);
      nav(`/classes/${cls.id}/sessions/${s.id}`);
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  }
  async function remove() {
    try {
      await api(`/sessions/sessions/${toDelete.id}`, { method: 'DELETE' });
      toast.success('Đã xoá buổi học');
      setToDelete(null);
      onChanged();
    } catch (err) { toast.error(err.message); }
  }

  return (
    <div className="stack">
      {openOne ? (
        <div className="card card-pad row wrap" style={{ background: 'var(--accent-soft)', borderColor: 'transparent' }}>
          <Radio size={22} color="var(--accent-ink)" />
          <div className="grow">
            <b>{openOne.title} đang điểm danh</b>
            <div className="small text-2">Mở lúc {fmtDateTime(openOne.openedAt)}. Hãy chiếu mã QR cho sinh viên quét.</div>
          </div>
          <Link to={`/classes/${cls.id}/sessions/${openOne.id}`} className="btn btn-primary"><QrCode size={17} />Mở màn hình QR</Link>
        </div>
      ) : (
        <div className="row between wrap">
          <p className="text-2">Mỗi lần dạy, hãy mở một buổi điểm danh mới.</p>
          <button className="btn btn-primary" onClick={() => setOpening(true)}><Play size={16} />Mở buổi điểm danh</button>
        </div>
      )}

      <Card pad={false} title={`Các buổi học (${list.length})`}>
        {list.length === 0 ? (
          <Empty icon={CalendarDays} title="Chưa có buổi học nào">Bấm "Mở buổi điểm danh" để bắt đầu buổi đầu tiên.</Empty>
        ) : (
          <div className="list">
            {list.map((s) => {
              const r = rateOf(s.id);
              return (
                <div className="list-item" key={s.id}>
                  <div className="timeline-no">{s.sessionNo}</div>
                  <div className="grow">
                    <div className="bold">{s.title}</div>
                    <div className="small muted">{fmtDateTime(s.openedAt)}</div>
                  </div>
                  {s.status === 'open'
                    ? <Badge tone="live"><span className="dot pulse" />Đang mở</Badge>
                    : r && <span className="hide-sm" title={`${r.present + r.late}/${r.present + r.late + r.excused + r.absent} sinh viên có mặt`}><Ring value={r.rate} size={44} stroke={5} /></span>}
                  <Link className="btn btn-secondary btn-sm" to={`/classes/${cls.id}/sessions/${s.id}`}>
                    {s.status === 'open' ? <><QrCode size={15} />Mở QR</> : <><ClipboardCheck size={15} />Điểm danh</>}
                  </Link>
                  <button className="btn btn-ghost btn-icon btn-sm" aria-label="Xoá buổi" onClick={() => setToDelete(s)}><Trash2 size={16} /></button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {opening && (
        <Modal title="Mở buổi điểm danh" onClose={() => setOpening(false)}>
          <form className="stack" onSubmit={openSession}>
            <Field label="Tên buổi (không bắt buộc)" hint={`Để trống sẽ đặt là "Buổi ${sessions.data.length + 1}"`}>
              <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: Chương 3 - Kiến trúc microservices" />
            </Field>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setOpening(false)}>Huỷ</button>
              <button className="btn btn-primary" disabled={busy}><Play size={16} />Bắt đầu</button>
            </div>
          </form>
        </Modal>
      )}
      {toDelete && (
        <Modal title={`Xoá ${toDelete.title}?`} onClose={() => setToDelete(null)} footer={
          <>
            <button className="btn btn-secondary" onClick={() => setToDelete(null)}>Huỷ</button>
            <button className="btn btn-primary" style={{ background: 'var(--critical)' }} onClick={remove}>Xoá buổi</button>
          </>
        }>
          <p className="text-2">Buổi học sẽ biến mất khỏi thống kê. Không thể hoàn tác.</p>
        </Modal>
      )}
    </div>
  );
}
