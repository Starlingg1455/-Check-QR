// Các biểu đồ (Chart.js). Màu lấy từ biến CSS nên đổi giao diện sáng/tối là biểu đồ đổi theo.

import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { useMemo } from 'react';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { useGiaoDien, useCoChu } from './nguCanh.jsx';

// Các biểu đồ Chart.js. Màu lấy từ biến CSS nên đổi giao diện sáng/tối là biểu đồ đổi theo.

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
);

const docBienCss = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const doTrongSuot = (hex, doMo) => {
  const chuoiHex = hex.replace('#', '');
  if (chuoiHex.length !== 6) return hex;
  const soMau = parseInt(chuoiHex, 16);
  return `rgba(${soMau >> 16}, ${(soMau >> 8) & 255}, ${soMau & 255}, ${doMo})`;
};

function useMauSac() {
  const { theme } = useGiaoDien();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(
    () => ({
      text: docBienCss('--text'),
      text2: docBienCss('--text-2'),
      muted: docBienCss('--muted'),
      grid: docBienCss('--grid'),
      surface: docBienCss('--surface'),
      border: docBienCss('--border-strong'),
      accent: docBienCss('--accent'),
      good: docBienCss('--good'),
      warning: docBienCss('--warning'),
      serious: docBienCss('--serious'),
      critical: docBienCss('--critical'),
      info: docBienCss('--info'),
    }),
    [theme],
  );
}

function tuyChonChung(mau, extra = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    animation: { duration: 500 },
    font: { family: getComputedStyle(document.body).fontFamily },
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: mau.text2,
          usePointStyle: true,
          pointStyle: 'rectRounded',
          boxWidth: 9,
          boxHeight: 9,
          padding: 18,
          font: { size: 15 },
        },
      },
      tooltip: {
        backgroundColor: mau.surface,
        titleColor: mau.text,
        bodyColor: mau.text2,
        borderColor: mau.border,
        borderWidth: 1,
        padding: 12,
        cornerRadius: 10,
        boxPadding: 6,
        usePointStyle: true,
        titleFont: { size: 15, weight: '600' },
        bodyFont: { size: 14 },
      },
    },
    ...extra,
  };
}

const cacTruc = (mau, yExtra = {}) => ({
  x: {
    grid: { display: false },
    border: { color: mau.grid },
    ticks: { color: mau.text2, font: { size: 14 } },
  },
  y: {
    grid: { color: mau.grid },
    border: { display: false },
    ticks: { color: mau.text2, font: { size: 14 }, precision: 0 },
    ...yExtra,
  },
});

