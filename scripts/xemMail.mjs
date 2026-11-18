// Xem lịch sử gửi email cảnh báo (lấy lý do lỗi chi tiết). Chạy: node scripts/xemMail.mjs [sốDòng]
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

for (const dong of readFileSync(fileURLToPath(new URL('../.env', import.meta.url)), 'utf8').split(/\r?\n/)) {
  const m = dong.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const soDong = Number(process.argv[2] || 15);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const r = await client.query(
  `SELECT id, class_id, student_email, subject, status, detail, created_at
   FROM attendance.notifications ORDER BY created_at DESC LIMIT $1`,
  [soDong],
);
for (const dong of r.rows) {
  console.log(
    `[${new Date(dong.created_at).toLocaleString('vi-VN')}] ${dong.status.toUpperCase()} — ${dong.student_email}\n  ${dong.detail}`,
  );
}
if (r.rows.length === 0) console.log('(chưa có bản ghi nào)');
await client.end();
