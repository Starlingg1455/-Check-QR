# Hệ thống điểm danh bằng mã QR

Đồ án môn Phát triển phần mềm hướng dịch vụ, nhóm 4 người.
Giảng viên chiếu mã QR, sinh viên quét bằng điện thoại để điểm danh. Hệ thống tự thống kê ai vắng nhiều, ai sắp bị cấm thi.

## Kiến trúc

```
 Trình duyệt ──► Frontend (React + Vite + Chart.js)
                     │  /api/*
                     ▼
              API Gateway :4000  (Express + http-proxy-middleware, Swagger tổng hợp /docs)
   ┌───────────┬────────┴───────┬──────────────┐
   ▼           ▼                ▼              ▼
account-class  session-qr   attendance     statistics
   :4001         :4002         :4003          :4004
 (schema        (schema       (schema        (không có DB,
  account)      session_qr)   attendance)    gọi API 3 service kia)
        └──────────── PostgreSQL (Supabase) ────────────┘
```

| Module | Thư mục | Trách nhiệm |
|---|---|---|
| 1. Tài khoản & Lớp học | `services/account-class` | Đăng nhập Google, JWT, tạo lớp, quản lý sinh viên |
| 2. Buổi học & Mã QR | `services/session-qr` | Mở/đóng buổi, mã QR ký HMAC đổi mỗi 30 giây |
| 3. Điểm danh & Thông báo | `services/attendance` | Quét QR, sửa tay, đơn xin vắng, email cảnh báo |
| 4. Thống kê | `services/statistics` | Dashboard, danh sách sắp cấm thi, xuất Excel |

Các service chỉ gọi nhau qua REST (chuyển tiếp JWT của người dùng), **không truy vấn chéo database**.

### Luồng điểm danh bằng QR
1. Giảng viên mở buổi, trang chiếu QR gọi `GET /sessions/:id/qr` mỗi 30 giây.
2. Mã QR là đường link `/scan?t=<token>`. Sinh viên quét bằng camera điện thoại thì mở thẳng trang điểm danh.
3. `attendance` gọi `session-qr /sessions/verify` (kiểm tra chữ ký, còn hạn, buổi đang mở) rồi gọi `account-class /classes/:id` (sinh viên có thuộc lớp không), sau đó ghi bản ghi.
4. Quá `LATE_MINUTES` (mặc định 15 phút) kể từ lúc mở buổi thì tính là đi trễ.

### Quy tắc cấm thi (ở `statistics`)
Giới hạn vắng = `tổng số buổi × tỉ lệ vắng cho phép` (mặc định 15 × 20% = 3 buổi). Chỉ tính vắng **không phép**; đi trễ tính là có mặt.
`vắng > giới hạn` là **vượt giới hạn**, `= giới hạn` là **sắp cấm thi**, `= giới hạn − 1` là **cần chú ý**.

## Chạy ở máy

Yêu cầu: Node.js 20 trở lên.

```bash
npm install
cp .env.example .env      # Windows PowerShell: Copy-Item .env.example .env
npm run backend           # gateway + 4 service (terminal 1)
npm run dev -w frontend   # giao diện (terminal 2)  ->  http://localhost:5173
npm run seed              # (tuỳ chọn) tạo lớp GIẢ LẬP TH4318_23CN1 (40 sinh viên, 15 buổi) để xem biểu đồ
```

- Chưa đặt `DATABASE_URL` thì mỗi service tự dùng PGlite (Postgres chạy trong Node), lưu ở `.data/`. Xoá thư mục này là về dữ liệu trống.
- Đăng nhập thử nghiệm (khi `ALLOW_DEV_LOGIN=true`): `gv@demo.vn` (giảng viên), `sv01@demo.vn` … `sv40@demo.vn` (sinh viên của lớp giả lập). Sinh viên lớp của trường đăng nhập bằng `<MSSV>@sv.local`.
- Swagger tổng hợp: <http://localhost:4000/docs>. Mỗi service cũng có `/docs` riêng.
- Kiểm tra tự động (sau khi seed): `node scripts/smoke-test.js` (luồng chính), `node scripts/test-attachments.mjs` (ảnh minh chứng), `node scripts/test-late.mjs` (đến muộn sau khi đóng QR, giảng viên sửa tay), `node scripts/test-changes.mjs` (lưu nhiều thay đổi sửa tay cùng lúc). Các bài test này sẽ thay đổi dữ liệu demo, nên xoá `.data` và seed lại sau khi chạy.

