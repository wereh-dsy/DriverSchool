# DriverGame — Agent Instructions

## Project

DriverGame is a browser-based 3D driving simulator built with
TypeScript, Three.js, Vite and pnpm.

- Physics: fixed 120 Hz timestep.
- Units: SI (meters, m/s, radians internally).
- Coordinates: +X right, +Y up, -Z forward.
- Current source code is the source of truth.
- README descriptions may lag behind implemented features.
- Current architecture snapshot: `docs/CURRENT_CODE_CONTEXT.md`.
- Copyable Chat guidance: `docs/CHAT_HANDOFF.md`.
- Review findings and validation baseline: `docs/CODE_REVIEW_2026-10-12.md`.
- Historical reports in the root and `artifacts/` describe their own revision,
  not necessarily the current implementation.

## Architecture

- `src/game/`: Main game loop and system orchestration.
- `src/vehicle/config/`: Vehicle physics configurations.
- `src/vehicle/VehicleCatalog.ts`: Vehicle registration.
- `src/vehicle/physics/`: Engine, wheels, tyres, chassis,
  suspension, collision and driving aids.
- `src/vehicle/powertrain/`: Powertrain boundary, ICEPowertrain and
  ElectricPowertrain; ICE startup/Start-Stop, battery, drive units, inverter,
  shared EV power budgeting, thermal state and Launch Control belong here.
- `src/vehicle/transmission/`: MT, AT, DCT, CVT, fixed EV reduction and
  EV two-speed transmission. PRND is separate from physical gear/ratio.
- `src/vehicle/control/`: Lighting, cruise, LDW/LKA/LCC, EPB, Auto Hold,
  TripComputer and proximity sensing.
- `src/vehicle/SharedVehicleData.ts`: Shared lane/navigation/proximity/TPMS
  data borrowed by display adapters; do not create per-skin sensor systems.
- `src/vehicle/TPMSState.ts`: Sensor boundary over physical tyre state.
- `src/vehicle/VehicleLoadingLifecycle.ts`: Staged vehicle loading/warmup.
- `src/vehicle/feedback/`: Vehicle feedback.
- `src/vehicle/visual/`: Vehicle body, cockpit and instruments.
- `src/camera/`: Driver camera and mirror reflections.
- `src/input/`: Keyboard, gamepad and haptics.
- `src/world/`: Driving maps and environments.
- `src/world/navigation/`: Logical road network and lane observation.
- `src/world/regional/`: Regional terrain, streaming, highway topology,
  markings and signs, built on the City map contract.
- `src/world/city/`: City data/runtime/API/presets; read its `AGENT_GUIDE.md`
  for map authoring. Menu `city-main` loads `regional/regional-main.json`;
  CLI alias `city-main` resolves to `city/maps/city-main.json`. For the menu
  map, pass the explicit regional JSON path to map commands.
- `src/editor/`: City map editor, history, import/export and browser drafts.
- `src/audio/`: Synthesized ICE/EV audio and lane departure warning sound.
- `src/ui/`: HUD, settings and menus.
- `scripts/`: Build and validation tools.

## Working Rules

1. Read only files relevant to the current task.
   Follow dependencies when necessary; do not scan the entire
   repository by default. A user-requested whole-project review permits a
   project-wide inventory and cross-system inspection.

2. Modify only what the user explicitly requests.
   Do not make unrelated changes, refactors or improvements.

3. Preserve existing behavior unless modification is required
   by the task.

4. Prefer existing implementations, interfaces and configuration
   fields. Avoid unnecessary abstraction or duplicate systems.

5. Keep vehicle-specific behavior configurable.
   Avoid hardcoding behavior based on vehicle names.

6. Maintain separation between physics, visual rendering,
   input and game orchestration.

7. Preserve compatibility with existing vehicles, transmissions,
   maps, controls and settings.

8. Keep VehicleDimensions, visual geometry, physical wheel
   positions, collision bounds and mirror geometry consistent.

9. Keep the 120 Hz physics loop lightweight.
   Avoid unnecessary allocations and expensive calculations.

10. Do not add dependencies or expand functionality without
    explicit permission.

11. Do not commit, push, reset or discard unrelated changes
    unless explicitly instructed.

## Vehicle System Contracts

- VehicleCapabilities describes support only. Structural capabilities derive
  from installed config/topology. Never branch on vehicleId for functionality;
  subsystem calibration stays in subsystem config. Presentation profiles must
  not determine physics topology.
- VehicleDynamics uses the Powertrain abstraction with ICEPowertrain and
  ElectricPowertrain. Generic snapshots must allow absent ICE telemetry;
  EVs do not install Engine, FuelSystem or Clutch. Keep new combustion-specific
  logic out of chassis orchestration. EV physics uses per-axle drive units,
  not a visual profile or an artificial ICE AWD substitute.
