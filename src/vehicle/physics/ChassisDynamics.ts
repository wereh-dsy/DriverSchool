import type { VehicleChassisConfig } from '../config';
import { WHEEL_IDS } from './WheelContact';
import type { SuspensionVerticalSnapshot } from './SuspensionSystem';
import type { WheelPhysicsStateSet } from './WheelPhysicsState';

/** Three sprung-body DOFs. Planar CG translation/yaw stay in VehicleDynamics.
 * y is CG heave relative to its authored height, keeping the flat-rest datum 0.
 * Rotation is Three YXZ: positive pitch raises -Z, positive roll raises +X.
 */
export class ChassisDynamics {
  public y = 0;
  public velocity = 0;
  public acceleration = 0;
  public pitch = 0;
  public roll = 0;
  public pitchAngularVelocity = 0;
  public rollAngularVelocity = 0;
  public pitchAngularAcceleration = 0;
  public rollAngularAcceleration = 0;
  public pitchTorque = 0;
  public rollTorque = 0;
  public totalVerticalForce = 0;
  public microsteps = 1;
  public safetyInterventions = 0;
  public readonly contactImpulses = [0, 0, 0, 0];
  /** Borrowed read-only diagnostics; installed only during a short incident window. */
  public diagnosticObserver?: (motion: Readonly<ChassisDynamics>, frame: SuspensionVerticalSnapshot,
    constraints: readonly Readonly<{ y: number; p: number; r: number; gap: number; impulse: number }>[]) => void;
  public safetyObserver?: (motion: Readonly<ChassisDynamics>) => void;
  public get pitchInertia(): number { return this.config.mass * (this.config.length ** 2 + this.config.height ** 2) / 12; }
  public get rollInertia(): number { return this.config.mass * (this.config.width ** 2 + this.config.height ** 2) / 12; }
  private readonly constraints = WHEEL_IDS.map(() => ({ y: 0, p: 0, r: 0, gap: 0, impulse: 0 }));
  private initialVelocity = 0;
  private initialPitchVelocity = 0;
  private initialRollVelocity = 0;

  public constructor(private readonly config: VehicleChassisConfig) {}

  public reset(pitch = 0, roll = 0): void {
    this.y = 0; this.velocity = 0; this.acceleration = 0;
    this.pitch = pitch; this.roll = roll;
    this.pitchAngularVelocity = this.rollAngularVelocity = 0;
    this.pitchAngularAcceleration = this.rollAngularAcceleration = 0;
    this.pitchTorque = this.rollTorque = this.totalVerticalForce = 0;
    this.safetyInterventions = 0;
    this.contactImpulses.fill(0);
  }

  public beginStep(count: number): void {
    this.microsteps = count;
    this.initialVelocity = this.velocity;
    this.initialPitchVelocity = this.pitchAngularVelocity;
    this.initialRollVelocity = this.rollAngularVelocity;
    this.contactImpulses.fill(0);
  }

  public finishStep(dt: number): void {
    this.acceleration = (this.velocity - this.initialVelocity) / dt;
    this.pitchAngularAcceleration = (this.pitchAngularVelocity - this.initialPitchVelocity) / dt;
    this.rollAngularAcceleration = (this.rollAngularVelocity - this.initialRollVelocity) / dt;
    this.totalVerticalForce = this.config.mass * this.acceleration;
    this.pitchTorque = this.pitchInertia * this.pitchAngularAcceleration;
    this.rollTorque = this.rollInertia * this.rollAngularAcceleration;
  }

