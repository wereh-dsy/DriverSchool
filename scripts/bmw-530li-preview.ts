import * as T from 'three';
import { buildCityRoadNetwork } from '../src/world/city/CityRoadNetwork';
import type { CityMapData } from '../src/world/city/CityMapData';
import { DrivingSceneDisplayContext } from '../src/vehicle/visual/DrivingSceneDisplayContext';
import { projectWorldToRoad } from '../src/world/navigation/RoadNetwork';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { getVehicleDescriptor } from '../src/vehicle/VehicleCatalog';
import { VehicleVisual } from '../src/vehicle/visual/VehicleVisual';
import { VehicleLighting } from '../src/vehicle/visual/VehicleLighting';
import { VehicleLightingController } from '../src/vehicle/control/VehicleLightingController';
import { MirrorSystem } from '../src/camera/MirrorSystem';
import { InteriorMirror } from '../src/camera/InteriorMirror';
import { createNeutralVehicleInputState } from '../src/input/VehicleInputState';

const scene = new T.Scene(), renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1; renderer.outputColorSpace = T.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap; document.body.append(renderer.domElement);
const env = new RoomEnvironment(), pmrem = new T.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(env, .04).texture; env.dispose();
const hemi = new T.HemisphereLight(0xd6e4fa, 0x6e6559, 2.5); scene.add(hemi);
const sun = new T.DirectionalLight(0xfff7e9, 3.5); sun.position.set(-4, 7, -3); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -5; sun.shadow.camera.right = 5; sun.shadow.camera.top = 5; sun.shadow.camera.bottom = -5; scene.add(sun);
sun.shadow.bias = -.0004; sun.shadow.normalBias = .015;
const fill = new T.DirectionalLight(0xe5edff, 1.4); fill.position.set(4, 3, 4); scene.add(fill);
const floor = new T.Mesh(new T.PlaneGeometry(100, 100), new T.MeshStandardMaterial({ color: 0x737c83, roughness: .84 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -.012; floor.receiveShadow = true; scene.add(floor);
const grid = new T.GridHelper(50, 50, 0x8e9d9e, 0x8e9d9e); grid.position.y = -.008; scene.add(grid);
// Rear-world markers make actual outside reflection easy to distinguish from an image substitute.
for (const [x, color] of [[-2, 0xa04035], [2, 0x347281]] as const) {
  const marker = new T.Mesh(new T.CylinderGeometry(.15, .19, 1.5, 12), new T.MeshStandardMaterial({ color })); marker.position.set(x, .75, 7); scene.add(marker);
}
const v = getVehicleDescriptor('bmw-530li-g38').visualConfig, creationStart = performance.now();
const visual = new VehicleVisual(v); scene.add(visual.root);
console.info('BMW first creation (ms)', Math.round(performance.now()-creationStart));
const lights = new VehicleLighting(visual), controller = new VehicleLightingController(); controller.setMainLightMode('low');
const eye = new T.PerspectiveCamera(65, innerWidth / innerHeight, .035, 250); eye.position.set(...v.driverEyePosition); eye.layers.enableAll();
const camera = new T.PerspectiveCamera(45, innerWidth / innerHeight, .025, 250); camera.layers.enableAll();
const mirrors = new MirrorSystem(renderer, scene, { driverCamera: eye, vehicleRoot: visual.root, hiddenDuringReflection: [visual.cockpitRoot],
  mirrors: { left: { surface: visual.getMirrorSurface('left'), size: v.leftMirrorTransform.size }, right: { surface: visual.getMirrorSurface('right'), size: v.rightMirrorTransform.size } } });
const center = visual.centerMirrorSurface ? new InteriorMirror(renderer, scene, eye, visual.centerMirrorSurface, v.centerMirrorTransform!.size, visual.mirrorSurfaceRoot) : null;
const cityMap = await (await fetch('/city-main.json')).json() as CityMapData;
const drivingScene = new DrivingSceneDisplayContext({lanes:true,proximity:true});
const network = buildCityRoadNetwork(cityMap as CityMapData), spawn = cityMap.environment.spawnPoints[0]!;
const junction = [...cityMap.intersections].sort((a,b)=>Math.hypot(a.position.x-spawn.position.x,a.position.z-spawn.position.z)-Math.hypot(b.position.x-spawn.position.x,b.position.z-spawn.position.z))[0]!;
// Place the sample at an actual lane centre, following its authored tangent.
const projection = projectWorldToRoad(network,junction.position.x+1.75,junction.position.z+35)!;
const road = network.segments.find(r=>r.id===projection.segmentId)!;
const offset = -road.width/2+(Math.floor(road.width/road.laneWidth/2)+.5)*road.laneWidth;
const mapPose = {x:projection.position.x+Math.cos(projection.headingRadians)*offset,
  z:projection.position.z-Math.sin(projection.headingRadians)*offset,y:0,
  yaw:projection.headingRadians+(road.travelDirection==='reverse'?Math.PI:0),width:v.dimensions.width,length:v.dimensions.length};

type P = readonly [number, number, number];
const views: Record<string, { position: P; target: P; fov?: number }> = {
  'v6-driver-day': { position: v.driverEyePosition, target: [-.30,.98,-1.1], fov:65 },
  'v6-driver-night': { position: v.driverEyePosition, target: [-.30,.98,-1.1], fov:65 },
  'v6-instruments-day': { position: v.driverEyePosition, target: v.instrumentClusterTransform.position, fov:30 },
  'v6-instruments-night': { position: v.driverEyePosition, target: v.instrumentClusterTransform.position, fov:30 },
  'v6-instruments-sport': { position: v.driverEyePosition, target: v.instrumentClusterTransform.position, fov:30 },
  'v6-instruments-p': { position: v.driverEyePosition, target: v.instrumentClusterTransform.position, fov:30 },
  'v6-instruments-r': { position: v.driverEyePosition, target: v.instrumentClusterTransform.position, fov:30 },
  'v6-instruments-n': { position: v.driverEyePosition, target: v.instrumentClusterTransform.position, fov:30 },
};
let selected = new URLSearchParams(location.search).get('view') ?? 'v6-driver-day', night = selected.includes('night'), hazard = false;
const previewCruise = new URLSearchParams(location.search).get('cruise') === '1';
const select = document.querySelector<HTMLSelectElement>('#view')!;
for (const key of Object.keys(views)) { const option = document.createElement('option'); option.textContent = key; option.value = key; select.add(option); }
const gearSelect = document.querySelector<HTMLSelectElement>('#gear')!;
let selector = 'D'; gearSelect.onchange = () => { selector=gearSelect.value; };
function applyView() {
  selector = selected.endsWith('-p')?'P':selected.endsWith('-r')?'R':selected.endsWith('-n')?'N':'D';
  gearSelect.value=selector;
  const status = selected.includes('vehicle-status');
  visual.root.updateMatrixWorld(true);
  const screen = visual.cockpitRoot.getObjectByName('BMW live iDrive vehicle information')!;
  const target = screen.localToWorld(new T.Vector3(((status ? .34 : .14)-.5)*.408,(.92-.5)*.16575,0));
  const origin = new T.Vector3(...v.driverEyePosition), ray = new T.Raycaster(origin,target.sub(origin).normalize());
  ray.layers.enableAll(); visual.cockpitRoot.handleDisplayClick(ray);
  const view = views[selected] ?? views['v6-driver-day']!; camera.position.set(...view.position); camera.fov = view.fov ?? 45; camera.lookAt(new T.Vector3(...view.target)); camera.updateProjectionMatrix();
  select.value = selected; (document.querySelector('#info') as HTMLElement).textContent = 'BMW 530Li G38 LCI · ' + selected + ' · 5.106 m / 3.105 m wheelbase';
  scene.background = new T.Color(night ? 0x050b14 : 0xc6d5e2); hemi.intensity = night ? .025 : 2.5; sun.intensity = night ? .008 : 3.5; fill.intensity = night ? .015 : 1.4;
  scene.environmentIntensity = night ? .018 : .65;
}
select.onchange = () => { selected = select.value; night = selected.includes('night'); applyView(); };
document.querySelector<HTMLButtonElement>('#night')!.onclick = () => { night = !night; applyView(); };
document.querySelector<HTMLButtonElement>('#light')!.onclick = () => { controller.cycleMainLightMode(); };
renderer.domElement.addEventListener('pointerdown',event=>{
  if(event.button!==0) return; const bounds=renderer.domElement.getBoundingClientRect(),ray=new T.Raycaster();
  ray.layers.enableAll(); ray.setFromCamera(new T.Vector2((event.clientX-bounds.left)/bounds.width*2-1,1-(event.clientY-bounds.top)/bounds.height*2),camera);
  visual.cockpitRoot.handleDisplayClick(ray);
});
document.querySelector<HTMLButtonElement>('#signal')!.onclick = () => { hazard = true; };
async function saveCapture(all: boolean) {
  const aspect = camera.aspect, ratio = renderer.getPixelRatio();
  const oldView = selected, oldNight = night; capturing = true;
  let message = '';
  try {
    renderer.setPixelRatio(1); renderer.setSize(1440, 900, false); camera.aspect = 1440 / 900;
    for (const name of all ? Object.keys(views) : [selected]) {
      selected = name; night = name.includes('night'); applyView();
      for (let i = 0; i < 60; i++) updateCabin(1 / 60);
      mirrors.render(); center?.render(); renderer.render(scene, camera);
      const response = await fetch('/__bmw_capture', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, image: renderer.domElement.toDataURL('image/png') }) });
      if (!response.ok) throw new Error(await response.text());
    }
    message = all ? 'Saved 8 front views to artifacts/bmw-530li/front-cabin-v6' : 'Saved ' + selected + '.png';
  } catch (error) { message = String(error); }
  finally {
    renderer.setPixelRatio(ratio); renderer.setSize(innerWidth, innerHeight, false); camera.aspect = aspect;
    selected = oldView; night = oldNight; applyView(); capturing = false;
    (document.querySelector('#info') as HTMLElement).textContent = message;
  }
}
document.querySelector<HTMLButtonElement>('#save')!.onclick = () => { void saveCapture(false); };
document.querySelector<HTMLButtonElement>('#capture')!.onclick = () => { void saveCapture(true); };
applyView(); const clock = new T.Clock();
let capturing = false, firstRender = true;
function updateCabin(dt: number) {
  const state = controller.update(dt, { ...createNeutralVehicleInputState(), hazard }, { ignitionOn: true, actualGear: selector, steeringWheelAngle: 0 }); hazard = false;
  const sport = selected.includes('sport');
  // Explicit preview samples only; the playable game continues to use live telemetry.
  drivingScene.update(dt,mapPose,selector,selector==='D'?87/3.6:0,true,network,()=>[]);
  lights.applyState(state, true, dt); visual.updateInstruments({ ignitionOn: true, engineRunning: true,
    speedKmh: selector==='D'?87:0, rpm: selector==='D'?(sport?3500:2350):750, gear: selector==='D'?(sport?'D4':'D6'):selector, driveMode: sport ? 'SPORT' : 'NORMAL',
    fuelLevel: .7, coolantTemperatureC: 90, outsideTemperatureC: 19, cruiseTargetSpeedKmh: previewCruise ? 100 : undefined,
    drivingScene: drivingScene.data, ambientDaylight: night ? .025 : 1, indicators: { cruise: previewCruise && selector==='D', headlights: state.lowBeam, highBeam: state.effectiveHighBeam, positionLights: state.positionLight,
      leftTurn: state.leftBlinkOn, rightTurn: state.rightBlinkOn, parkingBrake: selector==='P' } }, dt);
}
function frame() {
  const dt = Math.min(clock.getDelta(), .1);
  if (!capturing) {
    const start = firstRender ? performance.now() : 0;
    updateCabin(dt); mirrors.render(); center?.render(); renderer.render(scene, camera);
    if (firstRender) { console.info('BMW first frame including mirrors (ms)', Math.round(performance.now()-start)); firstRender = false; }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
