// Trang điểm danh của một buổi: mã QR tự đổi + danh sách sinh viên.

import { ArrowLeft, Check, Copy, Lock, Maximize2, Pencil, Radio, Search, Smartphone } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from './api.js';
import { AnhDaiDien, NhanTrangThai, The, HopThoaiXacNhanLuu, HopThoaiXacNhan, KhungLoi, DangTai, HopThoai, DauTrang, TRANG_THAI, ThanhLuuThayDoi, MenuTrangThai, dinhDangNgayGio, dinhDangGio, useTaiDuLieu, useThayDoiChuaLuu, useThongBao, useCanhBaoChuaLuu } from './thanh-phan.jsx';

const THU_TU_TRANG_THAI = ['present', 'late', 'excused', 'absent'];

/* Đồng hồ đếm ngược quanh số giây còn lại của mã QR */
function DongHoDemNguoc({ remaining, ttl }) {
  const size = 52, stroke = 5, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, remaining / ttl));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={remaining < 6 ? 'var(--serious)' : 'var(--accent)'} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} />
      </svg>
      <span className="ring-label num" style={{ fontSize: 16 }}>{Math.ceil(remaining)}</span>
    </div>
  );
}

function KhungQr({ sessionId, session, lateMinutes }) {
  const toast = useThongBao();
  const canvasRef = useRef(null);
  const panelRef = useRef(null);
  const offset = useRef(0); // chênh lệch giờ giữa máy chủ và máy này
  const [qr, setQr] = useState(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);

  // Lấy mã QR mới ngay khi mã cũ sắp hết hạn
  useEffect(() => {
    let cancelled = false;
    let timer;
    async function tick() {
      try {
        const r = await api(`/sessions/sessions/${sessionId}/qr`);
        if (cancelled) return;
        offset.current = r.serverTime - Date.now();
        setQr(r); setError('');
        timer = setTimeout(tick, Math.max(400, r.expiresAt - (Date.now() + offset.current) + 150));
      } catch (e) {
        if (cancelled) return;
        setError(e.message);
        timer = setTimeout(tick, 3000);
      }
    }
    tick();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [sessionId]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

  // Mã QR chứa đường link: quét bằng camera điện thoại là mở thẳng trang điểm danh
  const url = qr ? `${window.location.origin}/scan?t=${encodeURIComponent(qr.token)}` : '';
  useEffect(() => {
    if (url && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, url, { width: 720, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b0b0b', light: '#ffffff' } });
    }
  }, [url]);

  const remaining = qr ? Math.max(0, (qr.expiresAt - (now + offset.current)) / 1000) : 0;

  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600); toast.success('Đã sao chép liên kết điểm danh'); }
    catch { toast.error('Không sao chép được'); }
  }

  return (
    <section className="card qr-panel" ref={panelRef}>
      <div className="row between" style={{ alignSelf: 'stretch' }}>
        <NhanTrangThai tone="live"><span className="dot pulse" />Đang điểm danh</NhanTrangThai>
        <span className="small muted">{session.title}</span>
      </div>

      <div className="qr-frame">
        {error && !qr ? <div style={{ width: 300, height: 300, display: 'grid', placeItems: 'center' }}><KhungLoi message={error} /></div> : <canvas ref={canvasRef} aria-label="Mã QR điểm danh" />}
      </div>

      <div className="qr-timer">
        <DongHoDemNguoc remaining={remaining} ttl={qr?.ttl || 30} />
        <div style={{ textAlign: 'left' }}>
          <div className="bold">Mã tự đổi sau {Math.ceil(remaining)} giây</div>
          <div className="small muted">Chống chụp ảnh gửi bạn điểm danh hộ</div>
        </div>
      </div>

      <div className="alert" style={{ alignSelf: 'stretch', textAlign: 'left', alignItems: 'center' }}>
        <Smartphone size={18} style={{ flex: 'none' }} />
        <span className="small">Sinh viên mở camera điện thoại quét mã, đăng nhập bằng email của lớp là điểm danh xong.{lateMinutes ? ` Quét sau ${lateMinutes} phút kể từ lúc mở buổi sẽ tự tính là đi muộn.` : ''}</span>
      </div>

      <div className="row wrap" style={{ justifyContent: 'center' }}>
        <button className="btn btn-secondary" onClick={() => panelRef.current?.requestFullscreen?.()}><Maximize2 size={16} />Chiếu toàn màn hình</button>
        <button className="btn btn-ghost" onClick={copy}>{copied ? <Check size={16} /> : <Copy size={16} />}Sao chép liên kết</button>
      </div>
    </section>
  );
}

