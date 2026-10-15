// Pure colour rules shared by the art, palette strip and save action.
// tune_state.py mirrors this formula so CLI writes include the same palette.
export const DEFAULTS = Object.freeze({
  colour: 0.60, spread: 0.48, variety: 0.68, speed: 0.34, swirl: 0.52,
  scale: 0.52, glow: 0.54, grain: 0.28,
});

const offsets = [-0.22, -0.10, 0, 0.11, 0.23];
const lightnesses = [0.12, 0.27, 0.44, 0.60, 0.75];

/** Clamp untrusted store values into the controls' shared 0..1 range. */
export function normalizeParams(candidate = {}) {
  return Object.fromEntries(Object.entries(DEFAULTS).map(([name, fallback]) => {
    const value = candidate?.[name];
    return [name, typeof value === "number" && Number.isFinite(value)
      ? Math.min(1, Math.max(0, value)) : fallback];
  }));
}

/** Convert one HSL colour into the precise hex stored beside the parameters. */
function hexFromHsl(hue, saturation, lightness) {
  const channel = (number) => {
    const k = (number + hue * 12) % 12;
    const amplitude = saturation * Math.min(lightness, 1 - lightness);
    const value = lightness - amplitude * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255).toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/** Move one swatch through analogous, split and complementary harmonies. */
function hueOffset(index, spread, variety) {
  const familyOffset = offsets[index] * spread;
  if (index === 0) return familyOffset - variety * 0.02;
  if (index === 3) return familyOffset * (1 - variety) + 0.5 * variety;
  if (index === 4) return familyOffset + variety * 0.015;
  return familyOffset;
}

/** Return the five hex colours passed directly to the WebGL shader. */
export function paletteFor(input) {
  const params = normalizeParams(input);
  const saturation = 0.68 + 0.22 * params.glow;
  return offsets.map((_, index) => hexFromHsl(
    (params.colour + hueOffset(index, params.spread, params.variety) + 1) % 1,
    saturation,
    Math.min(0.9, lightnesses[index] + (params.glow - 0.5) * 0.10),
  ));
}

/** Give a saved colourway a short, human name without another text field. */
export function nameFor(params) {
  const hue = ((params.colour % 1) + 1) % 1;
  const family = ["Ember", "Honey", "Moss", "Lagoon", "Ocean", "Iris", "Orchid", "Rose"][Math.floor(hue * 8)];
  const light = params.glow > 0.68 ? "light" : params.glow < 0.34 ? "shade" : "dusk";
  return `${family} ${light}`;
}
