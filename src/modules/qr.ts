/**
 * A small QR code encoder for links: byte mode, error correction level M, versions 1 to 6 (up to 106 bytes), the best of the eight masks.
 * It needs no library and no network; the matrix is drawn by the caller (see features/crm/ReferralQr).
 */

// version → [data codewords per block ... as [count, size] pairs], error-correction codewords per block, alignment centre (besides 6)
const BLOCKS: Record<number, { ec: number; blocks: [number, number][]; align: number | null }> = {
  1: { ec: 10, blocks: [[1, 16]], align: null },
  2: { ec: 16, blocks: [[1, 28]], align: 18 },
  3: { ec: 26, blocks: [[1, 44]], align: 22 },
  4: { ec: 18, blocks: [[2, 32]], align: 26 },
  5: { ec: 24, blocks: [[2, 43]], align: 30 },
  6: { ec: 16, blocks: [[4, 27]], align: 34 },
};
export const QR_MAX_BYTES = 106;

// Arithmetic in GF(256) with the polynomial 0x11D.
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x;
  LOG[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255] as number;
const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : (EXP[(LOG[a] as number) + (LOG[b] as number)] as number));

function reedSolomon(data: readonly number[], n: number): number[] {
  let gen = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array<number>(gen.length + 1).fill(0);
    gen.forEach((g, j) => {
      next[j] = (next[j] as number) ^ g;
      next[j + 1] = (next[j + 1] as number) ^ mul(g, EXP[i] as number);
    });
    gen = next;
  }
  const rem = new Array<number>(n).fill(0);
  for (const d of data) {
    const f = d ^ (rem.shift() as number);
    rem.push(0);
    if (f !== 0) for (let i = 0; i < n; i++) rem[i] = (rem[i] as number) ^ mul(gen[i + 1] as number, f);
  }
  return rem;
}

const MASKS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function formatBits(mask: number): number {
  const data = mask; // level M is 00
  let rem = data << 10;
  for (let i = 14; i >= 10; i--) if ((rem >> i) & 1) rem ^= 0x537 << (i - 10);
  return ((data << 10) | rem) ^ 0x5412;
}

function penalty(m: boolean[][]): number {
  const n = m.length;
  let p = 0;
  const line = (get: (i: number) => boolean) => {
    let run = 1;
    for (let i = 1; i < n; i++) {
      if (get(i) === get(i - 1)) run++;
      else {
        if (run >= 5) p += 3 + (run - 5);
        run = 1;
      }
    }
    if (run >= 5) p += 3 + (run - 5);
  };
  for (let r = 0; r < n; r++) line((i) => m[r]![i] as boolean);
  for (let c = 0; c < n; c++) line((i) => m[i]![c] as boolean);
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) if (m[r]![c] === m[r]![c + 1] && m[r]![c] === m[r + 1]![c] && m[r]![c] === m[r + 1]![c + 1]) p += 3;
  const pat = [true, false, true, true, true, false, true];
  const finder = (get: (i: number) => boolean, at: number) => pat.every((v, k) => get(at + k) === v);
  const quiet = (get: (i: number) => boolean, from: number) => [0, 1, 2, 3].every((k) => from + k < 0 || from + k >= n || !get(from + k));
  for (let a = 0; a < n; a++) {
    const row = (i: number) => m[a]![i] as boolean;
    const col = (i: number) => m[i]![a] as boolean;
    for (let i = 0; i + 7 <= n; i++) {
      for (const get of [row, col]) if (finder(get, i) && (quiet(get, i - 4) || quiet(get, i + 7))) p += 40;
    }
  }
  const dark = m.flat().filter(Boolean).length;
  p += Math.max(0, Math.ceil(Math.abs(dark * 20 - n * n * 10) / (n * n)) - 1) * 10;
  return p;
}

