# London pixel diorama

A 3D pixel-art model of everything within 5 km of the South Bank, London: Westminster, the City, the Thames and its bridges, and the inner boroughs. Drag to orbit, scroll to zoom, hover or click a building for its height and floors. Building heights are drawn 1.6× taller; the cars, buses, Thames ferries and planes are simulated. A sun slider moves the shadows from 8:15am to 5:15pm on 18 October, and the skyline view frames the City's towers.

Thirteen landmarks are hand-built models on their real footprints: Elizabeth Tower (Big Ben), Victoria Tower, the London Eye, Westminster Abbey's west towers, St Paul's Cathedral's dome and west towers, the Shard, Tower Bridge, the White Tower, 30 St Mary Axe (the Gherkin), 20 Fenchurch Street (the Walkie-Talkie), the Leadenhall Building (the Cheesegrater), the BT Tower and Battersea Power Station.

Built with Claude on 18 October 2026 from the city diorama kit, which builds the same model for any place from open map data.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The page: header, toolbar, building card and labels |
| `diorama.js` | The renderer |
| `landmarks.js` | The hand-built landmark models |
| `three-r170.js` | three.js r170 (MIT) with the addons the renderer uses |
| `cities/south-bank-london.json` | The model data (20 MB): buildings, water, parks, trees, roads, tunnels, bridges, ferries, landmarks, labels and traffic routes |

## Running it

Serve the folder over HTTP (the page fetches its data, so opening the file directly won't work):

```bash
python -m http.server 8000
```

Then open http://localhost:8000/. Add `?view=skyline` to open on the City's towers.

## Data

Buildings, streets and parks © OpenStreetMap contributors (ODbL) and the Overture Maps Foundation. The model data is a derivative of OpenStreetMap and shared under the ODbL.
