// The page renders one shared board. Pointer drags write Rupert's moves; store
// changes from the agent animate from the old pile tile to the new fridge tile.
import {
  getStore, onAccessChanged, onConnectionStatusChanged, onValue,
  ref, remove, runTransaction, update,
} from "/sdk/v1/resources.js";
import { buildMessage, submitTurn } from "./dispatch.mjs";
import { isRoomMagnet, layoutPile, tileWidthFraction } from "./pile-layout.mjs";

// Store schema: { words: { <stable magnet id>: word }, thinking: turn|null }.
// Each word requires text:string. Built-in pile words have only text. The room
// relay adds fresh-key pile words with from:"room" and addedAt:number (Unix ms).
// A placed word also has x:number and y:number (top-left fridge fractions),
// placedBy:"rupert"|"agent", and placedAt:number (Unix ms). Room origin can be
// recognized by its fresh key if agent-move replaces its other fields.
// A turn is { wordId:string, since:number }. The page initializes the store,
// writes Rupert's moves, room-word removals and thinking, and clears failed/
// timed-out turns. It retains room fields when Rupert moves a word.
// agent-move writes an agent word and thinking:null in one update, or resets all.
const db = getStore();
const root = ref(db);
const fridge = document.querySelector("#fridge");
const pile = document.querySelector("#pile");
const pileContent = document.querySelector("#pile-content");
const roomBin = document.querySelector("#room-bin");
const status = document.querySelector("#status");
const error = document.querySelector("#error");

let state = null;
let storeEmpty = false;
let initialWords = null;
let config = null;
let access = null;
let connection = "connecting";
let initializing = false;
let thinkingTimer = null;
const arriving = new Set();
const roomArriving = new Set();
const roomHighlights = new Map();
const settling = new Map();

/** A magnet is on the fridge only when both fractional coordinates exist. */
function isPlaced(word) {
  return Number.isFinite(word?.x) && Number.isFinite(word?.y);
}

/** Read near-aligned magnets as lines, with each line ordered left to right. */
function poemLines(words) {
  const placed = Object.values(words).filter(isPlaced).sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const word of placed) {
    if (!rows.length || word.y - rows.at(-1)[0].y > 0.075 * 0.7) rows.push([]);
    rows.at(-1).push(word);
  }
  return rows.map((row) => row.sort((a, b) => a.x - b.x).map((word) => word.text));
}

function canWrite() {
  return access === "read-write" && connection === "connected";
}

function canDrag(word) {
  return canWrite() && (isPlaced(word) || (config && !state?.thinking && !arriving.size));
}

function showError(message) {
  error.textContent = message;
  error.hidden = !message;
}

function reportStoreError(failure) {
  const message = failure?.code === "disconnected"
    ? "Connection lost. A recent move may still have saved."
    : failure?.code === "read-only"
      ? "This view can only read the fridge."
      : `Couldn't save the fridge: ${failure.message || failure}`;
  showError(message);
}

function renderStatus() {
  status.classList.toggle("thinking", Boolean(state?.thinking || arriving.size));
  if (connection === "disconnected") {
    status.textContent = "offline · moves paused";
  } else if (access === "read" || access === null && connection === "connected") {
    status.textContent = "view only";
  } else if (storeEmpty || !state) {
    status.textContent = "setting out words…";
  } else if (state.thinking || arriving.size) {
    status.textContent = "agent is thinking…";
  } else if (!config) {
    status.textContent = "waiting for agent…";
  } else {
    status.textContent = "your move";
  }
}