/** The modules of a QR code for `text` (true is dark), without the quiet zone. Throws when the text does not fit in 106 bytes. */
export function qrMatrix(text: string): boolean[][] {
  const bytes = [...new TextEncoder().encode(text)];
  const version = [1, 2, 3, 4, 5, 6].find((v) => {
    const cfg = BLOCKS[v] as (typeof BLOCKS)[number];
    return bytes.length <= cfg.blocks.reduce((n, [c, s]) => n + c * s, 0) - 2;
  });
  if (!version) throw new Error("The text is too long for the code");
  const cfg = BLOCKS[version] as (typeof BLOCKS)[number];
  const dataCount = cfg.blocks.reduce((n, [c, s]) => n + c * s, 0);

  // The bit stream: mode 0100, length (8 bits), the bytes, a terminator, then padding to the end.
  const bits: number[] = [];
  const push = (v: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((v >> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, 8);
  bytes.forEach((b) => push(b, 8));
  push(0, Math.min(4, dataCount * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const words: number[] = [];
  for (let i = 0; i < bits.length; i += 8) words.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let pad = 0; words.length < dataCount; pad++) words.push(pad % 2 === 0 ? 0xec : 0x11);

  // Blocks, their error-correction words, and the two interleaved.
  const dataBlocks: number[][] = [];
  let at = 0;
  for (const [count, size] of cfg.blocks) for (let i = 0; i < count; i++, at += size) dataBlocks.push(words.slice(at, at + size));
  const ecBlocks = dataBlocks.map((b) => reedSolomon(b, cfg.ec));
  const stream: number[] = [];
  for (let i = 0; i < Math.max(...dataBlocks.map((b) => b.length)); i++) for (const b of dataBlocks) if (i < b.length) stream.push(b[i] as number);
  for (let i = 0; i < cfg.ec; i++) for (const b of ecBlocks) stream.push(b[i] as number);
  const dataBits: boolean[] = stream.flatMap((w) => Array.from({ length: 8 }, (_, i) => ((w >> (7 - i)) & 1) === 1));

  const n = 17 + 4 * version;
  const m: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const fn: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const set = (x: number, y: number, dark: boolean) => {
    if (x < 0 || y < 0 || x >= n || y >= n) return;
    (m[y] as boolean[])[x] = dark;
    (fn[y] as boolean[])[x] = true;
  };
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      set(cx + dx, cy + dy, d !== 2 && d !== 4);
    }
  };
  finder(3, 3);
  finder(n - 4, 3);
  finder(3, n - 4);
  for (let i = 0; i < n; i++) {
    if (!(fn[6] as boolean[])[i]) set(i, 6, i % 2 === 0);
    if (!(fn[i] as boolean[])[6]) set(6, i, i % 2 === 0);
  }
  if (cfg.align) {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cfg.align + dx, cfg.align + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  // Reserve the format areas (written below once the mask is known) and the dark module.
  const format = (mask: number) => {
    const b = formatBits(mask);
    const bit = (i: number) => ((b >> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(n - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, n - 15 + i, bit(i));
    set(8, n - 8, true);
  };
  format(0);

  // The data, in the zigzag of two-column stripes from the bottom right.
  const cells: [number, number][] = [];
  for (let right = n - 1, up = true; right >= 1; right -= 2, up = !up) {
    if (right === 6) right = 5;
    for (let k = 0; k < n; k++) {
      const y = up ? n - 1 - k : k;
      for (const x of [right, right - 1]) if (!(fn[y] as boolean[])[x]) cells.push([x, y]);
    }
  }
  cells.forEach(([x, y], i) => ((m[y] as boolean[])[x] = dataBits[i] ?? false));

  let best: boolean[][] | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const t = m.map((row) => [...row]);
    for (const [x, y] of cells) if ((MASKS[mask] as (r: number, c: number) => boolean)(y, x)) (t[y] as boolean[])[x] = !(t[y] as boolean[])[x];
    // Format bits for this mask, written on the copy.
    const b = formatBits(mask);
    const bit = (i: number) => ((b >> i) & 1) === 1;
    const w = (x: number, y: number, v: boolean) => ((t[y] as boolean[])[x] = v);
    for (let i = 0; i <= 5; i++) w(8, i, bit(i));
    w(8, 7, bit(6));
    w(8, 8, bit(7));
    w(7, 8, bit(8));
    for (let i = 9; i < 15; i++) w(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) w(n - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) w(8, n - 15 + i, bit(i));
    w(8, n - 8, true);
    const score = penalty(t);
    if (score < bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best as boolean[][];
}
