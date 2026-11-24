/** Single-key shortcuts. Physical keys, so they work in the Russian layout too. */

const NAMED: Record<string, string> = {
  Slash: '/',
  Delete: 'delete',
  F2: 'f2',
  Escape: 'escape',
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

export function hotkey(event: KeyboardEvent): string | null {
  if (event.ctrlKey || event.altKey || event.metaKey || event.defaultPrevented) return null;
  if (event.target instanceof Element && event.target.closest(QUIET)) return null;
  const letter = /^Key([A-Z])$/.exec(event.code)?.[1]?.toLowerCase();
  const key = letter ?? NAMED[event.code];
  if (key === undefined) return null;
  if (!event.shiftKey) return key;
  return key === '/' ? '?' : `shift+${key}`;
}
