# Surface Interaction V1 / Mixed Surface Proving Ground

Implemented 2026-10-15. Current source and the recorded targeted results are authoritative; these are engineering calibrations, not measured real-world tyre data.

## Architecture

`DrivingGround → SurfaceSample → four WheelContacts → SurfaceInteraction → WheelRotationSystem / TyreGripModel → forces → VehicleDynamics`.

- [SurfaceProfile](../src/world/SurfaceProfile.ts) owns relative longitudinal/lateral capacity, rolling resistance, wetness, roughness, useful slip scale, peak slip-angle scale, lateral stiffness/response time, longitudinal/lateral post-peak falloff, combined ellipse blend, default depth, firmness, looseness and resistance strength.
- [SurfaceSample](../src/world/SurfaceMaterial.ts) aliases the existing `RoadSurfaceSample`: material/profile, optional depth in **metres**, wetness, height, gradient, normal and grade. Existing grip/rolling aliases remain available. Authored material coefficients can override the shared defaults.
- [WheelContact](../src/vehicle/physics/WheelContact.ts) carries the individual sample, world position and normal. `sampleWheelContacts` accepts a reusable four-wheel buffer; the scene adapter owns that buffer. Map samples must be treated as borrowed read-only data.
- [SurfaceInteraction](../src/vehicle/physics/SurfaceInteraction.ts) owns four reusable responses and a **12 ms** exponential contact filter. New spawns initialise directly; uninterrupted dry asphalt retains exactly its established curve. At 20 m/s the filter travels about 0.24 m per time constant; this is not a broad blended map boundary.
- [WheelRotationSystem](../src/vehicle/physics/WheelRotationSystem.ts) retains the existing implicit wheel torque solve and microsteps. Surface parameters change tyre curves and lateral relaxation, not vehicle velocity or wheel rotation by assignment.
- `VehicleDynamics` only passes contact data, uses the resulting tyre forces/capacities, and sums per-contact soil resistance and its yaw moment. No surface-name branches were added to chassis, ABS, TCS or ESC.

## Surface behaviour

The capacities below are relative to the installed tyre's load-sensitive dry capacity; actual forces also include normal load, existing wet tyre calibration, pressure stiffness and combined slip.

| Surface | Long./lat. capacity | Slip scale | Behaviour |
| --- | --- | --- | --- |
| Dry asphalt | 1.00 / 1.00 | 1.00 | Original tyre equations, combined budget, response and rolling baseline. |
| Wet asphalt | .64 / .60 | .88 | Earlier breakaway, lower cornering/braking limits, stronger post-peak loss; remains well above snow/ice. Authored wetness .65, plus existing tyre wet retention. |
| Grass | .55 / .55 | 1.40 | More rolling resistance, softer/slower lateral response. Wetness remains available per contact for future wet grass. |
| Gravel | .63 / .57 | 1.80 | Broader useful slip, reduced precision, rolling and shallow loose-layer resistance. |
| Packed snow | .34 / .30 | 1.90 | Low grip with a broad useful slip range and slower lateral response; distinct from ice. |
| Fresh snow | .30 / .26 | 2.10 | Packed-snow-like response plus depth-dependent ground work and increased rolling resistance. |
| Ice | .085 / .065 | .65 | Very weak traction/cornering, early locking/spin and substantial shared-budget steering loss under braking. |
| Sand | .48 / .40 | 2.30 | Loose, broad slip, slow lateral response and the strongest depth-dependent resistance. |
| Mud | .27 / .23 | 2.60 | Slipperier than sand, strong drag and steeper post-peak traction loss; excess torque mainly creates wheelspin. |

Existing concrete, shoulders, curbs, compact/loose gravel and dirt map calibrations remain available. Vehicle-specific engine, transmission, steering, suspension, aero and visual calibrations were not changed by this task.

## Soft ground and combined slip

Fresh snow, gravel, sand and mud share **one** soft-ground force function. Approximate resistance is:

`normalLoad × resistanceStrength × (depth / 0.1 m)^0.85 × firmness term × bounded load term × speed term × slip/churning term × pressure term`.

The result is bounded and applied opposite the contact's planar velocity, including lateral motion and reverse. A smooth near-rest gate and per-contact energy bound avoid a numerical impulse or reverse acceleration. It does not deform terrain or model permanent sinkage. Rolling work and soil work are separate; soil displacement is not counted as tyre heat.

Both tyre-force components still pass through the existing common combined-slip projection, including inside the implicit torque solve. V1 special surfaces blend to its friction ellipse; dry asphalt retains the original forgiving tyre budget. Front propulsion therefore consumes front lateral capacity, rear propulsion consumes rear capacity, and AWD only distributes propulsion through its installed topology.

ABS/TCS (and the existing brake-based differential request) use each contact's useful slip range, with the tyre's pressure stiffness accounted for on altered curves. ABS remains independent per wheel with final brake authority. ESC retains its existing observer and current contact-capacity limits. EV regeneration still releases in the same step as ABS and remaining hydraulic demand uses the brake coordinator.

Pressure coupling affects **only additional soft-ground work**: lower physical pressure slightly lowers effective sinkage/resistance, bounded to ±8%. Existing asphalt pressure stiffness/rolling behaviour, 20 Hz thermal integration and 2 Hz TPMS remain intact. There is no inflation gameplay.

## Facility and access

Select **Mixed Surface Proving Ground · 混合路面试验场** in the existing map selector, or open `?ground=mixed-surface-proving-ground`. Stable map ID: `mixed-surface-proving-ground`.

Flat, handcrafted **600 × 460 m** ground, independent of City/Regional:

