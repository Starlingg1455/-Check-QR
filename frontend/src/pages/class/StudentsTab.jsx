import { useMemo, useRef, useState } from 'react';
import { Upload, UserPlus, Trash2, Download, Users, Search, ArrowUpDown, ChevronRight } from 'lucide-react';
import { api, download } from '../../api.js';
import StudentDetailModal from './StudentDetailModal.jsx';
import { Empty, Loading, ErrorBox, Modal, Field, LevelBadge, useLoad, useToast, Avatar, BtnSpinner, pct } from '../../components/ui.jsx';

/* Tab Sinh viên: một bảng duy nhất vừa quản lý danh sách vừa xem tình hình đi học */
export default function StudentsTab({ cls, stats, requests, onChanged }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const list = useLoad(() => api(`/account/classes/${cls.id}/students`), [cls.id]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ studentCode: '', fullName: '', email: '' });
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState({ key: 'student_code', dir: 1 });
  const [toDelete, setToDelete] = useState(null);
  const [detail, setDetail] = useState(null);

  const changed = () => { list.refresh(); onChanged(); };

  // Ghép danh sách sinh viên với số liệu điểm danh theo email
  const rows = useMemo(() => {
    if (!list.data) return [];
    const byEmail = new Map((stats?.perStudent || []).map((s) => [s.email.toLowerCase(), s]));
    return list.data
      .map((s) => ({ ...s, st: byEmail.get(s.email.toLowerCase()) || null }))
      .filter((s) => `${s.full_name} ${s.student_code} ${s.email}`.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => {
        const get = (r) => (sort.key === 'absent' || sort.key === 'rate' ? (r.st?.[sort.key] ?? -1) : r[sort.key]);
        const x = get(a), y = get(b);
        return (x > y ? 1 : x < y ? -1 : 0) * sort.dir;
      });
  }, [list.data, stats, q, sort]);

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api(`/account/classes/${cls.id}/students/import`, { method: 'POST', form: fd });
      setReport(r);
      changed();
      if (r.imported) toast.success(`Đã import ${r.imported} sinh viên`);
    } catch (err) { toast.error(err.message); } finally { setImporting(false); }
  }

  async function addOne(e) {
    e.preventDefault();
    try {
      await api(`/account/classes/${cls.id}/students`, { method: 'POST', body: form });
      toast.success('Đã thêm sinh viên');
      setAdding(false);
      setForm({ studentCode: '', fullName: '', email: '' });
      changed();
    } catch (err) { toast.error(err.message); }
  }

  async function remove() {
    try {
      await api(`/account/classes/${cls.id}/students/${toDelete.id}`, { method: 'DELETE' });
      toast.success(`Đã xoá ${toDelete.full_name}`);
      setToDelete(null);
      changed();
    } catch (err) { toast.error(err.message); }
  }

  if (list.loading) return <Loading />;
  if (list.error) return <ErrorBox message={list.error} onRetry={list.reload} />;

  const toggle = (key) => setSort((p) => ({ key, dir: p.key === key ? -p.dir : key === 'absent' ? -1 : 1 }));
  const Th = ({ k, children, right, hide }) => (
    <th className={`${right ? 'right' : ''} ${hide ? 'hide-sm' : ''}`}>
      <button onClick={() => toggle(k)} style={{ all: 'unset', cursor: 'pointer', display: 'inline-flex', gap: 4, alignItems: 'center' }}>{children}<ArrowUpDown size={12} /></button>
    </th>
  );

  return (
    <div className="stack">
      {report && report.errors.length > 0 && (
        <div className="alert warn" style={{ flexDirection: 'column' }}>
          <b>Đã import {report.imported} dòng, bỏ qua {report.errors.length} dòng lỗi:</b>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {report.errors.slice(0, 8).map((e) => <li key={e.row}>Dòng {e.row}: {e.message}</li>)}
            {report.errors.length > 8 && <li>… và {report.errors.length - 8} dòng khác</li>}
          </ul>
        </div>
      )}

      <section className="card table-card">
        <div className="toolbar">
          <div className="input-icon grow" style={{ maxWidth: 320 }}>
            <Search size={16} />
            <input className="input" placeholder={`Tìm trong ${list.data.length} sinh viên`} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="grow" />
          <button className="btn btn-ghost btn-sm" onClick={() => download('/account/students-template.xlsx', 'mau-danh-sach-sinh-vien.xlsx')} title="Tải file Excel mẫu (cột MSSV, Họ tên, Email)"><Download size={15} /><span className="hide-sm">File mẫu</span></button>
          <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={onFile} />
          <button className="btn btn-secondary" onClick={() => fileRef.current.click()} disabled={importing}>{importing ? <BtnSpinner /> : <Upload size={16} />}Import Excel</button>
          <button className="btn btn-primary" onClick={() => setAdding(true)}><UserPlus size={16} />Thêm</button>
        </div>

        {list.data.length === 0 ? (
          <Empty icon={Users} title="Chưa có sinh viên">Import file Excel (3 cột: MSSV, Họ tên, Email) hoặc thêm từng sinh viên. Sinh viên đăng nhập bằng đúng email này sẽ thấy lớp.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <Th k="full_name">Sinh viên</Th><Th k="student_code" hide>MSSV</Th>
                  <Th k="absent" right>Vắng</Th><Th k="rate" right hide>Tỉ lệ đi học</Th><th className="hide-sm">Tình trạng</th><th />
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="row-link" tabIndex={0} onClick={() => setDetail(s)} onKeyDown={(e) => e.key === 'Enter' && setDetail(s)} aria-label={`Xem chi tiết ${s.full_name}`}>
                    <td><div className="row"><Avatar name={s.full_name} /><div style={{ minWidth: 0 }}><div className="bold truncate">{s.full_name}</div><div className="xs muted truncate">{s.email}</div></div></div></td>
                    <td className="num text-2 hide-sm">{s.student_code}</td>
                    <td className="right num bold">{s.st ? s.st.absent : '—'}</td>
                    <td className="right num hide-sm">{s.st ? pct(s.st.rate) : '—'}</td>
                    <td className="hide-sm">{s.st && stats.closedSessions > 0 ? <LevelBadge level={s.st.level} /> : <span className="muted small">Chưa có dữ liệu</span>}</td>
                    <td className="right" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-ghost btn-icon btn-sm" aria-label={`Xoá ${s.full_name}`} onClick={(e) => { e.stopPropagation(); setToDelete(s); }}><Trash2 size={16} /></button>
                      <ChevronRight size={18} className="muted row-chevron" />
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={6} className="center muted" style={{ padding: 32 }}>Không tìm thấy sinh viên phù hợp</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {detail && <StudentDetailModal student={detail} stats={stats} cls={cls} requests={requests} onClose={() => setDetail(null)} />}
      {adding && (
        <Modal title="Thêm sinh viên" onClose={() => setAdding(false)}>
          <form className="stack" onSubmit={addOne}>
            <Field label="MSSV"><input className="input" required autoFocus value={form.studentCode} onChange={(e) => setForm({ ...form, studentCode: e.target.value })} /></Field>
            <Field label="Họ tên"><input className="input" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></Field>
            <Field label="Email (dùng để đăng nhập)"><input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setAdding(false)}>Huỷ</button>
              <button className="btn btn-primary">Thêm</button>
            </div>
          </form>
        </Modal>
      )}
      {toDelete && (
        <Modal title={`Xoá ${toDelete.full_name}?`} onClose={() => setToDelete(null)} footer={
          <>
            <button className="btn btn-secondary" onClick={() => setToDelete(null)}>Huỷ</button>
            <button className="btn btn-primary" style={{ background: 'var(--critical)' }} onClick={remove}>Xoá khỏi lớp</button>
          </>
        }>
          <p className="text-2">Sinh viên sẽ bị xoá khỏi danh sách lớp và không còn thấy lớp này.</p>
        </Modal>
      )}
    </div>
  );
}
