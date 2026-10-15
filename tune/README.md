# Colour study

This Television card pairs a full-screen animated colour field with eight small controls. Rupert can tune it by hand; an agent can tune the same controls through `./tune`. The five displayed hex colours are the exact palette sent to the shader. Click a swatch to copy its value, Save to keep a colourway, or Download for a screen-resolution PNG of the current frame.

## Register

The reviewer registers this folder on the intended channel:

```sh
tv create-path-artifact --channel <channel-id> --title "Colour study" --path /root/workspace/dev/tv-demos/tune --no-focus
```

Open the card once to initialize its JSON store. The page needs write access to change controls or save colourways.

## Shared store

```json
{
  "params": {"colour": 0.6, "spread": 0.48, "variety": 0.68, "speed": 0.34, "swirl": 0.52, "scale": 0.52, "glow": 0.54, "grain": 0.28},
  "palette": ["#063933", "#0e5b7e", "#175fcc", "#eb4973", "#af8ef2"],
  "saved": {"<key>": {"name": "Ocean dusk", "params": {"colour": 0.6, "spread": 0.48, "variety": 0.68, "speed": 0.34, "swirl": 0.52, "scale": 0.52, "glow": 0.54, "grain": 0.28}, "palette": ["#063933", "#0e5b7e", "#175fcc", "#eb4973", "#af8ef2"], "savedAt": 1792020000000}}
}
```

Every parameter is a number from 0 to 1. `variety=0` keeps the earlier close hues; increasing it moves an accent through neighbouring hues toward a complement. `colour` rotates the whole palette. `palette` holds five derived hex colours; the page and helper write it alongside changed parameters. Each saved entry contains a full parameter object, its matching five colours, a short name and a Unix millisecond timestamp. The page writes entries at `saved/<key>` and shows them as clickable chips.

When an existing card has the earlier seven-control store, the page adds `variety` and refreshes the palette on its next writable load.

## Agent commands

```sh
./tune get
./tune set colour=0.08 variety=0.75 swirl=0.72 glow=0.8
./tune preset storm
./tune reset
./tune palette
./tune saved
./theme
```

Available presets: `dusk`, `ocean`, `ember`, `calm`, `storm`. Ocean uses blues and teals with a coral accent; ember stays within warm neighbours; storm adds an electric contrast. `set` accepts any of the eight parameter names and clamps numeric values to 0–1. The helper finds the registered artifact by matching this folder path in `tv list-artifacts`; no artifact ID is stored in the card.

## Theme the Television app

Run `./theme` after tuning the card. It reads the current five-colour palette, writes `manifest.json` and `theme.css` to `/root/.television/themes/demo-colour-study/`, then selects that theme with `tv set-theme demo-colour-study`. The palette supplies the surfaces, accent, links and a softened five-stop wallpaper; text lightness is adjusted to meet at least 4.5:1 contrast on the surfaces. The package uses a fixed dark or light appearance according to the palette.

Before the first selection, the helper records the previous theme ID in `/root/workspace/dev/tv-demos/.previous-theme`. Later runs leave that file intact. To restore it, run `tv set-theme "$(cat /root/workspace/dev/tv-demos/.previous-theme)"`.

For a file-only preview, run `./theme --no-apply --out /tmp/demo-colour-study`. The helper still reads the card store through `tv`; it skips theme selection and does not create the previous-theme file.

## Checks

```sh
python3 -m unittest -v test_tune.py
python3 -m unittest -v test_theme.py
node --test palette.test.mjs
```

The Python suites run the executables with a stub `tv` command and check the store payload, theme mapping, contrast, CSS tokens, file output and activation call. A local headless Chromium check also loaded the page, moved a slider, saved a colourway, received an agent update and downloaded a PNG without page or console errors.
