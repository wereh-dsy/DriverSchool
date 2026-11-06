import * as T from 'three';
import { InstrumentCluster, type InstrumentTelemetry } from './InstrumentCluster';
import { Tank500Display } from './Tank500Displays';
import type { VehicleVisualConfig } from './VehicleVisualConfig';

export function buildTank500Cabin(root: T.Group, c: VehicleVisualConfig, rig: {
  steeringWheelBase: T.Group; steeringWheelRotationGroup: T.Group; gearLever: T.Group;
}) {
  const leather = new T.MeshStandardMaterial({ color: 0x735344, roughness: .8 });
  const dark = new T.MeshStandardMaterial({ color: 0x171e23, roughness: .7 });
  const satin = new T.MeshStandardMaterial({ color: 0x929aa0, metalness: .7, roughness: .35 });
  const box = (name: string, size: [number, number, number], at: [number, number, number], m: T.Material = leather) => {
    const mesh = new T.Mesh(new T.BoxGeometry(...size), m); mesh.name = name; mesh.position.set(...at); root.add(mesh); return mesh;
  };
  box('Tank broad leather dashboard', [1.77, .19, .42], [0, 1.08, -.72]);
  box('Tank satin fascia', [1.72, .055, .018], [0, 1.135, -.494], satin);
  box('Tank centre tunnel', [.36, .38, 1.25], [0, .67, .22]);
  box('Tank padded armrest', [.35, .10, .44], [0, .91, .58]);
  for (const side of [-1, 1]) {
    box('Tank inner door', [.07, .60, 1.18], [side * .90, .90, .05]);
    box('Tank door armrest', [.12, .09, .67], [side * .86, 1.02, .10], dark);
    box('Tank A pillar', [.075, .65, .075], [side * .84, 1.53, -.82]);
    box('Tank vent', [.20, .045, .027], [side * .69, 1.18, -.49], dark);
    box('Tank seat cushion', [.51, .16, .48], [side * .45, .63, .52]);
    box('Tank seat back', [.51, .60, .15], [side * .45, .97, .82]);
    box('Tank seat headrest', [.27, .22, .12], [side * .45, 1.39, .86]);
  }
  box('Tank roof liner', [1.72, .03, 2.50], [0, 1.84, .52], dark);
  const instrument = new InstrumentCluster(c.instrumentCluster);
  instrument.position.set(...c.instrumentClusterTransform.position); instrument.rotation.set(...c.instrumentClusterTransform.rotation); root.add(instrument);
  const center = new Tank500Display(true); center.position.set(.11, 1.31, -.55); center.rotation.x = -.08; root.add(center);
  rig.steeringWheelBase.position.set(...c.steeringWheelPosition); rig.steeringWheelBase.rotation.set(...c.steeringWheelRotation);
  rig.steeringWheelBase.add(rig.steeringWheelRotationGroup); root.add(rig.steeringWheelBase);
  const from=new T.Vector3(...c.steeringWheelPosition),to=new T.Vector3(...c.steeringColumnMountPosition!),axis=to.clone().sub(from);
  const column=new T.Mesh(new T.CylinderGeometry(.036,.036,axis.length(),12),dark);column.name='Tank enclosed steering column';
  column.position.copy(from).add(to).multiplyScalar(.5);column.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),axis.normalize());root.add(column);
  const wheel = new T.Mesh(new T.TorusGeometry(.173, .018, 8, 40), dark);wheel.name='Tank leather steering rim';rig.steeringWheelRotationGroup.add(wheel);
  const hub = new T.Mesh(new T.BoxGeometry(.145, .09, .045), leather); rig.steeringWheelRotationGroup.add(hub);
  for (const x of [-.11, .11]) { const spoke = new T.Mesh(new T.BoxGeometry(.10, .035, .022), satin); spoke.position.x = x; rig.steeringWheelRotationGroup.add(spoke); }
  const stem = new T.Mesh(new T.BoxGeometry(.04, .10, .04), satin); stem.position.y = -.115; rig.steeringWheelRotationGroup.add(stem);
  rig.gearLever.position.set(...c.gearLeverPosition); rig.gearLever.add(new T.Mesh(new T.BoxGeometry(.065, .12, .065), satin)); root.add(rig.gearLever);
  return { instrument, update: (t: InstrumentTelemetry, dt: number) => center.update(t, dt) };
}
