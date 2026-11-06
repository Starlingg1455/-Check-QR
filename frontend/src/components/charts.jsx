// Các biểu đồ Chart.js. Màu lấy từ biến CSS nên đổi giao diện sáng/tối là biểu đồ đổi theo.
import { useMemo } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend, Filler,
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { useTheme } from '../theme.jsx';
import { useZoom } from '../zoom.jsx';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend, Filler);

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const alpha = (hex, a) => {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

function useColors() {
  const { theme } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => ({
    text: css('--text'), text2: css('--text-2'), muted: css('--muted'), grid: css('--grid'), surface: css('--surface'),
    border: css('--border-strong'), accent: css('--accent'),
    good: css('--good'), warning: css('--warning'), serious: css('--serious'), critical: css('--critical'), info: css('--info'),
  }), [theme]);
}

function baseOptions(c, extra = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    animation: { duration: 500 },
    font: { family: getComputedStyle(document.body).fontFamily },
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: c.text2, usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 9, boxHeight: 9, padding: 18, font: { size: 15 } },
      },
      tooltip: {
        backgroundColor: c.surface, titleColor: c.text, bodyColor: c.text2, borderColor: c.border, borderWidth: 1,
        padding: 12, cornerRadius: 10, boxPadding: 6, usePointStyle: true, titleFont: { size: 15, weight: '600' }, bodyFont: { size: 14 },
      },
    },
    ...extra,
  };
}

const axes = (c, yExtra = {}) => ({
  x: { grid: { display: false }, border: { color: c.grid }, ticks: { color: c.text2, font: { size: 14 } } },
  y: { grid: { color: c.grid }, border: { display: false }, ticks: { color: c.text2, font: { size: 14 }, precision: 0 }, ...yExtra },
});

// Khung biểu đồ đối zoom nên chữ trong biểu đồ phải tự nhân theo hệ số phóng to của giao diện
function scaleFonts(node, z) {
  if (z === 1 || !node || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map((n) => scaleFonts(n, z));
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if ((k === 'font' || k === 'titleFont' || k === 'bodyFont') && v && typeof v.size === 'number') out[k] = { ...v, size: Math.round(v.size * z * 10) / 10 };
    else if (k === 'padding' && typeof v === 'number') out[k] = Math.round(v * z);
    else out[k] = typeof v === 'object' && v !== null && !(v instanceof Function) ? scaleFonts(v, z) : v;
  }
  return out;
}

// Rê chuột lên phần tử bấm được thì đổi con trỏ thành bàn tay
const pointerOnHover = (evt, elements) => {
  const el = evt.native?.target;
  if (el) el.style.cursor = elements.length ? 'pointer' : 'default';
};
const STATUS_KEYS = ['present', 'late', 'excused', 'absent'];

const sessionLabel = (s) => `B${s.sessionNo}`;
// Tên buổi cho tooltip: tránh lặp "Buổi 7: Buổi 7"
const sessionTitle = (s) => (s.title === `Buổi ${s.sessionNo}` ? s.title : `Buổi ${s.sessionNo}: ${s.title}`);

/* Cột chồng: số sinh viên theo trạng thái ở từng buổi */
export function SessionStackChart({ perSession, onSelect }) {
  const c = useColors();
  const { total: z } = useZoom();
  const data = {
    labels: perSession.map(sessionLabel),
    datasets: [
      { label: 'Có mặt', data: perSession.map((s) => s.present), backgroundColor: c.good },
      { label: 'Đi trễ', data: perSession.map((s) => s.late), backgroundColor: c.warning },
      { label: 'Vắng có phép', data: perSession.map((s) => s.excused), backgroundColor: c.info },
      { label: 'Vắng', data: perSession.map((s) => s.absent), backgroundColor: c.critical },
    ].map((d) => ({ ...d, borderColor: c.surface, borderWidth: 2, borderRadius: 4, borderSkipped: false, maxBarThickness: 36 })),
  };
  const options = baseOptions(c, {
    scales: { x: { ...axes(c).x, stacked: true }, y: { ...axes(c).y, stacked: true } },
  });
  options.plugins.tooltip.callbacks = { title: (items) => sessionTitle(perSession[items[0].dataIndex]) };
  if (onSelect) {
    options.onHover = pointerOnHover;
    // Bấm vào đúng đoạn màu nào thì chọn trạng thái đó; bấm vào khoảng trống của cột thì chỉ chọn buổi
    options.onClick = (evt, els, chart) => {
      const hit = chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true)[0];
      const index = hit ? hit.index : els[0]?.index;
      if (index !== undefined) onSelect(index, hit ? STATUS_KEYS[hit.datasetIndex] : null);
    };
  }
  return <Bar data={data} options={scaleFonts(options, z)} />;
}

