import * as T from 'three';
import { InstrumentCluster, type InstrumentTelemetry } from './InstrumentCluster';
import { QinPlusDisplay } from './QinPlusDisplays';
import { surfaceGrid, surfaceLoft, surfaceQuad, surfaceRounded } from './SurfaceVehicleGeometry';
import type { VehicleVisualConfig, Vector3Tuple as P } from './VehicleVisualConfig';

export function buildQinPlusCabin(root: T.Group, c: VehicleVisualConfig, rig: {
  steeringWheelBase: T.Group; steeringWheelRotationGroup: T.Group; gearLever: T.Group;
}) {
  const leather = new T.MeshStandardMaterial({ color: c.body.interiorColor, roughness: .8, side: T.DoubleSide });
  const upper = new T.MeshStandardMaterial({ color: 0x233036, roughness: .88, side: T.DoubleSide });
  const piano = new T.MeshStandardMaterial({ color: 0x11191c, roughness: .27 });
  const satin = new T.MeshStandardMaterial({ color: 0xa9afb0, metalness: .7, roughness: .32 });
  const add = (name: string, size: P, at: P, material: T.Material = leather, radius = .02) => {
    const mesh = surfaceRounded(name, size, at, material, radius); root.add(mesh); return mesh;
  };
  root.add(surfaceLoft('Qin flowing two-tone dashboard', [-.80, -.65, -.48, -.22, 0, .37, .80].map(x => ({ at: x,
    ring: [[.99, -.96], [1.005, -.72], [.95, -.48], [.81, -.44], [.73, -.62], [.84, -.93]] })), leather, 'x'));
  add('Qin soft dark upper cowl', [1.57, .035, .28], [0, .997, -.80], upper);
  add('Qin passenger satin wave', [.69, .014, .015], [.41, .912, -.465], satin, .005);
  add('Qin driver satin wave', [.48, .014, .015], [-.51, .912, -.465], satin, .005);
  for (const x of [-.69, -.15, .22, .68]) {
    add('Qin rectangular air vent recess', [.145, .040, .018], [x, .865, -.444], piano, .008);
    add('Qin vent satin horizontal control', [.12, .004, .010], [x, .865, -.430], satin, .002);
  }
  add('Qin centre tunnel', [.31, .22, 1.05], [.015, .53, .18], leather, .035);
  add('Qin black selector island', [.265, .016, .45], [.015, .651, .04], piano);
  add('Qin armrest', [.28, .065, .32], [.015, .69, .46], leather, .03);
  add('Qin storage tray', [.235, .015, .22], [.015, .669, -.23], upper);
  for (const x of [-.08, 0, .08]) add('Qin physical console key', [.048, .014, .030], [x, .669, -.055], satin, .006);
  for (const side of [-1, 1]) {
    add('Qin padded door card', [.052, .42, 1.21], [side * .802, .79, -.22]);
    add('Qin door armrest', [.092, .06, .54], [side * .76, .80, .01]);
    add('Qin interior door pull', [.022, .025, .14], [side * .767, .902, -.53], satin);
    add('Qin front seat cushion', [.47, .13, .47], [side * .39, .43, .47], leather, .05);
    const back = add('Qin sculpted seat back', [.47, .55, .12], [side * .39, .76, .76], leather, .045);
    back.rotation.x = -.12;
    add('Qin front headrest', [.25, .18, .11], [side * .39, 1.10, .81], leather, .025);
    root.add(surfaceQuad('Qin interior A pillar', [[side * .81, 1.03, -.98], [side * .65, 1.43, -.50],
      [side * .69, 1.43, -.43], [side * .83, 1.00, -.90]], leather));
    root.add(surfaceQuad('Qin inset sloping interior B pillar', [[side * .83, 1.0, .23], [side * .65, 1.41, .23],
      [side * .65, 1.41, .31], [side * .83, 1.0, .31]], upper));
    add('Qin rear door card', [.05, .38, .92], [side * .80, .79, .94]);
  }
  add('Qin carpet floor', [1.54, .025, 2.65], [0, .255, .30], upper);
  add('Qin rear bench', [1.38, .13, .43], [0, .44, 1.28], leather, .045);
  add('Qin rear backrest', [1.38, .49, .12], [0, .74, 1.52], leather, .045);
  for (const x of [-.47, 0, .47]) add('Qin rear headrest', [.24, .16, .10], [x, 1.05, 1.56]);
  // Follow the outer roof crown at every station, with inward clearance.
  // A flat slab at the crown height pokes through the lower roof shoulders.
  root.add(surfaceGrid('Qin inset curved roof lining', 12, 16, (u, v) => {
    const x = (u * 2 - 1) * .62, z = T.MathUtils.lerp(-.46, 1.23, v), t = (z + .51) / 1.79;
    const halfWidth = .66 + .025 * Math.sin(t * Math.PI);
    return [x, 1.515 - .075 * (x / halfWidth) ** 2 - .065 * (t * 2 - 1) ** 2 - .025, z];
  }, leather));
  add('Qin floating instrument pedestal', [.075, .05, .032], [-.37, 1.02, -.548], piano, .008);
  rig.steeringWheelBase.position.set(...c.steeringWheelPosition); rig.steeringWheelBase.rotation.set(...c.steeringWheelRotation);
  rig.steeringWheelBase.add(rig.steeringWheelRotationGroup); root.add(rig.steeringWheelBase);
  const rim = new T.Mesh(new T.TorusGeometry(c.steeringWheelRadius, c.steeringWheelRimTubeRadius, 8, 40), upper);
  rim.name = 'Qin three-spoke leather steering rim'; rig.steeringWheelRotationGroup.add(rim);
  for (const angle of [0, Math.PI, -Math.PI / 2]) {
    const spoke = surfaceRounded('Qin satin steering spoke', [.12, .025, .019], [.09 * Math.cos(angle), .09 * Math.sin(angle), 0], satin, .006);
    spoke.rotation.z = angle; rig.steeringWheelRotationGroup.add(spoke);
  }
  rig.steeringWheelRotationGroup.add(surfaceRounded('Qin steering airbag', [.127, .090, .036], [0, 0, .01], upper));
  rig.gearLever.position.set(...c.gearLeverPosition); rig.gearLever.add(surfaceRounded('Qin compact electronic selector', [.052, .085, .072], [0, .027, 0], piano, .015));
  root.add(rig.gearLever);
  const instrument = new InstrumentCluster(c.instrumentCluster);
  instrument.position.set(...c.instrumentClusterTransform.position); instrument.rotation.set(...c.instrumentClusterTransform.rotation); root.add(instrument);
  const center = new QinPlusDisplay(true); center.position.set(.15, 1.035, -.505); center.rotation.x = -.1; root.add(center);
  return { instrument, center,
    update: (t: InstrumentTelemetry, dt: number) => center.update(t, dt),
    cyclePage: () => center.cyclePage(),
    click: (ray: T.Raycaster) => { if (!ray.intersectObject(center.screen).length) return false; center.cyclePage(); return true; } };
}
