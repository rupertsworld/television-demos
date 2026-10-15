// This output-only puppet reads Television's shared store. Its local playback
// state belongs only to the currently open page; the agent owns every write.
import { getStore, onValue, ref } from "/sdk/v1/resources.js";

// Store schema: { mood: string, say: line|null }. mood is one of the nine
// expressions below and is the resting face. A line requires id:string,
// text:string, at:number (Unix milliseconds); mood:string and audio:string
// are optional. The agent writes mood and say with the face helper. The page
// never writes. A line's mood lasts only while it plays; audio is a relative
// filename inside this directory. An unseen line older than 30 seconds is
// ignored so reopening the artifact does not recite a stale line.
const db = getStore();

const face = document.querySelector("#puppet");
const caption = document.querySelector("#caption");
const wake = document.querySelector("#wake");
const roughNoise = document.querySelector("#paper-noise");
const eyeParts = [
  ["left-eye", "left-pupil", "left-glint", "left-eye-clip-shape", "left-lid"],
  ["right-eye", "right-pupil", "right-glint", "right-eye-clip-shape", "right-lid"],
].map((ids) => ids.map((id) => document.getElementById(id)));
const brows = [document.querySelector("#left-brow"), document.querySelector("#right-brow")];
const mouth = document.querySelector("#mouth");
const mouthClip = document.querySelector("#mouth-clip-shape");
const fangs = [document.querySelector("#left-fang"), document.querySelector("#right-fang")];

// Eye arrays: center x/y, paper width/height, pupil look x/y. Brow arrays:
// endpoints. Mouth arrays: endpoints and the two cubic curves joining them.
// Fixed point counts let each paper shape tween to the next expression.
const expressions = {
  neutral: {
    eyes: [[320, 338, 40, 46, 0, 0], [580, 340, 40, 46, 0, 0]],
    brows: [[282, 268, 358, 263], [542, 264, 618, 268]],
    mouth: [392, 459, 420, 466, 480, 466, 508, 459, 482, 477, 417, 477], lids: [0, 0],
  },
  happy: {
    eyes: [[320, 346, 42, 31, 0, -3], [580, 348, 42, 31, 0, -3]],
    brows: [[277, 260, 361, 240], [538, 240, 623, 260]],
    mouth: [347, 433, 389, 476, 509, 476, 552, 433, 517, 536, 383, 536], lids: [0, 0],
  },
  smug: {
    eyes: [[317, 341, 43, 27, 7, 1], [582, 347, 39, 22, 7, 0]],
    brows: [[276, 273, 357, 262], [545, 247, 623, 264]],
    mouth: [373, 467, 414, 467, 474, 466, 527, 440, 490, 485, 412, 486], lids: [.15, .24],
  },
  thinking: {
    eyes: [[320, 340, 38, 42, 10, -12], [580, 339, 38, 42, 10, -12]],
    brows: [[282, 261, 356, 266], [545, 256, 616, 241]],
    mouth: [465, 461, 471, 439, 496, 439, 503, 462, 494, 479, 472, 479], lids: [0, 0],
  },
  surprised: {
    eyes: [[320, 333, 47, 55, 0, 0], [580, 333, 47, 55, 0, 0]],
    brows: [[281, 245, 359, 236], [541, 236, 619, 245]],
    mouth: [418, 447, 417, 408, 483, 408, 482, 447, 484, 527, 416, 527], lids: [0, 0],
  },
  confused: {
    eyes: [[317, 340, 40, 24, -5, 2], [584, 339, 42, 47, 7, -3]],
    brows: [[276, 274, 359, 249], [540, 252, 620, 279]],
    mouth: [374, 468, 415, 443, 457, 487, 522, 455, 480, 507, 423, 463], lids: [.12, 0],
  },
  sad: {
    eyes: [[320, 348, 39, 37, 0, 8], [580, 348, 39, 37, 0, 8]],
    brows: [[282, 251, 358, 274], [542, 274, 618, 251]],
    mouth: [371, 502, 413, 447, 487, 447, 529, 502, 488, 464, 411, 464], lids: [.08, .08],
  },
  sleepy: {
    eyes: [[320, 351, 42, 24, 0, 0], [580, 351, 42, 24, 0, 0]],
    brows: [[280, 277, 358, 279], [542, 280, 620, 277]],
    mouth: [411, 464, 431, 465, 469, 465, 489, 464, 468, 476, 432, 476], lids: [.72, .72],
  },
  mischievous: {
    eyes: [[319, 342, 43, 32, -6, 1], [581, 342, 43, 32, 6, 1]],
    brows: [[280, 275, 362, 245], [538, 245, 620, 275]],
    mouth: [350, 438, 399, 472, 501, 472, 550, 438, 515, 524, 385, 524], lids: [.12, .12],
  },
};

