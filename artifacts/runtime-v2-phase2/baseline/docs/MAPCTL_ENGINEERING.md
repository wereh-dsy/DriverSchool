# Map Editing Kernel / Agent CLI

This extends the existing CityEditingKernel, command union, transaction/history and
mapctl entry point. It does not repair the playable map. All distances are metres,
grades are m/m, headings/rotation are radians, and coordinates are XYZ with Y up.

## Discover and inspect

`node scripts/mapctl.mjs --help` returns machine-readable command/request examples,
brush enums, repair strategies and centralized review thresholds. Existing
inspect/query/diagnose/repair/preview/apply/validate request files remain supported.

| Domain | Entry point and result |
| --- | --- |
| Profile | `inspect` `{kind:"profile",roadId,step}`: stations, XYZ, grade/delta, authored control points, extrema, metrics, crossing/intersection/structure anchors, over/under envelopes and clearance |
| Horizontal | `inspect` `{kind:"geometry",roadId}`: segment lengths, headings, heading deltas, curvature approximation, self-crossings and nearby conflicts |
| Ramp | `inspect` `{kind:"ramp",roadId}`: source/target, role, on/off, merge/diverge, profile, neighbouring ramps/intersections and attachment spacing |
| Windows | `query` `{kind:"accessWindows",mainline,frontage,corridorId?,direction?,start?,end?,buffer?,minLength?}`: events, excluded spans and reviewable candidate windows. Multi-road corridors retain per-road station references; disconnected segments are never silently concatenated |
| Objects | `query` `{kind:"objects",roadId|intersectionId|bbox|center+radius,type?,district?,limit?,offset?}` and `inspect` `{kind:"object",objectId}`: transform, approximate bounds, derived road/station/lateral/vertical anchor, lane/intersection/structure context and legality |
| Structure | `inspect` `{kind:"structure",roadId}`: at_grade/elevated/depressed/tunnel, deck/ground height, 0.65m runtime deck thickness, enclosure/ceiling/portal intent, crossing/overlap clearance and nearby objects |
| Region | `inspect` `{kind:"region",bbox|center+radius}` aggregates roads, junctions, ramps, objects, structures and diagnostics |
| Issue | `inspect` `{kind:"issue",issueId,scope}` returns issue, entity, relevant geometry, neighbourhood and suggested repair |

Useful flags mirror the JSON scope: `--kind`, `--road`, `--intersection`, `--object`,
`--type`, `--district`, `--corridor`, `--structure`, `--bbox` (JSON), `--near x,z`,
`--radius`, `--code` (comma separated prefixes), `--severity`, `--limit`, `--offset`.
JSON is always emitted; `--json` is optional. `--out` saves JSON. Read-only output
cannot name the source map. Full work requires explicit `--full` / `full:true`;
full diagnose also requires an output file.

## Diagnostics and constrained repair

Legacy road diagnosis now also reports isolated and flat-topped local extrema.
`--domain profile|ramps|objects|structures|all` selects engineering diagnosis.
New diagnostics have stable IDs, numeric measurements and explicit thresholds.
Crossing/structure-driven extrema are labelled `constraintDriven`; repair suggestions
are omitted for those extrema. Other profile metrics include extrema count/spacing,
wave amplitude/length, maximum grade/delta and nearest hard constraint distance.

`repairElevation` and `repairRamp` accept `start`, `end`, `anchors`, `maxGrade` and
`strategy`: `smoothLocalExtremum`, `smoothWave`, `smoothGradeBreak`,
`fitBetweenConstraints`. Interval repair retains exterior XYZ and control points,
pins both boundary XYZ, and preserves hard crossing/intersection/deck/enclosure
anchors. Profile repair keeps XZ fixed. Explicit anchor elevations must match the
source; changing a protected crossing height is a separate authored redesign.
Before/after profile metrics are included in the preview. Impossible endpoint grade
requirements remain visible in actual resulting metrics; source constraints are not
moved just to achieve a preferred grade. Use local validation/review before apply.

