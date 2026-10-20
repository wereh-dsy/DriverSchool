import fs from 'node:fs';
import { Vector3 } from 'three';
import { createDefaultVehiclePhysicsConfig } from '../../src/vehicle/config';
import { createNeutralVehicleInputState } from '../../src/input/VehicleInputState';
import { VehicleDynamics } from '../../src/vehicle/physics/VehicleDynamics';
import { VehicleContactSystem } from '../../src/vehicle/physics/VehicleContactSystem';
import { WHEEL_IDS } from '../../src/vehicle/physics/WheelContact';
import { DrivingTestTrack } from '../../src/world/DrivingTestTrack';
import { MountainProvingGround } from '../../src/world/mountain/MountainProvingGround';
import { CityGround } from '../../src/world/city/CityGround';
import showcase from '../../src/world/city/maps/preset-showcase.json';
import { sampleGroundGeometry, surfaceResponseAliases, SURFACE_MATERIALS } from '../../src/world/SurfaceMaterial';
import type { DrivingGround } from '../../src/world/DrivingGround';

const DT = 1 / 120, neutral = createNeutralVehicleInputState();
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const output = 'artifacts/vehicle-post-phase2-stabilization';
fs.mkdirSync(output, { recursive: true });

function observe(name: string, ground: DrivingGround, start: {x: number; z: number; yaw: number}, speedKmh: number,
  seconds: number, steering?: (car: VehicleDynamics) => number) {
  const config = createDefaultVehiclePhysicsConfig();
  const car = new VehicleDynamics(config, { ...start, speed: speedKmh / 3.6, gear: 'N', engineRunning: false });
  const adapter = new VehicleContactSystem(ground, config); adapter.synchronize(car);
  let maxSpring = 0, maxDamper = 0, maxBump = 0, maxStopImpulse = 0, maxFz = 0;
  const integrate = car.chassisMotion.integrate.bind(car.chassisMotion);
  car.chassisMotion.integrate = (...args) => {
    for (const id of WHEEL_IDS) { const w = args[4].wheels[id];
      maxSpring = Math.max(maxSpring, Math.abs(w.springForce)); maxDamper = Math.max(maxDamper, Math.abs(w.damperForce));
      maxBump = Math.max(maxBump, Math.abs(w.bumpStopForce)); }
    const previous = car.chassisMotion.contactImpulses.slice(); integrate(...args);
    for (let i = 0; i < 4; i++) maxStopImpulse = Math.max(maxStopImpulse, car.chassisMotion.contactImpulses[i]! - previous[i]!);
  };
  const rows: unknown[] = [], flights: {vY: number; rise: number; airtime: number; landed: boolean}[] = [];
  let flight: {vY: number; rise: number; airtime: number; landed: boolean} | undefined, launchY = 0;
  let maxTorque = 0, maxRate = 0, maxHeightJump = 0, maxSurfaceJump = 0, previous = car.getSnapshot();
  let previousHeights = WHEEL_IDS.map(id => adapter.wheelContacts![id].height);
  for (let step = 0; step < seconds / DT; step++) {
    const state = adapter.step(DT, { ...neutral, steering: steering?.(car) ?? 0 }, car);
    if (!flight && state.chassis.groundedWheels === 0) {
      launchY = state.chassis.chassisY; flight = {vY: state.chassis.verticalVelocity, rise: 0, airtime: 0, landed: false}; flights.push(flight);
    }
    if (flight) { flight.rise = Math.max(flight.rise, state.chassis.chassisY - launchY); flight.airtime += DT;
      if (state.chassis.groundedWheels > 0) { flight.landed = true; flight = undefined; } }
    maxTorque = Math.max(maxTorque, Math.abs(state.chassis.pitchTorque!), Math.abs(state.chassis.rollTorque!));
    maxRate = Math.max(maxRate, Math.abs(state.chassis.pitchAngularVelocity!), Math.abs(state.chassis.rollAngularVelocity!));
    maxHeightJump = Math.max(maxHeightJump, Math.abs(state.chassis.chassisY - previous.chassis.chassisY));
    for (let i = 0; i < 4; i++) { const id = WHEEL_IDS[i]!, height = adapter.wheelContacts![id].height;
      maxSurfaceJump = Math.max(maxSurfaceJump, Math.abs(height - previousHeights[i]!)); previousHeights[i] = height;
      maxFz = Math.max(maxFz, state.wheels[id].normalLoad); }
    rows.push({ step, x: state.x, z: state.z, speed: state.speed, yaw: state.yaw, chassis: state.chassis,
      wheels: Object.fromEntries(WHEEL_IDS.map(id => { const w = state.wheels[id], g = w.geometry!;
        return [id, {height: g.surfaceHeight, normal: g.surfaceNormal, length: g.suspensionLength, grounded: w.grounded,
          Fz: w.normalLoad, stop: w.contactForce, spring: w.springForce, damper: w.damperForce, bump: w.bumpStopForce}]; })) });
    previous = state;
  }
  fs.writeFileSync(`${output}/${name}.json`, JSON.stringify(rows));
  return { name, initialSpeedKmh: speedKmh, finalSpeedKmh: previous.speed * 3.6, flights, maxSpring, maxDamper, maxBump,
    maxStopImpulse, maxFz, maxTorque, maxRate, maxHeightJump, maxSurfaceJump, safety: previous.chassis.safetyInterventions };
}

