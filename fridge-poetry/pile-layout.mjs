// Give every magnet a repeatable place in the lower-door jumble. New room words
// join ahead of the stock set, and the layout shrinks before it needs to scroll.

const STOCK_ID = /^m\d{3}$/;
const STOCK_COUNT = 66; // The m001–m066 IDs created from words.json.
const MIN_SCALE = 0.68;
const VISIBLE_LAST_ROW = 8;

/** Identify a room word even after agent-move replaces its fields on placement. */
export function isRoomMagnet(wordId, word) {
  return word?.from === "room" || !STOCK_ID.test(wordId)
    || Number(wordId.slice(1)) < 1 || Number(wordId.slice(1)) > STOCK_COUNT;
}

/** Match the full-size tile width used by the page and agent-move placement. */
export function tileWidthFraction(text) {
  return Math.min(0.25, 0.032 + text.length * 0.014);
}

function scatterNumber(wordId) {
  if (!isRoomMagnet(wordId)) return Number(wordId.slice(1));
  return [...wordId].reduce((value, character) => (value * 31 + character.charCodeAt(0)) % 997, 1);
}

function arrange(entries, scale) {
  const slots = [];
  let row = 0;
  let nextX = 0.025;
  for (const [wordId, word] of entries) {
    const width = tileWidthFraction(word.text) * scale;
    if (nextX + width > 0.965) {
      row += 1;
      nextX = 0.025 + row % 3 * 0.01;
    }
    const number = scatterNumber(wordId);
    const xJitter = ((number * 17) % 7 - 3) * 0.0015;
    const yJitter = ((number * 11) % 9 - 4) * 0.0025;
    slots.push({ wordId, row, x: Math.max(0.01, Math.min(nextX + xJitter, 0.98 - width)), yJitter });
    nextX += width + 0.011 * scale;
  }
  return { slots, lastRow: row };
}

/** Return positions, tile scale, and scroll height for the complete inventory. */
export function layoutPile(words) {
  const entries = Object.entries(words)
    .filter(([, word]) => typeof word?.text === "string")
    .sort(([leftId, left], [rightId, right]) =>
      Number(isRoomMagnet(rightId, right)) - Number(isRoomMagnet(leftId, left))
      || leftId.localeCompare(rightId));
  let scale = 1;
  let arranged = arrange(entries, scale);
  while (arranged.lastRow > VISIBLE_LAST_ROW && scale > MIN_SCALE) {
    scale = Math.max(MIN_SCALE, Math.round((scale - 0.02) * 100) / 100);
    arranged = arrange(entries, scale);
  }
  const contentHeight = Math.max(1, arranged.lastRow / VISIBLE_LAST_ROW);
  const slots = new Map(arranged.slots.map(({ wordId, row, x, yJitter }) => [
    wordId,
    { row, x, y: 0.035 + row * 0.79 / Math.max(arranged.lastRow, 1) + yJitter },
  ]));
  return { slots, scale, contentHeight };
}
