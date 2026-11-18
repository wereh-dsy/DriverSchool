import { buildCityRoadNetwork } from '../city/CityRoadNetwork';
import { newCityMap, type CityRoad, type CityMapData } from '../city/CityMapData';
import { LaneObservationTracker } from './LaneObservation';

export function lateralTestRoad(id: string, x = 0, from = 0, to = -2000): CityRoad {
  return { id, type: 'highway', centerline: [{ x, z: from }, { x, z: to }], laneCount: 3,
    laneWidth: 3.5, speedLimit: 120, travelDirection: 'forward', curve: 'polyline' };
}
export function lateralTestMap(roads: CityRoad[], links: NonNullable<CityMapData['roadLinks']> = []): CityMapData {
  return { ...newCityMap(), id: 'lateral-fixture', roads, roadLinks: links,
    bounds: { minX: -5000, maxX: 5000, minZ: -5000, maxZ: 5000 } };
}
export function lateralCurveRoad(radius = 600): CityRoad {
  const road = lateralTestRoad('curve');
  road.centerline = Array.from({ length: 201 }, (_, i) => {
    const angle = i * .005; return { x: radius * (1 - Math.cos(angle)), z: -radius * Math.sin(angle) };
  }); return road;
}
export function runLaneObservationSelfTest(): string[] {
  const checks: string[] = [], check = (ok: boolean, name: string) => { if (!ok) throw new Error(name); checks.push(name); };
  const road = lateralTestRoad('straight');
  const network = buildCityRoadNetwork(lateralTestMap([road]));
  const tracker = new LaneObservationTracker(); tracker.configure(network);
  const pose = { x: .6, z: -100, yaw: -.03, y: 0 };
  let o = tracker.update(pose, 30, network);
  check(o.valid && Math.abs(o.lateralOffset - .6) < .001 && Math.abs(o.headingError - .03) < .001, 'straight offset / heading signs');
  check(o.lookAheadLateralOffset > o.lateralOffset && o.lookAheadDistance > 30, 'speed look-ahead and departure prediction');
  const id = o.laneId;
  pose.x = 1.8; tracker.update(pose, 30, network);
  check(o.laneId === id, 'sticky ID after shallow boundary crossing');
  pose.x = 2.0; tracker.update(pose, 30, network);
  const changed = o.laneId;
  pose.x = 1.7; tracker.update(pose, 30, network);
  check(changed !== id && o.laneId === changed, 'adjacent lane hysteresis prevents ping-pong');
  const curve = buildCityRoadNetwork(lateralTestMap([lateralCurveRoad()])); tracker.configure(curve);
  o = tracker.update({ x: 600 * (1 - Math.cos(.2)), z: -600 * Math.sin(.2), yaw: -.2, y: 0 }, 30, curve);
  check(o.valid && o.curvature > .0014 && o.curvature < .002 && o.lookAheadHeadingError < -.04 && o.lookAheadLateralOffset < -.5, 'curve tangent / curvature / look-ahead');
  const main = lateralTestRoad('main',0,0,-200), straight = lateralTestRoad('continuation',0,-200,-1200);
  const exit = lateralTestRoad('exit',0,-200,-1200); exit.centerline = [{x:0,z:-200},{x:100,z:-400},{x:500,z:-1200}];
  const split = buildCityRoadNetwork(lateralTestMap([main,straight,exit], [
    {id:'straight-link',from:{roadId:'main',end:'end'},to:{roadId:'continuation',end:'start'}},
    {id:'exit-link',from:{roadId:'main',end:'end'},to:{roadId:'exit',end:'start'}}]));
  tracker.configure(split);
  for (let z=-160;z>=-250;z-=1) {
    o=tracker.update({x:0,z,yaw:0,y:0},30,split);
    check(o.valid && !o.laneId?.startsWith('exit:'), `split follows straight continuation at ${z}`);
  }
  check(o.laneId === 'continuation:lane:1', 'topology-confirmed segment transition');
  const ambiguous = buildCityRoadNetwork(lateralTestMap([lateralTestRoad('a'),lateralTestRoad('b',.1)]));
  tracker.configure(ambiguous);
  check(!tracker.update({x:0,z:-100,yaw:0,y:0},30,ambiguous).valid,'ambiguous overlapping topology unavailable');
  const reverseRoad = lateralTestRoad('reverse'); reverseRoad.travelDirection='reverse';
  const reverse = buildCityRoadNetwork(lateralTestMap([reverseRoad])); tracker.configure(reverse);
  o=tracker.update({x:-.6,z:-100,yaw:Math.PI-.03,y:0},30,reverse);
  check(o.valid&&Math.abs(o.lateralOffset-.6)<.001&&Math.abs(o.headingError-.03)<.001,'reverse-authored travel keeps right-positive convention');
  const unmarked = lateralTestRoad('unmarked');unmarked.markings=false;
  const noMarkings=buildCityRoadNetwork(lateralTestMap([unmarked]));tracker.configure(noMarkings);
  check(!tracker.update({x:0,z:-100,yaw:0,y:0},30,noMarkings).valid,'unmarked logical lane unavailable');
  tracker.configure(network);
  tracker.update({x:0,z:-100,yaw:0,y:0},30,network);
  check(!tracker.update({x:0,z:-100,yaw:0,y:8},30,network).valid,'elevated overlapping road rejected');
  const missing = { ...network, segments: network.segments.map(r => ({ ...r, lanes: undefined })) };
  tracker.configure(missing);
  check(!tracker.update({x:0,z:-100,yaw:0,y:0},30,missing).valid,'missing logical lane never synthesized');
  tracker.configure(network); tracker.update({x:0,z:-100,yaw:0,y:0},30,network); tracker.reset();
  check(!tracker.observation.valid && tracker.observation.laneId === undefined,'reset clears tracking');
  return checks.filter(c=>!c.startsWith('split follows')).concat('91 split samples: stable straight continuation');
}