const freshnessMs = 30_000;
const defaultConfig = { voice: [], rate: 1, pitch: 1 };
let config = defaultConfig;
let restingMood = "neutral";
let shownMood = "neutral";
let expressionFrom = expressions.neutral;
let expressionNow = expressions.neutral;
let transitionStartedAt = performance.now();
const seenSayIds = new Set();
let activeLine = null;
let playbackToken = 0;
let activeAudio = null;
let mouthTimer = null;
let mouthPulseTimer = null;
let speechStartTimer = null;
let captionTimer = null;
let mouthTarget = 0;
let mouthOpening = 0;
let lastBoundaryAt = 0;
let waitingLine = null;
let blinkStartedAt = -Infinity;
let nextBlinkAt = performance.now() + 2200;
let lookX = 0;
let lookY = 0;
let lookTargetX = 0;
let lookTargetY = 0;
let nextLookAt = performance.now() + 1800;
let frame = 0;
let spookyTarget = false;
let spookyRevealTimer = null;
let spookyEndTimer = null;

/** Read the one marker the prepared Halloween stylesheet adds at :root. */
function isHalloweenTheme() {
  return getComputedStyle(document.documentElement).getPropertyValue("--demo-spooky").trim() === "1";
}

/** Stage the cut-paper switch after the first shake, including on a reload. */
function checkThemeLook() {
  const next = isHalloweenTheme();
  if (next === spookyTarget) return;
  spookyTarget = next;
  clearTimeout(spookyRevealTimer);
  clearTimeout(spookyEndTimer);
  face.dataset.transforming = "true";
  spookyRevealTimer = setTimeout(() => { face.dataset.spooky = String(next); }, 230);
  spookyEndTimer = setTimeout(() => { delete face.dataset.transforming; }, 760);
}

/** Blend a fixed-structure expression at the stop-motion frame rate. */
function blendExpression(first, second, progress) {
  const mix = (a, b) => a + (b - a) * progress;
  return {
    eyes: first.eyes.map((eye, index) => eye.map((value, point) => mix(value, second.eyes[index][point]))),
    brows: first.brows.map((brow, index) => brow.map((value, point) => mix(value, second.brows[index][point]))),
    mouth: first.mouth.map((value, index) => mix(value, second.mouth[index])),
    lids: first.lids.map((value, index) => mix(value, second.lids[index])),
  };
}

/** Start a shape tween from the face's current geometry, even mid-transition. */
function setMood(mood) {
  const next = Object.hasOwn(expressions, mood) ? mood : "neutral";
  if (next === shownMood) return;
  expressionFrom = expressionNow;
  shownMood = next;
  transitionStartedAt = performance.now();
  face.dataset.mood = next;
}

function setAttributes(element, values) {
  for (const [key, value] of Object.entries(values)) element.setAttribute(key, value.toFixed(1));
}

/** Build the same two-curve mouth contour for every mood and every flap. */
function mouthShape(points, opening) {
  const [leftX, leftY, topX1, topY1, topX2, topY2, rightX, rightY,
    bottomX1, bottomY1, bottomX2, bottomY2] = points;
  return `M ${leftX} ${leftY} C ${topX1} ${topY1 - opening * 3} `
    + `${topX2} ${topY2 - opening * 3} ${rightX} ${rightY} `
    + `C ${bottomX1} ${bottomY1 + opening * 39} `
    + `${bottomX2} ${bottomY2 + opening * 39} ${leftX} ${leftY} Z`;
}

