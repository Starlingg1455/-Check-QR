// Thử gửi email cảnh báo RIÊNG cho một sinh viên (chạy: node scripts/thuGuiRieng.mjs)
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
  `SELECT u.* FROM account.classes c JOIN account.users u ON u.id = c.teacher_id WHERE c.id = 3`,
);
await db.end();
const { kyToken } = await import('../backend/services/tai-khoan-lop-hoc/src/tienIch.js');
const token = kyToken(r.rows[0]);

const res = await fetch('http://localhost:4000/api/attendance/warnings/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ classId: 3, email: 'quoct31234@gmail.com' }),
});
console.log(res.status, JSON.stringify(await res.json(), null, 1));
