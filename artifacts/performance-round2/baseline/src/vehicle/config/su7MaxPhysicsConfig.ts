import type { ElectricVehiclePhysicsConfig, ElectricMotorConfig, FixedReductionConfig } from './ElectricVehiclePhysicsConfig';
import { createDefaultVehiclePhysicsConfig } from './defaultVehiclePhysicsConfig';
import { VehicleControlPresets } from '../control/VehicleControlPresets';
import { createLateralAssistConfig } from '../control/LateralAssistController';
import { createTyreThermalPressureConfig } from './TyreThermalPressureConfig';
import { SU7_MAX_DIMENSIONS as d } from '../su7MaxDimensions';
import { createRoadParkingBrakeConfig, createRoadAutoHoldConfig } from './VehiclePlatformConfig';

/** OEM anchors and engineering estimates are separated in docs/SU7_MAX_2026.md.
 * The existing torque/power/voltage-envelope motor is a calibrated surrogate:
 * induction front has greater light-load/copper losses and slower flux response;
 * rear PMSM has lower losses and faster response. No electromagnetic FEA model.
 */
export function createSU7MaxPhysicsConfig(): ElectricVehiclePhysicsConfig {
  const { engine: _engine, fuel: _fuel, clutch: _clutch, autoClutch: _autoClutch,
    transmission: _transmission, ...base } = createDefaultVehiclePhysicsConfig();
  const front: ElectricMotorConfig = {
    maxDrivePower: 220000, maxDriveTorque: 338, continuousPower: 115000,
    nominalVoltage: 800, maxRPM: 22000, baseSpeedRPM: 220000 / 338 * 30 / Math.PI,
    highSpeedRollOffRPM: 18400, rotationalInertia: .024, driveResponseRate: 14,
    motoringEfficiency: .944, copperLossAtMaxTorque: 4100,
    efficiencyMap: { lightLoadPenalty: .055, highLoadPenalty: .025, highSpeedPenalty: .016 },
    maxRegenTorque: 170, maxRegenPower: 105000, regenEfficiency: .87,
    thermal: { thermalCapacity: 58000, coolingRate: 94, airflowCooling: 1.9,
      derateStartTemperature: 92, criticalTemperature: 137, minimumCapability: 0, initialTemperatureOffset: 5 },
  };
  const rear: ElectricMotorConfig = {
    maxDrivePower: 288000, maxDriveTorque: 528, continuousPower: 170000,
    nominalVoltage: 800, maxRPM: 22000, baseSpeedRPM: 288000 / 528 * 30 / Math.PI,
    highSpeedRollOffRPM: 18400, rotationalInertia: .031, driveResponseRate: 19,
    motoringEfficiency: .963, copperLossAtMaxTorque: 3200,
    efficiencyMap: { lightLoadPenalty: .017, highLoadPenalty: .023, highSpeedPenalty: .012 },
    maxRegenTorque: 300, maxRegenPower: 180000, regenEfficiency: .925,
    thermal: { thermalCapacity: 81000, coolingRate: 127, airflowCooling: 2.7,
      derateStartTemperature: 96, criticalTemperature: 142, minimumCapability: 0, initialTemperatureOffset: 5 },
  };
  // Single speed on BOTH axles. Ratio/roll-off jointly give a ~265 km/h envelope.
  const reduction: FixedReductionConfig = { ratio: 10.35, efficiency: .974,
    reverseSpeedLimit: 7, parkMaximumSpeed: .6, directionLockoutSpeed: 1.5,
    creepEnabled: false, creepTorque: 0, creepSpeed: 1.4 };
  return { ...base, ...d, mass: 2280, trackWidth: (d.frontTrackWidth + d.rearTrackWidth) / 2,
    frontWeightBias: .493, centerOfMassHeight: .445, yawInertia: 4040,
    enginePlacement: 'REAR', layoutCalibrationNote: 'Underfloor pack, front induction / rear PMSM; estimated 49.3:50.7 axle mass share.',
    drivetrainType: 'AWD', drivetrainLayout: 'AWD', frontTorqueSplit: .39, rearTorqueSplit: .61,
    awd: { mode: 'full-time', accelerationRearTorqueSplit: .62, maximumRearTorqueSplit: .85, response: 9 },
    frontDiff: { type: 'open' }, rearDiff: { type: 'open' },
    controlCalibration: VehicleControlPresets.performanceEV, lateralAssist: createLateralAssistConfig(),
    capabilities: { cruiseControl: true, advancedInstrument: true, tpms: true },
    parkingBrake: createRoadParkingBrakeConfig(4100), autoHold: createRoadAutoHoldConfig(),
    cruiseControl: {},
    battery: { grossEnergyKWh: 101.7, usableCapacityKWh: 98.4, defaultStateOfCharge: .8,
      // 897 V is the OEM PEAK platform voltage, not nominal OCV. 804.5*1.115≈897.
      nominalVoltage: 804.5, electrical: { internalResistance: .047, maxDischargeCurrent: 850, maxChargeCurrent: 420 },
      maxDischargePower: 600000, maxChargePower: 300000, dischargeEfficiency: .985, chargeEfficiency: .975,
      lowSOCStart: .12, lowSOCEnd: 0, highSOCRegenStart: .90, highSOCRegenEnd: 1,
      coldDischargeFullTemperature: 18, coldDischargeZeroTemperature: -30,
      coldChargeFullTemperature: 22, coldChargeZeroTemperature: -15,
      thermal: { thermalCapacity: 960000, coolingRate: 165, airflowCooling: 3.2,
        derateStartTemperature: 51, criticalTemperature: 68, minimumCapability: .25, initialTemperatureOffset: 7 } },
    motor: rear, fixedReduction: { ...reduction },
    driveUnits: [{ axle: 'front', motor: front, transmission: { ...reduction },
      inverter: { maxPower: 255000, efficiency: .981,
        thermal: { thermalCapacity: 31000, coolingRate: 82, airflowCooling: 1.6,
          derateStartTemperature: 103, criticalTemperature: 146, minimumCapability: .3, initialTemperatureOffset: 5 } } },
      { axle: 'rear', motor: rear, transmission: { ...reduction },
        inverter: { maxPower: 325000, efficiency: .984,
          thermal: { thermalCapacity: 44000, coolingRate: 110, airflowCooling: 2,
            derateStartTemperature: 105, criticalTemperature: 149, minimumCapability: .3, initialTemperatureOffset: 5 } } }],
    normalSystemPower: 508000, auxiliaryPower: 850, ambientTemperature: 20, audioPresence: 1.25,
    regen: { strength: .32, maximumLiftOffDeceleration: 1.8, brakeRegenFraction: 1,
      brakeLightDeceleration: 1.3, fadeSpeed: 2.8, minimumSpeed: .25,
      stopBrakeSpeed: 0, stopBrakeDemand: 0, referenceConsumptionKWhPer100km: 18.2 },
    driveModes: {
      NORMAL: { throttleExponent: 1.25, throttleResponse: 10, steeringResponse: 4.5, steeringDamping: 13.8,
        ev: { coolingMultiplier: 1, powerFraction: 1, frontParticipation: .35, liftOffMultiplier: .85, shiftStrategy: 'normal' } },
      SPORT: { throttleExponent: 1.02, throttleResponse: 17, steeringResponse: 5.2, steeringDamping: 15,
        ev: { coolingMultiplier: 1.4, powerFraction: 1, frontParticipation: .8, liftOffMultiplier: 1.2, shiftStrategy: 'sport' } },
    }, driveModeOrder: ['NORMAL', 'SPORT'], defaultDriveMode: 'NORMAL',
    brakes: { ...base.brakes, maxBrakeForce: 28500, frontBrakeBias: .645,
      maxBrakeTorqueFront: 28500 * d.wheelRadius * .645, maxBrakeTorqueRear: 28500 * d.wheelRadius * .355,
      pedalCurveExponent: 1.22, response: 13, applyResponse: 13, releaseResponse: 21 },
    steering: { ...base.steering, maxRoadWheelAngle: 32 * Math.PI / 180, maxSteeringAngle: 32 * Math.PI / 180,
      steeringRatio: 13.6, steeringWheelLock: 870.4 * Math.PI / 180,
      steeringResponse: 4.5, steeringDamping: 13.8, steeringReturnRate: 5.6,
      returnProfile: { lowSpeedRate: .6, highSpeedRate: 1.55, speedReference: 16 },
      highSpeedReferenceSpeed: 21, highSpeedMinimumAuthority: .17, ackermannFactor: .91 },
    aero: { dragCoefficient: .205, frontalArea: 2.36, airDensity: 1.225,
      liftCoefficientFront: -.008, liftCoefficientRear: -.022,
      // Engineering estimate: ~201 N extra rear downforce at 200 km/h.
      // The existing visual 90/70 km/h hysteresis now belongs to physics.
      activeSpoiler: { deploySpeed: 90/3.6, retractSpeed: 70/3.6, responseRate: 2.5,
        dragCoefficientDelta: .006, rearLiftCoefficientDelta: -.045 } },
    tires: { ...base.tires, rollingResistance: .0105, longitudinalGrip: 1.09, lateralGrip: 1.08, gripCoefficient: 1.08,
      wheelInertia: 1.92, corneringStiffnessFront: 116000, corneringStiffnessRear: 130000,
      camberStiffness: 1150, peakSlipRatio: .105, peakSlipAngle: .125, gripFalloff: .28, loadSensitivity: .055,
      verticalCompliance: { stiffness: 255000, damping: 2450, maximumCompression: .052 },
      thermalPressureFront: createTyreThermalPressureConfig(270, { thermalCapacity: 33500, heatingEfficiency: .75 }),
      thermalPressureRear: createTyreThermalPressureConfig(280, { thermalCapacity: 36000, heatingEfficiency: .75 }) },
    suspension: { ...base.suspension, rideHeight: .134, springRateFront: 50500, springRateRear: 54500,
      damperCompressionFront: 2460, damperCompressionRear: 2590, damperReboundFront: 3670, damperReboundRear: 3920,
      suspensionTravel: .155, bumpStopStiffness: 295000, unsprungMass: { front: 53, rear: 56 },
      antiRollStiffnessFront: 29500, antiRollStiffnessRear: 26500, antiRollStiffness: 56000,
      adaptiveDamping: { responseRate: 2.8, modeMultipliers: { NORMAL: .95, SPORT: 1.28 } },
      airSuspension: { nominalRideHeight: .134, minimumOffset: -.025, maximumOffset: .025, adjustmentRate: .005,
        modeOffsets: { NORMAL: 0, SPORT: -.015 },
        highSpeedLowering: { activateSpeed: 33.3, restoreSpeed: 27.8, delay: 4, offset: -.020 } },
      kinematics: { front: { topology: 'DOUBLE_WISHBONE', staticCamber: -.014, camberGainPerMeter: -.40,
        staticToe: 0, bumpToeGainPerMeter: .005, antiDiveRatio: .23, antiSquatRatio: 0 },
        rear: { topology: 'MULTI_LINK', staticCamber: -.022, camberGainPerMeter: -.35,
          staticToe: .0012, bumpToeGainPerMeter: .012, antiDiveRatio: 0, antiSquatRatio: .22 } } },
    driverAids: { ...base.driverAids, absEnabled: true, ebdEnabled: true, tractionControlEnabled: true, stabilityControlEnabled: true,
      tcs: { slipThresholdMultiplier: 1.12, maximumTorqueReduction: .96, response: 18, recoveryResponse: 4.5 },
      esc: { yawErrorThreshold: .13, sideslipThreshold: .085, response: 11, minimumSpeed: 4 } },
  };
}
