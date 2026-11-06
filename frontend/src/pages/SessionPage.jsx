import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { ArrowLeft, Maximize2, Copy, Lock, Search, Radio, Smartphone, Check } from 'lucide-react';
import { api } from '../api.js';
import { Card, PageHead, Loading, ErrorBox, Modal, Badge, Avatar, useLoad, useToast, fmtDateTime, fmtTime, STATUS } from '../components/ui.jsx';

const ORDER = ['present', 'late', 'excused', 'absent'];

/* Đồng hồ đếm ngược quanh số giây còn lại của mã QR */
function Countdown({ remaining, ttl }) {
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

function QrPanel({ sessionId, session }) {
  const toast = useToast();
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
        <Badge tone="live"><span className="dot pulse" />Đang điểm danh</Badge>
        <span className="small muted">{session.title}</span>
      </div>

      <div className="qr-frame">
        {error && !qr ? <div style={{ width: 300, height: 300, display: 'grid', placeItems: 'center' }}><ErrorBox message={error} /></div> : <canvas ref={canvasRef} aria-label="Mã QR điểm danh" />}
      </div>

      <div className="qr-timer">
        <Countdown remaining={remaining} ttl={qr?.ttl || 30} />
        <div style={{ textAlign: 'left' }}>
          <div className="bold">Mã tự đổi sau {Math.ceil(remaining)} giây</div>
          <div className="small muted">Chống chụp ảnh gửi bạn điểm danh hộ</div>
        </div>
      </div>

      <div className="alert" style={{ alignSelf: 'stretch', textAlign: 'left', alignItems: 'center' }}>
        <Smartphone size={18} style={{ flex: 'none' }} />
        <span className="small">Sinh viên mở camera điện thoại quét mã, đăng nhập bằng email của lớp là điểm danh xong.</span>
      </div>

      <div className="row wrap" style={{ justifyContent: 'center' }}>
        <button className="btn btn-secondary" onClick={() => panelRef.current?.requestFullscreen?.()}><Maximize2 size={16} />Chiếu toàn màn hình</button>
        <button className="btn btn-ghost" onClick={copy}>{copied ? <Check size={16} /> : <Copy size={16} />}Sao chép liên kết</button>
      </div>
    </section>
  );
}

export default function SessionPage() {
  const { id: classId, sid } = useParams();
  const toast = useToast();
  const cls = useLoad(() => api(`/account/classes/${classId}`), [classId]);
  const roster = useLoad(() => api(`/attendance/sessions/${sid}/roster`), [sid]);
  const [q, setQ] = useState('');
  const [closing, setClosing] = useState(false);
  const [filter, setFilter] = useState('all');

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
      .filter((s) => (filter === 'all' || s.status === filter) && `${s.fullName} ${s.studentCode}`.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => (b.checkedAt ? new Date(b.checkedAt) : 0) - (a.checkedAt ? new Date(a.checkedAt) : 0) || a.studentCode.localeCompare(b.studentCode));
  }, [roster.data, q, filter]);

  if (roster.loading && !roster.data) return <Loading />;
  if (roster.error && !roster.data) return <ErrorBox message={roster.error} onRetry={roster.reload} />;
  const { session, summary } = roster.data;

  async function setStatus(s, status) {
    try {
      await api(`/attendance/sessions/${sid}/students/${encodeURIComponent(s.email)}`, { method: 'PUT', body: { status } });
      roster.refresh();
    } catch (e) { toast.error(e.message); }
  }
  async function closeSession() {
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
      <PageHead
        back={<Link to={`/classes/${classId}?tab=sessions`} className="back-link"><ArrowLeft size={16} />{cls.data ? `${cls.data.code} · ${cls.data.name}` : 'Quay lại lớp'}</Link>}
        title={session.title}
        subtitle={`Mở lúc ${fmtDateTime(session.openedAt)}${session.closedAt ? ` · đóng lúc ${fmtTime(session.closedAt)}` : ''}`}
        actions={isOpen
          ? <button className="btn btn-danger" onClick={() => setClosing(true)}><Lock size={16} />Đóng buổi điểm danh</button>
          : <Badge tone="" icon={Lock}>Đã đóng</Badge>}
      />

      <div className={isOpen ? 'qr-stage' : ''}>
        {isOpen && <QrPanel sessionId={sid} session={session} />}

        <div className="stack">
          <Card>
            <div className="row" style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <div>
                <div className="small text-2 row" style={{ gap: 6 }}>{isOpen && <Radio size={14} color="var(--good)" />}Đã có mặt</div>
                <div className="big-count num">{present}<span className="muted" style={{ fontSize: '0.4em', fontWeight: 600, letterSpacing: 0 }}> / {summary.total}</span></div>
              </div>
              <div className="bar" style={{ width: 'min(46%, 220px)', marginBottom: 8 }}><span style={{ width: `${summary.total ? (present / summary.total) * 100 : 0}%`, background: 'var(--good)' }} /></div>
            </div>
            <div className="count-grid" style={{ marginTop: 16 }}>
              {ORDER.map((k) => {
                const S = STATUS[k];
                return (
                  <button key={k} className="count-cell" style={{ cursor: 'pointer', outline: filter === k ? '2px solid var(--accent)' : 'none', font: 'inherit', color: 'inherit' }} onClick={() => setFilter(filter === k ? 'all' : k)} title={`Lọc: ${S.label}`}>
                    <b className="num">{summary[k]}</b>
                    <span><S.icon size={12} color={`var(${S.cssVar})`} />{S.label}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          <section className="card table-card">
            <div className="toolbar">
              <h2 className="grow">Danh sách điểm danh</h2>
              <div className="input-icon" style={{ width: 200 }}><Search size={16} /><input className="input" placeholder="Tìm sinh viên" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            </div>
            <div className="roster list">
              {list.map((s) => (
                <div className="list-item" key={s.email} style={{ padding: '10px 16px' }}>
                  <Avatar name={s.fullName} />
                  <div className="grow">
                    <div className="bold truncate">{s.fullName}</div>
                    <div className="xs muted">{s.studentCode}{s.checkedAt && ` · ${fmtTime(s.checkedAt)}`}{s.source === 'qr' && ' · quét QR'}{s.source === 'manual' && ' · giảng viên sửa'}{s.source === 'request' && ' · theo đơn'}</div>
                  </div>
                  <div className="status-pick" role="group" aria-label={`Trạng thái của ${s.fullName}`}>
                    {ORDER.map((k) => {
                      const S = STATUS[k];
                      return (
                        <button key={k} className={`${k} ${s.status === k && (s.recorded || k === 'absent') ? 'on' : ''}`} title={S.label} aria-label={S.label} aria-pressed={s.status === k} onClick={() => s.status !== k && setStatus(s, k)}>
                          <S.icon size={16} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {list.length === 0 && <div className="center muted" style={{ padding: 32 }}>Không có sinh viên nào</div>}
            </div>
          </section>
        </div>
      </div>

      {closing && (
        <Modal title="Đóng buổi điểm danh?" onClose={() => setClosing(false)} footer={
          <>
            <button className="btn btn-secondary" onClick={() => setClosing(false)}>Huỷ</button>
            <button className="btn btn-primary" onClick={closeSession}>Đóng buổi</button>
          </>
        }>
          <p className="text-2">Sinh viên chưa điểm danh sẽ được tính là <b>vắng</b>. Bạn vẫn có thể sửa tay từng sinh viên sau khi đóng.</p>
        </Modal>
      )}
    </>
  );
}
