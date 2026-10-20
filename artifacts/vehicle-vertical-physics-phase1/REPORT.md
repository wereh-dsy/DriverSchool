# Vehicle Vertical Physics — Phase 1 (Vertical Foundation)

## Changed architecture

### New authoritative vertical state

`VehicleDynamics` now owns real heave state:

```text
chassisY              world body-origin height (axle-midpoint datum), m
verticalVelocity      integrated heave velocity, m/s
verticalAcceleration  force balance / mass, m/s² (diagnostic)
groundedWheels        current 0..4 contact count
```

`chassisY` is the physical body height. `staticBodyOffsetY` remains a pure
model-origin offset; it is added only once at the render/collider boundary.
`chassisBodyPose()` no longer reads the road plane or the legacy ride offset.

Initialization is the only snap: `syncWheelContacts()` (or the first
`stepFixed()` that receives contacts) samples the support plane and sets
`chassisY = mean(contact heights)`, `verticalVelocity = 0`. Ordinary steps never
write a ground target into `chassisY`.

### Contact evaluation

For each wheel, using the current chassis height, body attitude (terrain pitch
+ roll + spring pitch/roll), wheel attachment point, wheel radius, suspension
travel and the sampled surface height:

```text
requiredCompression =
  staticLoad / springRate
  + rideHeightOffset
  + surfaceHeight
  - chassisY
  + wheel.z * pitch
  - wheel.x * roll

grounded = requiredCompression >= minimumCompression
```

When the required compression is below the minimum travel limit the wheel is
airborne. Its suspension is evaluated at full extension, support force is zero
and it can no longer receive tyre load or road force. When the surface is above
the bump-stop limit the wheel stays grounded and a numerical penetration
correction lifts the chassis by the minimum required amount.

### Suspension support enters the chassis

`SuspensionSystem.updateVertical()` computes per-wheel:

```text
springForce = springRate * compression
damperForce = damperRate * compressionVelocity
bumpStopForce = progressive bump stop
supportForce = grounded ? max(0, spring + damper + bumpStop) : 0
```

`VehicleDynamics` integrates:

```text
Fvertical = sum(supportForce) + aeroVerticalForces - mass * gravity
verticalAcceleration = Fvertical / mass
verticalVelocity += verticalAcceleration * dt
chassisY += verticalVelocity * dt
```

The same 120 Hz fixed step and existing substep policy are used. Damper rate is
clamped, penetration correction is position-minimal and only removes downward
velocity when the bump stop is actually overrun.

The existing load-estimation integrator remains in `SuspensionSystem.update()`
for spring-driven pitch/roll, anti-roll and tyre-load estimation. That path is
now contact-gated:

```text
airborne -> normalLoad = 0, targetLoad = 0, no ground residual
```

The 8% static floor still applies to grounded wheels only. Supported-weight
normalization runs as before, then airborne wheels are zeroed afterwards, so
normalization cannot re-add load to a wheel that is off the ground.

## Removed / bypassed ground-lock paths

| Old path | Status now |
|---|---|
| `chassisBodyPose()` = mean road height + offsets | Removed. Pose uses `chassisY + staticBodyOffsetY` only. |
| `VehicleContactSystem` resampling and `syncWheelContacts()` placing the car on the road | Still samples contact geometry, but only initializes `chassisY` on spawn/respawn. |
| `syncWheelContacts()` wheel Y = `height + wheelRadius` | Replaced by suspension geometry: `chassisY + wheelCentreOffsetY` (grounded wheel resolves to surface + radius; airborne wheel hangs at full extension). |
| `SuspensionSystem` ride offset driving body Y | `rideOffset` is retained only as load-model instrumentation and is not added to the body transform, avoiding double heave. |
| `chassis.verticalVelocity` as ride-offset derivative | Vehicle snapshot now exposes the real integrated heave velocity. |

Respawn/teleport are the explicit exceptions: `reset()`, `setPose()` and the
first contact sync re-seat the car and clear heave velocity. Collision
corrections remain horizontal and do not gain a vertical snap.

## Contact semantics

| grounded wheels | Supported | Behaviour |
|---|---|---|
| 4 | Yes | Normal spring/damper support; existing load model and pitch/roll. |
| 3 | Yes | Airborne wheel has `Fz = Fx = Fy = 0`; remaining springs support heave. |
| 2 | Yes | Partial support; no forced minimum wheel count. |
| 1 | Yes | One corner supports the car; heave stays continuous. |
| 0 | Yes | Full airborne: gravity only, all tyre road forces zero, ballistic Y. |

