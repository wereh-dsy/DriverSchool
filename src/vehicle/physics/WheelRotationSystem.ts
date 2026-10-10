import type { TireConfig } from '../config';
import { WHEEL_IDS, type WheelId } from './WheelContact';
import { clamp, wrapAngle } from './math';
import { TyreGripModel } from './TyreGripModel';

export interface WheelRotationInput {
  readonly additionalInertia?: number;
  /** Signed physical wheel inclination; left normalized camber, right its negative. */
  readonly camberAngle?: number;
  /** Velocity of this wheel contact in the steered wheel's frame, m/s. */
  readonly longitudinalSpeed: number;
  readonly lateralSpeed: number;
  /** Signed propulsion torque and unsigned brake torque demands, Nm. */
  readonly driveTorque: number;
  readonly brakeTorque: number;
  readonly handbrakeTorque: number;
  readonly normalLoad: number;
  readonly surfaceLongitudinalGrip: number;
  readonly staticNormalLoad?: number;
  readonly surfaceLateralGrip?: number;
  readonly corneringStiffness?: number;
  /** Separate rear-wheel handbrake lockup availability, not a vehicle-wide penalty. */
  readonly lateralGripAvailability?: number;
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
  readonly lateralForce: number;
  readonly lateralForceLimit: number;
  readonly lateralUsage: number;
  readonly gripUsage: number;
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
  lateralForce: 0, lateralForceLimit: 0, lateralUsage: 0, gripUsage: 0,
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
  public readonly gripModel: TyreGripModel;

  public constructor(private readonly config: TireConfig, wheelRadius: number, wheelInertia = config.wheelInertia) {
    this.radius = Number.isFinite(wheelRadius) ? Math.max(0.05, wheelRadius) : 0.315;
    this.inertia = Number.isFinite(wheelInertia) ? Math.max(0.1, wheelInertia) : 1.2;
    this.gripModel = new TyreGripModel(config);
  }

  /** Only initialisation/explicit teleport resets infer a starting free-rolling speed. */
  public reset(longitudinalSpeed = 0): void {
    const speed = this.finite(longitudinalSpeed);
    for (const id of WHEEL_IDS) {
      this.states[id] = { ...zeroState(), angularVelocity: speed / this.radius, longitudinalSpeed: speed };
    }
  }

