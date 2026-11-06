# Hệ thống điểm danh bằng mã QR

Đồ án môn Phát triển phần mềm hướng dịch vụ, nhóm 4 người.
Giảng viên chiếu mã QR, sinh viên quét bằng điện thoại để điểm danh. Hệ thống tự thống kê ai vắng nhiều, ai sắp bị cấm thi.

## Cấu trúc thư mục

```
frontend/   Giao diện React (Vite) + biểu đồ Chart.js
gateway/    Cổng API: cửa ngõ duy nhất của frontend, chuyển tiếp tới 4 dịch vụ, Swagger tổng hợp
services/   4 dịch vụ độc lập (mỗi dịch vụ có package.json riêng, triển khai riêng được)
scripts/    Tạo dữ liệu giả, nhập lớp của trường, kiểm thử
du-lieu-truong/   (chỉ ở máy bạn, không đưa lên git) bảng điểm danh thật của trường
```

Bên trong mỗi dịch vụ (`services/<tên>/src/`) luôn có đúng 4 tệp, mỗi tệp một nhiệm vụ rõ ràng:

| Tệp | Nhiệm vụ |
|---|---|
| `may-chu.js` | Khởi động: tạo bảng dữ liệu, gắn API, mở cổng |
| `api.js` | **API REST**: các đường dẫn GET/POST/PUT/DELETE và nghiệp vụ |
| `tai-lieu-api.js` | Tài liệu OpenAPI (Swagger) mô tả các đường dẫn ở `api.js` |
| `tien-ich.js` | Dùng chung: gọi REST sang dịch vụ khác, cơ sở dữ liệu, xác thực JWT |

Bên trong `frontend/src/`: `main.jsx`, `App.jsx` (các đường dẫn trang), `api.js` (gọi REST tới cổng API),
`ngu-canh.jsx` (đăng nhập, giao diện sáng/tối, cỡ chữ), `thanh-phan.jsx` (thành phần dùng chung),
`bieu-do.jsx`, `trang-*.jsx` (các trang), `chi-tiet.jsx` (các cửa sổ xem chi tiết), `giao-dien.css`.

## Bốn dịch vụ

| Dịch vụ | Thư mục | Cổng | Schema DB | Trách nhiệm |
|---|---|---|---|---|
| 1. Tài khoản & Lớp học | `services/tai-khoan-lop-hoc` | 4001 | `account` | Đăng nhập Google, JWT, tạo lớp, quản lý sinh viên |
| 2. Buổi học & Mã QR | `services/buoi-hoc-qr` | 4002 | `session_qr` | Mở/đóng buổi, mã QR ký HMAC đổi mỗi 30 giây |
| 3. Điểm danh & Thông báo | `services/diem-danh` | 4003 | `attendance` | Quét QR, sửa tay, đơn xin vắng, email cảnh báo |
| 4. Thống kê | `services/thong-ke` | 4004 | (không có) | Dashboard, danh sách sắp cấm thi, xuất Excel |

Các dịch vụ chỉ gọi nhau qua REST (chuyển tiếp JWT của người dùng), **không truy vấn chéo database**.
Tên đường dẫn qua cổng API vẫn giữ nguyên: `/api/account`, `/api/sessions`, `/api/attendance`, `/api/statistics`.

## Kiến thức API trong đồ án

Đồ án giao tiếp giữa các thành phần bằng **REST**. Bảng dưới đây cho biết 7 kiểu giao tiếp API được dùng thế nào trong hệ thống này:

| # | Kiểu | Trong đồ án |
|---|---|---|
| 1 | **REST** | **Đang dùng cho toàn bộ hệ thống**: trình duyệt gọi cổng API, cổng API chuyển tiếp tới dịch vụ, các dịch vụ gọi nhau. Dùng JSON qua HTTP, mã trạng thái (200, 201, 204, 400, 401, 403, 404, 409, 410, 502), xác thực JWT. Phần này nằm ở `api.js` của từng dịch vụ và `frontend/src/api.js` |
| 2 | SOAP | Không dùng. Tương đương "mô tả hợp đồng" của SOAP (WSDL) là tài liệu OpenAPI/Swagger ở `tai-lieu-api.js`, xem tại `http://localhost:4000/docs` |
| 3 | gRPC | Không dùng. Các dịch vụ gọi nhau bằng REST/JSON, đủ đơn giản cho quy mô đồ án |
| 4 | GraphQL | Không dùng. Dịch vụ thống kê tổng hợp dữ liệu từ 3 dịch vụ rồi trả về một lần (`/classes/:id/overview`), việc này tương tự mục đích của GraphQL |
| 5 | WebHook | Không dùng. Email cảnh báo được gửi khi giảng viên bấm nút, không phải do sự kiện bên ngoài đẩy vào |
| 6 | WebSocket | Không dùng. Màn hình QR và danh sách điểm danh trực tiếp cập nhật bằng việc hỏi lại định kỳ (polling: QR mỗi 30 giây, danh sách mỗi 4 giây) |
| 7 | WebRTC | Không dùng. Trình duyệt chỉ mở camera để quét mã QR, không truyền hình ảnh giữa các máy |

## Chạy ở máy

Yêu cầu: Node.js 20 trở lên.

