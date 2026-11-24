/** Light, dark or as in Windows. public/theme.js applies it before the first paint. */
import { useCallback, useEffect, useState } from 'react';

export type Theme = 'system' | 'light' | 'dark';
const KEY = 'orbit.theme';

function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

export function useTheme(): [Theme, (theme: Theme) => void, 'light' | 'dark'] {
  const [theme, setTheme] = useState(readTheme);
  const [systemDark, setSystemDark] = useState(
    () => matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const query = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemDark(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const dark = theme === 'dark' || (theme === 'system' && systemDark);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  const choose = useCallback((next: Theme) => {
    setTheme(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {}
  }, []);

  return [theme, choose, dark ? 'dark' : 'light'];
}