/** Rebuild both surfaces from the store; no local coordinates are authoritative. */
function render() {
  fridge.querySelectorAll(".magnet").forEach((tile) => tile.remove());
  pileContent.replaceChildren();
  if (!state) {
    renderStatus();
    return;
  }
  const { slots: pileSlots, scale, contentHeight } = layoutPile(state.words);
  pile.style.setProperty("--pile-scale", scale);
  pileContent.style.height = `${contentHeight * 100}%`;
  for (const [wordId, word] of Object.entries(state.words)) {
    if (typeof word?.text !== "string") continue;
    const tile = document.createElement("span");
    tile.className = "magnet";
    if (isRoomMagnet(wordId, word)) tile.classList.add("room-magnet");
    if (roomHighlights.has(wordId)) tile.classList.add("room-highlight");
    tile.dataset.id = wordId;
    tile.textContent = word.text;
    const number = Number(wordId.replace(/\D/g, "")) || 1;
    tile.style.setProperty("--tilt", `${((number * 7) % 13 - 6) * 0.55}deg`);
    // This width is the same fraction used by agent-move to avoid overlaps.
    tile.style.setProperty("--tile-width", `${tileWidthFraction(word.text) * (isPlaced(word) ? 1 : scale) * 100}%`);
    if (settling.has(wordId)) tile.classList.add("settle");
    if (isPlaced(word)) {
      tile.style.left = `${word.x * 100}%`;
      tile.style.top = `${word.y * 100}%`;
      if (arriving.has(wordId)) tile.classList.add("arrival-pending");
      fridge.append(tile);
    } else {
      const slot = pileSlots.get(wordId);
      tile.style.left = `${slot.x * 100}%`;
      tile.style.top = `${slot.y * 100}%`;
      if (roomArriving.has(wordId)) tile.classList.add("arrival-pending");
      pileContent.append(tile);
    }
    if (canDrag(word) && !arriving.has(wordId) && !roomArriving.has(wordId)) tile.classList.add("can-move");
    tile.addEventListener("pointerdown", startDrag);
  }
  renderStatus();
}

/** A newly stuck tile makes one short physical wobble, including after a redraw. */
function markSettling(wordId) {
  if (settling.has(wordId)) clearTimeout(settling.get(wordId));
  const tile = [...fridge.querySelectorAll(".magnet"), ...pile.querySelectorAll(".magnet")]
    .find((candidate) => candidate.dataset.id === wordId);
  tile?.classList.remove("settle");
  if (tile) void tile.offsetWidth;
  tile?.classList.add("settle");
  settling.set(wordId, setTimeout(() => {
    settling.delete(wordId);
    tile?.classList.remove("settle");
    [...fridge.querySelectorAll(".magnet"), ...pile.querySelectorAll(".magnet")]
      .find((candidate) => candidate.dataset.id === wordId)?.classList.remove("settle");
  }, 360));
}

/** Let magnets slide into new slots when a room arrival or removal reflows the pile. */
function animatePileReflow(previousRects) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (const tile of pileContent.querySelectorAll(".magnet")) {
    const previous = previousRects.get(tile.dataset.id);
    if (!previous || roomArriving.has(tile.dataset.id)) continue;
    const current = tile.getBoundingClientRect();
    const deltaX = previous.left - current.left;
    const deltaY = previous.top - current.top;
    if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1
      && Math.abs(previous.width - current.width) < 1) continue;
    tile.animate([
      { transform: `translate3d(${deltaX}px, ${deltaY}px, 0) rotate(var(--tilt)) scale(${previous.width / current.width}, ${previous.height / current.height})` },
      { transform: "translate3d(0, 0, 0) rotate(var(--tilt)) scale(1)" },
    ], { duration: 340, easing: "cubic-bezier(.2,.78,.25,1)" });
  }
}

/** Keep a newly arrived or returned magnet in view once the pile needs scroll. */
function revealPileWord(wordId) {
  const tile = [...pileContent.querySelectorAll(".magnet")]
    .find((candidate) => candidate.dataset.id === wordId);
  if (!tile) return false;
  const top = tile.offsetTop;
  if (top >= pile.scrollTop + 10
    && top + tile.offsetHeight <= pile.scrollTop + pile.clientHeight - 10) return false;
  pile.scrollTop = Math.max(0, top - pile.clientHeight * 0.55);
  return true;
}

