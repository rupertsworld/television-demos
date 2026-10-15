"""Exercise the room relay safety boundary and its offline submission path."""

import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from argparse import Namespace
from contextlib import redirect_stdout
from io import StringIO
from urllib.parse import parse_qs, urlsplit

import room_line
from word_filter import load_filter


HERE = Path(__file__).resolve().parent
CATEGORY_FILES = {
    "slurs": "blocklist-slurs.txt",
    "profanity": "blocklist-profanity.txt",
    "identity": "blocklist-identity.txt",
    "politics": "blocklist-politics.txt",
    "harm": "blocklist-harm.txt",
}


def file_entries(filename):
    """Read category entries without repeating sensitive terms in tests."""
    return [line.strip().split(":", 1) for line in (HERE / filename).read_text().splitlines()
            if line.strip() and not line.lstrip().startswith("#")]


def sample_for_config(directory):
    """Keep the recorded response shape while using the live configured IDs."""
    sample = json.loads((HERE / "sample-submissions.json").read_text())
    config = json.loads((HERE / "config.json").read_text())
    for row in sample["submissions"]:
        if row["formId"] == "WOvbvJ":
            row["formId"] = config["formId"]
            row["responses"][0]["questionId"] = config["questionFieldId"]
    path = Path(directory) / "sample.json"
    path.write_text(json.dumps(sample))
    return path


