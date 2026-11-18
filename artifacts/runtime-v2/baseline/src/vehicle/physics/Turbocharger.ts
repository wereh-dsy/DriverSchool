import type { TurbochargerConfig } from '../config';
import { clamp, clamp01 } from './math';

/** Two dynamic states only. Pressure is absolute bar at a fixed 1-bar ambient.
 * Everything else (drive, compressor load, wastegate) is algebraic. */
export class Turbocharger {
  public turboSpeed = 0;
  public manifoldPressure = 1;

  public constructor(public readonly config: TurbochargerConfig) {
    if (!Number.isFinite(config.inertia) || config.inertia <= 0 ||
      !Number.isFinite(config.maxPressureRatio) || config.maxPressureRatio < 1 ||
      !Number.isFinite(config.pressureGain) || config.pressureGain < 0 ||
      !Number.isFinite(config.turbineDriveStrength) || config.turbineDriveStrength < 0 ||
      !Number.isFinite(config.compressorLoadStrength) || config.compressorLoadStrength < 0 ||
      !Number.isFinite(config.friction) || config.friction < 0 ||
      !Number.isFinite(config.wastegateGain) || config.wastegateGain < 0) {
      throw new Error('Invalid turbocharger shaft/pressure configuration.');
    }
  }

  public reset(): void {
    this.turboSpeed = 0;
    this.manifoldPressure = 1;
  }

  public get compressorPressurePotential(): number {
    return Math.min(this.config.maxPressureRatio, 1 + this.config.pressureGain * this.turboSpeed * this.turboSpeed);
  }

  public get wastegateOpening(): number {
    // Small proportional approach band below the ceiling, no actuator state.
    const band = Math.min(0.18, (this.config.maxPressureRatio - 1) * 0.2);
    return clamp01((this.manifoldPressure - (this.config.maxPressureRatio - band)) * this.config.wastegateGain);
  }

  /** No transmission type/shift flag, temporary containers, or extra tick loop. */
  public update(
    dt: number, rpm: number, actualThrottle: number, combustionDemand: number,
    loadTorque: number, fullLoadTorque: number, running: boolean,
  ): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (!Number.isFinite(this.turboSpeed) || !Number.isFinite(this.manifoldPressure)) this.reset();
    const speed = this.turboSpeed = clamp01(this.turboSpeed);
    this.manifoldPressure = clamp(this.manifoldPressure, 1, this.config.maxPressureRatio);
    const throttle = running && Number.isFinite(actualThrottle) ? clamp01(actualThrottle) : 0;
    const demand = running && Number.isFinite(combustionDemand) ? clamp01(combustionDemand) : 0;
    const rpmFactor = running && Number.isFinite(rpm) ? clamp(rpm / 2200, 0, 2) : 0;
    const load = Number.isFinite(loadTorque) && Number.isFinite(fullLoadTorque)
      ? clamp01(Math.max(0, loadTorque) / Math.max(1, fullLoadTorque)) : 0;
    // Effective exhaust-flow/energy proxy: deliberately weak at low speed and
    // low fuelling. Equal RPM under cruise/free-rev and heavy load is NOT equal drive.
    const rpmSquared = rpmFactor * rpmFactor;
    const exhaustEnergy = rpmSquared * rpmSquared * demand
      * (0.3 + 0.7 * load) * (0.25 + 0.75 * throttle);
    const drive = this.config.turbineDriveStrength * exhaustEnergy * (1 - this.wastegateOpening);
    const airflow = 0.08 + 0.92 * throttle * rpmFactor;
    const compressorDrag = this.config.compressorLoadStrength
      * (this.compressorPressurePotential - 1) * airflow;
    // J*dω/dt = drive*(1-.35ω) - compressorDrag*ω - friction*ω.
    // One linearly implicit step keeps the scalar rotor stable without substeps.
    const step = Math.min(dt, 1) / Math.max(0.01, this.config.inertia);
    this.turboSpeed = clamp01((speed + step * drive) /
      (1 + step * (0.35 * drive + compressorDrag + this.config.friction)));

    // Compressing into the plenum, throttle closure/venting, and engine
    // consumption all influence pressure. Shaft speed does not directly give torque.
    const supplyRate = 8 * throttle * (0.35 + 0.65 * this.turboSpeed);
    const ventRate = 20 * (1 - throttle) * (1 - throttle);
    const consumptionRate = 0.6 * rpmFactor * (2200 / 3000);
    const rate = supplyRate + ventRate + consumptionRate;
    const target = 1 + (this.compressorPressurePotential - 1) * supplyRate / Math.max(0.001, rate);
    this.manifoldPressure = clamp(target + (this.manifoldPressure - target) * Math.exp(-rate * dt),
      1, this.config.maxPressureRatio);
  }
}
