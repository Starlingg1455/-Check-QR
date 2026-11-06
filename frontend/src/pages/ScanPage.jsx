import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, CameraOff, CheckCircle2, XCircle, Clock, Keyboard, ArrowRight } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { PageHead, Spinner, Field, Empty, fmtTime } from '../components/ui.jsx';

// Lấy mã điểm danh từ nội dung QR (đường link /scan?t=... hoặc chính mã)
function extractToken(text) {
  const raw = String(text || '').trim();
  try { const t = new URL(raw).searchParams.get('t'); if (t) return t; } catch { /* không phải URL */ }
  return raw;
}

export default function ScanPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [phase, setPhase] = useState('idle'); // idle | scanning | sending | done | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [manual, setManual] = useState('');
  const scannerRef = useRef(null);
  const submitted = useRef(null);

  const stopCamera = useCallback(async () => {
    const s = scannerRef.current;
    scannerRef.current = null;
    if (s) { try { if (s.isScanning) await s.stop(); s.clear(); } catch { /* bỏ qua */ } }
  }, []);

  const submit = useCallback(async (token) => {
    await stopCamera();
    setPhase('sending');
    try {
      setResult(await api('/attendance/scan', { method: 'POST', body: { token } }));
      setPhase('done');
    } catch (e) {
      setError(e.message);
      setPhase('error');
    }
  }, [stopCamera]);

  // Mở link từ camera điện thoại: /scan?t=... => tự điểm danh
  const linkToken = params.get('t');
  useEffect(() => {
    if (linkToken && submitted.current !== linkToken && user.role === 'student') {
      submitted.current = linkToken;
      setParams({}, { replace: true }); // xoá mã khỏi thanh địa chỉ
      submit(linkToken);
    }
  }, [linkToken, submit, setParams, user.role]);

  useEffect(() => () => { stopCamera(); }, [stopCamera]);

  async function startCamera() {
    setError(''); setPhase('scanning');
    await new Promise((r) => setTimeout(r, 50)); // chờ khung #qr-reader hiện ra
    try {
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * 0.72); return { width: s, height: s }; } },
        (text) => submit(extractToken(text)),
        () => {},
      );
    } catch {
      await stopCamera();
      setError('Không mở được camera. Hãy cho phép truy cập camera (cần HTTPS), hoặc dùng cách nhập mã bên dưới.');
      setPhase('idle');
    }
  }

  function reset() { setPhase('idle'); setResult(null); setError(''); }

  if (user.role !== 'student') {
    return <div className="card"><Empty icon={Camera} title="Chỉ dành cho sinh viên">Trang này dùng để sinh viên quét QR điểm danh. Giảng viên hãy mở buổi học để chiếu mã.</Empty></div>;
  }

  return (
    <>
      <PageHead title="Quét QR điểm danh" subtitle="Hướng camera vào mã QR mà giảng viên đang chiếu." />

      <div style={{ maxWidth: 520, margin: '0 auto' }} className="stack">
        {phase === 'sending' && <div className="card card-pad center stack" style={{ alignItems: 'center', padding: 48 }}><Spinner /><b>Đang điểm danh…</b></div>}

        {phase === 'done' && result && (
          <div className="card scan-result">
            <div className={`scan-icon pop-check ${result.alreadyCheckedIn ? 'warning' : 'good'}`}>
              {result.alreadyCheckedIn ? <Clock size={44} /> : <CheckCircle2 size={44} />}
            </div>
            <h1 style={{ fontSize: 24 }}>{result.alreadyCheckedIn ? 'Bạn đã điểm danh rồi' : result.status === 'late' ? 'Điểm danh thành công (đi trễ)' : 'Điểm danh thành công!'}</h1>
            <p className="text-2" style={{ marginTop: 8 }}>{result.classCode} · {result.className}</p>
            <p className="text-2">{result.title} · lúc {fmtTime(result.checkedAt)}</p>
            <div className="row" style={{ justifyContent: 'center', marginTop: 24 }}>
              <Link to={`/classes/${result.classId}`} className="btn btn-primary">Xem lịch sử của tôi</Link>
              <button className="btn btn-secondary" onClick={reset}>Quét lại</button>
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="card scan-result">
            <div className="scan-icon critical pop-check"><XCircle size={44} /></div>
            <h1 style={{ fontSize: 22 }}>Chưa điểm danh được</h1>
            <p className="text-2" style={{ marginTop: 8 }}>{error}</p>
            <div className="row" style={{ justifyContent: 'center', marginTop: 24 }}>
              <button className="btn btn-primary" onClick={() => { reset(); startCamera(); }}><Camera size={16} />Quét lại</button>
              <Link to="/" className="btn btn-secondary">Về trang chủ</Link>
            </div>
          </div>
        )}

        {(phase === 'idle' || phase === 'scanning') && (
          <>
            <div className="card card-pad stack">
              {phase === 'scanning' ? <div id="qr-reader" /> : (
                <div className="empty" style={{ padding: '28px 0 8px' }}>
                  <div className="empty-icon" style={{ width: 72, height: 72, borderRadius: 22 }}><Camera size={34} /></div>
                  <h3>Sẵn sàng quét</h3>
                  <p>Bấm nút bên dưới để mở camera. Trình duyệt sẽ hỏi quyền truy cập camera.</p>
                </div>
              )}
              {error && <div className="alert error">{error}</div>}
              {phase === 'scanning'
                ? <button className="btn btn-secondary btn-lg btn-block" onClick={async () => { await stopCamera(); setPhase('idle'); }}><CameraOff size={18} />Tắt camera</button>
                : <button className="btn btn-primary btn-lg btn-block" onClick={startCamera}><Camera size={18} />Mở camera quét QR</button>}
            </div>

            <form className="card card-pad stack" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) submit(extractToken(manual)); }}>
              <div className="row"><Keyboard size={18} className="muted" /><b>Không quét được?</b></div>
              <Field label="Dán liên kết hoặc mã điểm danh" hint="Mã QR đổi mỗi 30 giây nên cần dán ngay khi có.">
                <div className="row">
                  <input className="input" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="https://… hoặc 12.58000123.abc…" />
                  <button className="btn btn-secondary" disabled={!manual.trim()}><ArrowRight size={16} /></button>
                </div>
              </Field>
            </form>
          </>
        )}
      </div>
    </>
  );
}
