# Infrastructure Preset Catalog — V2

Authoring-only recipes expand into editable CityMapData. `groupId` and `presetSource` retain provenance; no locked preset object or runtime generator is required. Machine contract: [presets/catalog.json](presets/catalog.json), also returned by `pnpm map list-presets` with road styles.

Coordinates always use `{x,y,z}`: Y is elevation. Shared `transformPoint3` rotates X/Z about Y, preserves local height and then adds position XYZ. All road nodes, junctions and props use it; endpoint ports resolve through their transformed roads. Do not invent alternate coordinate helper orders. `placePreset` allocates unique group/element/link/port IDs, remaps references, validates temporary output and candidate, then merges atomically. Returned elements are the live editable map objects.

Run `pnpm map validate-presets`: all 10 recipes have two parameter sets at 0/90/180/270° (80 cases), checking transforms, unique IDs, legal heights, nondegenerate roads, coincident links and valid port/junction references. Invalid output aborts placement without changing the map. If a recipe fails, ordinary content agents stop/report its parameters and errors; do not alter preset implementation or remove generated roads to pass validation.

## Parameters

| Parameter | Default | Supported values / units |
| --- | --- | --- |
| position | (0,0,0) | X/Y/Z metres, translates the whole stamp |
| rotation | 0 | Radians about +Y in API/JSON; CLI --rotation degrees |
| mainRoadLanes | 6 | 4 or 6 total lanes; highway directions are separate halves |
| crossRoadLanes | 4 | 4 or 6 total lanes |
| mainElevation | 6 | 5–12m above position.y |
| rampLaneCount | 1 | 1 or 2, one-way |
| rampRadius | 55 | 40–100m; controls loop/ring geometry |
| groupId | preset ID | Optional stable group base name; placement allocates a unique suffix when repeated |

Only the parameters listed for each catalog entry affect that recipe. Smaller loop radius and higher elevation can produce slope warnings; validation rejects grades over 25%. Roads remain individually editable after placement. Footprints below describe default road envelope, not a precise engineering right-of-way; add clearance for barriers/props. For changed parameters, inspect the expanded centerlines/bounds.

## Recipes

| ID / category | Default footprint X×Z | Function / parameters | External ports |
| --- | --- | --- | --- |
| urban_overpass / ROAD | 420×520m | Elevated N/S urban road with two ground-end ramps, crossing E/W street without connection; position, rotation, main/cross lanes, mainElevation | North/South Mainline; East/West Crossroad |
| diamond_interchange / INTERCHANGE | 620×620m | Divided elevated N/S mainline, four directional ramps, ground crossroad with two signal crosses; all parameters | North/South Mainline In/Out; East/West Crossroad |
| cloverleaf_interchange / INTERCHANGE | 800×800m | Two divided roads, four right ramps and four 270° left loops; all parameters, 4×4 / 6×4 / 6×6 variants | North/South Mainline In/Out; East/West Crossroad In/Out |
| trumpet_interchange / INTERCHANGE | 800×800m | N/S divided mainline, eastern terminating branch; two loops and two direct connectors provide every branch/mainline movement; all parameters | North/South Mainline In/Out; East Branch In/Out |
| roundabout / INTERCHANGE | 320×320m | One-way counterclockwise ring, four split entry/exit approaches; position, rotation, rampLaneCount, rampRadius | North/East/South/West In/Out |
| highway_entry / INTERCHANGE | 220×500m | Local one-way ramp ascends to one direction of a continuing mainline; position, rotation, mainRoadLanes, mainElevation, rampLaneCount | Mainline In/Out; Local Entry |
| highway_exit / INTERCHANGE | 220×500m | One-way ramp leaves continuing mainline and descends to local height; same parameters as Entry | Mainline In/Out; Local Exit |
| residential_block / DISTRICT | 140×110m | Low/mid-rise houses, trees, lamps, parking; position, rotation | None |
| commercial_block / DISTRICT | 170×130m | Office, commercial building, two parking areas, bus stop, trees/lamps; position, rotation | None |
| industrial_block / DISTRICT | 180×130m | Factories, garage, parking, guardrail, trees/lamps; position, rotation | None |

Diamond span grows with height; clover/trumpet default mainline extent is ±400m and grows with radius. Overpass span grows with height. Footprints rotate with the stamp. Highway Entry/Exit model one carriageway; mainRoadLanes/2 becomes its forward lane count. They do not automatically split an existing highway: use exposed ports and explicit road links.

All projected grade-separated crossings remain disconnected. Generated continuation/merge nodes use explicit roadLinks. Diamond signals reuse Subject3TrafficSignals. Ring approach direction is encoded in centerline order. No preset provides AI, priority behavior, navigation or complex lane-level merging.

## Placement and continuation

In Editor select **Preset / Stamp**, choose category/recipe, set parameters, rotate with R (15° steps), and click in Top view. The translucent line ghost previews road edges and prop footprints. Pick an **Anchor port** to place that port onto an existing endpoint/free junction port, including its elevation. After placement, cyan endpoint markers can accept new snapped roads. Use Inspector to edit any generated road/junction/prop independently; Undo removes the whole stamp.

CLI examples:

```text
pnpm map place-preset city-alpha cloverleaf_interchange --x 1200 --z -500 --rotation 90 --main-lanes 6 --cross-lanes 4 --height 6 --radius 55 --group interchange-07 --out .tmp-cloverleaf.json
pnpm map place-preset .tmp-cloverleaf.json residential_block --x 750 --z -300 --rotation 15 --group housing-02
pnpm map validate .tmp-cloverleaf.json
```

Use `pnpm map summary <map>` to read exact generated endpoint IDs. Connect with `pnpm map connect-road <map> --request '@connection.json'`, where the request contains `{from:{roadId,end},target:{endpoint:{roadId,end}}}`. API `placePreset(map,id,parameters)` returns the stamp and its ports, making subsequent `connectRoad` calls straightforward. Extend bounds before driving new regions; CLI reports bounds warnings.

## Road styles

| Style | Total lanes | Width/lane | km/h | Sidewalk | Barrier | Lamps | Default height |
| --- | --- | --- | --- | --- | --- | --- | --- |
| urban_local_2 | 2 | 3.5m | 30 | 2m | off | on | 0 |
| urban_street_4 | 4 | 3.5m | 40 | 2.5m | off | on | 0 |
| urban_boulevard_6 | 6 | 3.5m | 60 | 3m | off | on | 0 |
| urban_expressway_6 | 6 | 3.6m | 80 | off | on | on | 0 |
| highway_6 | 6 | 3.6m | 100 | off | on | off | 0 |
| elevated_expressway_6 | 6 | 3.6m | 80 | off | on | on | 6m |
| ramp_1 | 1 forward | 3.6m | 40 | off | on | off | 0 |

Styles enable markings; urban sidewalks also enable curbs. Defaults can be overridden by ordinary road fields and Inspector. Default piers: round, 30m spacing. Styles apply once during authoring and do not override saved custom heights/properties at runtime.
