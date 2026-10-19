# City Intent Editor

Open `?editor=city`, then **清江市 City Main** to edit the same `regional-main` map used by the game menu. `?editor=city&map=regional-main` opens it directly. **Test Map** provides a small road/expressway fixture. **Open** imports a CLI result; **Save** exports portable JSON. Browser drafts are optional and origin-specific. Saving in the browser does not overwrite repository source files.

## Shared editing boundary

`CityMapEditor.ts` exports the intent UI. `CityIntentEditor` and `scripts/mapctl.ts` both call `CityEditingKernel`. Commands operate on ordinary CityMap roads, explicit endpoint links, intersections and the existing road-name/sign model. Vehicle systems and CityGround/SectorManager are unchanged.

`preview(command | commands[], label?)` creates a copy-on-write transaction and returns its ID, created/modified/deleted IDs, bounds, local issues and validity. `previewData(id)` provides only affected ghost geometry. `commit(id)` publishes it and records **one** entry in the existing `CityEditorHistory`. An array of commands is one undo step. `cancelPreview`, `undo`, `redo`, `dryRun`, and `apply` are also available. A newer preview, commit, undo or redo invalidates an old preview. Failed commands leave the live map unchanged.

`CityEditorScene` reuses RoadBuilder, IntersectionBuilder, PrefabRegistry, RoadSignRenderer and the existing far-side Chinese traffic signals. It caches nearby entity meshes; commits invalidate the affected neighborhood. Drag previews build only ghost geometry and local topology. No CityGround or complete navigation graph is rebuilt by a drag. Full validation happens only via **Validate full map** or an explicit portable export/import. Normal edits validate the affected roads plus direct connection/sign references.

`CityMapData.editing` stores corridors, logical lockable groups, frontage attachments, ramp references and cubic ramp handles. Existing `roadNameId` and stamp `groupId` values are adopted into stable logical selections on opening Qingjiang. Existing road/sign/structure IDs are retained. Authoring metadata survives JSON save/reload; runtime continues to consume normal roads and junctions.

## Human workflow

- Default 3D: left selects/draws/drags; right orbits; middle or Shift+right pans; wheel zooms. **Top / 3D** switches views. **Focus** frames a selection. Search the object list by Chinese road name, district or ID.
- **Road**: pick one of eleven semantic/cross-section presets, click a few control points, then **Preview road** / Enter (or click an existing road to finish). Confirm the ghost to commit. Same-level urban crossings form a single junction; different heights do not connect. Named paired carriageways can share one six-arm junction.
- Snap candidates include endpoints, junction mouths/centers, centerlines, paved edges, parallel/perpendicular alignment, common angles, same elevation and grid. **Tab** cycles candidates. **C** changes the crossing intent: intersection / overpass / underpass / no connection. Controlled-access crossings need an explicit grade separation or ramp.
- **Select**: drag yellow path handles; Shift+drag adjusts height. Generated ramps have two merge endpoints and two tangent handles; merge endpoints remain tied to topology. Changes stay in a ghost until confirmed.
- **Corridor**: select a named corridor, or Ctrl+click roads and **Create corridor from selection**. Use the inspector to move it, change road function/cross section, or generate parallel/frontage roads. Attached frontages follow finite corridor translations; **Detach generated roads** makes them independent.
- **Ramp**: click the source road at the diverge location, then the target at the merge location. Choose On/Off and 1/2 lanes. The command splits hosts, creates a cubic ramp with an elevation transition and links both ends. Tangent handles remain editable.
- **Elevation**: change whole-road height, an interval with transition lengths, or a distance:height profile. **Section elevated +8m** and **Section depressed −6m** provide starting values. The inspector reports maximum grade; impossible grades block commit.
- **Intersection**: select/create a junction, edit its signal control and endpoint arms. Large divided intersections retain a single pavement owner. **Group intersection** and group **Lock** protect its approaches.
- **Interchange**: Compact Urban Diamond, Basic Diamond, Directional T/Y and On/Off Pair are grouped editable roads. Existing Qingjiang compact X/turbine/star/cloverleaf/hybrid and side-access recipes are also available. Stamps expose ordinary connection ports; connect them explicitly to existing roads rather than overlapping unrelated topology.
- **Sign**: click a road to place a street-name sign, or a speed sign on an unnamed road. Select existing signs to change template, size, heading, destinations or station. Set road names through the shared registry. Splits remap sign ownership/stations; road transforms/profile changes carry their signs. Semantic-only edits preserve sign placement.
- Semantic, elevation, corridor, intersection and sector-grid overlays help inspect local edits. Validation issues can focus their affected object.

