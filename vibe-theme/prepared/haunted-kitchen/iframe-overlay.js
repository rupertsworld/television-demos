/* Copy as iframe-overlay.js, or concatenate with drifting-particles.js. */
(() => {
  "use strict";

  // EDIT these three values. RGB is a space-separated channel triplet.
  const TINT_RGB = "236 250 176";
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

/* Copy as iframe-overlay.js, or concatenate with another effect. Each IIFE owns its nodes. */
(() => {
  "use strict";

  // EDIT these three values. Keep COUNT small: the overlay spans the whole screen.
  const COLOR = "#d8f7bd";
  const GLYPH = "✧";
  const COUNT = 9;

  function start() {
    const style = document.createElement("style");
    style.textContent = `
      .vibe-drift { position: fixed; top: 0; left: 0; color: ${COLOR};
        font: 22px Georgia, serif; line-height: 1; opacity: 0;
        text-shadow: 0 0 12px currentColor;
        animation: vibe-drift-rise var(--duration) linear infinite;
        animation-delay: var(--delay); }
      @keyframes vibe-drift-rise {
        0% { transform: translate3d(0, 105vh, 0) rotate(-12deg); opacity: 0; }
        15% { opacity: .22; }
        80% { opacity: .18; }
        100% { transform: translate3d(var(--sway), -10vh, 0) rotate(20deg); opacity: 0; }
      }
      @media (prefers-reduced-motion: reduce) { .vibe-drift { display: none; } }
    `;
    document.head.appendChild(style);

    const fragment = document.createDocumentFragment();
    for (let index = 0; index < COUNT; index += 1) {
      const particle = document.createElement("span");
      particle.className = "vibe-drift";
      particle.textContent = GLYPH;
      particle.style.left = `${(index + 0.5) * 100 / COUNT}%`;
      particle.style.setProperty("--duration", `${19 + index % 5 * 3}s`);
      particle.style.setProperty("--delay", `${-index * 3.1}s`);
      particle.style.setProperty("--sway", `${index % 2 ? 55 : -55}px`);
      fragment.appendChild(particle);
    }
    document.body.appendChild(fragment);
  }

  if (document.body) start();
  else addEventListener("DOMContentLoaded", start, { once: true });
})();
