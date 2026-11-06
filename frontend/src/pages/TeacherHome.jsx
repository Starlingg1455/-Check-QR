import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Users, CalendarCheck, Percent, ShieldAlert, BookOpen, MapPin, ChevronRight } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { PageHead, StatTile, Ring, Empty, Loading, ErrorBox, Modal, Field, useLoad, useToast, Badge, pct } from '../components/ui.jsx';

export function ClassFormModal({ initial, onClose, onSaved, onDelete }) {
  const toast = useToast();
  const [f, setF] = useState({
    code: initial?.code || '', name: initial?.name || '', room: initial?.room || '', semester: initial?.semester || '',
    totalSessions: initial?.total_sessions || 15, maxAbsentPercent: initial?.max_absent_percent ?? 20,
  });
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const limit = Math.floor((Number(f.totalSessions) * Number(f.maxAbsentPercent)) / 100);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { ...f, totalSessions: Number(f.totalSessions), maxAbsentPercent: Number(f.maxAbsentPercent) };
      const saved = initial
        ? await api(`/account/classes/${initial.id}`, { method: 'PUT', body })
        : await api('/account/classes', { method: 'POST', body });
      toast.success(initial ? 'Đã cập nhật lớp' : 'Đã tạo lớp mới');
      onSaved(saved);
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  }

  return (
    <Modal title={initial ? 'Sửa thông tin lớp' : 'Tạo lớp mới'} onClose={onClose}>
      <form className="stack" onSubmit={submit} id="class-form">
        <div className="form-grid">
          <Field label="Mã lớp"><input className="input" required value={f.code} onChange={set('code')} placeholder="INT3505" autoFocus /></Field>
          <Field label="Học kỳ"><input className="input" value={f.semester} onChange={set('semester')} placeholder="HK1 2025-2026" /></Field>
          <div className="full"><Field label="Tên môn học"><input className="input" required value={f.name} onChange={set('name')} placeholder="Phát triển phần mềm hướng dịch vụ" /></Field></div>
          <Field label="Phòng học"><input className="input" value={f.room} onChange={set('room')} placeholder="B3-201" /></Field>
          <Field label="Tổng số buổi"><input className="input" type="number" min="1" max="100" required value={f.totalSessions} onChange={set('totalSessions')} /></Field>
          <div className="full">
            <Field label="Tỉ lệ vắng tối đa cho phép (%)" hint={`Vắng quá ${limit} buổi (không phép) sẽ bị cấm thi. Đi trễ tính là có mặt, vắng có phép không bị tính.`}>
              <input className="input" type="number" min="0" max="100" required value={f.maxAbsentPercent} onChange={set('maxAbsentPercent')} />
            </Field>
          </div>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 6 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Huỷ</button>
          <button className="btn btn-primary" disabled={busy}>{initial ? 'Lưu thay đổi' : 'Tạo lớp'}</button>
        </div>
      </form>
      {onDelete && (
        <div className="danger-zone">
          <div className="small"><b>Xoá lớp này</b><div className="muted">Xoá cả danh sách sinh viên. Không thể hoàn tác.</div></div>
          {confirmDelete
            ? <button className="btn btn-primary btn-sm" style={{ background: 'var(--critical)' }} onClick={onDelete}>Chắc chắn xoá</button>
            : <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(true)}>Xoá lớp</button>}
        </div>
      )}
    </Modal>
  );
}

export default function TeacherHome() {
  const { user } = useAuth();
  const nav = useNavigate();
  const stats = useLoad(() => api('/statistics/overview'), []);
  const [creating, setCreating] = useState(false);
  const hour = new Date().getHours();
  const hello = hour < 11 ? 'Chào buổi sáng' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';

  if (stats.loading) return <Loading />;
  if (stats.error) return <ErrorBox message={stats.error} onRetry={stats.reload} />;
  const s = stats.data;

  return (
    <>
      <PageHead
        title={`${hello}, ${user.name.split(' ').slice(-1)[0]}`}
        subtitle="Tổng quan điểm danh các lớp bạn đang giảng dạy."
        actions={<button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={18} />Tạo lớp mới</button>}
      />

      <div className="tiles">
        <StatTile icon={BookOpen} label="Lớp đang dạy" value={s.classCount} sub={`${s.studentCount} sinh viên`} />
        <StatTile icon={CalendarCheck} label="Buổi đã điểm danh" value={s.sessionCount} sub="Tính trên tất cả các lớp" />
        <StatTile icon={Percent} tone="good" label="Tỉ lệ đi học TB" value={s.avgRate ?? '—'} unit={s.avgRate === null ? '' : '%'} sub={s.avgRate === null ? 'Chưa có buổi nào' : 'Có mặt + đi trễ'} />
        <StatTile icon={ShieldAlert} tone={s.atRisk ? 'critical' : 'good'} label="Cần cảnh báo vắng" value={s.atRisk} unit=" SV" sub={s.atRisk ? 'Sắp hoặc đã vượt giới hạn' : 'Mọi người đều ổn'} />
      </div>

      <h2 style={{ margin: '32px 0 14px' }}>Lớp học của bạn</h2>
      {s.classes.length === 0 ? (
        <div className="card">
          <Empty icon={BookOpen} title="Chưa có lớp nào" action={<button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={18} />Tạo lớp đầu tiên</button>}>
            Tạo lớp, thêm sinh viên rồi mở buổi điểm danh đầu tiên.
          </Empty>
        </div>
      ) : (
        <div className="grid-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
          {s.classes.map((c) => (
            <Link key={c.classId} to={`/classes/${c.classId}`} className="card card-hover class-card">
              <div className="row between" style={{ alignItems: 'flex-start' }}>
                <div className="grow">
                  <span className="class-code">{c.code}</span>
                  <h3 style={{ marginTop: 8, fontSize: 16 }}>{c.name}</h3>
                </div>
                <Ring value={c.avgRate} size={60} />
              </div>
              <div className="row wrap small text-2" style={{ gap: 16 }}>
                <span className="row" style={{ gap: 6 }}><Users size={15} />{c.studentCount} SV</span>
                <span className="row" style={{ gap: 6 }}><CalendarCheck size={15} />{c.closedSessions} buổi</span>
              </div>
              <div className="row between" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                {c.atRisk > 0
                  ? <Badge tone={c.banned ? 'critical' : 'serious'} icon={ShieldAlert}>{c.atRisk} SV cần cảnh báo</Badge>
                  : <Badge tone="good">Không có cảnh báo</Badge>}
                <ChevronRight size={18} className="muted" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {creating && (
        <ClassFormModal onClose={() => setCreating(false)} onSaved={(c) => { setCreating(false); nav(`/classes/${c.id}?tab=students`); }} />
      )}
    </>
  );
}
