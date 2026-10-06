import type { TireConfig } from '../config';
import { WHEEL_IDS, type WheelId } from './WheelContact';
import { clamp, wrapAngle } from './math';

export interface WheelRotationInput {
  /** Velocity of this wheel contact in the steered wheel's frame, m/s. */
  readonly longitudinalSpeed: number;
  readonly lateralSpeed: number;
  /** Signed propulsion torque and unsigned brake torque demands, Nm. */
  readonly driveTorque: number;
  readonly brakeTorque: number;
  readonly handbrakeTorque: number;
  readonly normalLoad: number;
  readonly surfaceLongitudinalGrip: number;
  /** Near-rest static-friction demand allocated by the chassis hold solver, N. */
  readonly staticLongitudinalForce?: number;
}

export interface WheelRotationState {
  readonly angularVelocity: number;
  readonly rotationAngle: number;
  readonly longitudinalSpeed: number;
  readonly lateralSpeed: number;
  readonly slipRatio: number;
  readonly slipAngle: number;
  /** Signed actual tyre force along the wheel, N. */
  readonly longitudinalForce: number;
  readonly longitudinalUsage: number;
  /** Signed brake reaction subtracted from drive torque in the wheel balance. */
  readonly brakeReactionTorque: number;
  readonly handbrakeReactionTorque: number;
  /** -I*dOmega/dt/r, useful only to close torque-derived force diagnostics. */
  readonly rotationalInertiaForce: number;
  /** True only when a capacity-checked static-friction constraint was accepted. */
  readonly staticContact: boolean;
}

const zeroState = (): WheelRotationState => ({
  angularVelocity: 0, rotationAngle: 0, longitudinalSpeed: 0, lateralSpeed: 0,
  slipRatio: 0, slipAngle: 0, longitudinalForce: 0, longitudinalUsage: 0,
  brakeReactionTorque: 0, handbrakeReactionTorque: 0, rotationalInertiaForce: 0, staticContact: false,
});

/**
 * Four persistent wheels with a scalar implicit torque balance. The implicit
 * solve handles the stiff low-speed tyre without artificial brake pulsing or
 * a wheel-speed clamp to the vehicle's speed. Real locked wheels are allowed.
 */
export class WheelRotationSystem {
  private readonly states: Record<WheelId, WheelRotationState> = {
    frontLeft: zeroState(), frontRight: zeroState(),
    rearLeft: zeroState(), rearRight: zeroState(),
  };
  private readonly radius: number;
  private readonly inertia: number;

  public constructor(private readonly config: TireConfig, wheelRadius: number, wheelInertia = config.wheelInertia) {
    this.radius = Number.isFinite(wheelRadius) ? Math.max(0.05, wheelRadius) : 0.315;
    this.inertia = Number.isFinite(wheelInertia) ? Math.max(0.1, wheelInertia) : 1.2;
  }

  /** Only initialisation/explicit teleport resets infer a starting free-rolling speed. */
  public reset(longitudinalSpeed = 0): void {
    const speed = this.finite(longitudinalSpeed);
    for (const id of WHEEL_IDS) {
      this.states[id] = { ...zeroState(), angularVelocity: speed / this.radius, longitudinalSpeed: speed };
    }
  }

  public getSnapshot(id: WheelId): WheelRotationState { return { ...this.states[id] }; }

  /** Explicit collision/pawl correction only; preserves the visual spin phase. */
  public constrainAngularVelocity(id: WheelId, angularVelocity: number,
    longitudinalSpeed?: number, lateralSpeed?: number): void {
    const previous = this.states[id];
    const omega = this.finite(angularVelocity);
    const speed = longitudinalSpeed === undefined ? previous.longitudinalSpeed : this.finite(longitudinalSpeed);
    const sideways = lateralSpeed === undefined ? previous.lateralSpeed : this.finite(lateralSpeed);
    this.states[id] = { ...previous, angularVelocity: omega, longitudinalSpeed: speed, lateralSpeed: sideways,
      slipRatio: this.calculateSlip(omega, speed), slipAngle: Math.atan(sideways / Math.max(3, Math.abs(speed))),
      longitudinalForce: 0, longitudinalUsage: 0,
      brakeReactionTorque: 0, handbrakeReactionTorque: 0, rotationalInertiaForce: 0, staticContact: false };
  }

