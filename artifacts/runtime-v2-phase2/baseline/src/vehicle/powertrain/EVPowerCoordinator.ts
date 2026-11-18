import type { EVModeCalibration } from '../config/ElectricVehiclePhysicsConfig';
import type { ElectricDriveUnit } from './ElectricDriveUnit';
import type { PowertrainUpdateContext } from './Powertrain';
import { clamp01 } from '../physics/math';
import { smoothLimit } from './EVThermalState';

export const NORMAL_EV_MODE: EVModeCalibration = { coolingMultiplier: 1, powerFraction: 1,
  frontParticipation: .3, liftOffMultiplier: 1, shiftStrategy: 'normal' };

/** Axle capability, efficiency and traction determine allocation; no model identity. */
export class EVPowerCoordinator {
  public frontTorqueRequest = 0;
  public rearTorqueRequest = 0;
  public allocate(context: PowertrainUpdateContext, front: ElectricDriveUnit | undefined,
    rear: ElectricDriveUnit | undefined, mode: EVModeCalibration, launch: boolean): void {
    const f = front ? front.driveLimit * front.transmission.ratio * front.transmission.efficiency * front.transmission.torqueTransfer : 0;
    const r = rear ? rear.driveLimit * rear.transmission.ratio * rear.transmission.efficiency * rear.transmission.torqueTransfer : 0;
    const throttle = clamp01(context.throttle);
    const yawError = context.escActive ? clamp01(Math.abs((context.expectedYawRate ?? 0) - (context.yawRate ?? 0)) / .7) : 0;
    // Gentle requests use the rear unit alone; strong requests enlist available front capacity.
    const participation = launch ? 1 : smoothLimit((throttle - .12) / .88) * (1 + mode.frontParticipation);
    const potential = (front ? front.potentialDriveLimit * front.transmission.ratio * front.transmission.efficiency : 0) +
      (rear ? rear.potentialDriveLimit * rear.transmission.ratio * rear.transmission.efficiency : 0);
    const total = potential * throttle * (1 - yawError * .25);
    // The shared controller's traction/yaw preference is a bias, not a fixed
    // cruise split; physical unit capability remains the final authority.
    const preference = context.frontAxleTorqueRatio ?? f / Math.max(1, f + r);
    const frontPreferred = total * clamp01(participation) * clamp01(preference);
    let rearWheel = Math.min(r, total - frontPreferred);
    let frontWheel = Math.min(f, Math.max(frontPreferred, total - rearWheel));
    rearWheel = Math.min(r, Math.max(0, total - frontWheel));
    // ESC supplies a modest longitudinal axle support request, while its brake controller remains authoritative.
    if (context.escActive && context.escMode === 'oversteer') rearWheel *= 1 - yawError * .2;
    if (context.escActive && context.escMode === 'understeer') frontWheel *= 1 - yawError * .2;
    this.frontTorqueRequest = front ? frontWheel / (front.transmission.ratio * front.transmission.efficiency) : 0;
    this.rearTorqueRequest = rear ? rearWheel / (rear.transmission.ratio * rear.transmission.efficiency) : 0;
  }
  /** One shared pack budget after response smoothing; never give each motor a full pack independently. */
  public constrainPower(front: ElectricDriveUnit | undefined, rear: ElectricDriveUnit | undefined,
    mechanicalLimit: number, terminalLimit: number, auxiliary: number): void {
    let mechanical = 0, terminal = 0, copper = 0;
    if (front) {
      const p = Math.max(0, front.motor.deliveredDriveTorque * front.motor.shaftAngularVelocity);
      copper += (front.config.motor.copperLossAtMaxTorque ?? 160) * (front.motor.deliveredDriveTorque / front.config.motor.maxDriveTorque) ** 2;
      mechanical += p; terminal += p / Math.min(front.motor.efficiency(front.motor.deliveredDriveTorque), front.motor.efficiency(0)) / front.inverter.config.efficiency;
    }
    if (rear) {
      const p = Math.max(0, rear.motor.deliveredDriveTorque * rear.motor.shaftAngularVelocity);
      copper += (rear.config.motor.copperLossAtMaxTorque ?? 160) * (rear.motor.deliveredDriveTorque / rear.config.motor.maxDriveTorque) ** 2;
      mechanical += p; terminal += p / Math.min(rear.motor.efficiency(rear.motor.deliveredDriveTorque), rear.motor.efficiency(0)) / rear.inverter.config.efficiency;
    }
    const scale = Math.min(1, mechanicalLimit / Math.max(1, mechanical), Math.max(0, terminalLimit - auxiliary - copper) / Math.max(1, terminal));
    if (front && front.motor.deliveredDriveTorque * front.motor.shaftAngularVelocity >= 0) front.motor.scaleTorque(scale);
    if (rear && rear.motor.deliveredDriveTorque * rear.motor.shaftAngularVelocity >= 0) rear.motor.scaleTorque(scale);
  }
  public constrainCharge(front: ElectricDriveUnit | undefined, rear: ElectricDriveUnit | undefined, chargeLimit: number): void {
    let recovery = 0;
    if (front) recovery += Math.max(0, -front.motor.deliveredDriveTorque * front.motor.shaftAngularVelocity) * front.config.motor.regenEfficiency * front.inverter.config.efficiency;
    if (rear) recovery += Math.max(0, -rear.motor.deliveredDriveTorque * rear.motor.shaftAngularVelocity) * rear.config.motor.regenEfficiency * rear.inverter.config.efficiency;
    const scale = Math.min(1, chargeLimit / Math.max(1, recovery));
    if (front && front.motor.deliveredDriveTorque * front.motor.shaftAngularVelocity < 0) front.motor.scaleTorque(scale);
    if (rear && rear.motor.deliveredDriveTorque * rear.motor.shaftAngularVelocity < 0) rear.motor.scaleTorque(scale);
  }
}
