import * as THREE from 'three';
import type { CircuitTrackConfig } from './CircuitTrackConfig';
import type { CircuitMaterials } from './materials';
import type { CircuitTrackLayout } from './TrackLayout';
import { createBarrierColliders, createStaticOBBCollider, type StaticCollider } from '../../vehicle/physics/CollisionSystem';
import { circuitBarrierDistance } from './TrackFeatures';
import { CIRCUIT_PIT_ACCESS_Z } from './StartFinishArea';

interface RailSegment {
  readonly start: THREE.Vector3;
  readonly end: THREE.Vector3;
}

const distanceToRoute = (
  x: number,
  z: number,
  layout: CircuitTrackLayout,
): number => {
  let minimumSquared = Number.POSITIVE_INFINITY;
  const route = layout.routeCenterline;
  for (let index = 1; index < route.length; index += 1) {
    const a = route[index - 1]!;
    const b = route[index]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthSquared = dx * dx + dz * dz;
    const projection = lengthSquared > 1e-9
      ? THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / lengthSquared, 0, 1)
      : 0;
    const nearestX = a.x + dx * projection;
    const nearestZ = a.z + dz * projection;
    minimumSquared = Math.min(
      minimumSquared,
      (x - nearestX) ** 2 + (z - nearestZ) ** 2,
    );
  }
  return Math.sqrt(minimumSquared);
};

export class TrackEnvironment {
  public readonly root = new THREE.Group();
  public readonly colliders: StaticCollider[] = [];

  public constructor(
    config: CircuitTrackConfig,
    layout: CircuitTrackLayout,
    materials: CircuitMaterials,
    shadows: boolean,
  ) {
    this.root.name = 'Sparse circuit environment';
    this.buildGuardrails(config, layout, materials, shadows);
    this.buildReferenceObjects(config, layout, materials, shadows);
    this.buildTrees(config, layout, materials, shadows);
  }

