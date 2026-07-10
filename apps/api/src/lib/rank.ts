// Minimal fractional-indexing rank generator for Kanban ordering: produces a
// string that sorts lexicographically between two existing ranks without
// needing to renumber every row on each drag. Good enough depth for a
// single-column drag-and-drop UI; a full base62 midpoint algorithm can
// replace this if ranks ever need to be regenerated at scale.
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

export function rankBetween(a: string | null, b: string | null): string {
  if (!a && !b) return 'm';
  if (!a) return before(b as string);
  if (!b) return after(a);
  return midpoint(a, b);
}

function before(key: string): string {
  const first = key.charCodeAt(0);
  if (first > ALPHABET.charCodeAt(0)) {
    return String.fromCharCode(first - 1);
  }
  return 'a' + key;
}

function after(key: string): string {
  const last = key.charCodeAt(key.length - 1);
  if (last < ALPHABET.charCodeAt(ALPHABET.length - 1)) {
    return key.slice(0, -1) + String.fromCharCode(last + 1);
  }
  return key + 'm';
}

function midpoint(a: string, b: string): string {
  let result = '';
  let i = 0;
  while (true) {
    const ca = a.charCodeAt(i) || ALPHABET.charCodeAt(0);
    const cb = b.charCodeAt(i) || ALPHABET.charCodeAt(ALPHABET.length - 1) + 1;
    if (cb - ca > 1) {
      result += String.fromCharCode(Math.floor((ca + cb) / 2));
      return result;
    }
    result += String.fromCharCode(ca);
    i += 1;
  }
}