No path forces `groundedWheelCount >= 2` or re-attaches a wheel to the road.

## Tire coupling

For `grounded == false`:

```text
normalLoad = 0
longitudinalForce = 0
lateralForce = 0
drive/brake/handbrake contact reactions = 0
rolling resistance = 0
soft-surface resistance = 0
```

The wheel rotational state still spins freely in air; brake and drive torque
act on the free wheel inertia but are not transmitted to the chassis through a
non-existent contact patch. The static-hill hold solver is disabled unless all
four wheels are grounded.

The 8% floor is retained only for grounded wheels. Supported-weight
normalization may still distribute load among the grounded corners; airborne
corners are zeroed after normalization.

## Compatibility

Unchanged and still working:

- longitudinal / lateral / yaw dynamics and the existing tyre slip model
- steering, drivetrain, transmission, clutch, differential and AWD
- brakes, ABS, ESC, TCS, EBD, Auto Hold and EPB
- current spring-driven pitch/roll visual model and anti-roll architecture
- surface sampling, collision architecture and map contracts
- camera, mirrors and cockpit attached to the vehicle root

`pitch` and `roll` are still kinematic/load-model attitudes; Phase 1 only
removes their control over vertical position.

## Tests

`VerticalDynamics.selftest.ts` (78 assertions):

- **A — flat rest:** 4 grounded, `|v| < 0.02 m/s`, height deviation `< 0.01 m`
  over 5 s, no heave oscillation.
- **B — free fall:** ground 20 m below reach; 0 grounded, `v < 0`, `chassisY`
  falls, vertical acceleration = gravity, all wheel `Fz/Fx/Fy = 0`.
- **C — landing:** 0.4 m drop; airborne → contact → compression → rebound →
  settle at the new surface. Maximum single-step height change `< 0.2 m` (no
  teleport).
- **D — surface drop-away:** front axle airborne, rear axle supporting, front
  normal load zero.
- **E — single-wheel drop:** 3 grounded, dropped wheel has zero load and zero
  road force, remaining wheels keep positive load.

Supporting checks run directly:

- `runVehicleLayoutSelfTest()`: 492 assertions, including final wheel contact
  height on a uniform slope.
- Synthetic 10% uphill launch (`sport-coupe`, rear-drive): 4 grounded wheels,
  climbs, no false airborne state.
- TypeScript project typecheck passes.

Pre-existing core-suite failures unrelated to this change (reproduced on a
clean `HEAD` worktree):

- `Suspension stance: bmw-530li-g38: frontLeft body/trim clear tyre crown at
  full bump`
- `Vehicle lighting: all six executive windows have moderate, two-sided tint`

`pnpm run build` therefore stops in the pre-existing stance self-test before
the Vite publish step; `dist` is not republished by this run.

Actual validation run:

```text
pnpm run typecheck   pass
core selftests       pass (exit 0) with only the two pre-existing visual
                     entries above excluded
pnpm run build       typecheck pass, core selftests stop at pre-existing
                     BMW stance assertion; Vite publish not reached
```

The full core run included `verticalDynamics` (78 assertions, pass),
`fourWheelPhysics` (20,888 assertions, pass), `mapContactAcceptance` (37,431
assertions, pass), plus circuit/Tsukuba/Mountain vehicle contact loops.

## Known Phase 1 limitations

- Pitch and roll are **not** angular rigid-body dynamics. No pitch/roll
  inertia, angular velocity or torque integration.
- No unsprung mass, wheel-hop or tyre-carcass model. Suspension compression is
  derived from chassis height and road reach.
- Airborne attitude is retained/relaxed by the existing load model; it is not
  integrated as a free rigid body.
- Anti-roll still uses the existing load model and is deliberately excluded
  from heave force (its equal-and-opposite axle forces cancel vertically).
- Camera heave filtering was not added; the camera follows the new chassis Y.
- Collision response remains planar; penetration correction is a vertical
  numerical safety mechanism, not a general collision solver.
- Air suspension ride-height changes move the real chassis height; the legacy
  `rideOffset` display value was not repurposed.
