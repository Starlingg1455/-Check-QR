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

const sessionLabel = (s) => `B${s.sessionNo}`;
// Tên buổi cho tooltip: tránh lặp "Buổi 7: Buổi 7"
const sessionTitle = (s) => (s.title === `Buổi ${s.sessionNo}` ? s.title : `Buổi ${s.sessionNo}: ${s.title}`);

/* Cột chồng: số sinh viên theo trạng thái ở từng buổi */
export function SessionStackChart({ perSession }) {
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
  return <Bar data={data} options={scaleFonts(options, z)} />;
}

/* Đường: tỉ lệ đi học (%) theo buổi */
export function RateLineChart({ perSession }) {
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
  const options = baseOptions(c, { scales: { x: axes(c).x, y: axes(c, { min: 0, max: 100, ticks: { color: c.text2, font: { size: 14 }, callback: (v) => `${v}%` } }).y } });
  options.plugins.legend.display = false;
  options.plugins.tooltip.callbacks = {
    title: (items) => sessionTitle(perSession[items[0].dataIndex]),
    label: (item) => ` Tỉ lệ đi học: ${item.parsed.y}%`,
  };
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
      ctx.fillStyle = c.text;
      ctx.font = `700 28px ${getComputedStyle(document.body).fontFamily}`;
      ctx.fillText(avgRate === null ? '—' : `${avgRate}%`, x, y + 4);
      ctx.fillStyle = c.muted;
      ctx.font = `500 12px ${getComputedStyle(document.body).fontFamily}`;
      ctx.fillText('đi học', x, y + 24);
      ctx.restore();
    },
  };
  const options = baseOptions(c, { cutout: '70%', interaction: { mode: 'nearest', intersect: true } });
  return <Doughnut data={data} options={scaleFonts(options, z)} plugins={[center]} />;
}

/* Cột: có bao nhiêu sinh viên vắng 0, 1, 2... buổi (tô màu theo mức cảnh báo) */
export function AbsenceHistogram({ perStudent, absentLimit }) {
  const c = useColors();
  const { total: z } = useZoom();
  const max = Math.max(absentLimit + 2, ...perStudent.map((s) => s.absent));
  const labels = Array.from({ length: max + 1 }, (_, i) => String(i));
  const counts = labels.map((_, i) => perStudent.filter((s) => s.absent === i).length);
  const colorOf = (i) => (i > absentLimit ? c.critical : i === absentLimit && absentLimit > 0 ? c.serious : i === absentLimit - 1 && i > 0 ? c.warning : c.good);
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
    label: (item) => ` ${item.parsed.y} sinh viên`,
  };
  return <Bar data={data} options={scaleFonts(options, z)} />;
}
