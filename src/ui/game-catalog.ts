import type { GameLink } from "./game-link";

interface GameModule {
  link: GameLink;
}

function isGameModule(value: unknown): value is GameModule {
  if (typeof value !== "object" || value === null || !("link" in value)) return false;
  const link: unknown = value.link;
  if (typeof link !== "object" || link === null) return false;
  if (!("order" in link) || !("href" in link) || !("label" in link)) return false;
  if (!("pitch" in link) || !("guide" in link)) return false;
  return (
    typeof link.order === "number" &&
    typeof link.href === "string" &&
    link.href.length > 0 &&
    typeof link.label === "string" &&
    link.label.length > 0 &&
    typeof link.pitch === "string" &&
    link.pitch.length > 0 &&
    typeof link.guide === "string" &&
    link.guide.startsWith("how-to/")
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
