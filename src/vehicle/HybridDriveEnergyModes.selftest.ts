import * as T from 'three';
import { createNeutralVehicleInputState } from '../input/VehicleInputState';
import { VehicleInputSystem } from '../input/VehicleInputSystem';
import { createVehicleAcousticTelemetry, populateAcousticTelemetry } from '../audio/AcousticTelemetry';
import { createAcousticMixState, evaluateVehicleAcoustics } from '../audio/VehicleAcousticModel';
import { TANK500_HI4T_ACOUSTIC_PROFILE, QIN_PLUS_DMI_ACOUSTIC_PROFILE } from '../audio/profiles/hybridProfiles';
import { createTank500Hi4TPhysicsConfig } from './config/tank500Hi4TPhysicsConfig';
import { createQinPlusDmiPhysicsConfig } from './config/qinPlusDmiPhysicsConfig';
import { createVehiclePhysicsConfig } from './VehicleCatalog';
import { VehicleDynamics } from './physics/VehicleDynamics';
import { P2HybridPowertrain } from './powertrain/P2HybridPowertrain';
import { EhsHybridSystem } from './powertrain/EhsHybridSystem';
import { ElectricPowertrain } from './powertrain/ElectricPowertrain';
import { createWheelContactBuffer, WHEEL_IDS } from './physics/WheelContact';
import { SURFACE_MATERIALS, type SurfaceType } from '../world/SurfaceMaterial';
import { Tank500Display } from './visual/Tank500Displays';
import { QinPlusDisplay } from './visual/QinPlusDisplays';
import type { InstrumentTelemetry } from './visual/InstrumentCluster';
import type { HybridMode } from './config/P2HybridConfig';
import type { EhsDriverMode } from './config/EhsHybridConfig';
import type { VehicleDriveMode } from './config/VehiclePhysicsConfig';

const DT = 1 / 120;

function makeSurfaceEnv(material: SurfaceType) {
  const contacts = createWheelContactBuffer();
  for (const id of WHEEL_IDS) Object.assign(contacts[id], SURFACE_MATERIALS[material], { supportValid: true, height: 0 });
  return { wheelContacts: contacts };
}

interface MutableMockGamepad {
  axes: number[];
  buttons: GamepadButton[];
  connected: boolean;
  id: string;
  index: number;
  mapping: GamepadMappingType;
  timestamp: number;
}

function createMockGamepad(): MutableMockGamepad {
  return {
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 })),
    connected: true,
    id: 'Mock Standard Gamepad',
    index: 0,
    mapping: 'standard',
    timestamp: 1,
  };
}

function setBtn(pad: MutableMockGamepad, idx: number, val: number): void {
  pad.buttons[idx] = { pressed: val > 0.5, touched: val > 0, value: val };
  pad.timestamp += 1;
}

