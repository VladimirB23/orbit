import type { NodeKey } from '@/lib/tree';

export function focusRow(key: NodeKey) {
  document.querySelector<HTMLElement>(`[role="row"][data-key="${key}"]`)?.focus();
}

/** A row that is about to appear: its branch is opening right now. */
export function focusRowSoon(key: NodeKey, frames = 10) {
  requestAnimationFrame(() => {
    focusRow(key);
    const there = (document.activeElement as HTMLElement | null)?.dataset.key === key;
    if (!there && frames > 0) focusRowSoon(key, frames - 1);
  });
}
