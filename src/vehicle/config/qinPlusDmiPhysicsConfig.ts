import type { VehicleDimensions } from '../VehicleDimensions';
import { createDefaultVehiclePhysicsConfig } from './defaultVehiclePhysicsConfig';
import { createExecutiveSedanPhysicsConfig } from './executiveSedanPhysicsConfig';
import { createTyreThermalPressureConfig } from './TyreThermalPressureConfig';
import type { EhsHybridVehiclePhysicsConfig } from './EhsHybridConfig';

/** China MY2026 January 210KM 进取型. Sources/estimates: docs/QIN_PLUS_EHS.md. */
export const QIN_PLUS_DMI_DIMENSIONS: VehicleDimensions = Object.freeze({
  length: 4.780, width: 1.837, height: 1.515, wheelBase: 2.718,
  frontTrackWidth: 1.580, rearTrackWidth: 1.590, wheelRadius: .338, wheelWidth: .225,
});
export function createQinPlusDmiPhysicsConfig(): EhsHybridVehiclePhysicsConfig {
  const c = createDefaultVehiclePhysicsConfig(), controls = createExecutiveSedanPhysicsConfig();
  delete c.hybrid; delete c.mildHybrid; delete c.startStop;
  Object.assign(c, QIN_PLUS_DMI_DIMENSIONS, { mass: 1580 - 65 * .745, trackWidth: 1.580,
    frontWeightBias: .59, centerOfMassHeight: .50, yawInertia: 2600,
    layoutCalibrationNote: 'Transverse EHS P1/P3 FWD; 1580 kg provisional curb mass, base excludes 65 L fuel.' });
  c.capabilities = { cruiseControl: true, advancedInstrument: true, navigation: true, tpms: true, driveModes: true };
  // OEM 2026 Qin PLUS DM-i 210KM supports ECO / NORMAL / SPORT + independent SNOW low-adhesion mode.
  c.driveModes = {
    ECO: {
      throttleExponent: 1.38, throttleResponse: 7.0,
      steeringResponse: 3.1, steeringDamping: 8.8,
      tcs: { slipThresholdMultiplier: 1.15, maximumTorqueReduction: .95, response: 8, recoveryResponse: 1.8 },
    },
    NORMAL: {
      throttleExponent: 1.08, throttleResponse: 9.5,
      steeringResponse: 3.4, steeringDamping: 9.4,
      tcs: { slipThresholdMultiplier: 1.22, maximumTorqueReduction: .95, response: 7.5, recoveryResponse: 2.0 },
    },
    SPORT: {
      throttleExponent: .84, throttleResponse: 13.0,
      steeringResponse: 3.9, steeringDamping: 10.8,
      tcs: { slipThresholdMultiplier: 1.38, maximumTorqueReduction: .92, response: 7.0, recoveryResponse: 2.5 },
    },
    SNOW: {
      throttleExponent: 1.60, throttleResponse: 5.0,
      steeringResponse: 3.0, steeringDamping: 9.8,
      tcs: { slipThresholdMultiplier: 1.02, maximumTorqueReduction: .96, response: 14, recoveryResponse: 1.2 },
      esc: { yawErrorThreshold: .12, sideslipThreshold: .085, response: 9.5 },
    },
  };
  c.driveModeOrder = ['ECO', 'NORMAL', 'SPORT', 'SNOW'];
  c.defaultDriveMode = 'NORMAL';
  c.parkingBrake = { ...controls.parkingBrake! }; c.autoHold = { ...controls.autoHold! };
  c.cruiseControl = { ...controls.cruiseControl! };
  c.driverAids = { ...c.driverAids, absEnabled: true, ebdEnabled: true,
    tractionControlEnabled: true, stabilityControlEnabled: true };
  c.fuel = { tankCapacityL: 65, defaultFuelL: 65, fuelDensity: .745,
    peakThermalEfficiency: .40, referenceConsumptionLPer100km: 4.0 };
  c.engine = { ...c.engine, displacementL: 1.498, ratedNetPowerW: 74000, torqueCurveIsNet: true,
    idleRPM: 1000, stallRPM: 400, redlineRPM: 6200, redlineWarningRPM: 5900, revLimiterRPM: 6200, maxRPM: 6400,
    engineInertia: .22, engineFrictionTorque: 9, engineBrakingStrength: 18, engineBraking: 27,
    throttleResponse: 10, throttleResponseRate: 10, throttleReleaseResponse: 14,
    torqueRipple: .008, partThrottleExponent: 1, revHang: undefined,
    ignitionSequence: { crankingDuration: .45, crankingRPM: 850, flareRPM: 1250, settlingDuration: .35,
      shutdownFriction: 30 },
    thermal: { initialTemperatureC: 30, heatCapacityJPerK: 145000, heatFraction: .4,
      coolingWPerK: 420, airflowCoolingWPerKPerMps: 12, derateStartC: 112, derateEndC: 135, minimumTorqueFactor: .45 },
    torqueCurve: [{ rpm: 800, torque: 76 }, { rpm: 1500, torque: 105 }, { rpm: 2200, torque: 119 },
      { rpm: 3000, torque: 125 }, { rpm: 4000, torque: 126 }, { rpm: 5000, torque: 124 },
      { rpm: 6000, torque: 117.77 }, { rpm: 6400, torque: 95 }] };
  // Legacy structural metadata only. EhsTransmission owns the actual fixed paths.
  c.transmission = { ...c.transmission, type: 'CVT', supportsManualSelection: false,
    gearRatios: {}, finalDrive: 1, finalDriveRatio: 1, reverseRatio: -1 };
  c.aero = { dragCoefficient: .30, frontalArea: 2.20, airDensity: 1.225, liftCoefficientFront: .02, liftCoefficientRear: .03 };
  c.brakes = { ...c.brakes, maxBrakeTorqueFront: 14500 * c.wheelRadius * .66,
    maxBrakeTorqueRear: 14500 * c.wheelRadius * .34, frontBrakeBias: .66, maxBrakeForce: 14500 };
  c.steering = { ...c.steering, steeringWheelLock: 900 * Math.PI / 180, steeringRatio: 900 / 63 };
  c.tires = { ...c.tires, wheelInertia: 1.3, rollingResistance: .0105,
    thermalPressureFront: createTyreThermalPressureConfig(250), thermalPressureRear: createTyreThermalPressureConfig(250) };
  c.suspension = { ...c.suspension, rideHeight: .145, springRateFront: 32000, springRateRear: 29000,
    damperCompressionFront: 2000, damperCompressionRear: 1850, damperReboundFront: 3100, damperReboundRear: 2900,
    antiRollStiffnessFront: 19000, antiRollStiffnessRear: 10000, antiRollStiffness: 29000,
    kinematics: { front: { topology: 'MACPHERSON', staticCamber: -.008, camberGainPerMeter: -.22,
      staticToe: 0, bumpToeGainPerMeter: .01, antiDiveRatio: .10, antiSquatRatio: 0 },
    rear: { topology: 'TORSION_BEAM', staticCamber: -.008, camberGainPerMeter: -.08,
      staticToe: .001, bumpToeGainPerMeter: .008, antiDiveRatio: 0, antiSquatRatio: .1 } } };
  const thermal = { thermalCapacity: 40000, coolingRate: 65, airflowCooling: 1.8,
    derateStartTemperature: 100, criticalTemperature: 145, minimumCapability: .1, initialTemperatureOffset: 0 };
  return { ...c, ehs: {
    defaultMode: 'HEV', energyModeOrder: ['EV', 'HEV'], inverterEfficiency: .975, busEfficiency: .99, auxiliaryPower: 400,
    driveModeStrategy: {
      ECO: { accelerationScale: .78, torqueResponse: 4.2, fullPowerPedalStart: .86, liftRegenScale: 1.25,
        engineStartPowerScale: 1.18, engineStopPowerScale: 1.12, evPowerThresholdScale: 1.10,
        seriesRpmScale: .94, parallelLoadMin: .28 },
      NORMAL: { accelerationScale: 1.0, torqueResponse: 6.2, fullPowerPedalStart: .82, liftRegenScale: 1.0,
        engineStartPowerScale: 1.0, engineStopPowerScale: 1.0, evPowerThresholdScale: 1.0,
        seriesRpmScale: 1.0, parallelLoadMin: .32 },
      SPORT: { accelerationScale: 1.18, torqueResponse: 11.5, fullPowerPedalStart: .70, liftRegenScale: .78,
        engineStartPowerScale: .68, engineStopPowerScale: .78, evPowerThresholdScale: .90,
        assistThrottleThreshold: .42, seriesRpmScale: 1.12, parallelLoadMin: .24 },
      SNOW: { accelerationScale: .65, torqueResponse: 2.6, fullPowerPedalStart: .94, maximumDemandScale: .74,
        liftRegenScale: .40, engineStartPowerScale: 1.08, engineStopPowerScale: 1.05, evPowerThresholdScale: 1.05,
        seriesRpmScale: .95, parallelLoadMin: .38 },
    },
    engineCooling: { thermostatStartC: 78, thermostatFullC: 94, bypassWPerK: 12 },
    battery: { usableCapacityKWh: 25.28, grossEnergyKWh: 25.28, defaultStateOfCharge: .8, nominalVoltage: 355,
      maxDischargePower: 135000, maxChargePower: 48000, dischargeEfficiency: .985, chargeEfficiency: .98,
      lowSOCStart: .12, lowSOCEnd: 0, highSOCRegenStart: .92, highSOCRegenEnd: 1,
      electrical: { internalResistance: .065, maxDischargeCurrent: 450, maxChargeCurrent: 150 },
      coldDischargeFullTemperature: 10, coldDischargeZeroTemperature: -30,
      coldChargeFullTemperature: 15, coldChargeZeroTemperature: -15,
      thermal: { thermalCapacity: 260000, coolingRate: 90, airflowCooling: 2,
        derateStartTemperature: 48, criticalTemperature: 65, minimumCapability: .12, initialTemperatureOffset: 0 } },
    charging: { acPower: 6600, dcPower: 48000, acEfficiency: .92, dcEfficiency: .96 },
    p1: { maxDriveTorque: 85, maxDrivePower: 12000, maxRegenTorque: 125, maxRegenPower: 65000,
      maxRPM: 10000, rotationalInertia: .025, driveResponseRate: 16, motoringEfficiency: .90, regenEfficiency: .94,
      continuousPower: 10000, copperLossAtMaxTorque: 300, thermal: { ...thermal, thermalCapacity: 24000 },
      efficiencyMap: { lightLoadPenalty: .018, highLoadPenalty: .015, highSpeedPenalty: .012 } },
    p3: { maxDriveTorque: 210, maxDrivePower: 120000, continuousPower: 65000,
      maxRPM: 16000, rotationalInertia: .025, driveResponseRate: 12, motoringEfficiency: .96, regenEfficiency: .93,
      maxRegenTorque: 150, maxRegenPower: 55000, copperLossAtMaxTorque: 1500, thermal,
      efficiencyMap: { lightLoadPenalty: .018, highLoadPenalty: .018, highSpeedPenalty: .012 } },
    reduction: { ratio: 10.8, efficiency: .97, reverseSpeedLimit: 8, parkMaximumSpeed: .35,
      directionLockoutSpeed: 1.2, creepEnabled: true, creepTorque: 12, creepSpeed: 1.5 },
    directDrive: { ratio: 3.25, efficiency: .97, capacityNm: 155, referenceTorqueNm: 126, couplingStiffness: 200, engagementSeconds: .65,
      synchronizationRPM: 90, minimumRPM: 1650, maximumRPM: 4900 },
    control: { holdSOC: .5, minimumSOC: .22, restartSOC: .28, startPowerW: 60000, stopPowerW: 45000,
      minimumRunSeconds: 15, minimumOffSeconds: 5, pathDwellSeconds: 2, generationReserveW: 18000,
      efficientLoad: .82, acceleration: 4.3, torqueResponse: 6, liftRegenWheelNm: 130, regenMinimumSpeed: .3, regenFullSpeed: 3,
      efficientRPM: [{ powerW: 0, rpm: 1800 }, { powerW: 18000, rpm: 2200 }, { powerW: 30000, rpm: 3000 },
        { powerW: 45000, rpm: 4100 }, { powerW: 60000, rpm: 5200 }, { powerW: 80000, rpm: 6000 }] },
  } };
}
