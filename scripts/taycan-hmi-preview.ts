import * as T from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { VehicleVisual } from '../src/vehicle/visual/VehicleVisual';
import { VehicleAssetRegistry } from '../src/vehicle/visual/VehicleAssetRegistry';
import { getVehicleDescriptor, createVehiclePhysicsConfig } from '../src/vehicle/VehicleCatalog';
import { ElectricPowertrain } from '../src/vehicle/powertrain/ElectricPowertrain';
import { VehicleDynamics } from '../src/vehicle/physics/VehicleDynamics';
import { createNeutralVehicleInputState } from '../src/input/VehicleInputState';
import { SharedVehicleData } from '../src/vehicle/SharedVehicleData';
import { buildCityRoadNetwork } from '../src/world/city/CityRoadNetwork';
import type { CityMapData } from '../src/world/city/CityMapData';
import { projectWorldToRoad } from '../src/world/navigation/RoadNetwork';
import { LateralAssistController } from '../src/vehicle/control/LateralAssistController';
import { LaneAssistMode } from '../src/vehicle/control/LaneAssistState';
import { createStaticOBBCollider } from '../src/vehicle/physics/CollisionSystem';
import type { InstrumentTelemetry } from '../src/vehicle/visual/InstrumentCluster';

const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(1.5, devicePixelRatio));
renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping;
document.body.append(renderer.domElement);
const scene = new T.Scene(), pmrem = new T.PMREMGenerator(renderer), room = new RoomEnvironment();
scene.environment = pmrem.fromScene(room, .05).texture; room.dispose();
const hemi = new T.HemisphereLight(0xe3ecf4, 0x71635c, 2.5); scene.add(hemi);
const sun = new T.DirectionalLight(0xfff0dd, 3.2); sun.position.set(-5, 6, -4); scene.add(sun);
const floor = new T.Mesh(new T.PlaneGeometry(200, 200), new T.MeshStandardMaterial({ color: 0x697078, roughness: .9 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -.01; scene.add(floor);
for (const x of [-2.5, 2.5]) {
  const kerb = new T.Mesh(new T.BoxGeometry(.12, .12, 180), new T.MeshStandardMaterial({ color: 0xbab4aa })); kerb.position.set(x, .06, -45); scene.add(kerb);
}
const descriptor = getVehicleDescriptor('porsche-taycan-4s'), assets = new VehicleAssetRegistry();
const coldStart = performance.now(), visual = new VehicleVisual(descriptor.visualConfig, assets); scene.add(visual.root);
const coldMs = performance.now() - coldStart;
const camera = new T.PerspectiveCamera(65, innerWidth / innerHeight, .025, 250); camera.layers.enableAll();
const config = createVehiclePhysicsConfig('porsche-taycan-4s');
const physics = new VehicleDynamics<ElectricPowertrain>(config, { driveSelector: 'D', speed: 87 / 3.6 }, new ElectricPowertrain(config));
for (let i = 0; i < 240; i++) physics.stepFixed(1 / 120, { ...createNeutralVehicleInputState(), throttle: .18 });
const snapshot = physics.getSnapshot();
const map = await (await fetch('/city-main.json')).json() as CityMapData, network = buildCityRoadNetwork(map);
const road = network.segments.find(r => r.length > 250 && r.lanes?.some(l => l.direction === 'forward')) ?? network.segments[0]!;
const mid = Math.max(1, Math.floor(road.centerline.length / 2)), a = road.centerline[mid - 1]!, b = road.centerline[mid]!;
const projected = projectWorldToRoad({ ...network, segments: [road] }, (a.x + b.x) / 2, (a.z + b.z) / 2)!;
const index = road.lanes?.find(l => l.direction === 'forward')?.index ?? 1;
const offset = -road.width / 2 + (index + .5) * road.laneWidth;
const pose = { x: projected.position.x + Math.cos(projected.headingRadians) * offset,
  z: projected.position.z - Math.sin(projected.headingRadians) * offset, yaw: projected.headingRadians, y: projected.position.y ?? 0,
  width: descriptor.visualConfig.dimensions.width, length: descriptor.visualConfig.dimensions.length };
const shared = new SharedVehicleData({ lanes: true, navigation: true, proximity: true, tpms: true, parkingMode: 'selector' });
const lateral = new LateralAssistController(); lateral.configure(config.lateralAssist, config.steering, config.wheelBase); lateral.toggleLCC(); shared.lateralAssist = lateral.display;
const colliders = [createStaticOBBCollider({ id: 'preview-rear', x: pose.x, z: pose.z + pose.length / 2 + .55, width: 2.2, length: .25, yaw: pose.yaw }),
  createStaticOBBCollider({ id: 'preview-side', x: pose.x - pose.width / 2 - .65, z: pose.z, width: .3, length: 3 })];
const displays = visual.cockpitRoot.taycanDisplays!, instrument = visual.cockpitRoot.instrumentCluster.premiumEVFace!;
type P = readonly [number, number, number];
const views: Record<string, { position: P; target: P; fov: number }> = {
  'hmi-driver-day': { position: descriptor.visualConfig.driverEyePosition, target: [-.28, .92, -1.05], fov: 65 },
  'hmi-driver-night': { position: descriptor.visualConfig.driverEyePosition, target: [-.28, .92, -1.05], fov: 65 },
  'hmi-instrument-primary': { position: [-.40, 1.08, .12], target: [-.40, .985, -.51], fov: 58 },
  'hmi-instrument-assistance': { position: [-.40, 1.08, .12], target: [-.40, .985, -.51], fov: 58 },
  'hmi-instrument-navigation': { position: [-.40, 1.08, .12], target: [-.40, .985, -.51], fov: 58 },
  'hmi-center-navigation': { position: [-.04, 1.045, .29], target: [.13, .803, -.45], fov: 34 },
  'hmi-center-energy': { position: [-.04, 1.045, .29], target: [.13, .803, -.45], fov: 34 },
  'hmi-center-parking': { position: [-.04, 1.045, .29], target: [.13, .803, -.45], fov: 34 },
  'hmi-lower-climate': { position: [-.06, 1.01, .35], target: [.10, .605, -.10], fov: 39 },
  'hmi-dashboard': { position: [.0, 1.16, .63], target: [0, .81, -.48], fov: 73 },
};
const select = document.querySelector<HTMLSelectElement>('#view')!;
for (const name of Object.keys(views)) { const option = document.createElement('option'); option.textContent = option.value = name; select.add(option); }
let selected = 'hmi-driver-day', night = false, capturing = false;
function applyView() {
  night = selected === 'hmi-driver-night'; const v = views[selected]!;
  camera.position.set(...v.position); camera.lookAt(new T.Vector3(...v.target)); camera.fov = v.fov; camera.updateProjectionMatrix();
  hemi.intensity = night ? .022 : 2.5; sun.intensity = night ? .012 : 3.2; scene.environmentIntensity = night ? .028 : .65;
  scene.background = new T.Color(night ? 0x070b10 : 0xbccad6);
  instrument.selectPage(selected === 'hmi-instrument-assistance' ? 'assistance' : selected === 'hmi-instrument-navigation' ? 'navigation' : 'driving');
  if (selected === 'hmi-center-energy') displays.center.selectVehiclePage('energy');
  else if (selected !== 'hmi-center-parking') displays.center.selectPage('navigation');
  select.value = selected;
}
function update(dt: number) {
  const parking = selected === 'hmi-center-parking'; const selector = parking ? 'R' : 'D';
  shared.updateLaneObservation(dt, pose, 87 / 3.6, network, false);
  lateral.update(dt, shared.laneObservation, { speed: 87 / 3.6, lateralVelocity: 0, yawRate: 0, driverSteering: 0,
    operational: true, forwardGear: !parking, leftSignal: false, rightSignal: false, suspended: false });
  shared.update(dt, pose, selector, parking ? 0 : 87 / 3.6, true, network, () => parking ? colliders : []);
  const telemetry: InstrumentTelemetry = { ignitionOn: true, speedKmh: parking ? 0 : 87, rpm: 0, gear: selector === 'D' ? 'D2' : selector,
    ev: snapshot.powertrain.ev, trip: snapshot.trip, sharedVehicle: shared, assistCapabilities: descriptor.capabilities,
    laneAssist: { mode: LaneAssistMode.CENTERING_ASSIST, version: 1, notificationVisible: false }, driveMode: 'NORMAL',
    chassisStatus: { rideHeight: config.suspension.rideHeight, targetHeight: config.suspension.rideHeight, nominalHeight: config.suspension.rideHeight,
      dampingMode: 'NORMAL', electricSoundPresence: config.audioPresence! }, ambientDaylight: night ? .025 : 1,
    cruiseTargetSpeedKmh: 90, indicators: { headlights: night, positionLights: night, cruise: !parking, parkingBrake: false } };
  visual.updateInstruments(telemetry, dt);
}
select.onchange = () => { selected = select.value; applyView(); };
renderer.domElement.addEventListener('pointerdown', event => {
  const bounds = renderer.domElement.getBoundingClientRect(), ray = new T.Raycaster(); ray.layers.enableAll();
  ray.setFromCamera(new T.Vector2(2 * (event.clientX - bounds.left) / bounds.width - 1, 1 - 2 * (event.clientY - bounds.top) / bounds.height), camera);
  visual.root.updateMatrixWorld(true); visual.cockpitRoot.handleDisplayClick(ray);
});
document.querySelector<HTMLButtonElement>('#capture')!.onclick = async () => {
  capturing = true; const old = selected;
  try {
    renderer.setPixelRatio(1); renderer.setSize(1600, 1000, false); camera.aspect = 1.6;
    for (const name of Object.keys(views)) {
      selected = name; applyView(); for (let i = 0; i < 180; i++) update(1 / 60);
      visual.root.updateMatrixWorld(true); renderer.render(scene, camera);
      const result = await fetch('/__taycan_capture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, image: renderer.domElement.toDataURL('image/png') }) });
      if (!result.ok) throw new Error(await result.text());
    }
    document.querySelector('#info')!.textContent = `Saved 10 cockpit views · first construction ${coldMs.toFixed(1)} ms · LCC ${lateral.display.lccState}`;
  } catch (error) { document.querySelector('#info')!.textContent = String(error); }
  finally { selected = old; camera.aspect = innerWidth / innerHeight; renderer.setSize(innerWidth, innerHeight, false); applyView(); capturing = false; }
};
applyView(); const clock = new T.Clock();
function frame() { const dt = Math.min(.1, clock.getDelta()); if (!capturing) { update(dt); renderer.render(scene, camera); } requestAnimationFrame(frame); }
requestAnimationFrame(frame);
document.querySelector('#info')!.textContent = `Taycan HMI V1 · first construction ${coldMs.toFixed(1)} ms`;
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
