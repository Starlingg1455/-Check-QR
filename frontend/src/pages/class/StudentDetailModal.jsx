import { useMemo } from 'react';
import { Mail, Hash, Clock3 } from 'lucide-react';
import { api } from '../../api.js';
import { Modal, Avatar, LevelBadge, StatusBadge, Badge, Loading, STATUS, useLoad, fmtDate, fmtTime, pct } from '../../components/ui.jsx';
import { RequestThumbs } from '../../components/extras.jsx';

const SOURCE = { qr: 'Quét QR', manual: 'Giảng viên sửa tay', request: 'Theo đơn xin vắng', import: 'Từ file Excel' };
const REQ = { pending: ['warning', 'Đơn chờ duyệt'], approved: ['good', 'Đơn đã duyệt'], rejected: ['critical', 'Đơn bị từ chối'] };

/* Chi tiết một sinh viên: tỉ lệ, số buổi vắng so với giới hạn, từng buổi (giờ + cách điểm danh), đơn xin vắng. */
export default function StudentDetailModal({ student, stats, cls, requests, onClose }) {
  const email = student.email.toLowerCase();
  const code = String(student.student_code);
  const summary = stats?.perStudent.find((s) => String(s.studentCode) === code);

  // Bản ghi điểm danh của lớp (có giờ quét, cách điểm danh, ghi chú); lọc ra của sinh viên này
  const records = useLoad(() => api(`/attendance/classes/${cls.id}/records`), [cls.id]);

  // Trạng thái từng buổi (chỉ các buổi đã đóng), suy ra từ danh sách theo buổi của thống kê
  const rows = useMemo(() => {
    if (!stats) return [];
    const byRecord = new Map((records.data || []).filter((r) => r.studentEmail === email).map((r) => [r.sessionId, r]));
    const myRequests = new Map((requests || []).filter((r) => r.studentEmail?.toLowerCase() === email).map((r) => [r.sessionId, r]));
    return stats.perSession.map((s) => {
      const status = ['present', 'late', 'excused', 'absent'].find((k) => s.lists[k].some((x) => String(x.studentCode) === code)) || 'absent';
      return { ...s, status, record: byRecord.get(s.sessionId) || null, request: myRequests.get(s.sessionId) || null };
    });
  }, [stats, records.data, requests, email, code]);

  const limit = stats?.absentLimit ?? 0;
  const absent = summary?.absent ?? 0;
  const used = Math.min(100, limit ? (absent / limit) * 100 : absent ? 100 : 0);

  return (
    <Modal wide={780} title="Chi tiết sinh viên" onClose={onClose}>
      <div className="stack">
        {/* Thông tin chung */}
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <Avatar name={student.full_name} size="lg" />
          <div className="grow">
            <div className="row wrap" style={{ gap: 10 }}>
              <b style={{ fontSize: 19 }}>{student.full_name}</b>
              {summary && stats.closedSessions > 0 && <LevelBadge level={summary.level} />}
            </div>
            <div className="small text-2 row wrap" style={{ gap: 14, marginTop: 4 }}>
              <span className="row" style={{ gap: 5 }}><Hash size={14} />{student.student_code}</span>
              <span className="row" style={{ gap: 5 }}><Mail size={14} />{student.email}</span>
            </div>
          </div>
        </div>

        {!summary || stats.closedSessions === 0 ? (
          <div className="alert"><span className="small">Lớp chưa có buổi nào đã đóng nên chưa có dữ liệu điểm danh của sinh viên này.</span></div>
        ) : (
          <>
            {/* Số liệu chính */}
            <div className="detail-stats">
              <div><b className="num">{pct(summary.rate)}</b><span>Tỉ lệ đi học</span></div>
              <div><b className="num">{summary.present}</b><span>Có mặt</span></div>
              <div><b className="num">{summary.late}</b><span>Đi muộn</span></div>
              <div><b className="num">{summary.excused}</b><span>Có phép</span></div>
              <div className={summary.absent > limit ? 'bad' : ''}><b className="num">{summary.absent}</b><span>Vắng</span></div>
            </div>

            <div>
              <div className="row between small" style={{ marginBottom: 6 }}>
                <b>Vắng không phép: {summary.absent}/{limit} buổi cho phép</b>
                <span className="muted">Quá {limit} buổi sẽ bị cấm thi</span>
              </div>
              <div className="bar"><span style={{ width: `${used}%`, background: `var(${summary.level === 'banned' ? '--critical' : summary.level === 'danger' ? '--serious' : summary.level === 'warning' ? '--warning' : '--good'})` }} /></div>
            </div>

            {/* Dải màu theo thứ tự các buổi */}
            <div>
              <div className="small bold text-2" style={{ marginBottom: 8 }}>Diễn biến qua {rows.length} buổi</div>
              <div className="strip" role="img" aria-label="Diễn biến điểm danh qua các buổi">
                {rows.map((r) => {
                  const S = STATUS[r.status];
                  return <span key={r.sessionId} title={`Buổi ${r.sessionNo}: ${S.label}`} style={{ background: `var(${S.cssVar})` }}><i>{r.sessionNo}</i></span>;
                })}
              </div>
              <div className="legend" style={{ marginTop: 10 }}>
                {['present', 'late', 'excused', 'absent'].map((k) => <span key={k}><i style={{ background: `var(${STATUS[k].cssVar})` }} />{STATUS[k].label}</span>)}
              </div>
            </div>

            {/* Từng buổi */}
            <div>
              <div className="small bold text-2" style={{ marginBottom: 8 }}>Từng buổi học</div>
              {records.loading ? <Loading /> : (
                <div className="drill-list" style={{ maxHeight: 340 }}>
                  {[...rows].reverse().map((r) => (
                    <div className="drill-row" key={r.sessionId} style={{ alignItems: 'flex-start' }}>
                      <div className="timeline-no">{r.sessionNo}</div>
                      <div className="grow">
                        <div className="bold">{r.title} <span className="small muted" style={{ fontWeight: 400 }}>· {fmtDate(r.date)}</span></div>
                        <div className="small text-2 row wrap" style={{ gap: 12, marginTop: 2 }}>
                          {r.record && (r.status === 'present' || r.status === 'late') && r.record.source === 'qr' && <span className="row" style={{ gap: 4 }}><Clock3 size={13} />Quét lúc {fmtTime(r.record.checkedAt)}</span>}
                          {r.record && <span>{SOURCE[r.record.source] || r.record.source}</span>}
                          {!r.record && r.status === 'absent' && <span className="muted">Không có bản ghi điểm danh</span>}
                        </div>
                        {r.record?.note && r.record.source !== 'request' && <div className="small text-2" style={{ marginTop: 2 }}>Ghi chú: {r.record.note}</div>}
                        {r.request && (
                          <div className="detail-request">
                            <div className="row wrap" style={{ gap: 8 }}>
                              <Badge tone={REQ[r.request.status][0]}>{REQ[r.request.status][1]}</Badge>
                              <span className="small text-2">{r.request.reason}</span>
                            </div>
                            {r.request.teacherNote && <div className="small text-2" style={{ marginTop: 4 }}><b>Giảng viên:</b> {r.request.teacherNote}</div>}
                            <RequestThumbs request={r.request} />
                          </div>
                        )}
                      </div>
                      <StatusBadge status={r.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
