import * as THREE from 'three';
import type { DrivingGround } from '../DrivingGround';
import type { TrackSpawnPose } from '../DrivingTestTrack';
import { sampleGroundGeometry, surfaceResponseAliases, type RoadSurfaceSample } from '../SurfaceMaterial';
import { createBarrierColliders, createStaticOBBCollider, type StaticCollider } from '../../vehicle/physics/CollisionSystem';
import { MountainRoute } from './MountainRoute';
import { MountainSurface, serviceDistance } from './MountainSurface';
import { MountainTerrain, MOUNTAIN_BOUNDS } from './MountainTerrain';

/** Handcrafted mountain loop. Terrain, contact and surfaces share a single authored road. */
export class MountainProvingGround implements DrivingGround {
  readonly root = new THREE.Group();
  readonly route = new MountainRoute();
  readonly surfaces = new MountainSurface(this.route);
  readonly terrain: MountainTerrain;
  readonly worldBounds = MOUNTAIN_BOUNDS;
  readonly spawnPose: TrackSpawnPose;
  readonly colliders: readonly StaticCollider[];
  readonly metadata;
  constructor(options: { shadows?: boolean; props?: boolean } = {}) {
    const shadows = options.shadows ?? true;
    this.terrain = new MountainTerrain(this.route, this.surfaces, shadows);
    this.metadata = Object.freeze({ id: 'mountain-proving-ground', version: 1,
      displayName: '山地 SUV 综合驾驶场', description: '连续山路：碎石、爬坡、山脊、雨蚀烂路、长下坡与湿土谷地。',
      routeLength: this.route.main.length, sections: this.route.main.sections,
      authoredBounds: { minX: -1024, maxX: 1024, minZ: -832, maxZ: 832 },
      minimumHeight: this.terrain.minimumHeight, maximumHeight: this.terrain.maximumHeight,
      technicalRoutes: this.route.branches.map(path => ({ id: path.id, length: path.length, connection: path.connection })),
    });
    const start = this.route.main.point(0);
    this.spawnPose = Object.freeze({ position: new THREE.Vector3(start.x, this.getRoadHeightAt(start.x, start.z) + 0.04, start.z),
      yawRadians: Math.atan2(-start.tx, -start.tz) });
    this.root.name = 'Mountain Proving Ground';
    this.root.userData.renderCategory = 'WORLD';
    this.root.userData.mapId = this.metadata.id;
    this.root.userData.routeMetadata = this.metadata;
    this.root.add(this.terrain.mesh, this.terrain.paving);
    const marking = new THREE.BufferGeometry();
    const arrow: number[] = [];
    for (const [x, z] of [[-14, 700], [-10, 701], [-10, 699]]) arrow.push(x!, this.getRoadHeightAt(x!, z!) + 0.006, z!);
    marking.setAttribute('position', new THREE.Float32BufferAttribute(arrow, 3)); marking.computeVertexNormals();
    const paint = new THREE.Mesh(marking, new THREE.MeshStandardMaterial({ color: 0xe6e2cf, roughness: 0.8,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    paint.name = 'Service area painted direction arrow'; this.root.add(paint);
    const colliders: StaticCollider[] = [];
    if (options.props ?? true) {
      this.buildEnvironment(shadows, colliders);
      this.buildSigns(shadows, colliders);
    }
    this.colliders = Object.freeze(colliders);
  }
  getRoadHeightAt(x: number, z: number): number { return this.terrain.heightAt(x, z); }
  getRoadPitchAt(x: number, z: number, yawRadians = 0): number {
    return Math.atan(this.sampleRoadSurface(x, z, { x: -Math.sin(yawRadians), y: -Math.cos(yawRadians) }).grade);
  }
  sampleRoadSurface(x: number, z: number, direction?: THREE.Vector2Like): RoadSurfaceSample {
    return { ...sampleGroundGeometry((sx, sz) => this.terrain.heightAt(sx, sz), x, z, direction),
      ...surfaceResponseAliases(this.surfaces.materialAt(x, z)) };
  }
  dispose(): void {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    this.root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
      if (object instanceof THREE.InstancedMesh) object.dispose();
    });
    for (const texture of textures) texture.dispose();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    this.root.clear();
  }
  private buildEnvironment(shadows: boolean, colliders: StaticCollider[]): void {
    const material = (color: number): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness: 1 });
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.23, 2.8, 6), material(0x5e4a35), 156);
    const trees = new THREE.InstancedMesh(new THREE.ConeGeometry(1.75, 4.4, 7), material(0x4b6040), 156);
    const shrubs = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.8, 0), material(0x67704b), 80);
    const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), material(0x8b897c), 96);
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.15, 0.9, 0.15), material(0x857256), 64);
    trunks.name = 'Mountain instanced trunks'; trees.name = 'Mountain sparse trees';
    shrubs.name = 'Mountain instanced shrubs'; rocks.name = 'Mountain roadside rocks'; posts.name = 'Ridge wooden posts';
    let seed = 0x5c8874;
    const random = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
    const dummy = new THREE.Object3D();
    const scatter = (count: number, clear: number, place: (i: number, x: number, y: number, z: number, scale: number) => void): void => {
      let placed = 0;
      for (let attempt = 0; placed < count && attempt < count * 80; attempt++) {
        const x = -1170 + random() * 2340, z = -990 + random() * 1980;
        const nearest = this.route.nearest(x, z);
        if (serviceDistance(x, z) < 16 || nearest && nearest.distance < nearest.route.width(nearest.s) / 2 + clear) continue;
        const scale = 0.7 + random() * 0.8;
        place(placed++, x, this.getRoadHeightAt(x, z), z, scale);
      }
      if (placed !== count) throw new Error('Unable to place mountain scenery with road clearance');
    };
    scatter(156, 12, (i, x, y, z, scale) => {
      // Thin, smaller vegetation above the exposed ridge.
      const size = scale * (y > 70 ? 0.65 : 1);
      dummy.rotation.set(0, random() * Math.PI * 2, 0); dummy.scale.setScalar(size);
      dummy.position.set(x, y + 1.4 * size, z); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.y = y + 3.8 * size; dummy.updateMatrix(); trees.setMatrixAt(i, dummy.matrix);
      colliders.push(createStaticOBBCollider({ id: `mountain-tree:${i}`, x, z, width: 0.4 * size, length: 0.4 * size,
        minHeight: y, maxHeight: y + 3 * size, type: 'obstacle' }));
    });
    scatter(80, 6, (i, x, y, z, scale) => {
      dummy.rotation.set(0, random() * Math.PI * 2, 0); dummy.scale.set(scale * 1.1, scale * 0.6, scale);
      dummy.position.set(x, y + scale * 0.35, z); dummy.updateMatrix(); shrubs.setMatrixAt(i, dummy.matrix);
    });
    scatter(96, 7, (i, x, y, z, scale) => {
      dummy.rotation.set(0.15, random() * Math.PI * 2, 0.12); dummy.scale.set(scale, scale * 0.65, scale * 0.8);
      dummy.position.set(x, y + scale * 0.3, z); dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix);
      colliders.push(createStaticOBBCollider({ id: `mountain-rock:${i}`, x, z, width: scale * 1.5, length: scale * 1.2,
        minHeight: y, maxHeight: y + scale, type: 'obstacle' }));
    });
    const ridge = this.route.main.section('ridge');
    for (let i = 0; i < 64; i++) {
      const p = this.route.main.point(ridge.start + 80 + (ridge.end - ridge.start - 160) * i / 63);
      const offset = this.route.main.width(p.s) / 2 + 1.25, x = p.x - p.tz * offset, z = p.z + p.tx * offset;
      const y = this.getRoadHeightAt(x, z);
      dummy.position.set(x, y + 0.45, z); dummy.rotation.set(0, Math.atan2(p.tx, p.tz), 0); dummy.scale.setScalar(1);
      dummy.updateMatrix(); posts.setMatrixAt(i, dummy.matrix);
      colliders.push(createStaticOBBCollider({ id: `mountain-post:${i}`, x, z, width: 0.15, length: 0.15,
        minHeight: y, maxHeight: y + 0.9, type: 'obstacle' }));
    }
    const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.2, 8), material(0x9a9b91), 8);
    rails.name = 'Occasional ridge guardrail';
    for (let i = 0; i < 8; i++) {
      const distance = ridge.start + (i < 4 ? 410 + i * 8 : 940 + (i - 4) * 8);
      const a = this.route.main.point(distance), b = this.route.main.point(distance + 8);
      const offset = 4.1;
      const x1 = a.x - a.tz * offset, z1 = a.z + a.tx * offset, x2 = b.x - b.tz * offset, z2 = b.z + b.tx * offset;
      const y1 = this.getRoadHeightAt(x1, z1), y2 = this.getRoadHeightAt(x2, z2);
      const start = new THREE.Vector3(x1, y1 + 0.65, z1), end = new THREE.Vector3(x2, y2 + 0.65, z2);
      const vector = end.clone().sub(start);
      dummy.position.copy(start).add(end).multiplyScalar(0.5);
      dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), vector.clone().normalize());
      dummy.scale.set(1, 1, vector.length() / 8); dummy.updateMatrix(); rails.setMatrixAt(i, dummy.matrix);
      colliders.push(...createBarrierColliders({ id: `mountain-rail:${i}`, start, end, thickness: 0.14,
        minHeight: Math.min(y1, y2) + 0.55, maxHeight: Math.max(y1, y2) + 0.75, type: 'guardrail' }));
    }
    for (const mesh of [trunks, trees, shrubs, rocks, posts, rails]) {
      mesh.instanceMatrix.needsUpdate = true; mesh.castShadow = shadows; mesh.receiveShadow = shadows;
      mesh.computeBoundingSphere(); this.root.add(mesh);
    }
  }
  private buildSigns(shadows: boolean, colliders: StaticCollider[]): void {
    const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x7b7563, roughness: 0.85 });
    const signs: Array<readonly [number, string]> = [[25, 'START'], [320, 'GRAVEL'],
      [this.route.main.section('ridge').start + 60, 'RIDGE'], [this.route.main.section('broken-dirt').start - 20, 'ROUGH ROAD'],
      [this.route.main.section('descent').start - 20, 'STEEP GRADE'],
      ...this.route.branches.map(path => [path.connection![0] - 12, 'TECHNICAL ROUTE'] as const)];
    for (const [s, label] of signs) {
      const p = this.route.main.point(s), offset = this.route.main.width(s) / 2 + 2;
      const x = p.x + p.tz * offset, z = p.z - p.tx * offset, y = this.getRoadHeightAt(x, z);
      const group = new THREE.Group(); group.name = `Mountain sign: ${label}`;
      group.position.set(x, y, z); group.rotation.y = Math.atan2(-p.tx, -p.tz);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 2.3, 6), poleMaterial);
      pole.position.y = 1.15; pole.castShadow = shadows;
      const material = new THREE.MeshStandardMaterial({ color: 0xd5c69c, roughness: 0.85 });
      if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 160;
        const context = canvas.getContext('2d');
        if (context) {
          context.fillStyle = '#d5c69c'; context.fillRect(0, 0, 512, 160);
          context.fillStyle = '#373d31'; context.font = 'bold 40px sans-serif'; context.textAlign = 'center';
          context.textBaseline = 'middle'; context.fillText(label, 256, 80, 470);
          const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
          material.map = texture; material.color.set(0xffffff);
        }
      }
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.6, 0.075), material); board.position.y = 2.12;
      group.add(pole, board); this.root.add(group);
      colliders.push(createStaticOBBCollider({ id: `mountain-sign:${s}`, x, z, width: 0.15, length: 0.15,
        minHeight: y, maxHeight: y + 2.4, type: 'obstacle' }));
    }
  }
}
