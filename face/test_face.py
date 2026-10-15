"""Check the face helper's atomic commands with a fake Television CLI."""

import importlib.machinery
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parent
loader = importlib.machinery.SourceFileLoader("face_cli", str(ROOT / "face"))
spec = importlib.util.spec_from_loader(loader.name, loader)
face_cli = importlib.util.module_from_spec(spec)
loader.exec_module(face_cli)


class FaceHelperTests(unittest.TestCase):
    def run_face(self, *arguments):
        """Record the two expected tv calls without touching a live artifact."""
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            log = folder / "calls.jsonl"
            stub = folder / "tv"
            stub.write_text(
                "#!/usr/bin/env python3\n"
                "import json, os, sys\n"
                "args = sys.argv[1:]\n"
                "with open(os.environ['TV_STUB_LOG'], 'a') as out: out.write(json.dumps(args) + '\\n')\n"
                "if args[0] == 'list-artifacts':\n"
                " print(json.dumps({'artifacts': ["
                "{'id': 'other', 'kind': 'path', 'path': '/tmp/not-the-face'},"
                "{'id': 'face-id', 'kind': 'path', 'path': os.environ['DEMO_FOLDER'] + '/'}]}))\n"
                "else: print('updated')\n"
            )
            stub.chmod(0o755)
            environment = os.environ | {
                "PATH": str(folder) + os.pathsep + os.environ.get("PATH", ""),
                "TV_STUB_LOG": str(log),
                "DEMO_FOLDER": str(ROOT),
            }
            result = subprocess.run(
                [str(ROOT / "face"), *arguments], env=environment,
                capture_output=True, text=True, check=False,
            )
            calls = [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []
            return result, calls

    def test_say_writes_one_fresh_line_with_temporary_mood(self):
        result, calls = self.run_face("say", "A small paper miracle.", "--mood", "smug")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual([call[:3] for call in calls], [
            ["list-artifacts"], ["resource", "json", "update"],
        ])
        self.assertEqual(calls[1][3:5], ["--artifact", "face-id"])
        update = json.loads(calls[1][-1])
        self.assertEqual(set(update), {"say"})
        self.assertEqual(update["say"]["text"], "A small paper miracle.")
        self.assertEqual(update["say"]["mood"], "smug")
        self.assertEqual(len(update["say"]["id"]), 32)
        self.assertIsInstance(update["say"]["at"], int)

    def test_mood_and_reset_each_make_one_atomic_update(self):
        for arguments, expected in [
            (("mood", "sleepy"), {"mood": "sleepy"}),
            (("reset",), {"mood": "neutral", "say": None}),
        ]:
            with self.subTest(arguments=arguments):
                result, calls = self.run_face(*arguments)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(len(calls), 2)
                self.assertEqual(json.loads(calls[1][-1]), expected)

    def test_rejects_unknown_mood_before_tv_lookup(self):
        result, calls = self.run_face("mood", "furious")
        self.assertEqual(result.returncode, 2)
        self.assertIn("neutral", result.stderr)
        self.assertIn("mischievous", result.stderr)
        self.assertEqual(calls, [])

    def test_audio_must_exist_inside_folder_and_cannot_escape(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            (folder / "voice").mkdir()
            (folder / "voice" / "0003.wav").write_bytes(b"RIFF")
            with patch.object(face_cli, "FOLDER", folder):
                self.assertEqual(face_cli.audio_path("voice/0003.wav"), "voice/0003.wav")
                for filename in ("../outside.wav", "/tmp/file.wav", "https://x/y.wav", "voice/missing.wav"):
                    with self.subTest(filename=filename), self.assertRaises(ValueError):
                        face_cli.audio_path(filename)

    def test_empty_say_does_not_contact_tv(self):
        result, calls = self.run_face("say", "   ")
        self.assertEqual(result.returncode, 1)
        self.assertIn("cannot be empty", result.stderr)
        self.assertEqual(calls, [])


if __name__ == "__main__":
    unittest.main()
