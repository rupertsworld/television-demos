import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULTS, nameFor, normalizeParams, paletteFor } from "./palette.mjs";

test("palette always has five usable hex colours and responds to colour controls", () => {
  const original = paletteFor(DEFAULTS);
  assert.equal(original.length, 5);
  assert.ok(original.every((colour) => /^#[0-9a-f]{6}$/.test(colour)));
  assert.notDeepEqual(original, paletteFor({ ...DEFAULTS, colour: 0.08 }));
  assert.notDeepEqual(original, paletteFor({ ...DEFAULTS, spread: 0.8 }));
  assert.notDeepEqual(original, paletteFor({ ...DEFAULTS, glow: 0.8 }));
  assert.notDeepEqual(original, paletteFor({ ...DEFAULTS, variety: 0 }));
  assert.notDeepEqual(original, paletteFor({ ...DEFAULTS, variety: 1 }));
});

test("variety moves from the old close hues to a contrasting fourth swatch", () => {
  assert.deepEqual(paletteFor({ ...DEFAULTS, variety: 0 }),
    ["#063937", "#0e5b7e", "#175fcc", "#4957eb", "#a88ef2"]);
  const contrasting = paletteFor({ ...DEFAULTS, variety: 1 });
  assert.notEqual(contrasting[3], contrasting[2]);
  const hue = (hex) => {
    const [red, green, blue] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
    const high = Math.max(red, green, blue);
    const low = Math.min(red, green, blue);
    if (high === low) return 0;
    const delta = high - low;
    const section = high === red ? (green - blue) / delta + (green < blue ? 6 : 0)
      : high === green ? (blue - red) / delta + 2 : (red - green) / delta + 4;
    return section / 6;
  };
  const distance = Math.abs(hue(contrasting[3]) - hue(contrasting[2]));
  assert.ok(distance > 0.3 && distance < 0.7);
});

test("bad store parameter values fall back or clamp; saved name stays short", () => {
  assert.deepEqual(normalizeParams({ colour: 2, speed: NaN, grain: -2 }),
    { ...DEFAULTS, colour: 1, grain: 0 });
  assert.equal(nameFor({ ...DEFAULTS, colour: 0.06, glow: 0.5 }), "Ember dusk");
  const legacy = { ...DEFAULTS };
  delete legacy.variety;
  assert.deepEqual(normalizeParams(legacy), DEFAULTS);
});
