# Brisbane pixel diorama

A 3D pixel-art model of everything within 5 km of West End, Brisbane: the CBD, Eagle Street, the river and the inner suburbs. Drag to orbit, scroll to zoom, hover or click a building for its height and floors, and hover a ferry, train, bus, ship or plane to see what it is. The ground follows the real terrain, the river bridges are hand-built models, and the CityCats, ferries, trains, buses, Metro and planes are live. The cars are simulated at live traffic levels and the cyclists from the council's bike counts. In daylight the sun and the weather follow the real time in Brisbane. Buildings and hills are drawn 1.6× taller, and the photo view frames Eagle Street.

Built with Claude on 13 October 2026; the terrain, bridges, railway, live ferries, trains, buses and planes, traffic levels, cyclists, ships and the real sun and weather were added on 19 October.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The page: header, toolbar, building card and labels |
| `city.js` | The renderer, with three.js r170 bundled in |
| `westend.json` | The model data (11.4 MB): buildings, water, parks, trees, roads, tunnels, bridges, ferries, labels and traffic routes |
| `terrain.js`, `terrain.json`, `terrain.bin` | The ground: a 10 m height grid (3 MB) and where everything sits on it |
| `bridges.js`, `bridges.json` | Hand-built models of 14 river bridges, and which of the map's bridges each one replaces |
| `ferry-terminals.js`, `terminals.json` | The 17 ferry terminals on their real outlines, and the hover cards |
| `live-config.js`, `live-ferries.js`, `live-trains.js`, `live-planes.js` | The live ferries, trains and planes, and which relay they read |
| `rail.json` | The railway: 115 km of track and the station platforms, and TransLink's stop ids for naming each train's next stop |
| `live-graph.js` | Following the tracks and roads between GPS fixes, for the trains and buses |
| `live-buses.js`, `buses.json` | The live buses and Metro, and the 382 km of roads and busways they follow |
| `live-traffic.js`, `traffic.json` | The cars at live traffic levels, and where the council's 496 traffic signals in the map are |
| `live-cyclists.js`, `cycling.json` | The cyclists, 190 km of bikeways and the council's bike counts |
| `live-sky.js` | The real sun and the weather |
| `live-ships.js` | The live ships |
| `roll.js`, `props.json` | Roll mode, and the 9,484 bits of street furniture it starts on |
| `airport.html`, `airport.json` | A second map: everything within 4.5 km of Brisbane Airport (1.8 MB) |
| `airport.js`, `airport-features.json` | The airfield: runways with their markings, taxiways and aprons |

The original build scripts that made `westend.json` weren't kept.

## Live ferries, trains and planes

None of the feeds lets a web page read it directly, so the page reads them through a small relay on Cloudflare (its address is in `live-config.js`). The relay fetches each feed at most every 10 to 15 seconds and shares it with everyone who has the map open.

- **Ferries:** the GPS position of every CityCat, CityHopper and cross-river ferry, from TransLink's open feed. Each boat is drawn about a minute behind real time, gliding between fixes along the river.
- **Trains:** every Queensland Rail train on the map, from TransLink's open feed, which reports each train's GPS position about every 20 seconds. Each train is drawn 45 seconds behind real time and follows the track between fixes, taking the right line through junctions, over the bridges and into the tunnels. The model had no railway, so the tracks and platforms come from OpenStreetMap. Hover a train for where it's going, where it came from and its next stop.
- **Planes:** every aircraft within about 9 km of West End, from adsb.lol's open ADS-B data, drawn about 16 seconds behind real time on their real tracks, banking into turns. adsb.lol allows about 500 requests a day, roughly two hours of viewing; after that the map flies simulated planes until the limit resets. Up to 300 m they're at true scale; higher ones are eased down so they still fly over the map, and their shadows mark where they really are.
- **Where each flight is going:** the relay looks each callsign up in [adsbdb.com](https://www.adsbdb.com/)'s route database, and the hover card shows the route when the plane is near its path. Helicopters and private aircraft show their registered owner.
- **Buses and Metro:** every bus and Brisbane Metro vehicle on the map, from TransLink's bus feed, drawn 50 seconds behind real time and following the roads and busways between fixes, keeping to one-way streets. The Metro's three sections bend round corners. Hover one for its route, the route's two ends and its next stop.
- **Ships:** every vessel sending AIS round Brisbane, from aisstream.io, sized and coloured by its type. They appear once the relay has an aisstream.io key.
- If the relay doesn't answer, the map falls back to simulated CityCats and planes and leaves the trains out. `?ferries=off` and `?planes=off` force the simulation, and `?trains=off` hides the trains.

## Traffic, cyclists and the sun

- **Traffic levels:** the cars are simulated, but how many are on the roads near each signal follows Brisbane City Council's live traffic signal data, read straight from its open data portal every five minutes. At 9:25pm on a Monday about 1,600 of the 7,000 cars are out.
- **Cyclists:** riders on 190 km of bikeways, as many as the council's 12 bike counters in the map count on that day of the week (October and November 2025, the latest published), spread over the day with commuting peaks, at about 20 km/h. About 350 ride at 7:30am on a weekday. Half stay home in the rain.
- **The sun and weather:** the Now button keeps the slider at the time in Brisbane, with the sun where it really is today. The weather is Open-Meteo's for Brisbane now: cloud dims the light, rain falls, and the toolbar shows the temperature and sky. After dark the map shows the afternoon.

## Roll mode

The Roll button turns the map into a Katamari Damacy-style game. You push a sticky ball round Brisbane, starting on Boundary Street in West End, and anything smaller than it sticks to it: people and street furniture first, then cars and trees, houses, apartment blocks, the CBD towers and finally the Brisbane Skytower. Bigger things bounce it back, and the river stops it until it's 80 m across. Use the arrow keys or WASD, or drag on a touch screen. Everything it rolls up stays gone until the page reloads.

## Brisbane Airport

The Airport button opens a second map, everything within 4.5 km of Brisbane Airport's runways, built the same way. Its runways carry their real markings, and the live planes include those on the ground: taxiing, lined up on the runway and parked at the gates. The airfield comes from OpenStreetMap; the ground is flat, as the airport is.

## Running it

Serve the folder over HTTP (the page fetches its data files, so opening the file directly won't work):

```bash
python -m http.server 8000
```

Then open http://localhost:8000/. The fonts come from Google Fonts; offline, it falls back to system fonts.

## Data

- Buildings, streets, parks, the railway, bus routes, bikeways, bridge outlines and ferry terminals © OpenStreetMap contributors (ODbL) and the Overture Maps Foundation.
- Elevation: Queensland DEM (QldDem), CC BY-SA. Includes material © State of Queensland (Department of Natural Resources and Mines, Manufacturing, and Regional and Rural Development); © Commonwealth of Australia (Geoscience Australia, The Australian Hydrographic Office); © www.deepreef.org 2025. The height grid in `terrain.bin` is shared under the same licence.
- Ferry, train and bus positions: TransLink SEQ GTFS-RT, CC BY 4.0.
- Bus stop names, traffic signal data and bike counts: Brisbane City Council open data, CC BY 4.0.
- Weather: [Open-Meteo](https://open-meteo.com/), CC BY 4.0. Ships: AIS from [aisstream.io](https://aisstream.io/).
- Aircraft positions: [adsb.lol](https://adsb.lol/) open data. Flight routes and aircraft owners: [adsbdb.com](https://www.adsbdb.com/).
- The airport map and airfield: © OpenStreetMap contributors (ODbL) and the Overture Maps Foundation.
