import type { VehicleDimensions } from '../VehicleDimensions';
import { createRoadSUVPhysicsConfig } from './roadSUVPhysicsConfig';
import type { P2HybridVehiclePhysicsConfig } from './P2HybridConfig';

/** 37.1 kWh / 180+120 kW Hi4-T baseline, NOT dual-motor Hi4-Z.
 * Published envelope/rating versus engineering estimates are itemized in docs/TANK500_HI4T.md. */
export const TANK500_HI4T_DIMENSIONS: VehicleDimensions = Object.freeze({
  length: 5.078, width: 1.934, height: 1.905, wheelBase: 2.850,
  frontTrackWidth: 1.635, rearTrackWidth: 1.635, wheelRadius: .386, wheelWidth: .265,
});
export function createTank500Hi4TPhysicsConfig(): P2HybridVehiclePhysicsConfig {
  const c = createRoadSUVPhysicsConfig();
  Object.assign(c, TANK500_HI4T_DIMENSIONS, { trackWidth: 1.635, mass: 2767.85,
    frontWeightBias: .51, centerOfMassHeight: .79, yawInertia: 6100,
    frontTorqueSplit: .35, rearTorqueSplit: .65,
    layoutCalibrationNote: 'Body-on-frame P2 SUV; battery inside rear frame, base mass excludes 70 L petrol.' });
  delete c.startStop; delete c.mildHybrid;
  c.awd = { mode: 'on-demand', accelerationRearTorqueSplit: .65, maximumRearTorqueSplit: 1, response: 4 };
  c.fuel = { tankCapacityL: 70, defaultFuelL: 70, fuelDensity: .745, peakThermalEfficiency: .38,
    referenceConsumptionLPer100km: 9.55 };
  c.engine = { ...c.engine, layout: 'INLINE', cylinderCount: 4, bankAngle: undefined,
    displacementL: 1.998, ratedNetPowerW: 180000, torqueCurveIsNet: true, engineInertia: .34,
    idleRPM: 780, stallRPM: 400, partThrottleExponent: 1,
    engineFrictionTorque: 16, engineBrakingStrength: 48, engineBraking: 64,
    redlineWarningRPM: 6000, redlineRPM: 6400, revLimiterRPM: 6400, maxRPM: 6600,
    throttleResponse: 6, throttleResponseRate: 6, throttleReleaseResponse: 12,
    ignitionSequence: { crankingDuration: .45, crankingRPM: 260, flareRPM: 1120, settlingDuration: .45, shutdownFriction: 32 },
    firingCharacter: { smoothness: .79, inertiaScale: 1, brakingScale: 1 },
    thermal: { initialTemperatureC: 65, heatCapacityJPerK: 175000, heatFraction: .45,
      coolingWPerK: 950, airflowCoolingWPerKPerMps: 25, derateStartC: 112, derateEndC: 132, minimumTorqueFactor: .5 },
    torqueCurve: [{ rpm: 780, torque: 125 }, { rpm: 1200, torque: 265 }, { rpm: 1700, torque: 380 },
      { rpm: 4000, torque: 380 }, { rpm: 5000, torque: 340 }, { rpm: 6000, torque: 286.48 }, { rpm: 6400, torque: 250 }, { rpm: 6600, torque: 210 }],
    turbo: { ...c.engine.turbo!, maxPressureRatio: 2.1, inertia: .25,
      baseTorqueCurve: [{ rpm: 780, torque: 90 }, { rpm: 1200, torque: 150 }, { rpm: 1700, torque: 185 },
        { rpm: 4000, torque: 190 }, { rpm: 5000, torque: 172 }, { rpm: 6000, torque: 145 }, { rpm: 6600, torque: 110 }] } };
  c.clutch = { ...c.clutch, maxTorque: 470, maxClutchTorque: 470, couplingStiffness: 6,
    engagementRate: 1.7, disengagementRate: 8, torqueCapacityExponent: 1.4 };
  c.transmission = { ...c.transmission, gearRatios: { 1: 5.288, 2: 3.505, 3: 2.457, 4: 1.886, 5: 1.527, 6: 1.2, 7: 1, 8: .814, 9: .657 },
    reverseRatio: -4.1, finalDrive: 3.9, finalDriveRatio: 3.9, efficiency: .94, drivetrainEfficiency: .94, shiftTime: .4,
    automatic: { ...c.transmission.automatic!, shiftTorqueFactor: .86, shiftStrategy: {
      ...c.transmission.automatic!.shiftStrategy, minimumUpshiftSpeeds: [2, 3.5, 5, 7, 9, 12, 16, 20],
      map: [{ throttle: 0, upshiftRPM: 1600, downshiftRPM: 900 }, { throttle: .3, upshiftRPM: 2300, downshiftRPM: 1150 },
        { throttle: .7, upshiftRPM: 4200, downshiftRPM: 1600 }, { throttle: 1, upshiftRPM: 6100, downshiftRPM: 2600 }],
      minimumTimeInGear: 1.1, kickdownThrottle: .85, kickdownTargetRPM: 4100, kickdownMaximumRPM: 6000,
      liftHoldTime: 1.5, brakingDownshiftRPM: 1550, minimumPostShiftRPM: 1050,
      minimumUpshiftRoadRPMFraction: .78 } } };
  c.suspension = { ...c.suspension, airSuspension: undefined, adaptiveDamping: undefined,
    rideHeight: .224, restLength: .50, suspensionTravel: .30,
    springRateFront: 49000, springRateRear: 47000,
    damperCompressionFront: 3500, damperCompressionRear: 3300, damperReboundFront: 4900, damperReboundRear: 4700,
    antiRollStiffnessFront: 14000, antiRollStiffnessRear: 9500, antiRollStiffness: 23500,
    unsprungMass: { front: 65, rear: 85 }, kinematics: {
      front: { ...c.suspension.kinematics!.front, topology: 'DOUBLE_WISHBONE', camberGainPerMeter: -.26 },
      rear: { ...c.suspension.kinematics!.rear, topology: 'MULTI_LINK', camberGainPerMeter: 0, bumpToeGainPerMeter: 0, staticCamber: 0 },
    } };
  c.tires = { ...c.tires, wheelInertia: 3.6, rollingResistance: .017, longitudinalGrip: .90,
    lateralGrip: .88, gripCoefficient: .90, corneringStiffnessFront: 115000, corneringStiffnessRear: 117000,
    peakSlipRatio: .14, gripFalloff: .30, verticalCompliance: { stiffness: 300000, damping: 2600, maximumCompression: .07 } };
  const brakeForce = 31500;
  c.brakes = { ...c.brakes, maxBrakeForce: brakeForce, frontBrakeBias: .64,
    maxBrakeTorqueFront: brakeForce * c.wheelRadius * .64, maxBrakeTorqueRear: brakeForce * c.wheelRadius * .36 };
  c.steering = { ...c.steering, steeringRatio: 18.5, maxRoadWheelAngle: .59, maxSteeringAngle: .59,
    steeringWheelLock: 2 * .59 * 18.5, highSpeedMinimumAuthority: .20, highSpeedReferenceSpeed: 18 };
  c.aero = { ...c.aero, dragCoefficient: .39, frontalArea: 3.05 };
  c.frontDiff = { type: 'open' }; c.rearDiff = { type: 'open' };
  c.electronicDifferential = { slipThreshold: .19, speedDifferenceThreshold: .7, maximumBrakeTorque: 850, response: 10 };
  // Fixed passive springs/dampers; off-road all-terrain strategies live separately in hybrid.terrainStrategies.
  const normalShift = c.transmission.automatic!.shiftStrategy;
  c.driveModes = {
    STANDARD: {
      throttleExponent: 1.12, throttleResponse: 6.0,
      steeringResponse: 2.7, steeringDamping: 10,
      shiftStrategy: { ...normalShift, map: normalShift.map.map(p => ({ ...p })) },
      tcs: { slipThresholdMultiplier: 1.12, maximumTorqueReduction: .95, response: 7, recoveryResponse: 2 },
    },
    ECO: {
      throttleExponent: 1.38, throttleResponse: 4.5,
      steeringResponse: 2.5, steeringDamping: 9.2,
      shiftStrategy: {
        ...normalShift,
        map: normalShift.map.map(p => ({
          ...p,
          upshiftRPM: Math.max(1350, Math.round(p.upshiftRPM * .88)),
          downshiftRPM: Math.max(850, Math.round(p.downshiftRPM * .92)),
        })),
        kickdownThrottle: .90,
        liftHoldTime: .85,
        brakingDownshiftRPM: 1350,
      },
      tcs: { slipThresholdMultiplier: 1.08, maximumTorqueReduction: .95, response: 8, recoveryResponse: 1.8 },
    },
    SPORT: {
      throttleExponent: .86, throttleResponse: 9.2,
      steeringResponse: 3.1, steeringDamping: 12.2,
      shiftStrategy: {
        ...normalShift,
        map: normalShift.map.map(p => ({
          ...p,
          upshiftRPM: Math.min(6200, Math.round(p.upshiftRPM * 1.18)),
          downshiftRPM: Math.min(3400, Math.round(p.downshiftRPM * 1.22)),
        })),
        minimumTimeInGear: .85,
        kickdownThrottle: .72,
        kickdownTargetRPM: 4450,
        liftHoldTime: 2.6,
        brakingDownshiftRPM: 2100,
      },
      tcs: { slipThresholdMultiplier: 1.28, maximumTorqueReduction: .92, response: 6.5, recoveryResponse: 2.4 },
    },
  };
  // Road driving mode cycle matches OEM Tank 500 Hi4-T display naming (STANDARD / ECO / SPORT).
  // All-terrain modes (SNOW / MUD / SAND) remain separated in hybrid.terrainStrategies.
  c.driveModeOrder = ['STANDARD', 'ECO', 'SPORT']; c.defaultDriveMode = 'STANDARD';
  c.hybrid = {
    battery: { usableCapacityKWh: 37.1, grossEnergyKWh: 37.1, defaultStateOfCharge: .75, nominalVoltage: 360,
      maxDischargePower: 150000, maxChargePower: 70000, dischargeEfficiency: .985, chargeEfficiency: .985,
      lowSOCStart: .12, lowSOCEnd: .02, highSOCRegenStart: .90, highSOCRegenEnd: 1,
      electrical: { internalResistance: .055, maxDischargeCurrent: 470, maxChargeCurrent: 220 },
      thermal: { thermalCapacity: 350000, coolingRate: 110, airflowCooling: 2.5,
        derateStartTemperature: 45, criticalTemperature: 60, minimumCapability: 0, initialTemperatureOffset: 0 } },
    motor: { maxDriveTorque: 400, maxDrivePower: 120000, maxRPM: 7000, rotationalInertia: .22,
      driveResponseRate: 18, motoringEfficiency: .94, maxRegenTorque: 240, maxRegenPower: 65000,
      regenEfficiency: .92, continuousPower: 75000, copperLossAtMaxTorque: 2300,
      thermal: { thermalCapacity: 35000, coolingRate: 120, airflowCooling: 2,
        derateStartTemperature: 125, criticalTemperature: 165, minimumCapability: .15, initialTemperatureOffset: 0 } },
    charging: { acPower: 6600, dcPower: 50000, acEfficiency: .92, dcEfficiency: .96 },
    driveability: { normalAcceleration: 5.8, sportAcceleration: 6.5, ecoAcceleration: 4.2,
      lowRangeAcceleration: 9.0, creepSpeed: 1.45, creepAcceleration: .55, coastDeceleration: .48, fullPowerPedalStart: .80 },
    driveModeStrategy: {
      ECO: { acceleration: 4.2, demandResponseRate: 4.5, fullPowerPedalStart: .86, coastDecelerationScale: 1.22,
        engineStartPowerScale: 1.22, engineStartSpeedScale: 1.12, startDelayScale: 1.45, engineEfficientLoad: .72,
        sportEngineReady: false, smartTargetSocOffset: -.04 },
      STANDARD: { acceleration: 5.8, demandResponseRate: 7.2, fullPowerPedalStart: .80, coastDecelerationScale: 1.0,
        engineStartPowerScale: 1.0, engineStartSpeedScale: 1.0, startDelayScale: 1.0, engineEfficientLoad: .75,
        sportEngineReady: false, smartTargetSocOffset: 0 },
      SPORT: { acceleration: 6.5, demandResponseRate: 12.0, fullPowerPedalStart: .72, coastDecelerationScale: .78,
        engineStartPowerScale: .66, engineStartSpeedScale: .76, startDelayScale: .30, engineEfficientLoad: .86,
        sportEngineReady: true, smartTargetSocOffset: .05 },
    },
    terrainStrategies: {
      SNOW: { pedalExponent: 1.55, acceleration: 3.4, demandResponseRate: 3.2, fullPowerPedalStart: .92,
        coastDecelerationScale: .52, engineStartPowerScale: 1.05, preferEngineReady: false, tcsSlipMultiplier: 1.0 },
      MUD: { pedalExponent: 1.26, acceleration: 4.9, demandResponseRate: 4.8, fullPowerPedalStart: .84,
        coastDecelerationScale: .70, engineStartPowerScale: .75, preferEngineReady: true, tcsSlipMultiplier: 1.48 },
      SAND: { pedalExponent: .96, acceleration: 5.9, demandResponseRate: 7.5, fullPowerPedalStart: .76,
        coastDecelerationScale: .65, engineStartPowerScale: .68, preferEngineReady: true, tcsSlipMultiplier: 1.55 },
    },
    // Low-cost deterministic engineering approximation of Hi4-T INTELLIGENT mode (no ML user-habit learning).
    intelligent: {
      urbanSpeedMps: 50 / 3.6, highwaySpeedMps: 85 / 3.6,
      urbanStartPowerScale: 1.35, midStartPowerScale: 1.05, highwayStartPowerScale: .62,
      urbanTargetSOC: .28, midTargetSOC: .36, highwayTargetSOC: .44,
      generationPowerCapW: 16000, evMaxSpeedMps: 125 / 3.6,
    },
    inverterEfficiency: .97, auxiliaryPower: 650, starterPower: 1800,
    systemPower: 300000, systemTorque: 750, defaultMode: 'INTELLIGENT',
    energyModeOrder: ['EV', 'HEV', 'INTELLIGENT'],
    engineCooling: { coolantWasteFraction: .35, thermostatStartC: 82, thermostatFullC: 95,
      bypassWPerK: 35, fanStartC: 98, fanFullC: 108, minimumFanFraction: .15 },
    energyManagement: { minimumSOC: .15, restartSOC: .22, holdSOC: .50, chargeTargetSOC: .80,
      engineStartPower: 46000, engineStopPower: 18000, engineStartSpeed: 27, minimumRunTime: 14,
      startDemand: .82, startDelay: .28, stopDelay: 3,
      minimumOffTime: 3, maximumGenerationPower: 28000, generationMinimumRPM: 1300,
      engineEfficientLoad: .75, synchronizationToleranceRPM: 220 },
    transfer: { modes: ['2H', 'AWD', '4H', '4L'], defaultMode: 'AWD', lowRatio: 2.64,
      efficiency: .97, highShiftMaximumSpeed: 80 / 3.6, lowShiftMaximumSpeed: .05,
      lowMaximumSpeed: 40 / 3.6,
      frontShare: .35, maximumFrontShare: .5, couplingResponse: 4,
      centerLock: { stiffness: 18000, damping: 450, capacity: 18000 },
      rearLock: { stiffness: 12000, damping: 320, capacity: 12000 },
      lockMaximumSpeed: 5 / 3.6, lockMaximumSlip: 2 },
    regen: { minimumSpeed: .5, fullSpeed: 2.5, liftTorque: 35 },
  };
  return c as P2HybridVehiclePhysicsConfig;
}
