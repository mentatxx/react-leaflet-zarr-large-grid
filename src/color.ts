export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const cache = new Map<string, Rgb | null>();

export function parseHexColor(input: string): Rgb | null {
  const cached = cache.get(input);
  if (cached !== undefined) return cached;
  const match = /^#([\da-fA-F]{6})$/.exec(input);
  const rgb = match
    ? {
        r: Number.parseInt(match[1].slice(0, 2), 16),
        g: Number.parseInt(match[1].slice(2, 4), 16),
        b: Number.parseInt(match[1].slice(4, 6), 16),
      }
    : null;
  if (cache.size > 256) cache.clear();
  cache.set(input, rgb);
  return rgb;
}
