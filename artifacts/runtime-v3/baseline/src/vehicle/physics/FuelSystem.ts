import type { EngineConfig, FuelConfig, VehicleDriveMode } from '../config';
import type { EngineTorqueSample } from './Engine';
import { clamp, clamp01 } from './math';

export interface FuelSnapshot {
  tankCapacityL: number;
  currentFuelL: number;
  fuelUsedL: number;
  /** 0..100, suitable for instrument percentage displays. */
  fuelPercent: number;
  fuelMassKg: number;
  lowFuel: boolean;
  emptyFuel: boolean;
  currentFuelFlowLPerHour: number;
  instantConsumption: number;
  instantConsumptionUnit: 'L/h' | 'L/100km';
  /** Trip average includes idle fuel; unavailable before 100 m of travel. */
  averageConsumptionLPer100km: number | null;
  tripFuelUsedL: number;
  tripDistanceKm: number;
  estimatedRangeKm: number;
}

/** Fuel accounting only. The engine owns torque/rotation, the chassis owns mass. */
export class FuelSystem {
  private fuelL: number;
  private usedL = 0;
  private distanceKm = 0;
  private flowLPerHour = 0;
  private speedKmh = 0;
  private recentFuelLPerSecond: number;
  private recentDistanceKmPerSecond = 50 / 3600;

  public constructor(public readonly config: FuelConfig, private readonly engine: EngineConfig) {
    this.fuelL = clamp(config.defaultFuelL, 0, config.tankCapacityL);
    this.recentFuelLPerSecond = config.referenceConsumptionLPer100km / 100 * this.recentDistanceKmPerSecond;
  }

  public get currentFuelL(): number { return this.fuelL; }
  public get fuelMassKg(): number { return this.fuelL * this.config.fuelDensity; }
  public get hasFuel(): boolean { return this.fuelL > 0; }

  /** Settings edits change tank contents, never trip fuel usage. */
  public setCurrentFuelL(litres: number): void {
    if (!Number.isFinite(litres)) return;
    this.fuelL = clamp(litres, 0, this.config.tankCapacityL);
    if (!this.hasFuel) this.flowLPerHour = 0;
  }

  public resetTrip(): void {
    this.usedL = 0;
    this.distanceKm = 0;
    this.flowLPerHour = 0;
    this.speedKmh = 0;
    this.recentDistanceKmPerSecond = 50 / 3600;
    this.recentFuelLPerSecond = this.config.referenceConsumptionLPer100km / 100 * this.recentDistanceKmPerSecond;
  }

  /** Receives the torque actually integrated by Engine, including governor/rev hang. */
  public update(dt: number, rpm: number, throttle: number, torque: EngineTorqueSample | undefined,
    speed: number, lateralSpeed: number, mode: VehicleDriveMode = 'NORMAL'): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.speedKmh = Math.hypot(speed, lateralSpeed) * 3.6;
    const distance = this.speedKmh * dt / 3600;
    this.distanceKm += distance;
    const positiveTorque = torque === undefined ? 0 :
      Math.max(0, torque.combustionTorque + torque.idleControlTorque + torque.revHangTorque);
    let demandLPerHour = 0;
    if (this.hasFuel && positiveTorque > 0 && rpm > 0) {
      const load = clamp01(positiveTorque / Math.max(1, this.fullLoadTorque(rpm)));
      const rpmFraction = clamp01(rpm / this.engine.redlineRPM);
      // Pumping/heat losses penalise very light load; high RPM and enrichment
      // reduce efficiency. Turbo configuration is already reflected in actual torque.
      const efficiency = clamp(this.config.peakThermalEfficiency - 0.12 * (1 - load) ** 2 -
        0.065 * clamp01((rpmFraction - 0.5) / 0.5) ** 2 -
        0.025 * clamp01((throttle - 0.8) / 0.2), 0.12, 0.40);
      const powerW = positiveTorque * rpm * Math.PI * 2 / 60;
      // Petrol lower heating value: 43.2 MJ/kg. Idle floor includes combustion
      // heat/accessory losses; max avoids counting governor fuel twice.
      const powerFlow = powerW * 3600 / (efficiency * this.config.fuelDensity * 43_200_000);
      const idleFloor = this.engine.displacementL * (0.34 + 0.05 * Math.max(0, rpm / this.engine.idleRPM - 1));
      const modeCalibration = mode === 'ECO' ? 0.98 : mode === 'SPORT' ? 1.025 : 1;
      demandLPerHour = Math.max(idleFloor, powerFlow) * modeCalibration;
    }
    const burnedL = Math.min(this.fuelL, demandLPerHour * dt / 3600);
    this.fuelL = Math.max(0, this.fuelL - burnedL);
    this.usedL += burnedL;
    this.flowLPerHour = this.hasFuel ? burnedL * 3600 / dt : 0;
    // Filter fuel and distance separately over ~120 s of moving history. Holding
    // at low speed prevents idle or one launch from destabilising the range.
    if (this.speedKmh >= 10) {
      const blend = 1 - Math.exp(-dt / 120);
      this.recentFuelLPerSecond += (burnedL / dt - this.recentFuelLPerSecond) * blend;
      this.recentDistanceKmPerSecond += (distance / dt - this.recentDistanceKmPerSecond) * blend;
    }
  }

  public getSnapshot(): FuelSnapshot {
    const average = this.distanceKm >= 0.1 ? this.usedL / this.distanceKm * 100 : null;
    const recent = this.recentFuelLPerSecond / Math.max(1e-6, this.recentDistanceKmPerSecond) * 100;
    const tripWeight = Math.min(0.3, this.distanceKm / 10 * 0.3);
    const rangeConsumption = Math.max(2, recent * (1 - tripWeight) + (average ?? recent) * tripWeight);
    return {
      tankCapacityL: this.config.tankCapacityL,
      currentFuelL: this.fuelL,
      fuelUsedL: this.usedL,
      fuelPercent: this.fuelL / this.config.tankCapacityL * 100,
      fuelMassKg: this.fuelMassKg,
      lowFuel: this.fuelL <= this.config.tankCapacityL * 0.1,
      emptyFuel: !this.hasFuel,
      currentFuelFlowLPerHour: this.flowLPerHour,
      instantConsumption: this.speedKmh < 10 ? this.flowLPerHour : this.flowLPerHour / this.speedKmh * 100,
      instantConsumptionUnit: this.speedKmh < 10 ? 'L/h' : 'L/100km',
      averageConsumptionLPer100km: average,
      tripFuelUsedL: this.usedL,
      tripDistanceKm: this.distanceKm,
      estimatedRangeKm: this.fuelL / rangeConsumption * 100,
    };
  }

  private fullLoadTorque(rpm: number): number {
    const curve = this.engine.torqueCurve;
    for (let i = 1; i < curve.length; i++) {
      const lower = curve[i - 1]!;
      const upper = curve[i]!;
      if (rpm <= upper.rpm) return lower.torque + (upper.torque - lower.torque) *
        clamp01((rpm - lower.rpm) / Math.max(1, upper.rpm - lower.rpm));
    }
    return curve[curve.length - 1]?.torque ?? 1;
  }
}
