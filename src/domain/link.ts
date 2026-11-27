import type { LinkPayload } from "./types";

const SALT = "hearth-note-v1";

interface StoredPayload {
  v: 1;
  giverName: string;
  receiverName: string;
  budget?: string;
  exchangeDate?: string;
}

/** Absolute page URL for one obfuscated fragment. */
export function pageUrl(token: string, origin: string, base: string): string {
  const url = new URL(base, origin.endsWith("/") ? origin : `${origin}/`);
  url.search = "";
  url.hash = token;
  return url.toString();
}

export function encodeLink(payload: LinkPayload): string {
  const stored: StoredPayload = {
    v: 1,
    giverName: payload.giverName,
    receiverName: payload.receiverName,
  };
  const budget = clean(payload.budget);
  const exchangeDate = clean(payload.exchangeDate);
  if (budget) stored.budget = budget;
  if (exchangeDate) stored.exchangeDate = exchangeDate;
  return toBase64Url(mask(new TextEncoder().encode(JSON.stringify(stored))));
}

export function decodeLink(token: string): LinkPayload | null {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(mask(fromBase64Url(token))));
    if (!isStored(parsed)) return null;
    if (parsed.giverName === parsed.receiverName) return null;
    const payload: LinkPayload = {
      giverName: parsed.giverName,
      receiverName: parsed.receiverName,
    };
    const budget = clean(parsed.budget);
    const exchangeDate = clean(parsed.exchangeDate);
    if (budget) payload.budget = budget;
    if (exchangeDate) payload.exchangeDate = exchangeDate;
    return payload;
  } catch {
    return null;
  }
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isStored(value: unknown): value is StoredPayload {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (record.v !== 1) return false;
  if (typeof record.giverName !== "string" || record.giverName.trim() === "") return false;
  if (typeof record.receiverName !== "string" || record.receiverName.trim() === "") return false;
  if (record.budget !== undefined && typeof record.budget !== "string") return false;
  if (record.exchangeDate !== undefined && typeof record.exchangeDate !== "string") return false;
  return true;
}

function mask(bytes: Uint8Array): Uint8Array {
  const salt = new TextEncoder().encode(SALT);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
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
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
