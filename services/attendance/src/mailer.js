// Gửi email cảnh báo. Nếu chưa cấu hình SMTP thì chỉ ghi log (chế độ thử nghiệm).
import nodemailer from 'nodemailer';

const transporter = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
  : null;

export const mailEnabled = Boolean(transporter);

// Trả về { status: 'sent' | 'logged' | 'failed', detail }
export async function sendMail({ to, subject, html }) {
  if (!transporter) {
    console.log(`[mail - chưa cấu hình SMTP] Gửi tới ${to}: ${subject}`);
    return { status: 'logged', detail: 'Chưa cấu hình SMTP nên chỉ ghi log' };
  }
  try {
    await transporter.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, html });
    return { status: 'sent', detail: 'Đã gửi' };
  } catch (err) {
    return { status: 'failed', detail: String(err.message || err).slice(0, 300) };
  }
}