/** A room word falls from beyond the top edge, bounces, then glows for a while. */
async function animateRoomArrival(wordId) {
  const target = [...pileContent.querySelectorAll(".magnet")]
    .find((tile) => tile.dataset.id === wordId);
  if (!target) {
    roomArriving.delete(wordId);
    return;
  }
  const targetRect = target.getBoundingClientRect();
  const doorRect = document.querySelector(".fridge").getBoundingClientRect();
  const sourceStyle = getComputedStyle(target);
  const flyer = target.cloneNode(true);
  flyer.classList.remove("arrival-pending", "can-move");
  flyer.classList.add("room-flyer");
  Object.assign(flyer.style, {
    left: `${targetRect.left}px`, top: `${targetRect.top}px`,
    width: `${targetRect.width}px`, height: `${targetRect.height}px`,
    fontSize: sourceStyle.fontSize, padding: sourceStyle.padding,
  });
  document.body.append(flyer);
  const startY = -Math.max(targetRect.top - doorRect.top + 80, 150);
  const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 920;
  try {
    await flyer.animate([
      { transform: `translate3d(0, ${startY}px, 0) rotate(-11deg) scale(1.12)`, opacity: 0, offset: 0 },
      { transform: "translate3d(0, 12px, 0) rotate(calc(var(--tilt) + 3deg)) scale(.96)", opacity: 1, offset: .72 },
      { transform: "translate3d(0, -7px, 0) rotate(calc(var(--tilt) - 1deg)) scale(1.02)", opacity: 1, offset: .85 },
      { transform: "translate3d(0, 0, 0) rotate(var(--tilt)) scale(1)", opacity: 1, offset: 1 },
    ], { duration, easing: "cubic-bezier(.28,.58,.27,1)", fill: "forwards" }).finished;
  } catch {
    // A later render or navigation can cancel the effect.
  } finally {
    flyer.remove();
    roomArriving.delete(wordId);
    const liveTile = [...pileContent.querySelectorAll(".magnet")]
      .find((tile) => tile.dataset.id === wordId);
    liveTile?.classList.remove("arrival-pending");
    if (state?.words[wordId]) {
      if (canDrag(state.words[wordId]) && !arriving.has(wordId)) {
        liveTile?.classList.add("can-move");
      }
      markSettling(wordId);
      if (roomHighlights.has(wordId)) clearTimeout(roomHighlights.get(wordId));
      liveTile?.classList.add("room-highlight");
      roomHighlights.set(wordId, setTimeout(() => {
        roomHighlights.delete(wordId);
        [...document.querySelectorAll(".magnet")]
          .find((tile) => tile.dataset.id === wordId)?.classList.remove("room-highlight");
      }, 4000));
    }
  }
}

