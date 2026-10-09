# Cruise Control + Rear Parking Proximity V1

## Confirmed control-chain faults

The existing controller already had a PI integral. Driver input was merged with `max`, the cruise command reached VehicleDynamics, speed error was in m/s throughout, and normal asphalt TCS did not impose a persistent torque cut.

Two command-chain problems were confirmed:

1. SET with the accelerator released initialized cruise to the fixed 0.12 feed-forward instead of retaining the current actuator throttle. In the baseline executive sedan ECO trace, the actuator was around 0.48 when the requested throttle was cut to 0.12. Speed fell from about 80 to 74.84 km/h at 10 seconds; the existing PI recovered later.
2. VehicleDynamics treated the merged cruise command as a driver pedal and applied the drive-mode exponent again. ECO weakened the actuator request and SPORT amplified it.

The baseline 60-second NORMAL tests passed. Indefinite speed decay was not reproduced in that baseline; the confirmed command discontinuity and shaping errors are fixed, and extended acceptance now checks the complete contact path for steady speed loss.

## Exact fix

SET initializes the existing integral and output from the current powertrain throttle. The driver pedal remains `input.throttle`, while cruise supplies `input.cruiseThrottle` in actuator units. VehicleDynamics applies the drive-mode curve only to the pedal, then selects the maximum of shaped driver demand and cruise demand before the ordinary Powertrain/Transmission path.

TCS torque limiting and ESC braking retain their existing authority. Existing PI gains are unchanged. Integral clamp, conditional anti-windup, output clamp, output slew, cancellation reset, and P/N/R/powertrain safety exits remain. Reused input objects also have their assistance requests cleared on cancellation. Driver override compares demands in the same actuator units and release uses bounded slew.

No vehicle-specific compensation, force calibration, transmission behavior, collision response, or direct speed locking was added.

## Cruise acceptance

48 runs across eight cruise-equipped catalog vehicles, including ECO and SPORT on vehicles with drive modes. Each run holds cruise for 180 simulated seconds at 120 Hz, using real VehicleDynamics and VehicleContactSystem on flat dry asphalt. NORMAL cases initialize a physical road-speed state; ECO/SPORT cases accelerate from rest through the real drivetrain before SET. No speed is assigned during the cruise loop.

The last 30 seconds are evaluated for minimum/maximum speed and drift between the first/last 10-second averages. Every window stays within ±1 km/h and drift is below 0.2 km/h.

| Requested speed | Cases | Observed steady speed range (km/h) | Maximum error against captured SET (km/h) |
| --- | ---: | ---: | ---: |
| 60 | 12 | 59.9972–60.0175 | 0.01292 |
| 80 | 12 | 79.9978–80.0307 | 0.01273 |
| 100 | 12 | 99.9990–100.0267 | 0.00097 |
| 120 | 12 | 119.99994–120.00810 | 0.00007 |

Additional checks cover uphill compensation, driver override/recovery, downhill service brake requests, brake cancellation, P/N/R, propulsion loss, integral saturation and TCS anti-windup. Direct Powertrain-boundary checks verify cruise demand survives all drive-mode curves unchanged and greater driver demand wins arbitration.

## Rear proximity

The old 360-degree nearest-obstacle field and reverse text are removed. Both HUD and supported instrument displays consume the same five-zone rear result: LEFT_CORNER, LEFT, CENTER, RIGHT, RIGHT_CORNER. Each zone has detected, distanceM and severity; the result also has nearestZone and nearestDistanceM.

Three rear-facing trapezoids start at local +Z = vehicle length / 2, cover the full bumper width, and expand 0.45 m outward on each side over 3 m. Short rear-corner regions start at the bumper corners and have a 1.8 m radial range. Sensor positions and regions are transformed from vehicle-local to world space. Existing static OBB collider surfaces are clipped against those regions; distance is from the virtual bumper sensor to the clipped obstacle surface, not vehicle origin to collider center. Vertical filtering excludes obstacles outside the vehicle sensor height band.

Severity thresholds are NONE >2.5 m, FAR 1.5–2.5 m, CAUTION 0.8–1.5 m, NEAR 0.4–0.8 m, CRITICAL <0.4 m. Five visual cells illuminate according to severity, with nearest direction plus distance. R activates the result; leaving R clears every zone and nearest result. Existing simple parking chimes now consume the rear distance. No new audio framework or continuous warning was introduced.

The detector reuses `ground.colliders`; forward obstacle querying remains unchanged. Maps, parking cameras, surround view, collision and R transmission behavior are unchanged.

## Validation

- `pnpm run typecheck`: passed.
- Relevant controller, rear parking, SUV display and long-duration cruise selftests: passed.
- Rear parking: 27 assertions covering behind/left/right, front/door exclusion, independent zones and nearest result, 90/180-degree rotation, bumper distance, range limits, rotated walls, overlap and leaving R.
- SUV parking display: direction and distance rendered; existing page clipping/layout checks passed.
- `pnpm run selftest`: passed, including vehicle/platform and powertrain checks.
- `pnpm run selftest:vehicles`: passed for all nine catalog descriptors.
- `pnpm run build`: passed; checkpoint publication updated the playable `dist/index.html` and hashed assets. Full build output is saved in `build-results.txt`. Vite emitted only the existing non-blocking large-chunk warning.

Raw results: `core-results.json`, `relevant-results.json`, `vehicle-results.json`.

## Source files changed by this task

- `src/vehicle/control/CruiseControlController.ts`
- `src/vehicle/control/CruiseControlController.selftest.ts`
- `src/input/VehicleInputState.ts`
- `src/vehicle/physics/VehicleDynamics.ts`
- `src/vehicle/physics/VehicleExperience.selftest.ts`
- `src/vehicle/control/RearParkingProximity.ts` (new)
- `src/vehicle/control/RearParkingProximity.selftest.ts` (new)
- `src/game/DrivingGame.ts`
- `src/vehicle/visual/ExecutiveDisplayContext.ts`
- `src/vehicle/visual/InstrumentCluster.ts`
- `src/vehicle/visual/SuvInstrumentCluster.selftest.ts`
- `src/ui/Hud.ts`
- `src/styles.css`
- `scripts/run-core-selftests.ts`
- `scripts/run-cruise-parking-selftests.ts` (new)

Pre-existing workspace changes were preserved. Subjective driving and visual evaluation remain with the user.