function cubicAt(position, start, controlOne, controlTwo, end) {
  const remaining = 1 - position;
  return remaining ** 3 * start + 3 * remaining ** 2 * position * controlOne
    + 3 * remaining * position ** 2 * controlTwo + position ** 3 * end;
}

/** Let the two fang cutouts hang from the moving upper lip in every mood. */
function renderFangs(points, opening) {
  const width = points[6] - points[0];
  [0.32, 0.68].forEach((position, index) => {
    const x = points[0] + width * position;
    const upperY = cubicAt(position, points[1], points[3], points[5], points[7]);
    const halfWidth = Math.max(6, Math.min(13, width * .085));
    const tipY = upperY + 32 + opening * 13;
    fangs[index].setAttribute("d", `M ${x - halfWidth} ${upperY - 4} `
      + `Q ${x} ${upperY - 8} ${x + halfWidth} ${upperY - 3} `
      + `L ${x + 2} ${tipY - 5} L ${x - 2} ${tipY} Z`);
  });
}

/** Each feature is its own paper layer; lid rectangles slide over clipped eyes. */
function renderEye(parts, geometry, lidAmount, blinkAmount) {
  const [eye, pupil, glint, clip, lid] = parts;
  const [x, y, rx, ry, gazeX, gazeY] = geometry;
  setAttributes(eye, { cx: x, cy: y, rx, ry });
  setAttributes(clip, { cx: x, cy: y, rx, ry });
  const pupilX = x + gazeX + lookX;
  const pupilY = y + gazeY + lookY;
  setAttributes(pupil, { cx: pupilX, cy: pupilY, rx: Math.min(17, rx * .42), ry: Math.min(22, ry * .52) });
  setAttributes(glint, { cx: pupilX - 6, cy: pupilY - 8 });
  const cover = Math.max(lidAmount, blinkAmount);
  setAttributes(lid, { x: x - rx - 3, y: y - ry - 3, width: rx * 2 + 6, height: (ry * 2 + 6) * cover });
}

/** Redraw at 10 fps: enough for expression tweens, with a cut-paper judder. */
function render(now) {
  const progress = Math.min(1, (now - transitionStartedAt) / 470);
  const eased = 1 - (1 - progress) ** 3;
  expressionNow = blendExpression(expressionFrom, expressions[shownMood], eased);

  if (now >= nextLookAt) {
    lookTargetX = Math.round((Math.random() - .5) * 12);
    lookTargetY = Math.round((Math.random() - .5) * 7);
    nextLookAt = now + 1800 + Math.random() * 1800;
  }
  lookX += (lookTargetX - lookX) * .18;
  lookY += (lookTargetY - lookY) * .18;
  if (now >= nextBlinkAt) {
    blinkStartedAt = now;
    nextBlinkAt = now + (shownMood === "sleepy" ? 4300 : 2600) + Math.random() * 2600;
  }
  const blinkAge = now - blinkStartedAt;
  const blink = blinkAge < 110 ? blinkAge / 110
    : blinkAge < 270 ? 1 - (blinkAge - 110) / 160 : 0;
  expressionNow.eyes.forEach((eye, index) =>
    renderEye(eyeParts[index], eye, expressionNow.lids[index], blink));
  expressionNow.brows.forEach((brow, index) => {
    const [x1, y1, x2, y2] = brow;
    brows[index].setAttribute("d", `M ${x1} ${y1} Q ${(x1 + x2) / 2} ${(y1 + y2) / 2 - 5} ${x2} ${y2}`);
  });
  mouthOpening += (mouthTarget - mouthOpening) * .55;
  // Four discrete contours read as swapped paper mouths, not rubbery lips.
  const shape = mouthShape(expressionNow.mouth, Math.round(mouthOpening * 3) / 3);
  mouth.setAttribute("d", shape);
  mouthClip.setAttribute("d", shape);
  renderFangs(expressionNow.mouth, mouthOpening);
  // Seed cycling makes the outline "boil" without moving any layout boxes.
  roughNoise.setAttribute("seed", String(2 + frame % 3));
  frame += 1;
}