- Spawn: **x=-200, z=195**, facing -Z. Main dry straight: **360 m**, x=-200, z=210 to -150.
- Seven parallel **24 m wide, 270 m long** lanes share entry z=180: dry x=-150, wet -112, packed snow -74, gravel -36, sand 2, mud 40, fresh snow 78.
- Sand depths **3 / 10 / 22 cm**; mud **2.5 / 8 / 18 cm**; fresh snow **4 / 12 / 25 cm**. Each depth zone is 90 m long and retains the same profile/type.
- Common entry and return aprons join the lanes. Ice access lies at x=155 beyond the return apron.
- Ice skid pad: **84 m diameter**, centre **(155, -215)**.
- Short packed-snow handling loop on the east side includes a broad bend, tighter return and short straight.
- Grass braking/track-off patch: x=104…209, z=230…280.
- Split-μ strip: **130 m**, x=-212…-188, z=-150…-280. Facing -Z, left x<-200 is dry; right x>-200 is ice. It continues directly from the main straight.
- Colours, overhead area labels, depth signs and lane-edge lines identify the engineering zones. No scenery or particles were added.

A prebuilt **16 m cell index** contains 125 authored zone/capsule records. The measured maximum is **11 local candidates** in a cell; queries return cached samples with no temporary allocation or global zone scan. Visual and logical zones share authored geometry/ownership.

In a development server, **F6** opens the existing optional contact diagnostic panel. V1 adds per-wheel depth, estimated load-sensitive friction, slip angle and soft-ground force alongside existing type/slip ratio. These additional rows are removed from the production build; no permanent HUD was added.

## Targeted validation

Reproduce on Windows using existing dependencies:

```powershell
& .\node_modules\.bin\esbuild.CMD scripts/run-surface-interaction-selftests.ts --bundle --platform=node --format=esm --outfile=.tmp-surface-selftests.mjs
node .tmp-surface-selftests.mjs
pnpm run typecheck
pnpm run build -BasicValidation
```

[Recorded results](../artifacts/surface-interaction-v1/targeted-results.json): **six targeted groups passed, 8,499 assertions** (surface 4,803; wheel contact 3,426; wheel rotation 28; thermal/TPMS 61; driver assists 133; ESC/AWD 48). The existing EV V2 standalone check also passed during initial regression validation; the final targeted runner covers real EV split-μ braking directly without rerunning that broader suite.

- Dry longitudinal/lateral curves and combined usage match frozen V0 equations. Explicit dry contacts match the existing implicit dry speed/yaw path within 1e-10.
- Same baseline car, ABS on, braking **20 → 5 m/s**: dry **27.01 m**, wet **31.81 m**, packed snow **54.49 m**, ice **225.64 m**. These are deterministic relative checks, not a full-stop certification or every vehicle's stopping distance.
- Real-map split-μ braking, ESC both off/on: four correct contact samples, independent ABS pressure difference up to **0.960**, asymmetric front force about **3,549 N**, peak yaw rate **0.344 rad/s**, no invalid-state recovery. This check verifies bounded behaviour; it does not claim ESC removes the yaw tendency.
- Same-chassis FWD/RWD/AWD fixture tests confirm actual driven axles. AWD snow speed after one second: **9.31 m/s**, FWD **8.99**, RWD **8.72**, all starting at 8 m/s. Ice neutral braking gives identical **19.15 m/s** results across the three layouts after one second.
- Actual chassis coast tests confirm all three soft-depth sequences increase drag. At equal 10 cm depth, one second from 10 m/s leaves sand at **7.95**, mud **8.63**, fresh snow **8.97 m/s**.
- Mud wheel bench: increasing torque from 800 to 1,800 Nm increases slip **.901 → .962**, while force falls **754 → 742 N**.
- All eight non-dry surfaces retain a bounded shared force budget and lose lateral capacity under power. Snow's initial lateral response is slower than dry.
- Single-motor RWD and dual-motor AWD EV split-μ checks verify same-step ABS regeneration cancellation and remaining hydraulic braking.
- Reverse/near-rest resistance dissipates energy. Sequential dry/snow/sand/ice/mud transitions stay finite; maximum observed yaw-rate step **.0052 rad/s**.
- Existing thermal/TPMS, wheel rotation, contact placement, controller and ESC/AWD checks pass. No full core suite was run, as explicitly requested.

Build: **`pnpm run build -BasicValidation` passed (exit 0)** and published the playable `dist`. Typecheck passed; full core tests were skipped as requested. The published index matches the validated staging index and its referenced assets exist. Vite reports the existing application-size warning (main chunk about 16.03 MB); it did not prevent publication. See [publication verification](../artifacts/surface-interaction-v1/validation.json).

## Changed files and tuning limits

Added: `src/world/SurfaceProfile.ts`, `src/world/surface/MixedSurfaceGround.ts`, `src/vehicle/physics/SurfaceInteraction.ts`, `src/vehicle/physics/SurfaceInteraction.selftest.ts`, `scripts/run-surface-interaction-selftests.ts`, this report, the targeted JSON results and publication verification JSON.

Updated: `src/world/SurfaceMaterial.ts`, `src/world/DrivingGroundCatalog.ts`, `src/world/DrivingGroundCatalog.selftest.ts`, `src/vehicle/physics/{WheelContact,VehicleContactSystem,TyreGripModel,WheelRotationSystem,WheelPhysicsState,DriverAssistSystem,VehicleDynamics}.ts`, `src/game/ContactDebugView.ts`.

Pre-existing worktree changes were retained. No dependencies were added. Remaining work is subjective evaluation of V1 grip, lateral response and resistance calibration using the test facility; there are no measured real-world surface datasets behind these values. The existing simcade chassis limits remain. No aquaplaning, weather system changes, deformation/ruts, tyre wear/puncture or tyre-inflation gameplay was implemented.
