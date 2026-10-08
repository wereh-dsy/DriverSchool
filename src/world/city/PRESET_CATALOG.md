# Production Road Preset Library — V1

Authoring recipes expand to ordinary editable roads, intersections, explicit links, ports and props. Runtime uses the existing builders, sector plans, surface queries and vehicle colliders. No district presets or macro presets were added. Legacy district IDs remain available for compatibility and are not production road recipes.

## Defaults and safety envelope

- Urban local/street lanes: 3.6m. Boulevards and expressway lanes: 3.75m. Ramp traffic lanes: 3.9m.
- Ramp shoulders: left 0.75m + right 1.75m; paved width 6.4m for one lane, 10.3m for two lanes. Lane count excludes shoulders. Signed offsets follow centerline order.
- Divided expressway carriageways use 0.75/1.75m shoulders and a 3.5m central gap. Default mainline width per carriageway is 13.75m (three lanes). Guardrails are 0.25m beyond pavement.
- Default road surface elevation is 8m; deck thickness is 0.65m. Production transitions have flat landings and eased Y profiles, with checks capped at 6% for ordinary roads and 8% for ramps. Default measured grades are listed below.
- Default loop radius is 100m. Legacy radius inputs 40–100m remain accepted; interchange loops clamp to at least 80m and the roundabout ring to at least 60m. The roundabout uses 25km/h approaches; the minimum radius in its approach bends is about 17m at defaults.
- Main/cross lanes: 4 or 6; ramp lanes: 1 or 2. Explicit elevation 5–12m remains accepted for legacy authors; prefer 7–9m and inspect overhead equipment/clearance for lower values.
- Entry/exit use long cubic tangential branches with a 140m merge/diverge region. Diamond uses longer independently eased ramps. Cloverleaf/trumpet outer arcs enclose the loops rather than cutting through them.
- Gore is a simple hatched triangular inner-shoulder refuge over up to 140m. The split between the paved ribbons supplies the separating wedge; this is deliberately not a lane-level engineering model. Merge paint is suppressed inside shared pavement.
- Both visual and physical guardrails split wherever a same-height neighboring road enters their footprint. Piers skip road/shoulder footprints, junctions/crossings and lower ramps with clearance margins, without forcing the nominal 30m spacing.
- Signals are formal junction equipment: incoming arrow → stop line at extent−1m → 3m zebra crossing centered at extent−4.6m → junction → far-side main signal. Head fronts face the served approach; the cantilever reaches toward its lanes.
- Exit placeholder signs stand about 100m before the branch, outside shoulders. Lamps stand beyond sidewalk/pavement and skip junction sight space, other roads, overhead decks and nearby props. Production recipes add no trees or buildings; future trees must clear their full canopy and the junction sight zone.
- Ports reference actual road endpoints and also store XYZ/outward heading. Heading is `atan2(dx, -dz)` in radians: North=0, East=π/2. Directional labels follow world heading after rotation (including diagonal labels), so use returned endpoint IDs/poses rather than assuming catalog-local names remain unchanged.

## Production recipes

Values describe default parameters at position (0,0,0), rotation 0. Footprints are conservative X×Z envelopes in metres; rotated/parameterized stamps require their actual bounds. Paved widths exclude sidewalks. Elevated external ends require continuation or ground access.

