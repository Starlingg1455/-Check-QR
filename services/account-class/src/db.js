// Kết nối database: dùng PostgreSQL thật (Supabase) nếu có DATABASE_URL,
// nếu không thì dùng PGlite (Postgres chạy trong Node) lưu ở thư mục .data để chạy local.
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

export async function createDb(schema) {
  let runQuery;
  let runExec;

  if (process.env.DATABASE_URL) {
    const url = process.env.DATABASE_URL;
    const isLocal = /localhost|127\.0\.0\.1/.test(url);
    const pool = new pg.Pool({
      connectionString: url,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: 5,
    });
    runQuery = (text, params) => pool.query(text, params);
    runExec = (text) => pool.query(text);
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    // Thư mục dữ liệu cục bộ nằm ở gốc dự án: .data/<schema>
    const dir = path.resolve(process.env.DATA_DIR || '../../.data', schema);
    fs.mkdirSync(dir, { recursive: true });
    const lite = new PGlite(dir);
    runQuery = (text, params) => lite.query(text, params);
    runExec = (text) => lite.exec(text);
  }

  await runExec(`CREATE SCHEMA IF NOT EXISTS ${schema}`);

  return {
    // Trả về mảng dòng kết quả
    query: async (text, params = []) => (await runQuery(text, params)).rows,
    // Chạy nhiều câu lệnh SQL liền nhau (dùng khi tạo bảng)
    exec: (text) => runExec(text),
  };
}
