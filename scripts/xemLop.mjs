// Xem nhanh các lớp trong DB (ai là chủ lớp). Chạy: node scripts/xemLop.mjs
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const duongDanEnv = fileURLToPath(new URL('../.env', import.meta.url));
for (const dong of readFileSync(duongDanEnv, 'utf8').split(/\r?\n/)) {
  const m = dong.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const r = await client.query(
  `SELECT c.id, c.code, c.name, c.total_sessions, c.max_absent_percent,
          u.email AS teacher,
          (SELECT count(*)::int FROM account.class_students s WHERE s.class_id = c.id) AS sv
   FROM account.classes c LEFT JOIN account.users u ON u.id = c.teacher_id
   ORDER BY c.id`,
);
for (const dong of r.rows)
  console.log(
    `#${dong.id} ${dong.code} — ${dong.name} | GV: ${dong.teacher} | ${dong.sv} SV | ${dong.total_sessions} buổi / ${dong.max_absent_percent}%`,
  );
await client.end();
