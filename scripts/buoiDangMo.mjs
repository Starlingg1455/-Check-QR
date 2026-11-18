// Liệt kê các buổi đang mở (mọi lớp) để mở trang QR khi kiểm tra giao diện.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

for (const dong of readFileSync(fileURLToPath(new URL('../.env', import.meta.url)), 'utf8').split(/\r?\n/)) {
  const m = dong.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const r = await db.query(
  `SELECT s.id, s.class_id, s.session_no, s.title, s.status,
          u.id AS teacher_id, u.email AS teacher_email, u.name AS teacher_name, u.role
   FROM session_qr.sessions s
   JOIN account.classes c ON c.id = s.class_id
   JOIN account.users u ON u.id = c.teacher_id
   WHERE s.status = 'open' ORDER BY s.id`,
);
await db.end();

const { kyToken } = await import('../backend/services/tai-khoan-lop-hoc/src/tienIch.js');
for (const b of r.rows) {
  console.log(`Buổi #${b.id} | lớp ${b.class_id} | "${b.title}" | token: ${kyToken(r.rows[0] && { id: b.teacher_id, email: b.teacher_email, name: b.teacher_name, role: b.role })}`);
}
if (r.rows.length === 0) console.log('(không có buổi nào đang mở)');
