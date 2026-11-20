import type { EhsHybridVehiclePhysicsConfig } from './EhsHybridConfig';

export function validateEhsHybridConfig(c: EhsHybridVehiclePhysicsConfig): void {
  const h = c.ehs;
  const require = (ok: boolean, name: string) => { if (!ok) throw new Error(`Invalid EHS config: ${name}`); };
  const positive = (value: number, name: string) => require(Number.isFinite(value) && value > 0, name);
  const efficiency = (value: number, name: string) => { positive(value, name); require(value <= 1, name); };
  require(c.drivetrainType === 'FWD' && c.frontTorqueSplit === 1 && c.rearTorqueSplit === 0, 'front P3 topology');
  require(!c.mildHybrid && !('hybrid' in c) && !c.startStop, 'exclusive EHS topology');
  positive(c.engine.ratedNetPowerW!, 'engine rated power');
  require(h.p1.maxRPM >= c.engine.maxRPM, 'crank-coupled P1 speed range');
  positive(h.battery.usableCapacityKWh, 'battery capacity'); positive(h.battery.nominalVoltage, 'battery voltage');
  positive(h.battery.maxChargePower, 'battery charge power'); positive(h.battery.maxDischargePower, 'battery discharge power');
  efficiency(h.battery.chargeEfficiency, 'battery charge efficiency'); efficiency(h.battery.dischargeEfficiency, 'battery discharge efficiency');
  require(h.battery.defaultStateOfCharge >= 0 && h.battery.defaultStateOfCharge <= 1, 'initial SOC');
  require(h.battery.lowSOCEnd === 0 && h.battery.lowSOCStart > 0 && h.battery.highSOCRegenEnd === 1 &&
    h.battery.highSOCRegenStart < 1, 'battery taper');
  for (const m of [h.p1, h.p3]) {
    for (const k of ['maxDriveTorque', 'maxDrivePower', 'maxRegenTorque', 'maxRegenPower', 'maxRPM', 'rotationalInertia'] as const) positive(m[k], k);
    efficiency(m.motoringEfficiency, 'motoring efficiency'); efficiency(m.regenEfficiency, 'generation efficiency');
  }
  efficiency(h.inverterEfficiency, 'inverter'); efficiency(h.busEfficiency, 'bus');
  require(h.engineCooling.thermostatFullC > h.engineCooling.thermostatStartC, 'thermostat range');
  positive(h.engineCooling.bypassWPerK, 'coolant bypass');
  positive(h.reduction.ratio, 'P3 ratio'); efficiency(h.reduction.efficiency, 'reduction efficiency');
  positive(h.directDrive.ratio, 'engine ratio'); efficiency(h.directDrive.efficiency, 'direct efficiency');
  positive(h.directDrive.engagementSeconds, 'clutch engagement'); positive(h.directDrive.capacityNm, 'clutch capacity');
  positive(h.directDrive.referenceTorqueNm, 'direct reference torque');
  positive(h.directDrive.couplingStiffness, 'clutch coupling stiffness');
  require(h.directDrive.minimumRPM > c.engine.stallRPM && h.directDrive.maximumRPM < c.engine.redlineRPM, 'direct RPM range');
  const em = h.control;
  efficiency(em.efficientLoad, 'efficient engine load');
  require(em.regenFullSpeed > em.regenMinimumSpeed && em.regenMinimumSpeed >= 0, 'regen fade');
  require(em.minimumSOC > h.battery.lowSOCStart && em.restartSOC > em.minimumSOC && em.restartSOC < .9, 'SOC reserve');
  require(em.startPowerW > em.stopPowerW && em.stopPowerW > 0, 'power hysteresis');
  positive(em.pathDwellSeconds, 'path dwell'); positive(em.minimumRunSeconds, 'run dwell'); positive(em.minimumOffSeconds, 'off dwell');
  require(em.efficientRPM.length >= 2, 'efficiency table');
  for (let i = 0; i < em.efficientRPM.length; i++) {
    const p = em.efficientRPM[i]!;
    require(p.rpm > c.engine.idleRPM && p.rpm <= c.engine.redlineRPM && p.powerW >= 0, 'efficient operating point');
    if (i) require(p.powerW > em.efficientRPM[i - 1]!.powerW, 'efficiency table ordering');
  }
  for (const k of ['acPower', 'dcPower'] as const) positive(h.charging[k], k);
  efficiency(h.charging.acEfficiency, 'AC efficiency'); efficiency(h.charging.dcEfficiency, 'DC efficiency');
  if (h.driveModeStrategy) for (const s of Object.values(h.driveModeStrategy)) {
    if (!s) continue;
    positive(s.accelerationScale, 'EHS drive mode accelerationScale');
    positive(s.torqueResponse, 'EHS drive mode torqueResponse');
    positive(s.liftRegenScale, 'EHS drive mode liftRegenScale');
    positive(s.engineStartPowerScale, 'EHS drive mode engineStartPowerScale');
    positive(s.engineStopPowerScale, 'EHS drive mode engineStopPowerScale');
    positive(s.evPowerThresholdScale, 'EHS drive mode evPowerThresholdScale');
    positive(s.seriesRpmScale, 'EHS drive mode seriesRpmScale');
    require(s.fullPowerPedalStart > 0 && s.fullPowerPedalStart < 1 && s.parallelLoadMin > 0 && s.parallelLoadMin < 1, 'EHS drive mode bounds');
  }
}
