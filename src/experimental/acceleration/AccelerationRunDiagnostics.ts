import type { VehicleInputState } from '../../input/VehicleInputState';
import type { VehicleRuntimeSnapshot } from '../../vehicle/physics/VehicleDynamics';
import { WHEEL_IDS, type WheelContactSet } from '../../vehicle/physics/WheelContact';
import type { AccelerationTestState } from './AccelerationTest';

export interface AccelerationRunContext {
  vehicleId: string;
  vehicleVersion: number;
  groundId: string;
  groundVersion: number | string;
  weather: string;
  wetness: number;
}
interface RunSample {
  time: number;
  speedKmh: number;
  position: { x: number; z: number; yaw: number; groundHeight: number };
  driver: { throttle: number; brake: number; steering: number; handbrake: number; source: string;
    trigger?: { rtRaw: number; rtNormalized: number; throttleCommand: number } };
  actuator: { throttle: number; brake: number; steering: number };
  driveMode: string | undefined;
  powertrain: VehicleRuntimeSnapshot['powertrain'];
  transmission: VehicleRuntimeSnapshot['transmission'];
  assists: VehicleRuntimeSnapshot['driverAssists'] & { frontTorqueFactor: number; rearTorqueFactor: number };
  forces: VehicleRuntimeSnapshot['forces'];
  wheels: { id: string; surface: string; wetness: number; grip: number | undefined; normalLoad: number;
    contactHeight: number | undefined; normal: { x: number; y: number; z: number }; omega: number; slip: number; driveTorque: number; brakeTorque: number; handbrakeTorque: number; temperature: number | undefined; pressure: number | undefined }[];
}
export interface AccelerationRunReport {
  schemaVersion: 1;
  recorderVersion: string;
  context: AccelerationRunContext;
  date: string;
  measurement: AccelerationTestState;
  initial: RunSample | null;
  samples: RunSample[];
  truncated: boolean;
  summary: { elapsed: number; throttleBelow95Seconds: number; serviceBrakeSeconds: number;
    tcsSeconds: number; escSeconds: number; peakThermalDerate: number; surfaces: string[] };
}
const STORAGE_KEY = 'drivergame.acceleration-diagnostic.v1';
const MAX_SAMPLES = 1800;

/** Optional benchmark-only observer. Never sends a driving command or changes
 * timing. Samples at 20 Hz, summarizes at 120 Hz, checkpoints once on finish. */
export class AccelerationRunDiagnostics {
  public report: AccelerationRunReport | null = null;
  private elapsed = 0;
  private sampleStep = 0;
  private finished = false;
  private readonly surfaces = new Set<string>();
  public constructor(private readonly storage?: Pick<Storage, 'setItem'>,
    private readonly readTrigger?: () => { rtRaw: number; rtNormalized: number; throttleCommand: number } | undefined) {}
  public arm(context: AccelerationRunContext, state: AccelerationTestState): void {
    this.elapsed = this.sampleStep = 0; this.finished = false; this.surfaces.clear();
    this.report = { schemaVersion: 1, recorderVersion: 'runtime-performance-2026-10-15-v2',
      date: new Date().toISOString(), context: { ...context }, measurement: structuredClone(state),
      initial: null, samples: [], truncated: false,
      summary: { elapsed: 0, throttleBelow95Seconds: 0, serviceBrakeSeconds: 0,
        tcsSeconds: 0, escSeconds: 0, peakThermalDerate: 0, surfaces: [] } };
  }
  public update(dt: number, state: AccelerationTestState, before: VehicleRuntimeSnapshot, after: VehicleRuntimeSnapshot,
    driver: VehicleInputState, controls: VehicleInputState, contacts: WheelContactSet | null,
    frontTorqueFactor: number, rearTorqueFactor: number, environment?: Pick<AccelerationRunContext, 'weather' | 'wetness'>): void {
    const report = this.report;
    if (!report || this.finished || !(dt > 0) || !Number.isFinite(dt)) return;
    if (!report.initial && environment) { report.context.weather = environment.weather; report.context.wetness = environment.wetness; }
    const capture = (snapshot: VehicleRuntimeSnapshot, time: number): RunSample => ({ time, speedKmh: snapshot.speedKmh,
      position: { x: snapshot.x, z: snapshot.z, yaw: snapshot.yaw, groundHeight: snapshot.chassis.groundHeight },
      driver: { throttle: driver.throttle, brake: driver.brake, steering: driver.steering, handbrake: driver.handbrake,
        source: driver.sourceMetadata.primary?.kind ?? driver.source, trigger: this.readTrigger?.() },
      actuator: { throttle: controls.throttle, brake: controls.brake, steering: controls.steering },
      driveMode: snapshot.driveMode, powertrain: structuredClone(snapshot.powertrain), transmission: structuredClone(snapshot.transmission),
      assists: { ...snapshot.driverAssists, frontTorqueFactor, rearTorqueFactor }, forces: { ...snapshot.forces },
      wheels: WHEEL_IDS.map(id => { const wheel = snapshot.wheels[id]; return { id, surface: wheel.surfaceType,
        wetness: contacts?.[id].wetness ?? report.context.wetness, grip: contacts?.[id].longitudinalGrip,
        normalLoad: wheel.normalLoad, contactHeight: contacts?.[id].height, normal: { ...wheel.groundNormal }, omega: wheel.angularVelocity, slip: wheel.slipRatio,
        driveTorque: wheel.driveTorque, brakeTorque: wheel.appliedBrakeTorque, handbrakeTorque: wheel.appliedHandbrakeTorque,
        temperature: wheel.tyre?.temperatureC, pressure: wheel.tyre?.gaugePressureKPa }; }) });
    const measuring = state.phase === 'RUNNING' || state.phase === 'COMPLETED';
    if (measuring) {
      if (!report.initial) report.initial = capture(before, 0);
      this.elapsed += dt;
      const summary = report.summary;
      summary.elapsed = state.current.elapsedSeconds;
      summary.throttleBelow95Seconds += driver.throttle < .95 ? dt : 0;
      summary.serviceBrakeSeconds += WHEEL_IDS.some(id => after.wheels[id].appliedBrakeTorque > 1) ? dt : 0;
      summary.tcsSeconds += after.driverAssists.tcsActive ? dt : 0;
      summary.escSeconds += after.driverAssists.escActive ? dt : 0;
      summary.peakThermalDerate = Math.max(summary.peakThermalDerate, after.powertrain.ev?.thermalDerateFraction ?? 0);
      for (const id of WHEEL_IDS) this.surfaces.add(after.wheels[id].surfaceType);
      if (this.sampleStep++ % 6 === 0 || state.phase === 'COMPLETED') {
        if (report.samples.length < MAX_SAMPLES) report.samples.push(capture(after, this.elapsed));
        else report.truncated = true;
      }
    }
    if (state.phase !== 'ARMED' && state.phase !== 'RUNNING') {
      report.measurement = structuredClone(state); report.summary.surfaces = [...this.surfaces]; this.finished = true;
      try { this.storage?.setItem(STORAGE_KEY, JSON.stringify(report)); } catch { /* Optional origin-specific storage. */ }
    }
  }
  public serialize(): string | null {
    return this.report?.initial ? JSON.stringify(this.report, null, 2) : null;
  }
}
