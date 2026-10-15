/** Exercise the real page in Chromium with local canonical, theme and store stubs. */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const folder = __dirname;
const moods = [
  "neutral", "happy", "smug", "thinking", "surprised", "confused",
  "sad", "sleepy", "mischievous",
];
let themeMarker = "0";

/** Fulfill only this page and its local dependencies; no server is needed. */
async function respond(route) {
  const pathname = new URL(route.request().url()).pathname;
  const stubs = {
    "/canonical/v2/styles.css": ["text/css", '@import url("/canonical/v2/base.css");\n@import url("/theme/theme.css");\n'],
    "/canonical/v2/base.css": ["text/css", `:root {
      --color-surface: #fbf8f0; --color-surface-muted: #f3e8ed;
      --color-text: #27232a; --color-border: #b6aab1;
      --green-100: #dcfce7; --green-300: #86efac;
      --neutral-950: #171717; --red-500: #ef4444;
    }`],
    "/canonical/v2/components.js": ["text/javascript", ""],
    "/sdk/v1/resources.js": ["text/javascript", `
      export const getStore = () => ({});
      export const ref = () => ({});
      export function onValue(_reference, callback) {
        window.__emitFaceStore = (value) => callback({ val: () => value });
        window.__emitFaceStore({ mood: "neutral", say: null });
      }
    `],
  };
  if (pathname === "/theme/theme.css") {
    await route.fulfill({ contentType: "text/css", body: `:root { --demo-spooky: ${themeMarker}; }` });
    return;
  }
  if (stubs[pathname]) {
    await route.fulfill({ contentType: stubs[pathname][0], body: stubs[pathname][1] });
    return;
  }
  const filename = pathname === "/" ? "index.html" : pathname.slice(1);
  if (!["index.html", "style.css", "app.mjs", "config.json"].includes(filename)) {
    await route.fulfill({ status: 404 });
    return;
  }
  const mime = filename.endsWith(".css") ? "text/css"
    : filename.endsWith(".mjs") ? "text/javascript"
      : filename.endsWith(".json") ? "application/json" : "text/html";
  await route.fulfill({ contentType: mime, body: fs.readFileSync(path.join(folder, filename)) });
}

async function setMood(page, mood) {
  await page.evaluate((next) => window.__emitFaceStore({ mood: next, say: null }), mood);
  await page.waitForTimeout(560);
  const visibleMood = await page.locator("#puppet").getAttribute("data-mood");
  assert.equal(visibleMood, mood);
  return page.locator("#mouth").getAttribute("d");
}

async function checkMoods(page) {
  const shapes = new Set();
  for (const mood of moods) shapes.add(await setMood(page, mood));
  assert.equal(shapes.size, moods.length, "all nine moods need distinct mouth contours");
}

async function say(page, id, expectMovingFangs = false) {
  const idleFang = expectMovingFangs ? await page.locator("#left-fang").getAttribute("d") : null;
  await page.evaluate((lineId) => window.__emitFaceStore({
    mood: "neutral", say: { id: lineId, text: "A little paper voice.", at: Date.now() },
  }), id);
  await page.waitForFunction(() => window.__spoken.length > 0);
  if (expectMovingFangs) {
    await page.waitForFunction((previous) => document.querySelector("#left-fang").getAttribute("d") !== previous, idleFang);
  }
  return page.evaluate(() => window.__spoken.shift());
}

async function captureIfRequested(page, name) {
  const directory = process.env.FACE_SCREENSHOT_DIR;
  if (!directory) return;
  fs.mkdirSync(directory, { recursive: true });
  await setMood(page, "neutral");
  await page.waitForFunction(() => Number(document.querySelector("#left-lid").getAttribute("height")) < 1
    && Number(document.querySelector("#right-lid").getAttribute("height")) < 1);
  await page.screenshot({ path: path.join(directory, `${name}.png`) });
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", respond);
    await page.addInitScript(() => {
      window.__spoken = [];
      window.SpeechSynthesisUtterance = class {
        constructor(text) { this.text = text; }
      };
      Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
        getVoices: () => [], cancel: () => {}, resume: () => {},
        speak: (utterance) => {
          window.__spoken.push({ rate: utterance.rate, pitch: utterance.pitch });
          setTimeout(() => utterance.onstart?.(), 0);
          setTimeout(() => utterance.onboundary?.({ charIndex: 0 }), 90);
          setTimeout(() => utterance.onend?.(), 650);
        },
      } });
    });
    await page.goto("http://face.test/");
    await page.waitForFunction(() => typeof window.__emitFaceStore === "function");
    assert.equal(await page.locator("#puppet").getAttribute("data-spooky"), "false");
    await checkMoods(page);
    await captureIfRequested(page, "normal");
    assert.deepEqual(await say(page, "normal-line"), { rate: 1, pitch: 1 });

    const markerStyle = await page.addStyleTag({ content: ":root { --demo-spooky: 1; }" });
    await page.waitForFunction(() => document.querySelector("#puppet").dataset.transforming === "true");
    await page.waitForFunction(() => document.querySelector("#puppet").dataset.spooky === "true");
    await page.waitForFunction(() => document.querySelector("#puppet").dataset.transforming === undefined);
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".inner-face")).fill === "rgb(220, 252, 231)");
    const skin = await page.locator(".inner-face").evaluate((element) => getComputedStyle(element).fill);
    assert.equal(skin, "rgb(220, 252, 231)");
    assert.equal(await page.locator("#left-glint").evaluate((element) => getComputedStyle(element).fill), "rgb(239, 68, 68)");
    const fang = page.locator("#left-fang");
    assert.ok((await fang.getAttribute("d")).startsWith("M "));
    assert.equal(await fang.evaluate((element) => getComputedStyle(element).opacity), "1");
    await checkMoods(page);
    await captureIfRequested(page, "vampire");
    assert.deepEqual(await say(page, "spooky-line", true), { rate: .9, pitch: .82 });

    await markerStyle.evaluate((element) => element.remove());
    await page.waitForFunction(() => document.querySelector("#puppet").dataset.spooky === "false");
    await page.waitForFunction(() => document.querySelector("#puppet").dataset.transforming === undefined);
    await page.waitForFunction(() => getComputedStyle(document.querySelector("#left-fang")).opacity === "0");
    assert.equal(await fang.evaluate((element) => getComputedStyle(element).opacity), "0");

    // Television reloads path artifacts on theme selection. The startup path
    // must reveal the vampire again with the marker already in the sheet.
    themeMarker = "1";
    await page.reload();
    await page.waitForFunction(() => document.querySelector("#puppet").dataset.transforming === "true");
    await page.waitForFunction(() => document.querySelector("#puppet").dataset.spooky === "true");
    assert.deepEqual(errors, []);
    console.log("Chromium: marker polling, startup reveal, reverse switch, nine moods in both looks, fangs and voice settings passed");
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
