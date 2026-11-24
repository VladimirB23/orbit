/** Single-key shortcuts. Physical keys, so they work in the Russian layout too. */

const NAMED: Record<string, string> = {
  Slash: '/',
  Delete: 'delete',
  F2: 'f2',
  Escape: 'escape',
  BracketLeft: '[',
  BracketRight: ']',
  Equal: '+',
  NumpadAdd: '+',
  Minus: '-',
  NumpadSubtract: '-',
};

const QUIET = [
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]',
  '[role="menu"]',
  '[role="dialog"]',
  '[role="alertdialog"]',
].join(',');

/** A window that is closing still holds the focus for a moment, but the keys are free again. */
function isQuiet(target: EventTarget | null): boolean {
  const place = target instanceof Element ? target.closest(QUIET) : null;
  return place !== null && place.getAttribute('data-state') !== 'closed';
}

/** Ctrl+K works everywhere, even inside a field: the palette is the way out of it. */
export const isPaletteKey = (event: KeyboardEvent): boolean =>
  event.code === 'KeyK' && (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey;

/** Not inside a field or a window: there the browser takes back typed text. */
export function undoKey(event: KeyboardEvent): 'undo' | 'redo' | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.defaultPrevented) return null;
  if (isQuiet(event.target)) return null;
  if (event.code === 'KeyZ') return event.shiftKey ? 'redo' : 'undo';
  return event.code === 'KeyY' && !event.shiftKey ? 'redo' : null;
}

export function hotkey(event: KeyboardEvent): string | null {
  if (event.ctrlKey || event.altKey || event.metaKey || event.defaultPrevented) return null;
  if (isQuiet(event.target)) return null;
  const letter = /^Key([A-Z])$/.exec(event.code)?.[1]?.toLowerCase();
  const key = letter ?? NAMED[event.code];
  if (key === undefined) return null;
  if (!event.shiftKey) return key;
  if (key === '+') return key; // Shift+= is how a plus is typed
  return key === '/' ? '?' : `shift+${key}`;
}
