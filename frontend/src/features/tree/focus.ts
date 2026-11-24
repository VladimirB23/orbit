import type { NodeKey } from '@/lib/tree';

export function focusRow(key: NodeKey) {
  document.querySelector<HTMLElement>(`[role="row"][data-key="${key}"]`)?.focus();
}
