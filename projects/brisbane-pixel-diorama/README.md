# Brisbane pixel diorama

A 3D pixel-art model of everything within 5 km of West End, Brisbane: the CBD, Eagle Street, the river and the inner suburbs. Drag to orbit, scroll to zoom, hover or click a building for its height and floors. Building heights are drawn 1.6× taller; the cars, buses, CityCats and planes are simulated. A sun slider moves the shadows from 6am to 5:15pm, and the photo view frames Eagle Street.

Built with Claude on 13 October 2026 and first published as a private Claude artifact: https://claude.ai/artifact/JMpMASH1Nm74WdwTmsUwY9

## Files

| File | What it is |
| --- | --- |
| `index.html` | The page: header, toolbar, building card and labels |
| `city.js` | The renderer, with three.js r170 bundled in |
| `westend.json` | The model data (11.4 MB): buildings, water, parks, trees, roads, tunnels, bridges, ferries, labels and traffic routes |

The original build scripts that made `westend.json` weren't kept.

## Running it

On Thomas's PC the local apps hub serves it at http://localhost:4000/apps/brisbane-pixel-diorama/.

Anywhere else, serve the folder over HTTP (the page fetches `westend.json`, so opening the file directly won't work):

```bash
python -m http.server 8000
```

Then open http://localhost:8000/. The fonts come from Google Fonts; offline, it falls back to system fonts.

## Data

Buildings, streets and parks © OpenStreetMap contributors (ODbL) and the Overture Maps Foundation.