Ramp diagnostics cover access length/excursion, nearby interchange ramps, overlapping
ramp envelopes, attachment spacing, intersection conflicts, frontage crossings and
explicit attachment XYZ. Thresholds live in `MAP_REVIEW_LIMITS` in MapAnalysis.ts.
Window output is a spatial review aid, not an automatic interchange designer.

Existing access ramps can move their attachment stations without deleting their
identity: `{op:"modifyRamp",id,from:{roadId,station},to:{roadId,station}}`.
Either attachment is optional. The kernel splits the receiving road, preserves
its through links, and reconnects the same ramp with tangent handles. Review the
directed routes and crossing clearances before committing an attachment move.

## Object commands and real schema

`moveObject`, `rotateObject`, `removeObject`, `reanchorObject` work through the same
transaction as roads. Signs retain their existing semantic sign schema and registry
references. Prefabs retain their existing type/variant/scale. Anchor inspection is
derived; this does not migrate every old object into a new persistent object schema.

Signals are generated by junctions, not ordinary CityObject prefabs. Their editable
IDs are `signal:<intersectionId>:<port>`. `setSignalPlacement` persists an optional
`signals.placements[port]` position, heading and headHeight override consumed by the
runtime renderer. Pole height is distinct from root Y; profiled signal geometry
requires at least 7.2m. Removing a generated signal mesh is not a supported object
deletion: use junction signal configuration. A single generated approach cannot
accumulate duplicate authored signal objects.

Reanchor strategies include roadside/approach reanchoring, fixing facing, opposite-side
signals and moving outside carriageways. Facing uses the served direction and actual
road tangent. Object diagnosis considers pavement/shoulders, junctions, barriers,
building envelopes, decks, tunnel floors/ceilings and Y separation. A tree under a
high bridge is not rejected merely for XZ overlap. Ordinary streetlights inside a
covered tunnel are flagged. Canopy warnings are distinct from trunk/lane conflicts.

## Placement Brush: one engine for Editor, CLI and repair

Use `brush <map> --request @brush.json` for preview, or the composable command
`{op:"brushObjects",brush:{...}}` in any ordinary preview transaction.

```json
{
  "mode": "RANGE", "type": "streetlight", "roadId": "road-id",
  "stationStart": 100, "stationEnd": 800, "spacing": 32,
  "side": "both", "arrangement": "STAGGERED", "lateralOffset": 2,
  "heightMode": "ROAD_SURFACE", "heightOffset": 0.15,
  "orientation": "ROAD_FORWARD", "scale": 1,
  "randomPositionJitter": 0, "randomRotationJitter": 0,
  "randomScaleJitter": 0, "seed": 42,
  "minDistanceToIntersection": 20, "minDistanceToRamp": 10,
  "minDistanceToObject": 2, "avoidTypes": [],
  "snapMode": "roadside", "autoAdjust": "ADJUST", "maxAutoMove": 5
}
```

Modes: SINGLE, LINE, RANGE, AREA (vegetation bbox/polygon with density in objects/m²),
REPLACE and REPAIR. REPLACE reanchors existing identities/variants; with road+spacing
it resamples the range, adds missing instances and explicitly removes surplus ones.
REPAIR only selects illegal objects and keeps valid ones untouched. Both require a
local scope or explicit object IDs. A whole stroke is one preview/commit/undo.

Lateral offset is a gap beyond the selected paved edge; reanchorObject's
`lateralOffset` is instead an absolute signed centerline offset. Positive is the
normal `(-tangent.z, tangent.x)`. Spacing supports aligned or staggered sides and
longitudinal start phase. Seeded jitter affects position/yaw/scale reproducibly.
`snapMode:roadside` projects jitter back to the road-relative side; `none` retains
world-space jitter. RANDOM parameters require an integer seed.

