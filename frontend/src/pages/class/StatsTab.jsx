import { useMemo, useState } from 'react';
import { Users, CalendarCheck, Percent, ShieldAlert, Download, Mail, Search, ArrowUpDown, CalendarDays } from 'lucide-react';
import { download, api } from '../../api.js';
import { Card, StatTile, LevelBadge, Loading, ErrorBox, Empty, useToast, LEVEL, pct, BtnSpinner } from '../../components/ui.jsx';
import { SessionStackChart, RateLineChart, StatusDonut, AbsenceHistogram } from '../../components/charts.jsx';

export default function StatsTab({ cls, stats, onGoStudents }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState({ key: 'absent', dir: -1 });
  const [busy, setBusy] = useState('');

  const rows = useMemo(() => {
    if (!stats.data) return [];
    const k = sort.key;
    return stats.data.perStudent
      .filter((s) => `${s.fullName} ${s.studentCode}`.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => ((a[k] ?? -1) > (b[k] ?? -1) ? 1 : (a[k] ?? -1) < (b[k] ?? -1) ? -1 : 0) * sort.dir);
  }, [stats.data, q, sort]);

  if (stats.loading) return <Loading />;
  if (stats.error) return <ErrorBox message={stats.error} onRetry={stats.reload} />;
  const s = stats.data;

  if (s.studentCount === 0) {
    return <div className="card"><Empty icon={Users} title="Lớp chưa có sinh viên" action={<button className="btn btn-primary" onClick={onGoStudents}>Thêm sinh viên</button>}>Import danh sách từ Excel để bắt đầu điểm danh.</Empty></div>;
  }
  if (s.closedSessions === 0) {
    return <div className="card"><Empty icon={CalendarDays} title="Chưa có buổi nào hoàn tất">Mở một buổi điểm danh ở tab "Buổi học", đóng buổi xong thì biểu đồ sẽ xuất hiện ở đây.</Empty></div>;
  }

  const atRisk = s.perStudent.filter((x) => x.level !== 'ok').sort((a, b) => b.absent - a.absent);
  const toggleSort = (key) => setSort((p) => ({ key, dir: p.key === key ? -p.dir : -1 }));

  async function exportExcel() {
    setBusy('xlsx');
    try { await download(`/statistics/classes/${cls.id}/export.xlsx`, `thong-ke-${cls.code}.xlsx`); toast.success('Đã tải file Excel'); }
    catch (e) { toast.error(e.message); } finally { setBusy(''); }
  }
  async function sendWarnings() {
    setBusy('mail');
    try {
      const r = await api('/attendance/warnings/send', { method: 'POST', body: { classId: cls.id } });
      toast.success(r.mailConfigured ? `Đã gửi ${r.count} email cảnh báo` : `Đã ghi nhận ${r.count} cảnh báo (chưa cấu hình SMTP nên chưa gửi email thật)`);
    } catch (e) { toast.error(e.message); } finally { setBusy(''); }
  }

  const Th = ({ k, children, right }) => (
    <th className={right ? 'right' : ''}><button onClick={() => toggleSort(k)} style={{ all: 'unset', cursor: 'pointer', display: 'inline-flex', gap: 4, alignItems: 'center' }}>{children}<ArrowUpDown size={12} /></button></th>
  );

  return (
    <div className="stack-lg">
      <div className="row between wrap">
        <p className="text-2 small">Giới hạn: vắng quá <b>{s.absentLimit}</b> buổi không phép ({s.class.maxAbsentPercent}% của {s.class.totalSessions} buổi) sẽ bị cấm thi.</p>
        <button className="btn btn-secondary" onClick={exportExcel} disabled={busy === 'xlsx'}>{busy === 'xlsx' ? <BtnSpinner /> : <Download size={16} />}Xuất Excel</button>
      </div>

      <div className="tiles">
        <StatTile icon={Users} label="Sĩ số" value={s.studentCount} sub={`${s.closedSessions}/${s.class.totalSessions} buổi đã học`} />
        <StatTile icon={Percent} tone="good" label="Tỉ lệ đi học TB" value={s.avgRate ?? '—'} unit="%" sub="Có mặt + đi trễ" />
        <StatTile icon={ShieldAlert} tone="serious" label="Sắp cấm thi" value={s.levels.warning + s.levels.danger} unit=" SV" sub={`${s.levels.warning} cần chú ý · ${s.levels.danger} sát giới hạn`} />
        <StatTile icon={ShieldAlert} tone="critical" label="Vượt giới hạn vắng" value={s.levels.banned} unit=" SV" sub={`Vắng quá ${s.absentLimit} buổi`} />
      </div>

      <div className="grid-2">
        <Card title="Số sinh viên theo trạng thái" subtitle="Mỗi cột là một buổi học"><div className="chart-box"><SessionStackChart perSession={s.perSession} /></div></Card>
        <Card title="Tỉ lệ đi học theo buổi" subtitle="Có mặt + đi trễ, tính trên sĩ số"><div className="chart-box"><RateLineChart perSession={s.perSession} /></div></Card>
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

      <Card
        title="Sinh viên sắp bị cấm thi"
        subtitle={atRisk.length ? `${atRisk.length} sinh viên cần chú ý` : 'Chưa có ai'}
        actions={atRisk.length > 0 && <button className="btn btn-primary btn-sm" onClick={sendWarnings} disabled={busy === 'mail'}>{busy === 'mail' ? <BtnSpinner /> : <Mail size={15} />}Gửi email cảnh báo</button>}
        pad={false}
      >
        {atRisk.length === 0 ? (
          <Empty icon={ShieldAlert} title="Tuyệt vời!">Hiện chưa có sinh viên nào gần chạm giới hạn vắng.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Sinh viên</th><th>MSSV</th><th className="right">Đã vắng</th><th style={{ width: '32%' }}>Mức độ</th><th>Tình trạng</th></tr></thead>
              <tbody>
                {atRisk.map((x) => (
                  <tr key={x.email}>
                    <td className="bold">{x.fullName}</td>
                    <td className="num text-2">{x.studentCode}</td>
                    <td className="right num bold">{x.absent}/{s.absentLimit}</td>
                    <td><div className={`bar ${x.level === 'banned' ? 'critical' : x.level === 'danger' ? 'warning' : 'good'}`}><span style={{ width: `${Math.min(100, (x.absent / Math.max(1, s.absentLimit)) * 100)}%`, background: `var(${LEVEL[x.level].cssVar})` }} /></div></td>
                    <td><LevelBadge level={x.level} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <section className="card table-card">
        <div className="toolbar">
          <h2 className="grow">Chi tiết từng sinh viên</h2>
          <div className="input-icon" style={{ width: 240 }}>
            <Search size={16} />
            <input className="input" placeholder="Tìm tên hoặc MSSV" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <Th k="fullName">Sinh viên</Th><th className="hide-sm">MSSV</th>
                <Th k="present" right>Có mặt</Th><Th k="late" right>Trễ</Th><Th k="excused" right>Có phép</Th><Th k="absent" right>Vắng</Th>
                <Th k="rate" right>Tỉ lệ</Th><th>Tình trạng</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.email}>
                  <td className="bold">{x.fullName}</td>
                  <td className="num text-2 hide-sm">{x.studentCode}</td>
                  <td className="right num">{x.present}</td><td className="right num">{x.late}</td><td className="right num">{x.excused}</td>
                  <td className="right num bold">{x.absent}</td>
                  <td className="right num">{pct(x.rate)}</td>
                  <td><LevelBadge level={x.level} /></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={8} className="center muted" style={{ padding: 32 }}>Không tìm thấy sinh viên phù hợp</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
