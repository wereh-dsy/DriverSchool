import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import { MixedSurfaceGround } from '../../world/surface/MixedSurfaceGround';
import { SURFACE_MATERIALS, type SurfaceType } from '../../world/SurfaceMaterial';
import { surfaceProfile } from '../../world/SurfaceProfile';
import { createDefaultVehiclePhysicsConfig, cloneVehiclePhysicsConfig } from '../config';
import { createTeslaModel3PhysicsConfig } from '../config/teslaModel3PhysicsConfig';
import { createTaycan4SPhysicsConfig } from '../config/taycan4SPhysicsConfig';
import { ElectricPowertrain } from '../powertrain/ElectricPowertrain';
import { createAWDVehicleFixture } from '../fixtures/awdVehicleFixture';
import { TyreGripModel } from './TyreGripModel';
import { WheelRotationSystem } from './WheelRotationSystem';
import { SurfaceInteraction, contactUsefulSlip, softSurfaceResistance } from './SurfaceInteraction';
import { VehicleDynamics } from './VehicleDynamics';
import { DriverAssistSystem } from './DriverAssistSystem';
import { WHEEL_IDS, createWheelContactBuffer, sampleWheelContacts, type WheelContactSet } from './WheelContact';
import { VehicleContactSystem } from './VehicleContactSystem';

const DT = 1 / 120;
const neutral = createNeutralVehicleInputState();
const contact = (type: SurfaceType, depth?: number): WheelContactSet => {
  const result = createWheelContactBuffer();
  for (const id of WHEEL_IDS) Object.assign(result[id], SURFACE_MATERIALS[type], { depth });
  return result;
};

