import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import { createExecutiveSedanPhysicsConfig } from '../config';
import { VehicleDynamics } from './VehicleDynamics';
import { createWheelContactBuffer, WHEEL_IDS } from './WheelContact';
import { createStaticOBBCollider, VehicleCollisionSystem } from './CollisionSystem';

/** Gear direction and collision velocity use yaw, regardless of rendered attitude. */
export function runPlanarDirectionSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string) => {
    assertions++; if (!ok) throw Error(`Planar direction: ${message}`);
  };
  const config = createExecutiveSedanPhysicsConfig(), dt = 1 / 120;
  const cases = [];
  for (const selector of ['D', 'R'] as const) for (const [pitch, roll] of [[0, 0], [120, 100], [150, 140]] as const) {
    const yaw = .7, forward = {x: -Math.sin(yaw), z: -Math.cos(yaw)}, direction = selector === 'R' ? -1 : 1;
    const car = new VehicleDynamics(config, {yaw, gear: selector === 'R' ? 'R' : 1,
      driveSelector: selector, engineRunning: true, engineRPM: 1600});
    car.syncWheelContacts(createWheelContactBuffer());
    // Keep this drivetrain test clear of road/roof collisions; free wheel drive
    // torque is still real, while chassis road forces must remain zero in air.
    car.chassisY = 10; car.chassisMotion.pitch = pitch * Math.PI / 180; car.chassisMotion.roll = roll * Math.PI / 180;
    let drive = 0;
    for (let i = 0; i < 12; i++) {
      const state = car.stepFixed(dt, {...createNeutralVehicleInputState(), throttle: .5});
      const force = WHEEL_IDS.reduce((sum, id) => sum + state.wheels[id].driveForce, 0);
      if (Math.abs(force) > 1) { drive = force; break; }
    }
    // Map the produced scalar through the same planar convention as X/Z integration.
    const driveVector = {x: forward.x * drive, z: forward.z * drive};
    const driveDotForward = driveVector.x * forward.x + driveVector.z * forward.z;
    assert(direction * driveDotForward > 1 && car.getSnapshot().transmission.selectedMode === selector,
      `${selector}, pitch=${pitch}, roll=${roll}: produced axle force keeps selector sign`);
    const velocity = {x: forward.x * -3 + Math.cos(yaw) * 2, z: forward.z * -3 - Math.sin(yaw) * 2};
    const corrected = car.applyContactCorrection({x:0,z:0,velocityX:velocity.x,velocityZ:velocity.z,yawRate:0});
    const moved = car.stepFixed(dt, createNeutralVehicleInputState());
    const planarTravel = (moved.x - corrected.x) * forward.x + (moved.z - corrected.z) * forward.z;
    assert(Math.abs(corrected.speed + 3) < 1e-9 && Math.abs(corrected.lateralVelocity - 2) < 1e-9 &&
      corrected.transmission.selectedMode === selector && Math.abs(corrected.yaw - yaw) < 1e-9 && planarTravel < 0,
      'collision velocity import and actual X/Z motion use planar yaw and preserve selector');
    cases.push({selector,pitch,roll,driveDotForward,signedSpeed:corrected.speed,planarTravel});
  }
  const collider = createStaticOBBCollider({id:'direction-wall',x:0,z:0,width:8,length:1,
    minHeight:-10,maxHeight:20,type:'building'});
  const system = new VehicleCollisionSystem([collider]);
  const car = new VehicleDynamics(config,{yaw:0,gear:'R',driveSelector:'R'});
  car.syncWheelContacts(createWheelContactBuffer());
  car.chassisMotion.pitch = 120 * Math.PI / 180; car.chassisMotion.roll = 100 * Math.PI / 180;
  const collision = system.resolve({previousPose:{x:0,z:4,yaw:0,y:1,pitch:car.chassisMotion.pitch,roll:car.chassisMotion.roll},
    pose:{x:0,z:1,yaw:0,y:1,pitch:car.chassisMotion.pitch,roll:car.chassisMotion.roll},
    velocity:{x:1,z:-6},dimensions:config,dt});
  const after = car.applyContactCorrection({x:collision.pose.x,z:collision.pose.z,
    velocityX:collision.velocity.x,velocityZ:collision.velocity.z,yawRate:0});
  assert(collision.collided && Math.abs(after.speed + collision.velocity.z) < 1e-9 &&
    after.transmission.selectedMode === 'R' && after.yaw === 0,
    'extreme-pose obstacle response preserves R and planar velocity convention');
  return {assertions,cases,collision:{collided:collision.collided,velocity:collision.velocity,signedSpeed:after.speed}};
}
