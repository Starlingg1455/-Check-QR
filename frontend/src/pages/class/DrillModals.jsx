import { useState } from 'react';
import { MousePointerClick, Users, ChevronRight } from 'lucide-react';
import { Modal, Avatar, STATUS, fmtDate } from '../../components/ui.jsx';
import { SessionStackChart } from '../../components/charts.jsx';

const ORDER = ['present', 'late', 'excused', 'absent'];

/* Một dòng sinh viên: chỉ tên + MSSV. Bấm vào để xem chi tiết đi học của người đó. */
function StudentRow({ name, code, onOpen }) {
  return (
    <button className="drill-row clickable" onClick={() => onOpen(code)} aria-label={`Xem chi tiết ${name}`}>
      <Avatar name={name} />
      <div className="grow" style={{ textAlign: 'left' }}><div className="bold truncate">{name}</div><div className="xs muted num">{code}</div></div>
      <ChevronRight size={18} className="muted row-chevron" />
    </button>
  );
}

/* Khối chọn buổi + trạng thái + danh sách tên, dùng chung cho các cửa sổ chi tiết. */
function SessionPanel({ stats, sel, setSel, onOpenStudent }) {
  const sessions = stats.perSession;
  const session = sessions[sel.idx];
  const list = session.lists[sel.status];
  return (
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
            {list.map((st) => <StudentRow key={st.studentCode} name={st.fullName} code={st.studentCode} onOpen={onOpenStudent} />)}
          </div>
        )}
      </div>
  );
}

/* Chi tiết 0: một buổi học. Bấm vào điểm trên biểu đồ tỉ lệ đi học để mở. */
export function SessionDetailModal({ stats, index, onOpenStudent, onClose }) {
  const [sel, setSel] = useState({ idx: index, status: 'absent' });
  const s = stats.perSession[sel.idx];
  const total = s.present + s.late + s.excused + s.absent;
  return (
    <Modal wide={680} title={`Buổi ${s.sessionNo}${s.title !== `Buổi ${s.sessionNo}` ? ` · ${s.title}` : ''}`} onClose={onClose}>
      <div className="stack">
        <div className="comp-hero">
          <b className="num">{s.rate ?? '—'}<small>%</small></b>
          <span>tỉ lệ đi học · {s.present + s.late}/{total} sinh viên có mặt · {fmtDate(s.date)}</span>
        </div>
        <SessionPanel stats={stats} sel={sel} setSel={setSel} onOpenStudent={onOpenStudent} />
      </div>
    </Modal>
  );
}

/* Chi tiết 1: số sinh viên theo trạng thái ở từng buổi. Bấm vào cột/đoạn màu để xem là những ai. */
export function AttendanceDetailModal({ stats, onOpenStudent, onClose }) {
  const sessions = stats.perSession;
  const [sel, setSel] = useState({ idx: sessions.length - 1, status: 'absent' });

  return (
    <Modal wide={880} title="Số sinh viên theo trạng thái" onClose={onClose}>
      <div className="stack">
        <p className="small text-2 row" style={{ gap: 8 }}><MousePointerClick size={16} className="muted" />Bấm vào một cột (hoặc đoạn màu) để xem là những sinh viên nào.</p>
        <div className="chart-box"><SessionStackChart perSession={sessions} onSelect={(idx, status) => setSel((s) => ({ idx, status: status || s.status }))} /></div>

        <SessionPanel stats={stats} sel={sel} setSel={setSel} onOpenStudent={onOpenStudent} />
      </div>
    </Modal>
  );
}

/* Chi tiết 2: những sinh viên vắng đúng N buổi, kèm vắng buổi nào. */
export function AbsenceDetailModal({ count, stats, onOpenStudent, onClose }) {
  const students = stats.perStudent.filter((s) => s.absent === count);
  return (
    <Modal wide={680} title={`Sinh viên vắng ${count} buổi`} onClose={onClose}>
      <div className="stack">
        <p className="small text-2 row" style={{ gap: 8 }}><Users size={16} className="muted" />{students.length} sinh viên. Bấm vào tên để xem chi tiết từng buổi.</p>
        <div className="drill-list">
          {students.map((st) => <StudentRow key={st.email} name={st.fullName} code={st.studentCode} onOpen={onOpenStudent} />)}
        </div>
      </div>
    </Modal>
  );
}
