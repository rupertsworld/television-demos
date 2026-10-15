/* Drop into iframe-overlay.js. Static inline SVG props frame the viewport. */
(() => {
  "use strict";

  // EDIT: supply prompt-specific SVGs; position is top-left, top-right, bottom-left or bottom-right.
  const PROPS = [
    { svg: '<svg viewBox="0 0 100 100"><path d="M0 0H100M0 0V100M0 0L100 100M0 20Q20 20 20 0M0 45Q45 45 45 0" fill="none" stroke="#c8e9a8" stroke-width="2"/></svg>', position: "top-left", sizePx: 110 },
    { svg: '<svg viewBox="0 0 100 100"><path d="M100 0H0M100 0V100M100 0L0 100M100 20Q80 20 80 0M100 45Q55 45 55 0" fill="none" stroke="#c8e9a8" stroke-width="2"/></svg>', position: "top-right", sizePx: 110 },
  ];
  const OPACITY = 0.6;

  function start() {
    const style = document.createElement("style");
    style.textContent = `.vibe-edge-prop { position: fixed; width: var(--size); height: var(--size);
      opacity: ${OPACITY}; pointer-events: none; }
      .vibe-edge-prop svg { display: block; width: 100%; height: 100%; }`;
    document.head.appendChild(style);

    const placement = {
      "top-left": { top: "0", left: "0" },
      "top-right": { top: "0", right: "0" },
      "bottom-left": { bottom: "0", left: "0" },
      "bottom-right": { bottom: "0", right: "0" },
    };
    for (const prop of PROPS.slice(0, 4)) {
      const node = document.createElement("div");
      node.className = "vibe-edge-prop";
      node.innerHTML = prop.svg;
      node.style.setProperty("--size", `${prop.sizePx}px`);
      for (const [property, value] of Object.entries(placement[prop.position] ?? placement["top-left"])) node.style[property] = value;
      document.body.appendChild(node);
    }
  }

  if (document.body) start();
  else addEventListener("DOMContentLoaded", start, { once: true });
})();
