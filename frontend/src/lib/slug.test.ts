import { describe, expect, it } from 'vitest';
import { slugify } from './slug';

describe('slugify', () => {
  it.each([
    ['Orbit', 'orbit'],
    ['Поиск работы в IT', 'poisk-raboty-v-it'],
    ['Щука, жук & объезд!', 'schuka-zhuk-obezd'],
    ['  many   spaces  ', 'many-spaces'],
    ['C++ / 2026', 'c-2026'],
    ['!!!', ''],
  ])('%s -> %s', (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });

  it('fits the 64 character limit without a trailing dash', () => {
    const slug = slugify(`${'a'.repeat(63)} b`);
    expect(slug).toBe('a'.repeat(63));
  });
});
