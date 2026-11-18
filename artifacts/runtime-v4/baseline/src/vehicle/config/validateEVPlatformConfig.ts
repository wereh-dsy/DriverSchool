import type { ElectricVehiclePhysicsConfig, EVThermalConfig } from './ElectricVehiclePhysicsConfig';

/** Startup-only checks of physical topology and EV calibration. */
export function validateEVPlatformConfig(config: ElectricVehiclePhysicsConfig): void {
  const require = (condition: boolean, field: string): void => { if (!condition) throw new Error(`Invalid EV platform: ${field}`); };
  const positive = (value: number, field: string): void => require(Number.isFinite(value) && value > 0, field);
  const thermal = (t: EVThermalConfig | undefined): void => {
    if (!t) return;
    positive(t.thermalCapacity, 'thermal capacity'); positive(t.coolingRate, 'cooling rate');
    require(Number.isFinite(t.airflowCooling) && t.airflowCooling >= 0, 'airflow cooling');
    require(t.criticalTemperature > t.derateStartTemperature && Number.isFinite(t.criticalTemperature), 'thermal thresholds');
    require(t.minimumCapability >= 0 && t.minimumCapability <= 1 && Number.isFinite(t.initialTemperatureOffset), 'thermal calibration');
  };
  thermal(config.battery.thermal);
  if (config.battery.electrical) {
    positive(config.battery.electrical.internalResistance, 'pack resistance');
    positive(config.battery.electrical.maxDischargeCurrent, 'pack discharge current');
    positive(config.battery.electrical.maxChargeCurrent, 'pack charge current');
  }
  require((config.battery.grossEnergyKWh ?? config.battery.usableCapacityKWh) >= config.battery.usableCapacityKWh, 'gross versus usable energy');
  const units = config.driveUnits;
  if (!units) { require(config.drivetrainType !== 'AWD', 'legacy motor needs one driven axle'); return; }
  require(units.length >= 1 && units.length <= 2 && new Set(units.map(unit => unit.axle)).size === units.length, 'unique axle units');
  const front = units.some(u => u.axle === 'front'), rear = units.some(u => u.axle === 'rear');
  require(config.drivetrainType === 'AWD' ? front && rear : config.drivetrainType === 'RWD' ? rear && !front : front && !rear, 'drive unit topology');
  for (const unit of units) {
    const m = unit.motor, i = unit.inverter, t = unit.transmission;
    for (const v of [m.maxDrivePower, m.maxDriveTorque, m.maxRPM, m.rotationalInertia, m.driveResponseRate, m.maxRegenPower, m.maxRegenTorque, i.maxPower, t.ratio, t.efficiency]) positive(v, 'drive unit calibration');
    require(i.efficiency > 0 && i.efficiency <= 1 && m.motoringEfficiency > 0 && m.motoringEfficiency <= 1 && m.regenEfficiency > 0 && m.regenEfficiency <= 1 && t.efficiency <= 1, 'efficiencies');
    require((m.continuousPower ?? m.maxDrivePower) > 0 && (m.continuousPower ?? m.maxDrivePower) <= m.maxDrivePower, 'continuous power');
    require((m.highSpeedRollOffRPM ?? m.maxRPM * .975) < m.maxRPM && (m.baseSpeedRPM ?? 1) > 0, 'motor speed envelope');
    if (m.nominalVoltage !== undefined) positive(m.nominalVoltage, 'motor reference voltage');
    if (m.copperLossAtMaxTorque !== undefined) positive(m.copperLossAtMaxTorque, 'motor copper loss');
    if (unit.disconnect) {
      require(unit.axle === 'front' && rear, 'disconnect requires a supporting rear drive unit');
      positive(unit.disconnect.engagementTime, 'disconnect engagement'); positive(unit.disconnect.disconnectDelay, 'disconnect dwell');
    }
    thermal(m.thermal); thermal(i.thermal);
    if ('type' in t && t.type === 'TWO_SPEED') {
      require(t.ratio > t.secondRatio && t.secondRatio > 0, 'two-speed ratios');
      positive(t.shiftDuration, 'shift duration'); positive(t.minimumShiftInterval, 'shift dwell');
      require(t.normalUpshiftSpeed > t.normalDownshiftSpeed && t.sportUpshiftSpeed > t.sportDownshiftSpeed && t.sportPlusUpshiftSpeed > t.sportPlusDownshiftSpeed, 'shift hysteresis');
    }
  }
  if (config.launchControl) {
    const l = config.launchControl;
    require(front && rear && config.driveModes?.SPORT_PLUS !== undefined, 'launch topology and mode');
    require(l.overboostPower > l.normalPower && l.normalPower > 0, 'launch power');
    positive(l.duration, 'launch duration'); positive(l.energyBudgetKJ, 'launch energy'); positive(l.cooldown, 'launch cooldown');
  }
  for (const mode of Object.values(config.driveModes ?? {})) if (mode.ev) {
    positive(mode.ev.coolingMultiplier, 'mode cooling');
    require(mode.ev.powerFraction > 0 && mode.ev.powerFraction <= 1 && mode.ev.frontParticipation >= 0 && mode.ev.frontParticipation <= 1, 'EV mode calibration');
  }
}
