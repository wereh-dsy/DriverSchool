# City Map V2

Source snapshot: 2026-10-12. See [current project context](../../../docs/CURRENT_CODE_CONTEXT.md) and [review/validation findings](../../../docs/CODE_REVIEW_2026-10-12.md). Older V1/V2 test counts below describe the earlier revision, not a current all-green baseline.

`CityMap JSON → loadCityMap → RoadBuilder / IntersectionBuilder / PrefabRegistry → SectorManager → CityGround`.
City source data lives in `maps/`; the menu's **City Main · 区域高速网** imports `../regional/regional-main.json`. The runtime does not import Editor or preset generators. Infrastructure recipes expand to ordinary editable roads, intersections, links, ports and props. Subject 2, Subject 3 and circuit maps keep their existing systems.

The CLI alias `city-main` still resolves to `maps/city-main.json` (city-only version 7); the game menu uses the regional version 11. Both have ID `city-main`. Pass `src/world/regional/regional-main.json` explicitly when validating/editing the playable regional map. Do not regenerate the menu map with old City Main recipe scripts.

## Start and edit

Double-click **start-editor.cmd**, or run **pnpm run editor**. Node.js and installed project dependencies are required for editing. The launcher waits for Vite, reuses an existing DriverGame development service, or chooses a free port within 20 candidates. It opens `?editor=city` automatically. `pnpm run editor -- --no-open --port 5180` runs without opening a browser. Normal `start-game.cmd` remains the game launcher.

The Windows CMD launcher automatically finds Node in PATH, standard installation locations, NVM's active location, or the existing Codex bundled runtime. It does not require a global PATH change. For a launch check without opening the browser, use `start-editor.cmd -NoOpen` (or `--no-open`).

The Editor restores the last valid browser map on the same origin; otherwise it opens City Alpha. Completed edits, New, Import, Undo and Redo persist automatically. An unfinished Road draft is not saved. **Reload City Alpha** reads the current authored JSON; use **Open / Import Updated Map** for other files. Reload/Import can be undone. Different ports have different browser storage.

- **Top:** select/place with left click; middle/right drag pans; wheel zooms. Drag road nodes to edit X/Z, or drag an object/road to move it.
- **Road:** choose a style and lane type, click nodes, Enter/Finish. Grid, endpoint and junction-port snapping are optional. Snapping an endpoint creates an explicit connection.
- **Inspector:** move/rotate/delete, width/speed/direction/sidewalk, Ground/Elevated/Custom, uniform road height, selected node X/Y/Z, maximum grade, barrier and pier settings. Changing node Y switches to Custom. Whole-road transforms detach endpoint connections. Junction transforms keep their connected endpoints attached.
- **Preset / Stamp:** categorized ROAD/INTERSECTION/INTERCHANGE/DISTRICT catalog; parameters, wireframe ghost, R rotates 15°, click places. Anchor port defaults to Centre; choose a port to snap that port to an existing road endpoint or free junction port. Cyan markers expose generated continuation ports. New roads can snap to them.
- **Prefab:** existing low-poly buildings and roadside assets, editable rotation/scale/tint.
- **Top / 3D:** 3D orbit uses left drag, right drag pans. Editing remains in Top.
- **Undo / Redo:** 64 snapshots covering creation, properties, connections, movement, rotation, deletion, stamp, New and Import.
- **Validate:** structured errors/warnings appear in Inspector. Invalid operations roll back. Recommended grade ≤12%; >25% is rejected.

**Save / Export** downloads portable JSON; **Open / Import** restores it. Browser filesystem APIs are unnecessary. **Play in Game** stores the current validated map and opens the game with `?city=editor`. The normal game map menu also offers **City Editor 保存地图**. If storage is blocked, Import/Export remains usable. To publish an authored built-in map, replace `maps/city-alpha.json`, validate, then `pnpm run build`; the fresh map is included in the playable `dist`.

## Data contract

