# Brisbane pixel diorama

A 3D pixel-art model of everything within 5 km of West End, Brisbane: the CBD, Eagle Street, the river and the inner suburbs. Drag to orbit, scroll to zoom, hover or click a building for its height and floors, and hover a ferry, train, bus, ship or plane to see what it is. The ground follows the real terrain, the river bridges and landmarks such as the Wheel of Brisbane, the Brisbane sign and the Gabba are hand-built models, and the CityCats, ferries, trains, buses, Metro and planes are live. The cars are simulated at live traffic levels and the cyclists from the council's bike counts. In daylight the sun and the weather follow the real time in Brisbane. Buildings and hills are drawn 1.6× taller, and the photo view frames Eagle Street.

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
| `landmarks.js`, `landmarks.json` | Hand-built landmarks, and where each one goes |
| `ride.js` | The ride replay, from a GPX file |
| `towers.js` | Brisbane's 21 tallest towers reshaped from photos, and the new ones the map lacked |
| `live-config.js`, `live-ferries.js`, `live-trains.js`, `live-planes.js` | The live ferries, trains and planes, and which relay they read |
| `rail.json` | The railway: 115 km of track and the station platforms, and TransLink's stop ids for naming each train's next stop |
| `live-graph.js` | Following the tracks and roads between GPS fixes, for the trains and buses |
| `live-buses.js`, `buses.json` | The live buses and Metro, and the 382 km of roads and busways they follow |
| `live-traffic.js`, `traffic.json` | The cars at live traffic levels, and where the council's 496 traffic signals in the map are |
| `live-cyclists.js`, `cycling.json` | The cyclists, 190 km of bikeways and the council's bike counts |
| `live-sky.js` | The real sun and the weather |
| `live-ships.js` | The live ships |
| `roll.js`, `props.json`, `streets.json` | Roll mode, the 9,484 bits of street furniture it starts on, and the street names under its minimap |
| `roll-game.js`, `roll-sound.js` | Roll mode's levels, collection, combos, bonuses and best times, and its sounds |

The original build scripts that made `westend.json` weren't kept.

## Live ferries, trains and planes

None of the feeds lets a web page read it directly, so the page reads them through a small relay on Cloudflare (its address is in `live-config.js`). The relay fetches each feed at most every 10 to 15 seconds and shares it with everyone who has the map open.

