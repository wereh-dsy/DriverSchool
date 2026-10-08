# Agent Map Authoring Contract — V2

## Scope

For map expansion, prefer CityMap JSON, Map API/CLI, Road Styles and Presets. Do not modify RoadBuilder, SectorManager, CityGround, vehicle physics or runtime architecture unless explicitly tasked with changing the map system. Follow root AGENTS.md. Do not scan the whole repository, hand-rebuild an existing recipe, add dependencies or modify old Subject 2/3 maps.

## Read/write locations

| Path | Role | Map expansion action |
| --- | --- | --- |
| `src/world/city/maps/*.json` | Authored CityMap data | Edit here |
| `src/world/city/presets/catalog.json` | Machine-readable recipes, parameters, footprint, ports | Read relevant recipe |
| `src/world/city/RoadStyles.ts` | Style IDs and defaults | Read; use through API/CLI |
| `src/world/city/MapAPI.ts` | Stable data mutations | Import/use |
| `src/world/city/CityMapData.ts` | Type contract | Read as needed |
| `src/world/city/CityMapValidation.ts` | Structured validation | Use; do not relax to hide errors |
| `src/world/city/{RoadBuilder,IntersectionBuilder,PrefabRegistry,SectorManager,CityGround}.ts` | Runtime generation | Leave unchanged for data tasks |
| `src/editor/` | GUI | GUI is optional for agents |

## Workflow

1. Read this guide and root AGENTS.md.
2. `pnpm map summary city-alpha` (or a JSON path).
3. Read only the relevant authored JSON / catalog entries.
4. Prefer Production Presets (`production:true` in the catalog), then Road Styles for simple continuations. Do not hand-build complex road topology; report a missing preset capability when production recipes cannot satisfy the map need.
5. Edit data or run the CLI; keep stable existing IDs and unrelated layout.
6. `pnpm map validate <map>`; fix all errors and review warnings.
7. `pnpm run build`; it must succeed and publish the updated playable dist.

## Contract

- Schema 2: `{schemaVersion:2,id,name,version,sectorSize,bounds,roads,intersections,objects,roadLinks,connectionPorts,environment}`. `newCityMap()` provides a minimal starting map with spawn.
- Coordinates are always `{x,y,z}` in SI metres: **y is elevation**, +Y up, −Z forward. Do not invent positional coordinate helpers. Use object literals or shared `point3(x,y,z)` from MapAPI/coordinates.ts, never `p(x,z,y)`. V1 missing Y remains 0. Rotations in radians; speedLimit in km/h. CLI `--rotation` alone uses degrees.
- Road: `{id,type,centerline:[{x,y,z}],laneCount,laneWidth,travelDirection,speedLimit,curve?,styleId?,sidewalk?,elevationMode?,elevation?,structure?}`. Missing Y=0. Ground=0; Elevated=uniform `elevation` (default 6m); Custom=node Y.
- Urban types fix total lanes 2/4/6. Highway permits 1–6. Ramp_1 permits 1. Two-way requires even lanes. Directed roads use forward/reverse relative to centerline order.
- Structures: `{pierSpacing:30,pierStyle:'round'|'rectangular',barrierEnabled,piersEnabled}`. Recommended grade ≤12%, hard maximum 25%; Y range −50..100m. Preset parameters use narrower ranges from catalog.
- Junction: `{id,type,position,rotation,signalized,connections:[{roadId,end,port}],signals?}`. Types `t_2lane,t_4lane,cross_4lane,cross_6lane`; T ports north/east/west in local space. One junction per endpoint; one endpoint per junction port. Junction ports own attached node positions.
- `roadLinks:[{id,from:{roadId,end:'start'|'end'},to:{roadId,end}}]` defines merges/continuations. Linked XYZ must coincide within 0.2m. Link clusters may branch. Projection/interior crossings do not connect; split roads explicitly if needed. Never connect an upper road to a lower road solely because their X/Z matches.
- `connectionPorts:[{id,label,endpoint:{roadId,end},groupId?,position?,heading?}]` exposes preset endpoints for continued authoring.
- Objects `{id,prefabId,position,rotation,scale?,color?,district?,groupId?,presetSource?}`. IDs are unique across element/link/port collections. Valid prefab IDs are in CityMapData.ts.
- Stamps produce ordinary editable elements with optional `groupId,presetSource`. Preserve these when locally editing. No runtime recipe object.
- Environment includes district array and at least one `{id,position:{x,y,z},rotation}` spawn. Set spawn Y to the desired layer. Expand ordered bounds to include new data. Increase map version for a material authored change.

