import * as T from 'three';
import { localWheelPositions, VEHICLE_WHEEL_IDS, type VehicleWheelId } from '../VehicleDimensions';
import type { VehicleVisualConfig } from './VehicleVisualConfig';

function material(color: number, metalness = .1, roughness = .45) { return new T.MeshStandardMaterial({ color, metalness, roughness }); }
function box(root: T.Group, name: string, size: [number, number, number], position: [number, number, number], m: T.Material) {
  const mesh = new T.Mesh(new T.BoxGeometry(...size), m); mesh.name = name; mesh.position.set(...position);
  mesh.castShadow = mesh.receiveShadow = true; root.add(mesh); return mesh;
}
/** Separate materials and broad continuous panels. No mutable resources shared with another car. */
export function buildTank500Exterior(root: T.Group, c: VehicleVisualConfig): void {
  const paint = material(c.body.color, .55, .29), dark = material(c.body.trimColor), chrome = material(0xb3bec3, .85, .25);
  const glass = new T.MeshPhysicalMaterial({ color: 0x233d49, transparent: true, opacity: .34, roughness: .08, side: T.DoubleSide, depthWrite: false });
  const lamp = new T.MeshStandardMaterial({ color: 0xe4efff, emissive: 0x7b93ab, emissiveIntensity: .18 });
  const red = new T.MeshStandardMaterial({ color: 0x7a101b, emissive: 0x3a0000, emissiveIntensity: .18 });
  const front = -c.vehicleLength / 2, rear = 2.16, roofY = c.dimensions.height - .055;
  const underfloor=box(root,'Tank lower protective underfloor',[1.20,.012,rear-front-.50],[0,c.body.groundClearance+.006,(front+rear)/2],dark);
  underfloor.userData.vehicleBodyPart='underfloor';
  for (const side of [-1, 1]) {
    // Side skin lower contour follows actual tyre arches, preserving full wheel clearance.
    const shape = new T.Shape(); shape.moveTo(front + .1, .50); shape.lineTo(front + .04, 1.13);
    shape.lineTo(-1.10, 1.25); shape.lineTo(-.65, roofY); shape.lineTo(1.90, roofY); shape.lineTo(rear, 1.68); shape.lineTo(rear, .48);
    const archRadius = c.wheelRadius + c.body.wheelArchClearance;
    for (const z of [c.wheelBase * .5, -c.wheelBase * .5]) {
      shape.lineTo(z + archRadius, .48);
      for (let i = 0; i <= 20; i++) { const a = i / 20 * Math.PI; shape.lineTo(z + Math.cos(a) * archRadius, .48 + Math.sin(a) * archRadius); }
    }
    shape.lineTo(front + .1, .50);
    // Open cabin windows, actual transparent panes sit in the openings.
    for (const [z0, z1] of [[-.62, .35], [.48, 1.24], [1.36, 1.91]]) {
      const hole = new T.Path(); hole.moveTo(z0!, 1.30); hole.lineTo(z1!, 1.30); hole.lineTo(z1!, 1.73); hole.lineTo(z0! + .05, 1.73); hole.closePath(); shape.holes.push(hole);
      box(root, 'Tank side glass', [.008, .43, z1! - z0!], [side * .919, 1.515, (z0! + z1!) / 2], glass);
    }
    const geometry = new T.ExtrudeGeometry(shape, { depth: .045, bevelEnabled: false });
    geometry.rotateY(-Math.PI / 2); // Shape longitudinal x becomes vehicle z.
    const panel = new T.Mesh(geometry, paint); panel.position.x = side < 0 ? -.92 : .965;
    panel.name = 'Tank continuous side with open wheel arches'; panel.castShadow = true; root.add(panel);
    box(root, 'Tank side step', [.19, .065, 2.15], [side * .87, .38, .05], dark);
    for (const z of [-.12, .85]) box(root, 'Tank door handle', [.025, .04, .17], [side * .98, 1.21, z], chrome);
    box(root, 'Tank roof rail', [.04, .045, 2.65], [side * .72, roofY + .033, .55], chrome);
    box(root, 'Tank vertical tail lamp', [.17, .40, .035], [side * .79, 1.18, rear + .015], red);
    box(root, 'Tank front LED unit', [.32, .18, .065], [side * .72, 1.10, front + .06], lamp);
  }
  box(root, 'Tank bonnet', [1.78, .10, 1.34], [0, 1.19, -1.82], paint);
  const wind = box(root, 'Tank upright windscreen', [1.71, .65, .012], [0, 1.515, -.855], glass); wind.rotation.x = .58;
  box(root, 'Tank roof', [1.73, .045, 2.56], [0, roofY, .64], paint);
  box(root, 'Tank tailgate', [1.80, .64, .06], [0, .91, rear], paint);
  box(root, 'Tank rear glass', [1.61, .48, .016], [0, 1.59, rear], glass);
  box(root, 'Tank front bumper', [1.88, .22, .19], [0, .56, front + .12], paint);
  box(root, 'Tank skid plate', [1.25, .13, .08], [0, .38, front + .18], chrome);
  box(root, 'Tank rear bumper', [1.85, .19, .18], [0, .49, rear], dark);
  box(root, 'Tank grille backing', [1.03, .48, .06], [0, 1.01, front + .02], dark);
  for (let i = 0; i < 6; i++) box(root, 'Tank horizontal grille bar', [1.04, .037, .085], [0, .81 + i * .077, front + .05], chrome);
  box(root, 'Tank grille emblem', [.12, .16, .025], [0, 1.01, front + .006], dark);
  // Frame rails lie inside the body and carry the rear-frame battery enclosure.
  for (const x of [-.53, .53]) box(root, 'Tank ladder frame rail', [.10, .14, 3.95], [x, .32, -.04], dark);
  box(root, 'Tank protected HV battery enclosure', [1.12, .18, 1.38], [0, .42, 1.03], dark);
  const spare = new T.Mesh(new T.CylinderGeometry(c.wheelRadius, c.wheelRadius, .245, 24), dark);
  spare.rotation.x = Math.PI / 2; spare.position.set(0, 1.16, rear + .19); spare.name = 'Tank tailgate external spare tyre'; root.add(spare);
  const cover = new T.Mesh(new T.CylinderGeometry(c.wheelRadius * .92, c.wheelRadius * .92, .04, 24), paint);
  cover.rotation.x = Math.PI / 2; cover.position.set(0, 1.16, rear + .325); cover.name = 'Tank external spare cover'; root.add(cover);
}
export function buildTank500Wheels(root: T.Group, c: VehicleVisualConfig): { pivots: Record<VehicleWheelId, T.Group>; wheels: T.Mesh[] } {
  const pivots = {} as Record<VehicleWheelId, T.Group>, wheels: T.Mesh[] = [];
  const tyre = material(0x131617, 0, .94), rim = material(0xa3a7aa, .8, .25), recess = material(0x22282b, .4, .6);
  const geometry = new T.CylinderGeometry(c.wheelRadius, c.wheelRadius, c.dimensions.wheelWidth, 32); geometry.rotateZ(Math.PI / 2);
  const rimGeometry = new T.CylinderGeometry(.245, .245, c.dimensions.wheelWidth + .005, 24); rimGeometry.rotateZ(Math.PI / 2);
  const positions = localWheelPositions(c.dimensions);
  for (const id of VEHICLE_WHEEL_IDS) {
    const p = positions[id], pivot = new T.Group(); pivot.name = `Tank ${id} steering pivot`; pivot.userData.wheelId = id;
    pivot.position.set(p.x, p.y, p.z); root.add(pivot); pivots[id] = pivot;
    const wheel = new T.Mesh(geometry, tyre); wheel.name = `Tank ${id} all-terrain tyre`; wheel.castShadow = true; pivot.add(wheel); wheels.push(wheel);
    const face = new T.Mesh(rimGeometry, recess); wheel.add(face);
    const spokes = new T.InstancedMesh(new T.BoxGeometry(.016, .055, .19), rim, 12), matrix = new T.Matrix4();
    for (let j = 0; j < 12; j++) { const a = j * Math.PI / 6; matrix.makeRotationX(a); matrix.setPosition((id.includes('Left') ? -1 : 1) * .137, Math.sin(a) * .13, Math.cos(a) * .13); spokes.setMatrixAt(j, matrix); }
    wheel.add(spokes);
    const tread = new T.InstancedMesh(new T.BoxGeometry(.10, .013, .052), tyre, 72);
    for (let j = 0; j < 72; j++) { const a = Math.floor(j / 3) / 24 * Math.PI * 2; matrix.makeRotationX(a); matrix.setPosition((j % 3 - 1) * .082, Math.cos(a) * c.wheelRadius, Math.sin(a) * c.wheelRadius); tread.setMatrixAt(j, matrix); }
    wheel.add(tread);
  }
  return { pivots, wheels };
}
