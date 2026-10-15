// One living canvas and one shared Television JSON store. Human input renders
// immediately, then writes params and palette; incoming agent values ease both
// the shader and the native slider thumbs for one visible second.
import {
  getStore, onAccessChanged, onConnectionStatusChanged, onValue,
  ref, runTransaction, update,
} from "/sdk/v1/resources.js";
import { DEFAULTS, nameFor, normalizeParams, paletteFor } from "./palette.mjs";

const db = getStore();
const root = ref(db);
const canvas = document.querySelector("#art");
const slidersElement = document.querySelector("#sliders");
const paletteElement = document.querySelector("#palette");
const savedElement = document.querySelector("#saved");
const noticeElement = document.querySelector("#notice");
const errorElement = document.querySelector("#error");
const sliderNames = Object.keys(DEFAULTS);
const sliders = new Map();
const swatches = [];

let state = null;
let target = { ...DEFAULTS };
let display = { ...DEFAULTS };
let transition = null;
let writeTimer = null;
let noticeTimer = null;
const pendingSignatures = new Set();
let access = null;
let connection = "connecting";
let isEmpty = false;
let initializing = false;
let lastPalette = "";

function signature(params) {
  return JSON.stringify(sliderNames.map((name) => params[name]));
}

function canWrite() {
  return access === "read-write" && connection === "connected";
}

function showError(failure) {
  const message = failure?.code === "disconnected"
    ? "Connection lost. Your last change may still have saved."
    : failure?.code === "read-only" ? "This view can only read the artwork."
      : failure ? `Could not save: ${failure.message || failure}` : "";
  errorElement.textContent = message;
  errorElement.hidden = !message;
}

function showNotice(message) {
  noticeElement.textContent = message;
  noticeElement.classList.add("visible");
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => noticeElement.classList.remove("visible"), 2600);
}

/** Draw the swatches from the same interpolated values used by the shader. */
function renderPalette() {
  const palette = paletteFor(display);
  const key = palette.join("");
  if (key === lastPalette) return;
  lastPalette = key;
  palette.forEach((colour, index) => {
    swatches[index].style.backgroundColor = colour;
    swatches[index].querySelector("span").textContent = colour;
    swatches[index].dataset.colour = colour;
    swatches[index].setAttribute("aria-label", `Copy ${colour}`);
  });
}

function renderSaved() {
  savedElement.replaceChildren();
  const saved = state?.saved && typeof state.saved === "object" ? state.saved : {};
  for (const [key, entry] of Object.entries(saved).sort((a, b) => (b[1]?.savedAt || 0) - (a[1]?.savedAt || 0))) {
    if (!entry?.params || !Array.isArray(entry.palette)) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = entry.name || "Saved colour";
    button.title = `Restore ${button.textContent}`;
    button.style.background = `linear-gradient(105deg, ${entry.palette.join(", ")})`;
    button.addEventListener("click", () => {
      if (!canWrite()) return;
      useLocalParams(normalizeParams(entry.params));
      void persistParams();
      showNotice(`restored ${button.textContent.toLowerCase()}`);
    });
    button.disabled = !canWrite();
    savedElement.append(button);
  }
}

function renderAccess() {
  for (const slider of sliders.values()) slider.disabled = !canWrite();
  document.querySelector("#save").disabled = !canWrite();
  renderSaved();
}

function useLocalParams(params) {
  transition = null;
  target = { ...params };
  display = { ...params };
  for (const [name, slider] of sliders) slider.value = String(target[name]);
  renderPalette();
}

async function persistParams() {
  if (!canWrite()) return;
  const params = { ...target };
  const writtenSignature = signature(params);
  pendingSignatures.add(writtenSignature);
  try {
    await update(root, { params, palette: paletteFor(params) });
    showError(null);
  } catch (failure) { pendingSignatures.delete(writtenSignature); showError(failure); }
}

function scheduleWrite() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => void persistParams(), 110);
}

function receiveParams(params) {
  const next = normalizeParams(params);
  const nextSignature = signature(next);
  const isOwnWrite = pendingSignatures.delete(nextSignature);
  if (nextSignature === signature(target)) return;
  if (isOwnWrite) return;
  clearTimeout(writeTimer);
  transition = { from: { ...display }, to: next, started: performance.now() };
  target = next;
  showNotice("agent tuned this");
}

async function initialize() {
  if (!isEmpty || !canWrite() || initializing) return;
  initializing = true;
  try {
    await runTransaction(root, (current) => {
      if (current !== undefined && current !== null) return undefined;
      return { params: { ...DEFAULTS }, palette: paletteFor(DEFAULTS), saved: {} };
    });
    showError(null);
  } catch (failure) { showError(failure); }
  finally { initializing = false; }
}

