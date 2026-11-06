// Các trang của giảng viên: danh sách lớp và trang một lớp với 5 tab.

import {
  ArrowLeft,
  ArrowUpDown,
  BarChart3,
  Bell,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  Download,
  Eye,
  FileText,
  MailCheck,
  MapPin,
  Paperclip,
  PartyPopper,
  Pencil,
  Percent,
  Play,
  Plus,
  QrCode,
  Radio,
  Search,
  Send,
  ShieldAlert,
  Trash2,
  UserPlus,
  Users,
} from './bieuTuong.jsx';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, download } from './api.js';
import { useXacThuc } from './nguCanh.jsx';
import {
  AnhCoXacThuc,
  AnhDaiDien,
  NhanTrangThai,
  VongXoayNut,
  The,
  TrangRong,
  KhungLoi,
  TruongNhap,
  NhanMucCanhBao,
  DangTai,
  HopThoai,
  DauTrang,
  VongTiLe,
  OSoLieu,
  dinhDangNgayGio,
  phanTram,
  useTaiDuLieu,
  useThongBao,
} from './thanhPhan.jsx';
import { BieuDoPhanBoBuoiVang, BieuDoTiLeDiHoc, BieuDoTron } from './bieuDo.jsx';
import {
  HopThoaiSinhVienTheoSoBuoiVang,
  HopThoaiTrangThaiTheoBuoi,
  MAU_TRANG_THAI_DON,
  HopThoaiChiTietDon,
  HopThoaiChiTietBuoi,
  HopThoaiChiTietSinhVien,
  duongDanAnhDon,
} from './chiTiet.jsx';

// ============ Trang chủ giảng viên + hộp thoại tạo/sửa lớp ============

