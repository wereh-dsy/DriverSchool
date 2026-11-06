import type { HybridMode, P2HybridConfig } from '../config/P2HybridConfig';
import { clamp, clamp01 } from '../physics/math';

export interface HybridDrivingState {
  dt: number; operational: boolean; connected: boolean; speed: number; demandTorque: number;
  shaftOmega: number; soc: number; dischargePower: number; chargePower: number;
  brake: number; engineRunning: boolean; fuelAvailable: boolean; shifting: boolean;
  engineTorqueCapacity: number; motorTorqueCapacity: number; driveMode?: string;
  pedal?: number;
  driving?: boolean;
}
/** Strategy only. Actuators and energy accounting remain in P2HybridPowertrain. */
export class HybridEnergyManagement {
  public mode: HybridMode;
  public holdSOC: number;
  public engineRequested = false;
  public engineTorqueRequest = 0;
  public generationPowerRequest = 0;
  public state: 'OFF' | 'EV' | 'STARTING' | 'ENGINE' | 'BOOST' | 'CHARGE' | 'REGEN' = 'OFF';
  private runTime = 0;
  private offTime = 100;
  private lowSOC = false;
  private startTime = 0;
  private stopTime = 0;
  public constructor(private readonly config: P2HybridConfig) {
    this.mode = config.defaultMode; this.holdSOC = config.energyManagement.holdSOC;
  }
  public setMode(mode: HybridMode, targetSOC?: number): void {
    this.mode = mode;
    if (targetSOC !== undefined && Number.isFinite(targetSOC)) this.holdSOC = clamp(targetSOC, .15, .85);
  }
  public reset(): void {
    this.mode = this.config.defaultMode; this.holdSOC = this.config.energyManagement.holdSOC;
    this.engineRequested = this.lowSOC = false; this.runTime = 0; this.offTime = 100;
    this.engineTorqueRequest = this.generationPowerRequest = 0; this.state = 'OFF';
    this.startTime = this.stopTime = 0;
  }
  public update(s: HybridDrivingState): void {
    const c = this.config.energyManagement;
    this.runTime = s.engineRunning ? this.runTime + s.dt : 0;
    this.offTime = !s.engineRunning ? this.offTime + s.dt : 0;
    if (s.soc <= c.minimumSOC) this.lowSOC = true;
    if (s.soc >= c.restartSOC) this.lowSOC = false;
    this.engineTorqueRequest = this.generationPowerRequest = 0;
    if (!s.operational || s.connected) { this.engineRequested = false; this.state = 'OFF'; this.startTime = this.stopTime = 0; return; }
    const power = s.demandTorque * Math.max(80, Math.abs(s.shaftOmega));
    const sport = this.mode === 'SPORT' || s.driveMode === 'SPORT';
    const target = this.mode === 'CHARGE' ? c.chargeTargetSOC : this.mode === 'CHARGE_HOLD' ? this.holdSOC : this.lowSOC ? c.restartSOC : 0;
    const deficit = target - s.soc;
    const insufficient = s.demandTorque > s.motorTorqueCapacity * .95 || power > s.dischargePower * .85;
    const kickdown = (s.pedal ?? 0) >= (c.startDemand ?? 1) && s.demandTorque > 20;
    const wantsEngine = this.lowSOC || deficit > .008 || sport && s.demandTorque > 20 ||
      this.mode !== 'EV' && (power > c.engineStartPower || Math.abs(s.speed) > c.engineStartSpeed || insufficient || kickdown);
    this.startTime = wantsEngine ? this.startTime + s.dt : 0;
    this.stopTime = !wantsEngine && power < c.engineStopPower ? this.stopTime + s.dt : 0;
    const canStop = !wantsEngine && power < c.engineStopPower && this.runTime >= c.minimumRunTime;
    if (!s.fuelAvailable) this.engineRequested = false;
    else if (wantsEngine && (this.lowSOC || sport || this.startTime >= (c.startDelay ?? 0)) &&
      (this.offTime >= c.minimumOffTime || this.lowSOC || insufficient)) this.engineRequested = true;
    else if (canStop && this.stopTime >= (c.stopDelay ?? 0) || this.mode === 'EV' && !this.lowSOC && !sport) this.engineRequested = false;
    if (this.engineRequested && s.engineRunning) {
      const generationFraction = clamp01(deficit / .06);
      // Spare crank output only: full acceleration, braking and ratio changes suspend generation.
      const spare = Math.max(0, s.engineTorqueCapacity - s.demandTorque);
      if ((s.driving === false || s.brake < .02) && !s.shifting && Math.abs(s.shaftOmega) * 30 / Math.PI >= c.generationMinimumRPM)
        this.generationPowerRequest = Math.min(c.maximumGenerationPower * generationFraction,
          s.chargePower / this.config.inverterEfficiency, spare * Math.abs(s.shaftOmega));
      const desired = sport ? s.demandTorque : Math.min(s.demandTorque, s.engineTorqueCapacity * c.engineEfficientLoad);
      // A depleted/cold pack requires actual ICE takeover, not a fixed motor fraction.
      const mandatory = Math.max(0, s.demandTorque - s.motorTorqueCapacity);
      this.engineTorqueRequest = Math.min(s.engineTorqueCapacity, Math.max(desired, mandatory) +
        this.generationPowerRequest / Math.max(1, Math.abs(s.shaftOmega)));
    }
    this.state = s.brake > .02 && s.driving !== false ? 'REGEN' : this.engineRequested && !s.engineRunning ? 'STARTING' :
      this.generationPowerRequest > 100 ? 'CHARGE' : this.engineTorqueRequest > 0 ?
        s.demandTorque > this.engineTorqueRequest + 10 ? 'BOOST' : 'ENGINE' : 'EV';
  }
}
