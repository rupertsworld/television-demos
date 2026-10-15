# The agent's face

A Television card for an on-stage agent. The page reads a shared JSON store and speaks each new line out loud; it never accepts text input. The expression, blinks and drifting eyes remain visible between lines.

## Set up

Register this directory on the desired channel, then open it in Television:

```sh
tv create-path-artifact --channel <channel-id> --title "The agent's face" --path /root/workspace/dev/tv-demos/face --no-focus
```

The HTML artifact already has a JSON store. The `face` helper finds the registered artifact by matching this folder's path in `tv list-artifacts`; no artifact ID belongs in these files. The helper can write the first store value before the page opens.

## Agent commands

```sh
./face mood thinking
./face say "I have a suspiciously good feeling about this." --mood smug
./face say "I brought my own voice." --mood happy --audio voice/0003.wav
./face reset
```

`mood` sets the expression at rest. `say --mood` changes the expression only for that line; afterward the face returns to its resting mood. `--audio` is optional and must point to an existing `.wav`, `.mp3`, `.m4a` or `.ogg` file inside this folder. Each command does one artifact lookup and one atomic JSON store update.

The store holds `{ "mood": "neutral", "say": null }`, with a new line shaped like `{ "id": "unique string", "text": "...", "mood": "happy", "audio": "voice/0003.wav", "at": 1792029600000 }`. `mood` and `audio` inside `say` are optional. `at` is Unix time in milliseconds. A page speaks a new ID once per page session and ignores an entry more than 30 seconds old when it loads or reconnects. The page keeps no browser storage because Television's artifact sandbox disallows it.

## Voice

Edit `config.json` to set `voice` (preferred browser voice names, in order), `rate` and `pitch`. The page chooses the first available name, then the browser default. Installed voice names differ across macOS and Chrome/Electron. If the browser blocks speech until interaction, click the small **tap to wake me** prompt once; the pending line will play. If speech synthesis is missing, the caption and mouth still animate. Pre-rendered audio takes priority over synthesis.

## Halloween look

The prepared Halloween theme sets `--demo-spooky: 1` in both its installed and source `theme.css`. The face reads that property from the root's computed style. It reveals paper vampire hair, eye rings, a cape and moving fangs, and switches to pale green paper skin. All nine moods still use their usual moving eyes, brows and mouth. Browser speech runs at 90% of the configured rate and 82% of its pitch while the Halloween marker is present; pre-rendered audio keeps its authored sound.

Television reloads path-artifact frames when a theme is selected, so the vampire reveal also runs on a fresh page load. A light 1.2-second check catches an in-place stylesheet change. Returning to the normal theme removes the vampire pieces. The page keeps the paper arrival animation on reload in either direction.

## Local check

```sh
python3 -m unittest -v test_face.py
node --check app.mjs
NODE_PATH=/root/workspace/dev/television/main/node_modules node test_theme.cjs
```

The Python tests check the CLI's two-command path, atomic updates, mood validation and audio path rules. The Chromium test uses Playwright from the local Television checkout and intercepts all page requests with canonical, theme and JSON store stubs; it changes no Television state. It checks theme activation, reversal and startup reveal, all moods in both looks, fangs, the red eye glint, and the synthetic voice settings. Confirm the full theme palette, caption legibility, the gesture prompt, voice selection and mouth timing by eye and ear in Television's live browser.
