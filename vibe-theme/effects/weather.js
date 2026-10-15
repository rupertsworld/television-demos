/* Drop into iframe-overlay.js. One cheap CSS-animated weather layer; no frame loop. */
(() => {
  "use strict";

  // EDIT: KIND = rain, snow, embers, bubbles or confetti. Keep COUNT below 30.
  const KIND = "embers";
  const COLOR = "#ffad49";
  const COUNT = 18;

  function start() {
    const shapes = {
      rain: "width:1px;height:16px;border-radius:1px;",
      snow: "width:6px;height:6px;border-radius:50%;",
      embers: "width:5px;height:5px;border-radius:50%;box-shadow:0 0 8px currentColor;",
      bubbles: "width:12px;height:12px;border:1px solid currentColor;border-radius:50%;box-shadow:0 0 6px currentColor;",
      confetti: "width:7px;height:11px;border-radius:1px;",
    };
    if (!Object.hasOwn(shapes, KIND)) return;
    const rising = KIND === "embers" || KIND === "bubbles";
    const style = document.createElement("style");
    style.textContent = `
      .vibe-weather-${KIND} { position: fixed; ${rising ? "bottom:0" : "top:0"};
        ${shapes[KIND]} color:${COLOR}; ${KIND === "bubbles" ? "background:transparent" : "background:currentColor"};
        opacity:0; animation:${rising ? "vibe-weather-rise" : "vibe-weather-fall"} var(--duration) linear infinite;
        animation-delay:var(--delay); }
      @keyframes vibe-weather-rise { from { transform:translate3d(0, 12vh, 0); opacity:0; }
        15%, 80% { opacity:.38; } to { transform:translate3d(var(--drift), -112vh, 0); opacity:0; } }
      @keyframes vibe-weather-fall { from { transform:translate3d(0, -12vh, 0); opacity:0; }
        15%, 80% { opacity:.32; } to { transform:translate3d(var(--drift), 112vh, 0); opacity:0; } }
      @media (prefers-reduced-motion: reduce) { .vibe-weather-${KIND} { display:none; } }
    `;
    document.head.appendChild(style);

    const fragment = document.createDocumentFragment();
    for (let index = 0; index < Math.min(COUNT, 28); index += 1) {
      const item = document.createElement("span");
      item.className = `vibe-weather-${KIND}`;
      item.style.left = `${(index + 0.5) * 100 / COUNT}%`;
      item.style.setProperty("--duration", `${rising ? 12 + index % 5 * 3 : 7 + index % 5 * 2}s`);
      item.style.setProperty("--delay", `${-index * 1.8}s`);
      item.style.setProperty("--drift", `${index % 2 ? 35 : -35}px`);
      fragment.appendChild(item);
    }
    document.body.appendChild(fragment);
  }

  if (document.body) start();
  else addEventListener("DOMContentLoaded", start, { once: true });
})();
