import { STRUCTURAL_CAPABILITIES } from '../VehicleCapabilities';
import type { VehicleChassisConfig } from './VehiclePhysicsConfig';
import type { DifferentialConfig } from './VehiclePlatformConfig';
import type { VehicleVisualConfig } from '../visual/VehicleVisualConfig';
import { isElectricConfig } from './ElectricVehiclePhysicsConfig';

/** Startup/test validation only; no schema framework or work in the fixed loop. */
export function validateVehiclePlatformConfig(config: VehicleChassisConfig, visual?: VehicleVisualConfig): void {
  const require = (ok: boolean, field: string): void => {
    if (!ok) throw new Error(`Invalid vehicle platform config: ${field}`);
  };
  const nonnegative = (value: number, field: string): void => require(Number.isFinite(value) && value >= 0, field);
  const positive = (value: number, field: string): void => require(Number.isFinite(value) && value > 0, field);
  const fraction = (value: number, field: string): void => require(Number.isFinite(value) && value >= 0 && value <= 1, field);
  positive(config.mass, 'mass'); positive(config.wheelBase, 'wheelBase');
  positive(config.yawInertia, 'yawInertia'); positive(config.centerOfMassHeight, 'CG height');
  require(config.frontWeightBias >= .15 && config.frontWeightBias <= .85, 'CG must lie between axles');
  require(['FRONT', 'FRONT_MID', 'MID', 'REAR'].includes(config.enginePlacement), 'engine placement');
  const plausible = config.enginePlacement === 'MID' ? config.frontWeightBias >= .30 && config.frontWeightBias <= .55
    : config.enginePlacement === 'REAR' ? config.frontWeightBias >= .25 && config.frontWeightBias <= .50
    : config.frontWeightBias >= .40 && config.frontWeightBias <= .75;
  require(plausible || !!config.layoutCalibrationNote?.trim(), 'unusual layout requires layoutCalibrationNote');
  if (config.driveModes) {
    const order = config.driveModeOrder ?? ['ECO', 'NORMAL', 'SPORT'];
    require(order.length > 0 && new Set(order).size === order.length, 'drive mode order');
    require(config.driveModes[config.defaultDriveMode ?? 'NORMAL'] !== undefined, 'default drive mode');
    for (const mode of order) require(config.driveModes[mode] !== undefined, 'drive mode calibration missing');
    for (const calibration of Object.values(config.driveModes)) {
      positive(calibration.throttleExponent, 'mode throttle exponent'); positive(calibration.throttleResponse, 'mode throttle response');
      if (calibration.dctShiftTime !== undefined) positive(calibration.dctShiftTime, 'mode DCT shift time');
      if (calibration.accelerationRearTorqueSplit !== undefined) {
        require(config.awd !== undefined, 'mode rear torque split requires AWD');
        fraction(calibration.accelerationRearTorqueSplit, 'mode accelerationRearTorqueSplit');
        require(config.awd?.mode === 'full-time' || config.awd?.maximumRearTorqueSplit === undefined ||
          calibration.accelerationRearTorqueSplit <= config.awd.maximumRearTorqueSplit, 'mode rear torque share exceeds AWD maximum');
      }
    }
  }
  const features = config.capabilities;
  if (features) {
    for (const key of STRUCTURAL_CAPABILITIES) require(!(key in features), `capabilities.${key} is derived; configure its system instead`);
    for (const [key, value] of Object.entries(features)) require(typeof value === 'boolean', `capabilities.${key}`);
    require(features.driveModes !== true || config.driveModes !== undefined, 'driveModes declaration requires calibration');
  }
  require(['FWD', 'RWD', 'AWD'].includes(config.drivetrainType), 'drivetrain type');
  require(config.drivetrainLayout === config.drivetrainType, 'drivetrain layout aliases disagree');
  require((config.awd !== undefined) === (config.drivetrainType === 'AWD'), 'AWD controller and drivetrainType disagree');
  fraction(config.frontTorqueSplit, 'frontTorqueSplit'); fraction(config.rearTorqueSplit, 'rearTorqueSplit');
  if (isElectricConfig(config)) {
    require(config.drivetrainType === 'RWD' || config.drivetrainType === 'FWD', 'single motor needs one driven axle');
    require(!('engine' in config) && !('fuel' in config) && !('clutch' in config) && !config.transmission, 'EV must not install ICE components');
    const { motor, battery, fixedReduction, regen } = config;
    for (const key of ['maxDriveTorque', 'maxDrivePower', 'maxRPM', 'rotationalInertia', 'driveResponseRate', 'maxRegenTorque', 'maxRegenPower'] as const) positive(motor[key], `motor.${key}`);
    for (const key of ['motoringEfficiency', 'regenEfficiency'] as const) { positive(motor[key], `motor.${key}`); fraction(motor[key], `motor.${key}`); }
    for (const key of ['usableCapacityKWh', 'nominalVoltage', 'maxDischargePower', 'maxChargePower', 'dischargeEfficiency', 'chargeEfficiency'] as const) positive(battery[key], `battery.${key}`);
    for (const key of ['defaultStateOfCharge', 'dischargeEfficiency', 'chargeEfficiency', 'lowSOCStart', 'lowSOCEnd', 'highSOCRegenStart', 'highSOCRegenEnd'] as const) fraction(battery[key], `battery.${key}`);
    require(battery.lowSOCEnd === 0 && battery.lowSOCStart > battery.lowSOCEnd && battery.highSOCRegenEnd === 1 && battery.highSOCRegenStart < battery.highSOCRegenEnd, 'battery taper ordering');
    positive(fixedReduction.ratio, 'reduction ratio'); positive(fixedReduction.efficiency, 'reduction efficiency'); fraction(fixedReduction.efficiency, 'reduction efficiency');
    for (const key of ['reverseSpeedLimit', 'parkMaximumSpeed', 'directionLockoutSpeed', 'creepSpeed'] as const) positive(fixedReduction[key], `reduction.${key}`);
    nonnegative(fixedReduction.creepTorque, 'creep torque'); require(typeof fixedReduction.creepEnabled === 'boolean', 'creep enabled');
    fraction(regen.strength, 'regen strength'); positive(regen.maximumLiftOffDeceleration, 'lift off deceleration');
    positive(regen.brakeLightDeceleration, 'regen brake light threshold');
    nonnegative(regen.minimumSpeed, 'regen minimum speed'); require(regen.fadeSpeed > regen.minimumSpeed, 'regen fade ordering');
    nonnegative(regen.stopBrakeSpeed, 'stop brake speed'); fraction(regen.stopBrakeDemand, 'stop brake demand'); positive(regen.referenceConsumptionKWhPer100km, 'EV reference consumption');
  }
  require(Math.abs(config.frontTorqueSplit + config.rearTorqueSplit - 1) < 1e-6, 'axle torque shares must sum to one');
  require(config.drivetrainType !== 'FWD' || config.frontTorqueSplit === 1, 'FWD axle shares');
  require(config.drivetrainType !== 'RWD' || config.rearTorqueSplit === 1, 'RWD axle shares');
  if (config.awd) {
    require(config.awd.mode === 'full-time' || config.awd.mode === 'on-demand', 'AWD mode');
    if (config.awd.response !== undefined) positive(config.awd.response, 'AWD response');
    const maximum = config.awd.maximumRearTorqueSplit;
    const acceleration = config.awd.accelerationRearTorqueSplit;
    if (maximum !== undefined) {
      fraction(maximum, 'AWD maximumRearTorqueSplit');
      require(config.awd.mode === 'full-time' || maximum >= config.rearTorqueSplit, 'AWD maximum share is below nominal');
    }
    if (acceleration !== undefined) {
      fraction(acceleration, 'AWD accelerationRearTorqueSplit');
      // Full-time ignores acceleration calibration; on-demand clamps to nominal.
      require(config.awd.mode === 'full-time' || maximum === undefined || acceleration <= maximum, 'AWD acceleration share exceeds maximum');
    }
  }
  const differential = (diff: DifferentialConfig | undefined, axle: string): void => {
    if (!diff) return; // Legacy omission means the existing open carrier.
    require(diff.type === 'open' || diff.type === 'lsd', `${axle} differential type`);
    if (diff.type !== 'lsd') return;
    nonnegative(diff.preload, `${axle} LSD preload`); fraction(diff.lockStrength, `${axle} LSD lockStrength`);
    require(Number.isFinite(diff.torqueBiasRatio) && diff.torqueBiasRatio >= 1, `${axle} LSD torqueBiasRatio`);
    nonnegative(diff.speedDifferenceSensitivity, `${axle} LSD sensitivity`); positive(diff.response, `${axle} LSD response`);
  };
  differential(config.frontDiff, 'front'); differential(config.rearDiff, 'rear');
  require(config.drivetrainType !== 'FWD' || config.rearDiff?.type !== 'lsd', 'FWD cannot install a rear drive LSD');
  require(config.drivetrainType !== 'RWD' || config.frontDiff?.type !== 'lsd', 'RWD cannot install a front drive LSD');
  if (config.electronicDifferential) {
    const d = config.electronicDifferential;
    fraction(d.slipThreshold, 'eDiff slipThreshold'); nonnegative(d.speedDifferenceThreshold, 'eDiff speed threshold');
    nonnegative(d.maximumBrakeTorque, 'eDiff brake torque'); positive(d.response, 'eDiff response');
  }
  const transmission = config.transmission;
  const tcs = config.driverAids.tcs;
  if (tcs) { positive(tcs.slipThresholdMultiplier, 'TCS slip threshold'); fraction(tcs.maximumTorqueReduction, 'TCS torque reduction');
    positive(tcs.response, 'TCS response'); positive(tcs.recoveryResponse, 'TCS recovery'); }
  for (const key of ['dragCoefficient', 'frontalArea', 'airDensity'] as const) nonnegative(config.aero[key], `aero.${key}`);
  for (const key of ['liftCoefficientFront', 'liftCoefficientRear'] as const) require(Number.isFinite(config.aero[key]), `aero.${key}`);
  for (const key of ['wetLongitudinalGripRetention', 'wetLateralGripRetention'] as const)
    if (config.tires[key] !== undefined) fraction(config.tires[key], `tires.${key}`);
  const adaptive = config.suspension.adaptiveDamping;
  if (config.suspension.kinematics) for (const axle of Object.values(config.suspension.kinematics)) {
    require(['MACPHERSON', 'DOUBLE_WISHBONE', 'MULTI_LINK', 'TORSION_BEAM'].includes(axle.topology), 'suspension topology');
    for (const key of ['staticCamber', 'camberGainPerMeter', 'staticToe', 'bumpToeGainPerMeter'] as const)
      require(Number.isFinite(axle[key]), `kinematics.${key}`);
    require(Math.abs(axle.staticCamber) <= .15 && Math.abs(axle.staticToe) <= .05 &&
      Math.abs(axle.camberGainPerMeter) <= 1 && Math.abs(axle.bumpToeGainPerMeter) <= .5, 'kinematics alignment bounds');
    fraction(axle.antiDiveRatio, 'anti dive'); fraction(axle.antiSquatRatio, 'anti squat');
  }
  if (config.tires.camberStiffness !== undefined) nonnegative(config.tires.camberStiffness, 'camber stiffness');
  if (adaptive) { positive(adaptive.responseRate, 'adaptive damping response');
    for (const value of Object.values(adaptive.modeMultipliers)) positive(value, 'adaptive damping multiplier'); }
  const air = config.suspension.airSuspension;
  if (air) {
    positive(air.nominalRideHeight, 'air nominal height');
    require(Math.abs(air.nominalRideHeight - config.suspension.rideHeight) < 1e-6, 'air nominal height must match loaded geometry');
    require(Number.isFinite(air.minimumOffset) && Number.isFinite(air.maximumOffset) && air.minimumOffset <= 0 && air.maximumOffset >= 0, 'air bounds');
    positive(air.adjustmentRate, 'air adjustment rate');
    for (const offset of Object.values(air.modeOffsets)) require(Number.isFinite(offset) && offset >= air.minimumOffset && offset <= air.maximumOffset, 'air mode offset');
    if (air.highSpeedLowering) {
      const high = air.highSpeedLowering;
      positive(high.activateSpeed, 'air lowering speed'); nonnegative(high.restoreSpeed, 'air restore speed');
      require(high.restoreSpeed < high.activateSpeed, 'air speed hysteresis'); positive(high.delay, 'air delay');
      require(high.offset >= air.minimumOffset && high.offset <= 0, 'air lowering offset');
    }
  }
  if ('startStop' in config && config.startStop !== undefined) {
    const startStop = config.startStop as import('./VehiclePhysicsConfig').StartStopConfig;
    require(transmission !== undefined && (transmission.type ?? 'MANUAL') !== 'MANUAL', 'Start/Stop requires an automatic ICE');
    positive(startStop.minimumStopDelay, 'Start/Stop delay'); nonnegative(startStop.stopSpeedThreshold, 'Start/Stop speed');
    fraction(startStop.brakeThreshold, 'Start/Stop brake'); fraction(startStop.restartThrottleThreshold, 'Start/Stop throttle');
    fraction(startStop.restartBrakeReleaseThreshold, 'Start/Stop brake release'); nonnegative(startStop.restartDelay, 'Start/Stop restart delay');
  }
  const type = transmission?.type ?? 'MANUAL';
  if (transmission) {
    require(['MANUAL', 'TORQUE_CONVERTER_AT', 'DCT', 'CVT'].includes(type), 'transmission type');
    require(!transmission.supportsManualSelection || type === 'TORQUE_CONVERTER_AT' || type === 'DCT',
      'manual selection requires a stepped AT/DCT');
    if (type === 'CVT') require(Object.keys(transmission.gearRatios).length === 0, 'CVT cannot have fake stepped gears');
  }
  const parking = config.parkingBrake;
  if (parking) {
    require(parking.axle === 'front' || parking.axle === 'rear', 'EPB axle');
    nonnegative(parking.maximumTorque, 'EPB torque'); nonnegative(parking.applyRate, 'EPB applyRate');
    nonnegative(parking.releaseRate, 'EPB releaseRate'); nonnegative(parking.maximumStaticApplySpeed, 'EPB static speed');
    fraction(parking.emergencyBrakeDemand, 'EPB emergency demand'); positive(parking.emergencyResponse, 'EPB emergency response');
    fraction(parking.releaseThrottle, 'EPB release throttle');
  }
  if (config.autoHold) {
    const hold = config.autoHold;
    require(type !== 'MANUAL' || transmission === undefined, 'Auto Hold requires a selector-based transmission');
    positive(config.brakes.maxBrakeTorqueFront, 'Auto Hold front service brake capacity');
    positive(config.brakes.maxBrakeTorqueRear, 'Auto Hold rear service brake capacity');
    positive(config.brakes.applyResponse, 'Auto Hold service apply response');
    positive(config.brakes.releaseResponse, 'Auto Hold service release response');
    require(config.brakes.frontBrakeBias > 0 && config.brakes.frontBrakeBias < 1, 'Auto Hold service brake allocation');
    nonnegative(hold.maximumCaptureSpeed, 'Auto Hold capture speed');
    require(hold.maximumCaptureSpeed <= .5, 'Auto Hold capture speed must be near rest');
    positive(hold.captureBrake, 'Auto Hold capture brake'); fraction(hold.captureBrake, 'Auto Hold capture brake');
    positive(hold.minimumHoldPressure, 'Auto Hold hold pressure'); fraction(hold.minimumHoldPressure, 'Auto Hold hold pressure');
    positive(hold.releaseThrottle, 'Auto Hold release throttle'); fraction(hold.releaseThrottle, 'Auto Hold release throttle');
    nonnegative(hold.releaseThrottleHysteresis, 'Auto Hold throttle hysteresis');
    require(hold.releaseThrottleHysteresis < hold.releaseThrottle, 'Auto Hold release hysteresis must be below threshold');
    nonnegative(hold.releaseDelay, 'Auto Hold release delay');
    positive(hold.applyRate, 'Auto Hold applyRate'); positive(hold.releaseRate, 'Auto Hold releaseRate');
  }
  if (visual?.parkingCamera) require(typeof visual.parkingCamera.surroundView === 'boolean', 'camera surroundView flag');
}