### Nhập bảng điểm danh mẫu của trường
```bash
node scripts/import-mau-truong.mjs du-lieu-truong/<file>.xlsx --start=2025-08-28 --time=12:30 --room=M-M7.03 --semester="HK1 2025-2026" [--teacher-name="Họ tên"] [--all]
```
Script đọc bảng điểm danh của trường (tiêu đề "HỌC PHẦN ... LỚP ...", cột Mã SV / Họ và tên / Lớp, các cột T1..Tn) rồi tạo lớp, sinh viên, các buổi và điểm danh.
Quy ước ô: để trống = có mặt, `X` = vắng, `P` = có phép, `M` = đi muộn. Mỗi tiêu đề T1, T2... là một buổi (Buổi 1, Buổi 2...); ô gộp trải nhiều cột vẫn chỉ là một buổi. Mặc định chỉ tạo các buổi đến buổi cuối cùng có ghi dấu (`--all` để tạo hết).
File mẫu không có email, ngày học, giờ học và phòng nên: email được tạo dạng `<MSSV>@sv.local`; ngày của Buổi 1 lấy từ `--start`, giờ từ `--time`, các buổi sau cách nhau một tuần; phòng từ `--room`.
Thư mục `du-lieu-truong/` chứa dữ liệu cá nhân thật nên đã nằm trong `.gitignore`, không được commit.

### Thử quét QR bằng điện thoại ở máy local
Camera chỉ chạy trên HTTPS hoặc localhost. Dùng `ngrok http 5173` (hoặc Cloudflare Tunnel) rồi mở link https đó trên cả laptop và điện thoại.

## Cấu hình Google đăng nhập
1. Google Cloud Console → Credentials → tạo **OAuth client ID** (Web), thêm origin của frontend (`http://localhost:5173` và domain deploy).
2. Đặt `GOOGLE_CLIENT_ID` cho service `account-class`. Frontend tự lấy client ID từ API.
3. Đặt `TEACHER_EMAILS=email1@...,email2@...` cho giảng viên. Email khác mặc định là sinh viên.
4. Khi chạy thật nên đặt `ALLOW_DEV_LOGIN=false`.

## Deploy miễn phí

| Thành phần | Nơi deploy | Lệnh build / start | Biến môi trường chính |
|---|---|---|---|
| Database | Supabase | Tạo project, lấy connection string (Session pooler) | |
| 4 service + gateway | Render (Web Service, free) | Root directory là thư mục gốc repo. Build: `npm install`. Start: `npm start -w services/account-class` (tương tự cho từng service, gateway: `npm start -w gateway`) | `DATABASE_URL`, `JWT_SECRET` (giống nhau ở cả 4), `QR_SECRET`, `ACCOUNT_URL`/`SESSION_URL`/`ATTENDANCE_URL`/`STATISTICS_URL` trỏ tới địa chỉ Render của từng service |
| Frontend | Vercel hoặc Netlify | Root: `frontend`. Build: `npm run build`. Output: `dist` | `VITE_API_URL` là địa chỉ gateway (không kèm `/api`) |

Lưu ý:
- Mỗi service tự tạo schema và bảng khi khởi động (`CREATE SCHEMA/TABLE IF NOT EXISTS`), không cần chạy migration.
- Gói free của Render ngủ sau ~15 phút không dùng, lần gọi đầu có thể chậm. Dùng UptimeRobot ping `/health` của gateway để giữ thức khi demo.
- Đặt `CORS_ORIGIN` ở gateway là domain frontend.
- Frontend là SPA, cần rewrite mọi đường dẫn về `index.html` (Vercel: file `vercel.json` đã có sẵn; Netlify: file `_redirects` đã có sẵn).
- Gửi email thật: đặt `SMTP_HOST/PORT/USER/PASS` cho service `attendance` (Gmail dùng App Password, hoặc Brevo/Resend). Chưa đặt thì hệ thống chỉ ghi log và hiện trạng thái "Ghi log".

## Cấu trúc thư mục
```
frontend/            React (Vite), Chart.js, giao diện sáng/tối, dùng được trên điện thoại
gateway/             API Gateway + Swagger tổng hợp
services/            4 service độc lập (mỗi service có package.json, openapi.js riêng)
scripts/seed.js      tạo lớp dữ liệu giả lập qua API
scripts/import-mau-truong.mjs  nhập bảng điểm danh mẫu của trường (xlsx)
scripts/smoke-test.js  kiểm tra nhanh luồng chính
```