Height modes: GROUND, ROAD_SURFACE, ROAD_DECK, SIDEWALK (+0.15m), STRUCTURE_DECK,
ABSOLUTE (`height` required) and RELATIVE (road-anchor surface + heightOffset).
Orientation: ROAD_FORWARD, ROAD_BACKWARD, FACE_TRAFFIC, FACE_ROAD,
FACE_INTERSECTION (intersectionId required), NORMAL_TO_ROAD and ABSOLUTE.
The current object schema supports yaw, not pitch/roll; nonzero pitch/roll is rejected.
Model size/shape variants use existing prefab fields rather than fictional pole/arm
parameters. Signal poleHeight uses the junction head-height capability.

STRICT rejects the entire stroke if any candidate is illegal. SKIP leaves illegal
candidates out. ADJUST tries bounded lateral/station/support-height/facing changes,
then skips unresolved candidates. REPAIR defaults to ADJUST; other modes to SKIP.
Results contain final transforms, anchors, legality, adjustment reasons and
planned/valid/adjusted/invalid/skipped/added/moved/removed counts. Explicit re-layout
may move objects farther; automatic adjustments are bounded by maxAutoMove.
Traffic lights require an intersection/approach and cannot be LINE/AREA brushes.
Directional sign placement requires a real registry nameId and forbids free random
position/facing. Semantic sign creation honours explicit candidate transforms.
Sign edits also honour explicit position/heading when stationMetres is supplied;
station-only edits retain the previous lateral offset. Semantic diff includes
authored sign support fields, including postOffset, gantryPosts and postBaseY.

In City Editor select **物件刷子**, drag along a road (or drag a vegetation AREA),
adjust the panel and confirm the preview. Green/yellow/red ghosts are shared engine
VALID/ADJUSTED/INVALID results. Alt+wheel changes heightOffset by 0.05m;
Shift+wheel changes lateral offset by 0.25m. Slider/input changes re-preview on a
debounce; pointer drag is throttled, not a full-map diagnosis every animation frame.
For traffic lights select a junction. Legacy low-level placement/edit commands remain
available for compatibility, with placement diagnostics in local validation.

## Transactions, review and performance

Preview receipts bind the source digest/version, operations and their digest,
affected IDs, source entity state, summary, metrics and semantic diff. `apply` and
`repair --apply` reject stale source, missing receipt binding or changed operations;
source bytes are rechecked before atomic file rename. Plain operation requests remain
compatible. An old unbound diagnosis/preview receipt must be re-previewed first.
No independent SHA validation command is necessary to use these receipt protections.

`review <map> --request @receipt.json` replays without writing the map. Add
`--package artifacts/unique-task-directory` to save request, preview, receipt,
semantic diff, before/after diagnostics, issue diff, validation and REPORT.md.
The directory must be new; existing artifacts are not silently overwritten.
`diff <before> --after <after> [--diagnostics] [--full]` compares two maps.

Semantic review includes road geometry/elevation/control/endpoint changes,
intersection arms/markings, object move/rotation/anchors, derived structure changes,
links, affected bbox and symmetric approximate displacement. Issue comparison reports
resolved/new/unchanged by entity/code/station/severity. Topology review uses local
dependency expansion, components/dead ends and the actual logical lane network;
optional `{routes:[{from,to}]}` checks directed lane reachability (same-direction lane
changes allowed). Local results are scoped, not a global driving guarantee. `--full`
is explicit. CLI never builds the game.

MapAnalysisContext caches derived road paths, crossings, over/under envelopes and an
EditorSpatialIndex grid per immutable map snapshot. Object bounds/nearby entities use
that grid and ID maps. Mutable transaction commands invalidate authoring caches;
undo/redo uses snapshot caches. Geometry comes from the existing road/junction
helpers. There is no second runtime geometry engine, GIS dependency or mesh baking.