const roadHeight = DrivingTestTrack.prototype.getRoadHeightAt;
// Production authored height function, without constructing unrelated scenery.
const course = { colliders: [], worldBounds: {minX:-380,maxX:520,minZ:-820,maxZ:250},
  spawnPose: { position: new Vector3(0,.04,-150), yawRadians:0 },
  sampleRoadSurface: (x: number, z: number) => ({...sampleGroundGeometry((x,z)=>roadHeight(x,z),x,z,undefined,.2),
    ...surfaceResponseAliases(SURFACE_MATERIALS.asphalt)}) } as unknown as DrivingGround;
const previousMeasurements = fs.existsSync(`${output}/measurements.json`) ? JSON.parse(fs.readFileSync(`${output}/measurements.json`,'utf8')) : {};
const onlyInterchange = process.argv.includes('--interchange');
const a1 = onlyInterchange ? previousMeasurements.a1 : observe('road-course-crest', course, {x:0,z:-150,yaw:0}, 140, 5);
console.log(JSON.stringify(a1));
let a2 = previousMeasurements.a2;
if (!onlyInterchange) {
const mountain = new MountainProvingGround({props:false,shadows:false});
const path = mountain.route.main, startS = path.section('ridge').start + 360, p = path.point(startS);
a2 = observe('mountain-ridge', mountain, {x:p.x,z:p.z,yaw:Math.atan2(-p.tx,-p.tz)}, 100, 4, car => {
  const hit = path.nearest(car.x,car.z)!; const target = path.point(hit.s + 12);
  const desired = Math.atan2(-(target.x-car.x),-(target.z-car.z));
  return Math.max(-1,Math.min(1,-wrap(desired-car.yaw)*1.2));
});
console.log(JSON.stringify(a2)); mountain.dispose();
}
// One authored multi-level interchange, upper and lower passage at the same crossing.
const city = new CityGround(showcase, {editor:true});
const upper = Object.create(city) as CityGround, lower = Object.create(city) as CityGround;
Object.defineProperty(upper,'spawnPose',{value:{position:new Vector3(3408.125,8.04,25),yawRadians:0}});
Object.defineProperty(lower,'spawnPose',{value:{position:new Vector3(3375,.04,0),yawRadians:-Math.PI/2}});
const b1 = observe('interchange-upper', upper, {x:3408.125,z:25,yaw:0},80,2);
const b2 = observe('interchange-lower', lower, {x:3375,z:0,yaw:-Math.PI/2},80,2);
console.log(JSON.stringify({b1,b2})); city.dispose();
fs.writeFileSync(`${output}/measurements.json`,JSON.stringify({a1,a2,b1,b2},null,2));
