import { useRef, useState } from 'react';
import { Download, Upload, FileSpreadsheet, ArrowRight, CheckCircle2, XCircle, Info } from 'lucide-react';
import { api, download } from '../../api.js';
import { Modal, StatusBadge, BtnSpinner, useToast } from '../../components/ui.jsx';

const CODES = [
  { code: 'x', text: 'Có mặt (để trống cũng là có mặt)', tone: 'good' },
  { code: 'm', text: 'Đi muộn', tone: 'warning' },
  { code: 'p', text: 'Vắng có phép', tone: 'info' },
  { code: 'v', text: 'Vắng không phép', tone: 'critical' },
];

/* Điểm danh bằng Excel: tải file mẫu, sửa mã, tải lên.
   File phải đồng bộ 100% với hệ thống: có lỗi thì từ chối cả file; hợp lệ thì cho xem trước rồi mới áp dụng. */
export default function ExcelSyncModal({ cls, onClose, onApplied }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [state, setState] = useState({ phase: 'idle' }); // idle | checking | invalid | preview | applying
  const base = `/attendance/classes/${cls.id}/sheet`;

  async function getTemplate() {
    try { await download(`${base}.xlsx`, `diem-danh-${cls.code}.xlsx`); toast.success('Đã tải file điểm danh'); }
    catch (e) { toast.error(e.message); }
  }

  async function check(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setFile(f);
    setState({ phase: 'checking' });
    try {
      const fd = new FormData();
      fd.append('file', f);
      const result = await api(`${base}/import?dryRun=1`, { method: 'POST', form: fd });
      setState({ phase: 'preview', result });
    } catch (err) {
      if (err.data?.errors) setState({ phase: 'invalid', message: err.message, errors: err.data.errors, total: err.data.totalErrors });
      else { setState({ phase: 'idle' }); toast.error(err.message); }
    }
  }

  async function apply() {
    setState((s) => ({ ...s, phase: 'applying' }));
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api(`${base}/import`, { method: 'POST', form: fd });
      toast.success(`Đã cập nhật ${r.applied} ô điểm danh`);
      onApplied();
    } catch (err) {
      // Dữ liệu có thể đã đổi giữa lúc xem trước và lúc áp dụng: kiểm tra lại từ đầu
      if (err.data?.errors) setState({ phase: 'invalid', message: err.message, errors: err.data.errors, total: err.data.totalErrors });
      else { toast.error(err.message); setState((s) => ({ ...s, phase: 'preview' })); }
    }
  }

  const { phase } = state;
  const result = state.result;

  return (
    <Modal wide title="Điểm danh bằng file Excel" onClose={onClose} footer={
      phase === 'preview' && result.changed > 0 ? (
        <>
          <button className="btn btn-secondary" onClick={() => inputRef.current.click()}>Chọn file khác</button>
          <button className="btn btn-primary" onClick={apply}><CheckCircle2 size={16} />Áp dụng {result.changed} thay đổi</button>
        </>
      ) : <button className="btn btn-secondary" onClick={onClose}>Đóng</button>
    }>
      <div className="stack">
        {/* Bước 1 */}
        <div className="excel-step">
          <span className="excel-num">1</span>
          <div className="grow">
            <b>Tải file điểm danh của lớp</b>
            <div className="small text-2">File gồm đúng danh sách sinh viên và các buổi hiện có, mỗi ô là một mã.</div>
          </div>
          <button className="btn btn-secondary" onClick={getTemplate}><Download size={16} />Tải file</button>
        </div>

        {/* Bước 2 */}
        <div className="excel-step" style={{ alignItems: 'flex-start' }}>
          <span className="excel-num">2</span>
          <div className="grow">
            <b>Sửa mã trong các ô rồi lưu file</b>
            <div className="code-grid">
              {CODES.map((c) => (
                <div key={c.code} className="code-item"><kbd className={`code-key ${c.tone}`}>{c.code}</kbd><span className="small">{c.text}</span></div>
              ))}
            </div>
            <div className="small muted" style={{ marginTop: 8 }}>Chỉ sửa các ô mã. Không thêm, xoá hay đổi MSSV, không xoá cột, không sửa dòng "Mã buổi".</div>
          </div>
        </div>

        {/* Bước 3 */}
        <div className="excel-step" style={{ alignItems: 'flex-start' }}>
          <span className="excel-num">3</span>
          <div className="grow">
            <b>Tải file đã sửa lên</b>
            <div className="small text-2" style={{ marginBottom: 10 }}>Hệ thống kiểm tra file có khớp 100% với dữ liệu lớp. Có lỗi thì từ chối cả file, không nhận một phần.</div>
            <input ref={inputRef} type="file" accept=".xlsx" hidden onChange={check} />
            <button className="btn btn-primary" onClick={() => inputRef.current.click()} disabled={phase === 'checking' || phase === 'applying'}>
              {phase === 'checking' ? <BtnSpinner /> : <Upload size={16} />}{file ? 'Chọn file khác' : 'Chọn file Excel'}
            </button>
            {file && <span className="small text-2" style={{ marginLeft: 10 }}><FileSpreadsheet size={14} style={{ verticalAlign: -2 }} /> {file.name}</span>}
          </div>
        </div>

        {/* Kết quả kiểm tra */}
        {phase === 'invalid' && (
          <div className="alert error" style={{ flexDirection: 'column', gap: 10 }} role="alert">
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <XCircle size={20} style={{ flex: 'none', marginTop: 1 }} />
              <div><b>Không tải lên được. File chưa đồng bộ với hệ thống.</b><div className="small" style={{ marginTop: 2 }}>Hãy sửa các lỗi dưới đây trong file rồi chọn lại ({state.total} lỗi).</div></div>
            </div>
            <ul className="error-list">
              {state.errors.map((e, i) => (
                <li key={i}>{e.cell && <code>{e.cell}</code>}<span>{e.message}</span></li>
              ))}
              {state.total > state.errors.length && <li><span>… và {state.total - state.errors.length} lỗi khác</span></li>}
            </ul>
          </div>
        )}

        {phase === 'preview' && result.changed === 0 && (
          <div className="alert"><Info size={18} style={{ flex: 'none' }} /><span>File hợp lệ nhưng <b>không có gì thay đổi</b>: toàn bộ {result.unchanged} ô khớp với dữ liệu hiện tại.</span></div>
        )}

        {(phase === 'preview' || phase === 'applying') && result.changed > 0 && (
          <div>
            <div className="alert" style={{ background: 'color-mix(in srgb, var(--good) 12%, transparent)', color: 'var(--good-ink)' }}>
              <CheckCircle2 size={18} style={{ flex: 'none' }} />
              <span><b>File hợp lệ, đồng bộ với hệ thống.</b> Sẽ thay đổi <b>{result.changed}</b> ô, giữ nguyên {result.unchanged} ô. Xem lại rồi bấm "Áp dụng".</span>
            </div>
            <div className="table-wrap card" style={{ marginTop: 12, maxHeight: 280, overflowY: 'auto' }}>
              <table>
                <thead><tr><th>Sinh viên</th><th>Buổi</th><th>Thay đổi</th></tr></thead>
                <tbody>
                  {result.changes.map((c, i) => (
                    <tr key={i}>
                      <td><b>{c.fullName}</b> <span className="xs muted num">{c.studentCode}</span></td>
                      <td className="num">Buổi {c.sessionNo}</td>
                      <td><span className="row" style={{ gap: 8 }}><StatusBadge status={c.from} /><ArrowRight size={14} className="muted" /><StatusBadge status={c.to} /></span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.changed > result.changes.length && <div className="small muted" style={{ marginTop: 6 }}>Hiển thị {result.changes.length} thay đổi đầu tiên; tất cả {result.changed} thay đổi sẽ được áp dụng.</div>}
          </div>
        )}
        {phase === 'applying' && <div className="row small text-2"><BtnSpinner />Đang cập nhật…</div>}
      </div>
    </Modal>
  );
}