## Road styles

`urban_local_2`, `urban_street_4`, `urban_boulevard_6`, `urban_expressway_6`, `highway_6`, `elevated_expressway_6`, `ramp_1`.

`createRoad` applies style defaults once, then overrides supplied properties. Runtime does not reapply the style. For ramps supply explicit node Y and `elevationMode:'custom'`. For a uniform deck supply Elevated mode and elevation. Copying data without styles is supported if all required road fields are present.

## API

Import from `src/world/city/MapAPI.ts`. Functions mutate the supplied map; `loadCityMap` and `saveMap` return validated normalized results.

| Function | Arguments / result |
| --- | --- |
| `newCityMap()` | Minimal schema-2 map |
| `createRoad(map,input)` | RoadInput with centerline and optional styleId/overrides → CityRoad |
| `splitRoadAtPoint(map,roadId,point,options?)` | On-road `{x,y,z}` cut → `{before,after,from,to}`; optional baseName/tolerance (default 0.05m). Remaps original END in links/junctions/ports and links the halves; rejects endpoint cuts |
| `connectRoads(map,from,to,options?)` | Strict `{roadId,end}` pair, already coincident in XYZ → roadLink; optional id/baseName. Rejects duplicate pairs, self-links, missing roads and junction-owned endpoints |
| `moveRoadNode(map,roadId,index,point)` | Node edit; detaches moved endpoint; explicit Y switches to Custom |
| `createIntersection(map,input)` | Junction input; id/connections optional → CityIntersection |
| `placePrefab(map,input)` | Object input; id optional → CityObject |
| `placePreset(map,presetId,parameters)` | Atomic validated stamp → ordinary elements, links, ports, groupId |
| `connectRoad(map,from,target)` | Target `{endpoint:{roadId,end}}` or `{junctionId,port}`; sets source node XYZ and explicit reference |
| `deleteObject(map,id)` | Removes road/junction/prop plus dependent connections/ports |
| `validateMap(unknown)` | `{valid,errorCount,warningCount,errors:[{severity,code,path,message}],warnings:[...]}` |
| `saveMap(map)` | Validated portable JSON string, no filesystem writes |

Creation validates inputs before insertion. Move/connect/split validate a temporary candidate before committing and preserve live element references. `placePreset` expands a temporary fragment, allocates/remaps IDs, validates fragment and candidate, then merges. Failure leaves the map unchanged. GUI also wraps edits in history. `connectRoad` snaps the source endpoint; `connectRoads` only creates topology between existing coincident endpoints. New roads reject equal start/end, consecutive duplicate/short nodes and extreme grades; split rejects off-road/endpoint cuts instead of repairing zero-length halves afterward.

Use `baseName` for deterministic automatic IDs (`diagonal-boulevard`, `diagonal-boulevard-2`, …). Optional explicit `id` is strict and rejects collisions across roads, junctions, props, links and ports. Repeated preset group names receive suffixes; generated element IDs and all references are remapped consistently. An existing reference remains valid when the old road's start is retained; use the split result / refreshed ports to address its remapped end.

## CLI

No additional dependencies. Uses installed esbuild (already provided by the project tooling) to bundle the TypeScript API in memory. All result bodies are JSON; validation errors return exit code 1. pnpm may print its usual script banner.

```text
pnpm map list-presets
pnpm map validate preset-showcase
pnpm map validate-presets
pnpm map summary city-alpha
pnpm map validate src/world/city/maps/city-alpha.json
pnpm map place-preset city-alpha diamond_interchange --x 1300 --z 650 --rotation 0 --main-lanes 6 --cross-lanes 4 --height 6 --ramp-lanes 1 --radius 55 --group demo-01 --out .tmp-demo.json
pnpm map add-road .tmp-demo.json --request '@road-request.json'
pnpm map connect-road .tmp-demo.json --request '@connection-request.json'
pnpm map move-node .tmp-demo.json --request '@node-request.json'
pnpm map place-prefab .tmp-demo.json --request '@prefab-request.json'
pnpm map delete-object .tmp-demo.json --id unwanted-id
```

