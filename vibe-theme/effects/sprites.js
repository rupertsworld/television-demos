/* Drop into iframe-overlay.js. Replace the inline SVGs and pick a motion per sprite. */
(() => {
  "use strict";

  // EDIT: two or three prompt-specific SVGs. For flap, mark wing paths .wing-left / .wing-right.
  // Motion: drift, flap, rise, fall, orbit, bounce.
  const SPRITES = [
    { svg: '<svg viewBox="0 0 64 64"><path d="M32 2 39 25 62 32 39 39 32 62 25 39 2 32 25 25Z" fill="#ffe785"/></svg>', motion: "orbit", edge: "right", sizePx: 48 },
    { svg: '<svg viewBox="0 0 64 64"><path d="M32 4 42 24 60 32 42 40 32 60 22 40 4 32 22 24Z" fill="#85f5ec"/></svg>', motion: "drift", edge: "left", sizePx: 42 },
  ];
  const OPACITY = 0.68;
  const GLOW_COLOR = "#c8efff";

  function start() {
    const style = document.createElement("style");
    style.textContent = `
      .vibe-sprite { position: fixed; width: var(--size); height: var(--size);
        opacity: ${OPACITY}; color: ${GLOW_COLOR}; filter: drop-shadow(0 0 8px currentColor);
        animation-duration: var(--duration); animation-delay: var(--delay);
        animation-timing-function: ease-in-out; animation-iteration-count: infinite;
        animation-direction: alternate; }
      .vibe-sprite svg { display: block; width: 100%; height: 100%; }
      .vibe-sprite[data-motion="drift"] { animation-name: vibe-sprite-drift; }
      .vibe-sprite[data-motion="flap"] { animation-name: vibe-sprite-drift; }
      .vibe-sprite[data-motion="flap"] svg { animation: vibe-sprite-flap .45s ease-in-out infinite alternate; }
      .vibe-sprite[data-motion="flap"] .wing-left { transform-box: fill-box; transform-origin: right center;
        animation: vibe-sprite-wing-left .45s ease-in-out infinite alternate; }
      .vibe-sprite[data-motion="flap"] .wing-right { transform-box: fill-box; transform-origin: left center;
        animation: vibe-sprite-wing-right .45s ease-in-out infinite alternate; }
      .vibe-sprite[data-motion="rise"] { animation-name: vibe-sprite-rise; animation-timing-function: linear; animation-direction: normal; }
      .vibe-sprite[data-motion="fall"] { animation-name: vibe-sprite-fall; animation-timing-function: linear; animation-direction: normal; }
      .vibe-sprite[data-motion="orbit"] { animation-name: vibe-sprite-orbit; }
      .vibe-sprite[data-motion="bounce"] { animation-name: vibe-sprite-bounce; }
      @keyframes vibe-sprite-drift { from { transform: translate3d(-8px, -22px, 0) rotate(-7deg); }
        to { transform: translate3d(14px, 22px, 0) rotate(8deg); } }
      @keyframes vibe-sprite-flap { from { transform: scaleY(.7); } to { transform: scaleY(1); } }
      @keyframes vibe-sprite-wing-left { from { transform: rotate(-13deg) scaleY(.7); }
        to { transform: rotate(8deg) scaleY(1); } }
      @keyframes vibe-sprite-wing-right { from { transform: rotate(13deg) scaleY(.7); }
        to { transform: rotate(-8deg) scaleY(1); } }
      @keyframes vibe-sprite-rise { from { transform: translate3d(0, 55vh, 0); opacity: 0; }
        15%, 85% { opacity: ${OPACITY}; } to { transform: translate3d(20px, -65vh, 0); opacity: 0; } }
      @keyframes vibe-sprite-fall { from { transform: translate3d(0, -65vh, 0); opacity: 0; }
        15%, 85% { opacity: ${OPACITY}; } to { transform: translate3d(20px, 55vh, 0); opacity: 0; } }
      @keyframes vibe-sprite-orbit { from { transform: rotate(0deg) translateX(24px) rotate(0deg); }
        to { transform: rotate(360deg) translateX(24px) rotate(-360deg); } }
      @keyframes vibe-sprite-bounce { from { transform: translate3d(0, 0, 0) scale(1); }
        to { transform: translate3d(12px, -36px, 0) scale(1.08); } }
      @media (prefers-reduced-motion: reduce) { .vibe-sprite { display: none; } }
    `;
    document.head.appendChild(style);

    const edgePlacement = {
      left: { left: "1.5%", top: "42%" },
      right: { right: "1.5%", top: "42%" },
      top: { left: "48%", top: "3%" },
      bottom: { left: "48%", bottom: "3%" },
    };
    for (const [index, sprite] of SPRITES.slice(0, 6).entries()) {
      const node = document.createElement("div");
      node.className = "vibe-sprite";
      node.dataset.motion = sprite.motion;
      node.innerHTML = sprite.svg;
      const placement = edgePlacement[sprite.edge] ?? edgePlacement.right;
      for (const [property, value] of Object.entries(placement)) node.style[property] = value;
      node.style.setProperty("--size", `${sprite.sizePx}px`);
      node.style.setProperty("--duration", `${sprite.motion === "rise" || sprite.motion === "fall" ? 16 : 9 + index * 2}s`);
      node.style.setProperty("--delay", `${-index * 3.7}s`);
      document.body.appendChild(node);
    }
  }

  if (document.body) start();
  else addEventListener("DOMContentLoaded", start, { once: true });
})();
