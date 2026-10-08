import type { ParkingBrakeConfig } from '../config/VehiclePlatformConfig';
import { damp, moveTowards } from '../physics/math';

export type ParkingBrakeState = 'RELEASED' | 'APPLYING' | 'ENGAGED' | 'RELEASING';
export interface ParkingBrakeSnapshot {
  state: ParkingBrakeState;
  engaged: boolean;
  applying: boolean;
  fraction: number;
  emergencyBraking: boolean;
}

/** The existing latched handbrake action toggles the actuator's actual target. */
export class ElectronicParkingBrake {
  public state: ParkingBrakeState = 'RELEASED';
  public fraction = 0;
  public emergencyDemand = 0;
  private requested = false;
  private manualEmergency = false;
  private previousInput = false;
  private previousIgnition = true;
  private previousPark = false;
  public constructor(public readonly config: ParkingBrakeConfig) {}
  public reset(ignition: boolean, inPark: boolean): void {
    this.state = 'RELEASED'; this.fraction = 0; this.emergencyDemand = 0;
    this.requested = (!ignition && this.config.autoApplyOnIgnitionOff) || (inPark && this.config.autoApplyInPark);
    this.manualEmergency = false; this.previousInput = false;
    this.previousIgnition = ignition; this.previousPark = inPark;
  }
  public update(dt: number, input: number, speed: number, ignition: boolean,
    inPark: boolean, driving: boolean, throttle: number, brake: number, canDeliverTorque: boolean): void {
    const moving = Math.abs(speed) > this.config.maximumStaticApplySpeed;
    if ((!ignition && this.previousIgnition && this.config.autoApplyOnIgnitionOff) ||
      (inPark && !this.previousPark && this.config.autoApplyInPark)) this.requested = true;
    const pressed = input > .5;
    if (pressed !== this.previousInput) {
      this.requested = !this.requested;
      this.manualEmergency = moving && this.requested;
    }
    this.previousInput = pressed; this.previousIgnition = ignition; this.previousPark = inPark;
    if (this.config.autoReleaseOnDrive && ignition && driving && canDeliverTorque &&
      throttle >= this.config.releaseThrottle && brake < .1 && !this.manualEmergency) this.requested = false;
    if (!this.requested) this.manualEmergency = false;
    if (!moving) this.manualEmergency = false;
    this.emergencyDemand = damp(this.emergencyDemand,
      moving && this.manualEmergency ? this.config.emergencyBrakeDemand : 0, this.config.emergencyResponse, dt);
    const target = this.requested && !moving ? 1 : 0;
    this.fraction = moveTowards(this.fraction, target,
      dt * (target > this.fraction ? this.config.applyRate : this.config.releaseRate));
    this.state = target > this.fraction ? 'APPLYING' : target < this.fraction ? 'RELEASING'
      : this.fraction === 1 ? 'ENGAGED' : 'RELEASED';
  }
  public getSnapshot(): ParkingBrakeSnapshot {
    return { state: this.state, fraction: this.fraction, engaged: this.state === 'ENGAGED',
      applying: this.state === 'APPLYING', emergencyBraking: this.emergencyDemand > .01 };
  }
}
