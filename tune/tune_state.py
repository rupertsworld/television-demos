"""Pure parameter rules for the agent CLI and the card's matching palette math.

All eight controls use 0..1. The palette is deterministic, so an agent write can
include its swatches atomically even when nobody has the page open.
"""

import colorsys
import math


DEFAULTS = {
    "colour": 0.60, "spread": 0.48, "variety": 0.68, "speed": 0.34, "swirl": 0.52,
    "scale": 0.52, "glow": 0.54, "grain": 0.28,
}

PRESETS = {
    "dusk": {"colour": 0.78, "spread": 0.38, "variety": 0.48, "speed": 0.24, "swirl": 0.38,
             "scale": 0.61, "glow": 0.43, "grain": 0.32},
    "ocean": {"colour": 0.53, "spread": 0.34, "variety": 0.95, "speed": 0.27, "swirl": 0.53,
              "scale": 0.54, "glow": 0.51, "grain": 0.20},
    "ember": {"colour": 0.06, "spread": 0.34, "variety": 0.18, "speed": 0.48, "swirl": 0.59,
              "scale": 0.44, "glow": 0.77, "grain": 0.38},
    "calm": {"colour": 0.42, "spread": 0.22, "variety": 0.07, "speed": 0.12, "swirl": 0.18,
             "scale": 0.77, "glow": 0.42, "grain": 0.12},
    "storm": {"colour": 0.64, "spread": 0.60, "variety": 1.0, "speed": 0.78, "swirl": 0.91,
              "scale": 0.35, "glow": 0.67, "grain": 0.51},
}


def parse_assignments(assignments: list[str]) -> dict[str, float]:
    """Validate a nonempty sequence of name=value arguments, clamping 0..1."""
    if not assignments:
        raise ValueError("Give at least one name=value pair")
    changes = {}
    for assignment in assignments:
        name, separator, raw = assignment.partition("=")
        if not separator or name not in DEFAULTS:
            raise ValueError(f"Unknown or malformed parameter: {assignment}")
        try:
            value = float(raw)
        except ValueError as error:
            raise ValueError(f"{name} needs a number") from error
        if not math.isfinite(value):
            raise ValueError(f"{name} needs a finite number")
        changes[name] = round(min(1.0, max(0.0, value)), 4)
    return changes


def palette_for(params: dict[str, float]) -> list[str]:
    """Build the five shader colours from colour, spread, variety and glow."""
    hue = params["colour"]
    spread = params["spread"]
    variety = params["variety"]
    glow = params["glow"]
    saturation = 0.68 + 0.22 * glow
    colours = []
    for index, offset in enumerate((-0.22, -0.10, 0.0, 0.11, 0.23)):
        family_offset = offset * spread
        if index == 0:
            offset = family_offset - variety * 0.02
        elif index == 3:
            offset = family_offset * (1 - variety) + 0.5 * variety
        elif index == 4:
            offset = family_offset + variety * 0.015
        else:
            offset = family_offset
        colour_hue = (hue + offset) % 1
        lightness = min(0.9, (0.12, 0.27, 0.44, 0.60, 0.75)[index] + (glow - 0.5) * 0.10)
        red, green, blue = colorsys.hls_to_rgb(colour_hue, lightness, saturation)
        colours.append("#" + "".join(f"{int(channel * 255 + 0.5):02x}" for channel in (red, green, blue)))
    return colours
