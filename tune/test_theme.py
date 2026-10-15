"""Check palette-to-theme mapping and the executable through a stub tv CLI."""

import json
import os
from pathlib import Path
import random
import re
import subprocess
import tempfile
import unittest

from theme_style import contrast_ratio, map_palette, render_css
from tune_state import DEFAULTS, palette_for


ROOT = Path(__file__).resolve().parent
EXAMPLES = [Path("/root/.television/themes/demo-halloween/theme.css"),
            Path("/root/.television/themes/zen-ink/theme.css")]


class ThemeMappingTests(unittest.TestCase):
    def test_dark_palette_maps_to_readable_dark_app(self):
        colours = palette_for(DEFAULTS)
        mapped = map_palette(colours, DEFAULTS)
        self.assertEqual(mapped["scheme"], "dark")
        for surface in ("surface", "surfaceMuted", "sidebar", "titlebar"):
            self.assertGreaterEqual(contrast_ratio(mapped["text"], mapped[surface]), 4.5)
            self.assertGreaterEqual(contrast_ratio(mapped["textMuted"], mapped[surface]), 4.5)
            self.assertGreaterEqual(contrast_ratio(mapped["link"], mapped[surface]), 4.5)
        self.assertGreaterEqual(contrast_ratio(mapped["channelSelectedText"], mapped["accent"]), 4.5)

    def test_light_palette_maps_to_readable_light_app(self):
        colours = ["#ffedc2", "#c7efd8", "#f9dce6", "#d8e2ff", "#fff8ed"]
        mapped = map_palette(colours, DEFAULTS)
        self.assertEqual(mapped["scheme"], "light")
        for surface in ("surface", "surfaceMuted", "sidebar", "titlebar"):
            self.assertGreaterEqual(contrast_ratio(mapped["text"], mapped[surface]), 4.5)
            self.assertGreaterEqual(contrast_ratio(mapped["textMuted"], mapped[surface]), 4.5)
            self.assertGreaterEqual(contrast_ratio(mapped["link"], mapped[surface]), 4.5)
        self.assertGreaterEqual(contrast_ratio(mapped["channelSelectedText"], mapped["accent"]), 4.5)

    def test_mixed_palettes_keep_text_readable(self):
        generator = random.Random(44)
        for _ in range(100):
            colours = ["#" + "".join(f"{generator.randrange(256):02x}" for _ in range(3))
                       for _ in range(5)]
            mapped = map_palette(colours, DEFAULTS)
            for surface in ("surface", "surfaceMuted", "sidebar", "titlebar"):
                for ink in ("text", "textMuted", "link"):
                    self.assertGreaterEqual(contrast_ratio(mapped[ink], mapped[surface]), 4.5,
                                            (colours, surface, ink))

    def test_invalid_palette_or_parameters_are_rejected(self):
        with self.assertRaises(ValueError):
            map_palette(["#ffffff"] * 4, DEFAULTS)
        with self.assertRaises(ValueError):
            map_palette(["#ffffff"] * 4 + ["red"], DEFAULTS)
        with self.assertRaises(ValueError):
            map_palette(["#ffffff"] * 5, DEFAULTS | {"glow": float("nan")})

    def test_wallpaper_contains_all_colours_and_css_uses_working_tokens(self):
        colours = palette_for(DEFAULTS)
        css = render_css(map_palette(colours, DEFAULTS), colours, DEFAULTS)
        for colour in colours:
            self.assertIn(colour, css)
        self.assertIn("--app-wallpaper:", css)
        self.assertNotIn("--demo-spooky", css)
        self.assertEqual(css.count("{"), css.count("}"))
        self.assertEqual(css.count("/*"), css.count("*/"))
        example_tokens = set().union(*(set(re.findall(r"(?m)^\s*(--[a-z0-9-]+)\s*:", path.read_text()))
                                       for path in EXAMPLES))
        generated_tokens = set(re.findall(r"(?m)^\s*(--[a-z0-9-]+)\s*:", css))
        self.assertTrue(generated_tokens <= example_tokens, generated_tokens - example_tokens)
        for line in css.splitlines():
            if re.match(r"\s*--[a-z0-9-]+\s*:", line):
                self.assertTrue(line.rstrip().endswith(";"), line)


