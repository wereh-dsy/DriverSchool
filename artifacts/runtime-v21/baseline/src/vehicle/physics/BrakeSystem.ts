import type { BrakeConfig } from '../config';
import { WHEEL_IDS, type WheelId } from './WheelContact';
import { clamp01, damp } from './math';
import { BrakeTorqueCoordinator } from './BrakeTorqueCoordinator';
import type { ParkingBrakeConfig } from '../config/VehiclePlatformConfig';

export interface WheelBrakeTorques {
  /** Nonnegative requested and delivered hydraulic torque, Nm. */
  readonly requestedBrakeTorque: number;
  readonly appliedBrakeTorque: number;
  /** Independent mechanical parking-brake torque, Nm; rear wheels only. */
  readonly requestedHandbrakeTorque: number;
  readonly appliedHandbrakeTorque: number;
}

/**
 * Pedal/pressure-to-torque only. Wheel rotation and tyre slip produce braking
 * forces; this class neither reduces chassis speed nor performs ABS modulation.
 */
export class BrakeSystem {
  private regenerativeFrontCredit = 0;
  private regenerativeRearCredit = 0;
  private powertrainStopPressure = 0;
  public setPowertrainStopRequest(demand: number): void { this.powertrainStopPressure = clamp01(demand); }
  /** Credit only actual motor braking against pedal/cruise demand; hold/ESC remain independent. */
  public setRegenerativeCredit(front: number, rear: number): void {
    this.regenerativeFrontCredit = Math.max(0, front); this.regenerativeRearCredit = Math.max(0, rear);
  }
  public get maximumServiceTorque(): number {
    const bias = Math.min(.98, Math.max(.02, this.config.frontBrakeBias));
    return Math.max(0, Math.min(this.config.maxBrakeTorqueFront / bias, this.config.maxBrakeTorqueRear / (1 - bias)));
  }
  public axleBrakeDemand(front: boolean): number {
    const allocation = this.dynamicFrontBias ?? this.config.frontBrakeBias;
    return Math.min(front ? this.config.maxBrakeTorqueFront : this.config.maxBrakeTorqueRear,
      this.maximumServiceTorque * Math.max(this.brakeInput, this.cruisePressure) * (front ? allocation : 1 - allocation));
  }
  public readonly coordinator = new BrakeTorqueCoordinator();
  private holdPressure = 0;
  private cruisePressure = 0;
  public setCruiseRequest(dt: number, demand: number): void {
    this.cruisePressure = damp(this.cruisePressure, clamp01(demand), this.config.applyResponse, dt);
  }
  private emergencyPressure = 0;
  private electronicParking: ParkingBrakeConfig | undefined;
  public setHoldingRequests(holdPressure: number, emergencyPressure: number,
    parking?: ParkingBrakeConfig, fraction = 0): void {
    this.holdPressure = clamp01(holdPressure); this.emergencyPressure = clamp01(emergencyPressure);
    this.electronicParking = parking;
    if (parking) this.handbrakeInput = clamp01(fraction);
  }
  public setTractionRequests(torques: readonly number[]): void {
    for (let i = 0; i < 4; i++) this.coordinator.requestWheel(i, 'traction', torques[i] ?? 0);
  }
  private dynamicFrontBias: number | undefined;
  private absPressures: readonly number[] | undefined;
  public setDriverAidState(frontBias: number, pressures: readonly number[], stabilityTorques?: readonly number[]): void {
    this.dynamicFrontBias = frontBias; this.absPressures = pressures;
    for (let i = 0; i < 4; i++) this.coordinator.requestWheel(i, 'esc', stabilityTorques?.[i] ?? 0);
  }
  public brakeInput = 0;
  public handbrakeInput = 0;

  // Radius remains accepted for older construction sites; force production was removed.
  public constructor(public readonly config: BrakeConfig, _wheelRadius = 0.315) {}

  public reset(): void {
    this.regenerativeFrontCredit = this.regenerativeRearCredit = this.powertrainStopPressure = 0;
    this.cruisePressure = 0;
    this.coordinator.reset(); this.holdPressure = 0; this.emergencyPressure = 0; this.electronicParking = undefined;
    this.dynamicFrontBias = undefined; this.absPressures = undefined;
    this.brakeInput = 0;
    this.handbrakeInput = 0;
  }

  public update(dt: number, targetInput: number, targetHandbrake = 0): void {
    const safeDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const command = Number.isFinite(targetInput) ? clamp01(targetInput) : 0;
    const exponent = Number.isFinite(this.config.pedalCurveExponent)
      ? Math.max(0.1, this.config.pedalCurveExponent) : 1;
    const pressureTarget = command ** exponent;
    const response = pressureTarget > this.brakeInput
      ? this.config.applyResponse : this.config.releaseResponse;
    this.brakeInput = damp(this.brakeInput, pressureTarget,
      Number.isFinite(response) ? Math.max(0, response) : this.config.response, safeDt);
    this.handbrakeInput = damp(
      this.handbrakeInput,
      Number.isFinite(targetHandbrake) ? clamp01(targetHandbrake) : 0,
      this.config.handbrakeResponse,
      safeDt,
    );
  }

  public prepareRequests(): void {
    for (const id of WHEEL_IDS) this.prepareWheelRequest(id);
  }
  private prepareWheelRequest(id: WheelId): void {
    const frontBias = Math.min(0.98, Math.max(0.02, this.config.frontBrakeBias));
    const maximumTotalTorque = Math.max(0, Math.min(
      this.config.maxBrakeTorqueFront / frontBias,
      this.config.maxBrakeTorqueRear / (1 - frontBias),
    ));
    const front = id === 'frontLeft' || id === 'frontRight';
    const allocation = this.dynamicFrontBias ?? frontBias;
    const index = id === 'frontLeft' ? 0 : id === 'frontRight' ? 1 : id === 'rearLeft' ? 2 : 3;
    const credit = (front ? this.regenerativeFrontCredit : this.regenerativeRearCredit) / Math.max(.001, this.absPressures?.[index] ?? 1);
    const driverRemainder = Math.max(0, this.axleBrakeDemand(front) - credit);
    const holdTorque = Math.min(front ? this.config.maxBrakeTorqueFront : this.config.maxBrakeTorqueRear,
      maximumTotalTorque * Math.max(this.holdPressure, this.emergencyPressure, this.powertrainStopPressure) * (front ? allocation : 1 - allocation));
    const serviceTorque = Math.max(driverRemainder, holdTorque) * .5;
    // Cruise is included in the blended driver remainder above, avoiding duplicate caliper demand.
    this.coordinator.requestWheel(index, 'cruise', 0);
    const parkingAxle = this.electronicParking?.axle ?? this.config.handbrakeAxle;
    const requestedHandbrakeTorque = front !== (parkingAxle === 'front') ? 0 :
      Math.max(0, this.electronicParking?.maximumTorque ?? this.config.handbrakeTorque) * this.handbrakeInput * .5;
    this.coordinator.requestBase(index, serviceTorque, requestedHandbrakeTorque);
  }
  public getWheelTorques(id: WheelId): WheelBrakeTorques {
    this.prepareWheelRequest(id);
    const index = id === 'frontLeft' ? 0 : id === 'frontRight' ? 1 : id === 'rearLeft' ? 2 : 3;
    return this.coordinator.resolve(index,
      (index < 2 ? this.config.maxBrakeTorqueFront : this.config.maxBrakeTorqueRear) * .5,
      this.absPressures?.[index] ?? 1);
  }
}
