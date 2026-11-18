import { RearParkingProximity, proximitySeverity, REAR_ZONES } from './RearParkingProximity';
import { createStaticOBBCollider } from '../physics/CollisionSystem';
import { ExecutiveDisplayContext } from '../visual/ExecutiveDisplayContext';
import { VehicleDynamics } from '../physics/VehicleDynamics';
import { createDefaultVehiclePhysicsConfig } from '../config';

export function runRearParkingProximitySelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string): void => { assertions++; if (!ok) throw new Error(`Rear parking: ${message}`); };
  const detector = new RearParkingProximity();
  const pose = { x: 10, z: -20, yaw: 0, y: 0, width: 2, length: 5 };
  const obstacle = (x: number, z: number, width = .2, length = .2, yaw = pose.yaw) => {
    const c = Math.cos(pose.yaw), s = Math.sin(pose.yaw);
    return createStaticOBBCollider({ id: `${x}:${z}`, x: pose.x + x * c + z * s, z: pose.z - x * s + z * c,
      width, length, yaw, minHeight: 0, maxHeight: 1 });
  };
  const center = () => detector.state.zones[2]!;
  for (const yaw of [0, Math.PI / 2, Math.PI]) {
    pose.yaw = yaw;
    detector.update(pose, true, [obstacle(0, 3.6)]);
    assert(center().detected && Math.abs(center().distanceM! - 1) < 1e-8 && detector.state.nearestZone === 'CENTER', `bumper distance 1m, yaw ${yaw}`);
    detector.update(pose, true, [obstacle(0, -3.6)]);
    assert(detector.state.nearestDistanceM === null, `front excluded at yaw ${yaw}`);
    detector.update(pose, true, [obstacle(-2, 0)]);
    assert(detector.state.nearestDistanceM === null, `driver door excluded at yaw ${yaw}`);
    detector.update(pose, true, [obstacle(-.7, 3.6), obstacle(.7, 3.6), obstacle(-1.6, 3.1), obstacle(1.6, 3.1)]);
    assert(detector.state.zones[1]!.detected && detector.state.zones[3]!.detected, 'left and right independent');
    assert(detector.state.zones[0]!.detected && detector.state.zones[4]!.detected, 'diagonal rear corners detected');
    assert(!center().detected, 'nearby side sensors do not invent center detection');
  }
  pose.yaw = 0;
  detector.update(pose, true, [obstacle(-.7, 4.6), obstacle(0, 3.1), obstacle(.7, 3.6)]);
  assert(detector.state.nearestZone === 'CENTER' && Math.abs(detector.state.nearestDistanceM! - .5) < 1e-8, 'multiple obstacle nearest uses bumper surface distance');
  assert(detector.state.zones[1]!.distanceM! > 1.9 && Math.abs(detector.state.zones[3]!.distanceM! - 1) < .02, 'each zone keeps its own distance');
  detector.update(pose, true, [obstacle(0, 5.7), obstacle(-3, 3.3)]);
  assert(detector.state.nearestZone === null, '3m rear and 1.8m radial corner ranges enforced');
  detector.update(pose, true, [obstacle(0, 3.6, 8, .2, .3)]);
  assert(center().detected, 'rotated long wall surface detected even when center lies outside a zone');
  detector.update(pose, true, [obstacle(0, 2.5, .4, .4)]);
  assert(center().distanceM === 0 && center().severity === 'CRITICAL', 'sensor inside obstacle reports zero');
  detector.update(pose, false, [obstacle(0, 3.6)]);
  assert(!detector.state.active && detector.state.nearestZone === null && detector.state.zones.every(z => !z.detected && z.distanceM === null && z.severity === 'NONE'), 'leave R clears all state immediately');
  assert(REAR_ZONES.length === 5 && [3, 2, 1, .5, .3].map(proximitySeverity).join(',') === 'NONE,FAR,CAUTION,NEAR,CRITICAL', 'five zones and severity bands');
  const fuel = new VehicleDynamics(createDefaultVehiclePhysicsConfig()).getSnapshot().fuel;
  const display = new ExecutiveDisplayContext(fuel);
  display.update(.2, pose, 'R', 'NORMAL', false, null, fuel, undefined, [obstacle(0, 3.6)], true);
  assert(display.data.page === 'PARKING' && display.data.rearParking?.nearestZone === 'CENTER' && display.data.obstacles.length === 0, 'reverse display uses rear zones without forward obstacle collection');
  display.update(.001, pose, 'D', 'NORMAL', false, null, fuel, undefined, [], true);
  assert(display.data.rearParking?.active === false && display.data.rearParking.nearestDistanceM === null, 'display clears state even below refresh interval');
  return { passed: true, assertions };
}