// Khung biểu đồ đối zoom nên chữ trong biểu đồ phải tự nhân theo hệ số phóng to của giao diện
function phongToChuTheoZoom(node, heSoZoom) {
  if (heSoZoom === 1 || !node || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map((phanTu) => phongToChuTheoZoom(phanTu, heSoZoom));
  const ketQua = {};
  for (const [khoa, giaTri] of Object.entries(node)) {
    if (
      (khoa === 'font' || khoa === 'titleFont' || khoa === 'bodyFont') &&
      giaTri &&
      typeof giaTri.size === 'number'
    )
      ketQua[khoa] = { ...giaTri, size: Math.round(giaTri.size * heSoZoom * 10) / 10 };
    else if (khoa === 'padding' && typeof giaTri === 'number') ketQua[khoa] = Math.round(giaTri * heSoZoom);
    else
      ketQua[khoa] =
        typeof giaTri === 'object' && giaTri !== null && !(giaTri instanceof Function)
          ? phongToChuTheoZoom(giaTri, heSoZoom)
          : giaTri;
  }
  return ketQua;
}

// Rê chuột lên phần tử bấm được thì đổi con trỏ thành bàn tay
const doiConTroKhiRe = (suKien, elements) => {
  const phanTu = suKien.native?.target;
  if (phanTu) phanTu.style.cursor = elements.length ? 'pointer' : 'default';
};
const KHOA_TRANG_THAI = ['present', 'late', 'excused', 'absent'];

const nhanBuoi = (buoi) => `B${buoi.sessionNo}`;
// Tên buổi cho tooltip: tránh lặp "Buổi 7: Buổi 7"
const tenBuoi = (buoi) =>
  buoi.title === `Buổi ${buoi.sessionNo}` ? buoi.title : `Buổi ${buoi.sessionNo}: ${buoi.title}`;

/* Cột chồng: số sinh viên theo trạng thái ở từng buổi */
export function BieuDoCotChongTheoBuoi({ perSession, onSelect }) {
  const mau = useMauSac();
  const { total: heSoZoom } = useCoChu();
  const data = {
    labels: perSession.map(nhanBuoi),
    datasets: [
      {
        label: 'Có mặt',
        data: perSession.map((buoi) => buoi.present),
        backgroundColor: mau.good,
      },
      {
        label: 'Đi trễ',
        data: perSession.map((buoi) => buoi.late),
        backgroundColor: mau.warning,
      },
      {
        label: 'Vắng có phép',
        data: perSession.map((buoi) => buoi.excused),
        backgroundColor: mau.info,
      },
      {
        label: 'Vắng',
        data: perSession.map((buoi) => buoi.absent),
        backgroundColor: mau.critical,
      },
    ].map((tapDuLieu) => ({
      ...tapDuLieu,
      borderColor: mau.surface,
      borderWidth: 2,
      borderRadius: 4,
      borderSkipped: false,
      maxBarThickness: 36,
    })),
  };
  const tuyChon = tuyChonChung(mau, {
    scales: {
      x: { ...cacTruc(mau).x, stacked: true },
      y: { ...cacTruc(mau).y, stacked: true },
    },
  });
  tuyChon.plugins.tooltip.callbacks = {
    title: (items) => tenBuoi(perSession[items[0].dataIndex]),
  };
  if (onSelect) {
    tuyChon.onHover = doiConTroKhiRe;
    // Bấm vào đúng đoạn màu nào thì chọn trạng thái đó; bấm vào khoảng trống của cột thì chỉ chọn buổi
    tuyChon.onClick = (suKien, cacPhanTu, bieuDo) => {
      const diemChon = bieuDo.getElementsAtEventForMode(
        suKien,
        'nearest',
        { intersect: true },
        true,
      )[0];
      const index = diemChon ? diemChon.index : cacPhanTu[0]?.index;
      if (index !== undefined)
        onSelect(index, diemChon ? KHOA_TRANG_THAI[diemChon.datasetIndex] : null);
    };
  }
  return <Bar data={data} options={phongToChuTheoZoom(tuyChon, heSoZoom)} />;
}

/* Đường: tỉ lệ đi học (%) theo buổi */
export function BieuDoTiLeDiHoc({ perSession, onSelect }) {
  const mau = useMauSac();
  const { total: heSoZoom } = useCoChu();
  const data = {
    labels: perSession.map(nhanBuoi),
    datasets: [
      {
        label: 'Tỉ lệ đi học (%)',
        data: perSession.map((buoi) => buoi.rate),
        borderColor: mau.accent,
        backgroundColor: doTrongSuot(mau.accent, 0.12),
        borderWidth: 2.5,
        tension: 0.35,
        fill: true,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: mau.accent,
        pointBorderColor: mau.surface,
        pointBorderWidth: 2,
      },
    ],
  };
  // Trục dọc bắt đầu gần mức thấp nhất (không phí nửa biểu đồ cho khoảng 0-60%), luôn kết thúc ở 100%
  const lowest = Math.min(...perSession.map((buoi) => buoi.rate ?? 100));
  const yMin = Math.max(0, Math.floor((lowest - 10) / 10) * 10);
  const tuyChon = tuyChonChung(mau, {
    scales: {
      x: cacTruc(mau).x,
      y: cacTruc(mau, {
        min: yMin,
        max: 100,
        ticks: {
          color: mau.text2,
          font: { size: 14 },
          stepSize: 10,
          callback: (giaTri) => `${giaTri}%`,
        },
      }).y,
    },
  });
  tuyChon.plugins.legend.display = false;
  tuyChon.plugins.tooltip.callbacks = {
    title: (items) => tenBuoi(perSession[items[0].dataIndex]),
    label: (item) => {
      const buoi = perSession[item.dataIndex];
      return ` ${item.parsed.y}%  ·  ${buoi.present + buoi.late}/${buoi.present + buoi.late + buoi.excused + buoi.absent} sinh viên có mặt`;
    },
    footer: () => (onSelect ? 'Bấm để xem chi tiết' : ''),
  };
  if (onSelect) {
    // Bấm vào điểm hoặc bất kỳ chỗ nào trong cột của buổi đó đều mở chi tiết buổi
    tuyChon.onHover = doiConTroKhiRe;
    tuyChon.onClick = (_suKien, cacPhanTu) => {
      if (cacPhanTu[0]) onSelect(cacPhanTu[0].index);
    };
  }
  return <Line data={data} options={phongToChuTheoZoom(tuyChon, heSoZoom)} />;
}

/* Vành khuyên: cơ cấu trạng thái của tất cả lượt điểm danh, số % ở giữa */
export function BieuDoTron({ overall, avgRate }) {
  const mau = useMauSac();
  const { total: heSoZoom } = useCoChu();
  const data = {
    labels: ['Có mặt', 'Đi trễ', 'Vắng có phép', 'Vắng'],
    datasets: [
      {
        data: [overall.present, overall.late, overall.excused, overall.absent],
        backgroundColor: [mau.good, mau.warning, mau.info, mau.critical],
        borderColor: mau.surface,
        borderWidth: 3,
        hoverOffset: 4,
      },
    ],
  };
  const center = {
    id: 'center',
    afterDraw(bieuDo) {
      const { ctx, chartArea: vungVe } = bieuDo;
      const tamX = (vungVe.left + vungVe.right) / 2;
      const tamY = (vungVe.top + vungVe.bottom) / 2;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = mau.text;
      ctx.font = `700 ${Math.round(44 * heSoZoom)}px ${getComputedStyle(document.body).fontFamily}`;
      ctx.fillText(avgRate === null ? '—' : `${avgRate}%`, tamX, tamY);
      ctx.restore();
    },
  };
  const tuyChon = tuyChonChung(mau, {
    cutout: '72%',
    interaction: { mode: 'nearest', intersect: true },
  });
  tuyChon.plugins.legend.display = false; // chỉ hình tròn + phần trăm; chú thích nằm ở màn hình chi tiết
  return (
    <Doughnut data={data} options={phongToChuTheoZoom(tuyChon, heSoZoom)} plugins={[center]} />
  );
}

/* Cột: có bao nhiêu sinh viên vắng 0, 1, 2... buổi (tô màu theo mức cảnh báo) */
export function BieuDoPhanBoBuoiVang({ perStudent, absentLimit, onSelect }) {
  const mau = useMauSac();
  const { total: heSoZoom } = useCoChu();
  const giaTriLonNhat = Math.max(absentLimit + 2, ...perStudent.map((sinhVien) => sinhVien.absent));
  const nhan = Array.from({ length: giaTriLonNhat + 1 }, (_, chiSo) => String(chiSo));
  const soLuong = nhan.map((_, chiSo) => perStudent.filter((sinhVien) => sinhVien.absent === chiSo).length);
  const mucTheoSoBuoiVang = (chiSo) =>
    chiSo > absentLimit
      ? 'banned'
      : chiSo === absentLimit && absentLimit > 0
        ? 'danger'
        : chiSo === absentLimit - 1 && chiSo > 0
          ? 'warning'
          : 'ok';
  const LEVEL_TEXT = {
    ok: 'Bình thường',
    warning: 'Cần chú ý',
    danger: 'Sắp cấm thi',
    banned: 'Vượt giới hạn',
  };
  const levelColor = {
    ok: mau.good,
    warning: mau.warning,
    danger: mau.serious,
    banned: mau.critical,
  };
  const mauTheoMuc = (chiSo) => levelColor[mucTheoSoBuoiVang(chiSo)];
  const data = {
    labels: nhan,
    datasets: [
      {
        label: 'Số sinh viên',
        data: soLuong,
        backgroundColor: nhan.map((_, chiSo) => mauTheoMuc(chiSo)),
        borderColor: mau.surface,
        borderWidth: 2,
        borderRadius: 6,
        borderSkipped: false,
        maxBarThickness: 40,
      },
    ],
  };
  const tuyChon = tuyChonChung(mau, { scales: cacTruc(mau) });
  tuyChon.plugins.legend.display = false;
  tuyChon.plugins.tooltip.callbacks = {
    title: (items) => `Vắng ${items[0].label} buổi`,
    label: (item) =>
      ` ${item.parsed.y} sinh viên · ${LEVEL_TEXT[mucTheoSoBuoiVang(item.dataIndex)]}`,
    footer: (items) =>
      onSelect && soLuong[items[0].dataIndex] > 0 ? 'Bấm để xem danh sách' : '',
  };
  if (onSelect) {
    tuyChon.interaction = { mode: 'nearest', intersect: false, axis: 'x' };
    tuyChon.onHover = (suKien, cacPhanTu) =>
      doiConTroKhiRe(
        suKien,
        cacPhanTu.filter((phanTu) => soLuong[phanTu.index] > 0),
      );
    tuyChon.onClick = (_suKien, cacPhanTu) => {
      if (cacPhanTu[0] && soLuong[cacPhanTu[0].index] > 0) onSelect(cacPhanTu[0].index);
    };
  }
  return <Bar data={data} options={phongToChuTheoZoom(tuyChon, heSoZoom)} />;
}
