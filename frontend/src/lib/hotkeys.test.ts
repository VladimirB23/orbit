import { describe, expect, it } from 'vitest';
import { hotkey } from './hotkeys';

const press = (init: KeyboardEventInit, target: HTMLElement = document.body) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, ...init });
  target.dispatchEvent(event);
  return hotkey(event);
};

describe('hotkey', () => {
  it('works in any keyboard layout because it reads the physical key', () => {
    expect(press({ code: 'KeyS', key: 'ы' })).toBe('s');
    expect(press({ code: 'KeyN', key: 'т' })).toBe('n');
    expect(press({ code: 'Slash', key: '.' })).toBe('/');
  });

  it('tells Shift combinations apart', () => {
    expect(press({ code: 'KeyN', shiftKey: true })).toBe('shift+n');
    expect(press({ code: 'Slash', shiftKey: true })).toBe('?');
  });

  it('leaves browser shortcuts alone', () => {
    expect(press({ code: 'KeyS', ctrlKey: true })).toBeNull();
    expect(press({ code: 'KeyS', altKey: true })).toBeNull();
    expect(press({ code: 'KeyS', metaKey: true })).toBeNull();
  });

  it('is silent while the user is typing', () => {
    for (const tag of ['input', 'textarea']) {
      const field = document.body.appendChild(document.createElement(tag));
      expect(press({ code: 'KeyS' }, field)).toBeNull();
    }
  });

  it('is silent inside open menus and dialogs', () => {
    const menu = document.body.appendChild(document.createElement('div'));
    menu.setAttribute('role', 'menu');
    expect(press({ code: 'KeyS' }, menu.appendChild(document.createElement('div')))).toBeNull();
  });
});
