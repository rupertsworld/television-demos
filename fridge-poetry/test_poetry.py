"""Exercise the fridge's placement rules and the agent CLI against a fake tv binary."""

import json
import os
from pathlib import Path
import subprocess
import importlib.machinery
import importlib.util
import tempfile
import unittest

import poetry


ROOT = Path(__file__).resolve().parent


def board_with(*placed):
    words = {
        "m001": {"text": "moon"},
        "m002": {"text": "wire"},
        "m003": {"text": "ghost"},
        "m004": {"text": "moon"},
        "m005": {"text": "signal"},
    }
    for word_id, x, y in placed:
        words[word_id].update(x=x, y=y, placedBy="rupert", placedAt=1000)
    return {"words": words, "thinking": {"wordId": "m001", "since": 1000}}


class PlacementTests(unittest.TestCase):
    def test_starting_state_puts_every_magnet_in_pile(self):
        state = poetry.starting_state(["moon", "moon", "wire"])
        self.assertEqual(list(state["words"]), ["m001", "m002", "m003"])
        self.assertEqual(state["words"]["m002"], {"text": "moon"})
        self.assertIsNone(state["thinking"])

    def test_places_pile_copy_after_anchor_and_clears_thinking(self):
        state = board_with(("m001", 0.1, 0.2))
        update = poetry.place_update(state, "MOON", after="moon", timestamp=2000)
        new_word = update["words/m004"]
        self.assertEqual(update["thinking"], None)
        self.assertEqual(new_word["placedBy"], "agent")
        self.assertEqual(new_word["placedAt"], 2000)
        self.assertEqual(new_word["y"], 0.2)
        self.assertGreaterEqual(new_word["x"], 0.1 + poetry.tile_width("moon"))
        self.assertNotIn("words/m001", update)

    def test_wraps_below_anchor_when_right_edge_is_full(self):
        state = board_with(("m001", 0.86, 0.2))
        update = poetry.place_update(state, "wire", after="moon", timestamp=2000)
        new_word = update["words/m002"]
        self.assertLess(new_word["x"], 0.2)
        self.assertGreater(new_word["y"], 0.2)

    def test_nudges_past_a_neighbor_without_overlap(self):
        state = board_with(("m001", 0.1, 0.2), ("m003", 0.22, 0.2))
        update = poetry.place_update(state, "wire", after="moon", timestamp=2000)
        new_word = update["words/m002"]
        self.assertFalse(poetry.overlaps(new_word, state["words"]["m003"]))
        self.assertFalse(poetry.overlaps(new_word, state["words"]["m001"]))

    def test_explicit_position_is_fractional_and_avoids_overlap(self):
        state = board_with(("m001", 0.1, 0.2))
        update = poetry.place_update(state, "wire", at=(0.1, 0.2), timestamp=2000)
        new_word = update["words/m002"]
        self.assertFalse(poetry.overlaps(new_word, state["words"]["m001"]))
        with self.assertRaisesRegex(ValueError, "between 0 and 1"):
            poetry.place_update(state, "wire", at=(1.2, 0.2), timestamp=2000)

    def test_board_reads_same_line_left_to_right_then_next_line(self):
        state = board_with(
            ("m001", 0.6, 0.1), ("m002", 0.1, 0.12), ("m003", 0.2, 0.4)
        )
        self.assertEqual(poetry.poem_lines(state), [["wire", "moon"], ["ghost"]])
        board = poetry.board_text(state)
        self.assertLess(board.index("wire (0.100, 0.120)"), board.index("moon (0.600, 0.100)"))
        self.assertIn("Pile: moon, signal", board)

    def test_rejects_missing_or_already_placed_words(self):
        state = board_with(("m001", 0.1, 0.2))
        with self.assertRaisesRegex(ValueError, "pile"):
            poetry.place_update(state, "unicorn", after="moon", timestamp=2000)
        with self.assertRaisesRegex(ValueError, "fridge"):
            poetry.place_update(state, "wire", after="unicorn", timestamp=2000)


class AgentMoveCliTests(unittest.TestCase):
    def test_suffix_magnet_is_a_positional_word(self):
        loader = importlib.machinery.SourceFileLoader("agent_move_cli", str(ROOT / "agent-move"))
        spec = importlib.util.spec_from_loader(loader.name, loader)
        module = importlib.util.module_from_spec(spec)
        loader.exec_module(module)
        arguments = module.parse_arguments(["place", "-ing", "--after", "moon"])
        self.assertEqual((arguments.word, arguments.after), ("-ing", "moon"))
        suffix_anchor = module.parse_arguments(["place", "moon", "--after", "-s"])
        self.assertEqual(suffix_anchor.after, "-s")

    def test_place_sends_one_atomic_tv_update_for_matching_folder(self):
        state = board_with(("m001", 0.1, 0.2))
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
                " print(json.dumps({'artifacts': [{'id': 'wrong', 'kind': 'path', 'path': '/tmp/other'}, "
                "{'id': 'right', 'kind': 'path', 'path': str(Path(os.environ['DEMO_FOLDER'])) + '/'}]}))\n"
                "elif args[2] == 'get': print(json.dumps({'exists': True, 'value': json.loads(os.environ['TV_STUB_STATE'])}))\n"
                "else: print('updated')\n"
            )
            fake_tv.chmod(0o755)
            env = os.environ | {
                "PATH": str(directory) + os.pathsep + os.environ.get("PATH", ""),
                "TV_STUB_LOG": str(log),
                "TV_STUB_STATE": json.dumps(state),
                "DEMO_FOLDER": str(ROOT),
            }
            result = subprocess.run(
                [str(ROOT / "agent-move"), "place", "wire", "--after", "moon"],
                env=env, capture_output=True, text=True, check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            calls = [json.loads(line) for line in log.read_text().splitlines()]
            self.assertEqual([call[:3] for call in calls], [
                ["list-artifacts"],
                ["resource", "json", "get"],
                ["resource", "json", "update"],
            ])
            self.assertEqual(calls[2][3:5], ["--artifact", "right"])
            update = json.loads(calls[2][-1])
            self.assertEqual(set(update), {"words/m002", "thinking"})
            self.assertEqual(update["words/m002"]["placedBy"], "agent")


if __name__ == "__main__":
    unittest.main()
