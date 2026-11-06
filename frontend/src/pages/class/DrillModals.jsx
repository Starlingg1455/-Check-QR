import { useMemo, useState } from 'react';
import { MousePointerClick, Users } from 'lucide-react';
import { Modal, Avatar, LevelBadge, STATUS, fmtDate } from '../../components/ui.jsx';
import { SessionStackChart } from '../../components/charts.jsx';

const ORDER = ['present', 'late', 'excused', 'absent'];

/* Chi tiết 1: số sinh viên theo trạng thái ở từng buổi. Bấm vào cột/đoạn màu để xem là những ai. */
export function AttendanceDetailModal({ stats, onClose }) {
  const sessions = stats.perSession;
  const [sel, setSel] = useState({ idx: sessions.length - 1, status: 'absent' });
  const session = sessions[sel.idx];
  const byCode = useMemo(() => new Map(stats.perStudent.map((s) => [String(s.studentCode), s])), [stats.perStudent]);
  const list = session.lists[sel.status];

  // Thông tin phụ cho từng dòng, tuỳ trạng thái đang xem
  const extra = (student) => {
    const p = byCode.get(String(student.studentCode));
    if (!p) return null;
    if (sel.status === 'absent') return <span className="small text-2 num">Đã vắng <b>{p.absent}</b>/{stats.absentLimit} buổi</span>;
    if (sel.status === 'late') return <span className="small text-2 num">Đi muộn <b>{p.late}</b> lần</span>;
    if (sel.status === 'excused') return <span className="small text-2 num">Có phép <b>{p.excused}</b> buổi</span>;
    return null;
  };

  return (
    <Modal wide={880} title="Số sinh viên theo trạng thái" onClose={onClose}>
      <div className="stack">
        <p className="small text-2 row" style={{ gap: 8 }}><MousePointerClick size={16} className="muted" />Bấm vào một cột (hoặc đoạn màu) để xem là những sinh viên nào.</p>
        <div className="chart-box"><SessionStackChart perSession={sessions} onSelect={(idx, status) => setSel((s) => ({ idx, status: status || s.status }))} /></div>

        <div className="drill-panel">
          <div className="row between wrap" style={{ gap: 10 }}>
            <label className="row" style={{ gap: 8 }}>
              <b>Buổi</b>
              <select className="select" style={{ width: 'auto', height: 36 }} value={sel.idx} onChange={(e) => setSel({ ...sel, idx: Number(e.target.value) })}>
                {sessions.map((s, i) => <option key={s.sessionId} value={i}>Buổi {s.sessionNo}{s.title !== `Buổi ${s.sessionNo}` ? ` · ${s.title}` : ''}</option>)}
              </select>
              <span className="small muted">{fmtDate(session.date)}</span>
            </label>
          </div>

          <div className="status-tabs" role="tablist" aria-label="Trạng thái">
            {ORDER.map((k) => {
              const S = STATUS[k];
              return (
                <button key={k} role="tab" aria-selected={sel.status === k} className={`status-tab ${sel.status === k ? 'on' : ''}`} onClick={() => setSel({ ...sel, status: k })}>
                  <S.icon size={16} color={`var(${S.cssVar})`} />{S.label}<b className="num">{session[k]}</b>
                </button>
              );
            })}
          </div>

          {list.length === 0 ? (
            <div className="center muted" style={{ padding: '24px 0' }}>Không có sinh viên nào ở trạng thái "{STATUS[sel.status].label}" trong buổi này.</div>
          ) : (
            <div className="drill-list">
              {list.map((st) => (
                <div className="drill-row" key={st.studentCode}>
                  <Avatar name={st.fullName} />
                  <div className="grow"><div className="bold truncate">{st.fullName}</div><div className="xs muted num">{st.studentCode}</div></div>
                  {extra(st)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* Chi tiết 2: những sinh viên vắng đúng N buổi, kèm vắng buổi nào. */
export function AbsenceDetailModal({ count, stats, onClose }) {
  const students = stats.perStudent.filter((s) => s.absent === count);
  // Buổi nào sinh viên này vắng (không phép)
  const absentSessions = (code) => stats.perSession.filter((s) => s.lists.absent.some((x) => String(x.studentCode) === String(code))).map((s) => s.sessionNo);

  return (
    <Modal wide={680} title={`Sinh viên vắng ${count} buổi`} onClose={onClose}>
      <div className="stack">
        <p className="small text-2 row" style={{ gap: 8 }}><Users size={16} className="muted" />{students.length} sinh viên · giới hạn cho phép là {stats.absentLimit} buổi (vắng không phép).</p>
        <div className="drill-list">
          {students.map((st) => (
            <div className="drill-row" key={st.email}>
              <Avatar name={st.fullName} />
              <div className="grow">
                <div className="bold truncate">{st.fullName} <span className="xs muted num">{st.studentCode}</span></div>
                <div className="small text-2">{count > 0 ? `Vắng buổi: ${absentSessions(st.studentCode).join(', ')}` : 'Không vắng buổi nào'}</div>
              </div>
              <LevelBadge level={st.level} />
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
