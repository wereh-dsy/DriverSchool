# City Main pavement elevation seam audit

Source: `src/world/regional/regional-main.json`, version 479 → 481. The restored pre-edit full-map digest exactly matches the initial read-only CLI capture (06962886c086018e4e0713541967cad64d0bede2326f29d99a3291f4d81e1bc3).

## Scan and repair totals

| Metric | Before | After |
|---|---:|---:|
| Candidates (including ignored layers) | 2124 | 2125 |
| SAFE_AUTO_FIX | 0 | 0 |
| LIKELY_FIX | 200 | 201 |
| MANUAL_REVIEW | 800 | 800 |
| IGNORE_GRADE_SEPARATED | 1124 | 1124 |
| Automatic fixes | — | 0 |
| Reviewed local regions repaired | — | 1 |

Full scan: 2944 roads, 111711 runtime segments, 176974 segment AABB candidate pairs, 2347951 accepted probes. Detector time 1456ms on this machine (not a benchmark). No all-road-pairs scan. Counts include grade-only profile cues and subdivided overlap runs; they are not counts of confirmed driving failures.

## Real incident near (2216,2140)

Automatically detected as LIKELY_FIX: opposing Inner Ring carriageways share pavement, with normalDot >0.999999 and inconsistent longitudinal profiles. The common reference is the midpoint longitudinal spine projected normally onto both carriageways, with quintic fades back to unchanged source Y outside Z=2040…2240. Both endpoint XYZ, every XZ node, road ID, width, lanes, links, junctions, signs, signals and other objects are byte-for-byte semantically unchanged. ring-cw-2-split-4-split: 38 interior nodes, max Y change 0.0720m; ring-ccw-1-split-split-split-split-section: 38 interior nodes, max Y change 0.0721m. The two transaction receipts/diffs/local validations are retained; the first mean-height pass was refined to remove the small lateral plane offset.

Runtime shared-pavement probe: 2176 pair samples, max mismatch **142.651mm → 0.216mm**. Maximum grade unchanged (0.991%, 1.021%). Maximum local grade break remains below 0.081 percentage points; no new sharp grade point. The offline report threshold is 40mm; its zero local issues does not mean mathematically identical planes.

Two 16m, 20km/h physical contact replays, approximately 2.88s each: baseline eastbound reproduces a 0.132317m surface switch and four airborne transitions. After repair both directions have 4 supported wheels, zero heightJump events, zero grounded→airborne transitions and zero rejected support samples; max switch steps 0.042mm, 0.096mm. Solid barriers are disabled to isolate pavement support. Before/after Black Box exports are included; this is a controlled local contact regression, not a free-driving/navigation or whole-map guarantee. Existing vehicle working changes were used unchanged.

## Remaining complex candidates

1001 retained candidates received conservative per-candidate source/topology/structure screening; evidence and decisions are in manual-review.json. Only the real fixture received runtime replay. Dispositions: DEFER_LAYER_OR_LONG_PROFILE=171; DEFER_STRUCTURE_OR_MERGE=201; RETAIN_GRADE_INTENT=610; DEFER_CONNECTION_CONSTRAINT=18; DEFER_BEND_PROFILE=1. No additional region had a proved short reference profile and boundary grades satisfying the strict safe policy. Long ramps, multi-road junction pavements, enclosed/deck transitions and graded bends remain candidates for separate local review. Grade-only cues are retained, without claiming their crests/sags are defects. The remaining Inner Ring overlap outside the repaired incident region is explicitly retained.

Largest remaining candidates (Y offsets across footprints can represent layers, transition envelopes or real defects; do not flatten them automatically):

| Roads | Max delta (m) | Category | Relation |
|---|---:|---|---|
| v4-access-5 / v4-access-4-c91 | 5.004 | MANUAL_REVIEW | linked-away-from-endpoint |
| system-central:E-to-S-semi / v911-plaza-east-wb | 4.529 | MANUAL_REVIEW | unlinked-overlap |
| v8-gongren-street-split-split-split-m91 / direction-inner-sw-section-section | 4.473 | MANUAL_REVIEW | junction:urban-junction-181 |
| system-central:E-to-S-semi / v911-plaza-south-sb | 4.455 | MANUAL_REVIEW | unlinked-overlap |
| system-central:N-to-E-semi / v911-plaza-north-sb | 4.436 | MANUAL_REVIEW | unlinked-overlap |
| system-central:W-to-N-semi / v911-plaza-north-nb | 4.382 | MANUAL_REVIEW | unlinked-overlap |
| ring-cw-1-split-3-split-split-split / v8-ring-north:on--1 | 4.379 | MANUAL_REVIEW | unlinked-overlap |
| system-central:E-to-S-semi / v911-plaza-south-sb | 4.368 | MANUAL_REVIEW | unlinked-overlap |
| system-central:S-to-W-semi / v91-ew-0-b-8 | 4.319 | MANUAL_REVIEW | unlinked-overlap |
| system-central:N-to-E-semi / v911-plaza-east-eb | 4.300 | MANUAL_REVIEW | unlinked-overlap |
| intercity-wb / v9-newcity-eight-split-split-split-split-split | 4.294 | MANUAL_REVIEW | unlinked-overlap |
| system-north:S-to-W-star / ring-ccw-3-split-3-split-3 | 4.281 | MANUAL_REVIEW | unlinked-overlap |
| system-central:S-to-W-semi / v911-plaza-south-nb | 4.216 | MANUAL_REVIEW | unlinked-overlap |
| system-central:S-to-W-semi / v911-plaza-west-wb | 4.199 | MANUAL_REVIEW | unlinked-overlap |
| ring-cw-1-split-3-split-split / v8-ring-north:off--1 | 4.156 | MANUAL_REVIEW | unlinked-overlap |

## Validation

Seam CLI selftest (33 checks), fixture regression, exact authored non-Y invariant, semantic diff and local validation passed. Local errors 0 → 0; warnings 2 → 2. Targeted legacy diagnose: 0 errors / 5 warnings → 0 / 5; new issues 0. Profile diagnose 0 → 0. Topology and endpoint XYZ are unchanged; full navigation/core/vehicle/editor suites were not run per the requested scope.

Build: **passed**. Executed `pnpm run build -BasicValidation` exactly once: typecheck + staged production build; core selftests skipped as requested. Dist published and verified at map version 481; both edited road profiles exactly match source. Existing large-chunk size warning only. See build.log and build-verification.json.

## CLI

`node scripts/mapctl.mjs diagnose-elevation-seams regional-main --out report.json`

`node scripts/mapctl.mjs repair-elevation-seams regional-main --safe-only` previews; add `--apply` for explicit application. No eligible safe candidates means no file/version write. Receipts retain original Y values. See docs/MAPCTL_ENGINEERING.md for thresholds, exact invariants, near-footprint sampling and limitations.

## Candidate partition accounting

The original continuous Inner Ring candidate becomes two retained flanks separated by the repaired window; one extra run, no new road pair or higher pair maximum. New road pairs: 0; worsened road-pair maxima: 0. Candidate count 2124 → 2125 therefore does not represent an added defect.
