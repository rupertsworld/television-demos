# Fridge poetry

A Television directory artifact for a short live duet. Rupert drags a magnet from the jumble on the lower door into the poem area above; the page saves that move and asks one Claude Code session, through Dispatch, to place one more word. Moving a poem word or returning it to the lower door does not call the agent.

## Set up

Register the folder on the desired Television channel:

```sh
tv create-path-artifact --channel <channel-id> --title "Fridge poetry" --path /root/workspace/dev/tv-demos/fridge-poetry --no-focus
```

Edit `config.json` with the Dispatch base URL and the target Claude Code conversation ID. Dispatch must allow the Television page origin through `DISPATCH_BROWSER_ORIGIN` when the request crosses origins. The page reads `config.json` from this folder; it puts no session ID in the JSON store. A successful HTTP 202 means Dispatch submitted the message, not that Claude Code acted on it.

Open the artifact once to initialize the shared store from `words.json`. The page needs write access for this first step and for dragging. It shows a read-only or disconnected state when writes are unavailable.

## Agent commands

```sh
./agent-move board
./agent-move place glow --after moon
./agent-move place glow --at 0.25 0.35
./agent-move reset
```

`agent-move` finds the registered artifact by matching this folder to `tv list-artifacts`; no ID is stored in the files. `reset` returns all words to the lower door and clears the thinking state. The page generates stable lower-door positions from the word IDs; they are not stored. The page also clears a failed Dispatch turn or a turn with no agent move after 45 seconds.

## Local checks

```sh
python3 -m unittest -v test_poetry.py
node --test dispatch.test.mjs
node --test pile-layout.test.mjs
```

The Python suite checks reading order, placement, wrapping, overlap, duplicate pile words, and the atomic `tv resource json update` sent through a fake `tv` executable. The JavaScript suites check stable lower-door positions and inspect the Dispatch POST through a local fetch stub, without contacting a real session.
