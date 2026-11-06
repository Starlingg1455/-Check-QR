import { useRef, useState } from 'react';
import { Upload, UserPlus, Trash2, Download, Users, FileSpreadsheet, Search } from 'lucide-react';
import { api, download } from '../../api.js';
import { Card, Empty, Loading, ErrorBox, Modal, Field, useLoad, useToast, Avatar, BtnSpinner } from '../../components/ui.jsx';

export default function StudentsTab({ cls, onChanged }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const list = useLoad(() => api(`/account/classes/${cls.id}/students`), [cls.id]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ studentCode: '', fullName: '', email: '' });
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState(null);
  const [q, setQ] = useState('');

  const changed = () => { list.refresh(); onChanged(); };

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

  async function remove(s) {
    try {
      await api(`/account/classes/${cls.id}/students/${s.id}`, { method: 'DELETE' });
      toast.success(`Đã xoá ${s.full_name}`);
      changed();
    } catch (err) { toast.error(err.message); }
  }

  if (list.loading) return <Loading />;
  if (list.error) return <ErrorBox message={list.error} onRetry={list.reload} />;
  const rows = list.data.filter((s) => `${s.full_name} ${s.student_code} ${s.email}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="stack">
      <div className="card card-pad row wrap">
        <div className="tile-icon"><FileSpreadsheet size={18} /></div>
        <div className="grow">
          <b>Import từ Excel</b>
          <div className="small text-2">File .xlsx có 3 cột: MSSV, Họ tên, Email. Sinh viên đăng nhập bằng đúng email này sẽ thấy lớp.</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => download('/account/students-template.xlsx', 'mau-danh-sach-sinh-vien.xlsx')}><Download size={15} />File mẫu</button>
        <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={onFile} />
        <button className="btn btn-primary" onClick={() => fileRef.current.click()} disabled={importing}>{importing ? <BtnSpinner /> : <Upload size={16} />}Chọn file Excel</button>
      </div>

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
          <h2 className="grow">Danh sách ({list.data.length})</h2>
          <div className="input-icon" style={{ width: 240 }}>
            <Search size={16} />
            <input className="input" placeholder="Tìm sinh viên" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button className="btn btn-secondary" onClick={() => setAdding(true)}><UserPlus size={16} />Thêm</button>
        </div>
        {list.data.length === 0 ? (
          <Empty icon={Users} title="Chưa có sinh viên">Import file Excel hoặc thêm từng sinh viên.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Sinh viên</th><th>MSSV</th><th className="hide-sm">Email</th><th /></tr></thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td><div className="row"><Avatar name={s.full_name} /><span className="bold">{s.full_name}</span></div></td>
                    <td className="num text-2">{s.student_code}</td>
                    <td className="text-2 hide-sm">{s.email}</td>
                    <td className="right"><button className="btn btn-ghost btn-icon btn-sm" aria-label={`Xoá ${s.full_name}`} onClick={() => remove(s)}><Trash2 size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
    </div>
  );
}
