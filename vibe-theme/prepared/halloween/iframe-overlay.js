/* Halloween scenery in Television's transparent sandboxed foreground frame. */
(() => {
  "use strict";

  // All markup is authored here. The frame has no app DOM access and takes no input.
  const pumpkin = `
    <svg viewBox="0 0 180 150" aria-hidden="true">
      <defs><radialGradient id="pumpkin-glow"><stop stop-color="#ffca41"/>
        <stop offset="1" stop-color="#bc4518"/></radialGradient></defs>
      <path d="M83 28 Q82 8 100 8 Q93 19 97 32" fill="#557b2d" stroke="#283c19" stroke-width="3"/>
      <path d="M80 33 C43 17 14 42 17 85 C20 129 57 143 90 139 C123 143 160 127 163 85 C166 42 137 17 100 33 Z"
        fill="url(#pumpkin-glow)" stroke="#7c2e16" stroke-width="5"/>
      <path d="M59 36 C42 56 41 108 61 133 M121 36 C138 56 139 108 119 133 M89 34 C80 58 80 111 89 138"
        fill="none" stroke="#833218" stroke-opacity=".5" stroke-width="4"/>
      <path d="M40 73 L68 58 L72 82 Z M108 82 L112 58 L140 73 Z M90 76 L82 94 L98 94 Z"
        fill="#2a1020" stroke="#7b2712" stroke-width="3"/>
      <path class="candle" d="M44 72 L65 62 L68 77 Z M112 77 L115 62 L136 72 Z M90 81 L86 91 L94 91 Z"
        fill="#ffe879"/>
      <path d="M42 104 Q90 128 138 104 L128 121 L112 115 L104 130 L91 119 L78 130 L68 115 L52 121 Z"
        fill="#2a1020" stroke="#7b2712" stroke-width="3"/>
      <path class="candle" d="M50 109 Q90 124 130 109 L122 116 L111 112 L103 123 L91 115 L79 123 L69 112 L58 116 Z"
        fill="#ffe879"/>
    </svg>`;

  const ghost = `
    <svg viewBox="0 0 76 96" aria-hidden="true">
      <path d="M10 86 V39 C10 19 21 8 38 8 S66 19 66 39 V86
        Q58 77 51 87 Q44 95 38 86 Q30 96 23 86 Q16 77 10 86 Z"
        fill="#e9f4df" fill-opacity=".86" stroke="#b8e9ac" stroke-width="2"/>
      <ellipse cx="29" cy="45" rx="4" ry="7" fill="#21152b"/>
      <ellipse cx="48" cy="45" rx="4" ry="7" fill="#21152b"/>
      <ellipse cx="38" cy="64" rx="5" ry="8" fill="#21152b"/>
    </svg>`;

  const bat = `
    <svg viewBox="0 0 100 60" aria-hidden="true">
      <path class="wing-left" d="M50 32 Q34 9 4 12 L12 25 L2 37 Q23 29 34 46 L50 38 Z"
        fill="#57215f" stroke="#b9e874" stroke-width="2.5"/>
      <path class="wing-right" d="M50 32 Q66 9 96 12 L88 25 L98 37 Q77 29 66 46 L50 38 Z"
        fill="#57215f" stroke="#b9e874" stroke-width="2.5"/>
      <path d="M41 24 L44 12 L49 22 L51 22 L56 12 L59 24 Q66 34 56 47 L50 54 L44 47 Q34 34 41 24 Z"
        fill="#43194f" stroke="#b9e874" stroke-width="2.5"/>
      <circle cx="46" cy="31" r="1.6" fill="#e99335"/>
      <circle cx="54" cy="31" r="1.6" fill="#e99335"/>
    </svg>`;

  const web = `
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <g fill="none" stroke="#b8dfa3" stroke-opacity=".52" stroke-width="1.5">
        <path d="M0 0 H120 M0 0 V120 M0 0 L120 120 M0 0 L120 54 M0 0 L54 120"/>
        <path d="M0 22 Q22 22 22 0 M0 45 Q45 45 45 0
          M0 68 Q68 68 68 0 M0 92 Q92 92 92 0"/>
      </g>
    </svg>`;

  function addSceneNode(className, markup) {
    const node = document.createElement("div");
    node.className = className;
    node.innerHTML = markup;
    document.body.appendChild(node);
  }

  function start() {
    const style = document.createElement("style");
    style.textContent = `
      .halloween-scene { position: fixed; pointer-events: none; }
      .halloween-scene svg { display: block; width: 100%; height: 100%; }
      .halloween-web { top: 0; width: 150px; height: 150px; opacity: .7; }
      .halloween-web.left { left: 0; }
      .halloween-web.right { right: 0; transform: scaleX(-1); }
      .halloween-pumpkin { bottom: 4px; width: 155px; height: 130px;
        filter: drop-shadow(0 0 19px rgb(255 104 20 / .62)); }
      .halloween-pumpkin.left { left: 7px; }
      .halloween-pumpkin.right { right: 12px; width: 112px; height: 96px; }
      .halloween-pumpkin::before { content: ""; position: absolute; inset: -22px;
        background: radial-gradient(ellipse, rgb(255 109 19 / .34), transparent 68%);
        animation: halloween-candle 4.8s steps(1) infinite; }
      .halloween-pumpkin svg { position: relative; }
      .halloween-pumpkin .candle { animation: halloween-candle 4.8s steps(1) infinite; }
      .halloween-pumpkin.right .candle,
      .halloween-pumpkin.right::before { animation-delay: -2.1s; }
      @keyframes halloween-candle {
        0%, 8%, 11%, 52%, 55%, 100% { opacity: 1; }
        9%, 53% { opacity: .38; }
        10%, 54% { opacity: .72; }
      }
      .halloween-ghost { width: 62px; height: 79px; opacity: .68;
        filter: drop-shadow(0 0 13px rgb(179 255 147 / .35));
        animation: halloween-ghost-drift 17s ease-in-out infinite alternate; }
      .halloween-ghost.left { left: 1%; top: 29%; }
      .halloween-ghost.right { right: 1%; top: 55%; animation-delay: -8s; }
      @keyframes halloween-ghost-drift {
        from { transform: translate3d(0, -21px, 0) rotate(-5deg); }
        to { transform: translate3d(17px, 25px, 0) rotate(6deg); }
      }
      .halloween-bat { left: 0; width: 78px; height: 48px; opacity: 0;
        animation: halloween-bat-cross 23s linear infinite; }
      .halloween-bat.first { top: 11%; animation-delay: -4s; }
      .halloween-bat.second { top: 20%; width: 62px; height: 39px;
        animation-duration: 31s; animation-delay: -18s; }
      .halloween-bat .wing-left { transform-box: fill-box; transform-origin: right center;
        animation: halloween-wing-left .42s ease-in-out infinite alternate; }
      .halloween-bat .wing-right { transform-box: fill-box; transform-origin: left center;
        animation: halloween-wing-right .42s ease-in-out infinite alternate; }
      @keyframes halloween-bat-cross {
        0%, 36% { transform: translate3d(calc(100vw + 70px), 0, 0); opacity: 0; }
        42% { opacity: .85; }
        64% { transform: translate3d(-80px, -35px, 0); opacity: .85; }
        68%, 100% { transform: translate3d(-80px, -35px, 0); opacity: 0; }
      }
      @keyframes halloween-wing-left {
        from { transform: rotate(-13deg) scaleY(.68); }
        to { transform: rotate(9deg) scaleY(1); }
      }
      @keyframes halloween-wing-right {
        from { transform: rotate(13deg) scaleY(.68); }
        to { transform: rotate(-9deg) scaleY(1); }
      }
      @media (prefers-reduced-motion: reduce) {
        .halloween-ghost, .halloween-bat { display: none; }
        .halloween-pumpkin .candle, .halloween-pumpkin::before { animation: none; }
      }
    `;
    document.head.appendChild(style);
    addSceneNode("halloween-scene halloween-web left", web);
    addSceneNode("halloween-scene halloween-web right", web);
    addSceneNode("halloween-scene halloween-pumpkin left", pumpkin.replaceAll("pumpkin-glow", "pumpkin-glow-left"));
    addSceneNode("halloween-scene halloween-pumpkin right", pumpkin.replaceAll("pumpkin-glow", "pumpkin-glow-right"));
    addSceneNode("halloween-scene halloween-ghost left", ghost);
    addSceneNode("halloween-scene halloween-ghost right", ghost);
    addSceneNode("halloween-scene halloween-bat first", bat);
    addSceneNode("halloween-scene halloween-bat second", bat);
  }

  if (document.body) start();
  else addEventListener("DOMContentLoaded", start, { once: true });
})();

/* Composed from effects/weather.js: eight faint rising embers. */
/* Drop into iframe-overlay.js. One cheap CSS-animated weather layer; no frame loop. */
(() => {
  "use strict";

  // EDIT: KIND = rain, snow, embers, bubbles or confetti. Keep COUNT below 30.
  const KIND = "embers";
  const COLOR = "#ff9d2e";
  const COUNT = 8;

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