Units: metres, radians for JSON Y rotation, km/h for speed limits. Coordinates: +X right, +Y up, −Z forward. CLI `--rotation` uses degrees; JSON `--request` and API use radians.

- Metadata: `schemaVersion:2`, stable `id`, `name`, positive integer `version`, `sectorSize` (default 500), ordered `bounds:{minX,maxX,minZ,maxZ}`.
- Roads: `id`, `type`, `centerline:[{x,y,z}]`, `laneCount`, `laneWidth`, `travelDirection:two-way|forward|reverse`, `speedLimit`; optional `curve:polyline|smooth`, `styleId`, `sidewalk:{enabled,width}`, `district`, `markings`, `curb`, `streetlights`.
- Elevation: `elevationMode:ground|elevated|custom`; Ground resolves `elevation ?? 0` (including raised city platforms), Elevated resolves uniform `elevation` (default 6), Custom uses each node Y. Missing Y defaults to 0. Optional structure fields also cover barrier offsets/styles and tunnel/underpass/cutting enclosure clearance.
- Intersections: `id`, `type:t_2lane|t_4lane|cross_4lane|cross_6lane`, `position:{x,y,z}`, `rotation`, `signalized`, `connections:[{roadId,end:start|end,port:north|east|south|west}]`, optional `signals:{offsetSeconds,headHeight}`. T ports are local north/east/west. Connected endpoints derive from junction ports; each port/endpoint permits one junction attachment.
- `roadLinks:[{id,from:{roadId,end},to:{roadId,end}}]`: explicit continuation/merge graph edges. Endpoint positions/heights must coincide within 0.2m. They can form multi-road branch nodes. Interior projection crossings never connect.
- `connectionPorts:[{id,label,endpoint:{roadId,end},groupId?}]`: authoring labels on ordinary endpoints; no special runtime behavior.
- Objects: `id`, `prefabId`, `position`, `rotation`, optional `scale:{x,y,z}`, `color:#RRGGBB`, `district`.
- Roads/intersections/objects optionally retain `groupId` and `presetSource` after stamping. There is no locked runtime preset object.
- Environment: `districts`, at least one `spawnPoints:[{id,position,rotation}]`, optional string `metadata`. Spawn Y identifies the desired support layer.

Urban types fix total lane counts at 2/4/6; `ramp_1` fixes one forward lane; `highway` permits 1–6 lanes so divided mainline halves and two-lane ramps use the same builder. Two-way roads require even counts. Road styles provide defaults, then authored properties can override them; runtime never reapplies styles over authored values.

Polyline roads interpolate height continuously. Smooth roads use centripetal Catmull–Rom in X/Z and monotonic interpolation of node Y, avoiding vertical overshoot. High roads generate a deck, configurable edge walls and instanced round/rectangular piers about every 30m. Piers omit locations over lower roads/junctions. Explicit joins open barriers locally for ramps. Shared materials, road ribbons, signals and vehicle contact logic are reused.

`CityRoadNetwork` is mesh-independent: sampled 3D centerlines, lanes/directions, speed limits, junctions, explicit endpoint nodes, connectivity and topological lane connections. A projection crossing at different heights is not a graph connection. V1 JSON with no schema/links preserves coincident endpoint behavior by a one-time conversion into explicit links; new schema-2 JSON never infers connections.

## Runtime and sectors

Road triangles compile once to CPU plans, each owned by one spatial sector and batched by material. Adjacent sectors preserve original vertices. GPU meshes are created on load and disposed on unload. Repeated props, lamps and piers use InstancedMesh; shared geometries remain owned until CityGround disposal. Default loading is current sector plus its 3×3 neighborhood; `SectorOptions.loadRadius` configures it. Editor shows the sector grid and loads all authored sectors.

Road metadata, surface indexes and colliders stay resident regardless of visual loading. The optional support-height hook in the existing vehicle contact adapter distinguishes lower roads from upper decks; wheel queries follow continuous ramps. Far-side lights use the existing Subject3TrafficSignals controller and clock. Unloading removes heads without duplicating signals on reload.