## Agent queries and commands

Import `CityEditingKernel` and `EditorCommand` from `src/editor`. The browser exposes the same query/preview/commit boundary as `window.cityEditor`.

Queries: `getRoad`, `getCorridor`, `listCorridors`, `getIntersection`, `getGroup`, `findRoads`, `getConnectedRoads`, `getNearbyRoads`, `getSign`, `findSigns`, `inspectArea`. Road filters include ID, road name/name ID, semantic class, corridor, stamp group, district, section, preset source, bbox, center/radius and connectivity. Lists are bounded by `limit` (default 100 roads / 50 signs). `inspectArea` returns compact local roads, corridor/group summaries, intersections, ramps, structures, signs, connectivity and warnings, without sampled centerlines.

Commands: `modifyMap`, `createRoad`, `extendRoad`, `moveRoad`, `moveCorridor`, `deleteRoad`, `splitRoad`, `mergeRoads`, `connectRoads`, `editControlPoint`, `createCorridor`, `createParallelRoad`, `generateFrontageRoads`, `detach`, `createRamp`, `modifyRamp`, `createIntersection`, `modifyIntersection`, `changeRoadClass`, `changeCrossSection`, `setElevationProfile`, `createInterchange`, `placePreset`, `createGroup`, `setLocked`, `placeObject`, `modifyObject`, `deleteObject`, `modifyRoad`, `setRoadName`, `createSign`, `modifySign`, `deleteSign`. Exact discriminated argument types are in `EditorCommands.ts`; XYZ are metres and rotations radians.

Local validation: `validateRoad`, `validateCorridor`, `validateIntersection`, `validateSelection`, `validateArea`. It checks existing schema/topology rules, short/disconnected roads, duplicate junctions, connection height/gaps, extreme grades, low crossing clearance, expressway crossing intent and sign/name references. It is an authoring check, not a civil-engineering solver or a global traffic audit.

## CLI

Use `@file` requests on Windows. `regional-main` is the playable Qingjiang source; `city-main-city` explicitly selects the older city-only source. The ambiguous `city-main` alias is refused by this new CLI. `editor-test` and `city-alpha` are also available.

```powershell
pnpm mapctl presets
pnpm mapctl inspect regional-main --request '@area.json'
pnpm mapctl query regional-main --request '@query.json'
pnpm mapctl diagnose regional-main --request '@diagnose.json' --out diagnosis.json
pnpm mapctl preview regional-main --request '@operations.json' --out preview.json
pnpm mapctl repair regional-main --request '@diagnosis.json' --out repair-preview.json
pnpm mapctl apply regional-main --request '@repair-preview.json' --out edited-city.json
pnpm mapctl validate edited-city.json --request '@selection.json'
pnpm mapctl validate edited-city.json --full
```

`area.json`: `{"center":{"x":0,"z":0},"radius":150,"limit":20}`

`query.json`: `{"name":"人民","roadClass":"arterial","limit":10}`. Use `{"kind":"corridors","name":"快速路"}`, `{"kind":"corridor","id":"…"}`, `{"kind":"group","id":"…"}`, `{"kind":"signs","roadId":"…"}` or `{"kind":"sign","id":"…"}` for those entities.

`selection.json`: `{"roadId":"existing-road-id"}`, `{"corridorId":"existing-corridor-id"}`, `{"intersectionId":"existing-junction-id"}` or `{"bbox":{"minX":-100,"maxX":100,"minZ":-100,"maxZ":100}}`.

`diagnose.json` uses the same local scopes plus `{"full":true}`. Add `limit` (default 100), `codes` (e.g. `["vertical.","geometry.sharp"]`) and `minSeverity` when narrowing a receipt.