  private buildGuardrails(
    config: CircuitTrackConfig,
    layout: CircuitTrackLayout,
    materials: CircuitMaterials,
    shadows: boolean,
  ): void {
    const spacing = 4;
    const count = Math.ceil(layout.lapLength / spacing);
    const distances = Array.from({ length: count + 1 }, (_, index) => layout.lapLength * index / count);
    // Split beams exactly at the existing apron accesses instead of leaving
    // the whole pit-side straight unprotected or extending a rail into access.
    const mainStart = layout.curve.getPointAt(0);
    for (const z of CIRCUIT_PIT_ACCESS_Z) {
      for (const edge of [-3.75, 3.75]) distances.push(mainStart.z - (z + edge));
    }
    distances.sort((a, b) => a - b);
    const segments: RailSegment[] = [];
    for (let index = 0; index < distances.length - 1; index += 1) {
      const d0 = distances[index]!;
      const d1 = distances[index + 1]!;
      const t0 = d0 / layout.lapLength;
      const t1 = d1 / layout.lapLength;
      const p0 = layout.curve.getPointAt(t0);
      const p1 = layout.curve.getPointAt(t1);
      const tangent0 = layout.curve.getTangentAt(t0).normalize();
      const tangent1 = layout.curve.getTangentAt(t1).normalize();
      for (const side of [-1, 1]) {
        const midpointZ = (p0.z + p1.z) * 0.5;
        if (side === -1 && d1 <= layout.mainStraightLength &&
          CIRCUIT_PIT_ACCESS_Z.some(z => Math.abs(midpointZ - z) < 3.75)) continue;
        const offset0 = circuitBarrierDistance(config, layout.sections, d0, side, layout.lapLength);
        const offset1 = circuitBarrierDistance(config, layout.sections, d1, side, layout.lapLength);
        const start = p0.clone().add(new THREE.Vector3(-tangent0.z, 0, tangent0.x).multiplyScalar(offset0 * side));
        const end = p1.clone().add(new THREE.Vector3(-tangent1.z, 0, tangent1.x).multiplyScalar(offset1 * side));
        start.y = 0.66;
        end.y = 0.66;
        segments.push({ start, end });
      }
    }
    const beam = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.14, 0.22, 1),
      materials.guardrail,
      segments.length,
    );
    const posts = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.13, 0.72, 0.13),
      materials.guardrailPost,
      segments.length,
    );
    beam.name = 'Offset circuit guardrails';
    posts.name = 'Circuit guardrail posts';
    const dummy = new THREE.Object3D();
    const forward = new THREE.Vector3(0, 0, 1);
    segments.forEach(({ start, end }, index) => {
      this.colliders.push(...createBarrierColliders({
        id: `circuit-rail:${index}`,
        start,
        end,
        thickness: 0.14,
        minHeight: 0.55,
        maxHeight: 0.77,
        type: 'guardrail',
      }));
      this.colliders.push(createStaticOBBCollider({ id: `circuit-rail-post:${index}`,
        x: start.x, z: start.z, width: 0.13, length: 0.13,
        minHeight: 0, maxHeight: 0.72, type: 'obstacle' }));
      const direction = end.clone().sub(start);
      const length = direction.length();
      dummy.position.copy(start).add(end).multiplyScalar(0.5);
      dummy.quaternion.setFromUnitVectors(forward, direction.normalize());
      dummy.scale.set(1, 1, length + 0.002);
      dummy.updateMatrix();
      beam.setMatrixAt(index, dummy.matrix);
      dummy.position.set(start.x, 0.36, start.z);
      dummy.quaternion.identity();
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      posts.setMatrixAt(index, dummy.matrix);
    });
    beam.instanceMatrix.needsUpdate = true;
    posts.instanceMatrix.needsUpdate = true;
    beam.castShadow = shadows;
    posts.castShadow = shadows;
    this.root.add(beam, posts);
  }

  private buildReferenceObjects(
    config: CircuitTrackConfig,
    layout: CircuitTrackLayout,
    materials: CircuitMaterials,
    shadows: boolean,
  ): void {
    for (const section of layout.sections) {
      if (section.kind !== 'braking' && section.id !== 'turn-one') continue;
      const side = Math.sign(section.turnAngleRadians ?? 1);
      for (const distanceBefore of [150, 100, 50]) {
        const distance = THREE.MathUtils.euclideanModulo(section.startDistance - distanceBefore, layout.lapLength);
        const offset = circuitBarrierDistance(config, layout.sections, distance, side, layout.lapLength) + 2;
        this.buildBoard(layout, materials, distance, side * offset,
          String(distanceBefore), `Braking board ${section.id} ${distanceBefore}`, shadows);
      }
      const distance = section.startDistance - 12;
      const offset = circuitBarrierDistance(config, layout.sections, distance, side, layout.lapLength) + 3;
      this.buildBoard(layout, materials, distance, side * offset,
        section.id === 'turn-one' ? 'T1  >' : 'T3  >', 'Circuit corner identification board', shadows);
    }

    const poleMaterial = materials.guardrailPost;
    const lampMaterial = new THREE.MeshStandardMaterial({
      color: 0xfff1bd,
      emissive: 0xffd978,
      emissiveIntensity: 1.1,
      roughness: 0.3,
    });
    for (const z of [72, 25, -22, -69, -116]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 6.2, 8), poleMaterial);
      pole.name = 'Start area lamp pole';
      const x = -172.5 + config.trackWidth * 0.5 + config.barrierOffset + 4;
      pole.position.set(x, 3.1, z);
      pole.castShadow = shadows;
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.15, 0.25), lampMaterial);
      lamp.name = 'Start area lamp head';
      lamp.position.set(x - 0.25, 6.16, z);
      this.colliders.push(createStaticOBBCollider({ id: `circuit-lamp:${z}`, x, z,
        width: 0.2, length: 0.2, minHeight: 0, maxHeight: 6.2, type: 'obstacle' }));
      this.root.add(pole, lamp);
    }
  }

  private buildBoard(layout: CircuitTrackLayout, materials: CircuitMaterials,
    distance: number, offset: number, label: string, name: string, shadows: boolean): void {
    const t = THREE.MathUtils.euclideanModulo(distance, layout.lapLength) / layout.lapLength;
    const point = layout.curve.getPointAt(t);
    const tangent = layout.curve.getTangentAt(t).normalize();
    const group = new THREE.Group();
    group.name = name;
    group.position.set(point.x - tangent.z * offset, 0, point.z + tangent.x * offset);
    // The front of the board faces upstream, toward the approaching driver.
    group.rotation.y = Math.atan2(-tangent.x, -tangent.z);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 0.08), materials.structure);
    plate.position.y = 1.65;
    plate.castShadow = shadows;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.25, 0.1), materials.guardrailPost);
    post.position.y = 0.625;
    group.add(plate, post);
    // Headless geometry tests need no DOM; the browser supplies the readable face.
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 192;
      const context = canvas.getContext('2d');
      if (context) {
        context.fillStyle = '#eeeade'; context.fillRect(0, 0, 256, 192);
        context.strokeStyle = '#293138'; context.lineWidth = 10; context.strokeRect(5, 5, 246, 182);
        context.fillStyle = '#20292d'; context.font = 'bold 96px sans-serif';
        context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(label, 128, 100, 228);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        const face = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 1.06),
          new THREE.MeshBasicMaterial({ map: texture }));
        face.position.set(0, 1.65, 0.041);
        group.add(face);
      }
    }
    this.colliders.push(createStaticOBBCollider({ id: name, x: group.position.x, z: group.position.z,
      width: 1.4, length: 0.08, yaw: group.rotation.y, minHeight: 1.1, maxHeight: 2.2, type: 'obstacle' }),
      createStaticOBBCollider({ id: `${name}:post`, x: group.position.x, z: group.position.z,
        width: 0.1, length: 0.1, minHeight: 0, maxHeight: 1.25, type: 'obstacle' }));
    this.root.add(group);
  }

  private buildTrees(
    config: CircuitTrackConfig,
    layout: CircuitTrackLayout,
    materials: CircuitMaterials,
    shadows: boolean,
  ): void {
    const treeCount = Math.round(84 * config.environmentDensity);
    const trunks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.2, 0.3, 2.7, 7),
      materials.trunk,
      treeCount,
    );
    const crowns = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(1.6, 0),
      materials.foliage,
      treeCount,
    );
    trunks.name = 'Sparse circuit tree trunks';
    crowns.name = 'Sparse circuit tree crowns';
    let seed = 0x51c0_7a11;
    const random = (): number => {
      seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
      return seed / 0x1_0000_0000;
    };
    const dummy = new THREE.Object3D();
    let placed = 0;
    while (placed < treeCount) {
      const x = THREE.MathUtils.lerp(layout.bounds.minimumX, layout.bounds.maximumX, random());
      const z = THREE.MathUtils.lerp(layout.bounds.minimumZ, layout.bounds.maximumZ, random());
      if (distanceToRoute(x, z, layout) < config.trackWidth * 0.5 + config.barrierOffset +
        Math.max(config.flowingOuterSetback, config.brakingOuterSetback) + 10) continue;
      if (x < -178 && z > -90 && z < 70) continue;
      const scale = 0.78 + random() * 0.42;
      dummy.position.set(x, 1.35 * scale, z);
      dummy.rotation.set(0, random() * Math.PI * 2, 0);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      trunks.setMatrixAt(placed, dummy.matrix);
      dummy.position.y = 3.45 * scale;
      dummy.rotation.y += 0.5;
      dummy.updateMatrix();
      crowns.setMatrixAt(placed, dummy.matrix);
      this.colliders.push(createStaticOBBCollider({ id: `circuit-tree:${placed}`, x, z,
        width: 0.6 * scale, length: 0.6 * scale, minHeight: 0, maxHeight: 2.7 * scale, type: 'obstacle' }));
      placed += 1;
    }
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    trunks.castShadow = shadows;
    crowns.castShadow = shadows;
    this.root.add(trunks, crowns);
  }
}
