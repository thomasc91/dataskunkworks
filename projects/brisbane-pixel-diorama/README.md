# Brisbane pixel diorama

A 3D pixel-art model of everything within 5 km of West End, Brisbane: the CBD, Eagle Street, the river and the inner suburbs. Drag to orbit, scroll to zoom, hover or click a building for its height and floors, and hover a ferry or a plane to see what it is. The ground follows the real terrain, the river bridges are hand-built models, and the CityCats, ferries and planes are live. Buildings and hills are drawn 1.6× taller, and the cars and buses are simulated. A sun slider moves the shadows from 6am to 5:15pm, and the photo view frames Eagle Street.

Built with Claude on 13 October 2026; the terrain, bridges and live ferries and planes were added on 19 October.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The page: header, toolbar, building card and labels |
| `city.js` | The renderer, with three.js r170 bundled in |
| `westend.json` | The model data (11.4 MB): buildings, water, parks, trees, roads, tunnels, bridges, ferries, labels and traffic routes |
| `terrain.js`, `terrain.json`, `terrain.bin` | The ground: a 10 m height grid (3 MB) and where everything sits on it |
| `bridges.js`, `bridges.json` | Hand-built models of 14 river bridges, and which of the map's bridges each one replaces |
| `ferry-terminals.js`, `terminals.json` | The 17 ferry terminals on their real outlines, and the hover cards |
| `live-config.js`, `live-ferries.js`, `live-planes.js` | The live ferries and planes |
| `airport.html`, `airport.json` | A second map: everything within 4.5 km of Brisbane Airport (1.8 MB) |
| `airport.js`, `airport-features.json` | The airfield: runways with their markings, taxiways and aprons |

The original build scripts that made `westend.json` weren't kept.

## Live ferries and planes

Neither feed lets a web page read it directly, so the page reads both through a small relay on Cloudflare (its address is in `live-config.js`). The relay fetches each feed at most every 10 to 15 seconds and shares it with everyone who has the map open.

- **Ferries:** the GPS position of every CityCat, CityHopper and cross-river ferry, from TransLink's open feed. Each boat is drawn about a minute behind real time, gliding between fixes along the river.
- **Planes:** every aircraft within about 9 km of West End, from adsb.lol's open ADS-B data, drawn about 16 seconds behind real time on their real tracks, banking into turns. adsb.lol allows about 500 requests a day, roughly two hours of viewing; after that the map flies simulated planes until the limit resets. Up to 300 m they're at true scale; higher ones are eased down so they still fly over the map, and their shadows mark where they really are.
- **Where each flight is going:** the relay looks each callsign up in [adsbdb.com](https://www.adsbdb.com/)'s route database, and the hover card shows the route when the plane is near its path. Helicopters and private aircraft show their registered owner.
- If the relay doesn't answer, the map falls back to simulated CityCats and planes. `?ferries=off` and `?planes=off` force the simulation.

## Brisbane Airport

The Airport button opens a second map, everything within 4.5 km of Brisbane Airport's runways, built the same way. Its runways carry their real markings, and the live planes include those on the ground: taxiing, lined up on the runway and parked at the gates. The airfield comes from OpenStreetMap; the ground is flat, as the airport is.

## Running it

Serve the folder over HTTP (the page fetches its data files, so opening the file directly won't work):

```bash
python -m http.server 8000
```

Then open http://localhost:8000/. The fonts come from Google Fonts; offline, it falls back to system fonts.

## Data

- Buildings, streets, parks, bridge outlines and ferry terminals © OpenStreetMap contributors (ODbL) and the Overture Maps Foundation.
- Elevation: Queensland DEM (QldDem), CC BY-SA. Includes material © State of Queensland (Department of Natural Resources and Mines, Manufacturing, and Regional and Rural Development); © Commonwealth of Australia (Geoscience Australia, The Australian Hydrographic Office); © www.deepreef.org 2025. The height grid in `terrain.bin` is shared under the same licence.
- Ferry positions: TransLink SEQ GTFS-RT, CC BY 4.0.
- Aircraft positions: [adsb.lol](https://adsb.lol/) open data. Flight routes and aircraft owners: [adsbdb.com](https://www.adsbdb.com/).
- The airport map and airfield: © OpenStreetMap contributors (ODbL) and the Overture Maps Foundation.