```json
{"roadId":"v8-nanjing-road","limit":30}
{"corridorId":"corridor:...","codes":["geometry.","vertical."]}
{"bbox":{"minX":1200,"maxX":2400,"minZ":-1600,"maxZ":-600},"limit":100}
```

Example `operations.json` for the small fixture:

```json
{"label":"Avenue crossing","operations":[
  {"op":"createRoad","id":"new-collector","preset":"collector","points":[{"x":40,"y":0,"z":-100},{"x":40,"y":0,"z":200}],"crossing":"intersection"}
]}
```

Example Qingjiang operations after querying real IDs:

```json
{"operations":[
  {"op":"generateFrontageRoads","id":"corridor:REPLACE-WITH-QUERY-ID:expressway","side":"both","offset":40,"preset":"frontage2"},
  {"op":"modifySign","id":"REPLACE-WITH-QUERY-SIGN-ID","properties":{"stationMetres":80}}
]}
```

Preview outputs a receipt containing commands, a source SHA-256 digest and the compact edit summary. Applying that receipt refuses a changed source. `apply` always previews/locally validates before an atomic temporary-file rename. Without `--out`, it replaces the explicitly selected input source. An invalid operation or stale receipt does not write the map. Import an output JSON in the UI to inspect it; apply to `regional-main` and run the normal build to publish it into the playable game.

## Road quality diagnose and repair (CLI-first)

`diagnose` is quality advice, not legality. `validate` remains the structural gate (broken references, topology, impossible connections). A wave in an elevation profile therefore appears in `diagnose` without blocking `preview`/`commit`.

Detected groups:

- Horizontal: consecutive short segments, sharp/angular bends, tight S curves, zigzag/sway, redundant or collinear control points, self-intersection.
- Vertical: high-frequency waves and grade reversals (not only absolute grade), abrupt grade changes, excessive/recommended grade, redundant elevation points, local reverse on a mostly monotonic ramp.
- Topology/intersection: open endpoints, tiny fragments, endpoint gaps, controlled-access crossings, duplicate/close junctions, short approaches, stale port bearings, tangential (kinked) approaches.
- Marking: stop line displaced or inside pavement, overlapping zebra crossings, generic marking footprint, fragments that still carry markings.

Each issue carries compact `code`, `severity`, `roadId`/`intersectionId`, `station`, `metrics`, a short `message` and a `repair` suggestion. Centerlines are never dumped; `limit`, `codes` and `minSeverity` keep an Agent receipt small.

Explicit `{"full":true}` checks every road and intersection, independently of map bounds and local spatial/cap filters. Local scope selection retains its 600-road cap and default 100 returned details (maximum 1,000). Every report includes `coverage` (`roadsChecked`, `roadsTotal`, `intersectionsChecked`, `intersectionsTotal`) and `counts.total`, `counts.bySeverity`, `counts.byCode`; the existing flat severity counts remain available.

CLI `diagnose --out <receipt.json>` saves **all computed issues matching the requested scope/code/severity filters**, while stdout returns only the requested compact page plus `detailsFile` and `pagination`. Full CLI diagnosis requires `--out` so no computed details are lost. A complete saved receipt has `truncated:false` and `issues.length === counts.total`; stdout can have `truncated:true` without truncating that file. Existing diagnostic rules, thresholds and issue deduplication are unchanged.

Page the saved receipt with `pnpm mapctl query <receipt.json> --request @page.json`, where `page.json` is `{"kind":"diagnosis","offset":0,"limit":100}`. Follow `pagination.nextOffset` until null. This reads the receipt only and never loads or diagnoses a map. Optional `codes` and `minSeverity` filter the detail pages (for example `{"kind":"diagnosis","minSeverity":"warning","limit":1000}`); `counts` remains the complete receipt's totals, while `pagination.total` is the number matching the page filters. Page size is at most 1,000. Truncated legacy receipts are rejected rather than presenting missing details as retrievable.

`node scripts/validate-diagnose-coverage.mjs` runs only isolated coverage/counting/pagination fixtures and read-only CLI checks; it does not load regional-main, repair roads or run the broader editor/vehicle/core suites.

Repair commands (all use preview → local validation → commit, and support `--out` receipts):

