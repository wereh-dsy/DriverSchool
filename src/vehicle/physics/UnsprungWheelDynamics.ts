import type { VehicleChassisConfig } from '../config';
import type { ChassisDynamics } from './ChassisDynamics';
import type { SuspensionVerticalCorner, SuspensionVerticalSnapshot } from './SuspensionSystem';
import { WHEEL_IDS } from './WheelContact';

export function sprungMass(config: VehicleChassisConfig): number {
  const m = config.tires.verticalCompliance && config.suspension.unsprungMass;
  return config.mass - (m ? 2 * (m.front + m.rear) : 0);
}

export function sprungOffsetZ(config: VehicleChassisConfig): number {
  const m = config.tires.verticalCompliance && config.suspension.unsprungMass;
  return (config.mass * config.wheelBase * (.5 - config.frontWeightBias) -
    (m ? config.wheelBase * (m.rear - m.front) : 0)) / sprungMass(config);
}

type MutableCorner = { -readonly [K in keyof SuspensionVerticalCorner]: SuspensionVerticalCorner[K] };

/** Backward Euler for four radial hubs coupled to the existing three body DOFs.
 * Eliminate each scalar hub equation, solve the remaining 3x3 matrix directly.
 * Two bounded active-set corrections select unilateral tyres / strut end stops;
 * no iterative convergence solver, temporary objects, or terrain queries.
 */
export class UnsprungWheelDynamics {
  private readonly a = new Float64Array(12);
  private readonly corners = WHEEL_IDS.map(() => ({ j0: 0, j1: 0, j2: 0, k0: 0, k1: 0, k2: 0,
    b0: 0, b1: 0, b2: 0, v: 0, f: 0, t0: 0, t1: 0, t2: 0, q: 0, p: 1, d: 0, tyre: true, radialStop: false, stop: 0 }));