Approximate bounds are marked, particularly non-box buildings and unknown prefab
variants. Sight-ray/deck checks are conservative, not pixel visibility. Tunnel
ceilings/portals are runtime derived: intent can be inspected, but shell finish,
actual mesh gaps and uncertain cover require reviewRequired/visual inspection.

## Copyable PowerShell examples against current City Main

All examples preview/read only; no command below applies to regional-main.

```powershell
# 1. Ramp profile, including crossing constraints.
node scripts/mapctl.mjs inspect regional-main --kind profile --road v91-ew-east-eb-off --step 10

# 2. Existing expressway/frontage pair: blockers and candidate access windows.
'{"kind":"accessWindows","mainline":"ew-eb-split-split-4-split-2","frontage":"v91-ew-1-a-3-section","buffer":80,"minLength":40}' | Set-Content -Encoding utf8 .tmp-windows.json
node scripts/mapctl.mjs query regional-main --request '@.tmp-windows.json'

# 3. Junction traffic lights, then inspect one returned signal object ID.
node scripts/mapctl.mjs query regional-main --kind objects --intersection urban-junction-69 --type trafficLight --radius 80

# 4. Object placement diagnosis in a bbox.
'{"domain":"objects","bbox":{"minX":-200,"maxX":200,"minZ":-200,"maxZ":200},"limit":40}' | Set-Content -Encoding utf8 .tmp-object-diagnose.json
node scripts/mapctl.mjs diagnose regional-main --request '@.tmp-object-diagnose.json' --out .tmp-object-issues.json

# 5. Object repair preview; choose station/offset explicitly if required by inspect.
'{"operations":[{"op":"reanchorObject","id":"v6-road-trees-276","strategy":"reanchorRoadside"}]}' | Set-Content -Encoding utf8 .tmp-object-repair.json
node scripts/mapctl.mjs preview regional-main --request '@.tmp-object-repair.json' --out .tmp-object-receipt.json

# 6. Replay/review that transaction; choose a fresh artifact directory each run.
node scripts/mapctl.mjs review regional-main --request '@.tmp-object-receipt.json' --package artifacts/mapctl-object-review-example

# 7. Produce an after snapshot in a scratch file, then compare semantically.
node scripts/mapctl.mjs apply regional-main --request '@.tmp-object-receipt.json' --out .tmp-object-after.json
node scripts/mapctl.mjs diff src/world/regional/regional-main.json --after .tmp-object-after.json --out .tmp-object-diff.json
```

## Focused checks

`pnpm run selftest:mapctl` runs synthetic kernel/brush tests plus CLI receipt/review
package tests. `node scripts/run-mapctl-selftests.mjs --focused` runs only the new
engineering/brush suite. The default also runs the existing synthetic road-quality
scenarios. `node scripts/smoke-mapctl-engineering.mjs` performs six read-only queries
on live City Main and verifies byte equality without a standalone SHA command.
Existing editor tests remain at `node scripts/run-editor-selftests.mjs`.

## Pavement elevation seams

```powershell
node scripts/mapctl.mjs diagnose-elevation-seams regional-main --near 2216,2140 --radius 35 --out artifacts/local-seams.json
node scripts/mapctl.mjs diagnose-elevation-seams regional-main --out artifacts/all-seams.json --limit 0
node scripts/mapctl.mjs diagnose-elevation-seams regional-main --height-threshold 0.02 --clusters --out artifacts/seam-clusters.json --limit 0
node scripts/mapctl.mjs repair-elevation-seams regional-main --safe-only --out artifacts/seam-preview.json
# Explicit application; --out is the receipt, not another map destination.
node scripts/mapctl.mjs repair-elevation-seams regional-main --safe-only --apply --out artifacts/seam-applied.json
```

