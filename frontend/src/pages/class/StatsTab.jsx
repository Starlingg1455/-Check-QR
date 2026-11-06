import { useState } from 'react';
import { Users, ShieldAlert, FileText, CalendarDays, ChevronRight } from 'lucide-react';
import { Card, Loading, ErrorBox, Empty } from '../../components/ui.jsx';
import { RateLineChart, StatusDonut } from '../../components/charts.jsx';
import { AttendanceDetailModal, SessionDetailModal } from './DrillModals.jsx';
import StudentDetailModal from './StudentDetailModal.jsx';

/* Ô số bấm được: vừa là chỉ số vừa là lối tắt tới nơi xử lý (thay cho các banner cảnh báo riêng). */
function ActionTile({ icon: Icon, tone = '', label, value, unit, sub, onClick }) {
  return (
    <button className="card tile action" onClick={onClick}>
      <div className="tile-label">
        <span className={`tile-icon ${tone}`}><Icon size={16} /></span>
        {label}
        <ChevronRight size={16} className="tile-go muted" />
      </div>
      <div className="tile-value num">{value}{unit && <small>{unit}</small>}</div>
      <div className="tile-sub">{sub}</div>
    </button>
  );
}

/* Tab Tổng quan: gọn trong một màn hình. 3 ô số bấm được + 2 biểu đồ bấm được.
   Chi tiết nằm ở các tab/cửa sổ khác: danh sách sinh viên, cảnh báo (kèm phân bố số buổi vắng), đơn xin vắng. */
export default function StatsTab({ cls, requests, onChanged, stats, atRisk, pending, onGoAlerts, onGoStudents, onGoRequests }) {
  const [detail, setDetail] = useState(null); // null | { type: 'attendance' } | { type: 'session', index }
  const [studentCode, setStudentCode] = useState(null); // sinh viên đang xem chi tiết (mở chồng lên danh sách)

  if (stats.loading) return <Loading />;
  if (stats.error) return <ErrorBox message={stats.error} onRetry={stats.reload} />;
  const s = stats.data;

  if (s.studentCount === 0) {
    return <div className="card"><Empty icon={Users} title="Lớp chưa có sinh viên" action={<button className="btn btn-primary" onClick={onGoStudents}>Thêm sinh viên</button>}>Thêm sinh viên vào lớp để bắt đầu điểm danh.</Empty></div>;
  }
  if (s.closedSessions === 0) {
    return <div className="card"><Empty icon={CalendarDays} title="Chưa có buổi nào hoàn tất">Mở một buổi điểm danh ở tab "Buổi học", đóng buổi xong thì biểu đồ sẽ xuất hiện ở đây.</Empty></div>;
  }

  const riskTone = s.levels.banned > 0 ? 'critical' : atRisk > 0 ? 'serious' : 'good';

  return (
    <div className="stack-lg">
      <div className="tiles three">
        <ActionTile icon={Users} label="Sĩ số" value={s.studentCount} unit=" SV" sub={`${s.closedSessions}/${s.class.totalSessions} buổi đã học`} onClick={onGoStudents} />
        <ActionTile icon={FileText} tone={pending > 0 ? 'serious' : ''} label="Đơn xin vắng" value={pending} unit=" chờ" sub={pending > 0 ? 'Bấm để xem và duyệt' : 'Không có đơn chờ duyệt'} onClick={onGoRequests} />
        <ActionTile
          icon={ShieldAlert} tone={riskTone} label="Nguy cơ cấm thi" value={atRisk} unit=" SV"
          sub={atRisk > 0 ? `${s.levels.banned} vượt · ${s.levels.danger} sát giới hạn · ${s.levels.warning} cần chú ý` : 'Chưa ai gần giới hạn vắng'}
          onClick={onGoAlerts}
        />
      </div>

      <div className="grid-2">
        <Card title="Tỉ lệ đi học theo buổi" subtitle="Có mặt + đi trễ, tính trên sĩ số">
          <div className="chart-box tall"><RateLineChart perSession={s.perSession} onSelect={(index) => setDetail({ type: 'session', index })} /></div>
        </Card>
        <div
          className="card card-hover donut-card"
          role="button" tabIndex={0}
          onClick={() => setDetail({ type: 'attendance' })}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setDetail({ type: 'attendance' })}
          aria-label="Cơ cấu điểm danh. Bấm để xem chi tiết"
        >
          <div className="card-head">
            <div><h2>Cơ cấu điểm danh</h2><p>Tỉ lệ đi học của cả lớp</p></div>
            <span className="drill-link">Chi tiết<ChevronRight size={16} /></span>
          </div>
          <div className="card-body"><div className="chart-box tall"><StatusDonut overall={s.overall} avgRate={s.avgRate} /></div></div>
        </div>
      </div>

      {detail?.type === 'session' && <SessionDetailModal stats={s} index={detail.index} onOpenStudent={setStudentCode} onClose={() => setDetail(null)} />}
      {detail?.type === 'attendance' && <AttendanceDetailModal stats={s} onOpenStudent={setStudentCode} onClose={() => setDetail(null)} />}
      {studentCode && (() => {
        const p = s.perStudent.find((x) => String(x.studentCode) === String(studentCode));
        return p ? <StudentDetailModal student={{ student_code: p.studentCode, full_name: p.fullName, email: p.email }} stats={s} cls={cls} requests={requests} onChanged={onChanged} onClose={() => setStudentCode(null)} /> : null;
      })()}
    </div>
  );
}
