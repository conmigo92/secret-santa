import { SITE_NAME } from "../site";
import { el } from "./dom";
import type { GameLink } from "./game-link";
import { gameLinks } from "./game-catalog";
import "./site-nav.css";

export function mountSiteNav(parent: HTMLElement): void {
  const nav = el("nav", { className: "site-nav", attrs: { "aria-label": "Games" } });
  const base = import.meta.env.BASE_URL;
  const here = currentPage();
  const items: Pick<GameLink, "href" | "label">[] = [{ href: "", label: SITE_NAME }, ...gameLinks()];
  for (const link of items) {
    const anchor = el("a", { text: link.label, attrs: { href: `${base}${link.href}` } });
    if (link.href === here) anchor.setAttribute("aria-current", "page");
    nav.append(anchor);
  }
  parent.prepend(nav);
  const current = nav.querySelector("[aria-current='page']");
  if (current instanceof HTMLElement) {
    queueMicrotask(() => {
      if (current.isConnected) current.scrollIntoView({ inline: "nearest", block: "nearest" });
    });
  }
}

function currentPage(): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  let path = location.pathname;
  if (path.startsWith(base)) path = path.slice(base.length);
  path = path.replace(/^\//, "").replace(/index\.html$/, "");
  if (path.endsWith("/")) path = path.slice(0, -1);
  return path === "" ? "" : `${path}/`;
}
