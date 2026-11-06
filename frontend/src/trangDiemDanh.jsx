// Trang điểm danh của một buổi: mã QR tự đổi + danh sách sinh viên.

import {
  ArrowLeft,
  Check,
  Copy,
  Lock,
  Maximize2,
  Pencil,
  Radio,
  Search,
  Smartphone,
} from './bieuTuong.jsx';
import QRCode from 'qrcode';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from './api.js';
import {
  AnhDaiDien,
  NhanTrangThai,
  The,
  HopThoaiXacNhanLuu,
  HopThoaiXacNhan,
  KhungLoi,
  DangTai,
  HopThoai,
  DauTrang,
  TRANG_THAI,
  ThanhLuuThayDoi,
  MenuTrangThai,
  dinhDangNgayGio,
  dinhDangGio,
  useTaiDuLieu,
  useThayDoiChuaLuu,
  useThongBao,
  useCanhBaoChuaLuu,
} from './thanhPhan.jsx';

const THU_TU_TRANG_THAI = ['present', 'late', 'excused', 'absent'];

/* Đồng hồ đếm ngược quanh số giây còn lại của mã QR */
function DongHoDemNguoc({ remaining, ttl }) {
  const size = 52,
    stroke = 5,
    banKinh = (size - stroke) / 2,
    chuVi = 2 * Math.PI * banKinh;
  const frac = Math.max(0, Math.min(1, remaining / ttl));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={banKinh}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={banKinh}
          fill="none"
          stroke={remaining < 6 ? 'var(--serious)' : 'var(--accent)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={chuVi}
          strokeDashoffset={chuVi * (1 - frac)}
        />
      </svg>
      <span className="ring-label num" style={{ fontSize: 16 }}>
        {Math.ceil(remaining)}
      </span>
    </div>
  );
}

function KhungQr({ sessionId, session, lateMinutes }) {
  const toast = useThongBao();
  const canvasRef = useRef(null);
  const panelRef = useRef(null);
  const offset = useRef(0); // chênh lệch giờ giữa máy chủ và máy này
  const [maQr, datMaQr] = useState(null);
  const [error, setError] = useState('');
  const [bayGio, datBayGio] = useState(Date.now());
  const [copied, setCopied] = useState(false);

  // Lấy mã QR mới ngay khi mã cũ sắp hết hạn
  useEffect(() => {
    let cancelled = false;
    let timer;
    async function tick() {
      try {
        const ketQua = await api(`/sessions/sessions/${sessionId}/qr`);
        if (cancelled) return;
        offset.current = ketQua.serverTime - Date.now();
        datMaQr(ketQua);
        setError('');
        timer = setTimeout(
          tick,
          Math.max(400, ketQua.expiresAt - (Date.now() + offset.current) + 150),
        );
      } catch (loi) {
        if (cancelled) return;
        setError(loi.message);
        timer = setTimeout(tick, 3000);
      }
    }
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [sessionId]);

  useEffect(() => {
    const boDem = setInterval(() => datBayGio(Date.now()), 200);
    return () => clearInterval(boDem);
  }, []);

  // Mã QR chứa đường link: quét bằng camera điện thoại là mở thẳng trang điểm danh
  const duongDan = maQr
    ? `${window.location.origin}/scan?t=${encodeURIComponent(maQr.token)}`
    : '';
  useEffect(() => {
    if (duongDan && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, duongDan, {
        width: 720,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#0b0b0b', light: '#ffffff' },
      });
    }
  }, [duongDan]);

  const remaining = maQr ? Math.max(0, (maQr.expiresAt - (bayGio + offset.current)) / 1000) : 0;

  async function copy() {
    try {
      await navigator.clipboard.writeText(duongDan);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      toast.success('Đã sao chép liên kết điểm danh');
    } catch {
      toast.error('Không sao chép được');
    }
  }

  return (
    <section className="card qr-panel" ref={panelRef}>
      <div className="row between" style={{ alignSelf: 'stretch' }}>
        <NhanTrangThai tone="live">
          <span className="dot pulse" />
          Đang điểm danh
        </NhanTrangThai>
        <span className="small muted">{session.title}</span>
      </div>

      <div className="qr-frame">
        {error && !maQr ? (
          <div style={{ width: 300, height: 300, display: 'grid', placeItems: 'center' }}>
            <KhungLoi message={error} />
          </div>
        ) : (
          <canvas ref={canvasRef} aria-label="Mã QR điểm danh" />
        )}
      </div>

      <div className="qr-timer">
        <DongHoDemNguoc remaining={remaining} ttl={maQr?.ttl || 30} />
        <div style={{ textAlign: 'left' }}>
          <div className="bold">Mã tự đổi sau {Math.ceil(remaining)} giây</div>
          <div className="small muted">Chống chụp ảnh gửi bạn điểm danh hộ</div>
        </div>
      </div>

      <div
        className="alert"
        style={{ alignSelf: 'stretch', textAlign: 'left', alignItems: 'center' }}
      >
        <Smartphone size={18} style={{ flex: 'none' }} />
        <span className="small">
          Sinh viên mở camera điện thoại quét mã, đăng nhập bằng email của lớp là điểm
          danh xong.
          {lateMinutes
            ? ` Quét sau ${lateMinutes} phút kể từ lúc mở buổi sẽ tự tính là đi muộn.`
            : ''}
        </span>
      </div>

      <div className="row wrap" style={{ justifyContent: 'center' }}>
        <button
          className="btn btn-secondary"
          onClick={() => panelRef.current?.requestFullscreen?.()}
        >
          <Maximize2 size={16} />
          Chiếu toàn màn hình
        </button>
        <button className="btn btn-ghost" onClick={copy}>
          {copied ? <Check size={16} /> : <Copy size={16} />}Sao chép liên kết
        </button>
      </div>
    </section>
  );
}