```bash
npm install
cp .env.example .env            # Windows PowerShell: Copy-Item .env.example .env
npm run backend                 # cổng API + 4 dịch vụ (cửa sổ 1)
npm run dev -w frontend         # giao diện (cửa sổ 2)  ->  http://localhost:5173
npm run tao-du-lieu-gia         # (tuỳ chọn) tạo lớp GIẢ LẬP TH4318_23CN1 (40 sinh viên, 15 buổi)
```

- Chưa đặt `DATABASE_URL` thì mỗi dịch vụ tự dùng PGlite (Postgres chạy trong Node), lưu ở `.data/`. Xoá thư mục này là về dữ liệu trống.
- Đăng nhập thử nghiệm (khi `ALLOW_DEV_LOGIN=true`): `gv@demo.vn` (giảng viên), `sv01@demo.vn` … `sv40@demo.vn` (sinh viên của lớp giả lập). Sinh viên lớp của trường đăng nhập bằng `<MSSV>@sv.local`.
- Swagger tổng hợp: <http://localhost:4000/docs>. Mỗi dịch vụ cũng có `/docs` riêng.
- Kiểm thử tự động (sau khi tạo dữ liệu giả): `npm run kiem-thu`. Bộ kiểm thử làm thay đổi dữ liệu, nên xoá `.data` và tạo lại sau khi chạy.

### Nhập bảng điểm danh mẫu của trường
```bash
npm run nhap-lop-truong -- du-lieu-truong/<tệp>.xlsx --all --start=2025-08-28 --time=12:30 --room=M-M7.03 --semester="HK1 2025-2026" --teacher-name="Họ tên"
```
Script đọc bảng điểm danh của trường (tiêu đề "HỌC PHẦN ... LỚP ...", cột Mã SV / Họ và tên / Lớp, các cột T1..Tn) rồi tạo lớp, sinh viên, các buổi và điểm danh.
Quy ước ô: để trống = có mặt, `X` = vắng, `P` = có phép, `M` = đi muộn.
Mỗi tiêu đề T1, T2... là một buổi (Buổi 1, Buổi 2...); ô gộp trải nhiều cột vẫn chỉ là một buổi.
Không có `--all` thì chỉ tạo các buổi đến buổi cuối cùng có ghi dấu.
File mẫu không có email, ngày, giờ học và phòng nên: email được tạo dạng `<MSSV>@sv.local`; ngày của Buổi 1 lấy từ `--start`, giờ từ `--time`, các buổi sau cách nhau một tuần; phòng từ `--room`.
Thư mục `du-lieu-truong/` chứa dữ liệu cá nhân thật nên đã nằm trong `.gitignore`, không được commit.

### Thử quét QR bằng điện thoại ở máy local
Camera chỉ chạy trên HTTPS hoặc localhost. Dùng `ngrok http 5173` (hoặc Cloudflare Tunnel) rồi mở link https đó trên cả laptop và điện thoại.

## Cấu hình Google đăng nhập
1. Google Cloud Console → Credentials → tạo **OAuth client ID** (Web), thêm origin của frontend (`http://localhost:5173` và domain deploy).
2. Đặt `GOOGLE_CLIENT_ID` cho dịch vụ `tai-khoan-lop-hoc`. Frontend tự lấy client ID từ API.
3. Đặt `TEACHER_EMAILS=email1@...,email2@...` cho giảng viên. Email khác mặc định là sinh viên.
4. Khi chạy thật nên đặt `ALLOW_DEV_LOGIN=false`.

## Deploy miễn phí

| Thành phần | Nơi deploy | Lệnh build / start | Biến môi trường chính |
|---|---|---|---|
| Database | Supabase | Tạo project, lấy connection string (Session pooler) | |
| Cổng API + 4 dịch vụ | Render (Web Service, free) | Thư mục gốc là gốc repo. Build: `npm install`. Start: `npm start -w services/tai-khoan-lop-hoc` (tương tự cho từng dịch vụ; cổng API: `npm start -w gateway`). Có sẵn `render.yaml` để tạo cả 5 một lượt | `DATABASE_URL`, `JWT_SECRET` (giống nhau ở cả 4), `QR_SECRET`, `ACCOUNT_URL`/`SESSION_URL`/`ATTENDANCE_URL`/`STATISTICS_URL` trỏ tới địa chỉ Render của từng dịch vụ |
| Frontend | Vercel hoặc Netlify | Root: `frontend`. Build: `npm run build`. Output: `dist` | `VITE_API_URL` là địa chỉ cổng API (không kèm `/api`) |

Lưu ý:
- Mỗi dịch vụ tự tạo schema và bảng khi khởi động (`CREATE SCHEMA/TABLE IF NOT EXISTS`), không cần chạy migration.
- Gói free của Render ngủ sau ~15 phút không dùng, lần gọi đầu có thể chậm. Dùng UptimeRobot ping `/health` của cổng API để giữ thức khi demo.
- Đặt `CORS_ORIGIN` ở cổng API là domain frontend.
- Frontend là SPA, cần rewrite mọi đường dẫn về `index.html` (Vercel: `frontend/vercel.json`; Netlify: `frontend/public/_redirects`, đã có sẵn).
- Gửi email thật: đặt `SMTP_HOST/PORT/USER/PASS` cho dịch vụ `diem-danh` (Gmail dùng App Password, hoặc Brevo/Resend). Chưa đặt thì hệ thống chỉ ghi log và hiện trạng thái "Ghi log".