- **Ferries:** the GPS position of every CityCat, CityHopper and cross-river ferry, from TransLink's open feed. Each boat is drawn about a minute behind real time, gliding between fixes along the river.
- **Trains:** every Queensland Rail train on the map, from TransLink's open feed, which reports each train's GPS position about every 20 seconds. Each train is drawn 45 seconds behind real time and follows the track between fixes, taking the right line through junctions, over the bridges and into the tunnels. The model had no railway, so the tracks and platforms come from OpenStreetMap. Hover a train for where it's going, where it came from and its next stop.
- **Planes:** every aircraft within about 9 km of West End, from adsb.lol's open ADS-B data (adsb.fi's when adsb.lol doesn't answer), drawn about 16 seconds behind real time on their real tracks, banking into turns. adsb.lol allows about 500 requests a day, roughly two hours of viewing; after that the map flies simulated planes until the limit resets. Up to 300 m they're at true scale; higher ones are eased down so they still fly over the map, and their shadows mark where they really are.
- **Where each flight is going:** the relay looks each callsign up in [adsbdb.com](https://www.adsbdb.com/)'s route database, and the hover card shows the route when the plane is near its path. Helicopters and private aircraft show their registered owner.
- **Buses and Metro:** every bus and Brisbane Metro vehicle on the map, from TransLink's bus feed, drawn 50 seconds behind real time and following the roads and busways between fixes, keeping to one-way streets. The Metro's three sections bend round corners. Hover one for its route, the route's two ends and its next stop.
- **Ships:** every vessel sending AIS round Brisbane, from aisstream.io, sized and coloured by its type. They appear once the relay has an aisstream.io key.
- If the relay doesn't answer, the map falls back to simulated CityCats and planes and leaves the trains out. `?ferries=off` and `?planes=off` force the simulation, and `?trains=off` hides the trains.

## Traffic, cyclists and the sun

- **Traffic levels:** the cars are simulated, but how many are on the roads near each signal follows Brisbane City Council's live traffic signal data, read straight from its open data portal every five minutes. At 9:25pm on a Monday about 1,600 of the 7,000 cars are out.
- **Cyclists:** riders on 190 km of bikeways, as many as the council's 12 bike counters in the map count on that day of the week (October and November 2025, the latest published), spread over the day with commuting peaks, at about 20 km/h. About 350 ride at 7:30am on a weekday. Half stay home in the rain.
- **The sun and weather:** the Now button keeps the slider at the time in Brisbane, with the sun where it really is today. The weather is Open-Meteo's for Brisbane now: cloud dims the light, rain falls, and the toolbar shows the temperature and sky. After dark the map shows the afternoon.

## Ride replay

The Ride button replays a bike ride on the map from a GPX file (Strava exports one from a ride's menu): the route drawn as it's ridden, the rider, the camera following, and the speed, height, heart rate and time of day. The file is read in your browser and isn't uploaded anywhere.

## Towers

The tallest towers are reshaped from photos and published heights: setbacks, tapers, sloping tops, crowns, masts and spires, each with the glass it really has. The map also had none of the towers finished since 2019, so Queen's Wharf with its Sky Deck, 443 Queen Street and 205 North Quay are added. Heights are above the ground, so the Skytower is 269.6 m rather than the 274.3 m often quoted, which is above sea level.

## Landmarks

Besides the 14 river bridges, some landmarks are hand-built on their real places: the Wheel of Brisbane, whose rim turns while the traffic runs; the Brisbane sign at the Cultural Forecourt; the Nepalese Peace Pagoda; the Shrine of Remembrance and its eternal flame; the XXXX sign on the brewery at Milton; the Grand Arbour's bougainvillea; Streets Beach; and the Gabba and Suncorp Stadium as open bowls with their pitches, in place of the solid blocks the map had. Roll mode can roll them all up.

## Roll mode

The Roll button turns the map into a Katamari Damacy-style game. You push a sticky ball round Brisbane, starting on Boundary Street in West End, and anything smaller than it sticks to it: people, street furniture, ibis, cane toads, magpies and kangaroos first, then cars and trees, houses, CityCats, apartment blocks, the CBD towers and finally the Brisbane Skytower. Bigger things bounce it back, magpies swoop it while it's small, kangaroos bolt, and the river stops it until it's 80 m across. Use the arrow keys or WASD, or drag on a touch screen; scroll or pinch to zoom and right-drag to look round. A minimap shows the streets round the ball and the street it's on. Everything it rolls up stays gone until the page reloads.

There are five levels: rolling up the whole city to the Skytower, a South Bank sprint, a kangaroo round-up at Toowong Cemetery, rush hour in the CBD, and a race over the river. Finished levels go on a best-times board anyone can post to with three initials. A collection book keeps every kind of thing you've rolled up, five of a kind in a row earn a combo, a real bus nearby can become the wanted bus for a bonus, rain makes the roads slippery, crashes knock things loose, and it all has sound.

## Running it

Serve the folder over HTTP (the page fetches its data files, so opening the file directly won't work):

```bash
python -m http.server 8000
```

Then open http://localhost:8000/. The fonts come from Google Fonts; offline, it falls back to system fonts.

## Data

On the map these credits sit behind the Data sources button in the title card, and the Data button in roll mode.

- Buildings, streets, parks, the railway, bus routes, bikeways, bridge outlines, ferry terminals and the landmarks' places © OpenStreetMap contributors (ODbL) and the Overture Maps Foundation.
- Elevation: Queensland DEM (QldDem), CC BY-SA. Includes material © State of Queensland (Department of Natural Resources and Mines, Manufacturing, and Regional and Rural Development); © Commonwealth of Australia (Geoscience Australia, The Australian Hydrographic Office); © www.deepreef.org 2025. The height grid in `terrain.bin` is shared under the same licence.
- Ferry, train and bus positions: TransLink SEQ GTFS-RT, CC BY 4.0.
- Bus stop names, traffic signal data and bike counts: Brisbane City Council open data, CC BY 4.0.
- Weather: [Open-Meteo](https://open-meteo.com/), CC BY 4.0. Ships: AIS from [aisstream.io](https://aisstream.io/).
- Aircraft positions: [adsb.lol](https://adsb.lol/) open data, and [adsb.fi](https://adsb.fi/) open data when adsb.lol doesn't answer. Flight routes and aircraft owners: [adsbdb.com](https://www.adsbdb.com/).
