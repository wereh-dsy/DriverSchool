import * as T from 'three';
import { InstrumentCluster, type InstrumentTelemetry } from './InstrumentCluster';
import { Tank500Display } from './Tank500Displays';
import { Tank500CabinLighting } from './Tank500CabinLighting';
import { tankCabinTexture, tankControlsTexture } from './Tank500Textures';
import { TANK_BODY as b, tankWindshieldPoint, tankSidePoint } from './Tank500BodyGeometry';
import { surfaceGrid, surfaceLoft, surfaceQuad, surfaceRounded } from './SurfaceVehicleGeometry';
import type { VehicleVisualConfig, Vector3Tuple as P } from './VehicleVisualConfig';

export function buildTank500Cabin(root: T.Group, c: VehicleVisualConfig, rig: {
  steeringWheelBase: T.Group; steeringWheelRotationGroup: T.Group; gearLever: T.Group;
}) {
  const grain = tankCabinTexture(), controls = tankControlsTexture();
  const leather = new T.MeshStandardMaterial({ color: c.body.interiorColor, map: grain, roughness: .78, side: T.DoubleSide });
  const quilted = leather.clone(); quilted.map = tankCabinTexture(true);
  const upper = new T.MeshStandardMaterial({ color: 0x23292c, roughness: .82, side: T.DoubleSide });
  const dark = new T.MeshStandardMaterial({ color: 0x10191e, roughness: .47, side: T.DoubleSide });
  const satin = new T.MeshStandardMaterial({ color: 0x9b9c93, metalness: .72, roughness: .32, side: T.DoubleSide });
  const faceControls = controls.clone(); faceControls.repeat.set(1, .60); faceControls.offset.set(0, .40);
  const consoleControls = controls.clone(); consoleControls.repeat.set(1, .39);
  const legends = new T.MeshStandardMaterial({ map: faceControls, emissiveMap: faceControls, emissive: 0xffffff, emissiveIntensity: 0, roughness: .37, metalness: .42 });
  const consoleLegends = new T.MeshStandardMaterial({ map: consoleControls, emissiveMap: consoleControls, emissive: 0xffffff, emissiveIntensity: 0, roughness: .37, metalness: .42 });
  const add = (name: string, size: P, at: P, m: T.Material = leather, radius = .025) => { const node = surfaceRounded(name, size, at, m, radius); root.add(node); return node; };
  // Broad dashboard cross-sections, rather than stacked intersecting slabs.
  const recess = (x: number) => x >= -.64 && x <= -.23 ? .105 : 0;
  const dash = surfaceLoft('Tank sculpted cross-car dashboard', [-.88, -.72, -.64, -.23, -.17, .34, .88].map(x => ({ at: x,
    ring: [[1.255, -.99], [1.242 - recess(x), -.67], [1.17 - recess(x), -.49], [.99, -.49], [.93, -.67], [1.09, -.95]] })), leather, 'x'); root.add(dash);
  root.add(surfaceGrid('Tank dark leather cowl', 18, 16, (u, v) => {
    const x = T.MathUtils.lerp(-.86, .86, u), cut = 1 - T.MathUtils.smoothstep(Math.abs(x + .435), .19, .28);
    return [x, T.MathUtils.lerp(1.253, 1.245 - .105 * cut, v), T.MathUtils.lerp(-1.03, -.67, v)];
  }, upper));
  add('Tank passenger satin fascia', [.72, .025, .012], [.47, 1.15, -.481], satin, .008);
  add('Tank driver fascia', [.58, .025, .012], [-.56, 1.15, -.481], satin, .008);
  add('Tank integrated centre tunnel', [.36, .31, 1.18], [0, .735, .16], leather, .045);
  add('Tank centre palmrest', [.31, .075, .37], [0, .921, .57], leather, .035);
  add('Tank console satin surround', [.32, .018, .50], [0, .910, -.025], satin, .025);
  const console = new T.Mesh(new T.PlaneGeometry(.30, .48), consoleLegends); console.name = 'Tank console legends and mode selector fascia';
  console.position.set(0, .921, -.025); console.rotation.x = -Math.PI / 2; root.add(console);
  // Vents, analogue clock and climate legends use one surface atlas.
  add('Tank continuous vent clock and climate fascia', [.84, .105, .018], [.10, 1.084, -.473], legends, .012);
  for (const side of [-1, 1]) {
    const name = side < 0 ? 'Left' : 'Right';
    add(side < 0 ? 'Tank driver shaped door card' : 'Tank passenger shaped door card', [.065, .54, 1.34], [side * .873, .987, -.33], leather, .04);
    add(side < 0 ? 'Tank driver padded armrest' : 'Tank passenger padded armrest', [.11, .085, .66], [side * .827, 1.05, -.11], leather);
    add(side < 0 ? 'Tank driver interior door pull' : 'Tank passenger interior door pull', [.024, .038, .18], [side * .829, 1.185, -.68], satin, .009);
    add(side < 0 ? 'Tank driver window switch fascia' : 'Tank passenger window switch fascia', [.078, .015, .19], [side * .81, 1.098, -.32], dark, .008);
    add(name + ' Tank fixed rear door card', [.065, .51, 1.10], [side * .875, .98, .99], leather);
    const windLower = tankWindshieldPoint(side < 0 ? 0 : 1, 0), windTop = tankWindshieldPoint(side < 0 ? 0 : 1, 1);
    root.add(surfaceQuad(name + ' Tank sloping interior A pillar', [[windLower[0], windLower[1], windLower[2] + .008],
      [windTop[0], windTop[1], windTop[2] + .008], tankSidePoint(c, side, -.665, 1.835), tankSidePoint(c, side, -1.075, b.belt)], leather));
    root.add(surfaceQuad(name + ' Tank interior B pillar', [tankSidePoint(c, side, .32, b.belt), tankSidePoint(c, side, .32, 1.81),
      tankSidePoint(c, side, .42, 1.81), tankSidePoint(c, side, .42, b.belt)], upper));
    add(name + ' Tank sculpted seat cushion', [.50, .15, .51], [side * .445, .64, .54], quilted, .055);
    const back = add(name + ' Tank quilted front seat back', [.50, .57, .13], [side * .445, .99, .86], quilted, .06); back.rotation.x = -.11;
    add(name + ' Tank front headrest', [.28, .21, .12], [side * .445, 1.39, .90], leather, .035);
  }
  add('Tank cabin carpet floor', [1.70, .028, 2.90], [0, .49, .45], upper);
  add('Tank rear bench cushion', [1.54, .14, .48], [0, .65, 1.42], leather, .05);
  add('Tank rear bench backrest', [1.54, .53, .14], [0, .99, 1.70], leather, .05);
  for (const x of [-.50, 0, .50]) add('Tank rear simple headrest', [.25, .18, .11], [x, 1.36, 1.72], leather);
  root.add(surfaceGrid('Tank contoured roof lining', 8, 8, (u, v) => {
    const z = T.MathUtils.lerp(-.57, 1.98, v), x = (u * 2 - 1) * .80;
    return [x, 1.832 - .075 * T.MathUtils.smoothstep(z, 1.2, 1.98) - .018 * (u * 2 - 1) ** 2, z];
  }, upper));
  const instrument = new InstrumentCluster(c.instrumentCluster);
  instrument.position.set(...c.instrumentClusterTransform.position); instrument.rotation.set(...c.instrumentClusterTransform.rotation); root.add(instrument);
  const center = new Tank500Display(true); center.position.set(.10, 1.264, -.568); center.rotation.x = -.12; root.add(center);
  rig.steeringWheelBase.position.set(...c.steeringWheelPosition); rig.steeringWheelBase.rotation.set(...c.steeringWheelRotation);
  rig.steeringWheelBase.add(rig.steeringWheelRotationGroup); root.add(rig.steeringWheelBase);
  const from = new T.Vector3(...c.steeringWheelPosition), to = new T.Vector3(...c.steeringColumnMountPosition!), axis = to.clone().sub(from);
  const column = new T.Mesh(new T.CylinderGeometry(.036, .036, axis.length(), 12), upper); column.name = 'Tank enclosed steering column';
  column.position.copy(from).add(to).multiplyScalar(.5); column.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), axis.normalize()); root.add(column);
  const wheel = new T.Mesh(new T.TorusGeometry(.173, .018, 8, 40), upper); wheel.name = 'Tank leather steering rim'; rig.steeringWheelRotationGroup.add(wheel);
  const hub = surfaceRounded('Tank padded airbag hub', [.145, .09, .045], [0, 0, 0], leather, .025); rig.steeringWheelRotationGroup.add(hub);
  for (const side of [-1, 1]) {
    const spoke = surfaceRounded('Tank multifunction steering spoke', [.11, .035, .025], [side * .113, -.004, 0], satin, .009); rig.steeringWheelRotationGroup.add(spoke);
    const keys = surfaceRounded('Tank wheel controls inset', [.067, .025, .006], [side * .107, -.003, .016], dark, .004); rig.steeringWheelRotationGroup.add(keys);
  }
  rig.steeringWheelRotationGroup.add(surfaceRounded('Tank lower steering spoke', [.04, .105, .03], [0, -.11, 0], satin, .008));
  rig.gearLever.position.set(...c.gearLeverPosition); rig.gearLever.add(surfaceRounded('Tank crystal-style HAT selector', [.065, .12, .065], [0, .04, 0], new T.MeshPhysicalMaterial({ color: 0x899b9c, metalness: .15, roughness: .12, clearcoat: .75 }), .015)); root.add(rig.gearLever);
  const lighting = new Tank500CabinLighting(root, c);
  return { instrument, center, lighting, update: (t: InstrumentTelemetry, dt: number) => {
    center.update(t, dt); lighting.update(t, dt);
    const keys = (t.ignitionOn ?? true) ? .025 + .13 * (1 - T.MathUtils.clamp(t.ambientDaylight ?? 1, 0, 1)) : 0;
    legends.emissiveIntensity = T.MathUtils.damp(legends.emissiveIntensity, keys, 6, dt);
    consoleLegends.emissiveIntensity = legends.emissiveIntensity;
  },
    click: (ray: T.Raycaster) => center.click(ray), cyclePage: () => center.cyclePage() };
}