- Assistance has three layers: capability, persistent user preferences, and
  runtime driving functions. ABS, TCS, ESC, Auto Hold and Start/Stop use
  capability AND preference; unsupported settings are unavailable. EBD remains
  built-in in the ordinary UI. Cruise uses runtime SET/CANCEL, not a persistent
  ON/OFF preference. LKA/LCC already use LateralAssistController with persistent
  preferences and runtime LCC request/cancel. ACC and BSD are unsupported.
  LaneAssistState is currently a separate selection/display state: gamepad Y
  cycles OFF/LDW/LKA/LCC, but does not request LCC or enable/disable steering.
  Do not assume its OFF label gates LateralAssistController.
- Aero lift/downforce enters separate axle suspension loads and tyre normal
  loads. Tyre differences use TireConfig calibration and surface conditions;
  do not add artificial aerodynamic grip multipliers or tyre-width grip rules.
- All assisted service braking goes through BrakeTorqueCoordinator, with ABS
  retaining final modulation authority. Auto Hold uses physical brake torque.
  Driving aids must not overwrite wheel torque, vehicle speed or vehicle pose.
- EV regenerative torque is physical motor torque. Preserve same-step ABS
  regeneration limits and hydraulic brake blending. Multiple motors share one
  BatteryPack charge/discharge budget, including losses and auxiliary power;
  do not give each axle the full pack budget. Power is W; energy is kWh.
- Lateral assistance consumes logical LaneObservation, requests bounded steering
  through the normal input/steering path, and yields to driver override/invalid
  lanes. It does not provide vision sensing, routing or longitudinal ACC.
- TyreThermalPressureSystem accumulates work at 120 Hz and integrates at 20 Hz.
  TPMS samples at 2 Hz and displays gauge pressure in kPa. Pressure modifies
  rolling resistance/stiffness; there is no temperature-dependent peak-grip,
  wear, leakage or damage model. Do not invent telemetry in display code.
- Air suspension changes rest geometry smoothly, preserving wheel/chassis and
  collision geometry. Adaptive damping changes existing dampers smoothly.
  AT creep uses the converter; DCT creep uses clutch engagement and slip.
- Auto Stop is distinct from ignition off: vehicleOperational can remain true
  while driveAvailable is false. Auto Hold must retain support until propulsion
  returns. Cruise controls through normal powertrain and brake request paths.
- Trip distance uses abs(speed) * simulation dt, including reverse and coast;
  never use pose differences. Fuel usage comes from FuelSystem. Persist vehicle
  odometer/trips at low-frequency checkpoints and lifecycle saves, not 120 Hz.
- SharedVehicleData owns map/observation resources; displays borrow them.
  VehicleAssetRegistry owns shared immutable geometry/static resources;
  each VehicleVisual owns mutable materials, displays and instance state.
  Dispose instances before the registry, and keep asynchronous loading gated
  until warmup completes or a visible failure is reported.
- City visual streaming must not remove logical road topology, physical
  surfaces or colliders. Preserve explicit XYZ endpoint links, support-layer
  height selection, junction pavement and marking ownership. Regional service
  metadata does not implement refuelling or charging interactions.
- Browser storage is origin-specific and optional. Preserve stable vehicle/map
  IDs and storage schemas. Settings suppress driver commands but do not fully
  pause physics; lap timing and assistance have separate suspension gates.

## Validation and Build

- Ensure code correctness and proper integration.
- After completing any code modification, always run `pnpm run build`.
- The build must complete successfully and update the playable game.
- Do not stop after typecheck or selftest alone.
- Fix build errors caused by the current task.
- Run relevant tests first; substantial vehicle-system work also requires full
  core and vehicle/platform validation before the final playable build.
- `build` runs typecheck + `scripts/run-core-selftests.ts` + staged Vite publish;
  it does not run every standalone test runner. EV V2, tyre/TPMS, newer cockpit,
  lane assistance, loading and regional changes need their relevant standalone
  checks too. See the context document for entry points.
- Do not weaken assertions, skip failed checks, use `-BasicValidation`, or replace
  the normal build with `vite build` just to report success. A reduced validation
  run requires explicit user instruction. Report pre-existing failures separately
  and fix only errors caused by the authorized task.
- After documentation-only work, check links and source consistency. If build or
  tests are run, record actual results, including failures; never claim every
  suite passed based on typecheck or a historical report.
- Do not perform extensive testing, benchmarking or driving
  experience tuning unless explicitly requested.
- The user handles subjective driving and visual evaluation.

## Communication

- Focus on implementation, not lengthy planning.
- Avoid unnecessary explanations and verbose tool output.
- Do not propose or implement unrelated features.
- Keep the final response concise.

Final report:
- Changed files
- Implemented functionality
- Validation result
- Any known remaining issues

Stop when the requested task is complete.
