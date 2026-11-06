// Các cửa sổ xem chi tiết: một đơn xin vắng, một sinh viên, một buổi, danh sách theo biểu đồ.

import { CalendarDays, Check, ChevronRight, Clock, Clock3, Eye, Hash, Mail, MousePointerClick, Paperclip, Users, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from './api.js';
import { AnhCoXacThuc, AnhDaiDien, NhanTrangThai, VongXoayNut, HopThoaiXacNhanLuu, HopThoaiXacNhan, TruongNhap, NhanMucCanhBao, XemAnhLon, DangTai, HopThoai, TRANG_THAI, ThanhLuuThayDoi, MenuTrangThai, dinhDangNgay, dinhDangNgayGio, dinhDangDungLuong, dinhDangGio, phanTram, useTaiDuLieu, useThayDoiChuaLuu, useThongBao, useCanhBaoChuaLuu } from './thanh-phan.jsx';
import { BieuDoCotChongTheoBuoi } from './bieu-do.jsx';

// ============ Chi tiết đơn xin vắng (xem và duyệt) ============

export const MAU_TRANG_THAI_DON = { pending: ['warning', 'Chờ duyệt'], approved: ['good', 'Đã duyệt'], rejected: ['critical', 'Từ chối'] };
export const duongDanAnhDon = (r, f) => `/attendance/requests/${r.id}/files/${f.id}`;

/* Màn hình chi tiết một đơn xin vắng: giảng viên xem đủ lý do + ảnh minh chứng rồi mới duyệt/từ chối.
   Dùng chung ở tab "Đơn xin vắng" và trong cửa sổ chi tiết sinh viên. */
export function HopThoaiChiTietDon({ request: r, onClose, onReviewed }) {
  const toast = useThongBao();
  const [note, setNote] = useState(r.teacherNote || '');
  const [busy, setBusy] = useState('');
  const [zoom, setZoom] = useState(null);

  async function review(status) {
    setBusy(status);
    try {
      await api(`/attendance/requests/${r.id}`, { method: 'PUT', body: { status, teacherNote: note.trim() || undefined } });
      toast.success(status === 'approved' ? `Đã duyệt: ${r.studentName} vắng có phép buổi ${r.sessionNo}` : 'Đã từ chối đơn');
      onReviewed();
    } catch (e) { toast.error(e.message); setBusy(''); }
  }

  return (
    <>
      <HopThoai
        wide
        title="Chi tiết đơn xin vắng"
        onClose={onClose}
        footer={r.status === 'pending' ? (
          <>
            <button className="btn btn-secondary" disabled={Boolean(busy)} onClick={() => review('rejected')}>{busy === 'rejected' ? <VongXoayNut /> : <X size={16} />}Từ chối</button>
            <button className="btn btn-primary" disabled={Boolean(busy)} onClick={() => review('approved')}>{busy === 'approved' ? <VongXoayNut /> : <Check size={16} />}Duyệt (vắng có phép)</button>
          </>
        ) : <button className="btn btn-secondary" onClick={onClose}>Đóng</button>}
      >
        <div className="stack">
          <div className="row">
            <AnhDaiDien name={r.studentName} size="lg" />
            <div className="grow">
              <div className="row wrap" style={{ gap: 8 }}><b style={{ fontSize: 17 }}>{r.studentName}</b><NhanTrangThai tone={MAU_TRANG_THAI_DON[r.status][0]}>{MAU_TRANG_THAI_DON[r.status][1]}</NhanTrangThai></div>
              <div className="small muted">MSSV {r.studentCode} · {r.studentEmail}</div>
            </div>
          </div>

          <div className="detail-meta">
            <div><span className="muted small row" style={{ gap: 6 }}><CalendarDays size={14} />Xin vắng</span><b>Buổi {r.sessionNo}</b></div>
            <div><span className="muted small row" style={{ gap: 6 }}><Clock size={14} />Gửi lúc</span><b>{dinhDangNgayGio(r.createdAt)}</b></div>
          </div>

          <div>
            <div className="small bold text-2" style={{ marginBottom: 6 }}>Lý do</div>
            <p className="detail-reason">{r.reason}</p>
          </div>

          <div>
            <div className="small bold text-2" style={{ marginBottom: 8 }}>Ảnh minh chứng ({r.files.length})</div>
            {r.files.length === 0 ? (
              <div className="alert warn small">Sinh viên không đính kèm ảnh minh chứng.</div>
            ) : (
              <div className="detail-gallery">
                {r.files.map((f) => (
                  <button key={f.id} className="detail-photo" onClick={() => setZoom(f)} aria-label={`Phóng to ${f.name}`}>
                    <AnhCoXacThuc path={duongDanAnhDon(r, f)} alt={f.name} />
                    <span>{f.name} · {dinhDangDungLuong(f.size)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {r.status === 'pending' ? (
            <TruongNhap label="Ghi chú cho sinh viên (không bắt buộc)">
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: Đã nhận giấy khám bệnh" maxLength={200} />
            </TruongNhap>
          ) : r.teacherNote && (
            <div className="alert"><span className="small"><b>Ghi chú của giảng viên:</b> {r.teacherNote}</span></div>
          )}
        </div>
      </HopThoai>
      {zoom && <XemAnhLon path={duongDanAnhDon(r, zoom)} title={zoom.name} onClose={() => setZoom(null)} />}
    </>
  );
}

/* Dòng tóm tắt một đơn (1 dòng): nhãn trạng thái, lý do ngắn, số ảnh, nút xem/duyệt. Bấm cả dòng để mở chi tiết. */
export function DongTomTatDon({ request, onOpen }) {
  const [tone, label] = MAU_TRANG_THAI_DON[request.status];
  const pending = request.status === 'pending';
  return (
    <div className="request-chip" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()} aria-label={`${label}: ${request.reason}`}>
      <NhanTrangThai tone={tone}>{label}</NhanTrangThai>
      <span className="request-chip-text">{request.reason}</span>
      {request.files.length > 0 && <NhanTrangThai icon={Paperclip}>{request.files.length}</NhanTrangThai>}
      <span className={`btn btn-sm ${pending ? 'btn-primary' : 'btn-secondary'}`}><Eye size={14} />{pending ? 'Xem & duyệt' : 'Xem'}</span>
    </div>
  );
}

// ============ Chi tiết một sinh viên ============

const NGUON_DIEM_DANH = { request: 'Theo đơn xin vắng' };

/* Chi tiết một sinh viên: tỉ lệ, số buổi vắng so với giới hạn, từng buổi (giờ + cách điểm danh), đơn xin vắng. */
export function HopThoaiChiTietSinhVien({ student, stats, cls, requests, onChanged, onClose }) {
  const toast = useThongBao();
  const email = student.email.toLowerCase();
  const code = String(student.student_code);
  const summary = stats?.perStudent.find((s) => String(s.studentCode) === code);

  // Bản ghi điểm danh của lớp (có giờ quét, cách điểm danh, ghi chú); lọc ra của sinh viên này
  const records = useTaiDuLieu(() => api(`/attendance/classes/${cls.id}/records`), [cls.id]);
  // Đơn xin vắng đang mở để duyệt (luôn lấy bản mới nhất từ danh sách đơn của lớp)
  const [openRequestId, setOpenRequestId] = useState(null);
  const staged = useThayDoiChuaLuu(); // sửa tay chưa lưu: sessionId -> trạng thái mới
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  useCanhBaoChuaLuu(staged.count > 0);
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
    .map((r) => ({ id: r.sessionId, title: `Buổi ${r.sessionNo} · ${r.title}`, sub: dinhDangNgay(r.date), from: r.status, to: staged.map[r.sessionId] }));

  async function luuThayDoi() {
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
  const thuDong = () => (staged.count > 0 ? setDiscarding(true) : onClose());

  const limit = stats?.absentLimit ?? 0;
  const absent = summary?.absent ?? 0;
  const used = Math.min(100, limit ? (absent / limit) * 100 : absent ? 100 : 0);

  return (
    <HopThoai
      wide={780}
      title="Chi tiết sinh viên"
      onClose={thuDong}
      footer={staged.count > 0 ? <ThanhLuuThayDoi inline count={staged.count} onDiscard={staged.clear} onSave={() => setConfirming(true)} /> : undefined}
    >
      <div className="stack">
        {/* Thông tin chung */}
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <AnhDaiDien name={student.full_name} size="lg" />
          <div className="grow">
            <div className="row wrap" style={{ gap: 10 }}>
              <b style={{ fontSize: 19 }}>{student.full_name}</b>
              {summary && stats.closedSessions > 0 && <NhanMucCanhBao level={summary.level} />}
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
              <div><b className="num">{phanTram(summary.rate)}</b><span>Tỉ lệ đi học</span></div>
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
                const S = TRANG_THAI[staged.map[r.sessionId] ?? r.status];
                return <span key={r.sessionId} title={`Buổi ${r.sessionNo}: ${S.label}`} style={{ background: `var(${S.cssVar})` }}><i>{r.sessionNo}</i></span>;
              })}
            </div>

            {/* Từng buổi */}
            <div>
              <div className="small bold text-2" style={{ marginBottom: 8 }}>Từng buổi học <span className="muted" style={{ fontWeight: 400 }}>· bấm vào trạng thái để sửa, rồi Lưu</span></div>
              {records.loading ? <DangTai /> : (
                <div className="drill-list" style={{ maxHeight: 340 }}>
                  {[...rows].reverse().map((r) => (
                    <div className={`drill-row ${staged.map[r.sessionId] !== undefined ? 'staged-row' : ''}`} key={r.sessionId} style={{ alignItems: 'flex-start' }}>
                      <div className="timeline-no">{r.sessionNo}</div>
                      <div className="grow">
                        <div className="bold">{r.title} <span className="small muted" style={{ fontWeight: 400 }}>· {dinhDangNgay(r.date)}</span></div>
                        {r.record?.source === 'qr' && (r.status === 'present' || r.status === 'late') && <div className="small text-2 row" style={{ gap: 4, marginTop: 2 }}><Clock3 size={13} />Quét QR lúc {dinhDangGio(r.record.checkedAt)}</div>}
                        {r.record && r.record.source === 'request' && <div className="small text-2" style={{ marginTop: 2 }}>{NGUON_DIEM_DANH[r.record.source]}</div>}
                        {r.request && <DongTomTatDon request={r.request} onOpen={() => setOpenRequestId(r.request.id)} />}
                      </div>
                      <MenuTrangThai status={staged.map[r.sessionId] ?? r.status} dirty={staged.map[r.sessionId] !== undefined} onChange={(k) => staged.set(r.sessionId, r.status, k)} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      {confirming && <HopThoaiXacNhanLuu items={changeItems} busy={saving} onConfirm={luuThayDoi} onClose={() => setConfirming(false)} />}
      {discarding && (
        <HopThoaiXacNhan
          title="Bỏ thay đổi chưa lưu?"
          message={`Bạn còn ${staged.count} thay đổi chưa lưu cho ${student.full_name}.`}
          confirmText="Bỏ thay đổi và đóng" cancelText="Tiếp tục sửa" danger
          onConfirm={() => { staged.clear(); setDiscarding(false); onClose(); }}
          onClose={() => setDiscarding(false)}
        />
      )}
      {openRequest && (
        <HopThoaiChiTietDon
          request={openRequest}
          onClose={() => setOpenRequestId(null)}
          onReviewed={() => { setOpenRequestId(null); records.refresh(); onChanged?.(); }}
        />
      )}
    </HopThoai>
  );
}

// ============ Chi tiết từ biểu đồ: theo buổi, theo trạng thái, theo số buổi vắng ============

const THU_TU_TRANG_THAI = ['present', 'late', 'excused', 'absent'];

/* Một dòng sinh viên: chỉ tên + MSSV. Bấm vào để xem chi tiết đi học của người đó. */
function DongSinhVien({ name, code, onOpen }) {
  return (
    <button className="drill-row clickable" onClick={() => onOpen(code)} aria-label={`Xem chi tiết ${name}`}>
      <AnhDaiDien name={name} />
      <div className="grow" style={{ textAlign: 'left' }}><div className="bold truncate">{name}</div><div className="xs muted num">{code}</div></div>
      <ChevronRight size={18} className="muted row-chevron" />
    </button>
  );
}

/* Khối chọn buổi + trạng thái + danh sách tên, dùng chung cho các cửa sổ chi tiết. */
function KhoiChonBuoi({ stats, sel, setSel, onOpenStudent }) {
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
            <span className="small muted">{dinhDangNgay(session.date)}</span>
          </label>
        </div>

        <div className="status-tabs" role="tablist" aria-label="Trạng thái">
          {THU_TU_TRANG_THAI.map((k) => {
            const S = TRANG_THAI[k];
            return (
              <button key={k} role="tab" aria-selected={sel.status === k} className={`status-tab ${sel.status === k ? 'on' : ''}`} onClick={() => setSel({ ...sel, status: k })}>
                <S.icon size={16} color={`var(${S.cssVar})`} />{S.label}<b className="num">{session[k]}</b>
              </button>
            );
          })}
        </div>

        {list.length === 0 ? (
          <div className="center muted" style={{ padding: '24px 0' }}>Không có sinh viên nào ở trạng thái "{TRANG_THAI[sel.status].label}" trong buổi này.</div>
        ) : (
          <div className="drill-list">
            {list.map((st) => <DongSinhVien key={st.studentCode} name={st.fullName} code={st.studentCode} onOpen={onOpenStudent} />)}
          </div>
        )}
      </div>
  );
}

/* Chi tiết 0: một buổi học. Bấm vào điểm trên biểu đồ tỉ lệ đi học để mở. */
export function HopThoaiChiTietBuoi({ stats, index, onOpenStudent, onClose }) {
  const [sel, setSel] = useState({ idx: index, status: 'absent' });
  const s = stats.perSession[sel.idx];
  const total = s.present + s.late + s.excused + s.absent;
  return (
    <HopThoai wide={680} title={`Buổi ${s.sessionNo}${s.title !== `Buổi ${s.sessionNo}` ? ` · ${s.title}` : ''}`} onClose={onClose}>
      <div className="stack">
        <div className="comp-hero">
          <b className="num">{s.rate ?? '—'}<small>%</small></b>
          <span>tỉ lệ đi học · {s.present + s.late}/{total} sinh viên có mặt · {dinhDangNgay(s.date)}</span>
        </div>
        <KhoiChonBuoi stats={stats} sel={sel} setSel={setSel} onOpenStudent={onOpenStudent} />
      </div>
    </HopThoai>
  );
}

/* Chi tiết 1: số sinh viên theo trạng thái ở từng buổi. Bấm vào cột/đoạn màu để xem là những ai. */
export function HopThoaiTrangThaiTheoBuoi({ stats, onOpenStudent, onClose }) {
  const sessions = stats.perSession;
  const [sel, setSel] = useState({ idx: sessions.length - 1, status: 'absent' });

  return (
    <HopThoai wide={880} title="Số sinh viên theo trạng thái" onClose={onClose}>
      <div className="stack">
        <p className="small text-2 row" style={{ gap: 8 }}><MousePointerClick size={16} className="muted" />Bấm vào một cột (hoặc đoạn màu) để xem là những sinh viên nào.</p>
        <div className="chart-box"><BieuDoCotChongTheoBuoi perSession={sessions} onSelect={(idx, status) => setSel((s) => ({ idx, status: status || s.status }))} /></div>

        <KhoiChonBuoi stats={stats} sel={sel} setSel={setSel} onOpenStudent={onOpenStudent} />
      </div>
    </HopThoai>
  );
}

/* Chi tiết 2: những sinh viên vắng đúng N buổi, kèm vắng buổi nào. */
export function HopThoaiSinhVienTheoSoBuoiVang({ count, stats, onOpenStudent, onClose }) {
  const students = stats.perStudent.filter((s) => s.absent === count);
  return (
    <HopThoai wide={680} title={`Sinh viên vắng ${count} buổi`} onClose={onClose}>
      <div className="stack">
        <p className="small text-2 row" style={{ gap: 8 }}><Users size={16} className="muted" />{students.length} sinh viên. Bấm vào tên để xem chi tiết từng buổi.</p>
        <div className="drill-list">
          {students.map((st) => <DongSinhVien key={st.email} name={st.fullName} code={st.studentCode} onOpen={onOpenStudent} />)}
        </div>
      </div>
    </HopThoai>
  );
}
