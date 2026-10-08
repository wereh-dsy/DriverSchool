import type { ForwardGear, Gear, TransmissionConfig } from '../config';
import { radiansPerSecondToRPM, rpmToRadiansPerSecond } from './math';

const ALL_FORWARD_GEARS: readonly ForwardGear[] = [1, 2, 3, 4, 5, 6, 7, 8];

/** Gear selection and deterministic ratio/final-drive conversions. */
export class Gearbox {
  public currentGear: Gear;

  public constructor(
    public readonly config: TransmissionConfig,
    initialGear: Gear = 'N',
  ) {
    this.currentGear = initialGear;
  }

  public setGear(gear: Gear): void {
    this.currentGear = gear;
  }

  public reset(gear: Gear = 'N'): void {
    this.currentGear = gear;
  }

  public getRatio(gear: Gear = this.currentGear): number {
    if (gear === 'N') return 0;
    if (gear === 'R') return this.config.reverseRatio;
    return this.config.gearRatios[gear] ?? 0;
  }

  public getShiftUpGear(): Gear {
    const shiftOrder: readonly Gear[] = ['R', 'N', ...this.getForwardGears()];
    const index = shiftOrder.indexOf(this.currentGear);
    if (index < 0) return 'N';
    return shiftOrder[Math.min(shiftOrder.length - 1, index + 1)] ?? this.currentGear;
  }

  public getShiftDownGear(): Gear {
    const shiftOrder: readonly Gear[] = ['R', 'N', ...this.getForwardGears()];
    const index = shiftOrder.indexOf(this.currentGear);
    if (index < 0) return 'N';
    return shiftOrder[Math.max(0, index - 1)] ?? this.currentGear;
  }

  public getForwardGears(): readonly ForwardGear[] {
    return ALL_FORWARD_GEARS.filter((gear) => {
      const ratio = this.config.gearRatios[gear];
      return ratio !== undefined && Number.isFinite(ratio) && ratio > 0;
    });
  }

  public getMaximumForwardGear(): ForwardGear {
    return this.getForwardGears().at(-1) ?? 1;
  }

  public isGearAvailable(gear: Gear): boolean {
    return gear === 'R' || gear === 'N' || this.getForwardGears().includes(gear);
  }

  /** Signed input-shaft speed; reverse ratio and reverse motion cancel. */
  public getInputAngularVelocity(vehicleSpeed: number, wheelRadius: number): number {
    const wheelAngularVelocity = vehicleSpeed / Math.max(0.01, wheelRadius);
    return wheelAngularVelocity * this.getRatio() * this.config.finalDriveRatio;
  }

  public getCoupledEngineRPM(vehicleSpeed: number, wheelRadius: number): number {
    return radiansPerSecondToRPM(this.getInputAngularVelocity(vehicleSpeed, wheelRadius));
  }

  public getWheelTorque(clutchTorque: number): number {
    return (
      clutchTorque *
      this.getRatio() *
      this.config.finalDriveRatio *
      this.config.drivetrainEfficiency
    );
  }

  public getTheoreticalSpeedAtRPM(
    gear: Exclude<Gear, 'N'>,
    engineRPM: number,
    wheelRadius: number,
  ): number {
    const ratio = Math.abs(this.getRatio(gear) * this.config.finalDriveRatio);
    if (ratio <= 0) return 0;
    return (rpmToRadiansPerSecond(engineRPM) / ratio) * wheelRadius;
  }

  public static isForwardGear(gear: Gear): gear is ForwardGear {
    return typeof gear === 'number';
  }
}