for (const name of sliderNames) {
  const row = document.createElement("div");
  row.className = "slider-row";
  const label = document.createElement("label");
  label.htmlFor = `slider-${name}`;
  label.textContent = name[0].toUpperCase() + name.slice(1);
  const slider = document.createElement("input");
  slider.type = "range";
  slider.id = label.htmlFor;
  slider.min = "0";
  slider.max = "1";
  slider.step = "0.001";
  slider.value = String(DEFAULTS[name]);
  slider.disabled = true;
  slider.addEventListener("input", () => {
    useLocalParams({ ...target, [name]: Number(slider.value) });
    scheduleWrite();
  });
  row.append(label, slider);
  slidersElement.append(row);
  sliders.set(name, slider);
}

for (let index = 0; index < 5; index++) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "swatch";
  button.innerHTML = "<span></span>";
  button.addEventListener("click", async () => {
    const colour = button.dataset.colour;
    try {
      await navigator.clipboard.writeText(colour);
    } catch {
      const field = document.createElement("textarea");
      field.value = colour;
      document.body.append(field);
      field.select();
      document.execCommand("copy");
      field.remove();
    }
    showNotice(`${colour} copied`);
  });
  paletteElement.append(button);
  swatches.push(button);
}
renderPalette();

document.querySelector("#collapse").addEventListener("click", (event) => {
  const panel = document.querySelector("#controls");
  const collapsed = panel.classList.toggle("collapsed");
  event.currentTarget.textContent = collapsed ? "+" : "−";
  event.currentTarget.setAttribute("aria-expanded", String(!collapsed));
  event.currentTarget.setAttribute("aria-label", collapsed ? "Expand controls" : "Collapse controls");
});

document.querySelector("#save").addEventListener("click", async () => {
  if (!canWrite()) return;
  clearTimeout(writeTimer);
  const params = { ...target };
  const palette = paletteFor(params);
  const name = nameFor(params);
  const key = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  try {
    await update(root, {
      params, palette,
      [`saved/${key}`]: { name, params, palette, savedAt: Date.now() },
    });
    showNotice(`saved ${name.toLowerCase()}`);
    showError(null);
  } catch (failure) { showError(failure); }
});

document.querySelector("#download").addEventListener("click", () => {
  // Paint the current frame into a screen-resolution PNG even when the live
  // shader uses fewer pixels to stay smooth on a large projector.
  const wallpaper = document.createElement("canvas");
  const ratio = window.devicePixelRatio || 1;
  wallpaper.width = Math.round(canvas.clientWidth * ratio);
  wallpaper.height = Math.round(canvas.clientHeight * ratio);
  wallpaper.getContext("2d").drawImage(canvas, 0, 0, wallpaper.width, wallpaper.height);
  wallpaper.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `elsewhere-${Date.now()}.png`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showNotice("wallpaper saved");
  }, "image/png");
});

onAccessChanged((level) => { access = level; renderAccess(); void initialize(); });
onConnectionStatusChanged((status) => { connection = status; renderAccess(); void initialize(); });
onValue(root, (snapshot) => {
  if (!snapshot.exists()) {
    state = null;
    isEmpty = true;
    void initialize();
    return;
  }
  const next = snapshot.val();
  if (!next || typeof next !== "object" || !next.params || typeof next.params !== "object") {
    showError(new Error("The store has an unexpected shape."));
    return;
  }
  const previousParams = state?.params && normalizeParams(state.params);
  state = next;
  isEmpty = false;
  if (!previousParams) useLocalParams(normalizeParams(next.params));
  else if (signature(previousParams) !== signature(normalizeParams(next.params))) receiveParams(next.params);
  renderSaved();
  const normalized = normalizeParams(next.params);
  const expected = paletteFor(normalized);
  const needsMigration = sliderNames.some((name) => !Object.hasOwn(next.params, name));
  if (canWrite() && (needsMigration || JSON.stringify(next.palette) !== JSON.stringify(expected))) {
    void update(root, { ...(needsMigration ? { params: normalized } : {}), palette: expected }).catch(showError);
  }
}, showError);

