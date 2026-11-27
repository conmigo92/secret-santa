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

export function envelopeMark(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 48 48");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("mark");
  const frame = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  frame.setAttribute("x", "6");
  frame.setAttribute("y", "12");
  frame.setAttribute("width", "36");
  frame.setAttribute("height", "26");
  frame.setAttribute("rx", "2");
  const flap = document.createElementNS("http://www.w3.org/2000/svg", "path");
  flap.setAttribute("d", "M8 14 L24 28 L40 14");
  for (const shape of [frame, flap]) {
    shape.setAttribute("fill", "none");
    shape.setAttribute("stroke", "currentColor");
    shape.setAttribute("stroke-width", "2.5");
    shape.setAttribute("stroke-linejoin", "round");
    svg.append(shape);
  }
  return svg;
}