/** Bounded, deterministic acceptance checks; no subjective driving optimisation. */
export function runSurfaceInteractionSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string): void => { assertions++; if (!ok) throw new Error(`Surface interaction: ${message}`); };
  const near = (a: number, b: number, tolerance: number, message: string) => assert(Math.abs(a - b) <= tolerance, `${message}: ${a} / ${b}`);
  const config = createDefaultVehiclePhysicsConfig();
  const grip = new TyreGripModel(config.tires);
  const dryProfile = surfaceProfile(SURFACE_MATERIALS.asphalt);
  // Independent frozen V0 equations, rather than comparing two paths through the new model.
  for (const slip of [-1, -.25, -.11, -.05, 0, .02, .11, .2, .8]) {
    const ratio = Math.abs(slip) / Math.max(.015, config.tires.peakSlipRatio);
    const old = Math.sign(slip) * 3000 * (ratio <= 1 ? Math.sin(ratio * Math.PI / 2) :
      1 - config.tires.gripFalloff * .35 * (1 - Math.exp(-.5 * (ratio - 1) ** 2)));
    near(grip.longitudinalForce(slip, 3000, 1, dryProfile), old, 1e-10, 'dry longitudinal V0 regression');
  }
  for (const angle of [-.5, -.1, -.03, 0, .03, .1, .5]) {
    const peak = Math.max(.01, config.tires.peakSlipAngle), t = Math.abs(angle) / peak;
    const slope = Math.max(0, Math.min(3, 35000 * peak / 3000));
    const curve = t <= 1 ? ((slope - 2) * t + 3 - 2 * slope) * t * t + slope * t :
      1 - config.tires.gripFalloff * .15 * (1 - Math.exp(-.5 * (t - 1) ** 2));
    near(grip.lateralForce(angle, 35000, 3000, dryProfile), -Math.sign(angle) * 3000 * curve, 1e-10, 'dry lateral V0 regression');
  }
  const oldExponent = Math.max(3, Math.min(8, 1 / Math.max(.125, config.tires.combinedGripLateralReduction)));
  for (const [x, y] of [[.3, .2], [.8, .8], [1, 1]]) {
    near(grip.usage(x!, y!, 1, 1, dryProfile), (x! ** oldExponent + y! ** oldExponent) ** (1 / oldExponent), 1e-12, 'dry combined V0 regression');
  }
  const explicit = new VehicleDynamics(config, { speed: 15, gear: 'N' });
  const implicit = new VehicleDynamics(config, { speed: 15, gear: 'N' });
  for (let i = 0; i < 90; i++) {
    const input = { ...neutral, brake: .25, steering: .08 };
    const a = explicit.stepFixed(DT, input, { wheelContacts: contact('asphalt') });
    const b = implicit.stepFixed(DT, input);
    near(a.speed, b.speed, 1e-10, 'explicit dry contact preserves speed baseline');
    near(a.yawRate, b.yawRate, 1e-10, 'explicit dry contact preserves yaw baseline');
  }

  const ground = new MixedSurfaceGround();
  try {
    const points = [
      [-150, 130, 'asphalt'], [-112, 130, 'wet-asphalt'], [-74, 130, 'packed-snow'],
      [-36, 130, 'gravel'], [2, 130, 'sand'], [40, 130, 'mud'], [78, 130, 'fresh-snow'],
      [155, -215, 'ice'], [155, 250, 'grass'], [177, 159, 'packed-snow'],
    ] as const;
    for (const [x, z, type] of points) {
      assert(ground.sampleRoadSurface(x, z).surfaceType === type, `authored ${type} zone`);
      assert(ground.sampleRoadSurface(x, z) === ground.sampleRoadSurface(x, z), 'query returns cached sample');
    }
    for (const x of [2, 40, 78]) {
      const shallow = ground.sampleRoadSurface(x, 130), medium = ground.sampleRoadSurface(x, 40), deep = ground.sampleRoadSurface(x, -50);
      assert(shallow.surfaceType === medium.surfaceType && medium.surfaceType === deep.surfaceType, 'depth retains one surface type');
      assert(shallow.depth! < medium.depth! && medium.depth! < deep.depth!, 'three increasing authored depths');
    }
    assert(ground.queryDiagnostics.maximumCellCandidates < 20, 'spatial index bounds local candidates');
    const buffer = createWheelContactBuffer();
    const split = sampleWheelContacts(ground, { x: -200, z: -165, yaw: 0 }, config, 0, 1, buffer);
    assert(split === buffer, 'contact adapter reuses four persistent samples');
    assert(split.frontLeft.surfaceType === 'asphalt' && split.rearLeft.surfaceType === 'asphalt' &&
      split.frontRight.surfaceType === 'ice' && split.rearRight.surfaceType === 'ice', 'real map split mu independently samples four wheels');
    const edge = sampleWheelContacts(ground, { x: -74, z: 180, yaw: 0 }, config);
    assert(edge.frontLeft.surfaceType === 'packed-snow' && edge.rearLeft.surfaceType === 'asphalt', 'front crosses surface before rear');

    // Actual contact-system path, including final-pose query/cache and ESC both off/on.
    const splitResults = [];
    for (const esc of [false, true]) {
      const car = new VehicleDynamics(config, { x: -200, z: -155, speed: 22, gear: 'N' });
      car.setDriverAssistOptions({ absEnabled: true, tractionControlEnabled: true, ebdEnabled: true, stabilityControlEnabled: esc });
      const system = new VehicleContactSystem(ground, { width: 1.8, length: 4.4, bodyOffsetY: .6, height: 1.4 });
      let maximumYaw = 0, pressureDifference = 0, asymmetricForce = 0, absSeen = false;
      for (let i = 0; i < 144; i++) {
        const s = system.step(DT, { ...neutral, brake: 1 }, car);
        assert(!s.recoveredFromInvalidState && Number.isFinite(s.speed) && Number.isFinite(s.yawRate), 'split mu has no invalid-state recovery');
        maximumYaw = Math.max(maximumYaw, Math.abs(s.yawRate));
        pressureDifference = Math.max(pressureDifference, Math.abs(car.driverAssists.pressures[0]! - car.driverAssists.pressures[1]!));
        asymmetricForce = Math.max(asymmetricForce, Math.abs(s.wheels.frontLeft.longitudinalForce - s.wheels.frontRight.longitudinalForce));
        absSeen ||= s.driverAssists.absActive;
        if (i < 60) assert(system.wheelContacts!.frontLeft.surfaceType === 'asphalt' && system.wheelContacts!.frontRight.surfaceType === 'ice', 'moving split contacts retain correct sides');
      }
      assert(absSeen && pressureDifference > .1, 'ABS modulates split channels independently');
      assert(asymmetricForce > 1000 && maximumYaw > .01 && maximumYaw < 1.5, 'split force produces bounded physical yaw tendency');
      splitResults.push({ esc, maximumYaw, pressureDifference, asymmetricForce });
    }

    const braking: Record<string, { distance: number; seconds: number; abs: boolean }> = {};
    for (const type of ['asphalt', 'wet-asphalt', 'packed-snow', 'ice'] as const) {
      const car = new VehicleDynamics(config, { speed: 20, gear: 'N' });
      car.setDriverAssistOptions({ absEnabled: true, ebdEnabled: true, tractionControlEnabled: true, stabilityControlEnabled: false });
      const contacts = contact(type); let distance = 0, seconds = 0, abs = false;
      for (let i = 0; i < 4800 && car.getSnapshot().speed > 5; i++) {
        const s = car.stepFixed(DT, { ...neutral, brake: 1 }, { wheelContacts: contacts });
        assert(!s.recoveredFromInvalidState, `${type} braking remains finite`);
        distance += s.speed * DT; seconds += DT; abs ||= s.driverAssists.absActive;
      }
      assert(car.getSnapshot().speed <= 5, `${type} braking decelerates to 5 m/s`);
      braking[type] = { distance, seconds, abs };
    }
    assert(braking['wet-asphalt']!.distance > braking.asphalt!.distance * 1.15, `wet braking longer than dry: ${JSON.stringify(braking)}`);
    assert(braking['packed-snow']!.distance > braking['wet-asphalt']!.distance * 1.5, 'snow grip clearly below wet');
    assert(braking.ice!.distance > braking['packed-snow']!.distance * 2, 'ice clearly lower than packed snow');
    assert(braking['packed-snow']!.abs && braking.ice!.abs, 'snow and ice activate ABS');

    const surface = new SurfaceInteraction();
    const soft: Record<string, number[]> = {};
    for (const type of ['fresh-snow', 'sand', 'mud', 'gravel'] as const) {
      soft[type] = [.03, .1, .22].map(depth => {
        surface.reset(); const response = surface.update('frontLeft', DT, { ...SURFACE_MATERIALS[type], depth });
        const base = softSurfaceResistance(response, 3500, 10, .2, 1);
        assert(softSurfaceResistance(response, 3500, 10, .2, .8) < base && softSurfaceResistance(response, 3500, 10, .2, .8) > base * .92,
          `${type} lower pressure gives modest softer-ground relief`);
        assert(softSurfaceResistance(response, 4500, 10, .2, 1) > base, `${type} load affects deformation force`);
        assert(softSurfaceResistance(response, 3500, 20, .8, 1) > base, `${type} speed/slip increases ground work`);
        return base;
      });
      assert(soft[type]![0]! < soft[type]![1]! && soft[type]![1]! < soft[type]![2]!, `${type} depth increases physical drag`);
    }
    assert(soft.sand![1]! > soft.mud![1]! * 1.4, 'sand is primarily more resistant than equally deep mud');
    surface.reset();
    assert(softSurfaceResistance(surface.update('frontLeft', DT, SURFACE_MATERIALS.asphalt), 3500, 10, 1, .7) === 0, 'asphalt has no soft-ground pressure coupling');

    const depthCoast: Record<string, number[]> = {};
    for (const type of ['fresh-snow', 'sand', 'mud'] as const) {
      depthCoast[type] = [.03, .10, .22].map(depth => {
        const car = new VehicleDynamics(config, { speed: 10, gear: 'N' });
        const contacts = contact(type, depth); let s = car.getSnapshot();
        for (let i = 0; i < 120; i++) s = car.stepFixed(DT, neutral, { wheelContacts: contacts });
        assert(!s.recoveredFromInvalidState && s.forces.rollingResistanceForce < 0, `${type} depth creates real resisting force`);
        return s.speed;
      });
      assert(depthCoast[type]![0]! > depthCoast[type]![1]! && depthCoast[type]![1]! > depthCoast[type]![2]!, `${type} deeper zone actually slows chassis more`);
    }
    assert(depthCoast.sand![1]! < depthCoast.mud![1]!, 'sand coasting drag exceeds mud at equal depth');

    const wheelTrial = (type: SurfaceType, torque: number, lateralSpeed = 1.5, frames = 90) => {
      const wheel = new WheelRotationSystem(config.tires, config.wheelRadius); wheel.reset(12);
      let s = wheel.getSnapshot('frontLeft');
      for (let i = 0; i < frames; i++) s = wheel.updateWheel('frontLeft', DT, { longitudinalSpeed: 12, lateralSpeed,
        driveTorque: torque, brakeTorque: 0, handbrakeTorque: 0, normalLoad: 3500, staticNormalLoad: 3500,
        surfaceLongitudinalGrip: SURFACE_MATERIALS[type].longitudinalGrip, surfaceLateralGrip: SURFACE_MATERIALS[type].lateralGrip,
        corneringStiffness: 35000, surfaceCurve: surfaceProfile(SURFACE_MATERIALS[type]) });
      return s;
    };
    for (const type of ['wet-asphalt', 'packed-snow', 'fresh-snow', 'ice', 'gravel', 'grass', 'sand', 'mud'] as const) {
      const coast = wheelTrial(type, 0), powered = wheelTrial(type, 2000);
      assert(Math.abs(powered.lateralForce) < Math.abs(coast.lateralForce) * .95, `${type} power consumes lateral capacity`);
      assert(powered.gripUsage <= 1.00001, `${type} combined budget remains bounded`);
    }
    const snowResponse = wheelTrial('packed-snow', 0, .2, 1);
    const dryResponse = wheelTrial('asphalt', 0, .2, 1);
    assert(Math.abs(snowResponse.lateralForce) < Math.abs(dryResponse.lateralForce) * .4, 'snow lateral response starts slower');
    const mudLow = wheelTrial('mud', 800, 0), mudHigh = wheelTrial('mud', 1800, 0), sandHigh = wheelTrial('sand', 1800, 0);
    assert(mudHigh.slipRatio > mudLow.slipRatio && mudHigh.longitudinalForce < mudLow.longitudinalForce * 1.1, 'mud extra torque spins wheel without proportional acceleration');
    assert(mudHigh.longitudinalForce < sandHigh.longitudinalForce * .7, 'mud traction distinct from sand');

    // Same chassis/tyres, only fixture drive topology differs. No vehicle-ID branches.
    const drivetrain = [];
    const topologyBraking: number[] = [];
    for (const layout of ['FWD', 'RWD', 'AWD'] as const) {
      const c = cloneVehiclePhysicsConfig(createAWDVehicleFixture('full-time'));
      c.drivetrainType = c.drivetrainLayout = layout;
      if (layout !== 'AWD') { delete c.awd; c.frontTorqueSplit = layout === 'FWD' ? 1 : 0; c.rearTorqueSplit = 1 - c.frontTorqueSplit; }
      const car = new VehicleDynamics(c, { speed: 8, gear: 1, driveSelector: 'D', engineRPM: 3000 });
      car.setDriverAssistOptions({ absEnabled: true, ebdEnabled: false, tractionControlEnabled: false, stabilityControlEnabled: false });
      let s = car.getSnapshot();
      for (let i = 0; i < 120; i++) s = car.stepFixed(DT, { ...neutral, throttle: 1 }, { wheelContacts: contact('packed-snow') });
      const front = s.wheels.frontLeft.driveTorque + s.wheels.frontRight.driveTorque;
      const rear = s.wheels.rearLeft.driveTorque + s.wheels.rearRight.driveTorque;
      assert((layout === 'RWD' ? front === 0 : front > 0) && (layout === 'FWD' ? rear === 0 : rear > 0), `${layout} actual driven axle topology`);
      assert(!s.recoveredFromInvalidState, `${layout} low mu drive finite`);
      const brakingCar = new VehicleDynamics(c, { speed: 20, gear: 'N', driveSelector: 'N' });
      brakingCar.setDriverAssistOptions({ absEnabled: true, ebdEnabled: true, tractionControlEnabled: false, stabilityControlEnabled: false });
      let brakingState = brakingCar.getSnapshot();
      for (let i = 0; i < 120; i++) brakingState = brakingCar.stepFixed(DT, { ...neutral, brake: 1 }, { wheelContacts: contact('ice') });
      assert(WHEEL_IDS.every(id => brakingState.wheels[id].driveTorque === 0), `${layout} neutral braking has no drive torque`);
      topologyBraking.push(brakingState.speed);
      drivetrain.push({ layout, speed: s.speed, front, rear, frontSlip: s.wheels.frontLeft.slipRatio, rearSlip: s.wheels.rearLeft.slipRatio });
    }
    assert(Math.max(...topologyBraking) - Math.min(...topologyBraking) < .1, 'AWD adds no magical ice braking authority');
    assert(drivetrain[2]!.speed > Math.max(drivetrain[0]!.speed, drivetrain[1]!.speed), 'AWD improves snow propulsion through four driven contacts');

    // Identical slip observation: loose ground permits useful slip, ice intervenes earlier.
    const wheels = new VehicleDynamics(config, { speed: 15 }).getSnapshot().wheels;
    const slipping = Object.fromEntries(WHEEL_IDS.map(id => [id, { ...wheels[id], longitudinalSpeed: 15, slipRatio: .20 }])) as unknown as typeof wheels;
    const looseAids = new DriverAssistSystem(config), dryAids = new DriverAssistSystem(config);
    const options = { absEnabled: true, ebdEnabled: true, tractionControlEnabled: true };
    looseAids.setOptions(options); dryAids.setOptions(options); looseAids.reset(true); dryAids.reset(true);
    for (let i = 0; i < 90; i++) {
      looseAids.updateTraction(DT, slipping, 1, true, true, true, contact('sand'));
      dryAids.updateTraction(DT, slipping, 1, true, true, true, contact('asphalt'));
    }
    assert(looseAids.engineTorqueFactor === 1 && dryAids.engineTorqueFactor < .95, 'TCS accepts sand useful slip instead of asphalt threshold');
    const brakingWheels = Object.fromEntries(WHEEL_IDS.map(id => [id, { ...slipping[id], slipRatio: -.18 }])) as unknown as typeof wheels;
    looseAids.reset(true); dryAids.reset(true);
    for (let i = 0; i < 40; i++) {
      looseAids.updateBrakes(DT, 15, 1, brakingWheels, [1000, 1000, 1000, 1000], undefined, undefined, contact('packed-snow'));
      dryAids.updateBrakes(DT, 15, 1, brakingWheels, [1000, 1000, 1000, 1000], undefined, undefined, contact('ice'));
    }
    assert(looseAids.pressures[0] === 1 && dryAids.pressures[0]! < .6, 'ABS follows snow/ice useful slip ranges');
    assert(contactUsefulSlip(config.tires.peakSlipRatio, SURFACE_MATERIALS.gravel) > config.tires.peakSlipRatio * 1.5, 'gravel has larger useful slip');

    const evSplit = [];
    for (const evConfig of [createTeslaModel3PhysicsConfig(), createTaycan4SPhysicsConfig()]) {
      const car = new VehicleDynamics<ElectricPowertrain>(evConfig, { x: -200, z: -155, speed: 20, driveSelector: 'D' });
      car.setDriverAssistOptions({ absEnabled: true, ebdEnabled: true, tractionControlEnabled: true, stabilityControlEnabled: false });
      const split = contact('asphalt');
      Object.assign(split.frontRight, SURFACE_MATERIALS.ice); Object.assign(split.rearRight, SURFACE_MATERIALS.ice);
      let released = false, s = car.getSnapshot();
      for (let i = 0; i < 90; i++) {
        s = car.stepFixed(DT, { ...neutral, brake: .6 }, { wheelContacts: split });
        assert(!s.recoveredFromInvalidState, 'EV split mu brake blending finite');
        const output = car.powertrain.axleOutput;
        if (car.driverAssists.pressures[3]! < .98) {
          near(output.rearWheelTorque ?? 0, 0, 1e-8, 'same-step rear ABS cancels regenerative motor torque'); released = true;
        }
        if (car.driverAssists.pressures[1]! < .98 && car.powertrain.frontDriveUnit) {
          near(output.frontWheelTorque ?? 0, 0, 1e-8, 'same-step front ABS cancels regenerative motor torque');
        }
      }
      assert(released && s.wheels.rearRight.appliedBrakeTorque > 0, 'EV regen release retains independent hydraulic braking');
      evSplit.push({ topology: evConfig.drivetrainType, speed: s.speed, rearPressure: car.driverAssists.pressures[3] });
    }

    // Sequential boundaries and reverse soft-ground motion remain dissipative/finite.
    const transition = new VehicleDynamics(config, { speed: 15, gear: 'N' });
    const transitions = ['asphalt', 'packed-snow', 'sand', 'ice', 'mud', 'asphalt'] as const;
    let maxAcceleration = 0, maxYawStep = 0, previousYaw = 0;
    for (const type of transitions) for (let i = 0; i < 12; i++) {
      const s = transition.stepFixed(DT, { ...neutral, brake: .4, steering: .15 }, { wheelContacts: contact(type) });
      assert(!s.recoveredFromInvalidState && Number.isFinite(s.speed), `${type} abrupt transition finite`);
      maxAcceleration = Math.max(maxAcceleration, Math.abs(s.acceleration));
      maxYawStep = Math.max(maxYawStep, Math.abs(s.yawRate - previousYaw)); previousYaw = s.yawRate;
      for (const id of WHEEL_IDS) assert(Math.abs(s.wheels[id].longitudinalForce) <= s.wheels[id].normalLoad * 1.3, 'transition force stays within finite contact capacity');
    }
    assert(maxAcceleration < 15 && maxYawStep <= 5 * DT + 1e-9, 'no boundary torque/yaw impulse');
    for (const speed of [-10, .05]) {
      const car = new VehicleDynamics(config, { speed, gear: 'N' });
      const s = car.stepFixed(DT, neutral, { wheelContacts: contact('sand', .22) });
      assert(Math.abs(s.speed) <= Math.abs(speed) && s.forces.rollingResistanceForce * speed <= 0, 'soft drag dissipates in reverse and near rest');
    }
    return { assertions, braking20to5: braking, splitResults, softResistanceN: soft,
      drivetrain, topologyBraking, depthCoast, evSplit, mud: { lowSlip: mudLow.slipRatio, highSlip: mudHigh.slipRatio, lowForce: mudLow.longitudinalForce, highForce: mudHigh.longitudinalForce },
      query: ground.queryDiagnostics, maxAcceleration, maxYawStep };
  } finally { ground.dispose(); }
}