export function TrangBuoiDiemDanh() {
  const { id: classId, sid: maBuoi } = useParams();
  const toast = useThongBao();
  const lop = useTaiDuLieu(() => api(`/account/classes/${classId}`), [classId]);
  const roster = useTaiDuLieu(() => api(`/attendance/sessions/${maBuoi}/roster`), [maBuoi]);
  const [tuKhoa, datTuKhoa] = useState('');
  const [closing, setClosing] = useState(false);
  const [filter, setFilter] = useState('all');
  const chuyenTrang = useNavigate();
  const staged = useThayDoiChuaLuu(); // thay đổi sửa tay chưa lưu: email -> trạng thái mới
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [leaveTo, setLeaveTo] = useState(null); // đường dẫn muốn rời đi khi còn thay đổi chưa lưu
  useCanhBaoChuaLuu(staged.count > 0);

  const isOpen = roster.data?.session.status === 'open';

  // Buổi đang mở: cập nhật danh sách mỗi 4 giây để thấy sinh viên điểm danh trực tiếp
  useEffect(() => {
    if (!isOpen) return undefined;
    const boDem = setInterval(roster.refresh, 4000);
    return () => clearInterval(boDem);
  }, [isOpen, roster.refresh]);

  const list = useMemo(() => {
    if (!roster.data) return [];
    return roster.data.roster
      .filter(
        (sinhVien) =>
          (filter === 'all' || (staged.map[sinhVien.email] ?? sinhVien.status) === filter) &&
          `${sinhVien.fullName} ${sinhVien.studentCode}`.toLowerCase().includes(tuKhoa.toLowerCase()),
      )
      .sort(
        (a, b) =>
          (b.checkedAt ? new Date(b.checkedAt) : 0) -
            (a.checkedAt ? new Date(a.checkedAt) : 0) ||
          a.studentCode.localeCompare(b.studentCode),
      );
  }, [roster.data, tuKhoa, filter, staged.map]);

  if (roster.loading && !roster.data) return <DangTai />;
  if (roster.error && !roster.data)
    return <KhungLoi message={roster.error} onRetry={roster.reload} />;
  const { session, summary } = roster.data;

  // Danh sách thay đổi để hiển thị trong hộp xác nhận
  const changeItems = roster.data.roster
    .filter((sinhVien) => staged.map[sinhVien.email] !== undefined)
    .map((sinhVien) => ({
      id: sinhVien.email,
      title: sinhVien.fullName,
      sub: sinhVien.studentCode,
      from: sinhVien.status,
      to: staged.map[sinhVien.email],
    }));

  async function luuThayDoi() {
    setSaving(true);
    try {
      const changes = changeItems.map((thayDoi) => ({
        sessionId: Number(maBuoi),
        email: thayDoi.id,
        status: thayDoi.to,
      }));
      const ketQua = await api(`/attendance/classes/${classId}/changes`, {
        method: 'POST',
        body: { changes },
      });
      toast.success(`Đã lưu ${ketQua.applied} thay đổi điểm danh`);
      staged.clear();
      setConfirming(false);
      roster.refresh();
    } catch (loi) {
      toast.error(loi.message);
    } finally {
      setSaving(false);
    }
  }
  // Rời trang: nếu còn thay đổi chưa lưu thì hỏi lại
  const chanKhiRoiTrang = (duongDanDich) => (suKien) => {
    if (staged.count > 0) {
      suKien.preventDefault();
      setLeaveTo(duongDanDich);
    }
  };

  async function dongBuoi() {
    try {
      await api(`/sessions/sessions/${maBuoi}/close`, { method: 'POST' });
      toast.success('Đã đóng buổi điểm danh');
      setClosing(false);
      roster.refresh();
    } catch (loi) {
      toast.error(loi.message);
    }
  }

  const present = summary.present + summary.late;

  return (
    <>
      <DauTrang
        back={
          <Link
            to={`/classes/${classId}?tab=sessions`}
            onClick={chanKhiRoiTrang(`/classes/${classId}?tab=sessions`)}
            className="back-link"
          >
            <ArrowLeft size={16} />
            {lop.data ? `${lop.data.code} · ${lop.data.name}` : 'Quay lại lớp'}
          </Link>
        }
        title={session.title}
        subtitle={`Mở lúc ${dinhDangNgayGio(session.openedAt)}${session.closedAt ? ` · đóng lúc ${dinhDangGio(session.closedAt)}` : ''}`}
        actions={
          isOpen ? (
            <button className="btn btn-danger" onClick={() => setClosing(true)}>
              <Lock size={16} />
              Đóng buổi điểm danh
            </button>
          ) : (
            <NhanTrangThai tone="" icon={Lock}>
              Đã đóng
            </NhanTrangThai>
          )
        }
      />

      <div className={isOpen ? 'qr-stage' : ''}>
        {isOpen && (
          <KhungQr
            sessionId={maBuoi}
            session={session}
            lateMinutes={roster.data.lateMinutes}
          />
        )}

        <div className="stack">
          {!isOpen && (
            <div className="alert" style={{ alignItems: 'flex-start' }}>
              <Pencil size={18} style={{ flex: 'none', marginTop: 1 }} />
              <span className="small">
                Buổi đã đóng nên sinh viên không quét QR được nữa. Bạn đến muộn hoặc cần
                chỉnh lại thì <b>bấm vào trạng thái</b> của sinh viên ở danh sách bên dưới
                để sửa tay (ví dụ chọn "Đi muộn"), rồi bấm <b>Lưu thay đổi</b>.
              </span>
            </div>
          )}
          <The>
            <div
              className="row"
              style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}
            >
              <div>
                <div className="small text-2 row" style={{ gap: 6 }}>
                  {isOpen && <Radio size={14} color="var(--good)" />}Đã có mặt
                </div>
                <div className="big-count num">
                  {present}
                  <span
                    className="muted"
                    style={{ fontSize: '0.4em', fontWeight: 600, letterSpacing: 0 }}
                  >
                    {' '}
                    / {summary.total}
                  </span>
                </div>
              </div>
              <div className="bar" style={{ width: 'min(46%, 220px)', marginBottom: 8 }}>
                <span
                  style={{
                    width: `${summary.total ? (present / summary.total) * 100 : 0}%`,
                    background: 'var(--good)',
                  }}
                />
              </div>
            </div>
            <div className="count-grid" style={{ marginTop: 16 }}>
              {THU_TU_TRANG_THAI.map((trangThai) => {
                const thongTin = TRANG_THAI[trangThai];
                return (
                  <button
                    key={trangThai}
                    className="count-cell"
                    style={{
                      cursor: 'pointer',
                      outline: filter === trangThai ? '2px solid var(--accent)' : 'none',
                      font: 'inherit',
                      color: 'inherit',
                    }}
                    onClick={() => setFilter(filter === trangThai ? 'all' : trangThai)}
                    title={`Lọc: ${thongTin.label}`}
                  >
                    <b className="num">{summary[trangThai]}</b>
                    <span>
                      <thongTin.icon size={12} color={`var(${thongTin.cssVar})`} />
                      {thongTin.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </The>

          <section className="card table-card">
            <div className="toolbar">
              <div className="grow">
                <h2>Danh sách điểm danh</h2>
                {isOpen && (
                  <div className="xs muted">
                    Bấm vào trạng thái để sửa tay, rồi bấm Lưu thay đổi
                  </div>
                )}
              </div>
              <div className="input-icon" style={{ width: 200 }}>
                <Search size={16} />
                <input
                  className="input"
                  placeholder="Tìm sinh viên"
                  value={tuKhoa}
                  onChange={(suKien) => datTuKhoa(suKien.target.value)}
                />
              </div>
            </div>
            <div className="roster list">
              {list.map((sinhVien) => (
                <div
                  className={`list-item ${staged.map[sinhVien.email] !== undefined ? 'staged-row' : ''}`}
                  key={sinhVien.email}
                  style={{ padding: '10px 16px' }}
                >
                  <AnhDaiDien name={sinhVien.fullName} />
                  <div className="grow">
                    <div className="bold truncate">{sinhVien.fullName}</div>
                    <div className="xs muted">
                      {sinhVien.studentCode}
                      {sinhVien.checkedAt && ` · ${dinhDangGio(sinhVien.checkedAt)}`}
                      {sinhVien.source === 'qr' && ' · quét QR'}
                      {sinhVien.source === 'request' && ' · theo đơn'}
                    </div>
                  </div>
                  <MenuTrangThai
                    status={staged.map[sinhVien.email] ?? sinhVien.status}
                    dirty={staged.map[sinhVien.email] !== undefined}
                    onChange={(trangThai) => staged.set(sinhVien.email, sinhVien.status, trangThai)}
                  />
                </div>
              ))}
              {list.length === 0 && (
                <div className="center muted" style={{ padding: 32 }}>
                  Không có sinh viên nào
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      <ThanhLuuThayDoi
        count={staged.count}
        onDiscard={staged.clear}
        onSave={() => setConfirming(true)}
      />

      {confirming && (
        <HopThoaiXacNhanLuu
          items={changeItems}
          busy={saving}
          onConfirm={luuThayDoi}
          onClose={() => setConfirming(false)}
        />
      )}
      {leaveTo && (
        <HopThoaiXacNhan
          title="Bỏ thay đổi chưa lưu?"
          message={`Bạn còn ${staged.count} thay đổi chưa lưu. Rời trang sẽ mất các thay đổi này.`}
          confirmText="Bỏ thay đổi và rời đi"
          cancelText="Ở lại để lưu"
          danger
          onConfirm={() => {
            staged.clear();
            chuyenTrang(leaveTo);
          }}
          onClose={() => setLeaveTo(null)}
        />
      )}
      {closing && (
        <HopThoai
          title="Đóng buổi điểm danh?"
          onClose={() => setClosing(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setClosing(false)}>
                Huỷ
              </button>
              <button className="btn btn-primary" onClick={dongBuoi}>
                Đóng buổi
              </button>
            </>
          }
        >
          <p className="text-2">
            Sinh viên chưa điểm danh sẽ được tính là <b>vắng</b>. Bạn vẫn có thể sửa tay
            từng sinh viên sau khi đóng.
          </p>
        </HopThoai>
      )}
    </>
  );
}
