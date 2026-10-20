import type { VehicleChassisConfig } from '../config';
import type { WheelPhysicsStateSet } from './WheelPhysicsState';
import { AWDController } from '../control/AWDController';
import { VehicleStateEstimator } from '../control/VehicleStateEstimator';
import { resolveControlCalibration } from '../control/VehicleControlCalibration';

export interface AWDTorqueDistributionSnapshot {
  readonly mode: 'full-time' | 'on-demand';
  readonly frontTorqueSplit: number;
  readonly rearTorqueSplit: number;
  readonly carrierAngularVelocity: number;
}

/** Compatibility/shaft adapter. Runtime borrows the shared controller; no second allocation strategy. */
export class AWDTorqueDistribution {
  public readonly controller: AWDController;
  private estimator?: VehicleStateEstimator;
  public constructor(private readonly config: VehicleChassisConfig, controller?: AWDController) {
    this.controller = controller ?? new AWDController(config, resolveControlCalibration(config).drivetrain);
  }
  public get rearTorqueSplit(): number { return this.controller.rearTorqueSplit; }
  public get carrierAngularVelocity(): number { return this.controller.carrierAngularVelocity; }
  public reset(): void { this.controller.reset(); this.estimator?.reset(); }
  /** Legacy direct callers only. Runtime updates from VehicleControlSystem's shared sample. */
  public update(dt: number, throttle: number, wheels: WheelPhysicsStateSet, driving: boolean, frontAuthority = 1, rearAuthority = 1): void {
    this.estimator ??= new VehicleStateEstimator(this.config);
    const speed = (wheels.frontLeft.longitudinalSpeed + wheels.frontRight.longitudinalSpeed +
      wheels.rearLeft.longitudinalSpeed + wheels.rearRight.longitudinalSpeed) * .25;
    const steering = (wheels.frontLeft.steeringAngle + wheels.frontRight.steeringAngle) * .5;
    const state = this.estimator.update(dt, speed, 0, 0, 0, 0, steering, wheels);
    this.controller.update(dt, state, throttle, driving, frontAuthority, rearAuthority);
  }
  public updateSpeeds(front: number, rear: number): number { return this.controller.updateSpeeds(front, rear); }
  public getSnapshot(): AWDTorqueDistributionSnapshot { return this.controller.getSnapshot(); }
}
