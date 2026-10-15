"""Map five card colours into a readable fixed Television theme.

The palette supplies hue and the app wallpaper. Surface and text roles are
nudged toward black or white as needed so every body-text pair clears WCAG AA.
"""

import colorsys
import math
import re


HEX_COLOUR = re.compile(r"#[0-9a-fA-F]{6}\Z")


def channels(colour: str) -> tuple[int, int, int]:
    """Parse one validated #rrggbb colour."""
    if not isinstance(colour, str) or not HEX_COLOUR.fullmatch(colour):
        raise ValueError(f"Invalid palette colour: {colour!r}")
    return tuple(int(colour[index:index + 2], 16) for index in (1, 3, 5))


def colour_from_channels(values: tuple[float, float, float]) -> str:
    """Format clamped RGB channels as a CSS hex colour."""
    return "#" + "".join(f"{round(max(0, min(255, value))):02x}" for value in values)


def blend(first: str, second: str, second_weight: float) -> str:
    """Blend two palette colours in sRGB for subdued interface materials."""
    left, right = channels(first), channels(second)
    return colour_from_channels(tuple(a * (1 - second_weight) + b * second_weight
                                      for a, b in zip(left, right)))


def luminance(colour: str) -> float:
    """Return WCAG relative luminance for a hex colour."""
    def linear(channel: int) -> float:
        value = channel / 255
        return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4
    red, green, blue = (linear(channel) for channel in channels(colour))
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue


def contrast_ratio(first: str, second: str) -> float:
    """Return WCAG contrast ratio, with 4.5 as the normal-text floor."""
    brighter, darker = sorted((luminance(first), luminance(second)), reverse=True)
    return (brighter + 0.05) / (darker + 0.05)


def contrasting(source: str, grounds: tuple[str, ...], dark: bool) -> str:
    """Move only HLS lightness until source reads on every supplied ground."""
    red, green, blue = (channel / 255 for channel in channels(source))
    hue, lightness, saturation = colorsys.rgb_to_hls(red, green, blue)
    def at(value: float) -> str:
        rgb = colorsys.hls_to_rgb(hue, value, saturation)
        return colour_from_channels(tuple(component * 255 for component in rgb))
    if all(contrast_ratio(source, ground) >= 4.5 for ground in grounds):
        return source.lower()
    low, high = (lightness, 1.0) if dark else (0.0, lightness)
    for _ in range(24):
        middle = (low + high) / 2
        if all(contrast_ratio(at(middle), ground) >= 4.5 for ground in grounds):
            if dark:
                high = middle
            else:
                low = middle
        elif dark:
            low = middle
        else:
            high = middle
    return at(high if dark else low)


def map_palette(palette: list[str], params: dict) -> dict[str, str]:
    """Assign palette colours to readable application roles and one scheme."""
    if not isinstance(palette, list) or len(palette) != 5:
        raise ValueError("The store needs exactly five palette colours")
    for colour in palette:
        channels(colour)
    palette = [colour.lower() for colour in palette]
    if not isinstance(params, dict) or any(
        isinstance(params.get(name), bool)
        or not isinstance(params.get(name), (int, float))
        or not math.isfinite(params[name])
        or not 0 <= params[name] <= 1
        for name in ("glow", "variety")
    ):
        raise ValueError("The store needs 0..1 glow and variety parameters")
    dark = sum(luminance(colour) < 0.36 for colour in palette) >= 3
    ordered = sorted(palette, key=luminance)
    # A three-of-five vote can choose dark even when its darkest member is
    # mid-bright. Keep the palette hue but move the grounds far enough from
    # white (or black) that readable text is always possible.
    pole = "#ffffff" if dark else "#000000"
    def fit_ground(colour: str) -> str:
        return contrasting(colour, (pole,), not dark)
    if dark:
        surface = fit_ground(blend(ordered[0], "#000000", 0.14))
        muted = fit_ground(blend(surface, ordered[1], 0.35))
        text_source = blend(ordered[-1], "#ffffff", 0.80)
    else:
        surface = fit_ground(blend(ordered[-1], "#ffffff", 0.32))
        muted = fit_ground(blend(surface, ordered[-2], 0.30))
        text_source = blend(ordered[0], "#000000", 0.70)
    sidebar = muted
    titlebar = fit_ground(blend(surface, muted, 0.55))
    grounds = (surface, muted, sidebar, titlebar)
    text = contrasting(text_source, grounds, dark)
    text_muted = contrasting(blend(text, surface, 0.30), grounds, dark)
    saturated = sorted(palette, key=lambda colour: colorsys.rgb_to_hls(
        *(channel / 255 for channel in channels(colour)))[2], reverse=True)
    accent = contrasting(saturated[0], grounds, dark)
    link = contrasting(saturated[1], grounds, dark)
    selected_text = max(("#10131a", "#ffffff"), key=lambda colour: contrast_ratio(colour, accent))
    border = blend(surface, text, 0.22 if dark else 0.18)
    return {
        "scheme": "dark" if dark else "light", "surface": surface, "surfaceMuted": muted,
        "sidebar": sidebar, "titlebar": titlebar, "text": text,
        "textMuted": text_muted, "accent": accent, "link": link,
        "channelSelectedText": selected_text, "border": border,
    }


