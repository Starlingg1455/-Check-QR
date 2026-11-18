// Kiểm tra nhanh bảng buổi học: số buổi mỗi lớp, có trùng (class_id, session_no) không.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

for (const dong of readFileSync(fileURLToPath(new URL('../.env', import.meta.url)), 'utf8').split(/\r?\n/)) {
  const m = dong.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const trung = await db.query(
  `SELECT class_id, session_no, count(*) FROM session_qr.sessions GROUP BY 1,2 HAVING count(*) > 1`,
);
const tong = await db.query(
  `SELECT c.id, c.code, c.total_sessions, count(s.id)::int AS so_buoi,
          count(*) FILTER (WHERE s.status = 'closed')::int AS da_dong,
          count(*) FILTER (WHERE s.status = 'open')::int AS dang_mo
   FROM account.classes c LEFT JOIN session_qr.sessions s ON s.class_id = c.id
   GROUP BY c.id ORDER BY c.id`,
);
await db.end();
console.log('Trùng (class_id, session_no):', JSON.stringify(trung.rows));
console.table(tong.rows);