  public updateWheel(id: WheelId, dt: number, input: WheelRotationInput): WheelRotationState {
    const previous = this.states[id];
    const duration = clamp(this.finite(dt), 0, 0.1);
    const speed = this.finite(input.longitudinalSpeed);
    const lateralSpeed = this.finite(input.lateralSpeed);
    const driveTorque = this.finite(input.driveTorque);
    const brakeTorque = Math.max(0, this.finite(input.brakeTorque));
    const handbrakeTorque = Math.max(0, this.finite(input.handbrakeTorque));
    const totalBrake = brakeTorque + handbrakeTorque;
    const limit = Math.max(0, this.finite(this.config.longitudinalGrip)) *
      Math.max(0, this.finite(input.normalLoad)) * Math.max(0, this.finite(input.surfaceLongitudinalGrip));
    const staticForce = input.staticLongitudinalForce;
    if (duration > 0 && staticForce !== undefined && Number.isFinite(staticForce) &&
      Math.abs(speed) <= 0.12 && Math.abs(lateralSpeed) <= 0.12 &&
      Math.abs(previous.angularVelocity * this.radius) <= 0.12 && Math.abs(staticForce) <= limit + 1e-8) {
      const reaction = driveTorque - staticForce * this.radius + this.inertia * previous.angularVelocity / duration;
      if (Math.abs(reaction) <= totalBrake + 1e-8) {
        // Static contact is a constraint, not the dynamic zero-slip curve.
        // Pressure remains exactly requested: the brake merely reacts within
        // that capacity. This prevents a held hill stop creeping to find slip.
        const state: WheelRotationState = {
          angularVelocity: 0, rotationAngle: previous.rotationAngle,
          longitudinalSpeed: 0, lateralSpeed: 0, slipRatio: 0, slipAngle: 0,
          longitudinalForce: staticForce,
          longitudinalUsage: limit > 1e-6 ? clamp(Math.abs(staticForce) / limit, 0, 1) : 0,
          brakeReactionTorque: totalBrake > 0 ? reaction * brakeTorque / totalBrake : 0,
          handbrakeReactionTorque: totalBrake > 0 ? reaction * handbrakeTorque / totalBrake : 0,
          rotationalInertiaForce: this.inertia * previous.angularVelocity / duration / this.radius,
          staticContact: true,
        };
        this.states[id] = state;
        return { ...state };
      }
    }
    const steps = Math.max(1, Math.ceil(duration / (1 / 480)));
    const h = duration / steps;
    let omega = previous.angularVelocity;
    let phase = previous.rotationAngle;
    let integratedForce = 0;
    let integratedBrake = 0;
    if (h > 0) {
      for (let step = 0; step < steps; step++) {
        const oldOmega = omega;
        const inertiaRate = this.inertia / h;
        const forceAtRest = this.tyreForce(0, speed, limit);
        // The brake is a dry-friction constraint: at zero omega it may react
        // up to demand, but cannot integrate a stopped wheel backwards.
        const brakeToHold = inertiaRate * oldOmega + driveTorque - forceAtRest * this.radius;
        let reaction: number;
        if (Math.abs(brakeToHold) <= totalBrake) {
          omega = 0;
          reaction = brakeToHold;
        } else {
          const direction = Math.sign(brakeToHold);
          reaction = direction * totalBrake;
          const residual = (candidate: number): number => inertiaRate * (candidate - oldOmega) -
            driveTorque + reaction + this.tyreForce(candidate, speed, limit) * this.radius;
          const extent = Math.abs(oldOmega) + h / this.inertia *
            (Math.abs(driveTorque) + totalBrake + limit * this.radius) + 1;
          let low = direction > 0 ? 0 : -extent;
          let high = direction > 0 ? extent : 0;
          // Microsteps keep the mild post-peak branch monotonic under normal
          // vehicle loads; fixed bisection is deterministic and finite.
          for (let iteration = 0; iteration < 32; iteration++) {
            const middle = (low + high) * 0.5;
            if (residual(middle) > 0) high = middle;
            else low = middle;
          }
          omega = (low + high) * 0.5;
        }
        const force = this.tyreForce(omega, speed, limit);
        integratedForce += force * h;
        integratedBrake += reaction * h;
        phase = wrapAngle(phase + (oldOmega + omega) * 0.5 * h);
      }
    }
    const longitudinalForce = duration > 0 ? integratedForce / duration
      : this.tyreForce(omega, speed, limit);
    const brakeReaction = duration > 0 ? integratedBrake / duration : 0;
    const slipRatio = this.calculateSlip(omega, speed);
    const state: WheelRotationState = {
      angularVelocity: omega, rotationAngle: phase, longitudinalSpeed: speed, lateralSpeed,
      slipRatio, slipAngle: Math.atan(lateralSpeed / Math.max(3, Math.abs(speed))),
      longitudinalForce, longitudinalUsage: limit > 1e-6 ? clamp(Math.abs(longitudinalForce) / limit, 0, 1) : 0,
      brakeReactionTorque: totalBrake > 0 ? brakeReaction * brakeTorque / totalBrake : 0,
      handbrakeReactionTorque: totalBrake > 0 ? brakeReaction * handbrakeTorque / totalBrake : 0,
      rotationalInertiaForce: duration > 0 ? -this.inertia * (omega - previous.angularVelocity) / duration / this.radius : 0,
      staticContact: false,
    };
    this.states[id] = state;
    return { ...state };
  }

  private calculateSlip(omega: number, speed: number): number {
    const treadSpeed = omega * this.radius;
    // A 2 m/s reference continuously regularises parking, reversal and rest.
    return (treadSpeed - speed) / Math.max(2, Math.abs(speed), Math.abs(treadSpeed));
  }

  private tyreForce(omega: number, speed: number, limit: number): number {
    const slip = this.calculateSlip(omega, speed);
    const ratio = Math.abs(slip) / Math.max(0.015, this.finite(this.config.peakSlipRatio, 0.11));
    // C1-continuous peak, followed by restrained falloff rather than a cliff.
    const mildFalloff = clamp(this.finite(this.config.gripFalloff), 0, 1) * 0.35;
    const curve = ratio <= 1 ? Math.sin(ratio * Math.PI * 0.5)
      : 1 - mildFalloff * (1 - Math.exp(-0.5 * (ratio - 1) ** 2));
    return Math.sign(slip) * limit * curve;
  }

  private finite(value: number, fallback = 0): number { return Number.isFinite(value) ? value : fallback; }
}