The read-only scan defaults to the whole map; `--road`, `--bbox` and
`--near x,z --radius metres` narrow it. `--out` retains all candidates;
stdout is paginated with `--offset`/`--limit`. Measurements use SI units and
runtime `roadPoints`, physical shoulder widths, clamped support planes and
junction masks. A 64m segment AABB grid shortlists pairs, convex footprint
intersection supplies probes (vertices, centroid, edges at <=1m); footprints
within 0.2m are also checked. Nearby pavement is a candidate, not proof of a
drivable connection. `--clusters` also probes road/junction pavement ownership
boundaries and groups continuous station/spatial runs independently of category.

Reports include road/segment IDs (runtime sampled segment indices), station
ranges, bbox, worst point, height range, normal dot, local grades and grade
break, overlap area/length, horizontal gap, topology relation and local layers.
The 4cm height and 4% adjacent-grade-break thresholds are diagnostic thresholds,
not a requirement to remove every crest/sag. A report maximum of zero means no
*reportable* seam remains; use a runtime overlap probe for sub-threshold values.
Automatic grade-separation exclusion requires explicit structure, at least 2m
separation, a stable gap and distance from local connections. A large gap alone
does not establish separation. Cluster length is projected coverage, not a
drivable route. `--height-threshold 0.02` enables the broader 2cm review without
relaxing the safe repair policy.

`SAFE_AUTO_FIX` is restricted to an isolated interior wrinkle on a custom
polyline: <=80m span, <=25cm Y correction, normal dot >=0.995, matching exterior
grades, no enclosed road, piers, bridge section or overlapping neighbouring road.
It fits a compact C1 least-squares profile over multiple nodes while preserving
interval endpoints and tangent intent. The kernel's `adjustElevationSeam`
primitive checks source Y values, interior indices, finite deltas, grade and
grade-break limits. Safe CLI repairs additionally check exact non-Y equality,
semantic diff, local validation, follow-up seam metrics and source-byte digest.
They preserve authored optional metadata and save atomically. No eligible safe
candidate means no map write/version change. Source values in receipts allow
reviewed restoration; the kernel intentionally rejects recreating a bad spike.

`LIKELY_FIX` (shared/split/merge/ramp pavement) and `MANUAL_REVIEW` (uncertain
reference, changing layer, complex overlap, grade-only crest/sag) are never
batch-repaired. Inspect their profiles/structures, submit local Y operations via
the usual kernel preview/diff/apply, then revalidate support. A scan is a
sampled geometric audit, not an exhaustive vehicle driving proof or clearance
repairer. `node scripts/run-elevation-seam-selftests.mjs` is the focused CLI and
kernel selftest; `node scripts/run-elevation-seam-fixture.mjs` replays the saved
City Main incident using the current runtime/contact system.

For individually reviewed profiles, `repairPavementProfile` accepts a complete
station/before/after receipt, inserts vertical knots along the original XZ
polyline and checks stale values, correction bounds, grade and grade breaks.
It retains every original XZ node. Changed endpoints require exact linked-end
agreement or explicit junction datum ownership. This command does not expand
the automatic safe-only eligibility.

Two opt-in corrections address proved pavement representation problems:
`setPavementSurface` selects the existing visual edge-chain ribbon as physical
support on graded bends; `setJunctionLanding` limits a selected junction's
ownership reach to 8m. The latter rebuilds that junction's derived footprint
and requires a compatible reviewed approach landing. `setJunctionHeightDatum`
allows a separately reviewed hub correction of at most 5cm. These are explicit
structural exceptions, never blanket conversions of ordinary roads/junctions.

`setJunctionLanding` accepts `enabled:false` to restore legacy ownership when a
constrained landing fails actual contact validation.

`node scripts/run-pavement-profile-regression.mjs` runs five short actual
contact regressions against the saved v481 baseline and current source. Cropped
fixtures retain full-map compiled junction footprints through `CityRuntimeData`;
reloading a crop would otherwise derive different junction approach reaches.
The complete v484 review, per-region profiles, conclusions and remaining
uncertainties are in `artifacts/map-elevation-seam-audit/REPORT.md`.
