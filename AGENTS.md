# DriverGame — Agent Instructions

## Project

DriverGame is a browser-based 3D driving simulator built with
TypeScript, Three.js, Vite and pnpm.

- Physics: fixed 120 Hz timestep.
- Units: SI (meters, m/s, radians internally).
- Coordinates: +X right, +Y up, -Z forward.
- Current source code is the source of truth.
- README descriptions may lag behind implemented features.

## Architecture

- `src/game/`: Main game loop and system orchestration.
- `src/vehicle/config/`: Vehicle physics configurations.
- `src/vehicle/VehicleCatalog.ts`: Vehicle registration.
- `src/vehicle/physics/`: Engine, wheels, tyres, chassis,
  suspension, collision and driving aids.
- `src/vehicle/transmission/`: MT, AT, DCT and CVT.
- `src/vehicle/control/`: Lighting and cruise control.
- `src/vehicle/feedback/`: Vehicle feedback.
- `src/vehicle/visual/`: Vehicle body, cockpit and instruments.
- `src/camera/`: Driver camera and mirror reflections.
- `src/input/`: Keyboard, gamepad and haptics.
- `src/world/`: Driving maps and environments.
- `src/ui/`: HUD, settings and menus.
- `scripts/`: Build and validation tools.

## Working Rules

1. Read only files relevant to the current task.
   Follow dependencies when necessary; do not scan the entire
   repository by default.

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

## Validation and Build

- Ensure code correctness and proper integration.
- After completing any code modification, always run `pnpm run build`.
- The build must complete successfully and update the playable game.
- Do not stop after typecheck or selftest alone.
- Fix build errors caused by the current task.
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