class StrongFilterTests(unittest.TestCase):
    def test_each_category_has_a_substantial_editable_list(self):
        blocked = room_line.blocklist()
        minimums = {"slurs": 40, "profanity": 50, "identity": 60,
                    "politics": 45, "harm": 50}
        for category, filename in CATEGORY_FILES.items():
            entries = file_entries(filename)
            self.assertGreaterEqual(len(entries), minimums[category], filename)
            self.assertTrue(all(kind in ("word", "root") and term for kind, term in entries))
            for kind, term in entries[:3]:
                self.assertEqual(blocked.category_for(term), category, (filename, kind))

    def test_suffixes_repetitions_and_substring_roots(self):
        blocked = room_line.blocklist()
        for word, category in (("fuuuuck", "profanity"), ("puussy", "profanity"),
                               ("fuckers", "profanity"), ("jews", "identity"),
                               ("killing", "harm"), ("nazis", "politics"),
                               ("fuk", "profanity")):
            self.assertEqual(blocked.category_for(word), category, word)
        self.assertEqual(blocked.category_for("xxxxx"), "profanity")
        self.assertIsNone(blocked.category_for("as"))
        self.assertEqual(blocked.category_for("goood"), "identity")
        root = next(term for kind, term in file_entries("blocklist-slurs.txt") if kind == "root")
        self.assertEqual(blocked.category_for("x" + root + "x"), "slurs")

    def test_extra_entries_and_allowlist_are_loaded_together(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            for filename in CATEGORY_FILES.values():
                (folder / filename).write_text("# empty for this test\n")
            (folder / "blocklist-extra.txt").write_text("word:teapot\nroot:zzab\n")
            (folder / "allowlist.txt").write_text("pizzabread\n")
            blocked = load_filter(folder)
            self.assertEqual(blocked.category_for("teapots"), "extra")
            self.assertEqual(blocked.category_for("teapoot"), "extra")
            self.assertEqual(blocked.category_for("fizzabop"), "extra")
            self.assertIsNone(blocked.category_for("pizzabread"))

    def test_allowlist_and_two_hundred_ordinary_words_pass(self):
        blocked = room_line.blocklist()
        fridge = json.loads((HERE.parent / "fridge-poetry" / "words.json").read_text())
        ordinary = [line.strip() for line in (HERE / "ordinary-words.txt").read_text().splitlines()
                    if line.strip() and not line.startswith("#")]
        words = set(fridge + ordinary)
        self.assertGreaterEqual(len(words), 200)
        for word in words:
            self.assertIsNone(blocked.category_for(word), word)
        for word in ("class", "grass", "assess", "cocktail", "cocktails",
                     "scrap", "therapist", "button", "scunthorpe"):
            self.assertIsNone(blocked.category_for(word), word)

    def test_blocked_room_word_never_appears_in_log_or_check_output(self):
        blocked = room_line.blocklist()
        sensitive = next(term for kind, term in file_entries("blocklist-slurs.txt") if kind == "word")
        state = room_line.new_state("FORM", 0)
        with patch.object(room_line, "read_fridge") as fridge, \
             patch.object(room_line, "add_to_fridge") as add:
            message = room_line.process("s1", sensitive, 10000, state, blocked, "artifact")
        self.assertIn("blocked", message)
        self.assertIn("slurs", message)
        self.assertNotIn(sensitive, message.lower())
        fridge.assert_not_called()
        add.assert_not_called()
        checked = subprocess.run([str(HERE / "room-line"), "check", sensitive],
                                 capture_output=True, text=True, check=False)
        self.assertEqual(checked.returncode, 1)
        self.assertEqual(json.loads(checked.stdout), {"rejected": "blocked", "category": "slurs"})
        self.assertNotIn(sensitive, checked.stdout.lower())

    def test_blocked_face_line_uses_canned_reaction(self):
        sensitive = next(term for kind, term in file_entries("blocklist-slurs.txt") if kind == "word")
        response = json.dumps({"result": json.dumps({"line": "Oh, " + sensitive + "!",
                                                    "mood": "happy"})})
        self.assertIsNone(room_line.parse_reaction(response))
        dotted = ".".join(sensitive)
        self.assertIsNone(room_line.parse_reaction(json.dumps(
            {"line": "Oh, " + dotted + "!", "mood": "happy"})))
        with patch.object(room_line.subprocess, "run",
                          return_value=subprocess.CompletedProcess([], 0, response, "")):
            self.assertEqual(room_line.react("moon"), room_line.fallback("moon"))



class ValidationTests(unittest.TestCase):
    def test_check_and_add_reject_via_real_cli(self):
        entrypoint = HERE / "room-line"
        checked = subprocess.run([str(entrypoint), "check", "  Moon glow  "],
                                 capture_output=True, text=True, check=False)
        self.assertEqual(checked.returncode, 0)
        self.assertEqual(json.loads(checked.stdout), {"accepted": "moon"})
        rejected = subprocess.run([str(entrypoint), "add", "moon7"],
                                  capture_output=True, text=True, check=False)
        self.assertEqual(rejected.returncode, 1)
        self.assertEqual(json.loads(rejected.stdout), {"rejected": "invalid word"})

    def test_first_word_and_safe_spelling(self):
        for raw, expected in [("  Moon  glow", "moon"), ("can't wait", "can't"),
                              ("blue-green sky", "blue-green"), ("A", "a"),
                              ("Banana!", "banana"), ("'ghost'", "ghost")]:
            self.assertEqual(room_line.validate_word(raw, set()), (expected, None))

    def test_rejects_unsafe_spelling_and_blocked_words(self):
        for raw in ("", "123", "moon7", "https://example.org", "🌙", "a--b",
                    "-moon", "moon-", "a'b'c", "a_thing", "a" * 17,
                    "<script>", "éclair"):
            self.assertIsNone(room_line.validate_word(raw, set())[0], raw)
        self.assertEqual(room_line.validate_word("jerk", {"jerk"})[1], "blocked")

    def test_rejects_non_string_and_control_characters(self):
        self.assertIsNone(room_line.validate_word(["moon"], set())[0])
        self.assertIsNone(room_line.validate_word("moon\x1b[31m", set())[0])


class ReactionTests(unittest.TestCase):
    def test_cli_json_envelope_and_direct_json(self):
        direct = '{"line":"Moon? Into the pile it goes!","mood":"happy"}'
        self.assertEqual(room_line.parse_reaction(direct),
                         ("Moon? Into the pile it goes!", "happy"))
        self.assertEqual(room_line.parse_reaction(json.dumps({"result": direct})),
                         ("Moon? Into the pile it goes!", "happy"))
        self.assertEqual(room_line.parse_reaction(json.dumps({"result": direct,
            "structured_output": None})), ("Moon? Into the pile it goes!", "happy"))
        self.assertEqual(room_line.parse_reaction(json.dumps({"structured_output":
            {"line": "Oh, moon!", "mood": "surprised"}})), ("Oh, moon!", "surprised"))

    def test_bad_model_output_falls_back(self):
        for payload in ('not json', '{"line":"hi","mood":"evil"}',
                        '{"line":"hi","mood":"happy","tool":"Bash"}',
                        '{"line":"hi\u001b[31m","mood":"happy"}',
                        '{"line":"hi\nthere","mood":"happy"}',
                        '{"line":"' + "a" * 91 + '","mood":"happy"}',
                        '{"line":"fuck","mood":"happy"}',
                        '{"line":"hi","line":"bye","mood":"happy"}'):
            self.assertIsNone(room_line.parse_reaction(payload), payload)
        self.assertEqual(room_line.fallback("moon"), ("Moon? Into the pile it goes.", "happy"))

    def test_react_runs_without_tools_or_tally_key(self):
        captured = {}
        def model(command, **options):
            captured.update(command=command, options=options)
            return subprocess.CompletedProcess(command, 0,
                '{"result":"{\\"line\\":\\"Oh, moon!\\",\\"mood\\":\\"happy\\"}"}', "")
        with patch.dict(os.environ, {"TALLY_API_KEY": "test-secret", "UNRELATED_SECRET": "private"}), \
             patch.object(room_line.subprocess, "run", side_effect=model):
            self.assertEqual(room_line.react("moon"), ("Oh, moon!", "happy"))
        command = captured["command"]
        for flag in ("--tools", "--strict-mcp-config", "--mcp-config", "--safe-mode",
                     "--setting-sources", "--disable-slash-commands",
                     "--no-session-persistence", "--system-prompt", "--output-format"):
            self.assertIn(flag, command)
        self.assertEqual(command[command.index("--tools") + 1], "")
        self.assertEqual(command[command.index("--setting-sources") + 1], "")
        self.assertEqual(command[command.index("--mcp-config") + 1], '{"mcpServers":{}}')
        self.assertEqual(captured["options"]["timeout"], 6)
        self.assertNotIn("TALLY_API_KEY", captured["options"]["env"])
        self.assertNotIn("UNRELATED_SECRET", captured["options"]["env"])
        self.assertEqual(captured["options"]["env"]["CLAUDE_CODE_DISABLE_AUTO_MEMORY"], "1")
        self.assertEqual(captured["options"]["env"]["CLAUDE_CODE_DISABLE_CLAUDE_MDS"], "1")
        self.assertEqual(captured["options"]["env"]["CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"], "1")
        self.assertEqual(captured["options"]["env"]["ENABLE_CLAUDEAI_MCP_SERVERS"], "false")
        self.assertTrue(captured["options"]["cwd"].startswith("/tmp/"))

    def test_timeout_uses_fallback(self):
        with patch.object(room_line.subprocess, "run", side_effect=subprocess.TimeoutExpired("claude", 6)):
            self.assertEqual(room_line.react("moon"), room_line.fallback("moon"))
        with patch.object(room_line.subprocess, "run", side_effect=RuntimeError("model failed")):
            self.assertEqual(room_line.react("moon"), room_line.fallback("moon"))


class RelayTests(unittest.TestCase):
    def test_slow_reaction_does_not_hold_up_submission_processing(self):
        started = threading.Event()
        release = threading.Event()
        errors = []
        board = {"words": {}}
        def slow_react(word):
            started.set()
            release.wait(3)
            return "Oh, moon!", "happy"
        def add(word, timestamp, artifact):
            board["words"]["room"] = {"text": word}
        with tempfile.TemporaryDirectory() as directory, \
             patch.object(room_line, "STATE", Path(directory) / "state.json"), \
             patch.object(room_line, "artifact_id", return_value="artifact"), \
             patch.object(room_line, "read_fridge", return_value=board), \
             patch.object(room_line, "add_to_fridge", side_effect=add), \
             patch.object(room_line, "react", side_effect=slow_react), \
             patch.object(room_line, "speak"):
            args = Namespace(since="2026-10-14T19:00:00-07:00",
                             sample=sample_for_config(directory), once=True)
            def run():
                try:
                    with redirect_stdout(StringIO()):
                        room_line.poll(args)
                except Exception as error:
                    errors.append(error)
            thread = threading.Thread(target=run)
            thread.start()
            try:
                self.assertTrue(started.wait(2))
                deadline = time.monotonic() + 2
                while time.monotonic() < deadline:
                    path = Path(directory) / "state.json"
                    if path.exists() and len(json.loads(path.read_text())["seen"]) == 3:
                        break
                    time.sleep(0.01)
                self.assertEqual(len(json.loads(path.read_text())["seen"]), 3)
            finally:
                release.set()
                thread.join(3)
            self.assertFalse(thread.is_alive())
            self.assertEqual(errors, [])

    def test_tally_poll_uses_a_stub_and_reads_all_pages(self):
        first = {"submissions": [], "hasMore": True}
        second = {"submissions": [], "hasMore": False}
        requests = []
        class Response:
            def __init__(self, page):
                self.page = page
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return False
            def read(self, *args):
                return json.dumps(self.page).encode()
        def fetch(request, timeout):
            requests.append(request)
            return Response((first, second)[len(requests) - 1])
        with patch.dict(os.environ, {"TALLY_API_KEY": "stub-key"}), \
             patch.object(room_line, "urlopen", side_effect=fetch):
            self.assertEqual(room_line.fetch_submissions("WOvbvJ", 1792029600000),
                             [first, second])
        self.assertEqual(len(requests), 2)
        self.assertEqual(parse_qs(urlsplit(requests[0].full_url).query)["page"], ["1"])
        self.assertEqual(parse_qs(urlsplit(requests[1].full_url).query)["page"], ["2"])
        self.assertEqual(requests[0].get_header("Authorization"), "Bearer stub-key")

    def test_offline_run_processes_sample_once(self):
        board = {"words": {}}
        additions = []
        def add(word, timestamp, artifact):
            additions.append(word)
            board["words"][f"r{len(additions)}"] = {"text": word}
        with tempfile.TemporaryDirectory() as directory, \
             patch.object(room_line, "STATE", Path(directory) / "state.json"), \
             patch.object(room_line, "artifact_id", return_value="artifact"), \
             patch.object(room_line, "read_fridge", return_value=board), \
             patch.object(room_line, "add_to_fridge", side_effect=add), \
             patch.object(room_line, "react", return_value=("Oh, moon!", "happy")), \
             patch.object(room_line, "speak") as face:
            output = StringIO()
            args = Namespace(since="2026-10-14T19:00:00-07:00",
                             sample=sample_for_config(directory), once=True)
            with redirect_stdout(output):
                room_line.poll(args)
                room_line.poll(args)
            self.assertEqual(additions, ["moon"])
            face.assert_called_once_with("Oh, moon!", "happy")
            self.assertIn("s1: accepted moon; face: Oh, moon! [happy]", output.getvalue())
            self.assertIn("s2: rejected (blocked)", output.getvalue())
            self.assertIn("s3: rejected (rate limit)", output.getvalue())
    def test_recorded_submission_shape_and_filters(self):
        sample = json.loads((HERE / "sample-submissions.json").read_text())
        rows = room_line.parse_page(sample, "WOvbvJ", "j9doGa", 1792029600000)
        self.assertEqual([(row[0], row[2]) for row in rows],
                         [("s1", "  Moon  glow"), ("s2", "jerk"), ("s3", "moon")])
        sample["submissions"].append({"id": "bad\x1b[31m", "formId": "WOvbvJ",
            "isCompleted": True, "submittedAt": "2026-10-14T19:20:05-07:00",
            "responses": [{"questionId": "j9doGa", "answer": "safe"}]})
        self.assertEqual(len(room_line.parse_page(sample, "WOvbvJ", "j9doGa", 1792029600000)), 3)

    def test_rate_limit_duplicates_and_seen_ids(self):
        state = room_line.new_state("FORM", 0)
        board = {"words": {"m001": {"text": "sky"}}}
        added = []
        def add(word, now, artifact):
            added.append(word)
            board["words"][f"r{len(added)}"] = {"text": word}
        with patch.object(room_line, "read_fridge", return_value=board) as fridge, \
             patch.object(room_line, "add_to_fridge", side_effect=add):
            self.assertEqual(room_line.process("s1", "moon", 10000, state, set(), "artifact"),
                             room_line.ReactionJob("s1", "moon"))
            self.assertIn("rate limit", room_line.process("s2", "sun", 11000, state, set(), "artifact"))
            self.assertIn("duplicate", room_line.process("s3", "moon", 14000, state, set(), "artifact"))
            self.assertIn("duplicate", room_line.process("s4", "sky", 15000, state, set(), "artifact"))
            self.assertIn("face: skipped", room_line.process("s5", "cloud", 16000, state, set(), "artifact"))
            self.assertEqual(room_line.process("s1", "moon", 20000, state, set(), "artifact"), None)
        self.assertEqual(added, ["moon", "cloud"])
        self.assertEqual(fridge.call_count, 4)

    def test_persistent_state_contains_only_ids_and_timing(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "state.json"
            state = room_line.new_state("FORM", 1792029600000)
            state["seen"].append("s1")
            room_line.save_state(path, state)
            self.assertEqual(room_line.load_state(path, "FORM", 0), state)
            self.assertNotIn("moon", path.read_text())

    def test_fridge_add_pushes_room_pile_value(self):
        with patch.object(room_line, "tv", return_value="generated-key") as tv:
            room_line.add_to_fridge("moon", 1234, "artifact")
        self.assertEqual(tv.call_args.args[:5],
                         ("resource", "json", "push", "--artifact", "artifact"))
        self.assertEqual(tv.call_args.args[5], "words")
        self.assertEqual(json.loads(tv.call_args.args[6]),
                         {"text": "moon", "from": "room", "addedAt": 1234})


if __name__ == "__main__":
    unittest.main()