export function HopThoaiLop({ initial, onClose, onSaved, onDelete }) {
  const toast = useThongBao();
  const [bieuMau, datBieuMau] = useState({
    code: initial?.code || '',
    name: initial?.name || '',
    room: initial?.room || '',
    semester: initial?.semester || '',
    totalSessions: initial?.total_sessions || 15,
    maxAbsentPercent: initial?.max_absent_percent ?? 20,
  });
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const doiTruong = (truong) => (suKien) => datBieuMau({ ...bieuMau, [truong]: suKien.target.value });
  const limit = Math.floor((Number(bieuMau.totalSessions) * Number(bieuMau.maxAbsentPercent)) / 100);

  async function submit(suKien) {
    suKien.preventDefault();
    setBusy(true);
    try {
      const body = {
        ...bieuMau,
        totalSessions: Number(bieuMau.totalSessions),
        maxAbsentPercent: Number(bieuMau.maxAbsentPercent),
      };
      const saved = initial
        ? await api(`/account/classes/${initial.id}`, { method: 'PUT', body })
        : await api('/account/classes', { method: 'POST', body });
      toast.success(initial ? 'Đã cập nhật lớp' : 'Đã tạo lớp mới');
      onSaved(saved);
    } catch (loi) {
      toast.error(loi.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <HopThoai title={initial ? 'Sửa thông tin lớp' : 'Tạo lớp mới'} onClose={onClose}>
      <form className="stack" onSubmit={submit} id="class-form">
        <div className="form-grid">
          <TruongNhap label="Mã lớp">
            <input
              className="input"
              required
              value={bieuMau.code}
              onChange={doiTruong('code')}
              placeholder="INT3505"
              autoFocus
            />
          </TruongNhap>
          <TruongNhap label="Học kỳ">
            <input
              className="input"
              value={bieuMau.semester}
              onChange={doiTruong('semester')}
              placeholder="HK1 2025-2026"
            />
          </TruongNhap>
          <div className="full">
            <TruongNhap label="Tên môn học">
              <input
                className="input"
                required
                value={bieuMau.name}
                onChange={doiTruong('name')}
                placeholder="Phát triển phần mềm hướng dịch vụ"
              />
            </TruongNhap>
          </div>
          <TruongNhap label="Phòng học">
            <input
              className="input"
              value={bieuMau.room}
              onChange={doiTruong('room')}
              placeholder="B3-201"
            />
          </TruongNhap>
          <TruongNhap label="Tổng số buổi">
            <input
              className="input"
              type="number"
              min="1"
              max="100"
              required
              value={bieuMau.totalSessions}
              onChange={doiTruong('totalSessions')}
            />
          </TruongNhap>
          <div className="full">
            <TruongNhap
              label="Tỉ lệ vắng tối đa cho phép (%)"
              hint={`Vắng quá ${limit} buổi (không phép) sẽ bị cấm thi. Đi trễ tính là có mặt, vắng có phép không bị tính.`}
            >
              <input
                className="input"
                type="number"
                min="0"
                max="100"
                required
                value={bieuMau.maxAbsentPercent}
                onChange={doiTruong('maxAbsentPercent')}
              />
            </TruongNhap>
          </div>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 6 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Huỷ
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {initial ? 'Lưu thay đổi' : 'Tạo lớp'}
          </button>
        </div>
      </form>
      {onDelete && (
        <div className="danger-zone">
          <div className="small">
            <b>Xoá lớp này</b>
            <div className="muted">Xoá cả danh sách sinh viên. Không thể hoàn tác.</div>
          </div>
          {confirmDelete ? (
            <button
              className="btn btn-primary btn-sm"
              style={{ background: 'var(--critical)' }}
              onClick={onDelete}
            >
              Chắc chắn xoá
            </button>
          ) : (
            <button
              className="btn btn-danger btn-sm"
              onClick={() => setConfirmDelete(true)}
            >
              Xoá lớp
            </button>
          )}
        </div>
      )}
    </HopThoai>
  );
}

export function TrangChuGiangVien() {
  const { user } = useXacThuc();
  const chuyenTrang = useNavigate();
  const stats = useTaiDuLieu(() => api('/statistics/overview'), []);
  const [creating, setCreating] = useState(false);
  const hour = new Date().getHours();
  const hello =
    hour < 11 ? 'Chào buổi sáng' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';

  if (stats.loading) return <DangTai />;
  if (stats.error) return <KhungLoi message={stats.error} onRetry={stats.reload} />;
  const thongKe = stats.data;

  return (
    <>
      <DauTrang
        title={`${hello}, ${user.name.split(' ').slice(-1)[0]}`}
        subtitle="Tổng quan điểm danh các lớp bạn đang giảng dạy."
        actions={
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus size={18} />
            Tạo lớp mới
          </button>
        }
      />

      <div className="tiles">
        <OSoLieu
          icon={BookOpen}
          label="Lớp đang dạy"
          value={thongKe.classCount}
          sub={`${thongKe.studentCount} sinh viên`}
        />
        <OSoLieu
          icon={CalendarCheck}
          label="Buổi đã điểm danh"
          value={thongKe.sessionCount}
          sub="Tính trên tất cả các lớp"
        />
        <OSoLieu
          icon={Percent}
          tone="good"
          label="Tỉ lệ đi học TB"
          value={thongKe.avgRate ?? '—'}
          unit={thongKe.avgRate === null ? '' : '%'}
          sub={thongKe.avgRate === null ? 'Chưa có buổi nào' : 'Có mặt + đi trễ'}
        />
        <OSoLieu
          icon={ShieldAlert}
          tone={thongKe.atRisk ? 'critical' : 'good'}
          label="Cần cảnh báo vắng"
          value={thongKe.atRisk}
          unit=" SV"
          sub={thongKe.atRisk ? 'Sắp hoặc đã vượt giới hạn' : 'Mọi người đều ổn'}
        />
      </div>

      <h2 style={{ margin: '32px 0 14px' }}>Lớp học của bạn</h2>
      {thongKe.classes.length === 0 ? (
        <div className="card">
          <TrangRong
            icon={BookOpen}
            title="Chưa có lớp nào"
            action={
              <button className="btn btn-primary" onClick={() => setCreating(true)}>
                <Plus size={18} />
                Tạo lớp đầu tiên
              </button>
            }
          >
            Tạo lớp, thêm sinh viên rồi mở buổi điểm danh đầu tiên.
          </TrangRong>
        </div>
      ) : (
        <div
          className="grid-3"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}
        >
          {thongKe.classes.map((lop) => (
            <Link
              key={lop.classId}
              to={`/classes/${lop.classId}`}
              className="card card-hover class-card"
            >
              <div className="row between" style={{ alignItems: 'flex-start' }}>
                <div className="grow">
                  <span className="class-code">{lop.code}</span>
                  <h3 style={{ marginTop: 8, fontSize: 16 }}>{lop.name}</h3>
                </div>
                <VongTiLe value={lop.avgRate} size={60} />
              </div>
              <div className="row wrap small text-2" style={{ gap: 16 }}>
                <span className="row" style={{ gap: 6 }}>
                  <Users size={15} />
                  {lop.studentCount} SV
                </span>
                <span className="row" style={{ gap: 6 }}>
                  <CalendarCheck size={15} />
                  {lop.closedSessions} buổi
                </span>
              </div>
              <div
                className="row between"
                style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}
              >
                {lop.atRisk > 0 ? (
                  <NhanTrangThai
                    tone={lop.banned ? 'critical' : 'serious'}
                    icon={ShieldAlert}
                  >
                    {lop.atRisk} SV cần cảnh báo
                  </NhanTrangThai>
                ) : (
                  <NhanTrangThai tone="good">Không có cảnh báo</NhanTrangThai>
                )}
                <ChevronRight size={18} className="muted" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {creating && (
        <HopThoaiLop
          onClose={() => setCreating(false)}
          onSaved={(lop) => {
            setCreating(false);
            chuyenTrang(`/classes/${lop.id}?tab=students`);
          }}
        />
      )}
    </>
  );
}

// ============ Trang một lớp ============

export function TrangLopHoc() {
  const { id } = useParams();
  const chuyenTrang = useNavigate();
  const toast = useThongBao();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'overview';
  const [editing, setEditing] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Dữ liệu dùng chung cho các tab
  const lop = useTaiDuLieu(() => api(`/account/classes/${id}`), [id]);
  const stats = useTaiDuLieu(() => api(`/statistics/classes/${id}/overview`), [id]);
  const sessions = useTaiDuLieu(() => api(`/sessions/sessions?classId=${id}`), [id]);
  const requests = useTaiDuLieu(() => api(`/attendance/requests?classId=${id}`), [id]);

  const taiLaiTatCa = () => {
    stats.refresh();
    sessions.refresh();
    requests.refresh();
    lop.refresh();
  };

  if (lop.loading) return <DangTai />;
  if (lop.error) return <KhungLoi message={lop.error} onRetry={lop.reload} />;
  const chiTietLop = lop.data;
  const pending = (requests.data || []).filter((don) => don.status === 'pending').length;
  const atRisk = stats.data
    ? stats.data.perStudent.filter((sinhVien) => sinhVien.level !== 'ok').length
    : 0;

  const tabs = [
    { key: 'overview', label: 'Tổng quan', icon: BarChart3 },
    { key: 'sessions', label: 'Buổi học', icon: CalendarDays },
    { key: 'students', label: 'Sinh viên', icon: Users },
    { key: 'alerts', label: 'Cảnh báo', icon: Bell, badge: atRisk },
    { key: 'requests', label: 'Đơn xin vắng', icon: FileText, badge: pending },
  ];
  const chuyenTab = (key) => setParams(key === 'overview' ? {} : { tab: key });

  async function xuatExcel() {
    setExporting(true);
    try {
      await download(
        `/statistics/classes/${chiTietLop.id}/export.xlsx`,
        `thong-ke-${chiTietLop.code}.xlsx`,
      );
      toast.success('Đã tải file Excel');
    } catch (loi) {
      toast.error(loi.message);
    } finally {
      setExporting(false);
    }
  }

  async function xoaLop() {
    try {
      await api(`/account/classes/${id}`, { method: 'DELETE' });
      toast.success('Đã xoá lớp');
      chuyenTrang('/');
    } catch (loi) {
      toast.error(loi.message);
    }
  }

  return (
    <>
      <DauTrang
        back={
          <Link to="/" className="back-link">
            <ArrowLeft size={16} />
            Tất cả lớp
          </Link>
        }
        title={chiTietLop.name}
        subtitle={
          <span className="row wrap" style={{ gap: 14 }}>
            <span className="class-code">{chiTietLop.code}</span>
            {chiTietLop.semester && <span>{chiTietLop.semester}</span>}
            {chiTietLop.room && (
              <span className="row" style={{ gap: 5 }}>
                <MapPin size={14} />
                {chiTietLop.room}
              </span>
            )}
          </span>
        }
        actions={
          <>
            <button
              className="btn btn-secondary"
              onClick={xuatExcel}
              disabled={exporting}
            >
              {exporting ? <VongXoayNut /> : <Download size={16} />}
              <span className="hide-sm">Xuất Excel</span>
            </button>
            <button className="btn btn-secondary" onClick={() => setEditing(true)}>
              <Pencil size={16} />
              <span className="hide-sm">Sửa lớp</span>
            </button>
          </>
        }
      />

      <div className="tabs" role="tablist">
        {tabs.map((muc) => (
          <button
            key={muc.key}
            role="tab"
            aria-selected={tab === muc.key}
            className={`tab ${tab === muc.key ? 'on' : ''}`}
            onClick={() => chuyenTab(muc.key)}
          >
            <muc.icon size={17} />
            {muc.label}
            {muc.badge > 0 && <span className="tab-count">{muc.badge}</span>}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <TabTongQuan
          cls={chiTietLop}
          requests={requests.data}
          onChanged={taiLaiTatCa}
          stats={stats}
          atRisk={atRisk}
          pending={pending}
          onGoAlerts={() => chuyenTab('alerts')}
          onGoStudents={() => chuyenTab('students')}
          onGoRequests={() => chuyenTab('requests')}
        />
      )}
      {tab === 'sessions' && (
        <TabBuoiHoc
          cls={chiTietLop}
          sessions={sessions}
          stats={stats.data}
          onChanged={taiLaiTatCa}
        />
      )}
      {tab === 'students' && (
        <TabSinhVien
          cls={chiTietLop}
          stats={stats.data}
          requests={requests.data}
          onChanged={taiLaiTatCa}
        />
      )}
      {tab === 'alerts' && (
        <TabCanhBao
          cls={chiTietLop}
          stats={stats}
          requests={requests.data}
          onChanged={taiLaiTatCa}
        />
      )}
      {tab === 'requests' && (
        <TabDonXinVang requests={requests} onChanged={taiLaiTatCa} />
      )}

      {editing && (
        <HopThoaiLop
          initial={chiTietLop}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            taiLaiTatCa();
          }}
          onDelete={xoaLop}
        />
      )}
    </>
  );
}

// ============ Tab Tổng quan ============

/* Ô số bấm được: vừa là chỉ số vừa là lối tắt tới nơi xử lý (thay cho các banner cảnh báo riêng). */
function OSoBamDuoc({ icon: Icon, tone = '', label, value, unit, sub, onClick }) {
  return (
    <button className="card tile action" onClick={onClick}>
      <div className="tile-label">
        <span className={`tile-icon ${tone}`}>
          <Icon size={16} />
        </span>
        {label}
        <ChevronRight size={16} className="tile-go muted" />
      </div>
      <div className="tile-value num">
        {value}
        {unit && <small>{unit}</small>}
      </div>
      <div className="tile-sub">{sub}</div>
    </button>
  );
}

/* Tab Tổng quan: gọn trong một màn hình. 3 ô số bấm được + 2 biểu đồ bấm được.
   Chi tiết nằm ở các tab/cửa sổ khác: danh sách sinh viên, cảnh báo (kèm phân bố số buổi vắng), đơn xin vắng. */
export function TabTongQuan({
  cls,
  requests,
  onChanged,
  stats,
  atRisk,
  pending,
  onGoAlerts,
  onGoStudents,
  onGoRequests,
}) {
  const [detail, setDetail] = useState(null); // null | { type: 'attendance' } | { type: 'session', index }
  const [studentCode, setStudentCode] = useState(null); // sinh viên đang xem chi tiết (mở chồng lên danh sách)

  if (stats.loading) return <DangTai />;
  if (stats.error) return <KhungLoi message={stats.error} onRetry={stats.reload} />;
  const thongKe = stats.data;

  if (thongKe.studentCount === 0) {
    return (
      <div className="card">
        <TrangRong
          icon={Users}
          title="Lớp chưa có sinh viên"
          action={
            <button className="btn btn-primary" onClick={onGoStudents}>
              Thêm sinh viên
            </button>
          }
        >
          Thêm sinh viên vào lớp để bắt đầu điểm danh.
        </TrangRong>
      </div>
    );
  }
  if (thongKe.closedSessions === 0) {
    return (
      <div className="card">
        <TrangRong icon={CalendarDays} title="Chưa có buổi nào hoàn tất">
          Mở một buổi điểm danh ở tab "Buổi học", đóng buổi xong thì biểu đồ sẽ xuất hiện
          ở đây.
        </TrangRong>
      </div>
    );
  }

  const riskTone = thongKe.levels.banned > 0 ? 'critical' : atRisk > 0 ? 'serious' : 'good';

  return (
    <div className="stack-lg">
      <div className="tiles three">
        <OSoBamDuoc
          icon={Users}
          label="Sĩ số"
          value={thongKe.studentCount}
          unit=" SV"
          sub={`${thongKe.closedSessions}/${thongKe.class.totalSessions} buổi đã học`}
          onClick={onGoStudents}
        />
        <OSoBamDuoc
          icon={FileText}
          tone={pending > 0 ? 'serious' : ''}
          label="Đơn xin vắng"
          value={pending}
          unit=" chờ"
          sub={pending > 0 ? 'Bấm để xem và duyệt' : 'Không có đơn chờ duyệt'}
          onClick={onGoRequests}
        />
        <OSoBamDuoc
          icon={ShieldAlert}
          tone={riskTone}
          label="Nguy cơ cấm thi"
          value={atRisk}
          unit=" SV"
          sub={
            atRisk > 0
              ? `${thongKe.levels.banned} vượt · ${thongKe.levels.danger} sát giới hạn · ${thongKe.levels.warning} cần chú ý`
              : 'Chưa ai gần giới hạn vắng'
          }
          onClick={onGoAlerts}
        />
      </div>

      <div className="grid-2">
        <The title="Tỉ lệ đi học theo buổi" subtitle="Có mặt + đi trễ, tính trên sĩ số">
          <div className="chart-box tall">
            <BieuDoTiLeDiHoc
              perSession={thongKe.perSession}
              onSelect={(index) => setDetail({ type: 'session', index })}
            />
          </div>
        </The>
        <div
          className="card card-hover donut-card"
          role="button"
          tabIndex={0}
          onClick={() => setDetail({ type: 'attendance' })}
          onKeyDown={(suKien) =>
            (suKien.key === 'Enter' || suKien.key === ' ') && setDetail({ type: 'attendance' })
          }
          aria-label="Cơ cấu điểm danh. Bấm để xem chi tiết"
        >
          <div className="card-head">
            <div>
              <h2>Cơ cấu điểm danh</h2>
              <p>Tỉ lệ đi học của cả lớp</p>
            </div>
            <span className="drill-link">
              Chi tiết
              <ChevronRight size={16} />
            </span>
          </div>
          <div className="card-body">
            <div className="chart-box tall">
              <BieuDoTron overall={thongKe.overall} avgRate={thongKe.avgRate} />
            </div>
          </div>
        </div>
      </div>

      {detail?.type === 'session' && (
        <HopThoaiChiTietBuoi
          stats={thongKe}
          index={detail.index}
          onOpenStudent={setStudentCode}
          onClose={() => setDetail(null)}
        />
      )}
      {detail?.type === 'attendance' && (
        <HopThoaiTrangThaiTheoBuoi
          stats={thongKe}
          onOpenStudent={setStudentCode}
          onClose={() => setDetail(null)}
        />
      )}
      {studentCode &&
        (() => {
          const sinhVienTim = thongKe.perStudent.find(
            (sinhVien) => String(sinhVien.studentCode) === String(studentCode),
          );
          return sinhVienTim ? (
            <HopThoaiChiTietSinhVien
              student={{
                student_code: sinhVienTim.studentCode,
                full_name: sinhVienTim.fullName,
                email: sinhVienTim.email,
              }}
              stats={thongKe}
              cls={cls}
              requests={requests}
              onChanged={onChanged}
              onClose={() => setStudentCode(null)}
            />
          ) : null;
        })()}
    </div>
  );
}

// ============ Tab Buổi học ============

export function TabBuoiHoc({ cls, sessions, stats, onChanged }) {
  const chuyenTrang = useNavigate();
  const toast = useThongBao();
  const [opening, setOpening] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  if (sessions.loading) return <DangTai />;
  if (sessions.error)
    return <KhungLoi message={sessions.error} onRetry={sessions.reload} />;

  const list = [...sessions.data].reverse();
  const openOne = list.find((buoi) => buoi.status === 'open');
  const tiLeCuaBuoi = (maBuoi) => stats?.perSession.find((buoi) => buoi.sessionId === maBuoi);

  async function moBuoiDiemDanh(suKien) {
    suKien.preventDefault();
    setBusy(true);
    try {
      const buoiMoi = await api('/sessions/sessions', {
        method: 'POST',
        body: { classId: cls.id, title },
      });
      toast.success(`Đã mở buổi ${buoiMoi.sessionNo}`);
      chuyenTrang(`/classes/${cls.id}/sessions/${buoiMoi.id}`);
    } catch (loi) {
      toast.error(loi.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    try {
      await api(`/sessions/sessions/${toDelete.id}`, { method: 'DELETE' });
      toast.success('Đã xoá buổi học');
      setToDelete(null);
      onChanged();
    } catch (loi) {
      toast.error(loi.message);
    }
  }

  return (
    <div className="stack">
      {openOne ? (
        <div
          className="card card-pad row wrap"
          style={{ background: 'var(--accent-soft)', borderColor: 'transparent' }}
        >
          <Radio size={22} color="var(--accent-ink)" />
          <div className="grow">
            <b>{openOne.title} đang điểm danh</b>
            <div className="small text-2">
              Mở lúc {dinhDangNgayGio(openOne.openedAt)}. Hãy chiếu mã QR cho sinh viên
              quét.
            </div>
          </div>
          <Link
            to={`/classes/${cls.id}/sessions/${openOne.id}`}
            className="btn btn-primary"
          >
            <QrCode size={17} />
            Mở màn hình QR
          </Link>
        </div>
      ) : (
        <div className="row between wrap">
          <p className="text-2">Mỗi lần dạy, hãy mở một buổi điểm danh mới.</p>
          <button className="btn btn-primary" onClick={() => setOpening(true)}>
            <Play size={16} />
            Mở buổi điểm danh
          </button>
        </div>
      )}

      <The pad={false} title={`Các buổi học (${list.length})`}>
        {list.length === 0 ? (
          <TrangRong icon={CalendarDays} title="Chưa có buổi học nào">
            Bấm "Mở buổi điểm danh" để bắt đầu buổi đầu tiên.
          </TrangRong>
        ) : (
          <div className="list">
            {list.map((buoi) => {
              const tiLe = tiLeCuaBuoi(buoi.id);
              return (
                <div className="list-item" key={buoi.id}>
                  <div className="timeline-no">{buoi.sessionNo}</div>
                  <div className="grow">
                    <div className="bold">{buoi.title}</div>
                    <div className="small muted">{dinhDangNgayGio(buoi.openedAt)}</div>
                  </div>
                  {buoi.status === 'open' ? (
                    <NhanTrangThai tone="live">
                      <span className="dot pulse" />
                      Đang mở
                    </NhanTrangThai>
                  ) : (
                    tiLe && (
                      <span
                        className="hide-sm"
                        title={`${tiLe.present + tiLe.late}/${tiLe.present + tiLe.late + tiLe.excused + tiLe.absent} sinh viên có mặt`}
                      >
                        <VongTiLe value={tiLe.rate} size={44} stroke={5} />
                      </span>
                    )
                  )}
                  <Link
                    className="btn btn-secondary btn-sm"
                    to={`/classes/${cls.id}/sessions/${buoi.id}`}
                  >
                    {buoi.status === 'open' ? (
                      <>
                        <QrCode size={15} />
                        Mở QR
                      </>
                    ) : (
                      <>
                        <ClipboardCheck size={15} />
                        Điểm danh
                      </>
                    )}
                  </Link>
                  <button
                    className="btn btn-ghost btn-icon btn-sm"
                    aria-label="Xoá buổi"
                    onClick={() => setToDelete(buoi)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </The>

      {opening && (
        <HopThoai title="Mở buổi điểm danh" onClose={() => setOpening(false)}>
          <form className="stack" onSubmit={moBuoiDiemDanh}>
            <TruongNhap
              label="Tên buổi (không bắt buộc)"
              hint={`Để trống sẽ đặt là "Buổi ${sessions.data.length + 1}"`}
            >
              <input
                className="input"
                autoFocus
                value={title}
                onChange={(suKien) => setTitle(suKien.target.value)}
                placeholder="VD: Chương 3 - Kiến trúc microservices"
              />
            </TruongNhap>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setOpening(false)}
              >
                Huỷ
              </button>
              <button className="btn btn-primary" disabled={busy}>
                <Play size={16} />
                Bắt đầu
              </button>
            </div>
          </form>
        </HopThoai>
      )}
      {toDelete && (
        <HopThoai
          title={`Xoá ${toDelete.title}?`}
          onClose={() => setToDelete(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setToDelete(null)}>
                Huỷ
              </button>
              <button
                className="btn btn-primary"
                style={{ background: 'var(--critical)' }}
                onClick={remove}
              >
                Xoá buổi
              </button>
            </>
          }
        >
          <p className="text-2">
            Buổi học sẽ biến mất khỏi thống kê. Không thể hoàn tác.
          </p>
        </HopThoai>
      )}
    </div>
  );
}

// ============ Tab Sinh viên ============

/* Tab Sinh viên: một bảng duy nhất vừa quản lý danh sách vừa xem tình hình đi học */
export function TabSinhVien({ cls, stats, requests, onChanged }) {
  const toast = useThongBao();
  const list = useTaiDuLieu(() => api(`/account/classes/${cls.id}/students`), [cls.id]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ studentCode: '', fullName: '', email: '' });
  const [tuKhoa, datTuKhoa] = useState('');
  const [sort, setSort] = useState({ key: 'student_code', dir: 1 });
  const [toDelete, setToDelete] = useState(null);
  const [detail, setDetail] = useState(null);

  const changed = () => {
    list.refresh();
    onChanged();
  };

  // Ghép danh sách sinh viên với số liệu điểm danh theo email
  const rows = useMemo(() => {
    if (!list.data) return [];
    const byEmail = new Map(
      (stats?.perStudent || []).map((sinhVien) => [sinhVien.email.toLowerCase(), sinhVien]),
    );
    return list.data
      .map((sinhVien) => ({ ...sinhVien, st: byEmail.get(sinhVien.email.toLowerCase()) || null }))
      .filter((sinhVien) =>
        `${sinhVien.full_name} ${sinhVien.student_code} ${sinhVien.email}`
          .toLowerCase()
          .includes(tuKhoa.toLowerCase()),
      )
      .sort((a, b) => {
        const layGiaTri = (sinhVien) =>
          sort.key === 'absent' || sort.key === 'rate'
            ? (sinhVien.st?.[sort.key] ?? -1)
            : sinhVien[sort.key];
        const giaTriA = layGiaTri(a),
          giaTriB = layGiaTri(b);
        return (giaTriA > giaTriB ? 1 : giaTriA < giaTriB ? -1 : 0) * sort.dir;
      });
  }, [list.data, stats, tuKhoa, sort]);

  async function themMotSinhVien(suKien) {
    suKien.preventDefault();
    try {
      await api(`/account/classes/${cls.id}/students`, { method: 'POST', body: form });
      toast.success('Đã thêm sinh viên');
      setAdding(false);
      setForm({ studentCode: '', fullName: '', email: '' });
      changed();
    } catch (loi) {
      toast.error(loi.message);
    }
  }

  async function remove() {
    try {
      await api(`/account/classes/${cls.id}/students/${toDelete.id}`, {
        method: 'DELETE',
      });
      toast.success(`Đã xoá ${toDelete.full_name}`);
      setToDelete(null);
      changed();
    } catch (loi) {
      toast.error(loi.message);
    }
  }

  if (list.loading) return <DangTai />;
  if (list.error) return <KhungLoi message={list.error} onRetry={list.reload} />;

  const toggle = (key) =>
    setSort((truoc) => ({ key, dir: truoc.key === key ? -truoc.dir : key === 'absent' ? -1 : 1 }));
  const TieuDeCot = ({ k, children, right, hide }) => (
    <th className={`${right ? 'right' : ''} ${hide ? 'hide-sm' : ''}`}>
      <button
        onClick={() => toggle(k)}
        style={{
          all: 'unset',
          cursor: 'pointer',
          display: 'inline-flex',
          gap: 4,
          alignItems: 'center',
        }}
      >
        {children}
        <ArrowUpDown size={12} />
      </button>
    </th>
  );

  return (
    <div className="stack">
      <section className="card table-card">
        <div className="toolbar">
          <div className="input-icon grow" style={{ maxWidth: 320 }}>
            <Search size={16} />
            <input
              className="input"
              placeholder={`Tìm trong ${list.data.length} sinh viên`}
              value={tuKhoa}
              onChange={(suKien) => datTuKhoa(suKien.target.value)}
            />
          </div>
          <div className="grow" />
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            <UserPlus size={16} />
            Thêm
          </button>
        </div>

        {list.data.length === 0 ? (
          <TrangRong icon={Users} title="Chưa có sinh viên">
            Bấm "Thêm" để nhập từng sinh viên (MSSV, họ tên, email). Sinh viên đăng nhập
            bằng đúng email này sẽ thấy lớp.
          </TrangRong>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <TieuDeCot k="full_name">Sinh viên</TieuDeCot>
                  <TieuDeCot k="student_code" hide>
                    MSSV
                  </TieuDeCot>
                  <TieuDeCot k="absent" right>
                    Vắng
                  </TieuDeCot>
                  <TieuDeCot k="rate" right hide>
                    Tỉ lệ đi học
                  </TieuDeCot>
                  <th className="hide-sm">Tình trạng</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((sinhVien) => (
                  <tr
                    key={sinhVien.id}
                    className="row-link"
                    tabIndex={0}
                    onClick={() => setDetail(sinhVien)}
                    onKeyDown={(suKien) => suKien.key === 'Enter' && setDetail(sinhVien)}
                    aria-label={`Xem chi tiết ${sinhVien.full_name}`}
                  >
                    <td>
                      <div className="row">
                        <AnhDaiDien name={sinhVien.full_name} />
                        <div style={{ minWidth: 0 }}>
                          <div className="bold truncate">{sinhVien.full_name}</div>
                          <div className="xs muted truncate">{sinhVien.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="num text-2 hide-sm">{sinhVien.student_code}</td>
                    <td className="right num bold">{sinhVien.st ? sinhVien.st.absent : '—'}</td>
                    <td className="right num hide-sm">
                      {sinhVien.st ? phanTram(sinhVien.st.rate) : '—'}
                    </td>
                    <td className="hide-sm">
                      {sinhVien.st && stats.closedSessions > 0 ? (
                        <NhanMucCanhBao level={sinhVien.st.level} />
                      ) : (
                        <span className="muted small">Chưa có dữ liệu</span>
                      )}
                    </td>
                    <td className="right" style={{ whiteSpace: 'nowrap' }}>
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        aria-label={`Xoá ${sinhVien.full_name}`}
                        onClick={(suKien) => {
                          suKien.stopPropagation();
                          setToDelete(sinhVien);
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                      <ChevronRight size={18} className="muted row-chevron" />
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="center muted" style={{ padding: 32 }}>
                      Không tìm thấy sinh viên phù hợp
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {detail && (
        <HopThoaiChiTietSinhVien
          student={detail}
          stats={stats}
          cls={cls}
          requests={requests}
          onChanged={onChanged}
          onClose={() => setDetail(null)}
        />
      )}
      {adding && (
        <HopThoai title="Thêm sinh viên" onClose={() => setAdding(false)}>
          <form className="stack" onSubmit={themMotSinhVien}>
            <TruongNhap label="MSSV">
              <input
                className="input"
                required
                autoFocus
                value={form.studentCode}
                onChange={(suKien) => setForm({ ...form, studentCode: suKien.target.value })}
              />
            </TruongNhap>
            <TruongNhap label="Họ tên">
              <input
                className="input"
                required
                value={form.fullName}
                onChange={(suKien) => setForm({ ...form, fullName: suKien.target.value })}
              />
            </TruongNhap>
            <TruongNhap label="Email (dùng để đăng nhập)">
              <input
                className="input"
                type="email"
                required
                value={form.email}
                onChange={(suKien) => setForm({ ...form, email: suKien.target.value })}
              />
            </TruongNhap>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setAdding(false)}
              >
                Huỷ
              </button>
              <button className="btn btn-primary">Thêm</button>
            </div>
          </form>
        </HopThoai>
      )}
      {toDelete && (
        <HopThoai
          title={`Xoá ${toDelete.full_name}?`}
          onClose={() => setToDelete(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setToDelete(null)}>
                Huỷ
              </button>
              <button
                className="btn btn-primary"
                style={{ background: 'var(--critical)' }}
                onClick={remove}
              >
                Xoá khỏi lớp
              </button>
            </>
          }
        >
          <p className="text-2">
            Sinh viên sẽ bị xoá khỏi danh sách lớp và không còn thấy lớp này.
          </p>
        </HopThoai>
      )}
    </div>
  );
}

// ============ Tab Cảnh báo ============

const TRANG_THAI_MAIL = {
  sent: ['good', 'Đã gửi'],
  logged: ['info', 'Ghi log'],
  failed: ['critical', 'Gửi lỗi'],
};

/* Tab Cảnh báo: ai sắp bị cấm thi, gửi email nhắc, lịch sử email */
export function TabCanhBao({ cls, stats, requests, onChanged }) {
  const toast = useThongBao();
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState(null); // sinh viên đang xem chi tiết
  const [absenceCount, setAbsenceCount] = useState(null); // cột biểu đồ phân bố đang xem
  const history = useTaiDuLieu(
    () => api(`/attendance/notifications?classId=${cls.id}`),
    [cls.id],
  );

  if (stats.loading) return <DangTai />;
  if (stats.error) return <KhungLoi message={stats.error} onRetry={stats.reload} />;
  const thongKe = stats.data;
  const risky = thongKe.perStudent
    .filter((sinhVien) => sinhVien.level !== 'ok')
    .sort((a, b) => b.absent - a.absent);

  async function send() {
    setBusy(true);
    try {
      const ketQua = await api('/attendance/warnings/send', {
        method: 'POST',
        body: { classId: cls.id },
      });
      toast.success(
        ketQua.mailConfigured
          ? `Đã gửi ${ketQua.count} email cảnh báo`
          : `Đã ghi nhận ${ketQua.count} cảnh báo (chưa cấu hình SMTP nên chưa gửi email thật)`,
      );
      history.refresh();
    } catch (loi) {
      toast.error(loi.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack-lg">
      <The
        pad={false}
        title="Sinh viên cần chú ý"
        subtitle={`Giới hạn: vắng quá ${thongKe.absentLimit} buổi không phép (${thongKe.class.maxAbsentPercent}% của ${thongKe.class.totalSessions} buổi) sẽ bị cấm thi.`}
        actions={
          risky.length > 0 && (
            <button className="btn btn-primary" onClick={send} disabled={busy}>
              {busy ? <VongXoayNut /> : <Send size={16} />}Gửi email cảnh báo
            </button>
          )
        }
      >
        {risky.length === 0 ? (
          <TrangRong icon={PartyPopper} title="Tuyệt vời!">
            Chưa có sinh viên nào gần chạm giới hạn vắng.
          </TrangRong>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Sinh viên</th>
                  <th className="right">Đã vắng</th>
                  <th>Tình trạng</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {risky.map((sinhVien) => (
                  <tr
                    key={sinhVien.email}
                    className="row-link"
                    tabIndex={0}
                    onClick={() => setDetail(sinhVien)}
                    onKeyDown={(suKien) => suKien.key === 'Enter' && setDetail(sinhVien)}
                    aria-label={`Xem chi tiết ${sinhVien.fullName}`}
                  >
                    <td>
                      <div className="bold">{sinhVien.fullName}</div>
                      <div className="xs muted">{sinhVien.studentCode}</div>
                    </td>
                    <td className="right num bold">
                      {sinhVien.absent}/{thongKe.absentLimit}
                    </td>
                    <td>
                      <NhanMucCanhBao level={sinhVien.level} />
                    </td>
                    <td className="right">
                      <ChevronRight size={18} className="muted row-chevron" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </The>

      <The
        title="Phân bố số buổi vắng"
        subtitle={`Mỗi cột là số sinh viên vắng đúng chừng đó buổi. Giới hạn: ${thongKe.absentLimit} buổi`}
      >
        <div className="chart-box sm">
          <BieuDoPhanBoBuoiVang
            perStudent={thongKe.perStudent}
            absentLimit={thongKe.absentLimit}
            onSelect={setAbsenceCount}
          />
        </div>
      </The>

      {absenceCount !== null && (
        <HopThoaiSinhVienTheoSoBuoiVang
          count={absenceCount}
          stats={thongKe}
          onOpenStudent={(code) =>
            setDetail(
              thongKe.perStudent.find((sinhVien) => String(sinhVien.studentCode) === String(code)) || null,
            )
          }
          onClose={() => setAbsenceCount(null)}
        />
      )}
      {detail && (
        <HopThoaiChiTietSinhVien
          student={{
            student_code: detail.studentCode,
            full_name: detail.fullName,
            email: detail.email,
          }}
          stats={thongKe}
          cls={cls}
          requests={requests}
          onChanged={onChanged}
          onClose={() => setDetail(null)}
        />
      )}

      <The title="Lịch sử email đã gửi" pad={false}>
        {history.loading ? (
          <DangTai />
        ) : history.error ? (
          <KhungLoi message={history.error} />
        ) : history.data.length === 0 ? (
          <TrangRong icon={MailCheck} title="Chưa gửi email nào">
            Email nêu rõ số buổi đã vắng và giới hạn cho phép.
          </TrangRong>
        ) : (
          <div className="list">
            {history.data.map((thongBao) => (
              <div className="list-item" key={thongBao.id}>
                <div className="grow">
                  <div className="bold">{thongBao.studentName}</div>
                  <div className="small muted truncate">{thongBao.subject}</div>
                </div>
                <span className="small muted hide-sm">
                  {dinhDangNgayGio(thongBao.createdAt)}
                </span>
                <NhanTrangThai tone={TRANG_THAI_MAIL[thongBao.status][0]} title={thongBao.detail}>
                  {TRANG_THAI_MAIL[thongBao.status][1]}
                </NhanTrangThai>
              </div>
            ))}
          </div>
        )}
      </The>
    </div>
  );
}

// ============ Tab Đơn xin vắng ============

export function TabDonXinVang({ requests, onChanged }) {
  const [open, setOpen] = useState(null);

  if (requests.loading) return <DangTai />;
  if (requests.error)
    return <KhungLoi message={requests.error} onRetry={requests.reload} />;
  const current = open && requests.data.find((don) => don.id === open);
  const pending = requests.data.filter((don) => don.status === 'pending').length;

  return (
    <>
      <The
        pad={false}
        title="Đơn xin vắng"
        subtitle={
          pending
            ? `${pending} đơn đang chờ bạn xem và duyệt`
            : 'Bấm vào một đơn để xem chi tiết và ảnh minh chứng.'
        }
      >
        {requests.data.length === 0 ? (
          <TrangRong icon={FileText} title="Chưa có đơn nào">
            Khi sinh viên gửi đơn xin vắng (kèm ảnh minh chứng), đơn sẽ hiện ở đây.
          </TrangRong>
        ) : (
          <div className="list">
            {requests.data.map((don) => (
              <div
                className="list-item request-row"
                key={don.id}
                onClick={() => setOpen(don.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(suKien) => suKien.key === 'Enter' && setOpen(don.id)}
                style={{ alignItems: 'flex-start' }}
              >
                <AnhDaiDien name={don.studentName} />
                <div className="grow">
                  <div className="row wrap" style={{ gap: 8 }}>
                    <b>{don.studentName}</b>
                    <span className="small muted num">{don.studentCode}</span>
                    <NhanTrangThai tone={MAU_TRANG_THAI_DON[don.status][0]}>
                      {MAU_TRANG_THAI_DON[don.status][1]}
                    </NhanTrangThai>
                    {don.files.length > 0 && (
                      <NhanTrangThai icon={Paperclip}>{don.files.length} ảnh</NhanTrangThai>
                    )}
                  </div>
                  <div className="small muted">
                    Xin vắng buổi {don.sessionNo} · gửi lúc {dinhDangNgayGio(don.createdAt)}
                  </div>
                  <p className="text-2 clamp-2" style={{ marginTop: 6 }}>
                    {don.reason}
                  </p>
                  {don.files.length > 0 && (
                    <div className="thumbs">
                      {don.files.map((anh) => (
                        <AnhCoXacThuc
                          key={anh.id}
                          path={duongDanAnhDon(don, anh)}
                          alt={anh.name}
                          className="thumb"
                        />
                      ))}
                    </div>
                  )}
                </div>
                <button
                  className={`btn btn-sm ${don.status === 'pending' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={(suKien) => {
                    suKien.stopPropagation();
                    setOpen(don.id);
                  }}
                >
                  <Eye size={15} />
                  {don.status === 'pending' ? 'Xem & duyệt' : 'Xem'}
                </button>
              </div>
            ))}
          </div>
        )}
      </The>
      {current && (
        <HopThoaiChiTietDon
          request={current}
          onClose={() => setOpen(null)}
          onReviewed={() => {
            setOpen(null);
            onChanged();
          }}
        />
      )}
    </>
  );
}
