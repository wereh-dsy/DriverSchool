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
pnpm mapctl preview regional-main --request '@operations.json' --out preview.json
pnpm mapctl apply regional-main --request '@preview.json' --out edited-city.json
pnpm mapctl validate edited-city.json --request '@selection.json'
```

`area.json`: `{"center":{"x":0,"z":0},"radius":150,"limit":20}`

`query.json`: `{"name":"人民","roadClass":"arterial","limit":10}`. Use `{"kind":"corridors","name":"快速路"}`, `{"kind":"corridor","id":"…"}`, `{"kind":"group","id":"…"}`, `{"kind":"signs","roadId":"…"}` or `{"kind":"sign","id":"…"}` for those entities.

`selection.json`: `{"roadId":"existing-road-id"}`, `{"corridorId":"existing-corridor-id"}`, `{"intersectionId":"existing-junction-id"}` or `{"bbox":{"minX":-100,"maxX":100,"minZ":-100,"maxZ":100}}`.

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

## Validation entry points

`pnpm run selftest:editor` checks the small fixture and operation contracts. `node scripts/run-editor-selftests.mjs --city-main` checks one ordinary junction, one frontage area and one ramp against current Qingjiang data, without writing that map. `node scripts/validate-editor-cli.mjs` checks receipts, atomic saves, stale-write refusal, compact queries and reload. The required final playable build is `pnpm run build`.

Foundation limits: no automated lane-level merge design, terrain excavation or clearance optimizer. Existing regional terrain, services and highway semantics are retained; newly authored depressed roads use the existing cutting geometry. The editor ground is translucent so below-ground geometry remains visible. Large interchange stamps require explicit connection to existing road ports; geometry warnings must be reviewed before replacing a live junction. Frontage relationships follow translations, not arbitrary reshape constraints. Parallel/frontage commands inherit source elevations unless `elevation` is supplied; the UI exposes this as Parallel height.
