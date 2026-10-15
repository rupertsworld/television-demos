"""Exercise the agent-facing tune command through a stub Television CLI."""

import colorsys
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

from tune_state import DEFAULTS, PRESETS, palette_for, parse_assignments


ROOT = Path(__file__).resolve().parent


class ParameterTests(unittest.TestCase):
    def test_assignments_validate_names_numbers_and_clamp(self):
        self.assertEqual(parse_assignments(["colour=0.6", "variety=2", "grain=-1"]),
                         {"colour": 0.6, "variety": 1.0, "grain": 0.0})
        for argument in ("nope=0.4", "speed=wow", "speed=nan", "speed", "=0.2"):
            with self.subTest(argument=argument), self.assertRaises(ValueError):
                parse_assignments([argument])
        with self.assertRaises(ValueError):
            parse_assignments([])

    def test_presets_have_every_parameter_and_palette_has_five_hex_colours(self):
        for name, params in PRESETS.items():
            with self.subTest(name=name):
                self.assertEqual(set(params), set(DEFAULTS))
                self.assertTrue(all(0 <= value <= 1 for value in params.values()))
                self.assertEqual(len(palette_for(params)), 5)
                self.assertTrue(all(len(colour) == 7 and colour.startswith("#")
                                    for colour in palette_for(params)))

    def test_variety_preserves_family_at_zero_and_adds_a_contrasting_accent(self):
        family = palette_for(DEFAULTS | {"variety": 0})
        self.assertEqual(family, ["#063937", "#0e5b7e", "#175fcc", "#4957eb", "#a88ef2"])
        ocean = palette_for(PRESETS["ocean"])
        def hue(colour):
            rgb = [int(colour[index:index + 2], 16) / 255 for index in (1, 3, 5)]
            return colorsys.rgb_to_hls(*rgb)[0]
        self.assertTrue(all(0.43 < hue(ocean[index]) < 0.64 for index in (0, 1, 2, 4)))
        self.assertTrue(hue(ocean[3]) < 0.12 or hue(ocean[3]) > 0.95)
        rotated = palette_for(PRESETS["ocean"] | {"colour": 0.63})
        self.assertTrue(all(abs((hue(after) - hue(before)) % 1 - 0.1) < 0.01
                            for before, after in zip(ocean, rotated)))
        ember = palette_for(PRESETS["ember"])
        self.assertTrue(all(hue(colour) < 0.24 or hue(colour) > 0.94 for colour in ember))
        storm = palette_for(PRESETS["storm"])
        self.assertGreater(abs(hue(storm[3]) - hue(storm[2])), 0.3)


class TuneCliTests(unittest.TestCase):
    def run_tune(self, *arguments, state=None):
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
                "{'id': 'tune-id', 'kind': 'path', 'path': str(Path(os.environ['DEMO_FOLDER'])) + '/'}]}))\n"
                "elif args[2] == 'get': print(json.dumps({'exists': True, 'value': json.loads(os.environ['TV_STUB_STATE'])}))\n"
                "else: print('updated')\n"
            )
            fake_tv.chmod(0o755)
            env = os.environ | {
                "PATH": str(directory) + os.pathsep + os.environ.get("PATH", ""),
                "TV_STUB_LOG": str(log),
                "TV_STUB_STATE": json.dumps(state or {"params": DEFAULTS, "palette": palette_for(DEFAULTS), "saved": {}}),
                "DEMO_FOLDER": str(ROOT),
            }
            result = subprocess.run([str(ROOT / "tune"), *arguments], env=env,
                                    capture_output=True, text=True, check=False)
            calls = [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []
            return result, calls

    def test_get_palette_and_saved_read_store(self):
        state = {"params": DEFAULTS, "palette": palette_for(DEFAULTS),
                 "saved": {"one": {"name": "Ember dusk", "params": DEFAULTS,
                                   "palette": palette_for(DEFAULTS), "savedAt": 1000}}}
        for command, expected in (("get", DEFAULTS), ("palette", state["palette"]),
                                  ("saved", state["saved"])):
            result, calls = self.run_tune(command, state=state)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout), expected)
            self.assertEqual([call[0] for call in calls], ["list-artifacts", "resource"])

    def test_get_and_palette_show_variety_for_an_existing_seven_control_store(self):
        old_params = {name: value for name, value in DEFAULTS.items() if name != "variety"}
        old_state = {"params": old_params, "palette": ["#000000"] * 5, "saved": {}}
        result, _ = self.run_tune("get", state=old_state)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), DEFAULTS)
        result, _ = self.run_tune("palette", state=old_state)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), palette_for(DEFAULTS))

    def test_set_merges_and_writes_params_with_matching_palette(self):
        result, calls = self.run_tune("set", "colour=0.6", "variety=1.4", "swirl=0.9")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls[-1][:5], ["resource", "json", "update", "--artifact", "tune-id"])
        payload = json.loads(calls[-1][-1])
        expected = DEFAULTS | {"colour": 0.6, "variety": 1.0, "swirl": 0.9}
        self.assertEqual(payload, {"params": expected, "palette": palette_for(expected)})

    def test_presets_reset_and_rejected_input(self):
        for arguments, expected in ((["preset", "storm"], PRESETS["storm"]),
                                    (["reset"], DEFAULTS)):
            result, calls = self.run_tune(*arguments)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(calls[-1][-1]),
                             {"params": expected, "palette": palette_for(expected)})
        for arguments in (("set", "unknown=0.5"), ("preset", "unknown")):
            result, calls = self.run_tune(*arguments)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(any(call[:3] == ["resource", "json", "update"] for call in calls))


if __name__ == "__main__":
    unittest.main()