/** Show the magnet and an agent cursor travelling from pile to destination. */
async function animateArrival(wordId, sourceRect) {
  const target = [...fridge.querySelectorAll(".magnet")].find((tile) => tile.dataset.id === wordId);
  if (!sourceRect || !target) {
    arriving.delete(wordId);
    target?.classList.remove("arrival-pending");
    if (state?.words[wordId] && canDrag(state.words[wordId])) target?.classList.add("can-move");
    renderStatus();
    return;
  }
  const targetRect = target.getBoundingClientRect();
  const flyer = target.cloneNode(true);
  flyer.classList.remove("arrival-pending", "can-move");
  flyer.classList.add("agent-flyer");
  Object.assign(flyer.style, {
    left: `${sourceRect.left}px`, top: `${sourceRect.top}px`,
    width: `${sourceRect.width}px`, height: `${sourceRect.height}px`,
    transformOrigin: "top left",
  });
  const cursor = document.createElement("div");
  cursor.className = "agent-cursor";
  const label = document.createElement("span");
  label.textContent = "agent";
  cursor.append(label);
  cursor.style.left = `${sourceRect.left + sourceRect.width - 6}px`;
  cursor.style.top = `${sourceRect.top + sourceRect.height - 5}px`;
  document.body.append(flyer, cursor);

  const deltaX = targetRect.left - sourceRect.left;
  const deltaY = targetRect.top - sourceRect.top;
  const middleX = deltaX * 0.48;
  const middleY = deltaY * 0.48 - 26;
  const flyerFlight = [
    { transform: "translate3d(0, 0, 0) rotate(var(--tilt)) scale(1)", offset: 0 },
    { transform: `translate3d(${middleX}px, ${middleY}px, 0) rotate(var(--tilt)) scale(1.1)`, offset: 0.48 },
    { transform: `translate3d(${deltaX}px, ${deltaY}px, 0) rotate(var(--tilt)) scale(${targetRect.width / sourceRect.width}, ${targetRect.height / sourceRect.height})`, offset: 1 },
  ];
  const cursorFlight = [
    { transform: "translate3d(0, 0, 0)", offset: 0 },
    { transform: `translate3d(${middleX}px, ${middleY}px, 0)`, offset: 0.48 },
    { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)`, offset: 1 },
  ];
  const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1200;
  const timing = { duration, easing: "cubic-bezier(.22,.8,.25,1)", fill: "forwards" };
  try {
    await Promise.all([
      flyer.animate(flyerFlight, timing).finished,
      cursor.animate(cursorFlight, timing).finished,
    ]);
  } catch {
    // Animation promises reject when a browser cancels an effect during reload.
  } finally {
    flyer.remove();
    cursor.remove();
    arriving.delete(wordId);
    const landed = [...fridge.querySelectorAll(".magnet")]
      .find((tile) => tile.dataset.id === wordId);
    landed?.classList.remove("arrival-pending");
    if (state?.words[wordId] && canDrag(state.words[wordId])) landed?.classList.add("can-move");
    markSettling(wordId);
    renderStatus();
  }
}

/** Clear only the turn we observed, so a late error cannot erase a newer turn. */
async function clearThinking(turn) {
  try {
    await runTransaction(ref(db, "thinking"), (current) =>
      current?.wordId === turn.wordId && current?.since === turn.since ? null : undefined);
  } catch (failure) {
    reportStoreError(failure);
  }
}

function scheduleTimeout() {
  if (thinkingTimer) clearTimeout(thinkingTimer);
  thinkingTimer = null;
  if (!state?.thinking || !canWrite()) return;
  const turn = state.thinking;
  const delay = Math.max(0, turn.since + 45_000 - Date.now());
  thinkingTimer = setTimeout(() => clearThinking(turn), delay);
}

function startDrag(event) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const tile = event.currentTarget;
  const wordId = tile.dataset.id;
  const word = state?.words[wordId];
  if (!word || !canDrag(word) || arriving.has(wordId) || roomArriving.has(wordId)) return;
  event.preventDefault();
  const isRoom = isRoomMagnet(wordId, word);
  fridge.parentElement.classList.toggle("room-dragging", isRoom);

  const sourceRect = tile.getBoundingClientRect();
  const startX = event.clientX;
  const startY = event.clientY;
  const ghost = tile.cloneNode(true);
  ghost.classList.remove("can-move", "settle");
  ghost.classList.add("drag-ghost");
  Object.assign(ghost.style, {
    left: `${sourceRect.left}px`, top: `${sourceRect.top}px`,
    width: `${sourceRect.width}px`, height: `${sourceRect.height}px`,
    transform: "translate3d(0, 0, 0) rotate(var(--tilt))",
  });
  document.body.append(ghost);
  tile.classList.add("is-source");

  let frame = 0;
  let deltaX = 0;
  let deltaY = 0;
  function move(pointer) {
    if (pointer.pointerId !== event.pointerId) return;
    if (isRoom) roomBin.classList.toggle("active", containsPointer(roomBin, pointer));
    deltaX = pointer.clientX - startX;
    deltaY = pointer.clientY - startY;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      ghost.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0) rotate(var(--tilt))`;
      frame = 0;
    });
  }
  function finish(pointer) {
    if (pointer && pointer.pointerId !== event.pointerId) return;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", finish);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("blur", cancel);
    if (frame) cancelAnimationFrame(frame);
    fridge.parentElement.classList.remove("room-dragging");
    roomBin.classList.remove("active");
    tile.classList.remove("is-source");
    ghost.remove();
    if (pointer) void saveDrop(wordId, word, pointer, sourceRect, startX, startY);
  }
  function cancel(pointer) {
    if (pointer?.pointerId !== undefined && pointer.pointerId !== event.pointerId) return;
    finish(null);
  }
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", finish);
  window.addEventListener("pointercancel", cancel);
  window.addEventListener("blur", cancel);
}

