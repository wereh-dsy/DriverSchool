import * as THREE from 'three';

import { localWheelPositions, VEHICLE_WHEEL_IDS, type VehicleWheelId } from '../VehicleDimensions';
import type { VehicleVisualConfig } from './VehicleVisualConfig';

/**
 * Model 3 18" aero wheel: rounded tyre shoulders, an open barrel, a flat
 * turbine-style aero face, a hub cap and a real brake disc.  Geometry is
 * shared across the four corners; only the aero face sits outboard per side.
 */
export function buildTeslaModel3Wheels(
  root: THREE.Group,
  config: VehicleVisualConfig,
): { pivots: Record<VehicleWheelId, THREE.Group>; wheels: THREE.Mesh[] } {
  const radius = config.wheelRadius;
  const width = config.dimensions.wheelWidth;
  const halfWidth = width * .5;
  const rimRadius = radius * .682;

  const rubber = new THREE.MeshStandardMaterial({ color: 0x101214, roughness: .90, metalness: .01 });
  const darkAlloy = new THREE.MeshStandardMaterial({
    color: 0x252a2f, roughness: .38, metalness: .72, side: THREE.DoubleSide,
  });
  const aeroFace = new THREE.MeshStandardMaterial({ color: 0x596066, roughness: .28, metalness: .78 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x6b7177, roughness: .44, metalness: .70 });
  const caliper = new THREE.MeshStandardMaterial({ color: 0x2c3136, roughness: .52, metalness: .38 });
  const hubCap = new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: .30, metalness: .62 });
  const satin = new THREE.MeshStandardMaterial({ color: 0x9aa2a8, roughness: .24, metalness: .86 });

  const tyreTemplate: readonly (readonly [number, number])[] = [
    [rimRadius * .96, -halfWidth],
    [radius * .80, -halfWidth * .99],
    [radius * .935, -halfWidth * .91],
    [radius * .988, -halfWidth * .73],
    [radius, -halfWidth * .46],
    [radius, halfWidth * .46],
    [radius * .988, halfWidth * .73],
    [radius * .935, halfWidth * .91],
    [radius * .80, halfWidth * .99],
    [rimRadius * .96, halfWidth],
  ];
  const tyreGeometry = new THREE.LatheGeometry(
    tyreTemplate.map(([r, y]) => new THREE.Vector2(r, y)), 36);
  tyreGeometry.rotateZ(Math.PI / 2);
  const barrelGeometry = new THREE.CylinderGeometry(rimRadius * .99, rimRadius * .99, width * .88, 28, 1, true);
  barrelGeometry.rotateZ(Math.PI / 2);
  const discGeometry = new THREE.CylinderGeometry(radius * .48, radius * .48, .018, 24);
  discGeometry.rotateZ(Math.PI / 2);
  const coverGeometry = new THREE.CylinderGeometry(rimRadius * .975, rimRadius * .975, .014, 28);
  coverGeometry.rotateZ(Math.PI / 2);
  const innerDiscGeometry = new THREE.CylinderGeometry(rimRadius * .90, rimRadius * .90, .010, 22);
  innerDiscGeometry.rotateZ(Math.PI / 2);
  const hubGeometry = new THREE.CylinderGeometry(radius * .142, radius * .142, .016, 18);
  hubGeometry.rotateZ(Math.PI / 2);
  const hubRingGeometry = new THREE.TorusGeometry(radius * .115, .004, 6, 20);
  hubRingGeometry.rotateY(Math.PI / 2);
  const caliperGeometry = new THREE.BoxGeometry(.05, .105, .062);

  // Six radial aero slots merged into one geometry, so the cover reads as a
  // turbine instead of a flat disc without adding dozens of draw calls.
  const slotPositions: number[] = [];
  const slotIndices: number[] = [];
  const slotCount = 6;
  const innerRadius = radius * .40;
  const outerRadius = radius * .66;
  for (let slot = 0; slot < slotCount; slot += 1) {
    const base = slot * 4;
    const a0 = slot / slotCount * Math.PI * 2 + .05;
    const a1 = a0 + .13;
    for (const angle of [a0, a1]) {
      slotPositions.push(0, innerRadius * Math.cos(angle), innerRadius * Math.sin(angle));
      slotPositions.push(0, outerRadius * Math.cos(angle), outerRadius * Math.sin(angle));
    }
    // a0-inner, a0-outer, a1-inner, a1-outer
    slotIndices.push(base, base + 1, base + 3, base, base + 3, base + 2);
  }
  const slotGeometry = new THREE.BufferGeometry();
  slotGeometry.setAttribute('position', new THREE.Float32BufferAttribute(slotPositions, 3));
  slotGeometry.setIndex(slotIndices);
  slotGeometry.computeVertexNormals();

  const wheelPositions = localWheelPositions(config.dimensions);
  const pivots = {} as Record<VehicleWheelId, THREE.Group>;
  const wheels: THREE.Mesh[] = [];
  for (const id of VEHICLE_WHEEL_IDS) {
    const position = wheelPositions[id];
    const outboard = id.endsWith('Left') ? -1 : 1;
    const pivot = new THREE.Group();
    pivot.name = `${id} Tesla wheel mount`;
    pivot.userData.wheelId = id;
    pivot.position.set(position.x, position.y - (config.staticBodyOffsetY ?? 0), position.z);
    pivots[id] = pivot;

    const tyre = new THREE.Mesh(tyreGeometry, rubber);
    tyre.name = 'Tyre';
    tyre.castShadow = true;
    tyre.receiveShadow = true;
    const tyreWidth = id.startsWith('front') ? config.dimensions.frontWheelWidth : config.dimensions.rearWheelWidth;
    tyre.scale.x = (tyreWidth ?? width) / width;

    const barrel = new THREE.Mesh(barrelGeometry, darkAlloy);
    barrel.name = 'Model 3 open aero wheel barrel';
    const disc = new THREE.Mesh(discGeometry, steel);
    disc.name = 'Model 3 brake disc';
    disc.position.x = outboard * .028;
    const cover = new THREE.Mesh(coverGeometry, aeroFace);
    cover.name = 'Model 3 aero wheel cover';
    cover.position.x = outboard * (halfWidth - .018);
    const slots = new THREE.Mesh(slotGeometry, darkAlloy);
    slots.name = 'Model 3 aero cover slots';
    slots.position.x = outboard * (halfWidth - .011);
    if (outboard < 0) slots.scale.x = -1;
    const hub = new THREE.Mesh(hubGeometry, hubCap);
    hub.name = 'Model 3 wheel hub cap';
    hub.position.x = outboard * (halfWidth - .010);
    const hubRing = new THREE.Mesh(hubRingGeometry, satin);
    hubRing.name = 'Model 3 hub cap ring';
    hubRing.position.x = outboard * (halfWidth - .0075);
    const innerDisc = new THREE.Mesh(innerDiscGeometry, darkAlloy);
    innerDisc.name = 'Model 3 inboard wheel face';
    innerDisc.position.x = -outboard * (halfWidth - .018);
    const brakeCaliper = new THREE.Mesh(caliperGeometry, caliper);
    brakeCaliper.name = 'Model 3 brake caliper';
    brakeCaliper.position.set(-outboard * .065, .095, .075);
    brakeCaliper.rotation.x = .45;

    tyre.add(barrel, disc, cover, slots, hub, hubRing, innerDisc, brakeCaliper);
    pivot.add(tyre);
    root.add(pivot);
    wheels.push(tyre);
  }
  return { pivots, wheels };
}
