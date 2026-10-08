import { createVehiclePhysicsConfig, getVehicleDescriptor } from '../VehicleCatalog';
import { VehicleDynamics } from './VehicleDynamics';
import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import { calculateEngineAudioMix } from '../../audio/EngineAudio';
import { ExecutiveDisplayContext } from '../visual/ExecutiveDisplayContext';
import type { RoadNetworkData } from '../../world/navigation/RoadNetwork';

/** Lifecycle, display priority and sound calibration integration; no handling tuning. */
export function runExecutivePolishSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string) => { assertions++; if (!ok) throw new Error(`Executive polish: ${message}`); };
  const config = createVehiclePhysicsConfig('executive-lwb-2t');
  const car = new VehicleDynamics(config, { engineRunning: false });
  const input = createNeutralVehicleInputState(), dt = 1 / 120;
  assert(car.engine.currentRPM === 0 && car.requestEngineStart(), 'cold start begins at zero');
  assert(car.engine.ignitionPhase === 'CRANKING' && !car.engine.isRunning, 'starter precedes combustion');
  assert(!car.requestEngineStart(), 'repeated start cannot restart a running starter');
  let peak = 0, crankPeak = 0, catchAt = 0;
  for (let n = 0; n < 480; n++) {
    const before = car.engine.currentRPM; car.stepFixed(dt, input);
    assert(Math.abs(car.engine.currentRPM - before) < 30, 'RPM never jumps during startup');
    if (car.engine.ignitionPhase === 'CRANKING') crankPeak = car.engine.currentRPM;
    if (!catchAt && car.engine.ignitionPhase === 'CATCH') catchAt = (n + 1) * dt;
    peak = Math.max(peak, car.engine.currentRPM);
  }
  assert(crankPeak > 200 && crankPeak < 300 && catchAt >= .55, 'real starter RPM and duration');
  assert(peak > config.engine.idleRPM + 80 && peak < 1300, 'restrained combustion flare');
  assert(Math.abs(car.engine.currentRPM - config.engine.idleRPM) < 5, 'settles at real idle');
  assert(car.requestEngineStop() && car.engine.currentRPM > 700, 'stop retains crank inertia');
  let stopSeconds = 0;
  for (let n = 0; n < 240; n++) {
    const before = car.engine.currentRPM; car.stepFixed(dt, input);
    assert(car.engine.currentRPM <= before, 'shutdown is monotonic');
    if (!stopSeconds && car.engine.currentRPM === 0) stopSeconds = (n + 1) * dt;
  }
  assert(stopSeconds > .6 && stopSeconds < 1.5, 'shutdown naturally coasts to rest');
  const legacy = new VehicleDynamics(createVehiclePhysicsConfig('test-7dct-sedan'), { engineRunning: false });
  legacy.requestEngineStart(); assert(legacy.engine.currentRPM === legacy.config.engine.idleRPM, 'legacy instant start unchanged');
  legacy.requestEngineStop(); assert(legacy.engine.currentRPM === 0, 'legacy stop unchanged');
  const profile = getVehicleDescriptor('executive-lwb-2t').audioProfile;
  const mix = (load: number, cockpit = true, driveMode = 'NORMAL') => calculateEngineAudioMix(2200, load, { profile, cockpit, driveMode, engineLoad: load });
  assert(mix(.8).exhaust > mix(.12).exhaust * 4, 'heavy acceleration has load-dependent body');
  assert(mix(.12, false).exhaust > mix(.12).exhaust * 2, 'cruise cabin is insulated');
  assert(mix(.8, false).exhaust > mix(.8).exhaust, 'exterior retains engine presence');
  const sport = mix(.8, true, 'SPORT').exhaust / mix(.8).exhaust;
  assert(sport > 1 && sport < 1.2, 'sport remains restrained');
  assert(!getVehicleDescriptor('test-7dct-sedan').audioProfile, 'other cars do not inherit luxury profile');
  const fuel = car.getSnapshot().fuel, display = new ExecutiveDisplayContext(fuel);
  const pose = { x: 1.5, z: -5, yaw: 0, y: 0, width: 1.89, length: 5.05 };
  const network: RoadNetworkData = { mapId: 'curved-fixture', bounds: { minimumX:-20,maximumX:20,minimumZ:-100,maximumZ:20 }, intersections: [],
    segments: [{ id:'bend', centerline:[{x:0,z:10},{x:0,z:-20},{x:7,z:-40}], width:6,laneWidth:3,length:60,laneCountPerDirection:1,travelDirection:'two-way' }] };
  const update = (gear: string, mode = 'NORMAL', cruise = false) => display.update(.2, pose, gear, mode, cruise, cruise ? 80 : null, fuel, network, [], true);
  update('N'); assert(display.data.page === 'DRIVING' && display.data.lanes.every(line => line.length > 5), 'authored curved lane boundaries populate Driving');
  assert(display.data.lanes[0]!.some(p => p.x > 2), 'lane path bends with actual road');
  assert(display.data.laneMarkings?.every(style => style === 'solid') === true, 'two-lane road retains its solid centre and edge');
  const multiLane: RoadNetworkData = { ...network, segments: [{ ...network.segments[0]!, width: 12, laneCountPerDirection: 2 }] };
  display.update(.2,pose,'N','NORMAL',false,null,fuel,multiLane,[],true);
  assert(display.data.laneMarkings?.[0] === 'solid' && display.data.laneMarkings?.[1] === 'dashed',
    'inner lane separates a solid opposing carriageway boundary from a dashed same-direction divider');
  assert(display.data.lanes.every(line => line.every(point => Number.isFinite(point.distanceAlong))),
    'dash phase follows authored road distance on bends');
  display.update(.2,{ ...pose, x: 4.5 },'N','NORMAL',false,null,fuel,multiLane,[],true);
  assert(display.data.laneMarkings?.[0] === 'dashed' && display.data.laneMarkings?.[1] === 'solid',
    'outer lane keeps a dashed inner divider and solid road edge');
  display.update(.2,{ ...pose, x: -1.5, yaw: Math.PI },'N','NORMAL',false,null,fuel,multiLane,[],true);
  const solidBoundary = display.data.lanes[display.data.laneMarkings!.indexOf('solid')]!;
  assert(solidBoundary.some(point => point.x < 0), 'reversed travel retains the real solid boundary on the driver left');
  display.update(.2,pose,'N','NORMAL',false,null,fuel,undefined,[],true);
  assert(display.data.lanes.length === 0 && display.data.laneMarkings?.length === 0, 'missing roads clear geometry and marking types together');
  display.cyclePage(); update('N'); assert(display.data.page === 'MAP' && display.data.roads.length === 1, 'map consumes same road network');
  const longRoad: RoadNetworkData = { ...network, segments: [{ ...network.segments[0]!, centerline: [{x:0,z:1000},{x:0,z:-1000}], length:2000 }] };
  display.update(.2,pose,'N','NORMAL',false,null,fuel,longRoad,[],true);
  assert(display.data.roads.length === 1, 'map includes long roads crossing the local view even when endpoints are far away');
  update('P','SPORT'); assert(display.data.page === 'TRIP' && display.data.trip.fuel === fuel, 'P overrides mode overlay and reads real FuelSystem snapshot');
  update('R'); assert(display.data.page === 'PARKING', 'R overrides Trip and manual page');
  update('N'); assert(display.data.page === 'MAP', 'leaving reverse restores manually selected page');
  for(let n=0;n<10;n++)update('N'); update('N','NORMAL',true);
  assert(display.data.overlay?.value === 'SET 80 km/h', 'cruise set overlay');
  return { assertions, peakRPM: peak, catchAtSeconds: catchAt, shutdownSeconds: stopSeconds, sportPresence: sport };
}
