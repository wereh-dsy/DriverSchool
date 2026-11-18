import type { AutoHoldConfig } from '../config/VehiclePlatformConfig';
import { moveTowards } from '../physics/math';

export interface AutoHoldSnapshot {
  state: 'OFF' | 'ARMED' | 'HOLDING';
  enabled: boolean;
  holding: boolean;
  releasing: boolean;
  pressure: number;
}

/** Hydraulic stop assistance; never writes vehicle velocity or wheel torque. */
export class AutoHoldController {
  public state: AutoHoldSnapshot['state'] = 'OFF';
  public pressure = 0;
  public enabled: boolean;
  private target = 0;
  private releaseTimer = 0;
  private releasing = false;
  public constructor(public readonly config: AutoHoldConfig) { this.enabled = config.enabledByDefault; }
  public reset(): void {
    this.state = 'OFF'; this.pressure = 0;
    this.target = 0; this.releaseTimer = 0; this.releasing = false;
  }
  public setEnabled(enabled: boolean): void { this.enabled = enabled; }
  public update(dt: number, operational: boolean, driving: boolean, speed: number,
    brake: number, throttle: number, canDeliverTorque: boolean, parkingEngaged: boolean,
    parkingHandoff: boolean): void {
    const available = this.enabled && operational && driving && !parkingEngaged;
    // Keep hydraulic support until the EPB actuator actually completes its travel.
    const handoff = parkingHandoff && !parkingEngaged && this.state === 'HOLDING';
    if (!available && !handoff) { this.target = 0; this.releasing = this.pressure > 0; }
    if (available && this.state !== 'HOLDING' && this.pressure === 0 &&
      Math.abs(speed) <= this.config.maximumCaptureSpeed && brake >= this.config.captureBrake &&
      throttle < this.config.releaseThrottle - this.config.releaseThrottleHysteresis) {
      this.target = Math.max(this.config.minimumHoldPressure, brake);
      this.releasing = false; this.state = 'HOLDING';
    }
    if (available && this.state === 'HOLDING' && !this.releasing) {
      if (canDeliverTorque && brake < .1 && throttle >= this.config.releaseThrottle) this.releaseTimer += dt;
      else if (brake >= .1 || !canDeliverTorque || throttle < this.config.releaseThrottle - this.config.releaseThrottleHysteresis) this.releaseTimer = 0;
      if (this.releaseTimer >= this.config.releaseDelay) { this.target = 0; this.releasing = true; }
    }
    this.pressure = moveTowards(this.pressure, this.target,
      dt * (this.target > this.pressure ? this.config.applyRate : this.config.releaseRate));
    if (this.pressure === 0) {
      this.state = available ? 'ARMED' : 'OFF'; this.releasing = false; this.releaseTimer = 0;
    }
  }
  public getSnapshot(): AutoHoldSnapshot {
    return { state: this.state, enabled: this.enabled, holding: this.state === 'HOLDING',
      releasing: this.releasing, pressure: this.pressure };
  }
}
