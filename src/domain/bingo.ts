export const BINGO_FREE = "Free";
export const BINGO_CENTER = 12;

export const BINGO_MOMENTS = [
  "Someone spills eggnog",
  "A carol starts",
  "Someone wears a Santa hat",
  "A phone rings during dinner",
  "Someone refuses fruitcake",
  "The lights get tangled",
  "A child shakes a present",
  "Someone stands under mistletoe",
  "The dog steals a snack",
  "A cracker is pulled",
  "Someone sings off key",
  "Hot cocoa is poured",
  "A toast is made",
  "Someone arrives late",
  "A sweater gets a compliment",
  "Someone checks a phone",
  "The tree is admired",
  "A childhood story starts",
  "Someone asks for seconds",
  "A gift bow falls off",
  "Someone laughs until they snort",
  "The host looks for tape",
  "A candle is lit",
  "Snow is mentioned",
  "Someone offers to wash up",
  "A board game is suggested",
  "Dessert comes out",
  "A group photo is taken",
  "A baby is passed around",
  "Someone asks the plan",
  "A joke is told twice",
  "Wrapping paper covers the floor",
  "The remote goes missing",
  "The gravy is discussed",
  "A name is forgotten",
  "Someone says just a small slice",
] as const;

export interface BingoCard {
  seed: string;
  squares: readonly string[];
}

const LINES: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24],
  [0, 5, 10, 15, 20],
  [1, 6, 11, 16, 21],
  [2, 7, 12, 17, 22],
  [3, 8, 13, 18, 23],
  [4, 9, 14, 19, 24],
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
];

const SALT = "bingo-card-v1";

export function newSeed(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function cardFromSeed(seed: string): BingoCard | null {
  if (!/^[a-z0-9]{8,32}$/u.test(seed) || BINGO_MOMENTS.length < 24) return null;
  const shuffled = shuffle([...BINGO_MOMENTS], mulberry(hashSeed(seed)));
  const squares: string[] = [];
  let cursor = 0;
  for (let index = 0; index < 25; index += 1) {
    if (index === BINGO_CENTER) squares.push(BINGO_FREE);
    else squares.push(shuffled[cursor++] ?? "");
  }
  if (squares.some((square) => square.length === 0)) return null;
  return { seed, squares };
}

export function freshMarks(): boolean[] {
  return Array.from({ length: 25 }, (_, index) => index === BINGO_CENTER);
}

export function toggleMark(marked: readonly boolean[], index: number): boolean[] | null {
  if (marked.length !== 25 || index < 0 || index > 24 || index === BINGO_CENTER) return null;
  return marked.map((value, item) => (item === index ? !value : value));
}

export function bingoLines(marked: readonly boolean[]): number[][] {
  if (marked.length !== 25) return [];
  return LINES.filter((line) => line.every((index) => marked[index])).map((line) => [...line]);
}

export function hasBingo(marked: readonly boolean[]): boolean {
  return bingoLines(marked).length > 0;
}

export function encodeCard(seed: string): string | null {
  if (!cardFromSeed(seed)) return null;
  return toBase64Url(mask(new TextEncoder().encode(seed)));
}

export function decodeCard(token: string): string | null {
  try {
    const seed = new TextDecoder().decode(mask(fromBase64Url(token)));
    return cardFromSeed(seed) ? seed : null;
  } catch {
    return null;
  }
}

export function cardUrl(token: string, origin: string, base: string): string {
  const prefix = base.endsWith("/") ? base : `${base}/`;
  const url = new URL(`${prefix}bingo/`, origin.endsWith("/") ? origin : `${origin}/`);
  url.hash = token;
  return url.toString();
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.min(0.999999, Math.max(0, rng())) * (i + 1));
    const current = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = current;
  }
  return copy;
}

function mask(bytes: Uint8Array): Uint8Array {
  const salt = new TextEncoder().encode(SALT);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) {
    out[i] = bytes[i]! ^ salt[i % salt.length]! ^ ((i * 31 + 7) & 0xff);
  }
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function fromBase64Url(token: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(token)) throw new Error("bad token");
  const padded = token + "=".repeat((4 - (token.length % 4)) % 4);
  const binary = atob(padded.replaceAll("-", "+").replaceAll("_", "/"));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}
