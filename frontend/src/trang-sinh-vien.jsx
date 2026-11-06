// Các trang của sinh viên: lớp của tôi, lịch sử điểm danh + xin vắng, quét QR.

import { Html5Qrcode } from 'html5-qrcode';
import { ArrowLeft, ArrowRight, CalendarCheck, Camera, CameraOff, CheckCircle2, ChevronRight, Clock, FilePlus2, GraduationCap, ImagePlus, Keyboard, MapPin, ScanLine, ShieldAlert, UserRound, X, XCircle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from './api.js';
import { useXacThuc } from './ngu-canh.jsx';
import { SoAnhDinhKem, NhanTrangThai, VongXoayNut, The, TrangRong, KhungLoi, TruongNhap, DangTai, HopThoai, DauTrang, AnhThuNhoDon, VongTiLe, VongXoay, NhanTrangThaiDiemDanh, nenAnh, dinhDangNgayGio, dinhDangDungLuong, dinhDangGio, phanTram, useTaiDuLieu, useThongBao } from './thanh-phan.jsx';

// ============ Trang chủ sinh viên ============

export function TrangChuSinhVien() {
  const { user } = useXacThuc();
  const data = useTaiDuLieu(async () => {
    const classes = await api('/account/classes');
    // Với mỗi lớp lấy thêm tỉ lệ đi học và số buổi vắng của chính mình
    return Promise.all(classes.map(async (c) => {
      try { return { ...c, me: await api(`/attendance/classes/${c.id}/me`) }; } catch { return { ...c, me: null }; }
    }));
  }, []);

  if (data.loading) return <DangTai />;
  if (data.error) return <KhungLoi message={data.error} onRetry={data.reload} />;

  return (
    <>
      <DauTrang title={`Xin chào, ${user.name.split(' ').slice(-1)[0]}`} subtitle="Các lớp bạn đang học và tình hình đi học của bạn." />

      <Link to="/scan" className="card card-hover card-pad row wrap" style={{ background: 'linear-gradient(135deg, #2a78d6, #184f95)', color: '#fff', border: 0, gap: 16, marginBottom: 28 }}>
        <div className="feature-icon" style={{ width: 48, height: 48 }}><ScanLine size={24} /></div>
        <div className="grow">
          <h2 style={{ color: '#fff' }}>Quét QR điểm danh</h2>
          <p style={{ opacity: 0.85, fontSize: 14 }}>Giảng viên đang chiếu mã? Bấm vào đây để quét ngay.</p>
        </div>
        <ChevronRight />
      </Link>

      <h2 style={{ marginBottom: 14 }}>Lớp của tôi</h2>
      {data.data.length === 0 ? (
        <div className="card"><TrangRong icon={GraduationCap} title="Bạn chưa thuộc lớp nào">Giảng viên cần thêm email <b>{user.email}</b> vào danh sách lớp thì bạn mới thấy lớp ở đây.</TrangRong></div>
      ) : (
        <div className="grid-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
          {data.data.map((c) => {
            const sum = c.me?.summary;
            const limit = Math.floor((c.total_sessions * c.max_absent_percent) / 100);
            const danger = sum && sum.absent >= limit && limit > 0;
            return (
              <Link key={c.id} to={`/classes/${c.id}`} className="card card-hover class-card">
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <div className="grow">
                    <span className="class-code">{c.code}</span>
                    <h3 style={{ marginTop: 8, fontSize: 16 }}>{c.name}</h3>
                  </div>
                  <VongTiLe value={sum?.rate ?? null} size={60} />
                </div>
                <div className="row wrap small text-2" style={{ gap: 16 }}>
                  <span className="row" style={{ gap: 6 }}><UserRound size={15} />{c.teacher_name}</span>
                  {c.room && <span className="row" style={{ gap: 6 }}><MapPin size={15} />{c.room}</span>}
                </div>
                <div className="row between" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                  {sum ? (
                    danger
                      ? <NhanTrangThai tone="critical" icon={ShieldAlert}>Vắng {sum.absent}/{limit} buổi · nguy cơ cấm thi</NhanTrangThai>
                      : <NhanTrangThai tone={sum.absent ? 'warning' : 'good'}>Vắng {sum.absent}/{limit} buổi cho phép</NhanTrangThai>
                  ) : <span className="small muted">Chưa có dữ liệu</span>}
                  <ChevronRight size={18} className="muted" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

// ============ Lịch sử điểm danh và xin vắng ============

const TRANG_THAI_DON = { pending: ['warning', 'Đơn chờ duyệt'], approved: ['good', 'Đơn đã duyệt'], rejected: ['critical', 'Đơn bị từ chối'] };
const TOI_DA_ANH = 3;

/* Hộp thoại gửi đơn xin vắng kèm ảnh minh chứng */
function HopThoaiXinVang({ classId, session, onClose, onSent }) {
  const toast = useThongBao();
  const inputRef = useRef(null);
  const [reason, setReason] = useState('');
  const [files, setFiles] = useState([]); // [{ file, url }]
  const [busy, setBusy] = useState(false);

  async function themAnh(e) {
    const picked = [...(e.target.files || [])];
    e.target.value = '';
    const room = TOI_DA_ANH - files.length;
    if (picked.length > room) toast.info(`Chỉ đính kèm tối đa ${TOI_DA_ANH} ảnh`);
    try {
      const compressed = await Promise.all(picked.slice(0, room).map(nenAnh));
      setFiles((cur) => [...cur, ...compressed.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
    } catch (err) { toast.error(err.message); }
  }
  const boAnh = (i) => setFiles((cur) => { URL.revokeObjectURL(cur[i].url); return cur.filter((_, k) => k !== i); });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('classId', classId);
      fd.append('sessionId', session.sessionId);
      fd.append('reason', reason);
      files.forEach(({ file }) => fd.append('files', file));
      await api('/attendance/requests', { method: 'POST', form: fd });
      toast.success('Đã gửi đơn xin vắng');
      onSent();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  }

  return (
    <HopThoai title={`Xin vắng buổi ${session.sessionNo}`} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <p className="small text-2">{session.title} · {dinhDangNgayGio(session.openedAt)}</p>
        <TruongNhap label="Lý do">
          <textarea className="textarea" required autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD: Em bị ốm, có giấy khám bệnh đính kèm ạ." />
        </TruongNhap>

        <TruongNhap label={`Ảnh minh chứng (${files.length}/${TOI_DA_ANH})`} hint="Giấy khám bệnh, giấy xác nhận… Ảnh được tự động nén trước khi gửi. Không bắt buộc.">
          {files.length > 0 && (
            <div className="preview-grid">
              {files.map((f, i) => (
                <div className="preview" key={f.url}>
                  <img src={f.url} alt={`Ảnh ${i + 1}`} />
                  <button type="button" className="preview-remove" onClick={() => boAnh(i)} aria-label="Bỏ ảnh này"><X size={14} /></button>
                  <span className="preview-size">{dinhDangDungLuong(f.file.size)}</span>
                </div>
              ))}
            </div>
          )}
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={themAnh} />
          <button type="button" className="dropzone" onClick={() => inputRef.current.click()} disabled={files.length >= TOI_DA_ANH}>
            <ImagePlus size={20} />{files.length ? 'Thêm ảnh' : 'Chọn ảnh hoặc chụp ảnh'}
          </button>
        </TruongNhap>

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Huỷ</button>
          <button className="btn btn-primary" disabled={busy}>{busy && <VongXoayNut />}Gửi đơn</button>
        </div>
      </form>
    </HopThoai>
  );
}

export function TrangLopCuaSinhVien() {
  const { id } = useParams();
  const data = useTaiDuLieu(() => api(`/attendance/classes/${id}/me`), [id]);
  const [target, setTarget] = useState(null);

  if (data.loading) return <DangTai />;
  if (data.error) return <KhungLoi message={data.error} onRetry={data.reload} />;
  const { class: c, summary, history, student } = data.data;
  const limit = Math.floor((c.totalSessions * c.maxAbsentPercent) / 100);
  const used = Math.min(100, limit ? (summary.absent / limit) * 100 : summary.absent ? 100 : 0);
  const over = summary.absent > limit;
  const near = !over && limit > 0 && summary.absent >= limit;

  return (
    <>
      <DauTrang
        back={<Link to="/" className="back-link"><ArrowLeft size={16} />Lớp của tôi</Link>}
        title={c.name}
        subtitle={<span className="row wrap" style={{ gap: 12 }}><span className="class-code">{c.code}</span><span>{student.full_name} · {student.student_code}</span></span>}
      />

      {/* Một thẻ duy nhất: tình trạng giới hạn vắng + 3 con số chính */}
      <section className="card summary-card">
        <div className="summary-main">
          <div className="row between wrap">
            <span className="small text-2 bold">Vắng không phép</span>
            {over ? <NhanTrangThai tone="critical" icon={ShieldAlert}>Đã vượt giới hạn</NhanTrangThai> : near ? <NhanTrangThai tone="serious" icon={ShieldAlert}>Sắp bị cấm thi</NhanTrangThai> : <NhanTrangThai tone="good">An toàn</NhanTrangThai>}
          </div>
          <div style={{ margin: '10px 0 14px' }}>
            <span className="big-count num" style={{ fontSize: 44 }}>{summary.absent}</span>
            <span className="muted bold" style={{ fontSize: 20 }}> / {limit} buổi cho phép</span>
          </div>
          <div className={`bar ${over ? 'critical' : used >= 66 ? 'warning' : 'good'}`}><span style={{ width: `${used}%` }} /></div>
          <p className="small muted" style={{ marginTop: 10 }}>Lớp cho phép vắng tối đa {c.maxAbsentPercent}% trong {c.totalSessions} buổi. Có lý do chính đáng thì gửi đơn xin vắng để giảng viên duyệt.</p>
        </div>
        <div className="summary-side">
          <div><b className="num">{phanTram(summary.rate)}</b><span>Tỉ lệ đi học</span></div>
          <div><b className="num">{summary.present + summary.late}</b><span>Có mặt{summary.late ? ` (${summary.late} trễ)` : ''}</span></div>
          <div><b className="num">{summary.excused}</b><span>Vắng có phép</span></div>
        </div>
      </section>

      <div className="section-title"><h2>Lịch sử điểm danh</h2><p>{summary.sessions} buổi đã học</p></div>
      <The pad={false}>
        {history.length === 0 ? (
          <TrangRong icon={CalendarCheck} title="Chưa có buổi học nào" />
        ) : (
          <div className="list">
            {history.map((h) => (
              <div className="timeline-item" key={h.sessionId} style={{ alignItems: 'flex-start' }}>
                <div className="timeline-no">{h.sessionNo}</div>
                <div className="grow">
                  <div className="bold">{h.title}</div>
                  <div className="small muted">{dinhDangNgayGio(h.openedAt)}</div>
                  {h.request && (
                    <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                      <NhanTrangThai tone={TRANG_THAI_DON[h.request.status][0]}>{TRANG_THAI_DON[h.request.status][1]}</NhanTrangThai>
                      <SoAnhDinhKem count={h.request.files.length} />
                    </div>
                  )}
                  {h.request?.teacherNote && <p className="small text-2" style={{ marginTop: 8 }}><b>Giảng viên:</b> {h.request.teacherNote}</p>}
                  {h.request && <AnhThuNhoDon request={h.request} />}
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <NhanTrangThaiDiemDanh status={h.attendance} />
                  {h.attendance === 'absent' && !h.request && (
                    <button className="btn btn-secondary btn-sm" onClick={() => setTarget(h)}><FilePlus2 size={15} /><span className="hide-sm">Xin vắng</span></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </The>

      {target && <HopThoaiXinVang classId={Number(id)} session={target} onClose={() => setTarget(null)} onSent={() => { setTarget(null); data.refresh(); }} />}
    </>
  );
}

// ============ Quét mã QR điểm danh ============

// Lấy mã điểm danh từ nội dung QR (đường link /scan?t=... hoặc chính mã)
function layMaTuQr(text) {
  const raw = String(text || '').trim();
  try { const t = new URL(raw).searchParams.get('t'); if (t) return t; } catch { /* không phải URL */ }
  return raw;
}

export function TrangQuetQr() {
  const { user } = useXacThuc();
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

  async function batCamera() {
    setError(''); setPhase('scanning');
    await new Promise((r) => setTimeout(r, 50)); // chờ khung #qr-reader hiện ra
    try {
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * 0.72); return { width: s, height: s }; } },
        (text) => submit(layMaTuQr(text)),
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
    return <div className="card"><TrangRong icon={Camera} title="Chỉ dành cho sinh viên">Trang này dùng để sinh viên quét QR điểm danh. Giảng viên hãy mở buổi học để chiếu mã.</TrangRong></div>;
  }

  return (
    <>
      <DauTrang title="Quét QR điểm danh" subtitle="Hướng camera vào mã QR mà giảng viên đang chiếu." />

      <div style={{ maxWidth: 520, margin: '0 auto' }} className="stack">
        {phase === 'sending' && <div className="card card-pad center stack" style={{ alignItems: 'center', padding: 48 }}><VongXoay /><b>Đang điểm danh…</b></div>}

        {phase === 'done' && result && (
          <div className="card scan-result">
            <div className={`scan-icon pop-check ${result.alreadyCheckedIn ? 'warning' : 'good'}`}>
              {result.alreadyCheckedIn ? <Clock size={44} /> : <CheckCircle2 size={44} />}
            </div>
            <h1 style={{ fontSize: 24 }}>{result.alreadyCheckedIn ? 'Bạn đã điểm danh rồi' : result.status === 'late' ? 'Điểm danh thành công (đi trễ)' : 'Điểm danh thành công!'}</h1>
            <p className="text-2" style={{ marginTop: 8 }}>{result.classCode} · {result.className}</p>
            <p className="text-2">{result.title} · lúc {dinhDangGio(result.checkedAt)}</p>
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
              <button className="btn btn-primary" onClick={() => { reset(); batCamera(); }}><Camera size={16} />Quét lại</button>
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
                : <button className="btn btn-primary btn-lg btn-block" onClick={batCamera}><Camera size={18} />Mở camera quét QR</button>}
            </div>

            <form className="card card-pad stack" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) submit(layMaTuQr(manual)); }}>
              <div className="row"><Keyboard size={18} className="muted" /><b>Không quét được?</b></div>
              <TruongNhap label="Dán liên kết hoặc mã điểm danh" hint="Mã QR đổi mỗi 30 giây nên cần dán ngay khi có.">
                <div className="row">
                  <input className="input" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="https://… hoặc 12.58000123.abc…" />
                  <button className="btn btn-secondary" disabled={!manual.trim()}><ArrowRight size={16} /></button>
                </div>
              </TruongNhap>
            </form>
          </>
        )}
      </div>
    </>
  );
}
