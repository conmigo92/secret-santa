import "@fontsource/bricolage-grotesque/latin-600.css";
import "@fontsource/figtree/latin-400.css";
import "@fontsource/figtree/latin-600.css";
import { decodeLink } from "./domain/link";
import "./style.css";
import { mountOrganizer } from "./ui/organizer";
import { mountBrokenLink, mountParticipant } from "./ui/participant";

const root = document.querySelector("#app");
if (!(root instanceof HTMLElement)) throw new Error("Missing #app");

show(root);
window.addEventListener("hashchange", () => show(root));

function show(root: HTMLElement): void {
  const token = readToken();
  if (!token) {
    document.title = "Secret Santa";
    mountOrganizer(root);
    return;
  }
  const payload = decodeLink(token);
  if (!payload) {
    document.title = "Link doesn't open";
    mountBrokenLink(root);
    return;
  }
  document.title = "Your Secret Santa match";
  mountParticipant(root, payload);
}

function readToken(): string {
  if (location.hash.length <= 1) return "";
  try {
    return decodeURIComponent(location.hash.slice(1));
  } catch {
    return location.hash.slice(1);
  }
}