`--out` writes a separate file; otherwise mutation commands overwrite the input through a temporary file and rename after validation. `city-alpha` and `city-main` resolve to their authored source JSON. `--request` accepts inline JSON or `@file` (prefer @file on Windows). `--points` for add-road accepts a JSON array or @file containing the array. A place-preset request is `{presetId,parameters}` and uses radians. CLI `--preset <id>` is an alternative to the positional preset ID.

Completion requires **0 errors** from `pnpm map validate <map>`, reviewed warnings, and a successful build. Errors return nonzero CLI status; warnings alone return zero and include their count. `pnpm map validate-presets` checks all catalog recipes at 0/90/180/270° with two parameter sets, including the maximum elevation / minimum legacy radius, plus production geometry and runtime sedan corridor checks. `node scripts/validate-city-toolchain.mjs` checks API/CLI behavior and failed-write protection. `node scripts/build-city-main.mjs` regenerates only the existing City Main recipe and refuses invalid output; it performs no repair/deletion pass.

If a preset itself fails validation, stop and report the preset ID, parameters and errors. Do not rebuild it by hand or rewrite underlying tools. Ordinary map-content agents must leave **RoadBuilder, SectorManager and preset implementation** unchanged; toolchain changes require a separate explicit task.

## Common error checks

- **Duplicate ID:** use baseName allocation; preserve existing explicit IDs. Do not append duplicate link pairs with different IDs.
- **BAD NODES / elevation.node:** inspect finite `{x,y,z}` and Y −50..100m; check Y/Z swaps before touching builders.
- **Broken links:** pass exactly `{roadId,end:'start'|'end'}`, use returned split references, and verify XYZ alignment within 0.2m. No implicit interior/upper-to-lower connections.
- **Weak junction:** warning for missing T/cross approaches. Keep the authored junction and inspect it; do not delete it or invent arms to silence the warning. Invalid port/reference/height is still an error.
- **Degenerate road:** reject repeated nodes, equal endpoints and segments under 0.05m at creation. Split at a genuine interior point, or use the existing endpoint.

Example road-request.json:

```json
{"id":"east-ramp","styleId":"ramp_1","elevationMode":"custom","centerline":[{"x":1100,"y":0,"z":100},{"x":1250,"y":6,"z":100}]}
```

Example connection-request.json:

```json
{"from":{"roadId":"east-ramp","end":"end"},"target":{"endpoint":{"roadId":"existing-deck","end":"start"}}}
```

Node request: `{roadId,index,point:{x,y,z}}`. Prefab request: `{id?,prefabId,position:{x,y,z},rotation}`. A custom API script can call createIntersection; raw JSON also remains a supported authoring route.

## Preview and limits

Launch start-editor.cmd / pnpm run editor. Browser drafts restore by default; click **Reload City Alpha** to see current source JSON, or **Open / Import Updated Map** for a CLI output. **Play in Game** previews the imported/current map on the same origin. After build, start-game.cmd plays the newly bundled City Alpha.

Do not add AI, pathfinding, terrain/tunnel excavation, arbitrary engineering CAD, GIS, asset import, multiplayer, whole-city generation or lane-level merge simulation. Presets are fixed low-poly topology recipes. Read PRESET_CATALOG.md for dimensions and applicable variants.

## Production V1 authoring

Read PRESET_CATALOG.md for dimensions and measured default grades. Urban lanes are 3.6/3.75m; expressway lanes 3.75m; ramps 3.9m plus 0.75m left and 1.75m right shoulders. Optional `shoulders`, `structure.barrierOffset` and `gore` persist with ordinary roads. Runtime surface contact includes paved shoulders, while lane topology still counts traffic lanes only.

Preset elevation defaults to 8m; loop radius defaults to 100m. Legacy parameter ranges remain accepted, with safe minimum loop/ring radii. Ports store actual XYZ and outward heading, and world-direction labels rotate with placement. Resolve returned endpoints/poses rather than assuming local cardinal labels after rotation. Map edits/splits refresh pose metadata.

Prefer the sixteen Production V1 recipes. Never temporarily hand-assemble a complex diamond/cloverleaf/trumpet when a preset lacks a required capability: report that missing capability. Existing district IDs are compatibility recipes; do not expand blocks before road geometry is mature. Use Preset Showcase for driving review and the URL preset selector to inspect each specimen. `metadata.productionGeometry="true"` opts a development map into the stronger footprint/curvature/grade checks.