def render_css(roles: dict[str, str], palette: list[str], params: dict) -> str:
    """Render only documented tokens used by working Television themes."""
    colour = [value.lower() for value in palette]
    glow = max(0.0, min(1.0, params["glow"]))
    variety = max(0.0, min(1.0, params["variety"]))
    strength = round(50 + 12 * glow)
    angle = round(125 + 35 * variety)
    stops = ", ".join(
        f"color-mix(in srgb, {value} {strength}%, {roles['surface']}) {index * 25}%"
        for index, value in enumerate(colour)
    )
    shadow_alpha = "42%" if roles["scheme"] == "dark" else "18%"
    return f"""/* Generated by Colour study from its live five-colour store. */
:root {{
  --color-surface: {roles['surface']};
  --color-surface-muted: {roles['surfaceMuted']};
  --color-text: {roles['text']};
  --color-text-muted: {roles['textMuted']};
  --accent: {roles['accent']};
  --color-link: {roles['link']};
  --color-border: {roles['border']};
  --panel-border: 1px solid {roles['border']};
  --shadow-sm: 0 2px 6px rgb(0 0 0 / {shadow_alpha});
  --shadow-md: 0 7px 18px rgb(0 0 0 / {shadow_alpha});
  --shadow-lg: 0 18px 36px rgb(0 0 0 / {shadow_alpha});
}}

:root[data-television-document="app"] {{
  --sidebar-background: {roles['sidebar']};
  --sidebar-text-color: {roles['text']};
  --sidebar-heading-text-color: {roles['textMuted']};
  --sidebar-border: 1px solid {roles['border']};
  --app-wallpaper: linear-gradient({angle}deg, {stops});
  --wallpaper-overlay-background: {roles['surface']};
  --wallpaper-overlay-text-color: {roles['text']};
  --navbar-text-color: {roles['text']};
  --channel-background-selected: {roles['accent']};
  --channel-text-color-selected: {roles['channelSelectedText']};
  --tab-text-color: {roles['textMuted']};
  --tab-background-selected: {roles['surfaceMuted']};
  --tab-text-color-selected: {roles['text']};
  --tab-border-selected: 1px solid {roles['border']};
  --frame-background: {roles['surface']};
  --frame-border: 1px solid {roles['border']};
  --frame-titlebar-background: {roles['titlebar']};
  --frame-titlebar-text-color: {roles['text']};
  --frame-titlebar-border-color: {roles['border']};
  --artifact-frame-shadow: 0 20px 48px rgb(0 0 0 / {shadow_alpha});
}}

/* The collapsed channel picker has its own selected-row colours. */
:root[data-television-document="app"] .channel-switcher-pop {{
  --channel-background-selected: {roles['accent']};
  --channel-text-color-selected: {roles['channelSelectedText']};
}}
"""
