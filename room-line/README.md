# Room line

This relay turns one-word submissions from a public Tally form into new pile magnets on the Fridge poetry card. It optionally asks a tool-free Claude process for a short face reaction. It does not send anything to Dispatch.

## Before the room arrives

Register and open the Fridge poetry and Face cards in Television. Opening the fridge initializes its JSON store. `config.json` points at the public word form. For a different form, replace `formId` and `questionFieldId` with the Tally form ID and the ID of its word question. Put the public URL for that form behind the QR code shown to the room. This relay reads submissions only; it never creates, edits, or submits a form.

Run from this folder:

```sh
op run --env-file=/root/env/tv-demo-tally.env.op -- ./room-line run
```

It polls every 2.5 seconds. Fridge additions continue while the single face worker waits for Claude. By default the first run starts at launch time; later starts resume the saved start time and skip saved submission IDs. To start from a specific time, use `--since 2026-10-14T19:00:00-07:00`. Stop with Ctrl-C. `state.json` and temporary state files are gitignored. They hold form, question, and submission IDs plus timing, never answers. If the configured form or word question changes, the relay starts a new window.

## Safety boundary

The raw answer stays in the polling process. Plain Python takes only the first token and requires 1 to 16 ASCII letters with at most one internal apostrophe or hyphen. The word is checked against the category files `blocklist-slurs.txt`, `blocklist-profanity.txt`, `blocklist-identity.txt`, `blocklist-politics.txt`, and `blocklist-harm.txt`, plus `blocklist-extra.txt`. Each category file explains `word:` entries, which catch common endings, and `root:` entries, which catch a spelling inside a longer word. The check ignores case, apostrophes, hyphens, and repeated letters. `allowlist.txt` holds a few innocent words caught by a root or ending; listed spellings and simple endings pass, but repeated-letter variants do not. Edit the files before starting the relay; restart to reload them.

Blocked submissions are logged only as `blocked` with their category: the word itself is never printed. Other rejected answers are logged by reason. No rejected answer goes to the fridge, model, or face. An accepted word goes to the fridge through `tv resource json push` under a fresh key; a duplicate or a word arriving within three seconds of another accepted word is dropped.

For a reaction, the validated word alone reaches `claude -p` from a fresh `/tmp` directory. Claude gets no tools, MCP servers, custom settings, hooks, skills, CLAUDE.md files, or auto-memory; the process has a six-second deadline and receives no Tally key. Code checks its JSON, line, mood, and every word in the line against the same filter before calling the existing `face say` helper. Any invalid or blocked response, or a timeout, produces a canned line. The face speaks at most once every eight seconds. The relay logs one line per completed submission it handles.

## Rehearsal and checks

```sh
./room-line check 'Moon glow'
./room-line react moon
./room-line add moon
python3 -m unittest -v test_room_line.py
```

`check` only validates. `react` calls the locked-down model and prints JSON without touching the face. `add` validates and adds a pile magnet, but does not speak. `sample-submissions.json` records the response shape used by the offline tests. `run --sample sample-submissions.json --since 2026-10-14T19:00:00-07:00 --once` substitutes that file for Tally while still targeting the configured fridge, so use it only on a rehearsal card. The tests stub Television, Claude, and the face, and never call Tally.