function containsPointer(element, pointer) {
  const rectangle = element.getBoundingClientRect();
  return pointer.clientX >= rectangle.left && pointer.clientX <= rectangle.right
    && pointer.clientY >= rectangle.top && pointer.clientY <= rectangle.bottom;
}

function fractionAtDrop(pointer, sourceRect, startX, startY, word) {
  const rectangle = fridge.getBoundingClientRect();
  const tileLeft = sourceRect.left + pointer.clientX - startX;
  const tileTop = sourceRect.top + pointer.clientY - startY;
  const x = Math.min(Math.max((tileLeft - rectangle.left) / rectangle.width, 0),
    Math.max(0, 1 - tileWidthFraction(word.text)));
  const y = Math.min(Math.max((tileTop - rectangle.top) / rectangle.height, 0),
    Math.max(0, 1 - Math.max(sourceRect.height, 38) / rectangle.height));
  return { x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 };
}

async function saveDrop(wordId, word, pointer, sourceRect, startX, startY) {
  if (!canWrite() || !state?.words[wordId]) return;
  const doorRect = fridge.parentElement.getBoundingClientRect();
  const belowDoor = pointer.clientY > doorRect.bottom + 4
    && pointer.clientX >= doorRect.left && pointer.clientX <= doorRect.right;
  if (isRoomMagnet(wordId, word) && (containsPointer(roomBin, pointer) || belowDoor)) {
    try {
      await remove(ref(db, `words/${wordId}`));
    } catch (failure) { reportStoreError(failure); }
    return;
  }
  if (containsPointer(fridge, pointer)) {
    const position = fractionAtDrop(pointer, sourceRect, startX, startY, word);
    if (isPlaced(word)) {
      try {
        await update(root, { [`words/${wordId}`]: { ...word, ...position } });
      } catch (failure) { reportStoreError(failure); }
      return;
    }
    if (!config || state.thinking || arriving.size) return;
    const since = Date.now();
    const placedWord = { ...word, ...position, placedBy: "rupert", placedAt: since };
    if (isRoomMagnet(wordId, word)) placedWord.from = "room";
    const turn = { wordId, since };
    const nextWords = { ...state.words, [wordId]: placedWord };
    try {
      await update(root, { [`words/${wordId}`]: placedWord, thinking: turn });
    } catch (failure) {
      reportStoreError(failure);
      return;
    }
    try {
      await submitTurn(config, buildMessage(word.text, poemLines(nextWords)));
      showError("");
    } catch (failure) {
      showError(`The agent didn't get that turn: ${failure.message || failure}`);
      await clearThinking(turn);
    }
  } else if (isPlaced(word) && containsPointer(pile, pointer)) {
    try {
      const returnedWord = { text: word.text };
      if (isRoomMagnet(wordId, word)) {
        returnedWord.from = "room";
        if (Number.isFinite(word.addedAt)) returnedWord.addedAt = word.addedAt;
      }
      await update(root, { [`words/${wordId}`]: returnedWord });
    } catch (failure) { reportStoreError(failure); }
  }
}

async function loadSetup() {
  try {
    const [wordsResponse, configResponse] = await Promise.all([fetch("./words.json"), fetch("./config.json")]);
    if (!wordsResponse.ok || !configResponse.ok) throw new Error("Could not load the word list or agent config.");
    const words = await wordsResponse.json();
    const settings = await configResponse.json();
    if (!Array.isArray(words) || !words.every((word) => typeof word === "string")
      || typeof settings.dispatchBase !== "string" || typeof settings.sessionId !== "string"
      || !/^https?:\/\//.test(settings.dispatchBase) || !settings.sessionId) {
      throw new Error("The word list or agent config is invalid.");
    }
    initialWords = words;
    config = settings;
    render();
    void maybeInitialize();
  } catch (failure) {
    showError(failure.message || String(failure));
  }
}

