/** What part of the time scale is in sight. Scrolling re-renders only who asks for it. */
import { type RefObject, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

export interface Viewport {
  /** Width of the visible time, without the names. */
  width: number;
  left: () => number;
  subscribe: (onChange: () => void) => () => void;
}

export function useViewport(
  scroller: RefObject<HTMLElement | null>,
  names: RefObject<HTMLElement | null>,
): Viewport {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const box = scroller.current;
    const side = names.current;
    if (!box || !side) return;
    const measure = () => setWidth(box.clientWidth - side.offsetWidth);
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(side);
    measure();
    return () => observer.disconnect();
  }, [scroller, names]);

  return useMemo(
    () => ({
      width,
      left: () => scroller.current?.scrollLeft ?? 0,
      subscribe: (onChange) => {
        const box = scroller.current;
        box?.addEventListener('scroll', onChange, { passive: true });
        return () => box?.removeEventListener('scroll', onChange);
      },
    }),
    [width, scroller],
  );
}

/** Which way something has gone out of sight, if it has. */
export function useOutOfSight(view: Viewport, from: number, to: number): 'left' | 'right' | null {
  return useSyncExternalStore(view.subscribe, () => {
    if (view.width === 0) return null;
    const left = view.left();
    if (to < left + 4) return 'left';
    return from > left + view.width - 4 ? 'right' : null;
  });
}
