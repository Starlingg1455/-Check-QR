import { Users, Percent, ShieldAlert, CalendarDays, ChevronRight, Ban, FileText } from 'lucide-react';
import { Card, StatTile, Loading, ErrorBox, Empty, LEVEL, STATUS } from '../../components/ui.jsx';
import { SessionStackChart, RateLineChart, AbsenceHistogram } from '../../components/charts.jsx';

/* Cơ cấu điểm danh: số lớn + thanh tỉ lệ + bảng số liệu, chữ to dễ đọc khi chiếu */
function Composition({ overall, avgRate }) {
  const rows = ['present', 'late', 'excused', 'absent'].map((k) => ({ key: k, count: overall[k], ...STATUS[k] }));
  const total = rows.reduce((a, r) => a + r.count, 0) || 1;
  return (
    <div>
      <div className="comp-hero"><b className="num">{avgRate ?? '—'}<small>%</small></b><span>tỉ lệ đi học (có mặt + đi trễ)</span></div>
      <div className="comp-bar" role="img" aria-label="Cơ cấu điểm danh">
        {rows.map((r) => r.count > 0 && <span key={r.key} style={{ width: `${(r.count / total) * 100}%`, background: `var(${r.cssVar})` }} title={`${r.label}: ${r.count}`} />)}
      </div>
      <div className="comp-rows">
        {rows.map((r) => (
          <div className="comp-row" key={r.key}>
            <span className="comp-label"><i style={{ background: `var(${r.cssVar})` }} /><r.icon size={18} color={`var(${r.cssVar})`} />{r.label}</span>
            <b className="num">{r.count}</b>
            <span className="num muted comp-pct">{Math.round((r.count / total) * 1000) / 10}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Tab Tổng quan: chỉ số chính + biểu đồ. Danh sách chi tiết nằm ở tab Sinh viên và Cảnh báo. */
export default function StatsTab({ stats, atRisk, pending, onGoAlerts, onGoStudents, onGoRequests }) {
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
        <Card title="Tỉ lệ đi học theo buổi" subtitle="Có mặt + đi trễ, tính trên sĩ số"><div className="chart-box"><RateLineChart perSession={s.perSession} /></div></Card>
        <Card title="Số sinh viên theo trạng thái" subtitle="Mỗi cột là một buổi học"><div className="chart-box"><SessionStackChart perSession={s.perSession} /></div></Card>
      </div>
      <div className="grid-2">
        <Card title="Cơ cấu điểm danh" subtitle="Toàn bộ lượt điểm danh của lớp"><Composition overall={s.overall} avgRate={s.avgRate} /></Card>
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
