// Fixed-size bitsets over service positions. One bit per service.
export type Bitset = Uint32Array;

export const createBitset = (size: number): Bitset => new Uint32Array(Math.ceil(size / 32));

export function fullBitset(size: number): Bitset {
  const b = createBitset(size);
  b.fill(0xffffffff);
  const tail = size % 32;
  if (tail !== 0) b[b.length - 1] = (1 << tail) - 1;
  return b;
}

export const setBit = (b: Bitset, i: number) => {
  b[i >>> 5]! |= 1 << (i & 31);
};

export function andInto(target: Bitset, other: Bitset): Bitset {
  for (let i = 0; i < target.length; i++) target[i]! &= other[i]!;
  return target;
}

export function orInto(target: Bitset, other: Bitset): Bitset {
  for (let i = 0; i < target.length; i++) target[i]! |= other[i]!;
  return target;
}

function popcount32(x: number): number {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return Math.imul(x, 0x01010101) >>> 24;
}

export function popcountAnd(a: Bitset, b: Bitset): number {
  let n = 0;
  for (let i = 0; i < a.length; i++) n += popcount32(a[i]! & b[i]!);
  return n;
}

export const popcount = (a: Bitset): number => popcountAnd(a, a);

export function forEachBit(b: Bitset, fn: (index: number) => void): void {
  for (let w = 0; w < b.length; w++) {
    let word = b[w]!;
    while (word !== 0) {
      const low = word & -word;
      fn((w << 5) + (31 - Math.clz32(low)));
      word ^= low;
    }
  }
}
