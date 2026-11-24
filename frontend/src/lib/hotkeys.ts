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

/** Ctrl+K works everywhere, even inside a field: the palette is the way out of it. */
export const isPaletteKey = (event: KeyboardEvent): boolean =>
  event.code === 'KeyK' && (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey;

export function hotkey(event: KeyboardEvent): string | null {
  if (event.ctrlKey || event.altKey || event.metaKey || event.defaultPrevented) return null;
  if (event.target instanceof Element && event.target.closest(QUIET)) return null;
  const letter = /^Key([A-Z])$/.exec(event.code)?.[1]?.toLowerCase();
  const key = letter ?? NAMED[event.code];
  if (key === undefined) return null;
  if (!event.shiftKey) return key;
  if (key === '+') return key; // Shift+= is how a plus is typed
  return key === '/' ? '?' : `shift+${key}`;
}
