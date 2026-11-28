import type { GameLink } from "./game-link";
import { el } from "./dom";
import "./site-nav.css";

interface GameModule {
  link: GameLink;
}

function isGameModule(value: unknown): value is GameModule {
  if (typeof value !== "object" || value === null || !("link" in value)) return false;
  const link: unknown = value.link;
  if (typeof link !== "object" || link === null) return false;
  if (!("order" in link) || !("href" in link) || !("label" in link)) return false;
  return (
    typeof link.order === "number" && typeof link.href === "string" && typeof link.label === "string"
  );
}

export function gameLinks(): GameLink[] {
  const loaded = import.meta.glob("../nav-entries/*.ts", { eager: true });
  const links: GameLink[] = [];
  for (const mod of Object.values(loaded)) {
    if (isGameModule(mod)) links.push(mod.link);
  }
  links.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  return links;
}

const guides: Record<string, string> = {
  "": "how-to/secret-santa/",
  "white-elephant/": "how-to/white-elephant/",
  "dirty-santa/": "how-to/dirty-santa/",
};

export function mountSiteNav(parent: HTMLElement): void {
  const nav = el("nav", { className: "site-nav", attrs: { "aria-label": "Games" } });
  const base = import.meta.env.BASE_URL;
  const here = currentPage();
  for (const link of gameLinks()) {
    const anchor = el("a", { text: link.label, attrs: { href: `${base}${link.href}` } });
    if (link.href === here) anchor.setAttribute("aria-current", "page");
    nav.append(anchor);
  }
  const guide = guideHref(here);
  if (guide) {
    const anchor = el("a", {
      className: "guide-link",
      text: "How to play",
      attrs: { href: `${base}${guide}` },
    });
    if (guide === here) anchor.setAttribute("aria-current", "page");
    nav.append(anchor);
  }
  parent.prepend(nav);
}

function guideHref(here: string): string | null {
  if (here.startsWith("how-to/")) return here;
  return guides[here] ?? null;
}

function currentPage(): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  let path = location.pathname;
  if (path.startsWith(base)) path = path.slice(base.length);
  path = path.replace(/^\//, "").replace(/index\.html$/, "");
  if (path.endsWith("/")) path = path.slice(0, -1);
  return path === "" ? "" : `${path}/`;
}