class ThemeCliTests(unittest.TestCase):
    def run_theme(self, *arguments, out: Path, previous: Path, previous_name="zen-ink"):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            log = directory / "calls.jsonl"
            fake_tv = directory / "tv"
            fake_tv.write_text(
                "#!/usr/bin/env python3\n"
                "import json, os, sys\n"
                "from pathlib import Path\n"
                "args = sys.argv[1:]\n"
                "with open(os.environ['TV_STUB_LOG'], 'a') as log: log.write(json.dumps(args) + '\\n')\n"
                "if args[0] == 'list-artifacts':\n"
                " print(json.dumps({'artifacts': [{'id': 'other', 'kind': 'path', 'path': '/tmp/other'}, "
                "{'id': 'right', 'kind': 'path', 'path': str(Path(os.environ['DEMO_FOLDER'])) + '/'}]}))\n"
                "elif args[:3] == ['resource', 'json', 'get']:\n"
                " print(json.dumps({'exists': True, 'value': json.loads(os.environ['TV_STUB_STATE'])}))\n"
                "elif args[0] == 'focus-status':\n"
                " print(json.dumps({'activeThemeName': os.environ['TV_PREVIOUS_NAME']}))\n"
                "else: print('ok')\n"
            )
            fake_tv.chmod(0o755)
            colours = palette_for(DEFAULTS)
            env = os.environ | {
                "PATH": str(directory) + os.pathsep + os.environ.get("PATH", ""),
                "TV_STUB_LOG": str(log),
                "TV_STUB_STATE": json.dumps({"params": DEFAULTS, "palette": colours}),
                "TV_PREVIOUS_NAME": previous_name,
                "DEMO_FOLDER": str(ROOT),
                "TUNE_THEME_PREVIOUS_FILE": str(previous),
            }
            result = subprocess.run([str(ROOT / "theme"), "--out", str(out), *arguments],
                                    env=env, capture_output=True, text=True, check=False)
            calls = [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []
            return result, calls, colours

    def test_no_apply_writes_complete_package_without_selection_calls(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            out = root / "theme"
            previous = root / "previous"
            result, calls, colours = self.run_theme("--no-apply", out=out, previous=previous)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual([call[0] for call in calls], ["list-artifacts", "resource"])
            self.assertFalse(previous.exists())
            manifest = json.loads((out / "manifest.json").read_text())
            self.assertEqual(manifest["name"], "Colour study")
            self.assertIn(manifest["colorScheme"], ("dark", "light"))
            self.assertEqual(result.stdout.strip(), "demo-colour-study " + " ".join(colours))
            self.assertIn("--app-wallpaper:", (out / "theme.css").read_text())
            self.assertIn("Generated from the live Colour study card", (out / "README.md").read_text())

    def test_apply_saves_original_once_and_sets_fixed_theme_id(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            out = root / "theme"
            previous = root / "previous"
            first, calls, _ = self.run_theme(out=out, previous=previous)
            self.assertEqual(first.returncode, 0, first.stderr)
            self.assertEqual([call[0] for call in calls],
                             ["list-artifacts", "resource", "focus-status", "set-theme"])
            self.assertEqual(calls[-1], ["set-theme", "demo-colour-study"])
            self.assertEqual(previous.read_text(), "zen-ink\n")
            second, calls, _ = self.run_theme(out=out, previous=previous, previous_name="other-theme")
            self.assertEqual(second.returncode, 0, second.stderr)
            self.assertEqual([call[0] for call in calls], ["list-artifacts", "resource", "set-theme"])
            self.assertEqual(previous.read_text(), "zen-ink\n")


if __name__ == "__main__":
    unittest.main()
