type Props = {
  className?: string;
  text?: string;
  attrs?: Record<string, string>;
};

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props,
  children?: Node[],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props?.className) node.className = props.className;
  if (props?.text !== undefined) node.textContent = props.text;
  if (props?.attrs) {
    for (const [key, value] of Object.entries(props.attrs)) node.setAttribute(key, value);
  }
  if (children) node.append(...children);
  return node;
}

const ns = "http://www.w3.org/2000/svg";

export function hollyMark(): SVGSVGElement {
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 48 48");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("mark");
  svg.append(
    path("M24 6 C14 14 6 16 8 28 C14 24 18 20 21 16 C16 24 14 34 22 36 C25 26 26 16 24 6 Z", "#8fce73"),
    path("M24 6 C34 14 42 16 40 28 C34 24 30 20 27 16 C32 24 34 34 26 36 C23 26 22 16 24 6 Z", "#4f8f3c"),
    berry("24", "32", "4.4"),
    berry("16.5", "37", "3.5"),
    berry("31.5", "37", "3.5"),
  );
  return svg;
}

export function bowMark(): SVGSVGElement {
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 64 40");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("bow");
  svg.append(
    ellipse("20", "16", "12", "8", "#f0c84b"),
    ellipse("44", "16", "12", "8", "#f0c84b"),
    path("M32 18 L16 38 L26 36 Z", "#e2b43a"),
    path("M32 18 L48 38 L38 36 Z", "#e2b43a"),
    ellipse("32", "18", "5", "5", "#fff1c2"),
  );
  return svg;
}

function berry(cx: string, cy: string, r: string): SVGCircleElement {
  const node = document.createElementNS(ns, "circle");
  node.setAttribute("cx", cx);
  node.setAttribute("cy", cy);
  node.setAttribute("r", r);
  node.setAttribute("fill", "#e24b4b");
  return node;
}

function ellipse(cx: string, cy: string, rx: string, ry: string, fill: string): SVGEllipseElement {
  const node = document.createElementNS(ns, "ellipse");
  node.setAttribute("cx", cx);
  node.setAttribute("cy", cy);
  node.setAttribute("rx", rx);
  node.setAttribute("ry", ry);
  node.setAttribute("fill", fill);
  return node;
}

function path(d: string, fill: string): SVGPathElement {
  const node = document.createElementNS(ns, "path");
  node.setAttribute("d", d);
  node.setAttribute("fill", fill);
  return node;
}