  public integrate(dt: number, x: number, z: number, yaw: number, frame: SuspensionVerticalSnapshot,
    tyres: WheelPhysicsStateSet, frontAero = 0, rearAero = 0): void {
    const mass = this.config.mass;
    const sy = Math.sin(yaw), cy = Math.cos(yaw), sp = Math.sin(this.pitch), cp = Math.cos(this.pitch);
    const cgZ = this.config.wheelBase * (.5 - this.config.frontWeightBias);
    const cgX = x + sy * cgZ, cgY = this.y + this.config.centerOfMassHeight, cgWorldZ = z + cy * cgZ;
    const pitchX = cy, pitchZ = -sy, rollX = sy * cp, rollY = -sp, rollZ = cy * cp;
    let forceY = frontAero + rearAero - mass * this.config.gravity, torqueP = 0, torqueR = 0;
    for (let i = 0; i < WHEEL_IDS.length; i++) {
      const id = WHEEL_IDS[i]!, corner = frame.wheels[id], tyre = tyres[id];
      const n = corner.surfaceNormal, point = corner.surfacePoint, center = corner.wheelCenterWorld;
      // The query point defines a plane; the force acts at the tyre's actual
      // patch, not at an arbitrary/stale point elsewhere on that plane.
      const rx = center.x - n.x * this.config.wheelRadius - cgX;
      const ry = center.y - n.y * this.config.wheelRadius - cgY;
      const rz = center.z - n.z * this.config.wheelRadius - cgWorldZ;
      // Contact force directions lie in the sampled tangent plane.
      const angle = tyre.steeringAngle, ca = Math.cos(angle), sa = Math.sin(angle);
      let fx = -sy * ca + cy * sa, fy = 0, fz = -cy * ca - sy * sa;
      const dot = fx * n.x + fz * n.z;
      fx -= n.x * dot; fy -= n.y * dot; fz -= n.z * dot;
      const length = Math.max(1e-6, Math.hypot(fx, fy, fz));
      fx /= length; fy /= length; fz /= length;
      const tx = fy * n.z - fz * n.y, ty = fz * n.x - fx * n.z, tz = fx * n.y - fy * n.x;
      const longitudinal = corner.grounded ? tyre.longitudinalForce + tyre.rollingResistanceForce : 0;
      const lateral = corner.grounded ? tyre.lateralForce : 0;
      const load = corner.grounded ? corner.normalLoad : 0;
      const forceX = n.x * load + fx * longitudinal + tx * lateral;
      const vertical = n.y * load + fy * longitudinal + ty * lateral;
      const forceZ = n.z * load + fz * longitudinal + tz * lateral;
      forceY += vertical;
      const torqueX = ry * forceZ - rz * vertical;
      const torqueY = rz * forceX - rx * forceZ;
      const torqueZ = rx * vertical - ry * forceX;
      torqueP += torqueX * pitchX + torqueZ * pitchZ;
      torqueR += torqueX * rollX + torqueY * rollY + torqueZ * rollZ;

      const axis = corner.suspensionAxis, mount = corner.attachmentWorldPosition;
      const stopX = mount.x + axis.x * corner.minSuspensionLength;
      const stopY = mount.y + axis.y * corner.minSuspensionLength;
      const stopZ = mount.z + axis.z * corner.minSuspensionLength;
      const sx = stopX - cgX, sh = stopY - cgY, sz = stopZ - cgWorldZ;
      const jx = sh * n.z - sz * n.y, jy = sz * n.x - sx * n.z, jz = sx * n.y - sh * n.x;
      const constraint = this.constraints[i]!;
      // Rejected map layers are absent contacts, including predictive stop
      // constraints. Keep the ordinary airborne landing solver unchanged.
      constraint.y = corner.supportValid === false ? 0 : n.y;
      constraint.p = jx * pitchX + jz * pitchZ;
      constraint.r = jx * rollX + jy * rollY + jz * rollZ;
      constraint.gap = (stopX - point.x) * n.x + (stopY - point.y) * n.y +
        (stopZ - point.z) * n.z - this.config.wheelRadius;
      constraint.impulse = 0;
    }
    // Existing separate axle aero enters the same force/moment balance.
    torqueP += (this.config.wheelBase * .5 + cgZ) * frontAero -
      (this.config.wheelBase * .5 - cgZ) * rearAero;
    this.velocity += forceY / mass * dt;
    this.pitchAngularVelocity += torqueP / this.pitchInertia * dt;
    this.rollAngularVelocity += torqueR / this.rollInertia * dt;

    // Inelastic mechanical-stop reactions. One coupled mass/Jacobian solve,
    // rather than lifting the whole mass for whichever wheel overran first.
    for (let iteration = 0; iteration < 12; iteration++) for (let i = 0; i < 4; i++) {
      const c = this.constraints[i]!;
      if (c.y < .1) continue;
      const speed = c.y * this.velocity + c.p * this.pitchAngularVelocity + c.r * this.rollAngularVelocity;
      const inverseMass = c.y * c.y / mass + c.p * c.p / this.pitchInertia + c.r * c.r / this.rollInertia;
      const next = Math.max(0, c.impulse - (speed + c.gap / dt) / Math.max(1e-8, inverseMass));
      const impulse = next - c.impulse;
      this.velocity += c.y * impulse / mass;
      this.pitchAngularVelocity += c.p * impulse / this.pitchInertia;
      this.rollAngularVelocity += c.r * impulse / this.rollInertia;
      c.impulse = next;
    }
    for (let i = 0; i < 4; i++) this.contactImpulses[i]! += this.constraints[i]!.impulse;
    if (this.diagnosticObserver) {
      try { this.diagnosticObserver(this, frame, this.constraints); }
      catch { this.diagnosticObserver = undefined; } // Diagnostics cannot interrupt integration.
    }
    // Extreme numerical envelope only; ordinary attitude is never angle-clamped.
    if (!Number.isFinite(this.velocity + this.pitchAngularVelocity + this.rollAngularVelocity) ||
      Math.abs(this.velocity) > 120 || Math.abs(this.pitchAngularVelocity) > 100 || Math.abs(this.rollAngularVelocity) > 100) {
      if (this.safetyObserver) {
        try { this.safetyObserver(this); } catch { this.safetyObserver = undefined; }
      }
      this.velocity = this.pitchAngularVelocity = this.rollAngularVelocity = 0;
      this.safetyInterventions++;
    }
    this.y += this.velocity * dt;
    this.pitch += this.pitchAngularVelocity * dt;
    this.roll += this.rollAngularVelocity * dt;
  }
}