| ID / purpose | Footprint | Carriageway layout | Lane / paved widths (m) | Elevation (m) / maximum grade | Connection ports | Recommended use |
| --- | --- | --- | --- | --- | --- | --- |
| `urban_overpass` | 630×1230 | Two-way N/S urban deck over an independent E/W ground street | 3.75,3.6 / 25,14.4 | 0–8 / 3.7% | South Mainline; North Mainline; West Crossroad; East Crossroad | Grade-separated urban crossing; end ramps return the main road to ground. |
| `diamond_interchange` | 1230×1230 | Two N/S one-way carriageways; E/W ground crossroad; four directional ramps | 3.75,3.6,3.9 / 13.75,14.4,6.4 | 0–8 / 4.13% | South Mainline In; North Mainline Out; North Mainline In; South Mainline Out; West Crossroad; East Crossroad | Compact interchange joining the mainline to a local crossroad. |
| `cloverleaf_interchange` | 2070×2070 | Two divided highways; N/S upper layer and E/W ground layer; four outer turns and four loops | 3.75,3.9 / 13.75,10,6.4 | 0–8 / 4.24% | South Mainline In; North Mainline Out; North Mainline In; South Mainline Out; West Crossroad In; East Crossroad Out; East Crossroad In; West Crossroad Out | Broad outer connectors enclosing 80–100m loops; allow a full 2km site. |
| `trumpet_interchange` | 2070×2070 | Divided N/S mainline and eastern terminating divided branch; two direct turns and two loops | 3.75,3.9 / 13.75,10,6.4 | 0–8 / 4.24% | South Mainline In; North Mainline Out; North Mainline In; South Mainline Out; East Branch Out; East Branch In | Broad outer connectors enclosing 80–100m loops; allow a full 2km site. |
| `roundabout` | 500×500 | One-way counterclockwise ring, four separated entry/exit pairs | 3.9 / 6.4 | 0–0 / 0% | North In; North Out; West In; West Out; South In; South Out; East In; East Out | Low-speed roundabout; explicit links at ring entry/exit nodes. |
| `highway_entry` | 125×870 | One northbound carriageway and a ground entry with a long tangent merge | 3.75,3.9 / 13.75,6.4 | 0–8 / 3.66% | South Mainline In; North Mainline Out; South Local Entry | Stamp a simple elevated highway merge. |
| `highway_exit` | 125×870 | One northbound carriageway and a long tangent exit to ground | 3.75,3.9 / 13.75,6.4 | 0–8 / 3.66% | South Mainline In; North Mainline Out; North Local Exit | Stamp a simple elevated highway diverge. |
| `urban_boulevard_straight` | 30×600 | One two-way boulevard, 6 lanes by default | 3.75 / 22.5 | 0–0 / 0% | South; North | Production V1; use exposed endpoint poses to continue roads. |
| `urban_boulevard_curve` | 330×330 | One two-way boulevard, 300m centerline radius | 3.75 / 22.5 | 0–0 / 0% | South; West | Production V1; use exposed endpoint poses to continue roads. |
| `elevated_expressway_straight` | 38×600 | Separate northbound/southbound carriageways, 3 lanes each by default | 3.75 / 13.75 | 8–8 / 0% | South In; North Out; North In; South Out | Production V1; use exposed endpoint poses to continue roads. |
| `elevated_expressway_curve` | 340×340 | Separate concentric carriageways, approximately 300m radius | 3.75 / 13.75 | 8–8 / 0% | South In; West Out; West In; South Out | Production V1; use exposed endpoint poses to continue roads. |
| `signal_cross_6x6` | 470×470 | N/S 6 lanes, E/W 6 lanes, two-way | 3.75 / 22.5 | 0–0 / 0% | North; East; South; West | Production V1; use exposed endpoint poses to continue roads. |
| `signal_cross_6x4` | 470×470 | N/S 6 lanes, E/W 4 lanes, two-way | 3.75,3.6 / 22.5,14.4 | 0–0 / 0% | North; East; South; West | Production V1; use exposed endpoint poses to continue roads. |
| `signal_cross_4x4` | 470×470 | N/S 4 lanes, E/W 4 lanes, two-way | 3.6 / 14.4 | 0–0 / 0% | North; East; South; West | Production V1; use exposed endpoint poses to continue roads. |
| `t_4x2` | 470×250 | E/W 4 lanes and north 2-lane stem, two-way | 3.6 / 7.2,14.4 | 0–0 / 0% | North; East; West | Production V1; use exposed endpoint poses to continue roads. |
| `t_4x4` | 470×250 | E/W 4 lanes and north 4-lane stem, two-way | 3.6 / 14.4 | 0–0 / 0% | North; East; West | Production V1; use exposed endpoint poses to continue roads. |

Machine-readable defaults, footprint, layout and every default port pose are in [presets/catalog.json](presets/catalog.json). Styles are applied once during authoring; existing saved City Alpha/Main roads are not silently widened or rebuilt.

## Validation and driving inspection

`pnpm map validate-presets` checks 19 catalog entries in 152 cardinal-rotation/parameter cases. For the 16 production entries it additionally runs 32 runtime sedan corridor cases (72,273 sampled positions), checking four wheel supports and the real guardrail/pier/prop colliders. Geometry checks cover width/shoulders, curvature, grade, short samples, branch direction/heading, unconnected overlaps/self-crossings, height clearance, pier avoidance and roadside props. Eight corrupted fixtures prove rejection of unsafe widths, grade, curvature, props, port poses/headings and overlapping ramps. These checks do not replace human driving/visual evaluation.

`pnpm map validate preset-showcase` includes production geometry checks through `environment.metadata.productionGeometry="true"`. Existing maps keep their compatibility validation; reserved ports and separate components are visible warnings.

## Preset Showcase

Choose **Preset Showcase** in the game map menu, or open `?city=preset-showcase`. It contains all 16 production entries in separate 3400m grid cells, without buildings/trees. All upper external ports have 400m eased ground access roads; each specimen has an authored on-road spawn. Use `?city=preset-showcase&preset=diamond_interchange` (or another production ID) to start directly at that specimen. Reload after changing the URL. Cells are intentionally independent; the open ground permits travel between specimens.

| Specimen | Cell centre X, Z (m) |
| --- | --- |
| `urban_overpass` | 0, 0 |
| `diamond_interchange` | 3400, 0 |
| `cloverleaf_interchange` | 6800, 0 |
| `trumpet_interchange` | 10200, 0 |
| `roundabout` | 0, 3400 |
| `highway_entry` | 3400, 3400 |
| `highway_exit` | 6800, 3400 |
| `urban_boulevard_straight` | 10200, 3400 |
| `urban_boulevard_curve` | 0, 6800 |
| `elevated_expressway_straight` | 3400, 6800 |
| `elevated_expressway_curve` | 6800, 6800 |
| `signal_cross_6x6` | 10200, 6800 |
| `signal_cross_6x4` | 0, 10200 |
| `signal_cross_4x4` | 3400, 10200 |
| `t_4x2` | 6800, 10200 |
| `t_4x4` | 10200, 10200 |

Regenerate with `node scripts/build-preset-showcase.mjs`; validate using `pnpm map validate preset-showcase`. The map has 133 roads, 16 specimen spawns, formal signal junctions and only minimal exit signs. It is a developer driving fixture, not a City Main expansion.

For production authoring, call `placePreset`, use returned endpoint poses to continue roads, validate, then build. If a recipe lacks the needed geometry/topology, report the missing capability instead of improvising a complex interchange.
