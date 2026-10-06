import type { SteeringConfig } from '../config';
import { clamp, damp } from './math';

/** Smoothed steering rack with self-centring and speed-sensitive road wheels. */
export class SteeringSystem {
  public steeringInput = 0;
  public steeringAngle = 0;
  public steeringWheelAngle = 0;
  public leftRoadWheelAngle = 0;
  public rightRoadWheelAngle = 0;
  /** Diagnostic neutral-input rack return rate, in s^-1. */
  public selfCenteringRate = 0;
  private returnSurfaceGrip = 1;

  public constructor(
    public readonly config: SteeringConfig,
    private readonly wheelBase = 2.7,
    private readonly frontTrackWidth = 1.55,
  ) {}

  public reset(): void {
    this.steeringInput = 0;
    this.steeringAngle = 0;
    this.steeringWheelAngle = 0;
    this.leftRoadWheelAngle = 0;
    this.rightRoadWheelAngle = 0;
    this.selfCenteringRate = 0;
    this.returnSurfaceGrip = 1;
  }

  public update(dt: number, targetInput: number, speed: number, frontSurfaceGrip = 1): void {
    const command = clamp(targetInput, -1, 1);
    const safeSpeed = Number.isFinite(speed) ? Math.abs(speed) : 0;
    const grip = Number.isFinite(frontSurfaceGrip) ? clamp(frontSurfaceGrip, 0.2, 1.4) : 1;
    this.returnSurfaceGrip = damp(this.returnSurfaceGrip, grip, 8, dt);
    const profile = this.config.returnProfile;
    const lowRate = finiteOr(profile?.lowSpeedRate, 0.18);
    const highRate = Math.max(lowRate, finiteOr(profile?.highSpeedRate, 1.22));
    const speedReference = Math.max(1, finiteOr(profile?.speedReference, 12));
    const speedBlend = smoothUnit(safeSpeed / speedReference);
    const angleBlend = smoothUnit((Math.abs(this.steeringInput) - 0.025) / 0.725);
    const angleFactor = 0.3 + 0.7 * angleBlend;
    const surfaceFactor = clamp(0.84 + 0.16 * this.returnSurfaceGrip, 0.8, 1.06);
    this.selfCenteringRate = Math.max(0.01, this.config.steeringReturnRate)
      * clamp(lowRate + (highRate - lowRate) * speedBlend, 0.02, 2.5)
      * angleFactor * surfaceFactor;
    const response = Math.abs(command) < 1e-3
      ? this.selfCenteringRate
      : this.config.steeringResponse;
    this.steeringInput = damp(this.steeringInput, command, response, dt);

    const speedReduction = 1 / (
      1 + this.config.highSpeedSteeringReduction * speed * speed
    );
    const targetRoadWheelAngle =
      this.steeringInput * this.config.maxRoadWheelAngle * speedReduction;
    this.steeringAngle = damp(
      this.steeringAngle,
      targetRoadWheelAngle,
      this.config.steeringDamping,
      dt,
    );
    this.steeringWheelAngle =
      this.steeringInput * this.config.steeringWheelLock * 0.5;

    this.updateAckermannAngles();

    if (!Number.isFinite(this.steeringAngle)) this.reset();
  }

  private updateAckermannAngles(): void {
    const centre = this.steeringAngle;
    const magnitude = Math.abs(centre);
    if (magnitude < 1e-5) {
      this.leftRoadWheelAngle = centre;
      this.rightRoadWheelAngle = centre;
      return;
    }

    const radius = Math.max(this.frontTrackWidth, this.wheelBase / Math.tan(magnitude));
    const inner = Math.atan(
      this.wheelBase / Math.max(0.05, radius - this.frontTrackWidth * 0.5),
    );
    const outer = Math.atan(
      this.wheelBase / (radius + this.frontTrackWidth * 0.5),
    );
    const ackermann = clamp(this.config.ackermannFactor, 0, 1);
    const blendedInner = magnitude + (inner - magnitude) * ackermann;
    const blendedOuter = magnitude + (outer - magnitude) * ackermann;
    if (centre > 0) {
      this.leftRoadWheelAngle = blendedOuter;
      this.rightRoadWheelAngle = blendedInner;
    } else {
      this.leftRoadWheelAngle = -blendedInner;
      this.rightRoadWheelAngle = -blendedOuter;
    }
  }
}

const finiteOr = (value: number | undefined, fallback: number): number =>
  value !== undefined && Number.isFinite(value) ? value : fallback;
const smoothUnit = (value: number): number => {
  const unit = clamp(value, 0, 1);
  return unit * unit * (3 - 2 * unit);
};
