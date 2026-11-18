import { clamp } from './math';

/** Rank-one shaft constraint, solved as a bounded angular impulse, never as equal wheel speeds.
 * q = sum(weights[i] * wheelAngle[i]); centre uses axle averages, dog locks use L-R.
 * Backward Euler Kelvin-Voigt coupling is passive, including elastic wind-up and release. */
export class CompliantShaftCoupling {
  public engaged = false;
  public twist = 0;
  public relativeSpeed = 0;
  public torque = 0;
  public dissipatedJ = 0;
  public energyResidualJ = 0;
  public constructor(public readonly name: 'center' | 'front' | 'rear', public readonly weights: readonly number[],
    public readonly config: { stiffness: number; damping: number; capacity: number }) {}
  public get storedEnergyJ(): number { return .5 * this.config.stiffness * this.twist ** 2; }
  public reset(): void { this.engaged = false; this.twist = this.relativeSpeed = this.torque = this.dissipatedJ = this.energyResidualJ = 0; }
  public integrate(dt: number, omega: number[], inertia: readonly number[]): void {
    let relative = 0, inverseInertia = 0;
    for (let i = 0; i < 4; i++) { const w = this.weights[i]!; relative += w * omega[i]!; inverseInertia += w * w / inertia[i]!; }
    this.relativeSpeed = relative;
    if (!this.engaged) { this.dissipatedJ += this.storedEnergyJ; this.twist = this.torque = 0; return; }
    if (dt <= 0 || inverseInertia <= 0) return;
    const { stiffness: k, damping: c, capacity } = this.config, oldEnergy = this.storedEnergyJ;
    const impulse = clamp(dt * (k * this.twist + (c + dt * k) * relative) / (1 + dt * (c + dt * k) * inverseInertia), -capacity * dt, capacity * dt);
    for (let i = 0; i < 4; i++) omega[i] = omega[i]! - this.weights[i]! * impulse / inertia[i]!;
    const nextRelative = relative - impulse * inverseInertia;
    // Capacity overflow is plastic slip, with its work explicitly dissipated.
    this.twist = clamp(this.twist + dt * nextRelative, -capacity / k, capacity / k);
    const removed = impulse * relative - .5 * impulse * impulse * inverseInertia;
    const heat = removed - (this.storedEnergyJ - oldEnergy);
    this.energyResidualJ += removed - (this.storedEnergyJ - oldEnergy) - Math.max(0, heat);
    this.dissipatedJ += Math.max(0, heat); this.torque = impulse / dt; this.relativeSpeed = nextRelative;
  }
  public getSnapshot() { return { installed: true, engaged: this.engaged, relativeSpeed: this.relativeSpeed,
    twistRad: this.twist, reactionTorqueNm: this.torque, storedEnergyJ: this.storedEnergyJ,
    dissipatedJ: this.dissipatedJ, energyResidualJ: this.energyResidualJ }; }
}
