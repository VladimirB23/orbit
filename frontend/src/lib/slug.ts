/** Project slug from its name: "Поиск работы" -> "poisk-raboty". */

const LETTERS: Record<string, string> = Object.fromEntries(
  [
    'а:a б:b в:v г:g д:d е:e ж:zh з:z и:i й:y к:k л:l м:m н:n о:o п:p р:r с:s т:t у:u ф:f',
    'х:h ц:ts ч:ch ш:sh щ:sch ъ: ы:y ь: э:e ю:yu я:ya \u0451:e',
  ]
    .join(' ')
    .split(' ')
    .map((pair) => pair.split(':') as [string, string]),
);

const SLUG_MAX = 64;

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(name: string): string {
  return [...name.toLowerCase()]
    .map((char) => LETTERS[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, SLUG_MAX)
    .replace(/^-+|-+$/g, '');
}
