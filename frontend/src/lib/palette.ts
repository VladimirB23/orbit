/** What Ctrl+K finds and in which order. */
import { normalize } from './tree';

export interface Entry {
  id: string;
  title: string;
  /** Second line: where the thing lives. Searched too. */
  hint: string;
  /** Searched but not shown. */
  keywords: string;
  closed: boolean;
  /** Offered before anything is typed. */
  always: boolean;
}

const MAX = 50;

// The same physical keys in two layouts: "щкише" is "orbit" typed without switching.
const LATIN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.";
const CYRILLIC = 'йцукенгшщзхъфывапролджэячсмитьбю';

function otherLayout(text: string): string {
  return [...text]
    .map((char) => {
      const latin = LATIN.indexOf(char);
      if (latin >= 0) return CYRILLIC[latin];
      const cyrillic = CYRILLIC.indexOf(char);
      return cyrillic >= 0 ? LATIN[cyrillic] : char;
    })
    .join('');
}

/** Smaller is better, null is no match. */
function score(entry: Entry, query: string): number | null {
  const title = normalize(entry.title);
  const text = `${title} ${normalize(entry.hint)} ${normalize(entry.keywords)}`;
  const words = query.split(/\s+/);
  if (!words.every((word) => text.includes(word))) return null;
  let rating = 3;
  if (title.startsWith(query)) rating = 0;
  else if (title.includes(` ${query}`)) rating = 1;
  else if (words.every((word) => title.includes(word))) rating = 2;
  return rating + (entry.closed ? 0.5 : 0);
}

function search<T extends Entry>(entries: T[], query: string): T[] {
  return entries
    .flatMap((entry) => {
      const rating = score(entry, query);
      return rating === null ? [] : [{ entry, rating }];
    })
    .sort((a, b) => a.rating - b.rating)
    .slice(0, MAX)
    .map(({ entry }) => entry);
}

export function rank<T extends Entry>(entries: T[], raw: string): T[] {
  const query = normalize(raw).trim();
  if (query === '') return entries.filter((entry) => entry.always);
  const found = search(entries, query);
  return found.length > 0 ? found : search(entries, otherLayout(query));
}