/** Use a boundary pulse when the engine supplies word timing; flap in gaps. */
function startMouth(token) {
  stopMouth();
  lastBoundaryAt = 0;
  let phase = false;
  mouthTimer = setInterval(() => {
    if (token !== playbackToken || !activeLine) return;
    if (Date.now() - lastBoundaryAt < 420) return;
    phase = !phase;
    mouthTarget = phase ? .88 : .16;
  }, 145);
}

function pulseMouth(token) {
  if (token !== playbackToken || !activeLine) return;
  lastBoundaryAt = Date.now();
  mouthTarget = 1;
  clearTimeout(mouthPulseTimer);
  mouthPulseTimer = setTimeout(() => {
    if (token === playbackToken) mouthTarget = .12;
  }, 115);
}

function stopMouth() {
  clearInterval(mouthTimer);
  clearTimeout(mouthPulseTimer);
  mouthTimer = null;
  mouthTarget = 0;
}

/** Cancel the old line before starting another, including its late callbacks. */
function stopPlayback() {
  playbackToken += 1;
  clearTimeout(speechStartTimer);
  clearTimeout(captionTimer);
  stopMouth();
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.removeAttribute("src");
    activeAudio = null;
  }
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  activeLine = null;
  waitingLine = null;
  return playbackToken;
}

function finishLine(token) {
  if (token !== playbackToken) return;
  activeLine = null;
  activeAudio = null;
  stopMouth();
  setMood(restingMood);
  captionTimer = setTimeout(() => { caption.hidden = true; }, 1900);
}

function requestWake(line, token) {
  if (token !== playbackToken) return;
  stopMouth();
  waitingLine = line;
  wake.hidden = false;
}

function speechVoice() {
  const voices = window.speechSynthesis.getVoices();
  for (const preferred of config.voice) {
    const name = preferred.toLowerCase();
    const found = voices.find((voice) => voice.name.toLowerCase() === name)
      ?? voices.find((voice) => voice.name.toLowerCase().startsWith(`${name} (`));
    if (found) return found;
  }
  return null; // An unset utterance voice uses the browser's default.
}

/** Give captions and paper mouth motion even if the browser has no voice API. */
function animateSilently(line, token) {
  startMouth(token);
  const words = line.text.trim().split(/\s+/).length;
  const duration = Math.min(13_000, Math.max(1100, words * 350 / (config.rate * (spookyTarget ? .9 : 1))));
  setTimeout(() => finishLine(token), duration);
}

function speakWithBrowser(line, token) {
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    animateSilently(line, token);
    return;
  }
  const utterance = new SpeechSynthesisUtterance(line.text);
  utterance.rate = Math.max(.5, config.rate * (spookyTarget ? .9 : 1));
  utterance.pitch = config.pitch * (spookyTarget ? .82 : 1);
  const voice = speechVoice();
  if (voice) utterance.voice = voice;
  let started = false;
  let abandoned = false;
  utterance.onstart = () => {
    if (token !== playbackToken || abandoned || !activeLine) return;
    started = true;
    clearTimeout(speechStartTimer);
    wake.hidden = true;
    startMouth(token);
  };
  utterance.onboundary = () => pulseMouth(token);
  utterance.onend = () => finishLine(token);
  utterance.onerror = (event) => {
    if (token !== playbackToken || abandoned || !activeLine) return;
    clearTimeout(speechStartTimer);
    if (event.error === "not-allowed" || event.error === "audio-busy") {
      requestWake(line, token);
    } else {
      console.warn("Speech synthesis failed; animating silently:", event.error);
      animateSilently(line, token);
    }
  };
  try {
    window.speechSynthesis.speak(utterance);
    // There is no reliable permission query for speech synthesis. A stalled
    // utterance is the practical signal that this browser needs a gesture.
    speechStartTimer = setTimeout(() => {
      if (!started && token === playbackToken) {
        abandoned = true;
        window.speechSynthesis.cancel();
        requestWake(line, token);
      }
    }, 1800);
  } catch (error) {
    console.warn("Speech synthesis could not start:", error);
    requestWake(line, token);
  }
}

