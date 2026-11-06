import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BarChart3, CalendarDays, Users, FileText, Bell, Pencil, Trash2, MapPin, GraduationCap } from 'lucide-react';
import { api } from '../api.js';
import { PageHead, Loading, ErrorBox, Modal, useLoad, useToast } from '../components/ui.jsx';
import { ClassFormModal } from './TeacherHome.jsx';
import StatsTab from './class/StatsTab.jsx';
import SessionsTab from './class/SessionsTab.jsx';
import StudentsTab from './class/StudentsTab.jsx';
import RequestsTab from './class/RequestsTab.jsx';
import NotificationsTab from './class/NotificationsTab.jsx';

export default function ClassPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'stats';
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Dữ liệu dùng chung cho các tab
  const cls = useLoad(() => api(`/account/classes/${id}`), [id]);
  const stats = useLoad(() => api(`/statistics/classes/${id}/overview`), [id]);
  const sessions = useLoad(() => api(`/sessions/sessions?classId=${id}`), [id]);
  const requests = useLoad(() => api(`/attendance/requests?classId=${id}`), [id]);

  const reloadAll = () => { stats.refresh(); sessions.refresh(); requests.refresh(); cls.refresh(); };

  if (cls.loading) return <Loading />;
  if (cls.error) return <ErrorBox message={cls.error} onRetry={cls.reload} />;
  const c = cls.data;
  const pending = (requests.data || []).filter((r) => r.status === 'pending').length;

  const tabs = [
    { key: 'stats', label: 'Thống kê', icon: BarChart3 },
    { key: 'sessions', label: 'Buổi học', icon: CalendarDays },
    { key: 'students', label: 'Sinh viên', icon: Users },
    { key: 'requests', label: 'Đơn xin vắng', icon: FileText, badge: pending },
    { key: 'notifications', label: 'Email cảnh báo', icon: Bell },
  ];

  async function removeClass() {
    try {
      await api(`/account/classes/${id}`, { method: 'DELETE' });
      toast.success('Đã xoá lớp');
      nav('/');
    } catch (e) { toast.error(e.message); }
  }

  return (
    <>
      <PageHead
        back={<Link to="/" className="back-link"><ArrowLeft size={16} />Tất cả lớp</Link>}
        title={c.name}
        subtitle={
          <span className="row wrap" style={{ gap: 14 }}>
            <span className="class-code">{c.code}</span>
            {c.semester && <span>{c.semester}</span>}
            {c.room && <span className="row" style={{ gap: 5 }}><MapPin size={14} />{c.room}</span>}
            <span className="row" style={{ gap: 5 }}><GraduationCap size={15} />{c.student_count} sinh viên</span>
          </span>
        }
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => setEditing(true)}><Pencil size={16} />Sửa lớp</button>
            <button className="btn btn-danger btn-icon" onClick={() => setDeleting(true)} aria-label="Xoá lớp"><Trash2 size={16} /></button>
          </>
        }
      />

      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={`tab ${tab === t.key ? 'on' : ''}`} onClick={() => setParams(t.key === 'stats' ? {} : { tab: t.key })}>
            <t.icon size={17} />{t.label}{t.badge > 0 && <span className="tab-count">{t.badge}</span>}
          </button>
        ))}
      </div>

      {tab === 'stats' && <StatsTab cls={c} stats={stats} onGoStudents={() => setParams({ tab: 'students' })} />}
      {tab === 'sessions' && <SessionsTab cls={c} sessions={sessions} stats={stats.data} onChanged={reloadAll} />}
      {tab === 'students' && <StudentsTab cls={c} onChanged={reloadAll} />}
      {tab === 'requests' && <RequestsTab requests={requests} onChanged={reloadAll} />}
      {tab === 'notifications' && <NotificationsTab cls={c} stats={stats.data} />}

      {editing && <ClassFormModal initial={c} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reloadAll(); }} />}
      {deleting && (
        <Modal title="Xoá lớp này?" onClose={() => setDeleting(false)} footer={
          <>
            <button className="btn btn-secondary" onClick={() => setDeleting(false)}>Huỷ</button>
            <button className="btn btn-primary" style={{ background: 'var(--critical)' }} onClick={removeClass}>Xoá lớp</button>
          </>
        }>
          <p className="text-2">Lớp <b>{c.code}</b> và danh sách sinh viên sẽ bị xoá. Không thể hoàn tác.</p>
        </Modal>
      )}
    </>
  );
}