// A full-screen fragment shader makes slow folded colour bands with a little
// surface grain. The five uniforms are exactly the five exported swatches.
const vertexSource = `attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }`;
const fragmentSource = `
precision highp float;
uniform vec2 resolution;
uniform float time;
uniform float swirl;
uniform float scale;
uniform float glow;
uniform float grain;
uniform vec3 colours[5];

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1.,0.)), f.x),
             mix(hash(i+vec2(0.,1.)), hash(i+vec2(1.,1.)), f.x), f.y);
}
float field(vec2 p) {
  return noise(p)*0.58 + noise(p*2.03)*0.28 + noise(p*4.07)*0.14;
}
vec3 palette(float v) {
  float x = clamp(v, 0., .9999)*4.;
  if (x < 1.) return mix(colours[0], colours[1], smoothstep(0.,1.,x));
  if (x < 2.) return mix(colours[1], colours[2], smoothstep(0.,1.,x-1.));
  if (x < 3.) return mix(colours[2], colours[3], smoothstep(0.,1.,x-2.));
  return mix(colours[3], colours[4], smoothstep(0.,1.,x-3.));
}
void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec2 p = (uv-.5)*vec2(resolution.x/resolution.y,1.);
  float zoom = mix(1.5, 4.8, scale);
  vec2 q = p*zoom;
  float bend = field(q*.85 + vec2(time*.16, -time*.12));
  float twist = swirl * 1.95;
  q += vec2(sin(q.y*1.8 + time*.37), cos(q.x*1.4-time*.29))*bend*twist;
  q += vec2(noise(q + 5.8 + time*.1), noise(q + 13.6 - time*.09)) * twist*.32;
  float ribbon = q.y*.67 + q.x*.21 + sin(q.x*.72 + time*.32)*.32;
  ribbon += (field(q*.72 + vec2(time*.16,-time*.09))-.5)*(.4 + twist*1.45);
  float waves = sin(ribbon*3.5)*.24 + sin(ribbon*1.72+1.3)*.15;
  float value = clamp(.51 + waves*1.28 + (bend-.5)*.34 + p.x*.08, 0., 1.);
  vec3 colour = palette(value);
  // Carry the contrasting swatch through the folded paint itself.
  float accent = pow(max(0., sin(ribbon*3.5+.3)), 4.);
  colour = mix(colour, colours[3], accent*.30);
  float seam = pow(max(0., cos(ribbon*3.5+1.25)), 18.);
  colour += colours[4]*seam*(.035 + glow*.17);
  float light = .80 + .32*smoothstep(-.35,.65, noise(q*.43+time*.06));
  colour *= light;
  float dust = hash(gl_FragCoord.xy + fract(time*11.)*100.)-.5;
  colour += dust*grain*.055;
  float vignette = 1.0 - .17*smoothstep(.26, .86, length(p));
  gl_FragColor = vec4(clamp(colour*vignette,0.,1.),1.);
}`;

function shader(gl, type, source) {
  const compiled = gl.createShader(type);
  gl.shaderSource(compiled, source);
  gl.compileShader(compiled);
  if (!gl.getShaderParameter(compiled, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(compiled) || "Could not build the artwork shader");
  }
  return compiled;
}

function makeRenderer() {
  const gl = canvas.getContext("webgl", { alpha: false, antialias: false, preserveDrawingBuffer: true });
  if (!gl) throw new Error("This browser cannot display the WebGL artwork.");
  const program = gl.createProgram();
  gl.attachShader(program, shader(gl, gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, shader(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "Could not link the artwork shader");
  }
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const uniforms = Object.fromEntries(["resolution", "time", "swirl", "scale", "glow", "grain", "colours"]
    .map((name) => [name, gl.getUniformLocation(program, name === "colours" ? "colours[0]" : name)]));
  return (timeValue, quality) => {
    const screenRatio = Math.min(window.devicePixelRatio || 1, 2);
    const maxPixels = 1600 * 900 * quality * quality;
    const screenPixels = canvas.clientWidth * canvas.clientHeight * screenRatio * screenRatio;
    const pixelRatio = screenRatio * Math.min(1, Math.sqrt(maxPixels / screenPixels));
    const width = Math.max(1, Math.round(canvas.clientWidth * pixelRatio));
    const height = Math.max(1, Math.round(canvas.clientHeight * pixelRatio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
    const colours = paletteFor(display).flatMap((hex) => [1,3,5].map((index) =>
      parseInt(hex.slice(index, index+2), 16)/255));
    gl.uniform2f(uniforms.resolution, width, height);
    gl.uniform1f(uniforms.time, timeValue);
    gl.uniform1f(uniforms.swirl, display.swirl);
    gl.uniform1f(uniforms.scale, display.scale);
    gl.uniform1f(uniforms.glow, display.glow);
    gl.uniform1f(uniforms.grain, display.grain);
    gl.uniform3fv(uniforms.colours, new Float32Array(colours));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
}

try {
  const renderArt = makeRenderer();
  let lastFrame = performance.now();
  let motionTime = 0;
  let quality = 1;
  let frameCount = 0;
  let frameTimeTotal = 0;
  function frame(now) {
    const elapsed = Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;
    if (document.visibilityState === "visible") {
      frameTimeTotal += elapsed;
      frameCount++;
      if (frameCount === 24) {
        const averageMs = frameTimeTotal * 1000 / frameCount;
        if (averageMs > 23) quality = Math.max(0.45, quality * 0.82);
        else if (averageMs < 15) quality = Math.min(1, quality * 1.05);
        frameCount = 0;
        frameTimeTotal = 0;
      }
    }
    if (transition) {
      const progress = Math.min(1, (now - transition.started) / 1000);
      const eased = progress * progress * (3 - 2 * progress);
      display = Object.fromEntries(sliderNames.map((name) => [name,
        transition.from[name] + (transition.to[name] - transition.from[name]) * eased]));
      for (const [name, slider] of sliders) slider.value = String(display[name]);
      renderPalette();
      if (progress === 1) transition = null;
    }
    motionTime += elapsed * (.12 + display.speed * .9);
    renderArt(motionTime, quality);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
} catch (failure) {
  showError(failure);
  document.querySelector("#download").disabled = true;
}
