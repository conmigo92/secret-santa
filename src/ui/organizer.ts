import { drawAssignments } from "../domain/draw";
import { addExclusion, removeExclusion, removeParticipant } from "../domain/exclusions";
import { encodeLink, pageUrl } from "../domain/link";
import { addParticipant } from "../domain/participants";
import type { Exclusion, LinkPayload, Participant } from "../domain/types";
import { el, envelopeMark } from "./dom";

export function mountOrganizer(root: HTMLElement): void {
  let participants: Participant[] = [];
  let exclusions: Exclusion[] = [];

  const peopleList = el("ul", { className: "rows" });
  const peopleEmpty = el("p", { className: "quiet", text: "No one yet." });
  const nameError = alert();
  const nameInput = el("input", {
    attrs: {
      id: "person-name",
      name: "person-name",
      type: "text",
      maxlength: "40",
      autocomplete: "name",
      placeholder: "Name",
    },
  });

  const personForm = el("form", { className: "stack" }, [
    el("label", { className: "heading", text: "People", attrs: { for: "person-name" } }),
    el("p", { className: "quiet", text: "Everyone who is exchanging gifts." }),
    el("div", { className: "inline" }, [
      nameInput,
      el("button", { className: "primary", text: "Add", attrs: { type: "submit" } }),
    ]),
    nameError,
    peopleEmpty,
    peopleList,
  ]);

  const selectA = el("select", { attrs: { id: "exclude-a" } });
  const selectB = el("select", { attrs: { id: "exclude-b" } });
  const excludeButton = el("button", {
    className: "primary",
    text: "Exclude",
    attrs: { type: "submit" },
  });
  const exclusionError = alert();
  const pairList = el("ul", { className: "rows" });
  const pairEmpty = el("p", { className: "quiet", text: "No exclusions yet." });

  const excludeForm = el("form", { className: "stack" }, [
    el("h2", { text: "Exclusions" }),
    el("p", {
      className: "quiet",
      text: "Two people who must not draw each other. An exclusion goes both ways.",
    }),
    el("div", { className: "exclude-row" }, [
      field("First person", "exclude-a", selectA),
      field("Second person", "exclude-b", selectB),
      excludeButton,
    ]),
    exclusionError,
    pairEmpty,
    pairList,
  ]);

  const budgetInput = el("input", {
    attrs: { id: "budget", name: "budget", type: "text", placeholder: "$25", autocomplete: "off" },
  });
  const dateInput = el("input", {
    attrs: {
      id: "exchange-date",
      name: "exchange-date",
      type: "text",
      placeholder: "Christmas Eve, after dinner",
      autocomplete: "off",
    },
  });

  const notes = el("div", { className: "stack" }, [
    el("h2", { text: "Note" }),
    el("p", { className: "quiet", text: "Optional. Copied onto every private link." }),
    field("Budget", "budget", budgetInput),
    field("Exchange", "exchange-date", dateInput),
  ]);

  const drawError = alert();
  const drawButton = el("button", {
    className: "primary draw",
    text: "Draw names",
    attrs: { type: "button" },
  });
  const linkList = el("ul", { className: "rows links" });
  const results = el("section", { className: "stack", attrs: { id: "results" } }, [
    el("h2", { text: "Private links" }),
    el("p", {
      className: "quiet",
      text: "Send each person only their own link. Drawing again makes new links. A link you already sent still shows the old match.",
    }),
    linkList,
  ]);
  results.hidden = true;

  const shell = el("main", { className: "shell" }, [
    el("header", { className: "mast" }, [
      envelopeMark(),
      el("h1", {}, [text("Secret"), el("span", { text: "Santa" })]),
      el("p", {
        className: "lede",
        text: "Add the people exchanging gifts, mark anyone who must not draw each other, then draw. Copy each private link to the person it names.",
      }),
    ]),
    personForm,
    excludeForm,
    notes,
    drawButton,
    drawError,
    results,
  ]);

  root.replaceChildren(shell);

  personForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const added = addParticipant(participants, nameInput.value);
    if ("error" in added) {
      show(nameError, added.error);
      nameInput.setAttribute("aria-invalid", "true");
      return;
    }
    hide(nameError);
    nameInput.removeAttribute("aria-invalid");
    participants = added.participants;
    nameInput.value = "";
    clearResults();
    sync();
    nameInput.focus();
  });

  excludeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const added = addExclusion(participants, exclusions, selectA.value, selectB.value);
    if ("error" in added) {
      show(exclusionError, added.error);
      return;
    }
    hide(exclusionError);
    exclusions = added.exclusions;
    clearResults();
    sync();
  });

  for (const input of [budgetInput, dateInput]) {
    input.addEventListener("input", () => {
      if (!results.hidden) clearResults();
    });
  }

  drawButton.addEventListener("click", () => {
    clearResults();
    const drawn = drawAssignments(participants, exclusions);
    if (!drawn.ok) {
      show(drawError, drawn.reason);
      return;
    }

    const receiverByGiver = new Map(
      drawn.assignments.map((assignment) => [assignment.giverId, assignment.receiverId]),
    );
    const budget = budgetInput.value.trim();
    const exchangeDate = dateInput.value.trim();
    linkList.replaceChildren();

    for (const person of participants) {
      const receiver = participants.find((candidate) => candidate.id === receiverByGiver.get(person.id));
      if (!receiver) {
        show(drawError, "The draw didn't include everyone. Try again.");
        return;
      }
      const payload: LinkPayload = {
        giverName: person.name,
        receiverName: receiver.name,
      };
      if (budget) payload.budget = budget;
      if (exchangeDate) payload.exchangeDate = exchangeDate;
      const url = pageUrl(encodeLink(payload), location.origin, import.meta.env.BASE_URL);
      linkList.append(linkRow(person.name, url));
    }

    results.hidden = false;
    results.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  sync();

  function sync(): void {
    renderPeople();
    renderPairs();
    renderSelects();
    const ready = participants.length >= 2;
    drawButton.disabled = !ready;
    excludeButton.disabled = !ready;
    selectA.disabled = !ready;
    selectB.disabled = !ready;
  }

  function renderPeople(): void {
    peopleEmpty.hidden = participants.length > 0;
    peopleList.replaceChildren(
      ...participants.map((person) => {
        const remove = el("button", {
          className: "ghost",
          text: "Remove",
          attrs: { type: "button" },
        });
        remove.addEventListener("click", () => {
          const next = removeParticipant(participants, exclusions, person.id);
          participants = next.participants;
          exclusions = next.exclusions;
          hide(nameError);
          hide(exclusionError);
          clearResults();
          sync();
        });
        return el("li", {}, [el("span", { text: person.name }), remove]);
      }),
    );
  }

  function renderPairs(): void {
    pairEmpty.hidden = exclusions.length > 0;
    pairList.replaceChildren(
      ...exclusions.map((exclusion) => {
        const remove = el("button", {
          className: "ghost",
          text: "Remove",
          attrs: { type: "button" },
        });
        remove.addEventListener("click", () => {
          exclusions = removeExclusion(exclusions, exclusion.a, exclusion.b);
          hide(exclusionError);
          clearResults();
          sync();
        });
        return el("li", {}, [
          el("span", { text: `${labelOf(exclusion.a)} and ${labelOf(exclusion.b)}` }),
          remove,
        ]);
      }),
    );
  }

  function renderSelects(): void {
    const previousA = selectA.value;
    const previousB = selectB.value;
    fillSelect(selectA);
    fillSelect(selectB);
    const ids = participants.map((person) => person.id);
    selectA.value = ids.includes(previousA) ? previousA : (ids[0] ?? "");
    const other = ids.find((id) => id !== selectA.value) ?? ids[0] ?? "";
    selectB.value = ids.includes(previousB) && previousB !== selectA.value ? previousB : other;
  }

  function fillSelect(select: HTMLSelectElement): void {
    select.replaceChildren(
      ...participants.map((person) => {
        const option = document.createElement("option");
        option.value = person.id;
        option.textContent = person.name;
        return option;
      }),
    );
  }

  function labelOf(id: string): string {
    return participants.find((person) => person.id === id)?.name ?? "Removed";
  }

  function clearResults(): void {
    results.hidden = true;
    linkList.replaceChildren();
    hide(drawError);
  }
}

function field(label: string, id: string, control: HTMLElement): HTMLDivElement {
  return el("div", { className: "field" }, [
    el("label", { text: label, attrs: { for: id } }),
    control,
  ]);
}

function alert(): HTMLParagraphElement {
  const node = el("p", { className: "alert", attrs: { role: "alert" } });
  node.hidden = true;
  return node;
}

function show(node: HTMLElement, message: string): void {
  node.textContent = message;
  node.hidden = false;
}

function hide(node: HTMLElement): void {
  node.hidden = true;
  node.textContent = "";
}

function linkRow(name: string, url: string): HTMLLIElement {
  const input = el("input", {
    attrs: { type: "text", readonly: "", value: url, "aria-label": `Private link for ${name}` },
  });
  const status = el("p", { className: "status", attrs: { "aria-live": "polite" } });
  const copy = el("button", { className: "ghost", text: "Copy", attrs: { type: "button" } });
  copy.addEventListener("click", () => {
    void navigator.clipboard.writeText(url).then(
      () => {
        status.textContent = "Copied";
        window.setTimeout(() => {
          status.textContent = "";
        }, 1600);
      },
      () => {
        input.focus();
        input.select();
        status.textContent = "Select the link and copy it.";
      },
    );
  });
  return el("li", {}, [el("span", { className: "who", text: name }), input, copy, status]);
}

function text(value: string): Text {
  return document.createTextNode(value);
}