async function maybeInitialize() {
  if (!storeEmpty || !initialWords || !canWrite() || initializing) return;
  initializing = true;
  try {
    await runTransaction(root, (current) => {
      if (current !== undefined && current !== null) return undefined;
      return {
        words: Object.fromEntries(initialWords.map((text, index) =>
          [`m${String(index + 1).padStart(3, "0")}`, { text }])),
        thinking: null,
      };
    });
  } catch (failure) {
    reportStoreError(failure);
  } finally {
    initializing = false;
  }
}

onAccessChanged((level) => {
  access = level;
  render();
  scheduleTimeout();
  void maybeInitialize();
});
onConnectionStatusChanged((statusValue) => {
  connection = statusValue;
  render();
  scheduleTimeout();
  void maybeInitialize();
});
onValue(root, (snapshot) => {
  if (!snapshot.exists()) {
    state = null;
    storeEmpty = true;
    render();
    void maybeInitialize();
    return;
  }
  const next = snapshot.val();
  if (!next || typeof next !== "object" || !next.words || typeof next.words !== "object") {
    showError("The fridge store has an unexpected shape. Run agent-move reset.");
    return;
  }
  const sources = [];
  const movedWords = [];
  const newRoomWords = [];
  const roomMetadata = {};
  let removedRoom = false;
  if (state) {
    removedRoom = Object.entries(state.words).some(([wordId, word]) =>
      !next.words[wordId] && isRoomMagnet(wordId, word));
    for (const [wordId, word] of Object.entries(next.words)) {
      const previous = state.words[wordId];
      if (!previous && isRoomMagnet(wordId, word) && !isPlaced(word)) {
        newRoomWords.push(wordId);
        roomArriving.add(wordId);
      }
      // agent-move replaces whole word records. Restore room provenance while
      // this page still knows it; the fresh key is the fallback after reload.
      if (previous?.from === "room" && word.placedBy === "agent" && !word.from) {
        roomMetadata[`words/${wordId}/from`] = "room";
        if (Number.isFinite(previous.addedAt)) {
          roomMetadata[`words/${wordId}/addedAt`] = previous.addedAt;
        }
      }
      if (!isPlaced(previous) && isPlaced(word) && word.placedBy === "agent") {
        const source = [...pile.querySelectorAll(".magnet")].find((tile) => tile.dataset.id === wordId);
        sources.push([wordId, source?.getBoundingClientRect()]);
        arriving.add(wordId);
      } else if (isPlaced(previous) !== isPlaced(word)
        || isPlaced(word) && (previous?.x !== word.x || previous?.y !== word.y)) {
        movedWords.push(wordId);
      }
    }
  }
  const previousRects = new Map();
  if (newRoomWords.length || removedRoom) {
    for (const tile of pileContent.querySelectorAll(".magnet")) {
      previousRects.set(tile.dataset.id, tile.getBoundingClientRect());
    }
  }
  for (const [wordId, timer] of roomHighlights) {
    if (next.words[wordId]) continue;
    clearTimeout(timer);
    roomHighlights.delete(wordId);
  }
  state = next;
  storeEmpty = false;
  render();
  scheduleTimeout();
  const returnedWord = movedWords.length === 1 && !isPlaced(next.words[movedWords[0]])
    ? movedWords[0] : null;
  const pileScrolled = revealPileWord(newRoomWords.at(-1) || returnedWord);
  if (previousRects.size && !pileScrolled) animatePileReflow(previousRects);
  if (movedWords.length === 1) markSettling(movedWords[0]);
  for (const wordId of newRoomWords) void animateRoomArrival(wordId);
  for (const [wordId, sourceRect] of sources) void animateArrival(wordId, sourceRect);
  if (Object.keys(roomMetadata).length && canWrite()) {
    void update(root, roomMetadata).catch(reportStoreError);
  }
}, reportStoreError);

void loadSetup();
