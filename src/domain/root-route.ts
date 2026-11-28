/** True when a root fragment should open the Secret Santa reveal. */
export function rootHasRevealHash(hash: string): boolean {
  return hash.length > 1;
}

/** Secret Santa page URL that keeps the same fragment. */
export function secretSantaRevealUrl(origin: string, base: string, hash: string): string {
  const prefix = base.endsWith("/") ? base : `${base}/`;
  const url = new URL(`${prefix}secret-santa/`, origin.endsWith("/") ? origin : `${origin}/`);
  url.hash = hash;
  return url.toString();
}
