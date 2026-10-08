export interface TripRecord {
  distanceKm: number;
  /** Time in the simulated driving session, including stops and ignition-off coast. */
  operatingTimeSeconds: number;
  movingTimeSeconds: number;
  fuelUsedL: number;
}
export interface TripSnapshot extends TripRecord {
  averageSpeedKmh: number | null;
  averageFuelConsumptionLPer100km: number | null;
}
export interface TripComputerSnapshot { totalDistanceKm: number; tripA: TripSnapshot; tripB: TripSnapshot }
const emptyTrip = (): TripRecord => ({ distanceKm: 0, operatingTimeSeconds: 0, movingTimeSeconds: 0, fuelUsedL: 0 });

/** Simulation accounting only; storage and vehicle identity belong to game lifecycle. */
export class TripComputer {
  private totalDistanceKm = 0;
  private tripA = emptyTrip();
  private tripB = emptyTrip();
  public update(dt: number, speed: number, consumedFuelL = 0): void {
    if (!Number.isFinite(dt) || dt <= 0 || !Number.isFinite(speed)) return;
    const distance = Math.abs(speed) * dt / 1000;
    this.totalDistanceKm += distance;
    this.updateTrip(this.tripA, distance, dt, speed, consumedFuelL);
    this.updateTrip(this.tripB, distance, dt, speed, consumedFuelL);
  }
  private updateTrip(trip: TripRecord, distance: number, dt: number, speed: number, consumedFuelL: number): void {
    trip.distanceKm += distance; trip.operatingTimeSeconds += dt;
    if (Math.abs(speed) > .1) trip.movingTimeSeconds += dt;
    trip.fuelUsedL += Number.isFinite(consumedFuelL) ? Math.max(0, consumedFuelL) : 0;
  }
  public resetTripA(): void { this.tripA = emptyTrip(); }
  public resetTripB(): void { this.tripB = emptyTrip(); }
  public getSnapshot(): TripComputerSnapshot {
    const snapshot = (trip: TripRecord): TripSnapshot => ({ ...trip,
      averageSpeedKmh: trip.operatingTimeSeconds > 0 ? trip.distanceKm * 3600 / trip.operatingTimeSeconds : null,
      averageFuelConsumptionLPer100km: trip.distanceKm >= .1 ? trip.fuelUsedL / trip.distanceKm * 100 : null });
    return { totalDistanceKm: this.totalDistanceKm, tripA: snapshot(this.tripA), tripB: snapshot(this.tripB) };
  }
  public restore(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    const saved = value as Partial<TripComputerSnapshot>;
    const valid = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
    if (valid(saved.totalDistanceKm)) this.totalDistanceKm = saved.totalDistanceKm;
    const read = (value: Partial<TripRecord> | undefined): TripRecord => {
      const trip = emptyTrip();
      if (value) for (const key of Object.keys(trip) as (keyof TripRecord)[]) if (valid(value[key])) trip[key] = value[key];
      return trip;
    };
    this.tripA = read(saved.tripA); this.tripB = read(saved.tripB);
  }
}