  public getSnapshot(id: WheelId): WheelRotationState { return { ...this.states[id] }; }
  /** Allocation-free feedback for the differential carrier and static hold checks. */
  public getAngularVelocity(id: WheelId): number { return this.states[id].angularVelocity; }

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
      lateralForce: 0, lateralUsage: 0, gripUsage: 0,
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
    const inertia = this.inertia + Math.max(0, this.finite(input.additionalInertia ?? 0));
    const load = Math.max(0, this.finite(input.normalLoad));
    const effectiveLoad = load * this.gripModel.loadFactor(load, this.finite(input.staticNormalLoad ?? load));
    const limit = Math.max(0, this.finite(this.config.longitudinalGrip)) *
      effectiveLoad * Math.max(0, this.finite(input.surfaceLongitudinalGrip));
    const lateralLimit = Math.max(0, this.finite(this.config.lateralGrip)) * effectiveLoad *
      Math.max(0, this.finite(input.surfaceLateralGrip ?? 1)) * clamp(this.finite(input.lateralGripAvailability ?? 1), 0, 1);
    const slipAngle = Math.atan(lateralSpeed / Math.max(3, Math.abs(speed)));
    const lateralDemand = clamp(this.gripModel.lateralForce(slipAngle,
      Math.max(0, this.finite(input.corneringStiffness ?? 0)), lateralLimit) -
      this.finite(input.camberAngle ?? 0) * Math.max(0, this.config.camberStiffness ?? 0) *
      load / Math.max(1, input.staticNormalLoad ?? load), -lateralLimit, lateralLimit);
    const staticForce = input.staticLongitudinalForce;
    if (duration > 0 && staticForce !== undefined && Number.isFinite(staticForce) &&
      Math.abs(speed) <= 0.12 && Math.abs(lateralSpeed) <= 0.12 &&
      Math.abs(previous.angularVelocity * this.radius) <= 0.12 && Math.abs(staticForce) <= limit + 1e-8) {
      const reaction = driveTorque - staticForce * this.radius + inertia * previous.angularVelocity / duration;
      if (Math.abs(reaction) <= totalBrake + 1e-8) {
        // Static contact is a constraint, not the dynamic zero-slip curve.
        // Pressure remains exactly requested: the brake merely reacts within
        // that capacity. This prevents a held hill stop creeping to find slip.
        const state: WheelRotationState = {
          angularVelocity: 0, rotationAngle: previous.rotationAngle,
          longitudinalSpeed: 0, lateralSpeed: 0, slipRatio: 0, slipAngle: 0,
          longitudinalForce: staticForce,
          longitudinalUsage: limit > 1e-6 ? clamp(Math.abs(staticForce) / limit, 0, 1) : 0,
          lateralForce: 0, lateralForceLimit: lateralLimit, lateralUsage: 0,
          gripUsage: limit > 1e-6 ? Math.abs(staticForce) / limit : 0,
          brakeReactionTorque: totalBrake > 0 ? reaction * brakeTorque / totalBrake : 0,
          handbrakeReactionTorque: totalBrake > 0 ? reaction * handbrakeTorque / totalBrake : 0,
          rotationalInertiaForce: inertia * previous.angularVelocity / duration / this.radius,
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
    let integratedLateral = 0;
    let integratedBrake = 0;
    if (h > 0) {
      for (let step = 0; step < steps; step++) {
        const oldOmega = omega;
        const inertiaRate = inertia / h;
        const forceAtRest = this.tyreForce(0, speed, limit, lateralDemand, lateralLimit);
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
            driveTorque + reaction + this.tyreForce(candidate, speed, limit, lateralDemand, lateralLimit) * this.radius;
          const extent = Math.abs(oldOmega) + h / inertia *
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
        const rawForce = this.gripModel.longitudinalForce(this.calculateSlip(omega, speed), limit);
        const scale = this.gripModel.combinedScale(rawForce, lateralDemand, limit, lateralLimit);
        const force = rawForce * scale;
        integratedForce += force * h;
        integratedLateral += lateralDemand * scale * h;
        integratedBrake += reaction * h;
        phase = wrapAngle(phase + (oldOmega + omega) * 0.5 * h);
      }
    }
    const longitudinalForce = duration > 0 ? integratedForce / duration
      : this.tyreForce(omega, speed, limit, lateralDemand, lateralLimit);
    const lateralForce = duration > 0 ? integratedLateral / duration : lateralDemand *
      this.gripModel.combinedScale(this.gripModel.longitudinalForce(this.calculateSlip(omega, speed), limit),
        lateralDemand, limit, lateralLimit);
    const brakeReaction = duration > 0 ? integratedBrake / duration : 0;
    const slipRatio = this.calculateSlip(omega, speed);
    const state: WheelRotationState = {
      angularVelocity: omega, rotationAngle: phase, longitudinalSpeed: speed, lateralSpeed,
      slipRatio, slipAngle,
      longitudinalForce, longitudinalUsage: limit > 1e-6 ? clamp(Math.abs(longitudinalForce) / limit, 0, 1) : 0,
      lateralForce, lateralForceLimit: lateralLimit,
      lateralUsage: lateralLimit > 1e-6 ? Math.abs(lateralForce) / lateralLimit : 0,
      gripUsage: this.gripModel.usage(longitudinalForce, lateralForce, limit, lateralLimit),
      brakeReactionTorque: totalBrake > 0 ? brakeReaction * brakeTorque / totalBrake : 0,
      handbrakeReactionTorque: totalBrake > 0 ? brakeReaction * handbrakeTorque / totalBrake : 0,
      rotationalInertiaForce: duration > 0 ? -inertia * (omega - previous.angularVelocity) / duration / this.radius : 0,
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

  private tyreForce(omega: number, speed: number, limit: number, lateralDemand: number, lateralLimit: number): number {
    const raw = this.gripModel.longitudinalForce(this.calculateSlip(omega, speed), limit);
    return raw * this.gripModel.combinedScale(raw, lateralDemand, limit, lateralLimit);
  }

  private finite(value: number, fallback = 0): number { return Number.isFinite(value) ? value : fallback; }
}
