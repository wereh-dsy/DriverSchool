import { createNeutralVehicleInputState, type VehicleInputState } from '../../input/VehicleInputState';
import { SURFACE_MATERIALS, blendSurfaceMaterials, type SurfaceMaterial } from '../../world/SurfaceMaterial';
import { VehicleDynamics } from './VehicleDynamics';
import { WHEEL_IDS, type WheelContactSet } from './WheelContact';

const dt = 1 / 120;
const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(`Contact dynamics self-test failed: ${message}`);
};
const input = (overrides: Partial<VehicleInputState> = {}): VehicleInputState => ({
  ...createNeutralVehicleInputState(), ...overrides,
});

const contacts = (
  left: SurfaceMaterial = SURFACE_MATERIALS.asphalt,
  right: SurfaceMaterial = left,
  normal = { x: 0, y: 1, z: 0 },
): WheelContactSet => Object.fromEntries(WHEEL_IDS.map((id) => [id, {
  ...(id.endsWith('Left') ? left : right), id,
  x: id.endsWith('Left') ? -0.775 : 0.775,
  z: id.startsWith('front') ? -1.35 : 1.35,
  height: 0, normal,
}])) as unknown as WheelContactSet;

/** V0.2A contact regressions focus on observable force/trajectory behaviour. */
export function runContactDynamicsSelfTest(): Record<string, number | boolean> {
  const legacyLaunch = new VehicleDynamics();
  const contactLaunch = new VehicleDynamics();
  legacyLaunch.requestGear(1);
  contactLaunch.requestGear(1);
  const asphalt = contacts();
  for (let step = 0; step < 300; step += 1) {
    legacyLaunch.stepFixed(dt, input({ throttle: 0.55 }));
    contactLaunch.stepFixed(dt, input({ throttle: 0.55 }), { wheelContacts: asphalt });
  }
  const asphaltLaunchDifference = Math.abs(legacyLaunch.speed - contactLaunch.speed);
  assert(asphaltLaunchDifference < 1e-9 && Math.abs(legacyLaunch.z - contactLaunch.z) < 1e-9,
    'four asphalt contacts must preserve the calibrated straight-line launch');

  const turn = new VehicleDynamics(undefined, { speed: 20, gear: 'N' });
  const brakingTurn = new VehicleDynamics(undefined, { speed: 20, gear: 'N' });
  for (let step = 0; step < 90; step += 1) {
    turn.stepFixed(dt, input({ steering: 0.65 }), { wheelContacts: asphalt });
    brakingTurn.stepFixed(dt, input({ steering: 0.65 }), { wheelContacts: asphalt });
  }
  for (let step = 0; step < 60; step += 1) {
    turn.stepFixed(dt, input({ steering: 0.65 }), { wheelContacts: asphalt });
    brakingTurn.stepFixed(dt, input({ steering: 0.65, brake: 0.35 }), { wheelContacts: asphalt });
  }
  const moderateBrakingYawRetention = Math.abs(brakingTurn.yawRate / turn.yawRate);
  assert(moderateBrakingYawRetention > 0.78 && brakingTurn.x > 0 && brakingTurn.speed < turn.speed,
    'moderate braking must slow the car while preserving useful steering authority');

  const splitRight = new VehicleDynamics(undefined, { speed: 15, gear: 'N' });
  const splitLeft = new VehicleDynamics(undefined, { speed: 15, gear: 'N' });
  for (let step = 0; step < 240; step += 1) {
    splitRight.stepFixed(dt, input(), { wheelContacts: contacts(SURFACE_MATERIALS.asphalt, SURFACE_MATERIALS.grass) });
    splitLeft.stepFixed(dt, input(), { wheelContacts: contacts(SURFACE_MATERIALS.grass, SURFACE_MATERIALS.asphalt) });
  }
  const splitCoastingYaw = splitRight.yaw;
  assert(splitCoastingYaw < -0.002 && Math.abs(splitCoastingYaw) < 0.12 && splitRight.x > 0,
    'right-side grass rolling resistance must produce a mild rightward drag, not a snap');
  assert(Math.abs(splitRight.yaw + splitLeft.yaw) < 1e-9 &&
    Math.abs(splitRight.x + splitLeft.x) < 1e-9,
  'mirroring split surfaces must mirror yaw and sideways displacement');

  const splitBrakeRight = new VehicleDynamics(undefined, { speed: 20, gear: 'N' });
  const splitBrakeLeft = new VehicleDynamics(undefined, { speed: 20, gear: 'N' });
  for (let step = 0; step < 90; step += 1) {
    splitBrakeRight.stepFixed(dt, input({ brake: 1 }),
      { wheelContacts: contacts(SURFACE_MATERIALS.asphalt, SURFACE_MATERIALS.grass) });
    splitBrakeLeft.stepFixed(dt, input({ brake: 1 }),
      { wheelContacts: contacts(SURFACE_MATERIALS.grass, SURFACE_MATERIALS.asphalt) });
  }
  const splitBrakingYaw = splitBrakeRight.yaw;
  assert(splitBrakingYaw > 0.002 && Math.abs(splitBrakingYaw) < 0.25 &&
    Math.abs(splitBrakingYaw + splitBrakeLeft.yaw) < 1e-9,
  'split braking must pull mildly toward the stronger braking side with symmetric response');

  const coastAsphalt = new VehicleDynamics(undefined, { speed: 15, gear: 'N' });
  const coastGrass = new VehicleDynamics(undefined, { speed: 15, gear: 'N' });
  const firstGrassStep = coastGrass.stepFixed(dt, input(), { wheelContacts: contacts(SURFACE_MATERIALS.grass) });
  assert(firstGrassStep.speed > 14.99 && firstGrassStep.forces.rollingResistanceForce < -400,
    'grass must add a resistance force rather than instantaneously multiplying velocity');
  for (let step = 0; step < 239; step += 1) {
    coastAsphalt.stepFixed(dt, input(), { wheelContacts: asphalt });
    coastGrass.stepFixed(dt, input(), { wheelContacts: contacts(SURFACE_MATERIALS.grass) });
  }
  const grassCoastingExtraSpeedLoss = coastAsphalt.speed - coastGrass.speed;
  assert(grassCoastingExtraSpeedLoss > 0.35 && grassCoastingExtraSpeedLoss < 0.75,
    'grass coasting loss must emerge gently from the tyre rolling-resistance force');

  const transition = new VehicleDynamics(undefined, { speed: 15, gear: 'N' });
  let maximumTransitionAccelerationStep = 0;
  let previousAcceleration = transition.stepFixed(dt, input(), { wheelContacts: asphalt }).acceleration;
  for (let step = 1; step <= 120; step += 1) {
    const material = blendSurfaceMaterials(SURFACE_MATERIALS.asphalt, SURFACE_MATERIALS.grass, step / 120);
    const sample = transition.stepFixed(dt, input(), { wheelContacts: contacts(material) });
    maximumTransitionAccelerationStep = Math.max(maximumTransitionAccelerationStep,
      Math.abs(sample.acceleration - previousAcceleration));
    previousAcceleration = sample.acceleration;
  }
  assert(maximumTransitionAccelerationStep < 0.01 && Math.abs(transition.yaw) < 1e-9,
    'continuous material blends must produce continuous forces without symmetric-road yaw');

  const slope = 0.12;
  const uphill = new VehicleDynamics(undefined, { speed: 8, gear: 'N' });
  const uphillSnapshot = uphill.stepFixed(dt, input(), {
    gradeRadians: -0.5,
    wheelContacts: contacts(SURFACE_MATERIALS.asphalt, SURFACE_MATERIALS.asphalt,
      { x: 0, y: Math.cos(slope), z: Math.sin(slope) }),
  });
  const normalGradeForce = uphillSnapshot.forces.gradeForce;
  assert(Math.abs(normalGradeForce + uphillSnapshot.effectiveVehicleMass * uphill.config.gravity * Math.sin(slope)) < 1e-8,
    'the sampled ground normal must determine heading-dependent grade rather than a stale grade scalar');

  const corrected = new VehicleDynamics(undefined, { speed: 16, gear: 'N', yaw: 0.35 });
  for (let step = 0; step < 60; step += 1) corrected.stepFixed(dt, input({ steering: 0.5 }));
  const sin = Math.sin(corrected.yaw);
  const cos = Math.cos(corrected.yaw);
  const correction = corrected.applyContactCorrection({ x: 3, z: -8,
    velocityX: -sin * 2 + cos * 0.4, velocityZ: -cos * 2 - sin * 0.4 });
  const collisionCorrectionConsistent = Math.abs(correction.speed - 2) < 1e-9 &&
    Math.abs(correction.lateralVelocity - 0.4) < 1e-9 &&
    Math.abs(correction.bodySlipAngle - Math.atan(0.2)) < 1e-9 &&
    Math.abs(correction.x - 3) < 1e-9 && Math.abs(correction.z + 8) < 1e-9 && correction.yawRate === 0;
  assert(collisionCorrectionConsistent,
    'collision pose and velocity must replace stale longitudinal/lateral/slip state consistently');

  const oblique = new VehicleDynamics(undefined, { yaw: -Math.PI / 3, gear: 'N' });
  const obliqueCorrection = oblique.applyContactCorrection({
    x: 0, z: 0, velocityX: 0, velocityZ: -2,
  });
  assert(Math.abs(obliqueCorrection.bodySlipAngle + Math.PI / 3) < 1e-9,
    'an oblique wall-tangent velocity must retain its actual slip angle after correction');
  const afterObliqueStep = oblique.stepFixed(dt, input());
  const obliqueSin = Math.sin(afterObliqueStep.yaw);
  const obliqueCos = Math.cos(afterObliqueStep.yaw);
  const obliqueVelocityX = -obliqueSin * afterObliqueStep.speed +
    obliqueCos * afterObliqueStep.lateralVelocity;
  const obliqueVelocityZ = -obliqueCos * afterObliqueStep.speed -
    obliqueSin * afterObliqueStep.lateralVelocity;
  assert(obliqueVelocityX <= 1e-9 && obliqueVelocityZ < -1.99,
    'the step after collision correction must not recreate inward wall velocity or drop tangent speed');
  let maximumCollisionRecoveryLateralStep = 0;
  let previousLateral = afterObliqueStep.lateralVelocity;
  for (let step = 0; step < 180; step += 1) {
    const sample = oblique.stepFixed(dt, input());
    maximumCollisionRecoveryLateralStep = Math.max(maximumCollisionRecoveryLateralStep,
      Math.abs(sample.lateralVelocity - previousLateral));
    previousLateral = sample.lateralVelocity;
  }
  // The existing walking-speed recovery boost is intentionally quicker; each
  // step must still recover less than eight percent of this 1.73 m/s slide.
  assert(maximumCollisionRecoveryLateralStep < 0.13 &&
    Math.abs(oblique.bodySlipAngle) < 0.02,
  'after leaving contact, a large collision slip must recover smoothly to ordinary driving');

  let maximumRecreatedInwardVelocity = 0;
  for (const yaw of [-Math.PI / 3, -Math.PI / 12]) {
    const continuousScrape = new VehicleDynamics(undefined, { yaw, gear: 'N' });
    for (let step = 0; step < 60; step += 1) {
      const before = continuousScrape.getSnapshot();
      continuousScrape.applyContactCorrection({
        x: before.x, z: before.z, velocityX: 0, velocityZ: -2,
      });
      const after = continuousScrape.stepFixed(dt, input());
      const velocityX = -Math.sin(after.yaw) * after.speed +
        Math.cos(after.yaw) * after.lateralVelocity;
      const velocityZ = -Math.cos(after.yaw) * after.speed -
        Math.sin(after.yaw) * after.lateralVelocity;
      maximumRecreatedInwardVelocity = Math.max(maximumRecreatedInwardVelocity, velocityX);
      assert(velocityX <= 1e-9 && velocityZ < -1.99,
        'repeated large and ordinary oblique contacts must preserve tangent travel without generating a new inward component');
    }
  }

  const sidewaysCorrection = new VehicleDynamics(undefined, { gear: 'N' });
  sidewaysCorrection.applyContactCorrection({ x: 0, z: 0, velocityX: 1, velocityZ: 0 });
  for (let step = 0; step < 6; step += 1) sidewaysCorrection.stepFixed(dt, input());
  assert(Math.abs(sidewaysCorrection.lateralVelocity - 1) < 1e-9 &&
    Math.abs(sidewaysCorrection.speed) < 1e-9,
  'a near-zero forward-speed correction must preserve a short sideways tangent glide without dividing by zero');

  return { asphaltLaunchDifference, moderateBrakingYawRetention, splitCoastingYaw,
    splitBrakingYaw, grassCoastingExtraSpeedLoss, maximumTransitionAccelerationStep,
    normalGradeForce, collisionCorrectionConsistent, obliqueVelocityX, obliqueVelocityZ,
    maximumCollisionRecoveryLateralStep, maximumRecreatedInwardVelocity };
}
