// The scattered pile keeps a stable spot for each magnet as the poem grows.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isRoomMagnet, layoutPile, tileWidthFraction } from "./pile-layout.mjs";

const texts = JSON.parse(readFileSync(new URL("./words.json", import.meta.url), "utf8"));
const words = Object.fromEntries(texts.map((text, index) =>
  [`m${String(index + 1).padStart(3, "0")}`, { text }]));

test("fresh room keys retain their identity after agent placement replaces the fields", () => {
  assert.equal(isRoomMagnet("m001", { text: "moon" }), false);
  assert.equal(isRoomMagnet("m067", { text: "new" }), true);
  assert.equal(isRoomMagnet("room-new", { text: "moon", from: "room", addedAt: 1 }), true);
  assert.equal(isRoomMagnet("room-new", { text: "moon", placedBy: "agent" }), true);
});

test("all 66 pile magnets fit on the lower door without losing their spots", () => {
  const { slots: positions, scale, contentHeight } = layoutPile(words);
  assert.equal(positions.size, texts.length);
  assert.equal(scale, 1);
  assert.equal(contentHeight, 1);
  assert.ok(Math.max(...[...positions.values()].map(({ row }) => row)) < 9);
  for (const [wordId, position] of positions) {
    assert.ok(position.x >= 0 && position.x + tileWidthFraction(words[wordId].text) <= 0.98);
    assert.ok(position.y >= 0 && position.y < 0.87);
  }

  const placed = { ...words, m001: { ...words.m001, x: 0.1, y: 0.2 } };
  assert.deepEqual(layoutPile(placed).slots, positions);
});

test("neighbors have room to be picked up despite small scattering offsets", () => {
  const positions = layoutPile(words).slots;
  const rows = new Map();
  for (const [wordId, position] of positions) {
    if (!rows.has(position.row)) rows.set(position.row, []);
    rows.get(position.row).push([wordId, position]);
  }
  for (const row of rows.values()) {
    for (let index = 1; index < row.length; index += 1) {
      const [previousId, previous] = row[index - 1];
      const [, current] = row[index];
      assert.ok(current.x >= previous.x + tileWidthFraction(words[previousId].text) - 0.015);
    }
  }
});

test("room words occupy separate non-overlapping slots and extra rows scroll inside the door", () => {
  const roomWords = Object.fromEntries(Array.from({ length: 90 }, (_, index) => [
    `room-${String(index).padStart(3, "0")}`,
    { text: `voice${index}`, from: "room", addedAt: 1_000 + index },
  ]));
  const { slots, scale, contentHeight } = layoutPile({ ...words, ...roomWords });
  assert.equal(slots.size, 156);
  assert.ok(scale < 1 && scale >= 0.68);
  assert.ok(contentHeight > 1);
  for (const [wordId, position] of slots) {
    assert.ok(position.x >= 0 && position.x + tileWidthFraction((roomWords[wordId] || words[wordId]).text) * scale <= 0.98);
    assert.ok(position.y >= 0 && position.y < 0.87);
  }
  const rows = new Map();
  for (const [wordId, position] of slots) {
    if (!rows.has(position.row)) rows.set(position.row, []);
    rows.get(position.row).push([wordId, position]);
  }
  for (const row of rows.values()) {
    for (let index = 1; index < row.length; index += 1) {
      const [previousId, previous] = row[index - 1];
      const [, current] = row[index];
      const text = (roomWords[previousId] || words[previousId]).text;
      assert.ok(current.x >= previous.x + tileWidthFraction(text) * scale - 0.015);
    }
  }
});
