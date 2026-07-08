# 🗺️ HistoryMap

**An interactive world history atlas.** Drag a time slider from 9500 BC to 2010 and watch empires rise and fall on a real map — click any region for a curated report on who ruled it, why, and what came next.

![HistoryMap Screenshot](docs/screenshot.png)

## About

HistoryMap combines historical border data with hand-written history content into a single browser page: no backend, no build step, no account. Move the slider and the map redraws with the political borders of that year; click a territory and a report opens with its rulers, wars, and the ideas that shaped the age; a running chronicle in the sidebar lists dated events for whatever period you're looking at; and map markers point out specific battles, inventions, and turning points right where they happened.

It's meant for self-directed learning — the kind of "wait, what was happening in France while this was going on in China?" curiosity that a static textbook timeline can't satisfy.

Content is currently written in **German**.

## Features

- **48 map snapshots** of historical borders (3000 BC – 2010 AD), denser around major turning points (1492, 1600, 1650, 1715, 1783, 1815, 1914, 1938, 1945 …)
- **Time slider** with keyboard control (`←` / `→`) and an **auto-play** mode
- **21 era reports**: who held dominance and why they lost it, the dominant schools of thought, the major conflicts of the age, plus the era's defining architecture, art and thinkers
- **~70 region reports**: click an empire for its rulers, wars, factions, rise and fall
- **220+ map markers** for specific events — battles, inventions, architecture, religious turning points, upheavals — each with a short explanation, spanning prehistory to 2022
- **475+ chronicle entries**, filtered live to whatever era is on screen
- **370+ automatically linked terms**: rulers, architects, artists, philosophers, wars, and architectural styles mentioned anywhere in era or region reports link straight to Wikipedia inline, no extra clicking
- **Wikipedia integration**: clicking a region also pulls a live summary (with image) from Wikipedia
- **Fully static and largely offline**: all border data ships in the repo; only the Wikipedia summaries need a connection

## Quick start

Requires [Node.js](https://nodejs.org) (just to run a local static server).

```bash
git clone https://github.com/SchwarzRene/HistoryMap.git
cd HistoryMap
npx -y http-server -p 8173 -c-1 .
```

Then open **http://localhost:8173**.

**Windows:** double-click **`Start-HistoryMap.bat`** instead — it starts the server and opens the browser for you. Close the console window to stop it.

> **Why a server at all?** The map fetches GeoJSON border files at runtime, which browsers block from `file://` pages for security reasons. Any static file server works — `python -m http.server 8173` is a fine substitute.

## Controls

| Control | Action |
|---|---|
| **Slider** (bottom) | Jump to a year (or use `←` / `→`) |
| **▶︎▶︎** | Auto-play: one step every 2 seconds |
| **📍** | Toggle event markers on/off |
| **Left panel** | Era overview: dominance, schools of thought, conflicts, chronicle |
| **Click a region** | Opens a report + live Wikipedia summary (right panel) |
| **Click a marker** | Opens an event popup with a Wikipedia link |

## Project structure

```
HistoryMap/
├── index.html              # Entry point
├── css/style.css           # All styling (dark theme)
├── js/
│   ├── app.js               # Map rendering, slider, sidebar, Wikipedia fetch
│   ├── eras.js               # 21 era reports
│   ├── reports.js            # Region reports + name translations
│   ├── events.js             # Map markers (coordinates, text, links)
│   ├── chronicle.js          # Dated chronicle entries
│   └── wikilinks.js          # Term → Wikipedia-title dictionary + auto-linker
├── data/                    # 48× world_<year>.geojson (historical borders)
└── Start-HistoryMap.bat     # One-click start for Windows
```

No build tools, no framework — just HTML/CSS/JS, with [Leaflet](https://leafletjs.com) loaded from a CDN.

## Extending it

All content lives in plain, readable JS data structures:

- **Add/edit an era** → [`js/eras.js`](js/eras.js)
- **Add a region report** → [`js/reports.js`](js/reports.js) (regex on the region name + a year range; more specific entries must come before general ones)
- **Add a map marker** → [`js/events.js`](js/events.js) (coordinates + visible year range)
- **Add a chronicle entry** → [`js/chronicle.js`](js/chronicle.js)
- **Add an inline Wikipedia link** → [`js/wikilinks.js`](js/wikilinks.js): add `"Exact Bold Text": "Wikipedia Article Title"` and every `<b>Exact Bold Text</b>` anywhere in eras or reports links automatically
- **Add a map year** → drop the matching GeoJSON from [historical-basemaps](https://github.com/aourednik/historical-basemaps) into `data/` and add the year to `YEARS` in `js/app.js`

Pull requests for new reports, markers, or corrections are welcome.

## A note on accuracy

Historical borders are scholarly **approximations**, often actively disputed. Pre-modern "borders" were frequently zones of influence rather than lines, and dates/attributions are simplified for clarity. Treat this as a tool for learning the big picture, not as a source for exact boundary claims — every region and event links out to Wikipedia for deeper reading.

## License & credits

- **Border data:** [historical-basemaps](https://github.com/aourednik/historical-basemaps) by Andrei Ourednik — [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) (non-commercial use only)
- **Map library:** [Leaflet](https://leafletjs.com) — BSD-2-Clause
- **Article summaries:** [Wikipedia](https://de.wikipedia.org) — CC BY-SA
- **Curated content** (`eras.js`, `reports.js`, `events.js`, `chronicle.js`, `wikilinks.js`): CC BY-SA 4.0
