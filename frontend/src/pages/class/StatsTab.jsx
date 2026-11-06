import { Users, Percent, ShieldAlert, CalendarDays, ChevronRight, Ban } from 'lucide-react';
import { Card, StatTile, Loading, ErrorBox, Empty, LEVEL } from '../../components/ui.jsx';
import { SessionStackChart, RateLineChart, StatusDonut, AbsenceHistogram } from '../../components/charts.jsx';

/* Tab Tổng quan: chỉ số chính + biểu đồ. Danh sách chi tiết nằm ở tab Sinh viên và Cảnh báo. */
export default function StatsTab({ stats, atRisk, onGoAlerts, onGoStudents }) {
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
        <Card title="Tỉ lệ đi học theo buổi" subtitle="Có mặt + đi trễ, tính trên sĩ số"><div className="chart-box"><RateLineChart perSession={s.perSession} /></div></Card>
        <Card title="Số sinh viên theo trạng thái" subtitle="Mỗi cột là một buổi học"><div className="chart-box"><SessionStackChart perSession={s.perSession} /></div></Card>
      </div>
      <div className="grid-2">
        <Card title="Cơ cấu điểm danh" subtitle="Toàn bộ lượt điểm danh của lớp"><div className="chart-box sm"><StatusDonut overall={s.overall} avgRate={s.avgRate} /></div></Card>
        <Card title="Phân bố số buổi vắng" subtitle="Mỗi cột: số sinh viên vắng đúng chừng đó buổi">
          <div className="chart-box sm"><AbsenceHistogram perStudent={s.perStudent} absentLimit={s.absentLimit} /></div>
          <div className="legend" style={{ marginTop: 12 }}>
            {['ok', 'warning', 'danger', 'banned'].map((l) => <span key={l}><i style={{ background: `var(${LEVEL[l].cssVar})` }} />{LEVEL[l].label}</span>)}
          </div>
        </Card>
      </div>
    </div>
  );
}
