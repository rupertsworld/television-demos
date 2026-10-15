/* Copy as iframe-overlay.js, or concatenate with drifting-particles.js. */
(() => {
  "use strict";

  // EDIT these three values. RGB is a space-separated channel triplet.
  const TINT_RGB = "240 255 183";
  const FLICKER_OPACITY = 0.035;
  const SCANLINE_OPACITY = 0.045;

  function start() {
    const style = document.createElement("style");
    style.textContent = `
      .vibe-fluorescent { position: fixed; inset: 0;
        background: repeating-linear-gradient(to bottom,
          transparent 0 4px, rgb(${TINT_RGB} / ${SCANLINE_OPACITY}) 4px 5px),
          rgb(${TINT_RGB} / ${FLICKER_OPACITY});
        animation: vibe-fluorescent-flicker 5.7s steps(1) infinite; }
      @keyframes vibe-fluorescent-flicker {
        0%, 7%, 10%, 49%, 52%, 100% { opacity: 1; }
        8%, 50% { opacity: .18; }
        9%, 51% { opacity: .65; }
      }
      @media (prefers-reduced-motion: reduce) {
        .vibe-fluorescent { animation: none; }
      }
    `;
    document.head.appendChild(style);
    const flicker = document.createElement("div");
    flicker.className = "vibe-fluorescent";
    document.body.appendChild(flicker);
  }

  if (document.body) start();
  else addEventListener("DOMContentLoaded", start, { once: true });
})();
