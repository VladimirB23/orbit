/** State remembered in this browser. Broken or blocked storage never breaks the app. */
import { useCallback, useState } from 'react';

function read<T>(key: string, fallback: T, parse: (value: unknown) => T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : parse(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

export function usePersisted<T>(
  key: string,
  fallback: T,
  parse: (value: unknown) => T,
): [T, (update: (previous: T) => T) => void] {
  const [value, setValue] = useState(() => read(key, fallback, parse));
  const update = useCallback(
    (change: (previous: T) => T) =>
      setValue((previous) => {
        const next = change(previous);
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {}
        return next;
      }),
    [key],
  );
  return [value, update];
}

export const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v) => typeof v === 'string') : [];
export const asBoolean = (value: unknown): boolean => value === true;
