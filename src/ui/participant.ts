import { christmasCountdown } from "../domain/calendar";
import { pageUrl } from "../domain/link";
import type { LinkPayload } from "../domain/types";
import { bowMark, el, hollyMark } from "./dom";

export function mountParticipant(root: HTMLElement, payload: LinkPayload): void {
  const notes = el("dl", { className: "notes" });
  if (payload.budget) notes.append(note("Budget", payload.budget));
  if (payload.exchangeDate) notes.append(note("Exchange", payload.exchangeDate));

  const present = el("div", { className: "present" }, [
    el("div", { className: "ribbon", attrs: { "aria-hidden": "true" } }),
    bowMark(),
    hollyMark(),
    el("h1", { className: "giftee", text: payload.receiverName }),
    el("p", {
      className: "on-gift",
      text: `${payload.giverName}, you're buying for ${payload.receiverName}.`,
    }),
  ]);
  if (notes.childNodes.length > 0) present.append(notes);
  present.append(
    el("p", { className: "countdown", text: christmasCountdown(new Date()) }),
    el("p", {
      className: "whisper",
      text: "This page is only your match. It doesn't include anyone else's.",
    }),
  );

  const lid = el("div", { className: "lid", attrs: { "aria-hidden": "true" } }, [bowMark()]);
  root.replaceChildren(
    el("main", { className: "shell slip" }, [el("article", { className: "gift" }, [present, lid])]),
  );
}

export function mountBrokenLink(root: HTMLElement): void {
  const home = el("a", {
    className: "primary action",
    text: "Start a draw",
    attrs: { href: homeHref() },
  });
  root.replaceChildren(
    el("main", { className: "shell slip" }, [
      el("article", { className: "gift" }, [
        el("div", { className: "present" }, [
          el("div", { className: "ribbon", attrs: { "aria-hidden": "true" } }),
          bowMark(),
          hollyMark(),
          el("h1", { className: "broken", text: "This link doesn't open" }),
          el("p", {
            className: "on-gift",
            text: "The address looks incomplete or out of date. Ask the organizer to send your link again.",
          }),
          el("p", { className: "countdown", text: christmasCountdown(new Date()) }),
          home,
        ]),
      ]),
    ]),
  );
}

function note(label: string, value: string): HTMLDivElement {
  return el("div", {}, [
    el("dt", { text: label }),
    el("dd", { text: value }),
  ]);
}

function homeHref(): string {
  return pageUrl("", location.origin, import.meta.env.BASE_URL);
}
