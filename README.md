# Data Skunkworks

Interactive data visualisations by Thomas Colin. Each piece has its own page with a short writeup, the live piece and a link to its code.

## Layout

| Path | What it is |
| --- | --- |
| `projects/<slug>/` | The pieces themselves. Each folder is self-contained and runs on its own. |
| `<slug>/index.html` | The page for each piece: writeup, live embed, link to the code. Built by `build.py`. |
| `index.html`, `404.html` | The home page and the not-found page. Built by `build.py`. |
| `site.json` | The single source of truth: site copy, plus one entry per piece (titles, writeups, facts, thumbnail settings). |
| `thumbs/` | Card thumbnails, 1280×800 JPEGs made by `tools/capture.mjs`. |
| `assets/` | The site's stylesheet and the script that loads a piece into its page. |

## Adding a piece

1. Put the piece in `projects/<slug>/`. Every path inside it must be relative and stay inside the folder.
2. Add an entry to `pieces` in `site.json`. `build.py` checks the required fields and that the entry file exists.
3. Run `python build.py`.
4. Serve the folder (`python -m http.server 8150`) and run `node tools/capture.mjs http://localhost:8150/ <slug>` for its thumbnail. It needs Microsoft Edge and Node 22.

Copy rules for writeups: short and factual, Australian spelling, and no em dashes (`build.py` refuses them).

## Hosting

GitHub Pages serves the `main` branch from the root. Every link is relative, so the site works at https://thomasc91.github.io/dataskunkworks/ and at a custom domain. When the domain moves, set it in the repo's Pages settings and change `base_url` in `site.json` (used for share previews and the 404 page), then rebuild.

## Data and credits

Each piece's page names its data. The Brisbane pixel diorama uses © OpenStreetMap contributors (ODbL) and the Overture Maps Foundation. The Dying of the Dragons follows A Wiki of Ice and Fire (CC BY-SA 3.0) and is a non-commercial fan work.
