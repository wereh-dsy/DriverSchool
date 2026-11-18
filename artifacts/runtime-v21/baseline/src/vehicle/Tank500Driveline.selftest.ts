import { createTank500Hi4TPhysicsConfig } from './config/tank500Hi4TPhysicsConfig';
import { P2HybridTransmission } from './transmission/P2HybridTransmission';
import type { TransmissionContext } from './transmission/TransmissionSystem';
import { Gearbox } from './physics/Gearbox';
import { CompliantShaftCoupling } from './physics/CompliantShaftCoupling';
import { MechanicalTransferCase } from './powertrain/MechanicalTransferCase';
import { VehicleDynamics } from './physics/VehicleDynamics';
import { P2HybridPowertrain } from './powertrain/P2HybridPowertrain';
import { createNeutralVehicleInputState } from '../input/VehicleInputState';
import { createWheelContactBuffer, WHEEL_IDS } from './physics/WheelContact';
import { SURFACE_MATERIALS } from '../world/SurfaceMaterial';

export function runTank500DrivelineSelfTest() {
  let assertions = 0; const check = (ok: boolean, m: string) => { assertions++; if (!ok) throw Error('Tank driveline: ' + m); };
  const dt = 1 / 120, config = createTank500Hi4TPhysicsConfig(), results: Record<string, unknown> = {};
  const tr = new P2HybridTransmission(new Gearbox(config.transmission), config.transmission, config.wheelRadius);
  tr.reset(1, 'D');
  const c: TransmissionContext = { dt, engineAngularVelocity: 0, engineRPM: 0, engineRunning: true, engineInertia: .22,
    idleRPM: 780, stallRPM: 400, redlineRPM: 6400, availableEngineTorque: 150, throttle: .25, brake: 0, vehicleSpeed: 0,
    drivenWheelAngularVelocity: 0, engineTorqueAtRPM: rpm => Math.min(750, 300000 / Math.max(1, rpm * Math.PI / 30)) };
  const sample = (speed: number, throttle: number, brake = 0) => {
    c.vehicleSpeed = speed; c.drivenWheelAngularVelocity = speed / config.wheelRadius; c.throttle = throttle; c.brake = brake;
    c.engineAngularVelocity = c.drivenWheelAngularVelocity * tr.ratio * config.transmission.finalDriveRatio;
    c.engineRPM = c.engineAngularVelocity * 30 / Math.PI; tr.prepare(c); tr.update(c); return tr.getSnapshot();
  };
  const up: { gear: number; speedKmh: number; rpm: number }[] = [], down: typeof up = []; let previous = 1;
  for (let i = 0; i < 14400; i++) {
    const s = sample(40 * i / 14399, .25);
    if (typeof s.currentPhysicalGear === 'number' && s.currentPhysicalGear !== previous) {
      up.push({ gear: s.currentPhysicalGear, speedKmh: c.vehicleSpeed * 3.6, rpm: c.engineRPM }); previous = s.currentPhysicalGear;
    }
    check(Number.isFinite(s.currentRatio) && c.engineRPM < 6450, 'finite safe input RPM during complete upshift sweep');
  }
  check(up.map(s => s.gear).join(',') === '2,3,4,5,6,7,8,9', 'nine distinct ratios reached without hunting: ' + JSON.stringify(up));
  for (let i = 0; i < 14400; i++) {
    const s = sample(40 * (1 - i / 14399), .01, .3);
    if (typeof s.currentPhysicalGear === 'number' && s.currentPhysicalGear !== previous) { down.push({ gear: s.currentPhysicalGear, speedKmh: c.vehicleSpeed * 3.6, rpm: c.engineRPM }); previous = s.currentPhysicalGear; }
    check(c.engineRPM < 6450, 'braking downshifts retain overrev protection');
  }
  check(down.at(-1)?.gear === 1 && down.every((g, i) => i === 0 || g.gear < down[i - 1]!.gear), 'progressive downshift sweep returns to launch gear');
  tr.reset(9, 'D'); for (let i = 0; i < 240; i++) sample(20, .2);
  let kickdown = false, kickRatioStep = 0, beforeRatio = tr.ratio;
  for (let i = 0; i < 240; i++) { const s = sample(20, 1); kickdown ||= s.kickdown; kickRatioStep = Math.max(kickRatioStep, Math.abs(tr.ratio - beforeRatio)); beforeRatio = tr.ratio; }
  check(kickdown && typeof tr.gearbox.currentGear === 'number' && tr.gearbox.currentGear <= 5, 'full pedal drops several ratios into useful RPM');
  check(kickRatioStep < .1, 'multi-gear kickdown interpolates continuously');
  const kickGear = tr.gearbox.currentGear;
  tr.reset(4, 'D'); for (let i = 0; i < 180 && !tr.isShifting; i++) sample(18, .35);
  check(tr.isShifting, 'mid-shift kickdown fixture starts an upshift');
  for (let i = 0; i < 300; i++) sample(18, 1);
  check(typeof tr.gearbox.currentGear === 'number' && tr.gearbox.currentGear <= 3, 'pedal kickdown during overlap is retained after shift');
  results.transmission = { ratios: config.transmission.gearRatios, up, down, kickGear, kickRatioStep, queuedKickGear: tr.gearbox.currentGear };

  const transfer = new MechanicalTransferCase(config.hybrid.transfer);
  check(transfer.request('2H', 0, 'N', 1) && transfer.frontShare === 0, '2H only sends propulsion to rear branch');
  check(!transfer.request('4L', 1, 'D', 0) && transfer.request('4L', 0, 'N', 1) && transfer.ratio === config.hybrid.transfer.lowRatio, 'low range real ratio and selector/brake interlocks');
  check(transfer.requestAxleLock('rear', true, 0) && !transfer.requestAxleLock('front', true, 0), 'installed rear lock independent of uninstalled front equipment');
  check(transfer.request('AWD', 0, 'N', 1) && !transfer.rearLock!.engaged && !transfer.centerLock!.engaged, 'normal drive releases mechanical locks');
  const inertia = [7, 7, 9, 9], omega = [10, 12, 25, -2];
  const center = transfer.centerLock!, rear = transfer.rearLock!; center.engaged = rear.engaged = true;
  const kinetic = () => omega.reduce((sum, w, i) => sum + .5 * inertia[i]! * w * w, 0);
  const momentum = () => omega.reduce((sum, w, i) => sum + inertia[i]! * w, 0);
  const initialEnergy = kinetic(), initialMomentum = momentum(); let maximumResidual = 0;
  for (let i = 0; i < 600; i++) {
    center.integrate(dt, omega, inertia); rear.integrate(dt, omega, inertia);
    const residual = initialEnergy - kinetic() - center.storedEnergyJ - rear.storedEnergyJ - center.dissipatedJ - rear.dissipatedJ;
    maximumResidual = Math.max(maximumResidual, Math.abs(residual));
    check(Math.abs(momentum() - initialMomentum) < 1e-8 && Math.abs(residual) < 1e-7, 'lock impulses conserve angular momentum and close elastic/thermal energy');
  }
  check(Math.abs((omega[0]! + omega[1]! - omega[2]! - omega[3]!) * .5) < .01 && Math.abs(omega[2]! - omega[3]!) < .01, 'central carriers and locked rear sides synchronize');
  check(Math.abs(omega[0]! - omega[1]!) > 1, 'central lock preserves front open-differential speed difference');
  center.engaged = rear.engaged = false; center.integrate(dt, omega, inertia); rear.integrate(dt, omega, inertia);
  check(center.storedEnergyJ === 0 && rear.storedEnergyJ === 0, 'unlock unloads stored stress into accounted dissipation');
  const limited = new CompliantShaftCoupling('rear', [0, 0, 1, -1], { stiffness: 2000, damping: 80, capacity: 15 });
  limited.engaged = true; const fast = [0, 0, 100, 0]; limited.integrate(dt, fast, inertia);
  check(Math.abs(limited.torque) <= 15.000001 && fast[2]! - fast[3]! > 90 && Math.abs(limited.energyResidualJ) < 1e-7, 'capacity-limited lock never overwrites spinning wheels with equal speeds');
  results.lockEnergy = { maximumResidualJ: maximumResidual, momentumError: momentum() - initialMomentum, center: center.getSnapshot(), rear: rear.getSnapshot() };

  const input = createNeutralVehicleInputState();
  for (const [mode, surface, lock] of [['2H', 'wet-asphalt', false], ['4H', 'asphalt', false], ['4H', 'wet-asphalt', false], ['4L', 'mud', true], ['4L', 'sand', true]] as const) {
    const car = new VehicleDynamics<P2HybridPowertrain>(createTank500Hi4TPhysicsConfig(), { driveSelector: 'N', stateOfCharge: .18 });
    check(car.powertrain.requestTransferMode(mode, 0, 1), 'select off-road transfer mode');
    if (lock) check(car.powertrain.requestAxleLock('rear', true, 0), 'pre-engage rear lock while synchronized');
    check(car.requestDriveSelector('D', 1), 'select propulsion after transfer mode');
    const contacts = createWheelContactBuffer();
    for (const id of WHEEL_IDS) Object.assign(contacts[id], SURFACE_MATERIALS[surface], { supportValid: true });
    if (surface !== 'asphalt') Object.assign(contacts.rearLeft, SURFACE_MATERIALS.ice);
    let stress = 0, maxRearSlip = 0, maxFrontDifference = 0;
    for (let i = 0; i < 1200; i++) {
      const s = car.stepFixed(dt, { ...input, throttle: .4, steering: mode === '4H' ? .3 : 0 }, { wheelContacts: contacts });
      check(!s.recoveredFromInvalidState && car.powertrain.numericallyValid, 'locked/split-adhesion wheel and chassis state stays finite');
      stress = Math.max(stress, Math.abs(car.powertrain.transfer.centerLock?.torque ?? 0));
      maxRearSlip = Math.max(maxRearSlip, Math.abs(s.wheels.rearLeft.angularVelocity - s.wheels.rearRight.angularVelocity));
      maxFrontDifference = Math.max(maxFrontDifference, Math.abs(s.wheels.frontLeft.angularVelocity - s.wheels.frontRight.angularVelocity));
    }
    check(car.speed > .2, 'physical traction propels chassis on ' + surface);
    if (mode === '4H') check(stress > 1 && maxFrontDifference > .01, 'locked high-grip turning develops shaft stress without forcing four equal speeds');
    check(car.config.tires.longitudinalGrip === .90, 'no artificial off-road grip');
    results[mode + '/' + surface] = { speedKmh: car.speed * 3.6, maximumCenterReactionNm: stress, maxRearDifferenceRadS: maxRearSlip, maxFrontDifferenceRadS: maxFrontDifference,
      locks: car.powertrain.transfer.getSnapshot() };
  }
  // The same split-adhesion fixture with electronic interventions removed isolates
  // the mechanical rear coupling; this changes only the test's configuration.
  const splitResults: { locked: boolean; speedKmh: number; rearDifference: number; reactionNm: number; afterUnlockDifference?: number }[] = [];
  for (const locked of [false, true]) {
    const cfg = createTank500Hi4TPhysicsConfig(); cfg.electronicDifferential = undefined;
    const car = new VehicleDynamics<P2HybridPowertrain>(cfg, { driveSelector: 'N', stateOfCharge: .75 });
    car.setDriverAssistOptions({ absEnabled: true, ebdEnabled: true, tractionControlEnabled: false, stabilityControlEnabled: false });
    check(car.powertrain.requestTransferMode('4L', 0, 1), 'split-adhesion selects low range');
    if (locked) check(car.powertrain.requestAxleLock('rear', true, 0), 'split-adhesion rear lock engages');
    check(car.requestDriveSelector('D', 1), 'split-adhesion selects D');
    const contacts = createWheelContactBuffer();
    for (const id of WHEEL_IDS) Object.assign(contacts[id], SURFACE_MATERIALS.asphalt, { supportValid: true });
    Object.assign(contacts.rearLeft, SURFACE_MATERIALS.ice);
    let difference = 0, reaction = 0;
    for (let i = 0; i < 1200; i++) {
      const s = car.stepFixed(dt, { ...input, throttle: .7 }, { wheelContacts: contacts });
      check(!s.recoveredFromInvalidState, 'split-adhesion mechanical differential remains physical');
      difference = Math.max(difference, Math.abs(s.wheels.rearLeft.angularVelocity - s.wheels.rearRight.angularVelocity));
      reaction = Math.max(reaction, Math.abs(car.powertrain.transfer.rearLock!.torque));
    }
    let afterUnlockDifference: number | undefined;
    if (locked) {
      check(car.powertrain.requestAxleLock('rear', false, car.speed), 'unlock allowed without synchronization gate');
      afterUnlockDifference = 0;
      for (let i = 0; i < 600; i++) {
        const s = car.stepFixed(dt, { ...input, throttle: .7 }, { wheelContacts: contacts });
        afterUnlockDifference = Math.max(afterUnlockDifference, Math.abs(s.wheels.rearLeft.angularVelocity - s.wheels.rearRight.angularVelocity));
      }
      // The vehicle is faster now: compare the unlocked contract, not its slip
      // magnitude against the earlier, higher-torque launch maximum.
      check(afterUnlockDifference > .01 && car.powertrain.transfer.rearLock!.torque === 0 && car.powertrain.transfer.rearLock!.storedEnergyJ === 0,
        'unlock restores differential motion with zero mechanical lock reaction and stored stress');
    }
    splitResults.push({ locked, speedKmh: car.speed * 3.6, rearDifference: difference, reactionNm: reaction, afterUnlockDifference });
  }
  check(splitResults[0]!.rearDifference > splitResults[1]!.rearDifference + 1 && splitResults[1]!.reactionNm > 1,
    'rear lock suppresses differential slip through reaction torque rather than traction bias: ' + JSON.stringify(splitResults));
  results.rearLockComparison = splitResults;
  const cross = new VehicleDynamics<P2HybridPowertrain>(createTank500Hi4TPhysicsConfig(), { driveSelector: 'N', stateOfCharge: .08 });
  check(cross.powertrain.requestTransferMode('4L', 0, 1) && cross.powertrain.requestAxleLock('rear', true, 0) && cross.requestDriveSelector('D', 1), 'low-SOC cross-axle setup');
  const crossContacts = createWheelContactBuffer();
  for (const id of WHEEL_IDS) Object.assign(crossContacts[id], SURFACE_MATERIALS.gravel, { supportValid: true });
  Object.assign(crossContacts.frontLeft, { supportValid: false }); Object.assign(crossContacts.rearRight, { supportValid: false });
  let crossPeakTorque = 0;
  for (let i = 0; i < 7200; i++) {
    const s = cross.stepFixed(dt, { ...input, throttle: .4 }, { wheelContacts: crossContacts });
    check(!s.recoveredFromInvalidState && cross.powertrain.numericallyValid, 'locked low-SOC cross-axle remains finite without recovery');
    crossPeakTorque = Math.max(crossPeakTorque, Math.abs(cross.powertrain.transfer.rearLock!.torque));
  }
  check(cross.speed > .1 && crossPeakTorque > 1, 'grounded rear wheel propels cross-axle vehicle through mechanical lock');
  results.lockedCrossAxle = { seconds: 60, speedKmh: cross.speed * 3.6, rearReactionNm: crossPeakTorque, soc: cross.powertrain.battery.stateOfCharge };
  const shiftCar = new VehicleDynamics<P2HybridPowertrain>(createTank500Hi4TPhysicsConfig(), { driveSelector: 'D' }); shiftCar.powertrain.setHybridMode('SPORT');
  let fillSamples = 0, maxStep = 0, previousTorque = 0;
  for (let i = 0; i < 2400; i++) {
    const s = shiftCar.stepFixed(dt, { ...input, throttle: .45 });
    if ((s.powertrain.hybrid!.shiftTorqueFillNm ?? 0) > 1) fillSamples++;
    if (s.transmission.shiftInProgress) maxStep = Math.max(maxStep, Math.abs(shiftCar.powertrain.axleOutput.drivenWheelTorque - previousTorque));
    previousTorque = shiftCar.powertrain.axleOutput.drivenWheelTorque;
    check(!s.recoveredFromInvalidState && s.powertrain.hybrid!.wheelPowerW <= 300001, 'shift fill respects whole-driveline power ceiling');
  }
  check(fillSamples > 0 && maxStep < 5000, 'real bounded P2 torque fill during ICE torque cuts');
  results.shiftFill = { fillSamples, maximumWheelTorqueStepNm: maxStep };
  return { assertions, results };
}
