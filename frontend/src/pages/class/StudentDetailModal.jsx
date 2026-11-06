import { useMemo, useState } from 'react';
import { Mail, Hash, Clock3 } from 'lucide-react';
import { api } from '../../api.js';
import { Modal, Avatar, LevelBadge, Loading, STATUS, useLoad, useToast, fmtDate, fmtTime, pct } from '../../components/ui.jsx';
import { StatusMenu } from '../../components/extras.jsx';
import { useStaged, useUnsavedWarning, SaveBar, ConfirmModal, ConfirmChangesModal } from '../../components/staged.jsx';
import { RequestDetailModal, RequestChip } from './RequestDetailModal.jsx';

const SOURCE = { request: 'Theo đơn xin vắng' };

/* Chi tiết một sinh viên: tỉ lệ, số buổi vắng so với giới hạn, từng buổi (giờ + cách điểm danh), đơn xin vắng. */
export default function StudentDetailModal({ student, stats, cls, requests, onChanged, onClose }) {
  const toast = useToast();
  const email = student.email.toLowerCase();
  const code = String(student.student_code);
  const summary = stats?.perStudent.find((s) => String(s.studentCode) === code);

  // Bản ghi điểm danh của lớp (có giờ quét, cách điểm danh, ghi chú); lọc ra của sinh viên này
  const records = useLoad(() => api(`/attendance/classes/${cls.id}/records`), [cls.id]);
  // Đơn xin vắng đang mở để duyệt (luôn lấy bản mới nhất từ danh sách đơn của lớp)
  const [openRequestId, setOpenRequestId] = useState(null);
  const staged = useStaged(); // sửa tay chưa lưu: sessionId -> trạng thái mới
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  useUnsavedWarning(staged.count > 0);
  const openRequest = openRequestId && (requests || []).find((r) => r.id === openRequestId);

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

  // Danh sách thay đổi chưa lưu, hiển thị trong hộp xác nhận
  const changeItems = rows
    .filter((r) => staged.map[r.sessionId] !== undefined)
    .map((r) => ({ id: r.sessionId, title: `Buổi ${r.sessionNo} · ${r.title}`, sub: fmtDate(r.date), from: r.status, to: staged.map[r.sessionId] }));

  async function saveChanges() {
    setSaving(true);
    try {
      const changes = changeItems.map((c) => ({ sessionId: c.id, email: student.email, status: c.to }));
      const r = await api(`/attendance/classes/${cls.id}/changes`, { method: 'POST', body: { changes } });
      toast.success(`Đã lưu ${r.applied} thay đổi cho ${student.full_name}`);
      staged.clear();
      setConfirming(false);
      records.refresh();
      onChanged?.();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }
  // Đóng cửa sổ: còn thay đổi chưa lưu thì hỏi lại
  const tryClose = () => (staged.count > 0 ? setDiscarding(true) : onClose());

  const limit = stats?.absentLimit ?? 0;
  const absent = summary?.absent ?? 0;
  const used = Math.min(100, limit ? (absent / limit) * 100 : absent ? 100 : 0);

  return (
    <Modal
      wide={780}
      title="Chi tiết sinh viên"
      onClose={tryClose}
      footer={staged.count > 0 ? <SaveBar inline count={staged.count} onDiscard={staged.clear} onSave={() => setConfirming(true)} /> : undefined}
    >
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
            <div className="detail-stats four">
              <div><b className="num">{pct(summary.rate)}</b><span>Tỉ lệ đi học</span></div>
              <div><b className="num">{summary.present}</b><span>Có mặt</span></div>
              <div><b className="num">{summary.late}</b><span>Đi muộn</span></div>
              <div><b className="num">{summary.excused}</b><span>Có phép</span></div>
            </div>

            <div>
              <div className="small" style={{ marginBottom: 6 }}><b>Vắng không phép {summary.absent}/{limit} buổi</b> <span className="muted">(quá {limit} buổi bị cấm thi)</span></div>
              <div className="bar"><span style={{ width: `${used}%`, background: `var(${summary.level === 'banned' ? '--critical' : summary.level === 'danger' ? '--serious' : summary.level === 'warning' ? '--warning' : '--good'})` }} /></div>
            </div>

            {/* Dải màu theo thứ tự các buổi (rê chuột để xem tên trạng thái) */}
            <div className="strip" role="img" aria-label={`Diễn biến điểm danh qua ${rows.length} buổi`}>
              {rows.map((r) => {
                const S = STATUS[staged.map[r.sessionId] ?? r.status];
                return <span key={r.sessionId} title={`Buổi ${r.sessionNo}: ${S.label}`} style={{ background: `var(${S.cssVar})` }}><i>{r.sessionNo}</i></span>;
              })}
            </div>

            {/* Từng buổi */}
            <div>
              <div className="small bold text-2" style={{ marginBottom: 8 }}>Từng buổi học <span className="muted" style={{ fontWeight: 400 }}>· bấm vào trạng thái để sửa, rồi Lưu</span></div>
              {records.loading ? <Loading /> : (
                <div className="drill-list" style={{ maxHeight: 340 }}>
                  {[...rows].reverse().map((r) => (
                    <div className={`drill-row ${staged.map[r.sessionId] !== undefined ? 'staged-row' : ''}`} key={r.sessionId} style={{ alignItems: 'flex-start' }}>
                      <div className="timeline-no">{r.sessionNo}</div>
                      <div className="grow">
                        <div className="bold">{r.title} <span className="small muted" style={{ fontWeight: 400 }}>· {fmtDate(r.date)}</span></div>
                        {r.record?.source === 'qr' && (r.status === 'present' || r.status === 'late') && <div className="small text-2 row" style={{ gap: 4, marginTop: 2 }}><Clock3 size={13} />Quét QR lúc {fmtTime(r.record.checkedAt)}</div>}
                        {r.record && r.record.source === 'request' && <div className="small text-2" style={{ marginTop: 2 }}>{SOURCE[r.record.source]}</div>}
                        {r.request && <RequestChip request={r.request} onOpen={() => setOpenRequestId(r.request.id)} />}
                      </div>
                      <StatusMenu status={staged.map[r.sessionId] ?? r.status} dirty={staged.map[r.sessionId] !== undefined} onChange={(k) => staged.set(r.sessionId, r.status, k)} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      {confirming && <ConfirmChangesModal items={changeItems} busy={saving} onConfirm={saveChanges} onClose={() => setConfirming(false)} />}
      {discarding && (
        <ConfirmModal
          title="Bỏ thay đổi chưa lưu?"
          message={`Bạn còn ${staged.count} thay đổi chưa lưu cho ${student.full_name}.`}
          confirmText="Bỏ thay đổi và đóng" cancelText="Tiếp tục sửa" danger
          onConfirm={() => { staged.clear(); setDiscarding(false); onClose(); }}
          onClose={() => setDiscarding(false)}
        />
      )}
      {openRequest && (
        <RequestDetailModal
          request={openRequest}
          onClose={() => setOpenRequestId(null)}
          onReviewed={() => { setOpenRequestId(null); records.refresh(); onChanged?.(); }}
        />
      )}
    </Modal>
  );
}
