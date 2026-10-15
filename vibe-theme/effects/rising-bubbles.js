/* Copy as iframe-overlay.js. A few CSS-animated rings give depth without a frame loop. */
(() => {
  "use strict";

  // EDIT these three values. Keep rings translucent over text and controls.
  const COLOR = "#69f5ef";
  const COUNT = 11;
  const MAX_SIZE_PX = 20;

  function start() {
    const style = document.createElement("style");
    style.textContent = `
      .vibe-bubble { position: fixed; bottom: -30px; width: var(--size);
        height: var(--size); border: 1px solid ${COLOR}; border-radius: 50%;
        box-shadow: 0 0 9px ${COLOR}; opacity: 0;
        animation: vibe-bubble-rise var(--duration) linear infinite;
        animation-delay: var(--delay); }
      @keyframes vibe-bubble-rise {
        0% { transform: translate3d(0, 0, 0); opacity: 0; }
        12% { opacity: .33; }
        80% { opacity: .24; }
        100% { transform: translate3d(var(--sway), -115vh, 0); opacity: 0; }
      }
      @media (prefers-reduced-motion: reduce) { .vibe-bubble { display: none; } }
    `;
    document.head.appendChild(style);

    const fragment = document.createDocumentFragment();
    for (let index = 0; index < COUNT; index += 1) {
      const bubble = document.createElement("span");
      bubble.className = "vibe-bubble";
      bubble.style.left = `${(index + 0.4) * 100 / COUNT}%`;
      bubble.style.setProperty("--size", `${5 + index % 5 * (MAX_SIZE_PX - 5) / 4}px`);
      bubble.style.setProperty("--duration", `${16 + index % 6 * 3}s`);
      bubble.style.setProperty("--delay", `${-index * 3.4}s`);
      bubble.style.setProperty("--sway", `${index % 2 ? 45 : -45}px`);
      fragment.appendChild(bubble);
    }
    document.body.appendChild(fragment);
  }

  if (document.body) start();
  else addEventListener("DOMContentLoaded", start, { once: true });
})();
