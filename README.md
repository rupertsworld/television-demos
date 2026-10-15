# Television demos

The cards from my five-minute demo at Adaptive Software: Diff & Demo in San Francisco on October 14, 2026. Each folder is one card on [Television](https://television.run), a screen you share with your AI agent. You and the agent use the same card: the agent reads and writes its data, and you see and use its interface.

- **Fridge poetry**: you drag a word onto a fridge door, and the agent answers with a word of its own.
- **Send a word**: the room scans a QR code and sends one word, which lands on the fridge as a new magnet.
- **Face**: a paper cut-out face that speaks the agent's lines out loud. It turns into a vampire under the Halloween theme.
- **Colour study**: an animated colour field. You tune it with sliders, the agent tunes it by meaning ("make it feel like a storm"), and `tune/theme` turns the colours into a Television theme in about a second.
- **Halloween theme** and **Tonight**: a theme that changes the whole screen at once, and an ordinary event page that shows the change.
- **Everyday**: the plain cards the talk opens with, in `everyday/`: a logo, a checklist, a calendar and a code viewer.

## 1. Get Television working

Television needs an agent that can use skills and files, such as [Claude Code](https://claude.com/product/claude-code), running on macOS or Linux.

1. Install Television by following [its README](https://github.com/telepath-computer/television#installation). On a Mac, download the app and it will walk you through connecting your agent. Elsewhere, ask your agent to read `https://television.run/install.md` and set it up for you.
2. Check that your agent can reach it: ask it to "put a hello-world card on my TV". The `tv` command should now work in your terminal.
3. Create a channel for the demo, and note its ID:

   ```sh
   tv create-channel --name "Demo"
   ```

## 2. Put the cards on your channel

Clone this repository, then register each card from its folder:

```sh
CHANNEL=<your channel ID>
for card in fridge-poetry face send-a-word tune tonight; do
  tv create-path-artifact --channel "$CHANNEL" --title "$card" --path "$PWD/$card" --no-focus
done
```

Open each card once in Television. That creates the card's data store.

The agent's helpers find their card by its folder path, so the agent can drive them straight away from this folder:

```sh
face/face say "Hello, room." --mood happy
tune/tune preset storm
fridge-poetry/agent-move place glow --after moon
```

## 3. Connect the parts that need more

Some cards need other services. Each folder's README has the details.

- **Fridge poetry** tells your agent when you place a word by sending a message through [Dispatch](https://github.com/rupertsworld/dispatch), a small server that sends messages to a running Claude Code session. Run Dispatch, then put its address and your agent session's ID in `fridge-poetry/config.json`.
- **Send a word** needs a public [Tally](https://tally.so) form and a Tally API key. `room-line/create-form.py --new` makes the form under your Tally account and writes its ID to `room-line/config.json`. Then start the relay, which checks the form every few seconds:

  ```sh
  TALLY_API_KEY=<your key> room-line/room-line run
  ```

  Make a new QR code for your form's link and replace `send-a-word/qr.svg`.

  Only plain code reads what the room types. It cuts each entry to one word and checks it against the block lists in `room-line/`, which you can edit. The face's reaction comes from `claude -p` with no tools, settings or files.
- **Halloween theme**: install it with `vibe-theme/install.sh halloween`, then switch to it with `tv set-theme demo-halloween`. `vibe-theme/RECIPE.md` explains how to make your own.

## 4. Run the demo

1. Start a new Claude Code session in this folder, and give it `skill/diff-and-demo/SKILL.md` as its instructions. The skill tells the agent how to play its part: placing words on the fridge, speaking through the face, tuning the colours and switching the theme. Replace the channel ID in the skill with your own.
2. Follow `script.md`. It is the outline I spoke from, section by section.

The map and timeline views of `parks.csv` in the talk come from a separate Television prototype that is not in this repository.

## Checks

Each folder has its own tests, for example:

```sh
(cd fridge-poetry && python3 -m unittest -v test_poetry.py)
(cd room-line && python3 -m unittest -v test_room_line.py)
```
