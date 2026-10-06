import type { ClutchConfig } from '../config';
import { clamp, clamp01, moveTowards } from './math';

/** Mechanical state only; automatic shift sequencing lives elsewhere. */
export type ClutchState =
  | 'disengaged'
  | 'disengaging'
  | 'slipping'
  | 'engaging'
  | 'coupled';

/**
 * Mechanical clutch model shared by automatic and manual-clutch control.
 *
 * Pedal interpretation, shift policy and input devices deliberately do not
 * live here. The torque-capacity and slip methods are explicit extension
 * points for a non-linear bite point, thermal fade and wear in later versions.
 */
export class Clutch {
  /** Zero is open, one is fully coupled. */
  public engagement = 0;
  public targetEngagement = 0;
  public state: ClutchState = 'disengaged';
  public lastSlipAngularVelocity = 0;
  public lastTransmittedTorque = 0;

  public constructor(public readonly config: ClutchConfig) {}

  public reset(engagement = 0): void {
    const safeEngagement = Number.isFinite(engagement) ? clamp01(engagement) : 0;
    this.engagement = safeEngagement;
    this.targetEngagement = safeEngagement;
    this.state = safeEngagement >= 1 ? 'coupled' : safeEngagement <= 0 ? 'disengaged' : 'slipping';
    this.lastSlipAngularVelocity = 0;
    this.lastTransmittedTorque = 0;
  }

  /**
   * Converts pedal travel into a mechanical target. This is linear for V0.1;
   * a bite-point curve can be introduced here without changing input adapters.
   */
  public pedalToEngagement(clutchPedal: number): number {
    const pedal = Number.isFinite(clutchPedal) ? clamp01(clutchPedal) : 0;
    return 1 - pedal;
  }

  /** Move the physical pressure plate toward an actuator/pedal command. */
  public update(dt: number, targetEngagement: number): void {
    const safeDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    this.targetEngagement = Number.isFinite(targetEngagement)
      ? clamp01(targetEngagement)
      : this.engagement;

    const isOpening = this.targetEngagement < this.engagement;
    const rate = isOpening ? this.config.disengagementRate : this.config.engagementRate;
    this.engagement = moveTowards(
      this.engagement,
      this.targetEngagement,
      Math.max(0, rate) * safeDt,
    );
    if (!Number.isFinite(this.engagement)) this.engagement = 0;
    this.engagement = clamp01(this.engagement);

    const error = this.targetEngagement - this.engagement;
    if (this.engagement <= 1e-4 && this.targetEngagement <= 1e-4) {
      this.state = 'disengaged';
    } else if (error < -1e-4) {
      this.state = 'disengaging';
    } else if (error > 1e-4) {
      this.state = 'engaging';
    } else if (this.engagement >= 1 - 1e-4) {
      this.state = 'coupled';
    } else {
      this.state = 'slipping';
    }
  }

  /**
   * Current torque capacity. Bite limits are expressed in pedal-down travel,
   * while engagement remains the device-independent zero-to-one mechanical
   * state. Thermal and wear multipliers can be applied after this curve.
   */
  public getTorqueCapacity(engagement = this.engagement): number {
    const pedal = 1 - clamp01(engagement);
    const biteStart = clamp01(this.config.bitePointStart);
    const biteEnd = Math.min(biteStart - 1e-4, clamp01(this.config.bitePointEnd));
    const biteProgress = clamp01((biteStart - pedal) / (biteStart - biteEnd));
    const shapedEngagement = this.config.engagementCurve === 'linear'
      ? biteProgress
      : biteProgress ** Math.max(0.1, this.config.engagementCurveExponent);
    return Math.max(0, this.config.maxClutchTorque * shapedEngagement);
  }

  public calculateSlipAngularVelocity(
    engineAngularVelocity: number,
    gearboxInputAngularVelocity: number,
  ): number {
    const slip = engineAngularVelocity - gearboxInputAngularVelocity;
    return Number.isFinite(slip) ? slip : 0;
  }

  /**
   * Positive torque flows engine -> gearbox. Negative torque is back-drive and
   * therefore becomes engine braking once it reaches the driven wheels.
   */
  public calculateTransmittedTorque(
    crankTorque: number,
    engineAngularVelocity: number,
    gearboxInputAngularVelocity: number,
  ): number {
    const capacity = this.getTorqueCapacity();
    const safeCrankTorque = Number.isFinite(crankTorque) ? crankTorque : 0;
    const slip = this.calculateSlipAngularVelocity(
      engineAngularVelocity,
      gearboxInputAngularVelocity,
    );
    this.lastSlipAngularVelocity = slip;

    if (capacity <= 0) {
      this.lastTransmittedTorque = 0;
      return 0;
    }

    const requestedTorque = safeCrankTorque + slip * this.config.couplingStiffness;
    const transmittedTorque = clamp(requestedTorque, -capacity, capacity);
    this.lastTransmittedTorque = Number.isFinite(transmittedTorque) ? transmittedTorque : 0;
    return this.lastTransmittedTorque;
  }
}