/** The helper and page both reject paths that could leave this artifact. */
function safeAudioPath(filename) {
  if (typeof filename !== "string") return null;
  const parts = filename.split("/");
  if (!parts.every((part) => part && part !== "." && part !== ".." && /^[\w.-]+$/.test(part))) return null;
  if (!/\.(?:wav|mp3|m4a|ogg)$/i.test(parts.at(-1))) return null;
  return `./${filename}`;
}

function playAudio(line, token, filename) {
  const audio = new Audio(filename);
  activeAudio = audio;
  let fellBack = false;
  const useBrowserVoice = (reason) => {
    if (token !== playbackToken || fellBack) return;
    fellBack = true;
    activeAudio = null;
    console.warn("Audio playback failed; using browser speech:", reason);
    speakWithBrowser(line, token);
  };
  audio.onplaying = () => {
    if (token !== playbackToken) return;
    wake.hidden = true;
    startMouth(token);
  };
  audio.onended = () => finishLine(token);
  audio.onerror = () => useBrowserVoice(filename);
  audio.play().catch((error) => {
    if (token !== playbackToken || fellBack) return;
    if (error.name === "NotAllowedError") {
      requestWake(line, token);
    } else {
      useBrowserVoice(error);
    }
  });
}

function playLine(line) {
  const token = stopPlayback();
  activeLine = line;
  setMood(Object.hasOwn(expressions, line.mood) ? line.mood : restingMood);
  caption.textContent = line.text.replace(/\s+/g, " ").trim().slice(0, 150);
  if (line.text.length > 150) caption.textContent += "…";
  caption.title = line.text;
  caption.hidden = false;
  wake.hidden = true;
  const filename = safeAudioPath(line.audio);
  if (filename) playAudio(line, token, filename);
  else speakWithBrowser(line, token);
}

/** A clicked wake prompt keeps the pending line inside the user gesture. */
wake.addEventListener("click", () => {
  const line = waitingLine;
  wake.hidden = true;
  if ("speechSynthesis" in window) window.speechSynthesis.resume();
  if (line) {
    playLine(line);
  }
});

/** A root snapshot changes the resting mood and starts each fresh ID once. */
function receiveState(value) {
  const state = value && typeof value === "object" ? value : {};
  restingMood = Object.hasOwn(expressions, state.mood) ? state.mood : "neutral";
  if (!activeLine) setMood(restingMood);
  const line = state.say;
  if (!line || typeof line !== "object") {
    if (activeLine || waitingLine) {
      stopPlayback();
      caption.hidden = true;
      wake.hidden = true;
    }
    setMood(restingMood);
    return;
  }
  if (typeof line.id !== "string" || typeof line.text !== "string"
      || !Number.isFinite(line.at) || seenSayIds.has(line.id)) return;
  seenSayIds.add(line.id);
  if (Date.now() - line.at > freshnessMs) return;
  playLine(line);
}

async function loadConfig() {
  try {
    const response = await fetch("./config.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    config = {
      voice: Array.isArray(data.voice) ? data.voice.filter((name) => typeof name === "string") : [],
      rate: Number.isFinite(data.rate) ? Math.min(2, Math.max(.5, data.rate)) : 1,
      pitch: Number.isFinite(data.pitch) ? Math.min(2, Math.max(0, data.pitch)) : 1,
    };
  } catch (error) {
    console.warn("Using default voice settings:", error);
  }
}

face.dataset.mood = "neutral";
face.dataset.spooky = "false";
render(performance.now());
setInterval(() => render(performance.now()), 100);
checkThemeLook();
// Theme selection reloads path-artifact frames today. Polling also covers an
// in-place stylesheet update without depending on an application-only event.
setInterval(checkThemeLook, 1200);
await loadConfig();
onValue(ref(db), (snapshot) => receiveState(snapshot.val()), (error) => {
  console.error("The face lost its Television store:", error);
});
