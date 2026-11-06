import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FilePlus2, CalendarCheck, ShieldAlert, ImagePlus, X } from 'lucide-react';
import { api } from '../api.js';
import { compressImage, fmtSize } from '../image.js';
import { Card, PageHead, StatusBadge, Badge, Modal, Field, Loading, ErrorBox, Empty, BtnSpinner, useLoad, useToast, fmtDateTime, pct } from '../components/ui.jsx';
import { AttachmentCount, RequestThumbs } from '../components/extras.jsx';

const REQ = { pending: ['warning', 'Đơn chờ duyệt'], approved: ['good', 'Đơn đã duyệt'], rejected: ['critical', 'Đơn bị từ chối'] };
const MAX_FILES = 3;

/* Hộp thoại gửi đơn xin vắng kèm ảnh minh chứng */
function AbsenceRequestModal({ classId, session, onClose, onSent }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [reason, setReason] = useState('');
  const [files, setFiles] = useState([]); // [{ file, url }]
  const [busy, setBusy] = useState(false);

  async function addFiles(e) {
    const picked = [...(e.target.files || [])];
    e.target.value = '';
    const room = MAX_FILES - files.length;
    if (picked.length > room) toast.info(`Chỉ đính kèm tối đa ${MAX_FILES} ảnh`);
    try {
      const compressed = await Promise.all(picked.slice(0, room).map(compressImage));
      setFiles((cur) => [...cur, ...compressed.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
    } catch (err) { toast.error(err.message); }
  }
  const removeFile = (i) => setFiles((cur) => { URL.revokeObjectURL(cur[i].url); return cur.filter((_, k) => k !== i); });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('classId', classId);
      fd.append('sessionId', session.sessionId);
      fd.append('reason', reason);
      files.forEach(({ file }) => fd.append('files', file));
      await api('/attendance/requests', { method: 'POST', form: fd });
      toast.success('Đã gửi đơn xin vắng');
      onSent();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  }

  return (
    <Modal title={`Xin vắng buổi ${session.sessionNo}`} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <p className="small text-2">{session.title} · {fmtDateTime(session.openedAt)}</p>
        <Field label="Lý do">
          <textarea className="textarea" required autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD: Em bị ốm, có giấy khám bệnh đính kèm ạ." />
        </Field>

        <Field label={`Ảnh minh chứng (${files.length}/${MAX_FILES})`} hint="Giấy khám bệnh, giấy xác nhận… Ảnh được tự động nén trước khi gửi. Không bắt buộc.">
          {files.length > 0 && (
            <div className="preview-grid">
              {files.map((f, i) => (
                <div className="preview" key={f.url}>
                  <img src={f.url} alt={`Ảnh ${i + 1}`} />
                  <button type="button" className="preview-remove" onClick={() => removeFile(i)} aria-label="Bỏ ảnh này"><X size={14} /></button>
                  <span className="preview-size">{fmtSize(f.file.size)}</span>
                </div>
              ))}
            </div>
          )}
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={addFiles} />
          <button type="button" className="dropzone" onClick={() => inputRef.current.click()} disabled={files.length >= MAX_FILES}>
            <ImagePlus size={20} />{files.length ? 'Thêm ảnh' : 'Chọn ảnh hoặc chụp ảnh'}
          </button>
        </Field>

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Huỷ</button>
          <button className="btn btn-primary" disabled={busy}>{busy && <BtnSpinner />}Gửi đơn</button>
        </div>
      </form>
    </Modal>
  );
}

export default function StudentClass() {
  const { id } = useParams();
  const data = useLoad(() => api(`/attendance/classes/${id}/me`), [id]);
  const [target, setTarget] = useState(null);

  if (data.loading) return <Loading />;
  if (data.error) return <ErrorBox message={data.error} onRetry={data.reload} />;
  const { class: c, summary, history, student } = data.data;
  const limit = Math.floor((c.totalSessions * c.maxAbsentPercent) / 100);
  const used = Math.min(100, limit ? (summary.absent / limit) * 100 : summary.absent ? 100 : 0);
  const over = summary.absent > limit;
  const near = !over && limit > 0 && summary.absent >= limit;

  return (
    <>
      <PageHead
        back={<Link to="/" className="back-link"><ArrowLeft size={16} />Lớp của tôi</Link>}
        title={c.name}
        subtitle={<span className="row wrap" style={{ gap: 12 }}><span className="class-code">{c.code}</span><span>{student.full_name} · {student.student_code}</span></span>}
      />

      {/* Một thẻ duy nhất: tình trạng giới hạn vắng + 3 con số chính */}
      <section className="card summary-card">
        <div className="summary-main">
          <div className="row between wrap">
            <span className="small text-2 bold">Vắng không phép</span>
            {over ? <Badge tone="critical" icon={ShieldAlert}>Đã vượt giới hạn</Badge> : near ? <Badge tone="serious" icon={ShieldAlert}>Sắp bị cấm thi</Badge> : <Badge tone="good">An toàn</Badge>}
          </div>
          <div style={{ margin: '10px 0 14px' }}>
            <span className="big-count num" style={{ fontSize: 44 }}>{summary.absent}</span>
            <span className="muted bold" style={{ fontSize: 20 }}> / {limit} buổi cho phép</span>
          </div>
          <div className={`bar ${over ? 'critical' : used >= 66 ? 'warning' : 'good'}`}><span style={{ width: `${used}%` }} /></div>
          <p className="small muted" style={{ marginTop: 10 }}>Lớp cho phép vắng tối đa {c.maxAbsentPercent}% trong {c.totalSessions} buổi. Có lý do chính đáng thì gửi đơn xin vắng để giảng viên duyệt.</p>
        </div>
        <div className="summary-side">
          <div><b className="num">{pct(summary.rate)}</b><span>Tỉ lệ đi học</span></div>
          <div><b className="num">{summary.present + summary.late}</b><span>Có mặt{summary.late ? ` (${summary.late} trễ)` : ''}</span></div>
          <div><b className="num">{summary.excused}</b><span>Vắng có phép</span></div>
        </div>
      </section>

      <div className="section-title"><h2>Lịch sử điểm danh</h2><p>{summary.sessions} buổi đã học</p></div>
      <Card pad={false}>
        {history.length === 0 ? (
          <Empty icon={CalendarCheck} title="Chưa có buổi học nào" />
        ) : (
          <div className="list">
            {history.map((h) => (
              <div className="timeline-item" key={h.sessionId} style={{ alignItems: 'flex-start' }}>
                <div className="timeline-no">{h.sessionNo}</div>
                <div className="grow">
                  <div className="bold">{h.title}</div>
                  <div className="small muted">{fmtDateTime(h.openedAt)}</div>
                  {h.request && (
                    <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                      <Badge tone={REQ[h.request.status][0]}>{REQ[h.request.status][1]}</Badge>
                      <AttachmentCount count={h.request.files.length} />
                    </div>
                  )}
                  {h.request && <RequestThumbs request={h.request} />}
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <StatusBadge status={h.attendance} />
                  {h.attendance === 'absent' && !h.request && (
                    <button className="btn btn-secondary btn-sm" onClick={() => setTarget(h)}><FilePlus2 size={15} /><span className="hide-sm">Xin vắng</span></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {target && <AbsenceRequestModal classId={Number(id)} session={target} onClose={() => setTarget(null)} onSent={() => { setTarget(null); data.refresh(); }} />}
    </>
  );
}
