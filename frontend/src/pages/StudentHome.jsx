import { Link } from 'react-router-dom';
import { ScanLine, GraduationCap, ChevronRight, MapPin, UserRound, ShieldAlert } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { PageHead, Ring, Empty, Loading, ErrorBox, Badge, useLoad } from '../components/ui.jsx';

export default function StudentHome() {
  const { user } = useAuth();
  const data = useLoad(async () => {
    const classes = await api('/account/classes');
    // Với mỗi lớp lấy thêm tỉ lệ đi học và số buổi vắng của chính mình
    return Promise.all(classes.map(async (c) => {
      try { return { ...c, me: await api(`/attendance/classes/${c.id}/me`) }; } catch { return { ...c, me: null }; }
    }));
  }, []);

  if (data.loading) return <Loading />;
  if (data.error) return <ErrorBox message={data.error} onRetry={data.reload} />;

  return (
    <>
      <PageHead title={`Xin chào, ${user.name.split(' ').slice(-1)[0]}`} subtitle="Các lớp bạn đang học và tình hình đi học của bạn." />

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
        <div className="card"><Empty icon={GraduationCap} title="Bạn chưa thuộc lớp nào">Giảng viên cần thêm email <b>{user.email}</b> vào danh sách lớp thì bạn mới thấy lớp ở đây.</Empty></div>
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
                  <Ring value={sum?.rate ?? null} size={60} />
                </div>
                <div className="row wrap small text-2" style={{ gap: 16 }}>
                  <span className="row" style={{ gap: 6 }}><UserRound size={15} />{c.teacher_name}</span>
                  {c.room && <span className="row" style={{ gap: 6 }}><MapPin size={15} />{c.room}</span>}
                </div>
                <div className="row between" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                  {sum ? (
                    danger
                      ? <Badge tone="critical" icon={ShieldAlert}>Vắng {sum.absent}/{limit} buổi · nguy cơ cấm thi</Badge>
                      : <Badge tone={sum.absent ? 'warning' : 'good'}>Vắng {sum.absent}/{limit} buổi cho phép</Badge>
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
