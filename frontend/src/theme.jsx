import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const ThemeContext = createContext(null);
export const useTheme = () => useContext(ThemeContext);

const systemDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches;

export function ThemeProvider({ children }) {
  // 'light' | 'dark' | null (theo hệ điều hành)
  const [choice, setChoice] = useState(() => {
    try { const t = localStorage.getItem('theme'); return t === 'light' || t === 'dark' ? t : null; } catch { return null; }
  });
  const [osDark, setOsDark] = useState(systemDark());

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setOsDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const resolved = choice || (osDark ? 'dark' : 'light');

  const toggle = useCallback(() => {
    const next = resolved === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next); // đặt trước để biểu đồ đọc đúng màu
    try { localStorage.setItem('theme', next); } catch { /* bỏ qua */ }
    setChoice(next);
  }, [resolved]);

  return <ThemeContext.Provider value={{ theme: resolved, toggle }}>{children}</ThemeContext.Provider>;
}