export function TrangBuoiDiemDanh() {
  const { id: classId, sid } = useParams();
  const toast = useThongBao();
  const cls = useTaiDuLieu(() => api(`/account/classes/${classId}`), [classId]);
  const roster = useTaiDuLieu(() => api(`/attendance/sessions/${sid}/roster`), [sid]);
  const [q, setQ] = useState('');
  const [closing, setClosing] = useState(false);
  const [filter, setFilter] = useState('all');
  const nav = useNavigate();
  const staged = useThayDoiChuaLuu(); // thay đổi sửa tay chưa lưu: email -> trạng thái mới
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [leaveTo, setLeaveTo] = useState(null); // đường dẫn muốn rời đi khi còn thay đổi chưa lưu
  useCanhBaoChuaLuu(staged.count > 0);

  const isOpen = roster.data?.session.status === 'open';

  // Buổi đang mở: cập nhật danh sách mỗi 4 giây để thấy sinh viên điểm danh trực tiếp
  useEffect(() => {
    if (!isOpen) return undefined;
    const t = setInterval(roster.refresh, 4000);
    return () => clearInterval(t);
  }, [isOpen, roster.refresh]);

  const list = useMemo(() => {
    if (!roster.data) return [];
    return roster.data.roster
      .filter((s) => (filter === 'all' || (staged.map[s.email] ?? s.status) === filter) && `${s.fullName} ${s.studentCode}`.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => (b.checkedAt ? new Date(b.checkedAt) : 0) - (a.checkedAt ? new Date(a.checkedAt) : 0) || a.studentCode.localeCompare(b.studentCode));
  }, [roster.data, q, filter, staged.map]);

  if (roster.loading && !roster.data) return <DangTai />;
  if (roster.error && !roster.data) return <KhungLoi message={roster.error} onRetry={roster.reload} />;
  const { session, summary } = roster.data;

  // Danh sách thay đổi để hiển thị trong hộp xác nhận
  const changeItems = roster.data.roster
    .filter((s) => staged.map[s.email] !== undefined)
    .map((s) => ({ id: s.email, title: s.fullName, sub: s.studentCode, from: s.status, to: staged.map[s.email] }));

  async function luuThayDoi() {
    setSaving(true);
    try {
      const changes = changeItems.map((c) => ({ sessionId: Number(sid), email: c.id, status: c.to }));
      const r = await api(`/attendance/classes/${classId}/changes`, { method: 'POST', body: { changes } });
      toast.success(`Đã lưu ${r.applied} thay đổi điểm danh`);
      staged.clear();
      setConfirming(false);
      roster.refresh();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }
  // Rời trang: nếu còn thay đổi chưa lưu thì hỏi lại
  const chanKhiRoiTrang = (to) => (e) => { if (staged.count > 0) { e.preventDefault(); setLeaveTo(to); } };

  async function dongBuoi() {
    try {
      await api(`/sessions/sessions/${sid}/close`, { method: 'POST' });
      toast.success('Đã đóng buổi điểm danh');
      setClosing(false);
      roster.refresh();
    } catch (e) { toast.error(e.message); }
  }

  const present = summary.present + summary.late;

  return (
    <>
      <DauTrang
        back={<Link to={`/classes/${classId}?tab=sessions`} onClick={chanKhiRoiTrang(`/classes/${classId}?tab=sessions`)} className="back-link"><ArrowLeft size={16} />{cls.data ? `${cls.data.code} · ${cls.data.name}` : 'Quay lại lớp'}</Link>}
        title={session.title}
        subtitle={`Mở lúc ${dinhDangNgayGio(session.openedAt)}${session.closedAt ? ` · đóng lúc ${dinhDangGio(session.closedAt)}` : ''}`}
        actions={isOpen
          ? <button className="btn btn-danger" onClick={() => setClosing(true)}><Lock size={16} />Đóng buổi điểm danh</button>
          : <NhanTrangThai tone="" icon={Lock}>Đã đóng</NhanTrangThai>}
      />

      <div className={isOpen ? 'qr-stage' : ''}>
        {isOpen && <KhungQr sessionId={sid} session={session} lateMinutes={roster.data.lateMinutes} />}

        <div className="stack">
          {!isOpen && (
            <div className="alert" style={{ alignItems: 'flex-start' }}>
              <Pencil size={18} style={{ flex: 'none', marginTop: 1 }} />
              <span className="small">Buổi đã đóng nên sinh viên không quét QR được nữa. Bạn đến muộn hoặc cần chỉnh lại thì <b>bấm vào trạng thái</b> của sinh viên ở danh sách bên dưới để sửa tay (ví dụ chọn "Đi muộn"), rồi bấm <b>Lưu thay đổi</b>.</span>
            </div>
          )}
          <The>
            <div className="row" style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <div>
                <div className="small text-2 row" style={{ gap: 6 }}>{isOpen && <Radio size={14} color="var(--good)" />}Đã có mặt</div>
                <div className="big-count num">{present}<span className="muted" style={{ fontSize: '0.4em', fontWeight: 600, letterSpacing: 0 }}> / {summary.total}</span></div>
              </div>
              <div className="bar" style={{ width: 'min(46%, 220px)', marginBottom: 8 }}><span style={{ width: `${summary.total ? (present / summary.total) * 100 : 0}%`, background: 'var(--good)' }} /></div>
            </div>
            <div className="count-grid" style={{ marginTop: 16 }}>
              {THU_TU_TRANG_THAI.map((k) => {
                const S = TRANG_THAI[k];
                return (
                  <button key={k} className="count-cell" style={{ cursor: 'pointer', outline: filter === k ? '2px solid var(--accent)' : 'none', font: 'inherit', color: 'inherit' }} onClick={() => setFilter(filter === k ? 'all' : k)} title={`Lọc: ${S.label}`}>
                    <b className="num">{summary[k]}</b>
                    <span><S.icon size={12} color={`var(${S.cssVar})`} />{S.label}</span>
                  </button>
                );
              })}
            </div>
          </The>

          <section className="card table-card">
            <div className="toolbar">
              <div className="grow"><h2>Danh sách điểm danh</h2>{isOpen && <div className="xs muted">Bấm vào trạng thái để sửa tay, rồi bấm Lưu thay đổi</div>}</div>
              <div className="input-icon" style={{ width: 200 }}><Search size={16} /><input className="input" placeholder="Tìm sinh viên" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            </div>
            <div className="roster list">
              {list.map((s) => (
                <div className={`list-item ${staged.map[s.email] !== undefined ? 'staged-row' : ''}`} key={s.email} style={{ padding: '10px 16px' }}>
                  <AnhDaiDien name={s.fullName} />
                  <div className="grow">
                    <div className="bold truncate">{s.fullName}</div>
                    <div className="xs muted">{s.studentCode}{s.checkedAt && ` · ${dinhDangGio(s.checkedAt)}`}{s.source === 'qr' && ' · quét QR'}{s.source === 'request' && ' · theo đơn'}</div>
                  </div>
                  <MenuTrangThai status={staged.map[s.email] ?? s.status} dirty={staged.map[s.email] !== undefined} onChange={(k) => staged.set(s.email, s.status, k)} />
                </div>
              ))}
              {list.length === 0 && <div className="center muted" style={{ padding: 32 }}>Không có sinh viên nào</div>}
            </div>
          </section>
        </div>
      </div>

      <ThanhLuuThayDoi count={staged.count} onDiscard={staged.clear} onSave={() => setConfirming(true)} />

      {confirming && <HopThoaiXacNhanLuu items={changeItems} busy={saving} onConfirm={luuThayDoi} onClose={() => setConfirming(false)} />}
      {leaveTo && (
        <HopThoaiXacNhan
          title="Bỏ thay đổi chưa lưu?"
          message={`Bạn còn ${staged.count} thay đổi chưa lưu. Rời trang sẽ mất các thay đổi này.`}
          confirmText="Bỏ thay đổi và rời đi" cancelText="Ở lại để lưu" danger
          onConfirm={() => { staged.clear(); nav(leaveTo); }}
          onClose={() => setLeaveTo(null)}
        />
      )}
      {closing && (
        <HopThoai title="Đóng buổi điểm danh?" onClose={() => setClosing(false)} footer={
          <>
            <button className="btn btn-secondary" onClick={() => setClosing(false)}>Huỷ</button>
            <button className="btn btn-primary" onClick={dongBuoi}>Đóng buổi</button>
          </>
        }>
          <p className="text-2">Sinh viên chưa điểm danh sẽ được tính là <b>vắng</b>. Bạn vẫn có thể sửa tay từng sinh viên sau khi đóng.</p>
        </HopThoai>
      )}
    </>
  );
}
