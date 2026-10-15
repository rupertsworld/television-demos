"""Plain-code screening for room words and model-written face lines.

Category files own the policy. The matcher only normalizes spelling, expands a
small set of endings for whole-word entries, and applies narrow substring roots.
An allowlist handles the few innocent words caught by a root or ending.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re


CATEGORY_FILES = (
    ("slurs", "blocklist-slurs.txt"),
    ("profanity", "blocklist-profanity.txt"),
    ("identity", "blocklist-identity.txt"),
    ("politics", "blocklist-politics.txt"),
    ("harm", "blocklist-harm.txt"),
    ("extra", "blocklist-extra.txt"),
)
SUFFIXES = ("s", "es", "ed", "er", "ers", "ing", "in", "y", "ies", "ish")
RUN = re.compile(r"([a-z])\1+")
ENTRY = re.compile(r"[a-z]+(?:['-][a-z]+)?\Z")


def forms(text: str) -> tuple[str, str]:
    """Return the punctuation-free spelling and its collapsed-letter form."""
    original = text.lower().replace("'", "").replace("-", "")
    collapsed = RUN.sub(r"\1", original)
    return original, collapsed


def whole_spellings(entry: str) -> frozenset[str]:
    """Expand conservative endings, including y-to-ies and silent-e forms."""
    base = entry.lower().replace("'", "").replace("-", "")
    spellings = {base}
    for suffix in SUFFIXES:
        spellings.add(base + suffix)
        if base.endswith("e") and suffix in ("ed", "er", "ers", "ing"):
            spellings.add(base[:-1] + suffix)
        if base.endswith("y") and suffix == "ies":
            spellings.add(base[:-1] + suffix)
    return frozenset(spellings)


@dataclass(frozen=True)
class Category:
    """Precomputed exact variants and substring roots for one policy file."""

    name: str
    whole: frozenset[str]
    collapsed_whole: frozenset[str]
    roots: frozenset[str]
    collapsed_roots: frozenset[str]


@dataclass(frozen=True)
class WordFilter:
    """Return the first category that blocks a spelling, or None if it passes."""

    categories: tuple[Category, ...]
    allowed: frozenset[str]

    def category_for(self, text: str) -> str | None:
        """Check allowed spellings first, then whole entries and narrow roots."""
        if not isinstance(text, str):
            return None
        original, collapsed = forms(text)
        repeated = original != collapsed
        if original in self.allowed:
            return None
        for category in self.categories:
            if original in category.whole or repeated and collapsed in category.collapsed_whole:
                return category.name
            if any(root in original for root in category.roots):
                return category.name
            if repeated and any(root in collapsed for root in category.collapsed_roots):
                return category.name
        return None


def read_entries(path: Path, *, allow_bare: bool = False) -> list[tuple[str, str]]:
    """Read editable word:/root: lines, keeping legacy bare extra words valid."""
    entries = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        entry = line.strip().lower()
        if not entry or entry.startswith("#"):
            continue
        kind, separator, term = entry.partition(":")
        if not separator and allow_bare:
            kind, term = "word", kind
        if kind not in ("word", "root") or not ENTRY.fullmatch(term):
            raise ValueError(f"Invalid filter entry at {path.name}:{number}")
        entries.append((kind, term))
    return entries


def load_filter(folder: Path) -> WordFilter:
    """Load every category and the small allowlist from the relay folder."""
    allowed_spellings = set()
    for number, line in enumerate((folder / "allowlist.txt").read_text(encoding="utf-8").splitlines(), 1):
        entry = line.strip().lower()
        if not entry or entry.startswith("#"):
            continue
        if not ENTRY.fullmatch(entry):
            raise ValueError(f"Invalid allowlist entry at allowlist.txt:{number}")
        allowed_spellings.update(whole_spellings(entry.replace("'", "").replace("-", "")))
    allowed = frozenset(allowed_spellings)
    categories = []
    for name, filename in CATEGORY_FILES:
        entries = read_entries(folder / filename, allow_bare=name == "extra")
        whole = frozenset(spelling for kind, term in entries if kind == "word"
                          for spelling in whole_spellings(forms(term)[0]))
        roots = frozenset(forms(term)[0] for kind, term in entries if kind == "root")
        categories.append(Category(
            name, whole, frozenset(forms(spelling)[1] for spelling in whole),
            roots, frozenset(forms(root)[1] for root in roots),
        ))
    return WordFilter(tuple(categories), allowed)
