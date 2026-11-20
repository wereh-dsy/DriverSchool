import type { HybridMode, P2EvFallbackReason, P2HybridConfig, P2TerrainMode } from '../config/P2HybridConfig';
import type { VehicleDriveMode } from '../config/VehiclePhysicsConfig';
import { clamp, clamp01 } from '../physics/math';

export interface HybridDrivingState {
  dt: number; operational: boolean; connected: boolean; speed: number; demandTorque: number;
  shaftOmega: number; soc: number; dischargePower: number; chargePower: number;
  brake: number; engineRunning: boolean; fuelAvailable: boolean; shifting: boolean;
  engineTorqueCapacity: number; motorTorqueCapacity: number; driveMode?: VehicleDriveMode | string;
  terrainMode?: P2TerrainMode;
  batteryThermalDerated?: boolean;
  pedal?: number;
  driving?: boolean;
}
/** Strategy only. Actuators and energy accounting remain in P2HybridPowertrain. */
export class HybridEnergyManagement {
  public mode: HybridMode;
  public holdSOC: number;
  public activeTargetSOC = 0;
  public engineRequested = false;
  public engineTorqueRequest = 0;
  public generationPowerRequest = 0;
  public evFallbackActive = false;
  public evFallbackReason: P2EvFallbackReason = 'NONE';
  public state: 'OFF' | 'EV' | 'STARTING' | 'ENGINE' | 'BOOST' | 'CHARGE' | 'REGEN' = 'OFF';
  private runTime = 0;
  private offTime = 100;
  private lowSOC = false;
  private startTime = 0;
  private stopTime = 0;
  private evOverloadTime = 0;
  public constructor(private readonly config: P2HybridConfig) {
    this.mode = config.defaultMode; this.holdSOC = config.energyManagement.holdSOC;
  }
  public setMode(mode: HybridMode, targetSOC?: number): void {
    this.mode = mode;
    if (targetSOC !== undefined && Number.isFinite(targetSOC)) this.holdSOC = clamp(targetSOC, .15, .85);
  }
  public reset(): void {
    this.mode = this.config.defaultMode; this.holdSOC = this.config.energyManagement.holdSOC;
    this.activeTargetSOC = 0; this.evFallbackActive = false; this.evFallbackReason = 'NONE';
    this.engineRequested = this.lowSOC = false; this.runTime = 0; this.offTime = 100;
    this.engineTorqueRequest = this.generationPowerRequest = 0; this.state = 'OFF';
    this.startTime = this.stopTime = this.evOverloadTime = 0;
  }
  public update(s: HybridDrivingState): void {
    const c = this.config.energyManagement;
    const intel = this.config.intelligent;
    const dmStrat = s.driveMode ? this.config.driveModeStrategy?.[s.driveMode as VehicleDriveMode] : undefined;
    const terrainStrat = s.terrainMode && s.terrainMode !== 'OFF' ? this.config.terrainStrategies?.[s.terrainMode] : undefined;
    this.runTime = s.engineRunning ? this.runTime + s.dt : 0;
    this.offTime = !s.engineRunning ? this.offTime + s.dt : 0;
    if (s.soc <= c.minimumSOC) this.lowSOC = true;
    if (s.soc >= c.restartSOC) this.lowSOC = false;
    this.engineTorqueRequest = this.generationPowerRequest = 0;
    if (!s.operational || s.connected) {
      this.engineRequested = false; this.state = 'OFF';
      this.evFallbackActive = false; this.evFallbackReason = 'NONE';
      this.startTime = this.stopTime = this.evOverloadTime = 0; return;
    }
    const absSpeed = Math.abs(s.speed);
    const power = s.demandTorque * Math.max(80, Math.abs(s.shaftOmega));
    const pedal = s.pedal ?? 0;
    const isEV = this.mode === 'EV';
    const isIntelligent = this.mode === 'INTELLIGENT';
    const legacySport = this.mode === 'SPORT';
    const driveSport = s.driveMode === 'SPORT' || dmStrat?.sportEngineReady === true;
    // Explicit EV stays electric unless physical EV limits trigger fallback.
    const sport = legacySport || (!isEV && driveSport && (s.driving !== false && (pedal > .08 || absSpeed > 2)));
    const terrainReady = !isEV && terrainStrat?.preferEngineReady === true && s.driving !== false && pedal > .08;

    // EV priority exit detection (low SOC, thermal/battery power limit, EV speed ceiling, sustained crawl overload).
    const evMaxSpeed = intel?.evMaxSpeedMps ?? 34.72;
    const packRestricted = s.dischargePower < this.config.motor.maxDrivePower * .78;
    const evThermalExit = isEV && (s.batteryThermalDerated === true && (power > s.dischargePower * .86 || s.dischargePower < 25000));
    const evBatteryExit = isEV && !evThermalExit && packRestricted && (power > s.dischargePower * .88 || s.demandTorque > s.motorTorqueCapacity * 1.05);
    const evSpeedExit = isEV && absSpeed > evMaxSpeed && pedal > .12;
    const crawlOverload = isEV && pedal >= .92 && absSpeed < 3.0 && s.demandTorque > s.motorTorqueCapacity * 1.25;
    this.evOverloadTime = crawlOverload ? this.evOverloadTime + s.dt : Math.max(0, this.evOverloadTime - s.dt * 2);
    const evPowerExit = isEV && this.evOverloadTime >= 2.5;
    if (isEV) {
      if (this.lowSOC) { this.evFallbackActive = true; this.evFallbackReason = 'LOW_SOC'; }
      else if (evThermalExit) { this.evFallbackActive = true; this.evFallbackReason = 'THERMAL_LIMIT'; }
      else if (evBatteryExit) { this.evFallbackActive = true; this.evFallbackReason = 'BATTERY_LIMIT'; }
      else if (evSpeedExit) { this.evFallbackActive = true; this.evFallbackReason = 'SPEED_LIMIT'; }
      else if (evPowerExit) { this.evFallbackActive = true; this.evFallbackReason = 'POWER_DEMAND'; }
      else { this.evFallbackActive = false; this.evFallbackReason = 'NONE'; }
    } else {
      this.evFallbackActive = false; this.evFallbackReason = 'NONE';
    }

    // Intelligent speed-tiered target SOC & start thresholds (distinct from plain HEV).
    let smartTarget = 0;
    let speedPowerScale = 1;
    let smartHighwayCruise = false;
    let generationCapW = c.maximumGenerationPower;
    if (isIntelligent) {
      const urbanV = intel?.urbanSpeedMps ?? 50 / 3.6;
      const highV = intel?.highwaySpeedMps ?? 85 / 3.6;
      const offset = dmStrat?.smartTargetSocOffset ?? 0;
      if (absSpeed < urbanV) {
        speedPowerScale = intel?.urbanStartPowerScale ?? 1.35;
        smartTarget = (intel?.urbanTargetSOC ?? .28) + offset;
      } else if (absSpeed < highV) {
        const f = clamp01((absSpeed - urbanV) / Math.max(1, highV - urbanV));
        speedPowerScale = (intel?.midStartPowerScale ?? 1.05) + f * ((intel?.highwayStartPowerScale ?? .62) - (intel?.midStartPowerScale ?? 1.05));
        smartTarget = (intel?.midTargetSOC ?? .36) + f * ((intel?.highwayTargetSOC ?? .44) - (intel?.midTargetSOC ?? .36)) + offset;
      } else {
        speedPowerScale = intel?.highwayStartPowerScale ?? .62;
        smartTarget = (intel?.highwayTargetSOC ?? .44) + offset;
        smartHighwayCruise = pedal > .08 && s.driving !== false;
      }
      smartTarget = clamp(smartTarget, c.restartSOC, .55);
      generationCapW = intel?.generationPowerCapW ?? 16000;
    }

    const target = this.mode === 'CHARGE' ? c.chargeTargetSOC
      : this.mode === 'CHARGE_HOLD' ? this.holdSOC
      : isIntelligent ? (this.lowSOC ? Math.max(c.restartSOC, smartTarget) : smartTarget)
      : this.lowSOC ? c.restartSOC : 0;
    this.activeTargetSOC = target;
    const deficit = target - s.soc;
    const startPower = c.engineStartPower * (dmStrat?.engineStartPowerScale ?? 1) * (terrainStrat?.engineStartPowerScale ?? 1) * speedPowerScale;
    const stopPower = c.engineStopPower * Math.min(1.15, dmStrat?.engineStartPowerScale ?? 1);
    const startSpeed = c.engineStartSpeed * (dmStrat?.engineStartSpeedScale ?? 1);
    const startDelay = (c.startDelay ?? 0) * (dmStrat?.startDelayScale ?? 1);
    const insufficient = s.demandTorque > s.motorTorqueCapacity * .95 || power > s.dischargePower * .85;
    const kickdown = pedal >= (c.startDemand ?? 1) && s.demandTorque > 20;
    const smartNeedsCharge = isIntelligent && deficit > .012 && (absSpeed > 6 || s.soc < c.restartSOC + .04);
    const nonEvWantsEngine = !isEV && (
      smartHighwayCruise ||
      smartNeedsCharge ||
      power > startPower ||
      absSpeed > startSpeed ||
      insufficient ||
      kickdown ||
      terrainReady
    );
    const wantsEngine = this.lowSOC || (this.mode === 'CHARGE' || this.mode === 'CHARGE_HOLD' ? deficit > .008 : false) ||
      sport || this.evFallbackActive || nonEvWantsEngine;
    this.startTime = wantsEngine ? this.startTime + s.dt : 0;
    this.stopTime = !wantsEngine && power < stopPower ? this.stopTime + s.dt : 0;
    const canStop = !wantsEngine && power < stopPower && this.runTime >= c.minimumRunTime;
    if (!s.fuelAvailable) this.engineRequested = false;
    else if (wantsEngine && (this.lowSOC || legacySport || this.evFallbackActive || this.startTime >= startDelay) &&
      (this.offTime >= c.minimumOffTime || this.lowSOC || insufficient || this.evFallbackActive)) this.engineRequested = true;
    else if (canStop && this.stopTime >= (c.stopDelay ?? 0) || isEV && !this.evFallbackActive) this.engineRequested = false;
    if (this.engineRequested && s.engineRunning) {
      const generationFraction = clamp01(deficit / (isIntelligent ? .10 : .06));
      // Spare crank output only: full acceleration, braking and ratio changes suspend generation.
      const spare = Math.max(0, s.engineTorqueCapacity - s.demandTorque);
      if ((s.driving === false || s.brake < .02) && !s.shifting && Math.abs(s.shaftOmega) * 30 / Math.PI >= c.generationMinimumRPM)
        this.generationPowerRequest = Math.min(generationCapW * generationFraction,
          s.chargePower / this.config.inverterEfficiency, spare * Math.abs(s.shaftOmega));
      const efficientLoad = dmStrat?.engineEfficientLoad ?? c.engineEfficientLoad;
      const desired = sport || legacySport ? s.demandTorque : Math.min(s.demandTorque, s.engineTorqueCapacity * efficientLoad);
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
