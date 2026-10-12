/** One lumped tyre, SI energy/power; authored pressure is cold gauge kPa. */
export interface TyreThermalPressureConfig {
  referenceColdPressureKPa: number;
  referenceTemperatureC: number;
  thermalCapacity: number; // J/K
  heatingEfficiency: number; // fraction of rolling/slip work retained
  baseCoolingRate: number; // W/K
  speedCoolingGain: number; // W/K per m/s
  minimumPhysicalPressureKPa: number;
  maximumPhysicalPressureKPa: number;
  rollingResistancePressureSensitivity: number;
  longitudinalStiffnessPressureSensitivity: number;
  lateralStiffnessPressureSensitivity: number;
  lowPressureWarningRatio: number;
  criticalLowPressureRatio: number;
  highPressureWarningRatio: number;
  displayPressureSmoothing: number; // seconds
  initialTemperatureOffsetC?: number;
}

/** Generic fallback calibration; individual axles can override any field. */
export function createTyreThermalPressureConfig(referenceColdPressureKPa = 240,
  overrides: Partial<TyreThermalPressureConfig> = {}): TyreThermalPressureConfig {
  return { referenceColdPressureKPa, referenceTemperatureC: 20, thermalCapacity: 30000,
    heatingEfficiency: .65, baseCoolingRate: 12, speedCoolingGain: .8,
    minimumPhysicalPressureKPa: 40, maximumPhysicalPressureKPa: 550,
    rollingResistancePressureSensitivity: .25, longitudinalStiffnessPressureSensitivity: .10,
    lateralStiffnessPressureSensitivity: .12, lowPressureWarningRatio: .80,
    criticalLowPressureRatio: .65, highPressureWarningRatio: 1.45,
    displayPressureSmoothing: 1.5, ...overrides };
}
