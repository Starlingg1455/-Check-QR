import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BarChart3, CalendarDays, Users, FileText, Bell, Pencil, Download, MapPin } from 'lucide-react';
import { api, download } from '../api.js';
import { PageHead, Loading, ErrorBox, useLoad, useToast, BtnSpinner } from '../components/ui.jsx';
import { ClassFormModal } from './TeacherHome.jsx';
import StatsTab from './class/StatsTab.jsx';
import SessionsTab from './class/SessionsTab.jsx';
import StudentsTab from './class/StudentsTab.jsx';
import AlertsTab from './class/AlertsTab.jsx';
import RequestsTab from './class/RequestsTab.jsx';

export default function ClassPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'overview';
  const [editing, setEditing] = useState(false);
  const [exporting, setExporting] = useState(false);

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
  const atRisk = stats.data ? stats.data.perStudent.filter((s) => s.level !== 'ok').length : 0;

  const tabs = [
    { key: 'overview', label: 'Tổng quan', icon: BarChart3 },
    { key: 'sessions', label: 'Buổi học', icon: CalendarDays },
    { key: 'students', label: 'Sinh viên', icon: Users },
    { key: 'alerts', label: 'Cảnh báo', icon: Bell, badge: atRisk },
    { key: 'requests', label: 'Đơn xin vắng', icon: FileText, badge: pending },
  ];
  const go = (key) => setParams(key === 'overview' ? {} : { tab: key });

  async function exportExcel() {
    setExporting(true);
    try { await download(`/statistics/classes/${c.id}/export.xlsx`, `thong-ke-${c.code}.xlsx`); toast.success('Đã tải file Excel'); }
    catch (e) { toast.error(e.message); } finally { setExporting(false); }
  }

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
          </span>
        }
        actions={
          <>
            <button className="btn btn-secondary" onClick={exportExcel} disabled={exporting}>{exporting ? <BtnSpinner /> : <Download size={16} />}<span className="hide-sm">Xuất Excel</span></button>
            <button className="btn btn-secondary" onClick={() => setEditing(true)}><Pencil size={16} /><span className="hide-sm">Sửa lớp</span></button>
          </>
        }
      />

      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={`tab ${tab === t.key ? 'on' : ''}`} onClick={() => go(t.key)}>
            <t.icon size={17} />{t.label}{t.badge > 0 && <span className="tab-count">{t.badge}</span>}
          </button>
        ))}
      </div>

      {tab === 'overview' && <StatsTab cls={c} requests={requests.data} stats={stats} atRisk={atRisk} pending={pending} onGoAlerts={() => go('alerts')} onGoStudents={() => go('students')} onGoRequests={() => go('requests')} />}
      {tab === 'sessions' && <SessionsTab cls={c} sessions={sessions} stats={stats.data} onChanged={reloadAll} />}
      {tab === 'students' && <StudentsTab cls={c} stats={stats.data} requests={requests.data} onChanged={reloadAll} />}
      {tab === 'alerts' && <AlertsTab cls={c} stats={stats} />}
      {tab === 'requests' && <RequestsTab requests={requests} onChanged={reloadAll} />}

      {editing && (
        <ClassFormModal
          initial={c}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); reloadAll(); }}
          onDelete={removeClass}
        />
      )}
    </>
  );
}
