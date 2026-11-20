import type { P2HybridVehiclePhysicsConfig } from './P2HybridConfig';

export function validateP2HybridConfig(c: P2HybridVehiclePhysicsConfig): void {
  const require = (ok: boolean, field: string) => { if (!ok) throw Error(`Invalid P2 hybrid config: ${field}`); };
  const positive = (x: number) => Number.isFinite(x) && x > 0;
  const fraction = (x: number) => positive(x) && x <= 1;
  const h = c.hybrid, b = h.battery, m = h.motor, e = h.energyManagement, t = h.transfer;
  require(c.transmission.type === 'TORQUE_CONVERTER_AT' && !!c.transmission.automatic && !c.mildHybrid,
    'stepped HAT with one P2 source; no parallel mild-hybrid');
  require(c.drivetrainType === 'AWD' && !!c.awd, 'mechanical transfer requires AWD chassis');
  require([b.usableCapacityKWh, b.nominalVoltage, b.maxDischargePower, b.maxChargePower,
    m.maxDrivePower, m.maxDriveTorque, m.maxRegenTorque, m.maxRegenPower, m.maxRPM, m.rotationalInertia,
    h.systemPower, h.systemTorque, h.charging.acPower, h.charging.dcPower, h.starterPower,
    c.transmission.shiftTime].every(positive), 'positive component ratings');
  require([b.chargeEfficiency, b.dischargeEfficiency, m.motoringEfficiency, m.regenEfficiency,
    h.inverterEfficiency, h.charging.acEfficiency, h.charging.dcEfficiency, t.efficiency].every(fraction), 'efficiencies');
  require(b.lowSOCEnd >= 0 && b.lowSOCEnd < b.lowSOCStart && b.lowSOCStart < e.minimumSOC &&
    e.minimumSOC < e.restartSOC && e.restartSOC < e.chargeTargetSOC && e.chargeTargetSOC < 1 &&
    b.highSOCRegenStart < b.highSOCRegenEnd && b.highSOCRegenEnd === 1 &&
    b.defaultStateOfCharge >= 0 && b.defaultStateOfCharge <= 1, 'SOC ordering');
  require((b.grossEnergyKWh ?? b.usableCapacityKWh) >= b.usableCapacityKWh, 'gross/usable capacity');
  require(e.engineStopPower < e.engineStartPower && e.minimumRunTime > 0 && e.minimumOffTime > 0 &&
    positive(e.maximumGenerationPower) && positive(e.synchronizationToleranceRPM), 'EMS hysteresis');
  require(t.modes.includes(t.defaultMode) && new Set(t.modes).size === t.modes.length && t.lowRatio > 1 &&
    t.frontShare > 0 && t.frontShare <= t.maximumFrontShare && t.maximumFrontShare <= .5 &&
    t.highShiftMaximumSpeed > t.lowShiftMaximumSpeed && positive(t.lowMaximumSpeed) && positive(t.couplingResponse), 'transfer modes/ratio/shares');
  require(h.regen.minimumSpeed >= 0 && h.regen.fullSpeed > h.regen.minimumSpeed, 'regen fade');
  if (h.driveability) require(Object.values(h.driveability).every(positive), 'driveability acceleration/speed calibration');
  if (h.driveability?.fullPowerPedalStart !== undefined) require(h.driveability.fullPowerPedalStart < 1, 'full-power pedal transition');
  if (e.startDelay !== undefined) require(e.startDelay >= 0 && (e.stopDelay ?? 0) >= 0 && fraction(e.startDemand ?? 1), 'EMS demand dwell');
  for (const thermal of [b.thermal, m.thermal]) if (thermal) require(positive(thermal.thermalCapacity) &&
    positive(thermal.coolingRate) && thermal.airflowCooling >= 0 && thermal.criticalTemperature > thermal.derateStartTemperature &&
    thermal.minimumCapability >= 0 && thermal.minimumCapability <= 1, 'thermal calibration');
  if (b.electrical) require(Object.values(b.electrical).every(positive), 'pack electrical calibration');
  for (const lock of [t.centerLock, t.frontLock, t.rearLock]) if (lock) require(Object.values(lock).every(positive), 'shaft lock stiffness/damping/capacity');
  if (t.frontLock || t.rearLock) require(!!t.centerLock && positive(t.lockMaximumSpeed ?? 0) && positive(t.lockMaximumSlip ?? 0), 'axle lock engagement gates');
  const cooling = h.engineCooling;
  if (cooling) require(fraction(cooling.coolantWasteFraction) && cooling.thermostatFullC > cooling.thermostatStartC &&
    cooling.fanFullC > cooling.fanStartC && positive(cooling.bypassWPerK) && fraction(cooling.minimumFanFraction), 'P2 fuel/thermostat cooling');
  if (h.driveModeStrategy) for (const s of Object.values(h.driveModeStrategy)) {
    if (!s) continue;
    require(positive(s.acceleration) && positive(s.demandResponseRate) && positive(s.coastDecelerationScale) &&
      positive(s.engineStartPowerScale) && positive(s.engineStartSpeedScale) && positive(s.startDelayScale) &&
      fraction(s.engineEfficientLoad) && s.fullPowerPedalStart > 0 && s.fullPowerPedalStart < 1, 'P2 driveModeStrategy');
  }
  if (h.terrainStrategies) for (const tStrat of Object.values(h.terrainStrategies)) {
    if (!tStrat) continue;
    require(positive(tStrat.pedalExponent) && positive(tStrat.acceleration) && positive(tStrat.demandResponseRate) &&
      positive(tStrat.coastDecelerationScale) && positive(tStrat.engineStartPowerScale) && positive(tStrat.tcsSlipMultiplier), 'P2 terrainStrategies');
  }
  if (h.intelligent) {
    const intel = h.intelligent;
    require(positive(intel.urbanSpeedMps) && intel.highwaySpeedMps > intel.urbanSpeedMps &&
      positive(intel.urbanStartPowerScale) && positive(intel.midStartPowerScale) && positive(intel.highwayStartPowerScale) &&
      fraction(intel.urbanTargetSOC) && fraction(intel.midTargetSOC) && fraction(intel.highwayTargetSOC) &&
      positive(intel.generationPowerCapW) && positive(intel.evMaxSpeedMps), 'P2 intelligent strategy');
  }
}