  public advance(dt: number, x: number, z: number, yaw: number, config: VehicleChassisConfig,
    frame: SuspensionVerticalSnapshot, body: ChassisDynamics, force: number, pitchTorque: number, rollTorque: number): void {
    const radial = config.tires.verticalCompliance!;
    const mass = sprungMass(config), ip = body.pitchInertia, ir = body.rollInertia;
    const sy = Math.sin(yaw), cy = Math.cos(yaw), cp = Math.cos(body.pitch), sp = Math.sin(body.pitch);
    const cgZ = sprungOffsetZ(config), cgX = x + sy * cgZ, cgWorldZ = z + cy * cgZ;
    let supportTotal = 0, groundedCount = 0;
    for (let i = 0; i < 4; i++) {
      const c = frame.wheels[WHEEL_IDS[i]!]!, s = this.corners[i]!, axis = c.suspensionAxis, n = c.surfaceNormal;
      const rx = c.wheelCenterWorld.x - cgX, ry = c.wheelCenterWorld.y - body.y - config.centerOfMassHeight,
        rz = c.wheelCenterWorld.z - cgWorldZ;
      const ax = -axis.x, ay = -axis.y, az = -axis.z;
      const tx = ry * az - rz * ay, ty = rz * ax - rx * az, tz = rx * ay - ry * ax;
      s.j0 = ay; s.j1 = tx * cy - tz * sy; s.j2 = tx * sy * cp - ty * sp + tz * cy * cp;
      const nx = ry * n.z - rz * n.y, ny = rz * n.x - rx * n.z, nz = rx * n.y - ry * n.x;
      s.k0 = n.y; s.k1 = nx * cy - nz * sy; s.k2 = nx * sy * cp - ny * sp + nz * cy * cp;
      s.p = -(axis.x * n.x + axis.y * n.y + axis.z * n.z);
      const distance = (c.wheelCenterWorld.x - c.surfacePoint.x) * n.x +
        (c.wheelCenterWorld.y - c.surfacePoint.y) * n.y + (c.wheelCenterWorld.z - c.surfacePoint.z) * n.z;
      s.q = c.freeTyreRadius - distance;
      s.tyre = c.supportValid !== false && s.p > .1 &&
        Math.max(s.q, s.q + dt * (s.p * c.unsprungVelocity - c.mountNormalVelocity)) > 0;
      s.stop = 0;
      s.radialStop = false;
    }
    let dy = 0, dp = 0, dr = 0;
    for (let pass = 0; pass < 3; pass++) {
      const a = this.a;
      a.fill(0); a[0] = mass; a[4] = ip; a[8] = ir;
      a[9] = dt * force; a[10] = dt * pitchTorque; a[11] = dt * rollTorque;
      for (let i = 0; i < 4; i++) {
        const c = frame.wheels[WHEEL_IDS[i]!]!, s = this.corners[i]!;
        const mu = c.unsprungMass, ds = c.suspensionDamping + dt * c.springStiffness;
        s.d = s.tyre ? radial.damping + dt * radial.stiffness : 0;
        const tyreBase = s.tyre ? radial.stiffness * s.q - s.d * c.mountNormalVelocity : 0;
        const base = c.springStiffness * c.compression + c.bumpStopForce + c.antiRollForce;
        const denom = mu + dt * ds + dt * s.p * s.p * s.d;
        s.v = (mu * c.unsprungVelocity + dt * (base - mu * config.gravity * c.suspensionAxis.y - s.p * tyreBase)) / denom;
        s.b0 = (mu * s.j0 + dt * s.p * s.d * s.k0) / denom;
        s.b1 = (mu * s.j1 + dt * s.p * s.d * s.k1) / denom;
        s.b2 = (mu * s.j2 + dt * s.p * s.d * s.k2) / denom;
        if (s.radialStop && s.tyre && !s.stop) {
          // Finite radial closure is a hub/road constraint, not extra spring
          // travel. Its one normal reaction follows from the hub equation.
          s.v = (c.mountNormalVelocity + (radial.maximumCompression - s.q) / dt) / s.p;
          s.b0 = s.k0 / s.p; s.b1 = s.k1 / s.p; s.b2 = s.k2 / s.p;
        }
        s.f = base - ds * s.v;
        s.t0 = ds * s.b0; s.t1 = ds * s.b1; s.t2 = ds * s.b2;
        if (s.stop) {
          s.v = ((s.stop < 0 ? c.minSuspensionLength : c.maxSuspensionLength) - c.unsprungPosition) / dt;
          s.b0 = s.b1 = s.b2 = 0;
          s.f = mu * (s.v - c.unsprungVelocity) / dt + mu * config.gravity * c.suspensionAxis.y +
            s.p * (tyreBase + s.d * s.p * s.v);
          s.t0 = mu * s.j0 / dt + s.p * s.d * s.k0;
          s.t1 = mu * s.j1 / dt + s.p * s.d * s.k1;
          s.t2 = mu * s.j2 / dt + s.p * s.d * s.k2;
        }
        a[0]! += dt * s.j0 * s.t0; a[1]! += dt * s.j0 * s.t1; a[2]! += dt * s.j0 * s.t2;
        a[3]! += dt * s.j1 * s.t0; a[4]! += dt * s.j1 * s.t1; a[5]! += dt * s.j1 * s.t2;
        a[6]! += dt * s.j2 * s.t0; a[7]! += dt * s.j2 * s.t1; a[8]! += dt * s.j2 * s.t2;
        a[9]! += dt * s.j0 * s.f; a[10]! += dt * s.j1 * s.f; a[11]! += dt * s.j2 * s.f;
      }
      // Direct Gaussian elimination of a positive-mass 3x3 system.
      const u = a[3]! / a[0]!, v = a[6]! / a[0]!;
      const e = a[4]! - u * a[1]!, f = a[5]! - u * a[2]!, b = a[10]! - u * a[9]!;
      const h = a[7]! - v * a[1]!, k = a[8]! - v * a[2]!, d = a[11]! - v * a[9]!;
      dr = (d - h * b / e) / (k - h * f / e); dp = (b - f * dr) / e;
      dy = (a[9]! - a[1]! * dp - a[2]! * dr) / a[0]!;
      if (pass === 2) break; // Final coefficients and active set must agree.
      let changed = false;
      for (let i = 0; i < 4; i++) {
        const c = frame.wheels[WHEEL_IDS[i]!]!, s = this.corners[i]!;
        const velocity = s.v + s.b0 * dy + s.b1 * dp + s.b2 * dr;
        const qv = s.p * velocity - c.mountNormalVelocity - s.k0 * dy - s.k1 * dp - s.k2 * dr;
        if (s.tyre && (radial.stiffness * s.q + s.d * qv < 0 || s.q + dt * qv <= 0)) { s.tyre = false; changed = true; }
        if (s.tyre && !s.radialStop && s.q + dt * qv > radial.maximumCompression) { s.radialStop = true; changed = true; }
        const length = c.unsprungPosition + dt * velocity;
        const stop = length < c.minSuspensionLength ? -1 : length > c.maxSuspensionLength ? 1 : 0;
        if (stop && stop !== s.stop) { s.stop = stop; changed = true; }
      }
      if (!changed) break;
    }
    body.velocity += dy; body.pitchAngularVelocity += dp; body.rollAngularVelocity += dr;
    for (let i = 0; i < 4; i++) {
      const c = frame.wheels[WHEEL_IDS[i]!]! as MutableCorner, s = this.corners[i]!;
      const previous = c.unsprungVelocity;
      c.unsprungVelocity = s.v + s.b0 * dy + s.b1 * dp + s.b2 * dr;
      c.unsprungAcceleration = (c.unsprungVelocity - previous) / dt;
      c.unsprungPosition = Math.max(c.minSuspensionLength, Math.min(c.maxSuspensionLength,
        c.unsprungPosition + dt * c.unsprungVelocity));
      c.suspensionLength = c.unsprungPosition;
      c.compression = c.unloadedLength - c.unsprungPosition;
      c.compressionVelocity = -c.unsprungVelocity;
      c.springForce = c.springStiffness * c.compression;
      c.damperForce = -c.suspensionDamping * c.unsprungVelocity;
      const fs = s.f - s.t0 * dy - s.t1 * dp - s.t2 * dr;
      c.supportForce = -c.suspensionAxis.y * fs;
      c.tyreCompressionVelocity = s.tyre ? s.p * c.unsprungVelocity - c.mountNormalVelocity - s.k0 * dy - s.k1 * dp - s.k2 * dr : 0;
      c.tyreCompression = s.tyre ? Math.max(0, Math.min(radial.maximumCompression, s.q + dt * c.tyreCompressionVelocity)) : 0;
      const tyreForce = s.radialStop && !s.stop
        ? (fs - c.unsprungMass * config.gravity * c.suspensionAxis.y - c.unsprungMass * c.unsprungAcceleration +
          c.unsprungMass * (s.j0 * dy + s.j1 * dp + s.j2 * dr) / dt) / s.p
        : radial.stiffness * s.q + s.d * c.tyreCompressionVelocity;
      c.normalLoad = c.tyreNormalForce = s.tyre ? Math.max(0, tyreForce) : 0;
      c.grounded = c.normalLoad > 0;
      c.contactForce = 0;
      supportTotal += c.supportForce;
      if (c.grounded) groundedCount++;
    }
    const published = frame as { -readonly [K in keyof SuspensionVerticalSnapshot]: SuspensionVerticalSnapshot[K] };
    published.supportForce = supportTotal; published.groundedWheels = groundedCount;
  }
}