/* Đường: tỉ lệ đi học (%) theo buổi */
export function RateLineChart({ perSession, onSelect }) {
  const c = useColors();
  const { total: z } = useZoom();
  const data = {
    labels: perSession.map(sessionLabel),
    datasets: [{
      label: 'Tỉ lệ đi học (%)',
      data: perSession.map((s) => s.rate),
      borderColor: c.accent, backgroundColor: alpha(c.accent, 0.12), borderWidth: 2.5, tension: 0.35, fill: true,
      pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: c.accent, pointBorderColor: c.surface, pointBorderWidth: 2,
    }],
  };
  // Trục dọc bắt đầu gần mức thấp nhất (không phí nửa biểu đồ cho khoảng 0-60%), luôn kết thúc ở 100%
  const lowest = Math.min(...perSession.map((s) => s.rate ?? 100));
  const yMin = Math.max(0, Math.floor((lowest - 10) / 10) * 10);
  const options = baseOptions(c, { scales: { x: axes(c).x, y: axes(c, { min: yMin, max: 100, ticks: { color: c.text2, font: { size: 14 }, stepSize: 10, callback: (v) => `${v}%` } }).y } });
  options.plugins.legend.display = false;
  options.plugins.tooltip.callbacks = {
    title: (items) => sessionTitle(perSession[items[0].dataIndex]),
    label: (item) => { const s = perSession[item.dataIndex]; return ` ${item.parsed.y}%  ·  ${s.present + s.late}/${s.present + s.late + s.excused + s.absent} sinh viên có mặt`; },
    footer: () => (onSelect ? 'Bấm để xem chi tiết' : ''),
  };
  if (onSelect) {
    // Bấm vào điểm hoặc bất kỳ chỗ nào trong cột của buổi đó đều mở chi tiết buổi
    options.onHover = pointerOnHover;
    options.onClick = (_evt, els) => { if (els[0]) onSelect(els[0].index); };
  }
  return <Line data={data} options={scaleFonts(options, z)} />;
}

/* Vành khuyên: cơ cấu trạng thái của tất cả lượt điểm danh, số % ở giữa */
export function StatusDonut({ overall, avgRate }) {
  const c = useColors();
  const { total: z } = useZoom();
  const data = {
    labels: ['Có mặt', 'Đi trễ', 'Vắng có phép', 'Vắng'],
    datasets: [{
      data: [overall.present, overall.late, overall.excused, overall.absent],
      backgroundColor: [c.good, c.warning, c.info, c.critical], borderColor: c.surface, borderWidth: 3, hoverOffset: 4,
    }],
  };
  const center = {
    id: 'center',
    afterDraw(chart) {
      const { ctx, chartArea: a } = chart;
      const x = (a.left + a.right) / 2;
      const y = (a.top + a.bottom) / 2;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = c.text;
      ctx.font = `700 ${Math.round(44 * z)}px ${getComputedStyle(document.body).fontFamily}`;
      ctx.fillText(avgRate === null ? '—' : `${avgRate}%`, x, y);
      ctx.restore();
    },
  };
  const options = baseOptions(c, { cutout: '72%', interaction: { mode: 'nearest', intersect: true } });
  options.plugins.legend.display = false; // chỉ hình tròn + phần trăm; chú thích nằm ở màn hình chi tiết
  return <Doughnut data={data} options={scaleFonts(options, z)} plugins={[center]} />;
}

/* Cột: có bao nhiêu sinh viên vắng 0, 1, 2... buổi (tô màu theo mức cảnh báo) */
export function AbsenceHistogram({ perStudent, absentLimit, onSelect }) {
  const c = useColors();
  const { total: z } = useZoom();
  const max = Math.max(absentLimit + 2, ...perStudent.map((s) => s.absent));
  const labels = Array.from({ length: max + 1 }, (_, i) => String(i));
  const counts = labels.map((_, i) => perStudent.filter((s) => s.absent === i).length);
  const levelAt = (i) => (i > absentLimit ? 'banned' : i === absentLimit && absentLimit > 0 ? 'danger' : i === absentLimit - 1 && i > 0 ? 'warning' : 'ok');
  const LEVEL_TEXT = { ok: 'Bình thường', warning: 'Cần chú ý', danger: 'Sắp cấm thi', banned: 'Vượt giới hạn' };
  const levelColor = { ok: c.good, warning: c.warning, danger: c.serious, banned: c.critical };
  const colorOf = (i) => levelColor[levelAt(i)];
  const data = {
    labels,
    datasets: [{
      label: 'Số sinh viên', data: counts, backgroundColor: labels.map((_, i) => colorOf(i)),
      borderColor: c.surface, borderWidth: 2, borderRadius: 6, borderSkipped: false, maxBarThickness: 40,
    }],
  };
  const options = baseOptions(c, { scales: axes(c) });
  options.plugins.legend.display = false;
  options.plugins.tooltip.callbacks = {
    title: (items) => `Vắng ${items[0].label} buổi`,
    label: (item) => ` ${item.parsed.y} sinh viên · ${LEVEL_TEXT[levelAt(item.dataIndex)]}`,
    footer: (items) => (onSelect && counts[items[0].dataIndex] > 0 ? 'Bấm để xem danh sách' : ''),
  };
  if (onSelect) {
    options.interaction = { mode: 'nearest', intersect: false, axis: 'x' };
    options.onHover = (evt, els) => pointerOnHover(evt, els.filter((e) => counts[e.index] > 0));
    options.onClick = (_evt, els) => { if (els[0] && counts[els[0].index] > 0) onSelect(els[0].index); };
  }
  return <Bar data={data} options={scaleFonts(options, z)} />;
}