```json
{"op":"smoothRoad","id":"road-or-corridor","strength":1.2,"preserveEndpoints":true}
{"op":"repairElevation","id":"road-or-corridor","strength":2,"maxGrade":0.06,"monotonic":false}
{"op":"simplifyRoad","id":"road-or-corridor","tolerance":0.2}
{"op":"repairRamp","id":"ramp-road-or-ramp-metadata","strength":1.5,"monotonic":true}
{"op":"repairIntersection","id":"junction-id"}
{"op":"repairIntersections","bbox":{"minX":0,"maxX":500,"minZ":-500,"maxZ":0},"codes":["marking.","intersection."]}
{"op":"setCorridorName","id":"corridor-id","name":"人民大道"}
```

`smoothRoad` keeps the two range endpoints exact, rounds sharp interior corners with tangent arcs, low-pass filters the remaining control points and writes back a small natural polylines. `repairElevation` pins endpoints and bridge/ground connections, smooths short-wavelength height control points, optionally enforces a monotonic grade and limits the target grade while reporting `beforeMaxGrade`, `afterMaxGrade`, `beforeGradeReversals`, `afterGradeReversals`, `removedControlPoints` and the affected station range. `repairRamp` applies both to a ramp while keeping its merge endpoints. `repairIntersection` trims each mouth until it clears every non-parallel approach ribbon, rebuilds the pavement outline from the actual mouths, refreshes port bearings/marking metadata and never deletes the junction.

`repair` can derive operations from a diagnosis receipt (`--request @diagnosis.json`) or a local scope (`{"scope":{"corridorId":"..."}}`). It previews by default; `--apply` commits and writes the map. Unknown or unfixable issues are not invented; an empty result means there is no suggested repair for that scope.

Stop lines and zebra crossings are generated from the final pavement boundary and actual approach heading. Road lane paint is suppressed through the terminal strip, overlapping crosswalks are not double-painted, and median/lane lines stop before the junction. `repairIntersection` triggers the same rebuild on commit.

Road names use `RoadNameRegistry` + `roadNameId` as the single source of truth. `setCorridorName` applies one name ID to every segment, split roads inherit it, merge keeps the surviving name, and parallel/frontage/ramp roads stay unnamed unless explicitly assigned. Editor, navigation, minimap road network and signs all resolve the same registry entry.

In the 3D editor, selecting a road/corridor/junction shows a small axis gizmo (red X, green Y, blue Z, magenta road normal). Dragging an axis moves predictably; the previous screen-drag remains for quick adjustments. Repair previews show the original geometry in orange and the repaired ghost in green, with a **修复前 ghost** toggle. The editor shell is in Chinese; IDs, preset keys and CLI commands remain English.

## Validation entry points

`pnpm run selftest:editor` checks the small fixture and operation contracts. `node scripts/run-editor-selftests.mjs --city-main` checks one ordinary junction, one frontage area and one ramp against current Qingjiang data, without writing that map. `pnpm run selftest:road-quality` runs 53 focused checks: synthetic sharp bend, elevation wave, ramp, ordinary/skew/divided junctions, naming registry, save/reload and gizmo/before-ghost, plus real `v8-nanjing-road`, `v4-west`, `system-east:S-to-W-turbine` and `urban-junction-19`. `node scripts/validate-editor-cli.mjs` checks receipts, atomic saves, stale-write refusal, compact local inspect, explicit full validation, real-map diagnose and repair-preview source safety. The required final playable build is `pnpm run build`.

Foundation limits: no automated lane-level merge design, terrain excavation or clearance optimizer. Existing regional terrain, services and highway semantics are retained; newly authored depressed roads use the existing cutting geometry. The editor ground is translucent so below-ground geometry remains visible. Large interchange stamps require explicit connection to existing road ports; geometry warnings must be reviewed before replacing a live junction. Frontage relationships follow translations, not arbitrary reshape constraints. Parallel/frontage commands inherit source elevations unless `elevation` is supplied; the UI exposes this as Parallel height.
# Engineering CLI and Placement Brush

See [Map Editing Kernel / Agent CLI](MAPCTL_ENGINEERING.md) for profile constraints,
ramp windows, object/structure inspection, shared Editor/CLI placement brushes,
semantic transaction review and copyable requests.