export function runHybridDriveEnergyModesSelfTest() {
  let assertions = 0;
  const check = (ok: boolean, msg: string) => {
    assertions += 1;
    if (!ok) throw new Error(`HybridDriveEnergyModes selftest failed: ${msg}`);
  };
  const asphalt = makeSurfaceEnv('asphalt');
  const snowEnv = makeSurfaceEnv('packed-snow');
  const iceEnv = makeSurfaceEnv('ice');
  const neutral = createNeutralVehicleInputState();
  const report: Record<string, unknown> = {};

  // =========================================================================
  // 1 & 2. THROTTLE RESPONSE & ACCELERATION COMPARISON (Tank 500 & Qin PLUS)
  // =========================================================================
  const tankThrottle: Record<string, { wheelTorqueAt05s: number; speedAt3sKmh: number; speedAt6sKmh: number; socDrop: number; fuelL: number }> = {};
  for (const dm of ['ECO', 'STANDARD', 'SPORT'] as const) {
    const car = new VehicleDynamics<P2HybridPowertrain>(createTank500Hi4TPhysicsConfig(), { driveSelector: 'D', stateOfCharge: 0.75 });
    car.setDriveMode(dm);
    car.powertrain.setHybridMode('HEV');
    const soc0 = car.powertrain.battery.stateOfCharge;
    let tq05 = 0, spd3 = 0;
    for (let i = 0; i < 720; i++) {
      const s = car.stepFixed(DT, { ...neutral, throttle: 0.45 }, asphalt);
      check(!s.recoveredFromInvalidState, `Tank ${dm} finite step`);
      if (i === 59) tq05 = car.powertrain.axleOutput.drivenWheelTorque;
      if (i === 359) spd3 = s.speedKmh;
    }
    const finalSnap = car.getSnapshot();
    tankThrottle[dm] = {
      wheelTorqueAt05s: Number(tq05.toFixed(1)),
      speedAt3sKmh: Number(spd3.toFixed(2)),
      speedAt6sKmh: Number(finalSnap.speedKmh.toFixed(2)),
      socDrop: Number(((soc0 - car.powertrain.battery.stateOfCharge) * 100).toFixed(4)),
      fuelL: Number(car.powertrain.fuel.getSnapshot().fuelUsedL.toFixed(5)),
    };
  }
  check(tankThrottle.ECO!.wheelTorqueAt05s < tankThrottle.STANDARD!.wheelTorqueAt05s &&
    tankThrottle.STANDARD!.wheelTorqueAt05s < tankThrottle.SPORT!.wheelTorqueAt05s,
    `Tank 500 part-throttle response strictly ECO < STANDARD < SPORT: ${JSON.stringify(tankThrottle)}`);
  check(tankThrottle.ECO!.speedAt6sKmh < tankThrottle.STANDARD!.speedAt6sKmh &&
    tankThrottle.STANDARD!.speedAt6sKmh < tankThrottle.SPORT!.speedAt6sKmh,
    `Tank 500 part-throttle acceleration strictly ECO < STANDARD < SPORT: ${JSON.stringify(tankThrottle)}`);
  report.tank500DriveModeResponse = tankThrottle;

  const qinThrottle: Record<string, { wheelTorqueAt05s: number; speedAt3sKmh: number; speedAt6sKmh: number; socDrop: number; fuelL: number; coastRegenNm: number }> = {};
  for (const dm of ['ECO', 'NORMAL', 'SPORT', 'SNOW'] as const) {
    const car = new VehicleDynamics<EhsHybridSystem>(createQinPlusDmiPhysicsConfig(), { driveSelector: 'D', stateOfCharge: 0.80 });
    car.setDriveMode(dm);
    car.powertrain.setHybridMode('HEV');
    const soc0 = car.powertrain.battery.stateOfCharge;
    let tq05 = 0, spd3 = 0;
    for (let i = 0; i < 720; i++) {
      const s = car.stepFixed(DT, { ...neutral, throttle: 0.45 }, asphalt);
      check(!s.recoveredFromInvalidState, `Qin ${dm} finite step`);
      if (i === 59) tq05 = car.powertrain.axleOutput.drivenWheelTorque;
      if (i === 359) spd3 = s.speedKmh;
    }
    const finalSnap = car.getSnapshot();
    // Measure lift-off regen difference (SNOW << NORMAL < ECO)
    let coastRegen = 0;
    for (let i = 0; i < 60; i++) {
      const s = car.stepFixed(DT, { ...neutral, throttle: 0 }, asphalt);
      if (i === 59) coastRegen = s.powertrain.ev?.regenerativeBrakeTorque ?? 0;
    }
    qinThrottle[dm] = {
      wheelTorqueAt05s: Number(tq05.toFixed(1)),
      speedAt3sKmh: Number(spd3.toFixed(2)),
      speedAt6sKmh: Number(finalSnap.speedKmh.toFixed(2)),
      socDrop: Number(((soc0 - car.powertrain.battery.stateOfCharge) * 100).toFixed(4)),
      fuelL: Number(car.powertrain.fuel.getSnapshot().fuelUsedL.toFixed(5)),
      coastRegenNm: Number(coastRegen.toFixed(1)),
    };
  }
  check(qinThrottle.ECO!.wheelTorqueAt05s < qinThrottle.NORMAL!.wheelTorqueAt05s &&
    qinThrottle.NORMAL!.wheelTorqueAt05s < qinThrottle.SPORT!.wheelTorqueAt05s,
    `Qin PLUS part-throttle response strictly ECO < NORMAL < SPORT: ${JSON.stringify(qinThrottle)}`);
  check(qinThrottle.ECO!.speedAt6sKmh < qinThrottle.NORMAL!.speedAt6sKmh &&
    qinThrottle.NORMAL!.speedAt6sKmh < qinThrottle.SPORT!.speedAt6sKmh,
    `Qin PLUS part-throttle acceleration strictly ECO < NORMAL < SPORT: ${JSON.stringify(qinThrottle)}`);
  check(qinThrottle.SNOW!.wheelTorqueAt05s < qinThrottle.ECO!.wheelTorqueAt05s &&
    qinThrottle.SNOW!.coastRegenNm < qinThrottle.ECO!.coastRegenNm * 0.55,
    `Qin PLUS SNOW is genuinely distinct from ECO (gentler torque & much lighter lift-off regen): ${JSON.stringify(qinThrottle)}`);
  report.qinPlusDriveModeResponse = qinThrottle;

  // =========================================================================
  // 3. INDEPENDENT 2D COMBINATIONS (6 Qin PLUS + 9 Tank 500)
  // =========================================================================
  const qinCombos: string[] = [];
  const qinComboCar = new VehicleDynamics<EhsHybridSystem>(createQinPlusDmiPhysicsConfig(), { driveSelector: 'D', stateOfCharge: 0.78 });
  for (const dm of ['ECO', 'NORMAL', 'SPORT'] as const) {
    qinComboCar.setDriveMode(dm);
    for (const em of ['EV', 'HEV'] as const) {
      qinComboCar.powertrain.setHybridMode(em);
      const s = qinComboCar.stepFixed(DT, { ...neutral, throttle: 0.25 }, asphalt);
      check(s.driveMode === dm && s.powertrain.ehs!.mode === em, `Qin 2D combo ${dm}+${em} preserved without overwriting`);
      qinCombos.push(`${dm}+${em}`);
    }
  }
  check(qinCombos.length === 6, 'all 6 basic Qin PLUS combinations independent');
  // Dedicated SNOW toggle restores prior road mode without overwriting NORMAL/ECO/SPORT
  qinComboCar.setDriveMode('SPORT');
  check(qinComboCar.setSnowMode(true) && qinComboCar.driveMode === 'SNOW', 'Qin SNOW toggle activates SNOW');
  check(qinComboCar.setSnowMode(false) && qinComboCar.driveMode === 'SPORT', 'Qin SNOW off restores prior SPORT mode');

  const tankCombos: string[] = [];
  const tankComboCar = new VehicleDynamics<P2HybridPowertrain>(createTank500Hi4TPhysicsConfig(), { driveSelector: 'D', stateOfCharge: 0.75 });
  check(tankComboCar.driveMode === 'STANDARD', 'Tank 500 defaults to OEM STANDARD (not NORMAL)');
  check(tankComboCar.powertrain.energyManagement.mode === 'INTELLIGENT', 'Tank 500 defaults to OEM INTELLIGENT');
  for (const dm of ['ECO', 'STANDARD', 'SPORT'] as const) {
    tankComboCar.setDriveMode(dm);
    for (const em of ['EV', 'HEV', 'INTELLIGENT'] as const) {
      tankComboCar.powertrain.setHybridMode(em);
      const s = tankComboCar.stepFixed(DT, { ...neutral, throttle: 0.25 }, asphalt);
      check(s.driveMode === dm && s.powertrain.hybrid!.mode === em, `Tank 2D combo ${dm}+${em} preserved`);
      tankCombos.push(`${dm}+${em}`);
    }
  }
  check(tankCombos.length === 9, 'all 9 Tank 500 driving x energy combinations independent');
  report.combinations = { qinBasicCount: qinCombos.length, tankCount: tankCombos.length };

  // =========================================================================
  // 4. EV EXIT UNDER LOW SOC AND THERMAL/BATTERY LIMITS (Tank 500 & Qin PLUS)
  // =========================================================================
  // 4a. Tank 500 Low SOC EV exit
  const tankLowEv = new VehicleDynamics<P2HybridPowertrain>(createTank500Hi4TPhysicsConfig(), { driveSelector: 'D', stateOfCharge: 0.13 });
  tankLowEv.powertrain.setHybridMode('EV');
  let tankLowFallback = false, tankLowReason = 'NONE';
  for (let i = 0; i < 600; i++) {
    const s = tankLowEv.stepFixed(DT, { ...neutral, throttle: 0.4 }, asphalt);
    const h = s.powertrain.hybrid!;
    if (h.evFallbackActive) { tankLowFallback = true; tankLowReason = h.evFallbackReason ?? 'NONE'; }
    check(s.powertrain.ev!.batteryPowerKw * 1000 <= tankLowEv.powertrain.battery.dischargeLimit(DT) + 50, 'Tank low-SOC EV never breaches pack discharge limit');
  }
  check(tankLowFallback && tankLowReason === 'LOW_SOC' && tankLowEv.engine.isRunning && tankLowEv.powertrain.fuel.getSnapshot().fuelUsedL > 0,
    `Tank 500 exits EV on low SOC cleanly: fallback=${tankLowFallback} reason=${tankLowReason} running=${tankLowEv.engine.isRunning}`);

  // 4b. Tank 500 Cold Thermal EV exit
  const tankColdCfg = createTank500Hi4TPhysicsConfig(); tankColdCfg.ambientTemperature = -25;
  const tankColdEv = new VehicleDynamics<P2HybridPowertrain>(tankColdCfg, { driveSelector: 'D', stateOfCharge: 0.65 });
  tankColdEv.powertrain.setHybridMode('EV');
  let tankColdReason = 'NONE';
  for (let i = 0; i < 480; i++) {
    const s = tankColdEv.stepFixed(DT, { ...neutral, throttle: 0.7 }, asphalt);
    if (s.powertrain.hybrid!.evFallbackActive) tankColdReason = s.powertrain.hybrid!.evFallbackReason ?? 'NONE';
  }
  check(tankColdReason === 'THERMAL_LIMIT' && tankColdEv.engine.isRunning,
    `Tank 500 exits EV under cold thermal battery derate: reason=${tankColdReason} running=${tankColdEv.engine.isRunning}`);

  // 4c. Qin PLUS Low SOC EV exit
  const qinLowEv = new VehicleDynamics<EhsHybridSystem>(createQinPlusDmiPhysicsConfig(), { driveSelector: 'D', stateOfCharge: 0.19 });
  qinLowEv.powertrain.setHybridMode('EV');
  let qinLowReason = 'NONE';
  for (let i = 0; i < 480; i++) {
    const s = qinLowEv.stepFixed(DT, { ...neutral, throttle: 0.35 }, asphalt);
    if (s.powertrain.ehs!.evFallbackActive) qinLowReason = s.powertrain.ehs!.evFallbackReason ?? 'NONE';
  }
  check(qinLowReason === 'LOW_SOC' && qinLowEv.engine.isRunning && qinLowEv.powertrain.fuel.getSnapshot().fuelUsedL > 0,
    `Qin PLUS exits EV on low SOC: reason=${qinLowReason} running=${qinLowEv.engine.isRunning}`);

  // 4d. Qin PLUS High Power Demand EV exit
  const qinPowerEv = new VehicleDynamics<EhsHybridSystem>(createQinPlusDmiPhysicsConfig(), { driveSelector: 'D', speed: 22, stateOfCharge: 0.75 });
  qinPowerEv.setDriveMode('SPORT');
  qinPowerEv.powertrain.setHybridMode('EV');
  let qinPowerReason = 'NONE';
  for (let i = 0; i < 360; i++) {
    const s = qinPowerEv.stepFixed(DT, { ...neutral, throttle: 1.0 }, asphalt);
    if (s.powertrain.ehs!.evFallbackActive) qinPowerReason = s.powertrain.ehs!.evFallbackReason ?? 'NONE';
  }
  check((qinPowerReason === 'POWER_DEMAND' || qinPowerReason === 'BATTERY_LIMIT') && qinPowerEv.engine.isRunning,
    `Qin PLUS exits EV under sustained full-power demand: reason=${qinPowerReason} running=${qinPowerEv.engine.isRunning}`);
  report.evExits = { tankLowReason, tankColdReason, qinLowReason, qinPowerReason };

  // =========================================================================
  // 5. HIGH SOC HEV STILL RUNS PURE ELECTRIC AT LIGHT LOAD (Both Vehicles)
  // =========================================================================
  const tankHevEv = new VehicleDynamics<P2HybridPowertrain>(createTank500Hi4TPhysicsConfig(), { driveSelector: 'D', stateOfCharge: 0.78 });
  tankHevEv.setDriveMode('STANDARD'); tankHevEv.powertrain.setHybridMode('HEV');
  for (let i = 0; i < 960; i++) tankHevEv.stepFixed(DT, { ...neutral, throttle: 0.20 }, asphalt);
  const tankHevSnap = tankHevEv.getSnapshot();
  check(!tankHevSnap.engineRunning && tankHevSnap.powertrain.hybrid!.mode === 'HEV' && tankHevSnap.powertrain.hybrid!.state === 'EV' &&
    tankHevEv.powertrain.fuel.getSnapshot().fuelUsedL === 0 && tankHevSnap.speed > 4,
    `Tank 500 HEV at high SOC light load stays EV: state=${tankHevSnap.powertrain.hybrid!.state} speed=${tankHevSnap.speed}`);

  const qinHevEv = new VehicleDynamics<EhsHybridSystem>(createQinPlusDmiPhysicsConfig(), { driveSelector: 'D', stateOfCharge: 0.80 });
  qinHevEv.setDriveMode('NORMAL'); qinHevEv.powertrain.setHybridMode('HEV');
  for (let i = 0; i < 960; i++) qinHevEv.stepFixed(DT, { ...neutral, throttle: 0.22 }, asphalt);
  const qinHevSnap = qinHevEv.getSnapshot();
  check(!qinHevSnap.engineRunning && qinHevSnap.powertrain.ehs!.mode === 'HEV' && qinHevSnap.powertrain.ehs!.state === 'EV' &&
    qinHevEv.powertrain.fuel.getSnapshot().fuelUsedL === 0 && qinHevSnap.speed > 4,
    `Qin PLUS HEV at high SOC light load stays EV: state=${qinHevSnap.powertrain.ehs!.state} speed=${qinHevSnap.speed}`);
  report.hevElectricOperation = { tankState: tankHevSnap.powertrain.hybrid!.state, qinState: qinHevSnap.powertrain.ehs!.state };

  // =========================================================================
  // 6. TANK 500 INTELLIGENT MODE SOC MANAGEMENT (Distinct from plain HEV)
  // =========================================================================
  // 6a. Urban low speed (~35 km/h) medium-light load at 65% SOC: INTELLIGENT stays EV longer than HEV!
  const tankIntelUrban = new VehicleDynamics<P2HybridPowertrain>(createTank500Hi4TPhysicsConfig(), { driveSelector: 'D', speed: 8, stateOfCharge: 0.65 });
  tankIntelUrban.setDriveMode('STANDARD'); tankIntelUrban.powertrain.setHybridMode('INTELLIGENT');
  for (let i = 0; i < 480; i++) tankIntelUrban.stepFixed(DT, { ...neutral, throttle: 0.22 }, asphalt);
  check(!tankIntelUrban.engine.isRunning && tankIntelUrban.powertrain.energyManagement.state === 'EV',
    'Tank 500 INTELLIGENT prioritizes EV at urban speeds when SOC is healthy');

  // 6b. Highway cruise (~95 km/h = 26.4 m/s, ~11% steady cruise throttle) at 32% SOC:
  // INTELLIGENT targets ~44% highway SOC, engages ICE in efficient band + recovers SOC; plain HEV does not!
  const tankIntelHwy = new VehicleDynamics<P2HybridPowertrain>(createTank500Hi4TPhysicsConfig(), { driveSelector: 'D', gear: 7, speed: 26.4, stateOfCharge: 0.32 });
  tankIntelHwy.setDriveMode('STANDARD'); tankIntelHwy.powertrain.setHybridMode('INTELLIGENT');
  const tankPlainHwy = new VehicleDynamics<P2HybridPowertrain>(createTank500Hi4TPhysicsConfig(), { driveSelector: 'D', gear: 7, speed: 26.4, stateOfCharge: 0.32 });
  tankPlainHwy.setDriveMode('STANDARD'); tankPlainHwy.powertrain.setHybridMode('HEV');
  let intelGenSamples = 0, plainGenSamples = 0;
  for (let i = 0; i < 2400; i++) {
    const si = tankIntelHwy.stepFixed(DT, { ...neutral, throttle: 0.11 }, asphalt);
    const sp = tankPlainHwy.stepFixed(DT, { ...neutral, throttle: 0.11 }, asphalt);
    if (si.powertrain.hybrid!.generationPowerW > 500) intelGenSamples++;
    if (sp.powertrain.hybrid!.generationPowerW > 500) plainGenSamples++;
  }
  const intelEndSoc = tankIntelHwy.powertrain.battery.stateOfCharge;
  const plainEndSoc = tankPlainHwy.powertrain.battery.stateOfCharge;
  check(intelGenSamples > 300 && intelEndSoc > plainEndSoc + 0.002 &&
    (tankIntelHwy.powertrain.energyManagement.activeTargetSOC ?? 0) > 0.38,
    `Tank 500 INTELLIGENT actively manages highway SOC vs plain HEV: intelSOC=${intelEndSoc.toFixed(4)} plainSOC=${plainEndSoc.toFixed(4)} intelGen=${intelGenSamples} plainGen=${plainGenSamples}`);
  report.tank500IntelligentSOC = {
    intelEndSoc: Number((intelEndSoc * 100).toFixed(2)),
    plainEndSoc: Number((plainEndSoc * 100).toFixed(2)),
    intelTargetSocPct: Number((tankIntelHwy.powertrain.energyManagement.activeTargetSOC * 100).toFixed(1)),
    intelGenSamples,
    plainGenSamples,
  };

  // =========================================================================
  // 7. QIN PLUS SERIES / PARALLEL / DIRECT ACROSS DRIVING MODES
  // =========================================================================
  const qinSeriesRpm: Record<string, number> = {};
  for (const dm of ['ECO', 'NORMAL', 'SPORT'] as const) {
    const car = new VehicleDynamics<EhsHybridSystem>(createQinPlusDmiPhysicsConfig(), { driveSelector: 'D', speed: 12, stateOfCharge: 0.20 });
    car.setDriveMode(dm); car.powertrain.setHybridMode('HEV');
    for (let i = 0; i < 1200; i++) car.stepFixed(DT, { ...neutral, throttle: 0.30 }, asphalt);
    const snap = car.getSnapshot();
    check(snap.powertrain.ehs!.path === 'SERIES' && snap.powertrain.ehs!.p1GenerationPowerW > 500, `Qin ${dm} enters SERIES at low SOC`);
    qinSeriesRpm[dm] = Number((snap.powertrain.ehs!.targetRPM).toFixed(0));
  }
  check(qinSeriesRpm.ECO! < qinSeriesRpm.NORMAL! && qinSeriesRpm.NORMAL! < qinSeriesRpm.SPORT!,
    `Qin PLUS SERIES target RPM responds to driving mode ECO < NORMAL < SPORT: ${JSON.stringify(qinSeriesRpm)}`);

  // Parallel + Direct check at highway speed (30 m/s = 108 km/h):
  // High throttle enters PARALLEL (1.5L + P3 jointly drive), then steady cruise enters DIRECT (1.5L direct-drive alone).
  const qinDirectCar = new VehicleDynamics<EhsHybridSystem>(createQinPlusDmiPhysicsConfig(), { driveSelector: 'D', speed: 30, stateOfCharge: 0.27 });
  qinDirectCar.setDriveMode('NORMAL'); qinDirectCar.powertrain.setHybridMode('HEV');
  let sawParallel = false, sawDirect = false;
  for (let i = 0; i < 1800; i++) {
    const s = qinDirectCar.stepFixed(DT, { ...neutral, throttle: i < 720 ? 0.65 : 0.12 }, asphalt);
    if (s.powertrain.ehs!.state === 'PARALLEL') sawParallel = true;
    if (s.powertrain.ehs!.state === 'DIRECT') sawDirect = true;
  }
  check(sawParallel && sawDirect, `Qin PLUS exercises both PARALLEL and DIRECT states: parallel=${sawParallel} direct=${sawDirect}`);
  report.qinSeriesParallelDirect = { seriesTargetRpm: qinSeriesRpm, sawParallel, sawDirect };

  // =========================================================================
  // 8. TANK 500 P2/K0 ENGAGEMENT, 9HAT SHIFT STRATEGY & SEPARATE ALL-TERRAIN
  // =========================================================================
  const tankShiftGear: Record<string, number> = {};
  let tankK0Engaged = false;
  for (const dm of ['ECO', 'STANDARD', 'SPORT'] as const) {
    const car = new VehicleDynamics<P2HybridPowertrain>(createTank500Hi4TPhysicsConfig(), { driveSelector: 'D', stateOfCharge: 0.75 });
    car.setDriveMode(dm); car.powertrain.setHybridMode('HEV');
    for (let i = 0; i < 1440; i++) {
      const s = car.stepFixed(DT, { ...neutral, throttle: 0.55 }, asphalt);
      if (dm === 'SPORT' && s.powertrain.hybrid!.clutchEngagement > 0.85) tankK0Engaged = true;
    }
    const g = car.getSnapshot().transmission.currentPhysicalGear;
    tankShiftGear[dm] = typeof g === 'number' ? g : 1;
  }
  check(tankK0Engaged, 'Tank 500 P2 K0 clutch engages cleanly under load');
  check(tankShiftGear.ECO! >= tankShiftGear.SPORT! || tankThrottle.SPORT!.speedAt6sKmh > tankThrottle.ECO!.speedAt6sKmh,
    `Tank 500 9HAT shifts earlier in ECO / holds gears in SPORT: ${JSON.stringify(tankShiftGear)}`);
  // All-terrain separate from road driving mode + preserves 4L / rear diff lock
  const tankOffroad = new VehicleDynamics<P2HybridPowertrain>(createTank500Hi4TPhysicsConfig(), { driveSelector: 'N', stateOfCharge: 0.75 });
  tankOffroad.setDriveMode('STANDARD');
  check(tankOffroad.setTerrainMode('MUD') && tankOffroad.driveMode === 'STANDARD' && tankOffroad.powertrain.terrainMode === 'MUD',
    'Tank 500 all-terrain mode does not overwrite road STANDARD driveMode');
  check(tankOffroad.powertrain.requestTransferMode('4L', 0, 1) && tankOffroad.powertrain.requestAxleLock('rear', true, 0),
    'Tank 500 all-terrain mode preserves 4L transfer case & rear diff lock');
  check(tankOffroad.setTerrainMode('OFF') && tankOffroad.driveMode === 'STANDARD', 'exiting terrain mode keeps STANDARD intact');
  report.tank500K0AndTerrain = { k0Engaged: tankK0Engaged, gearsAt12s: tankShiftGear };

  // =========================================================================
  // 9. HIGH LOAD, HARD ACCELERATION & LOW-ADHESION (SNOW / ICE) SCENARIOS
  // =========================================================================
  // 9a. Full-throttle 0-100 comparisons (respecting physical component power limits!)
  const zeroTo100 = (factory: () => VehicleDynamics<P2HybridPowertrain | EhsHybridSystem>, dm: VehicleDriveMode, em: HybridMode | EhsDriverMode) => {
    const car = factory();
    car.setDriveMode(dm);
    if (car.powertrain instanceof P2HybridPowertrain) car.powertrain.setHybridMode(em as HybridMode);
    else if (car.powertrain instanceof EhsHybridSystem) car.powertrain.setHybridMode(em as EhsDriverMode);
    let t100 = -1, peakWheelW = 0;
    for (let i = 0; i < 2400; i++) {
      const s = car.stepFixed(DT, { ...neutral, throttle: 1 }, asphalt);
      const pw = s.powertrain.hybrid?.wheelPowerW ?? s.powertrain.ehs?.wheelPowerW ?? 0;
      peakWheelW = Math.max(peakWheelW, pw);
      if (s.powertrain.hybrid) check(pw <= 300_005, 'Tank 500 respects 300 kW ceiling');
      if (s.powertrain.ehs) check(s.powertrain.ehs.p3MechanicalPowerW <= 120_005, 'Qin PLUS respects 120 kW P3 ceiling');
      if (t100 < 0 && s.speed >= 100 / 3.6) { t100 = (i + 1) * DT; break; }
    }
    return { t100: Number(t100.toFixed(2)), peakWheelKW: Number((peakWheelW / 1000).toFixed(1)) };
  };
  const accelBench = {
    tankEcoHev: zeroTo100(() => new VehicleDynamics<P2HybridPowertrain>(createTank500Hi4TPhysicsConfig(), { driveSelector: 'D', stateOfCharge: 0.75 }), 'ECO', 'HEV'),
    tankStdHev: zeroTo100(() => new VehicleDynamics<P2HybridPowertrain>(createTank500Hi4TPhysicsConfig(), { driveSelector: 'D', stateOfCharge: 0.75 }), 'STANDARD', 'HEV'),
    tankSportHev: zeroTo100(() => new VehicleDynamics<P2HybridPowertrain>(createTank500Hi4TPhysicsConfig(), { driveSelector: 'D', stateOfCharge: 0.75 }), 'SPORT', 'HEV'),
    qinEcoHev: zeroTo100(() => new VehicleDynamics<EhsHybridSystem>(createQinPlusDmiPhysicsConfig(), { driveSelector: 'D', stateOfCharge: 0.80 }), 'ECO', 'HEV'),
    qinNormalHev: zeroTo100(() => new VehicleDynamics<EhsHybridSystem>(createQinPlusDmiPhysicsConfig(), { driveSelector: 'D', stateOfCharge: 0.80 }), 'NORMAL', 'HEV'),
    qinSportHev: zeroTo100(() => new VehicleDynamics<EhsHybridSystem>(createQinPlusDmiPhysicsConfig(), { driveSelector: 'D', stateOfCharge: 0.80 }), 'SPORT', 'HEV'),
  };
  check(accelBench.tankSportHev.t100 > 0 && accelBench.tankSportHev.t100 <= accelBench.tankStdHev.t100 + 0.15 &&
    accelBench.tankStdHev.t100 <= accelBench.tankEcoHev.t100 + 0.25,
    `Tank 500 0-100 ordering realistic without fake max-torque boost: ${JSON.stringify(accelBench)}`);
  check(accelBench.qinSportHev.t100 > 0 && accelBench.qinSportHev.t100 <= accelBench.qinNormalHev.t100 + 0.15 &&
    accelBench.qinNormalHev.t100 <= accelBench.qinEcoHev.t100 + 0.25,
    `Qin PLUS 0-100 ordering realistic without fake max-torque boost: ${JSON.stringify(accelBench)}`);
  report.fullThrottle0To100 = accelBench;

  // 9b. Low-adhesion snow launch: Qin PLUS SNOW vs SPORT peak slip & stability
  const runSnowLaunch = (dm: 'SNOW' | 'SPORT') => {
    const car = new VehicleDynamics<EhsHybridSystem>(createQinPlusDmiPhysicsConfig(), { driveSelector: 'D', stateOfCharge: 0.80 });
    car.setDriveMode(dm); car.powertrain.setHybridMode('HEV');
    let maxSlip = 0, tcsTicks = 0;
    for (let i = 0; i < 480; i++) {
      const s = car.stepFixed(DT, { ...neutral, throttle: 0.55 }, iceEnv);
      maxSlip = Math.max(maxSlip, Math.abs(s.wheels.frontLeft.slipRatio), Math.abs(s.wheels.frontRight.slipRatio));
      if (s.driverAssists.tcsActive) tcsTicks++;
      check(!s.recoveredFromInvalidState, `Qin low-grip ${dm} remains stable`);
    }
    return { maxSlip: Number(maxSlip.toFixed(3)), tcsTicks, speedKmh: Number(car.getSnapshot().speedKmh.toFixed(2)) };
  };
  const snowVsSport = { snow: runSnowLaunch('SNOW'), sport: runSnowLaunch('SPORT') };
  check(snowVsSport.snow.maxSlip <= snowVsSport.sport.maxSlip + 0.05 && snowVsSport.snow.speedKmh > 1,
    `Qin PLUS SNOW controls low-adhesion slip calmly vs SPORT: ${JSON.stringify(snowVsSport)}`);
  // Tank 500 SNOW terrain on packed snow
  const tankSnow = new VehicleDynamics<P2HybridPowertrain>(createTank500Hi4TPhysicsConfig(), { driveSelector: 'D', stateOfCharge: 0.75 });
  tankSnow.setTerrainMode('SNOW');
  for (let i = 0; i < 360; i++) {
    const s = tankSnow.stepFixed(DT, { ...neutral, throttle: 0.5 }, snowEnv);
    check(!s.recoveredFromInvalidState, 'Tank 500 SNOW terrain stable on packed snow');
  }
  report.lowAdhesion = { qinIce: snowVsSport, tankSnowSpeedKmh: Number(tankSnow.getSnapshot().speedKmh.toFixed(2)) };

  // =========================================================================
  // 10. GAMEPAD D-PAD DOWN LONG-PRESS / SHORT-PRESS / NO-REPEAT / NON-HYBRID
  // =========================================================================
  const pad = createMockGamepad();
  const inputSys = new VehicleInputSystem({
    keyboard: false,
    gamepad: { target: null, navigator: { getGamepads: () => [pad as unknown as Gamepad] } },
  });
  try {
    inputSys.update(1 / 60, 0); inputSys.consumeState(); // sync connection
    // Short press (< 0.65s): hazard only, NO energy mode cycle
    setBtn(pad, 13, 1);
    inputSys.update(0.20, 0);
    let st = inputSys.consumeState();
    check(!st.cycleEnergyMode && !st.hazard, 'short press before release emits neither');
    setBtn(pad, 13, 0);
    inputSys.update(1 / 60, 0);
    st = inputSys.consumeState();
    check(st.hazard === true && !st.cycleEnergyMode, 'short D-pad Down emits hazard only, not energy mode');

    // Long press (>= 0.65s): triggers ONCE, holding 3s does NOT repeat, release emits NO hazard
    const qinPadCar = new VehicleDynamics<EhsHybridSystem>(createQinPlusDmiPhysicsConfig(), { driveSelector: 'D', stateOfCharge: 0.80 });
    const tankPadCar = new VehicleDynamics<P2HybridPowertrain>(createTank500Hi4TPhysicsConfig(), { driveSelector: 'D', stateOfCharge: 0.75 });
    const iceCar = new VehicleDynamics(createVehiclePhysicsConfig('family-sedan'));
    const evCar = new VehicleDynamics<ElectricPowertrain>(createVehiclePhysicsConfig('tesla-model-3-rwd'));

    const triggerLongDown = (holdExtraSeconds: number) => {
      let fireCount = 0;
      setBtn(pad, 13, 1);
      inputSys.update(0.02, 0); st = inputSys.consumeState();
      if (st.cycleEnergyMode) fireCount++;
      inputSys.update(0.40, 0); st = inputSys.consumeState();
      if (st.cycleEnergyMode) fireCount++;
      inputSys.update(0.26, 0); st = inputSys.consumeState(); // crosses 0.65s
      if (st.cycleEnergyMode) {
        fireCount++;
        qinPadCar.stepFixed(DT, st, asphalt);
        tankPadCar.stepFixed(DT, st, asphalt);
        iceCar.stepFixed(DT, st, asphalt);
        evCar.stepFixed(DT, st, asphalt);
      }
      // Continue holding: must NOT repeat!
      for (let k = 0; k < 6; k++) {
        inputSys.update(holdExtraSeconds / 6, 0); st = inputSys.consumeState();
        if (st.cycleEnergyMode) fireCount++;
        check(!st.hazard, 'holding D-pad Down never emits hazard');
      }
      // Release: must NOT emit hazard or repeat
      setBtn(pad, 13, 0);
      inputSys.update(1 / 60, 0); st = inputSys.consumeState();
      check(!st.hazard && !st.cycleEnergyMode, 'releasing after long press emits neither hazard nor repeat');
      return fireCount;
    };

    const tankCycle: string[] = [tankPadCar.powertrain.energyManagement.mode];
    const qinCycle: string[] = [qinPadCar.powertrain.energyManagement.mode];
    for (let press = 0; press < 3; press++) {
      const fires = triggerLongDown(1.8);
      check(fires === 1, `long-press #${press + 1} fires exactly once even when held 1.8s extra (got ${fires})`);
      tankCycle.push(tankPadCar.powertrain.energyManagement.mode);
      qinCycle.push(qinPadCar.powertrain.energyManagement.mode);
    }
    check(tankCycle.join('->') === 'INTELLIGENT->EV->HEV->INTELLIGENT', `Tank 500 long-press cycle: ${tankCycle.join('->')}`);
    check(qinCycle.join('->') === 'HEV->EV->HEV->EV', `Qin PLUS long-press cycle: ${qinCycle.join('->')}`);
    check(iceCar.cycleEnergyMode() === null && evCar.cycleEnergyMode() === null, 'non-hybrid ICE/EV ignore energy mode cycling');
    report.gamepadLongPress = { tankCycle, qinCycle, nonHybridIgnored: true };
  } finally {
    inputSys.dispose();
  }

  // =========================================================================
  // 11. TORQUE CONTINUITY DURING MODE SWITCHES (No Single-Tick Jumps!)
  // =========================================================================
  const measureSwitchJump = (car: VehicleDynamics<P2HybridPowertrain | EhsHybridSystem>, switchFn: () => void) => {
    let prev = 0, maxJump = 0;
    for (let i = 0; i < 300; i++) {
      const s = car.stepFixed(DT, { ...neutral, throttle: 0.50 }, asphalt);
      const tq = car.powertrain.axleOutput?.drivenWheelTorque ?? 0;
      if (i === 180) switchFn();
      if (i >= 180 && i <= 210) maxJump = Math.max(maxJump, Math.abs(tq - prev));
      prev = tq;
      check(!s.recoveredFromInvalidState, 'mode switch continuity step valid');
    }
    return Number(maxJump.toFixed(1));
  };
  const tankSwitchCar = new VehicleDynamics<P2HybridPowertrain>(createTank500Hi4TPhysicsConfig(), { driveSelector: 'D', speed: 14, stateOfCharge: 0.75 });
  tankSwitchCar.setDriveMode('ECO'); tankSwitchCar.powertrain.setHybridMode('EV');
  const tankModeJump = measureSwitchJump(tankSwitchCar, () => { tankSwitchCar.setDriveMode('SPORT'); tankSwitchCar.powertrain.setHybridMode('HEV'); });
  const qinSwitchCar = new VehicleDynamics<EhsHybridSystem>(createQinPlusDmiPhysicsConfig(), { driveSelector: 'D', speed: 14, stateOfCharge: 0.80 });
  qinSwitchCar.setDriveMode('ECO'); qinSwitchCar.powertrain.setHybridMode('EV');
  const qinModeJump = measureSwitchJump(qinSwitchCar, () => { qinSwitchCar.setDriveMode('SPORT'); qinSwitchCar.powertrain.setHybridMode('HEV'); });
  check(tankModeJump < 220, `Tank 500 ECO+EV -> SPORT+HEV wheel-torque single-step delta bounded: ${tankModeJump} Nm`);
  check(qinModeJump < 140, `Qin PLUS ECO+EV -> SPORT+HEV wheel-torque single-step delta bounded: ${qinModeJump} Nm`);
  report.torqueContinuityNm = { tankMaxStepDeltaNm: tankModeJump, qinMaxStepDeltaNm: qinModeJump };

  // =========================================================================
  // 12. DISPLAY, AUDIO V2 & TELEMETRY CONSISTENCY
  // =========================================================================
  // 12a. Displays (mock 2D canvas)
  const prevDoc = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const drawn: string[] = [];
  const ctx2d = new Proxy({ fillStyle: '', font: '', textAlign: '', fillRect() {}, fillText(s: string) { drawn.push(s); }, measureText: (s: string) => ({ width: s.length * 12 }) }, {
    get: (target, key) => key in target ? Reflect.get(target, key) : key === 'createLinearGradient' || key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {},
  });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) } });
  const disposables: Array<{ texture: T.CanvasTexture; traverse: (fn: (o: T.Object3D) => void) => void }> = [];
  try {
    const tankDisp = new Tank500Display(false); disposables.push(tankDisp);
    const tSnap = tankLowEv.getSnapshot();
    const tTel: InstrumentTelemetry = { speedKmh: tSnap.speedKmh, rpm: tSnap.rpm ?? 0, gear: 'D', ignitionOn: true,
      driveAvailable: tSnap.driveAvailable, driveMode: tSnap.driveMode, engineRunning: tSnap.engineRunning,
      hybrid: tSnap.powertrain.hybrid, fuelLevel: 0.7 };
    drawn.length = 0;
    tankDisp.update(tTel, 1);
    check(drawn.some(s => s.includes('STANDARD')) && drawn.some(s => s.includes('EV')) && drawn.some(s => s.includes('纯电退出')),
      `Tank 500 display shows OEM STANDARD + EV + fallback state: ${drawn.join(' | ')}`);

    const qinDisp = new QinPlusDisplay(false); disposables.push(qinDisp);
    const qSnap = qinHevEv.getSnapshot(); // requested HEV, actual EV!
    const qTel: InstrumentTelemetry = { speedKmh: qSnap.speedKmh, rpm: qSnap.rpm ?? 0, gear: 'D', ignitionOn: true,
      driveAvailable: qSnap.driveAvailable, driveMode: 'SNOW', engineRunning: false,
      ehs: qSnap.powertrain.ehs, ev: qSnap.powertrain.ev, fuelLevel: 0.75,
      indicators: { positionLights: true, headlights: true, highBeam: true, frontFogLights: true, rearFogLights: true } };
    drawn.length = 0;
    qinDisp.update(qTel, 1);
    check(drawn.includes('SNOW') && drawn.includes('HEV') && drawn.includes('OK'),
      `Qin PLUS display shows OEM top header SNOW + HEV + bottom OK: ${drawn.join(' | ')}`);
  } finally {
    for (const d of disposables) {
      d.traverse(o => { if (o instanceof T.Mesh) { o.geometry.dispose(); for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose(); } });
      d.texture.dispose();
    }
    if (prevDoc) Object.defineProperty(globalThis, 'document', prevDoc);
    else Reflect.deleteProperty(globalThis, 'document');
  }

  // 12b. Vehicle Audio V2 reads driveMode + energyMode + actual operating state
  const acCtx = { roadRoughness: 0.1, cockpit: true, hasDriverAccess: false, doorOpen: 0, windowOpen: 0, cruiseActive: false, parkingDistance: null, drivetrainLashIntensity: 0 };
  const evalAudio = (car: VehicleDynamics<P2HybridPowertrain | EhsHybridSystem>, profile: typeof TANK500_HI4T_ACOUSTIC_PROFILE) => {
    const tel = createVehicleAcousticTelemetry();
    const mix = createAcousticMixState();
    populateAcousticTelemetry(tel, car.getSnapshot(), car.engine, acCtx);
    evaluateVehicleAcoustics(mix, profile, tel, 1 / 60, true);
    return { tel, mix };
  };
  const tankEvAudio = evalAudio(tankHevEv, TANK500_HI4T_ACOUSTIC_PROFILE);
  const tankIceAudio = evalAudio(tankLowEv, TANK500_HI4T_ACOUSTIC_PROFILE);
  check(tankEvAudio.tel.p2Mode === 'HEV' && tankEvAudio.tel.p2State === 'EV' && tankEvAudio.mix.engineBusGain === 0 && tankEvAudio.mix.motor1EmGain > 0,
    'Audio V2 Tank 500 HEV-in-EV keeps engine silent and plays P2 motor');
  check(tankIceAudio.tel.p2Mode === 'EV' && tankIceAudio.mix.engineBusGain > 0,
    'Audio V2 Tank 500 EV-fallback plays real running 2.0T combustion engine');

  // Compare Qin PLUS ECO vs SPORT audio presence at same running state
  const qinAudioEco = evalAudio(qinPowerEv, QIN_PLUS_DMI_ACOUSTIC_PROFILE);
  qinPowerEv.setDriveMode('ECO');
  const qinAudioAfterEco = evalAudio(qinPowerEv, QIN_PLUS_DMI_ACOUSTIC_PROFILE);
  check(qinAudioEco.tel.ehsMode === 'EV' && qinAudioEco.tel.driveMode === 'SPORT' && qinAudioAfterEco.tel.driveMode === 'ECO',
    'Audio V2 Qin PLUS tracks driving mode and energy mode');
  check(qinAudioEco.mix.exhaustCutoffHz > qinAudioAfterEco.mix.exhaustCutoffHz &&
    qinAudioEco.mix.exhaustPrimaryGain > qinAudioAfterEco.mix.exhaustPrimaryGain,
    'Audio V2 Qin PLUS SPORT engine tone brighter/stronger than ECO');
  report.audioConsistency = {
    tankEvMotorGain: Number(tankEvAudio.mix.motor1EmGain.toFixed(5)),
    tankFallbackEngineGain: Number(tankIceAudio.mix.engineBusGain.toFixed(4)),
    qinSportCutoffHz: Number(qinAudioEco.mix.exhaustCutoffHz.toFixed(1)),
    qinEcoCutoffHz: Number(qinAudioAfterEco.mix.exhaustCutoffHz.toFixed(1)),
  };

  return { passed: true as const, assertions, report };
}
