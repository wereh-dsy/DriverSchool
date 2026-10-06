import type { TorqueConverterConfig } from '../../config';
import { clamp, clamp01, moveTowards } from '../../physics/math';
import { angularVelocityToRPM, limitAutomaticEngineLoad, type TransmissionContext } from '../TransmissionSystem';

/** Hydrodynamic pump/turbine pair plus a separately actuated friction lockup. */
export class TorqueConverter {
  public lockupEngagement = 0;
  public speedRatio = 0;
  public torqueRatio = 1;
  public slipRPM = 0;
  public pumpRPM = 0;
  public turbineRPM = 0;
  public constructor(private readonly config: TorqueConverterConfig) {}
  public reset(): void { this.lockupEngagement = 0; this.speedRatio = 0; this.torqueRatio = 1; this.slipRPM = 0; this.pumpRPM = 0; this.turbineRPM = 0; }
  public prepare(context: TransmissionContext, turbineOmega: number, shifting: boolean, driving: boolean): void {
    const ratio = Math.max(0, turbineOmega) / Math.max(1, context.engineAngularVelocity);
    const slip = Math.abs(angularVelocityToRPM(context.engineAngularVelocity - turbineOmega));
    const canLock = driving && context.engineRunning && !shifting &&
      Math.abs(context.vehicleSpeed) >= this.config.lockupMinimumSpeed &&
      ratio >= this.config.lockupMinimumSpeedRatio && ratio <= 1.12 &&
      context.throttle < this.config.lockupMaximumThrottle && slip < 950;
    this.lockupEngagement = moveTowards(this.lockupEngagement, canLock ? 1 : 0,
      context.dt * (canLock ? this.config.lockupApplyRate : this.config.lockupReleaseRate));
  }
  public update(context: TransmissionContext, turbineOmega: number, torqueCapacityScale: number): { load: number; turbineTorque: number } {
    const pump = Math.max(0, context.engineAngularVelocity);
    this.pumpRPM = context.engineRPM;
    this.turbineRPM = angularVelocityToRPM(turbineOmega);
    this.slipRPM = angularVelocityToRPM(pump - turbineOmega);
    this.speedRatio = clamp(Math.max(0, turbineOmega) / Math.max(1, pump), 0, 1.5);
    this.torqueRatio = this.sampleRatio(this.speedRatio);
    if (!context.engineRunning || torqueCapacityScale <= 0) return { load: 0, turbineTorque: 0 };
    const slip = pump - turbineOmega;
    const slipFraction = clamp(slip / Math.max(1, pump), -0.5, 1.5);
    const hydraulicDemand = slip >= 0
      ? this.config.pumpTorqueCoefficient * pump * pump * slipFraction
      : slip * this.config.backdriveCoupling;
    const hydraulicLoad = clamp(hydraulicDemand, -this.config.maximumPumpTorque * 0.35, this.config.maximumPumpTorque);
    const lockupDemand = context.availableEngineTorque + slip * this.config.lockupStiffness;
    const lockupTorque = clamp(lockupDemand, -this.config.lockupCapacity, this.config.lockupCapacity);
    const hydraulicShare = (1 - this.lockupEngagement) * torqueCapacityScale;
    const lockupShare = this.lockupEngagement * torqueCapacityScale;
    const wantedLoad = hydraulicLoad * hydraulicShare + lockupTorque * lockupShare;
    const safeLoad = limitAutomaticEngineLoad(wantedLoad, context);
    const safeScale = wantedLoad > 1e-6 ? clamp01(safeLoad / wantedLoad) : 1;
    return { load: safeLoad,
      turbineTorque: (hydraulicLoad * this.torqueRatio * hydraulicShare + lockupTorque * lockupShare) * safeScale };
  }
  private sampleRatio(ratio: number): number {
    const curve = this.config.torqueRatioCurve;
    const first = curve[0]; const last = curve[curve.length - 1];
    if (first === undefined || last === undefined) return 1;
    if (ratio <= first.speedRatio) return Math.max(1, first.torqueRatio);
    if (ratio >= last.speedRatio) return Math.max(1, last.torqueRatio);
    for (let index = 1; index < curve.length; index += 1) {
      const upper = curve[index]!; const lower = curve[index - 1]!;
      if (ratio <= upper.speedRatio) {
        const t = clamp01((ratio - lower.speedRatio) / Math.max(0.001, upper.speedRatio - lower.speedRatio));
        return Math.max(1, lower.torqueRatio + (upper.torqueRatio - lower.torqueRatio) * t);
      }
    }
    return 1;
  }
}
