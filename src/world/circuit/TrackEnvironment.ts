import * as THREE from 'three';
import type { CircuitTrackConfig } from './CircuitTrackConfig';
import type { CircuitMaterials } from './materials';
import type { CircuitTrackLayout } from './TrackLayout';
import { createBarrierColliders, type StaticCollider } from '../../vehicle/physics/CollisionSystem';

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
    const spacing = 11;
    const count = Math.ceil(layout.lapLength / spacing);
    const offset = config.trackWidth * 0.5 + config.barrierOffset;
    const segments: RailSegment[] = [];
    for (let index = 0; index < count; index += 1) {
      const t0 = index / count;
      const t1 = (index + 1) / count;
      const p0 = layout.curve.getPointAt(t0);
      const p1 = layout.curve.getPointAt(t1);
      const tangent0 = layout.curve.getTangentAt(t0).normalize();
      const tangent1 = layout.curve.getTangentAt(t1).normalize();
      for (const side of [-1, 1]) {
        // Keep the pit-side main straight visually open and navigable.
        if (side === -1 && p0.x < -160 && p0.z > -92 && p0.z < 82) continue;
        const start = p0.clone().add(new THREE.Vector3(-tangent0.z, 0, tangent0.x).multiplyScalar(offset * side));
        const end = p1.clone().add(new THREE.Vector3(-tangent1.z, 0, tangent1.x).multiplyScalar(offset * side));
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
      const direction = end.clone().sub(start);
      const length = direction.length();
      dummy.position.copy(start).add(end).multiplyScalar(0.5);
      dummy.quaternion.setFromUnitVectors(forward, direction.normalize());
      dummy.scale.set(1, 1, length + 0.1);
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
    _config: CircuitTrackConfig,
    layout: CircuitTrackLayout,
    materials: CircuitMaterials,
    shadows: boolean,
  ): void {
    const billboardDistances = [410, 760, 1_105, 1_390];
    for (const [index, distance] of billboardDistances.entries()) {
      const t = distance / layout.lapLength;
      const point = layout.curve.getPointAt(t);
      const tangent = layout.curve.getTangentAt(t).normalize();
      const right = new THREE.Vector3(-tangent.z, 0, tangent.x);
      const group = new THREE.Group();
      group.name = 'Circuit direction billboard';
      group.position.copy(point).addScaledVector(right, 18);
      group.rotation.y = Math.atan2(tangent.x, tangent.z);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(7.5, 2.2, 0.18), materials.billboard);
      plate.position.y = 2.8;
      plate.castShadow = shadows;
      const postGeometry = new THREE.BoxGeometry(0.16, 3.4, 0.16);
      for (const x of [-3, 3]) {
        const post = new THREE.Mesh(postGeometry, materials.guardrailPost);
        post.position.set(x, 1.7, 0);
        post.castShadow = shadows;
        group.add(post);
      }
      plate.userData.boardIndex = index;
      group.add(plate);
      this.root.add(group);
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
      pole.position.set(-158, 3.1, z);
      pole.castShadow = shadows;
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.15, 0.25), lampMaterial);
      lamp.name = 'Start area lamp head';
      lamp.position.set(-158.25, 6.16, z);
      this.root.add(pole, lamp);
    }
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
      if (distanceToRoute(x, z, layout) < config.trackWidth * 0.5 + config.barrierOffset + 10) continue;
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
      placed += 1;
    }
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    trunks.castShadow = shadows;
    crowns.castShadow = shadows;
    this.root.add(trunks, crowns);
  }
}
