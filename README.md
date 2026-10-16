# Bait and Switch

*Formerly Click Rate.*

A Chrome extension that replaces YouTube's clickbait thumbnails with real frames from inside the video.

No AI, no accounts and no outside servers. It only loads images YouTube already hosts.

## How it works

YouTube automatically saves three still frames from every video, at about 25%, 50% and 75% of the way through. Bait and Switch swaps each thumbnail for one of those frames, using the sharpest version available (up to 1280×720).

In **Auto** mode it picks the best of the three with simple pixel maths:

- **Brightness:** rejects black screens and white flashes
- **Contrast:** flat slides and plain backgrounds score low
- **Detail:** edges from faces, objects and scenery score high
- **Colour:** real scenes are usually more colourful than text cards

The highest score wins, and the middle frame wins ties. Each video takes a few milliseconds, and the work happens on your own computer.

## Settings

Click the Bait and Switch icon in the Chrome toolbar to choose a mode for every video:

- Auto (best of 3)
- Frame 1, 2 or 3
- Original thumbnail (turns it off)

To change a single video, hover its thumbnail and click the **⟳** button in the top-left corner. Each click moves it to the next option: Auto → 1 → 2 → 3 → Original. These per-video picks aren't saved, so a page reload puts every video back on the global setting.

## Install

1. Download this repo: **Code → Download ZIP**, then unzip it. Or run `git clone`.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the `click-rate` folder.
5. Pin it from the puzzle-piece menu so the icon stays visible.

After you change the code, click the reload arrow on the extension's card in `chrome://extensions`.

## Files

| File | What it does |
| --- | --- |
| `manifest.json` | Tells Chrome what the extension is and what it may access (YouTube pages and `i.ytimg.com` images only) |
| `content.js` / `content.css` | Runs on YouTube: finds thumbnails, swaps them, adds the hover button |
| `background.js` / `frames.js` | Scores the three frames and finds the sharpest size |
| `popup.html` / `popup.js` / `popup.css` | The settings menu |
| `tests/score.test.js` | Checks the scorer: `node tests/score.test.js` |

## Limits

- Videos without auto-frames, such as some brand-new uploads and live streams, keep their original thumbnail.
- Auto judges whether a frame *looks* clear and detailed, not whether it's *meaningful*. Use the ⟳ button when it picks a dull one.