## City Alpha validation extension

Original 23 roads, 10 junctions, 288 props and districts remain. V2 adds 20 ordinary roads and two signal junctions on the east side: Urban Overpass at `(1300,-150)`, Diamond at `(1300,650)`, connecting roads from the original east/industrial ends (including access to both overpass layers), a ground-to-6m ramp and a short elevated deck reaching X=1880. Bounds expand only eastward to X=1950. Total: 43 roads, 12 junctions, 288 authored props plus generated structural instances.

## Tools and limits

V2 toolchain hardening uses one `{x,y,z}` contract (Y is height), shared `point3` / `transformPoint3`, a shared ID allocator and strict endpoint links. API road creation rejects degenerate nodes immediately; `splitRoadAtPoint` preserves outer connections and remaps links, junctions and exposed ports. Preset placement validates both a temporary fragment and the candidate map before merging. Ordinary map authoring does not modify builders or sectors.

The current catalog contains 34 recipes: 31 production and 3 compatibility district recipes. `pnpm map validate-presets` iterates the live catalog, cardinal rotations and parameter variants, with production geometry and runtime sedan corridor checks; do not reuse the old 19/152/32 totals. `node scripts/validate-city-toolchain.mjs` exercises API and CLI success/rejection, safe writes and roundtrips. Validation reports errorCount/warningCount: errors block saves and return nonzero CLI status; missing junction arms, reserved ports, steep recommended grades and separate network components remain visible warnings. Current preset-showcase validation throws in RoadEdgeChains at its roundabout; registration is not proof of successful loading.

`node scripts/build-city-main.mjs` runs the historical V3 recipe from `artifacts/city-main-v3/v2-base.json` and writes `maps/city-main.json`. It does not reproduce today's V5 city or regional highway map and can replace a newer authored city with an older layout. Run generation/upgrade scripts only for an explicitly requested revision task. Editor defaults to City Alpha when no saved draft exists; the game has a separate City Main regional menu entry.

See [AGENT_GUIDE.md](AGENT_GUIDE.md) for stable API/CLI and the recommended authoring workflow, and [PRESET_CATALOG.md](PRESET_CATALOG.md) for recipe specifications.

Recipes are fixed low-poly topology. Current extensions include irregular/channelized junctions, backbone and compact interchanges, tunnel/underpass enclosure geometry, highway transitions/markings, named roads/signs and regional terrain/visual streaming. This is not a full lane-level engineering/traffic simulation. Logical topology, surfaces and colliders remain resident while visual sectors load/unload. Road splitting is explicit through the API; the GUI does not automatically insert junctions at crossings. There are no CAD constraints, multi-select/group transforms, direct file overwrite from GUI, general terrain excavation, arbitrary bridge engineering or asset import pipeline. Ghosts show road outlines/prop footprints rather than full meshes. Drag handles update immediately; final meshes rebuild on release. No AI traffic, pedestrians, pathfinding, exam routes or multiplayer. The user evaluates visual quality and driving feel.

## Production Road Presets V1

The original sixteen production recipes cover boulevards, divided elevated expressways, entry/exit ramps, signal crosses/T junctions, roundabout, overpass, diamond, cloverleaf and trumpet. The live catalog additionally includes backbone/compact systems, side access, channelized junction, tunnels/underpasses and main/auxiliary roads; consult catalog.json and PRESET_CATALOG.md rather than assuming all recipes share the original dimensions. For the original V1 ramp recipes, lanes are 3.9m with 2.5m combined shoulders and default elevated height 8m.

**Preset Showcase** registers the original 16 specimens in the menu and at `?city=preset-showcase`; `&preset=<specimen-id>` chooses a spawn. It does not exhibit all 31 current production recipes. Its current roundabout edge-chain failure must be fixed before claiming it playable or validated. `node scripts/build-preset-showcase.mjs` rewrites that fixture; it is a generation command, not a read-only check. See PRESET_CATALOG.md for original V1 dimensions and the live JSON for newer recipes.
