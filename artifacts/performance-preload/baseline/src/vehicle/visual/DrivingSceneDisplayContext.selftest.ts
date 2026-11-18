import { DrivingSceneDisplayContext } from './DrivingSceneDisplayContext';
import { createStaticOBBCollider } from '../physics/CollisionSystem';
import type { RoadNetworkData } from '../../world/navigation/RoadNetwork';

export function runDrivingSceneDisplaySelfTest(): { assertions: number; queries: number } {
  let assertions = 0, queries = 0;
  const assert = (value: boolean, message: string) => { assertions++; if (!value) throw new Error('Driving scene: ' + message); };
  const display = new DrivingSceneDisplayContext({ lanes: true, proximity: true });
  const pose = { x: 1.75, z: 0, yaw: 0, y: 0, width: 1.868, length: 5.106 };
  const network: RoadNetworkData = { mapId: 'local-display-test', bounds: { minimumX: -50, maximumX: 50, minimumZ: -100, maximumZ: 100 },
    intersections: [], segments: [{ id: 'test-road', centerline: [{ x: 0, z: 90 }, { x: 0, z: -90 }], width: 7, laneWidth: 3.5,
      laneCountPerDirection: 1, length: 180, travelDirection: 'two-way' }] };
  const obstacle = createStaticOBBCollider({ id: 'front-object', x: pose.x, z: -3.5, width: .5, length: .5, minHeight: 0, maxHeight: 1 });
  const query = (_pose: typeof pose, radius: number) => { queries++; assert(radius === 7 || radius === 38, 'bounded spatial query'); return [obstacle]; };
  try {
    display.update(0, pose, 'D', 6, true, network, query);
    assert(display.data.lanes.length === 2 && display.data.obstacles.length === 1, 'authored lane boundaries and real collider');
    assert(display.data.map.available && display.data.map.rasterizations === 0, 'reuses cached map index without rasterizing an unused UI');
    assert(display.data.mapPose.x === pose.x && display.data.mapPose.z === pose.z && display.data.mapPose.yaw === pose.yaw, 'map position and heading share the live pose');
    const initialQueries = queries;
    for (let i = 0; i < 10; i++) display.update(1 / 120, pose, 'D', 6, true, network, query);
    assert(queries === initialQueries, 'does not query at 120 Hz');
    display.update(0, pose, 'R', 0, true, network, query);
    assert(!display.data.lanes.length && display.data.proximity.active && display.data.proximity.nearestZone === 'FRONT', 'selector refresh and 360 distance');
    assert(Math.abs(display.data.proximity.nearestDistanceM! - .697) < .001, 'distance uses body envelope and obstacle surface');
    display.update(0, pose, 'R', 0, false, network, query);
    assert(!display.data.proximity.active && display.data.proximity.zones.every(z => z.distanceM === null), 'power off clears stale parking data');
    display.update(0, pose, 'D', 6, true, undefined, () => []);
    assert(!display.data.lanes.length && !display.data.obstacles.length && !display.data.map.available, 'missing road data stays empty');
    const disabled = new DrivingSceneDisplayContext({ lanes: false, proximity: false });
    disabled.update(0, pose, 'D', 0, true, network, () => { throw new Error('disabled features must not query'); });
    assert(!disabled.data.lanes.length && !disabled.data.proximity.active, 'presentation feature support is configurable'); disabled.dispose();
    return { assertions, queries };
  } finally { display.dispose(); }
}
