// Nén ảnh ngay trên trình duyệt trước khi gửi: tối đa 1600px, JPEG chất lượng 0.82.
// Ảnh chụp điện thoại thường 3-8MB, sau khi nén chỉ còn khoảng 200-500KB.
const MAX_SIDE = 1600;

export async function compressImage(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error(`"${file.name}" không phải ảnh JPG, PNG hoặc WebP`);
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // nền trắng cho ảnh PNG trong suốt
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  if (!blob) throw new Error('Không xử lý được ảnh');
  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
  return new File([blob], name, { type: 'image/jpeg' });
}

export const fmtSize = (n) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
