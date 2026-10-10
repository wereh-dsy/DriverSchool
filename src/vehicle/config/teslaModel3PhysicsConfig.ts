import type { ElectricVehiclePhysicsConfig } from './ElectricVehiclePhysicsConfig';
import { createDefaultVehiclePhysicsConfig } from './defaultVehiclePhysicsConfig';
import { TESLA_MODEL_3_DIMENSIONS } from '../VehicleDimensions';
import { createExecutiveSedanPhysicsConfig } from './executiveSedanPhysicsConfig';

/** Single rear PM motor. Electrical values are gameplay calibration, not OEM certification. */
export function createTeslaModel3PhysicsConfig(): ElectricVehiclePhysicsConfig {
  const { engine: _engine, fuel: _fuel, clutch: _clutch, autoClutch: _autoClutch,
    transmission: _transmission, ...chassis } = createDefaultVehiclePhysicsConfig();
  const controls = createExecutiveSedanPhysicsConfig();
  return { ...chassis, ...TESLA_MODEL_3_DIMENSIONS,
    mass: 1765, trackWidth: 1.584, frontWeightBias: .49, centerOfMassHeight: .43,
    yawInertia: 2950, enginePlacement: 'REAR', layoutCalibrationNote: 'Underfloor battery, single rear motor; axle mass share is the authoritative layout.',
    drivetrainType: 'RWD', drivetrainLayout: 'RWD', frontTorqueSplit: 0, rearTorqueSplit: 1,
    frontDiff: { type: 'open' }, rearDiff: { type: 'open' },
    capabilities: { cruiseControl: true, advancedInstrument: true },
    parkingBrake: { ...controls.parkingBrake! }, autoHold: { ...controls.autoHold! },
    cruiseControl: { ...controls.cruiseControl! },
    battery: { usableCapacityKWh: 60, defaultStateOfCharge: .80, nominalVoltage: 355,
      maxDischargePower: 230000, maxChargePower: 85000, dischargeEfficiency: .98, chargeEfficiency: .96,
      lowSOCStart: .08, lowSOCEnd: 0, highSOCRegenStart: .92, highSOCRegenEnd: 1 },
    motor: { maxDriveTorque: 360, maxDrivePower: 210000, maxRPM: 14500, rotationalInertia: .025,
      driveResponseRate: 10, motoringEfficiency: .94, maxRegenTorque: 180, maxRegenPower: 75000, regenEfficiency: .88 },
    fixedReduction: { ratio: 9.03, efficiency: .97, reverseSpeedLimit: 8,
      parkMaximumSpeed: .8, directionLockoutSpeed: 1.5, creepEnabled: false, creepTorque: 0, creepSpeed: 1.5 },
    regen: { strength: .9, maximumLiftOffDeceleration: 2.4, brakeLightDeceleration: 1.3, fadeSpeed: 3, minimumSpeed: .25,
      stopBrakeSpeed: 1.1, stopBrakeDemand: .30, referenceConsumptionKWhPer100km: 15 },
    brakes: { ...chassis.brakes, maxBrakeTorqueFront: 3600, maxBrakeTorqueRear: 2100,
      frontBrakeBias: .63, maxBrakeForce: 5700 / .335 },
    steering: { ...chassis.steering, steeringWheelLock: 720 * Math.PI / 180,
      steeringRatio: 720 / (2 * 31.5), steeringResponse: 4, steeringDamping: 12 },
    aero: { dragCoefficient: .219, frontalArea: 2.25, airDensity: 1.225, liftCoefficientFront: .015, liftCoefficientRear: .025 },
    tires: { ...chassis.tires, rollingResistance: .010,
      longitudinalGrip: .98, lateralGrip: .97, gripCoefficient: .98, wheelInertia: 1.5,
      corneringStiffnessFront: 82000, corneringStiffnessRear: 87000, camberStiffness: 800 },
    suspension: { ...chassis.suspension, rideHeight: .138, springRateFront: 39000, springRateRear: 42000,
      damperCompressionFront: 2800, damperCompressionRear: 2900, damperReboundFront: 4300, damperReboundRear: 4500,
      kinematics: {
        front: { topology: 'DOUBLE_WISHBONE', staticCamber: -.010, camberGainPerMeter: -.35, staticToe: 0, bumpToeGainPerMeter: .008, antiDiveRatio: .16, antiSquatRatio: 0 },
        rear: { topology: 'MULTI_LINK', staticCamber: -.014, camberGainPerMeter: -.30, staticToe: .0005, bumpToeGainPerMeter: .018, antiDiveRatio: 0, antiSquatRatio: .16 },
      } },
    driverAids: { ...chassis.driverAids, absEnabled: true, tractionControlEnabled: true, stabilityControlEnabled: true },
  };
}


