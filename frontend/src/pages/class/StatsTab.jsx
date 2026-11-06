import { useState } from 'react';
import { Users, Percent, ShieldAlert, CalendarDays, ChevronRight, Ban, FileText } from 'lucide-react';
import { Card, StatTile, Loading, ErrorBox, Empty, LEVEL } from '../../components/ui.jsx';
import { RateLineChart, StatusDonut, AbsenceHistogram } from '../../components/charts.jsx';
import { AttendanceDetailModal, AbsenceDetailModal } from './DrillModals.jsx';
import StudentDetailModal from './StudentDetailModal.jsx';

/* Tab Tổng quan: chỉ số chính + biểu đồ. Danh sách chi tiết nằm ở tab Sinh viên và Cảnh báo. */
export default function StatsTab({ cls, requests, stats, atRisk, pending, onGoAlerts, onGoStudents, onGoRequests }) {
  const [detail, setDetail] = useState(null); // null | { type: 'attendance' } | { type: 'absence', count }
  const [studentCode, setStudentCode] = useState(null); // sinh viên đang xem chi tiết (mở chồng lên danh sách)
  if (stats.loading) return <Loading />;
  if (stats.error) return <ErrorBox message={stats.error} onRetry={stats.reload} />;
  const s = stats.data;

  if (s.studentCount === 0) {
    return <div className="card"><Empty icon={Users} title="Lớp chưa có sinh viên" action={<button className="btn btn-primary" onClick={onGoStudents}>Thêm sinh viên</button>}>Import danh sách từ Excel để bắt đầu điểm danh.</Empty></div>;
  }
  if (s.closedSessions === 0) {
    return <div className="card"><Empty icon={CalendarDays} title="Chưa có buổi nào hoàn tất">Mở một buổi điểm danh ở tab "Buổi học", đóng buổi xong thì biểu đồ sẽ xuất hiện ở đây.</Empty></div>;
  }

  return (
    <div className="stack-lg">
      {pending > 0 && (
        <button className="card card-pad card-hover" onClick={onGoRequests} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', background: 'color-mix(in srgb, var(--warning) 14%, var(--surface))' }}>
          <span className="tile-icon" style={{ background: 'color-mix(in srgb, var(--warning) 25%, transparent)', color: 'var(--warning-ink)' }}><FileText size={18} /></span>
          <div className="grow"><b>{pending} đơn xin vắng đang chờ duyệt</b><div className="small text-2">Bấm để xem lý do và ảnh minh chứng của sinh viên.</div></div>
          <span className="row small bold" style={{ color: 'var(--accent-ink)', gap: 2 }}>Xem đơn<ChevronRight size={16} /></span>
        </button>
      )}
      {atRisk > 0 && (
        <button className="card card-pad row card-hover" onClick={onGoAlerts} style={{ display: 'flex', alignItems: 'center', width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', background: 'color-mix(in srgb, var(--serious) 10%, var(--surface))' }}>
          <span className="tile-icon serious"><ShieldAlert size={18} /></span>
          <div className="grow">
            <b>{atRisk} sinh viên cần chú ý về số buổi vắng</b>
            <div className="small text-2">{s.levels.banned} đã vượt giới hạn · {s.levels.danger} sắp cấm thi · {s.levels.warning} cần chú ý</div>
          </div>
          <span className="row small bold" style={{ color: 'var(--accent-ink)', gap: 2 }}>Xem danh sách<ChevronRight size={16} /></span>
        </button>
      )}

      <div className="tiles">
        <StatTile icon={Users} label="Sĩ số" value={s.studentCount} sub={`${s.closedSessions}/${s.class.totalSessions} buổi đã học`} />
        <StatTile icon={Percent} tone="good" label="Tỉ lệ đi học TB" value={s.avgRate ?? '—'} unit="%" sub="Có mặt + đi trễ" />
        <StatTile icon={ShieldAlert} tone="serious" label="Sắp cấm thi" value={s.levels.warning + s.levels.danger} unit=" SV" sub="Cần chú ý hoặc sát giới hạn" />
        <StatTile icon={Ban} tone="critical" label="Vượt giới hạn vắng" value={s.levels.banned} unit=" SV" sub={`Vắng quá ${s.absentLimit} buổi không phép`} />
      </div>

      <div className="grid-2">
        <Card title="Tỉ lệ đi học theo buổi" subtitle="Có mặt + đi trễ, tính trên sĩ số"><div className="chart-box tall"><RateLineChart perSession={s.perSession} /></div></Card>
        <div
          className="card card-hover donut-card"
          role="button" tabIndex={0}
          onClick={() => setDetail({ type: 'attendance' })}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setDetail({ type: 'attendance' })}
          aria-label="Cơ cấu điểm danh. Bấm để xem chi tiết"
        >
          <div className="card-head"><div><h2>Cơ cấu điểm danh</h2><p>Tỉ lệ đi học của cả lớp</p></div></div>
          <div className="card-body"><div className="chart-box"><StatusDonut overall={s.overall} avgRate={s.avgRate} /></div></div>
          <div className="drill-hint">Bấm để xem chi tiết<ChevronRight size={16} /></div>
        </div>
      </div>
      <Card
        title="Phân bố số buổi vắng"
        subtitle="Bấm vào một cột để xem những sinh viên nào"
      >
        <div className="chart-box sm"><AbsenceHistogram perStudent={s.perStudent} absentLimit={s.absentLimit} onSelect={(count) => setDetail({ type: 'absence', count })} /></div>
        <div className="legend" style={{ marginTop: 12 }}>
          {['ok', 'warning', 'danger', 'banned'].map((l) => <span key={l}><i style={{ background: `var(${LEVEL[l].cssVar})` }} />{LEVEL[l].label}</span>)}
        </div>
      </Card>

      {detail?.type === 'attendance' && <AttendanceDetailModal stats={s} onOpenStudent={setStudentCode} onClose={() => setDetail(null)} />}
      {detail?.type === 'absence' && <AbsenceDetailModal count={detail.count} stats={s} onOpenStudent={setStudentCode} onClose={() => setDetail(null)} />}
      {studentCode && (() => {
        const p = s.perStudent.find((x) => String(x.studentCode) === String(studentCode));
        return p ? <StudentDetailModal student={{ student_code: p.studentCode, full_name: p.fullName, email: p.email }} stats={s} cls={cls} requests={requests} onClose={() => setStudentCode(null)} /> : null;
      })()}
    </div>
  );
}
