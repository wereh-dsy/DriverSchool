import * as T from 'three';
import { VEHICLE_CATALOG } from '../src/vehicle/VehicleCatalog';
import { VehicleVisual } from '../src/vehicle/visual/VehicleVisual';
import { VehicleLighting } from '../src/vehicle/visual/VehicleLighting';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(800, 500); renderer.setPixelRatio(1);
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
document.body.appendChild(renderer.domElement);
const scene = new T.Scene(); scene.background = new T.Color(0xcbd2da);
const environment = new RoomEnvironment();
const pmrem = new T.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(environment, .04).texture;
environment.dispose(); pmrem.dispose();
scene.add(new T.HemisphereLight(0xeaf3ff, 0x60636a, 2.5));
for (const [x, y, z, intensity] of [[-4, 7, -5, 3.5], [4, 3, 4, 2]]) {
  const light = new T.DirectionalLight(0xffffff, intensity); light.position.set(x!, y!, z!); scene.add(light);
}
const floor = new T.Mesh(new T.PlaneGeometry(200, 200), new T.MeshStandardMaterial({ color: 0xa1a9b0, roughness: .8 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -.015; scene.add(floor);
const camera = new T.PerspectiveCamera(28, 1.6, .1, 100);
camera.layers.enableAll();
const views = { front: [0, 1.45, -10.7], rear: [0, 1.45, 10.7], side: [-10.7, 1.45, 0],
  'front-3-4': [-7.57, 2.55, -7.57], 'rear-3-4': [-7.57, 2.55, 7.57] };
let current: VehicleVisual | undefined;
let lighting: VehicleLighting | undefined;
Object.assign(window, {
  vehicleIds: VEHICLE_CATALOG.map(v => v.id),
  captureVehicle: (id: string) => {
    if (current) { lighting?.dispose(); scene.remove(current.root); current.dispose(); }
    const descriptor = VEHICLE_CATALOG.find(v => v.id === id)!;
    const started=performance.now();
    current = new VehicleVisual({ ...descriptor.visualConfig, assetCache: false });
    current.root.position.y = descriptor.visualConfig.staticBodyOffsetY ?? 0;
    lighting=new VehicleLighting(current);
    lighting.applyState({mainLightMode:'position',fogLightsEnabled:false,fogMode:'off',frontFogLightsEnabled:false,rearFogLightsEnabled:false,
      leftTurnSignal:false,rightTurnSignal:false,hazard:false,brakeLight:false,reverseLight:false,highBeamFlash:false,
      effectiveHighBeam:false,positionLight:true,lowBeam:false,leftBlinkOn:false,rightBlinkOn:false});
    scene.add(current.root);
    const constructionMs=performance.now()-started;
    const sheet = document.createElement('canvas'); sheet.width = 2400; sheet.height = 1060;
    const ctx = sheet.getContext('2d')!; ctx.fillStyle = '#e5e9ef'; ctx.fillRect(0, 0, sheet.width, sheet.height);
    let i = 0;
    for (const [view, position] of Object.entries(views)) {
      camera.position.set(position[0]!, position[1]!, position[2]!); camera.lookAt(0, .78, 0);
      renderer.render(scene, camera);
      const x = i % 3 * 800, y = Math.floor(i / 3) * 530;
      ctx.drawImage(renderer.domElement, x, y + 30);
      ctx.fillStyle = '#243040'; ctx.font = '20px sans-serif'; ctx.fillText(`${descriptor.displayName} · ${view}`, x + 16, y + 24);
      i++;
    }
    return { png: sheet.toDataURL('image/png'), calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures, constructionMs };
  },
});
