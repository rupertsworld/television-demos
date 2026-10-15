"""Pure fridge state and placement rules shared by the agent CLI and its tests.

Positions are top-left fractions of the fridge. Width matches the page tile
formula; height is a conservative estimate so the CLI needs no browser layout.
"""

from __future__ import annotations


TILE_HEIGHT = 0.075
EDGE = 0.04
LINE_STEP = 0.11
GAP = 0.012


def starting_state(texts: list[str]) -> dict:
    """Return a new board with stable IDs and every word in the pile."""
    return {
        "words": {f"m{number:03d}": {"text": text} for number, text in enumerate(texts, 1)},
        "thinking": None,
    }


def is_on_fridge(word: dict) -> bool:
    """Identify placed words by their fractional coordinates."""
    return isinstance(word.get("x"), (int, float)) and isinstance(word.get("y"), (int, float))


def tile_width(text: str) -> float:
    """Match the width fraction assigned to each tile by app.mjs."""
    return min(0.25, 0.032 + len(text) * 0.014)


def overlaps(first: dict, second: dict) -> bool:
    """Check the visible rectangles, allowing a small breathing gap."""
    return (
        first["x"] < second["x"] + tile_width(second["text"]) + GAP
        and first["x"] + tile_width(first["text"]) + GAP > second["x"]
        and first["y"] < second["y"] + TILE_HEIGHT + GAP
        and first["y"] + TILE_HEIGHT + GAP > second["y"]
    )


def poem_rows(state: dict) -> list[list[tuple[str, dict]]]:
    """Group nearly aligned words into lines, then read each line left to right."""
    placed = [(word_id, word) for word_id, word in state["words"].items() if is_on_fridge(word)]
    placed.sort(key=lambda pair: (pair[1]["y"], pair[1]["x"]))
    rows: list[list[tuple[str, dict]]] = []
    for pair in placed:
        if not rows or pair[1]["y"] - rows[-1][0][1]["y"] > TILE_HEIGHT * 0.7:
            rows.append([])
        rows[-1].append(pair)
    for row in rows:
        row.sort(key=lambda pair: pair[1]["x"])
    return rows


def poem_lines(state: dict) -> list[list[str]]:
    """Return the fridge poem as word lines for the Dispatch prompt."""
    return [[word["text"] for _, word in row] for row in poem_rows(state)]


def board_text(state: dict) -> str:
    """Print placed words and coordinates in reading order, then the remaining pile."""
    rows = poem_rows(state)
    fridge = "\n".join(
        "  " + "  ".join(f'{word["text"]} ({word["x"]:.3f}, {word["y"]:.3f})' for _, word in row)
        for row in rows
    ) or "  (empty)"
    pile = ", ".join(word["text"] for word in state["words"].values() if not is_on_fridge(word))
    return f"Fridge:\n{fridge}\nPile: {pile or '(empty)'}"


def find_open_spot(state: dict, text: str, preferred_x: float, preferred_y: float) -> tuple[float, float]:
    """Try the intended line, nudging right; wrap to the next line as needed."""
    placed = [word for word in state["words"].values() if is_on_fridge(word)]
    y = preferred_y
    first_line = True
    while y + TILE_HEIGHT <= 1 - EDGE:
        x = preferred_x if first_line else EDGE
        first_line = False
        while x + tile_width(text) <= 1 - EDGE:
            candidate = {"text": text, "x": x, "y": y}
            collisions = [word for word in placed if overlaps(candidate, word)]
            if not collisions:
                return round(x, 4), round(y, 4)
            x = max(word["x"] + tile_width(word["text"]) + GAP for word in collisions)
        y = round(y + LINE_STEP, 4)
    raise ValueError("No room left on the fridge for another word")


def place_update(
    state: dict, text: str, *, after: str | None = None,
    at: tuple[float, float] | None = None, timestamp: int,
) -> dict:
    """Return one atomic tv update: a pile copy's placement and a cleared thinking flag."""
    if (after is None) == (at is None):
        raise ValueError("Choose exactly one of --after or --at")
    if at is not None and not all(0 <= coordinate <= 1 for coordinate in at):
        raise ValueError("Coordinates must be between 0 and 1")
    pile_word = next(
        ((word_id, word) for word_id, word in state["words"].items()
         if word["text"].casefold() == text.casefold() and not is_on_fridge(word)),
        None,
    )
    if pile_word is None:
        raise ValueError(f'No pile copy of "{text}" is available')
    if after is not None:
        anchor = next(
            (word for word in state["words"].values()
             if word["text"].casefold() == after.casefold() and is_on_fridge(word)),
            None,
        )
        if anchor is None:
            raise ValueError(f'No "{after}" is on the fridge')
        preferred_x = anchor["x"] + tile_width(anchor["text"]) + GAP
        preferred_y = anchor["y"]
    else:
        assert at is not None
        preferred_x, preferred_y = at
    x, y = find_open_spot(state, pile_word[1]["text"], preferred_x, preferred_y)
    return {
        f"words/{pile_word[0]}": {
            "text": pile_word[1]["text"], "x": x, "y": y,
            "placedBy": "agent", "placedAt": timestamp,
        },
        "thinking": None,
    }
