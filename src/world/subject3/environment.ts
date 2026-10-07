import * as THREE from 'three';
import type { Subject3AreaModule, Subject3BuildContext } from './BuildContext';
import { makeBox } from './geometry';
import { createBarrierColliders, createStaticOBBCollider } from '../../vehicle/physics/CollisionSystem';
import { SUBJECT3_PLACES } from './Subject3GroundConfig';
import { addLabelBoard } from './signs';
import type { Subject3Point2 } from './math';
import { createModuleRoot } from './roads';

interface LampInstance {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
}

interface TreeInstance {
  readonly x: number;
  readonly z: number;
  readonly scale: number;
}

interface BuildingBlock {
  readonly centre: Subject3Point2;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly material: 'light' | 'warm' | 'cool';
}

/** Low-poly block buildings; every rectangle sits inside one authored block. */
const BUILDING_BLOCKS: readonly BuildingBlock[] = Object.freeze([
  { centre: { x: -180, z: -170 }, width: 55, depth: 28, height: 12, material: 'light' },
  { centre: { x: -95, z: -180 }, width: 48, depth: 32, height: 9, material: 'warm' },
  { centre: { x: 110, z: -160 }, width: 50, depth: 32, height: 12, material: 'cool' },
  { centre: { x: 220, z: -160 }, width: 42, depth: 28, height: 15, material: 'light' },
  { centre: { x: -330, z: -170 }, width: 30, depth: 28, height: 10, material: 'warm' },
  { centre: { x: -332, z: 160 }, width: 30, depth: 28, height: 11, material: 'cool' },
  { centre: { x: 330, z: 150 }, width: 34, depth: 28, height: 12, material: 'light' },
  { centre: { x: -110, z: 180 }, width: 44, depth: 28, height: 10, material: 'warm' },
  { centre: { x: -205, z: 170 }, width: 48, depth: 30, height: 12, material: 'light' },
  { centre: { x: 220, z: 215 }, width: 36, depth: 24, height: 12, material: 'cool' },
  { centre: { x: 75, z: 335 }, width: 42, depth: 28, height: 10, material: 'warm' },
  { centre: { x: 225, z: 345 }, width: 48, depth: 30, height: 11, material: 'light' },
  { centre: { x: -125, z: -340 }, width: 48, depth: 28, height: 12, material: 'cool' },
]);

export const SUBJECT3_BUILDING_BLOCKS = BUILDING_BLOCKS;

/**
 * Street environment: kerbside lighting, street trees, low-poly block
 * buildings, a small walled park, planters and roadside direction signs. All
 * repeated furniture is instanced so the map stays cheap to draw.
 */
export class Subject3Environment implements Subject3AreaModule {
  public readonly root = createModuleRoot('Subject 3 environment');

  public constructor(private readonly context: Subject3BuildContext) {
    this.buildLamps();
    this.buildTrees();
    this.buildBuildings();
    this.buildPark();
    this.buildPlanters();
    this.buildDirectionSigns();
  }

  /** Rejects furniture that would land on asphalt, in a junction or on a landmark. */
  private isClear(x: number, z: number, clearance: number): boolean {
    const { surfaces, topology, config } = this.context;
    if (Math.abs(x) > config.site.length / 2 - 5 || Math.abs(z) > config.site.width / 2 - 5) return false;
    if (surfaces.distanceFromAsphalt(x, z) < clearance) return false;
    // Street furniture belongs ON the sidewalk; do not reject all pavement.
    for (const j of topology.junctions) {
      if (Math.abs(x - j.center.x) < j.halfExtentX + 10 && Math.abs(z - j.center.z) < j.halfExtentZ + 10) return false;
    }
    const { school: s, bus: b, supermarket: shop, northDome: n } = SUBJECT3_PLACES;
    if (x > s.minimumX - 3 && x < s.maximumX + 3 && z > s.minimumZ - 3 && z < s.maximumZ + 5) return false;
    if (Math.abs(x - b.x) < 4 && Math.abs(z - b.z) < b.length / 2 + 7) return false;
    const f = shop.forecourt;
    if (x > f.minimumX - 2 && x < f.maximumX + 2 && z > f.minimumZ - 2 && z < f.maximumZ + 2) return false;
    if (Math.abs(x - n.x) < 35 && Math.abs(z - n.z) < 28) return false;
    if (BUILDING_BLOCKS.some((block) => Math.abs(x - block.centre.x) < block.width / 2 + 2
      && Math.abs(z - block.centre.z) < block.depth / 2 + 2)) return false;
    // Leave school warning boards and the parking driveway readable.
    if (z > 40 && z < 62 && x > -220 && x < -120) return false;
    return true;
  }

  private buildLamps(): void {
    const { config, materials, heightAt, shadows, topology } = this.context;
    const spacing = config.environment.lampSpacing;
    const instances: LampInstance[] = [];
    for (const segment of topology.segments) {
      const side = segment.id.charCodeAt(0) % 2 === 0 ? 1 : -1;
      const offset = segment.width * 0.5 + config.environment.sidewalkWidth * 0.6;
      const lamps = Math.max(2, Math.floor(segment.length / spacing));
      for (let index = 0; index <= lamps; index += 1) {
        const distance = segment.length * index / lamps;
        const sample = sampleAt(segment.centerline, distance);
        if (sample === null) continue;
        const rightX = -sample.tangent.z * side;
        const rightZ = sample.tangent.x * side;
        const x = sample.point.x + rightX * offset;
        const z = sample.point.z + rightZ * offset;
        if (!this.isClear(x, z, 0.35)) continue;
        instances.push({ x, z, yaw: Math.atan2(rightX, rightZ) });
      }
    }
    const poleGeometry = new THREE.CylinderGeometry(0.07, 0.11, 7.4, 8);
    const poles = new THREE.InstancedMesh(poleGeometry, materials.darkMetal, instances.length);
    poles.name = '路灯灯杆';
    poles.castShadow = shadows;
    const armGeometry = new THREE.BoxGeometry(0.14, 0.12, 1.5);
    const arms = new THREE.InstancedMesh(armGeometry, materials.darkMetal, instances.length);
    arms.name = '路灯悬臂';
    arms.castShadow = shadows;
    const headGeometry = new THREE.BoxGeometry(0.36, 0.16, 0.72);
    const heads = new THREE.InstancedMesh(headGeometry, materials.lampHead, instances.length);
    heads.name = '路灯灯头';
    heads.castShadow = shadows;
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Matrix4();
    const offsetMatrix = new THREE.Matrix4();
    instances.forEach((lamp, index) => {
      rotation.makeRotationY(lamp.yaw);
      matrix.makeTranslation(lamp.x, 3.7 + heightAt(lamp.x, lamp.z), lamp.z);
      poles.setMatrixAt(index, matrix);
      offsetMatrix.makeTranslation(0, 7.25, -0.7);
      arms.setMatrixAt(index, rotation.clone().multiply(offsetMatrix).premultiply(
        new THREE.Matrix4().makeTranslation(lamp.x, heightAt(lamp.x, lamp.z), lamp.z),
      ));
      offsetMatrix.makeTranslation(0, 7.16, -1.35);
      heads.setMatrixAt(index, rotation.clone().multiply(offsetMatrix).premultiply(
        new THREE.Matrix4().makeTranslation(lamp.x, heightAt(lamp.x, lamp.z), lamp.z),
      ));
    });
    poles.instanceMatrix.needsUpdate = true;
    arms.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    if (instances.length > 0) this.root.add(poles, arms, heads);
  }

  private buildTrees(): void {
    const { config, materials, heightAt, shadows, topology } = this.context;
    const spacing = config.environment.treeSpacing;
    const instances: TreeInstance[] = [];
    for (const segment of topology.segments) {
      const side = segment.id.length % 2 === 0 ? -1 : 1;
      const offset = segment.width * 0.5 + config.environment.sidewalkWidth * 1.15;
      const count = Math.max(1, Math.floor(segment.length / spacing));
      for (let index = 0; index <= count; index += 1) {
        const distance = segment.length * (index + 0.5) / (count + 1);
        const sample = sampleAt(segment.centerline, distance);
        if (sample === null) continue;
        const rightX = -sample.tangent.z * side;
        const rightZ = sample.tangent.x * side;
        const x = sample.point.x + rightX * offset;
        const z = sample.point.z + rightZ * offset;
        if (!this.isClear(x, z, 0.5)) continue;
        instances.push({ x, z, scale: 1 + ((index * 37) % 7) * 0.045 });
      }
    }
    for (const [x, z] of [[78, 125], [102, 125], [126, 125], [80, 177], [105, 181], [127, 176]] as const) {
      if (this.isClear(x, z, 0.4)) instances.push({ x, z, scale: 1 });
    }
    if (instances.length === 0) return;
    const trunkGeometry = new THREE.CylinderGeometry(0.19, 0.25, 2.6, 7);
    const trunks = new THREE.InstancedMesh(trunkGeometry, materials.trunk, instances.length);
    trunks.name = '行道树树干';
    trunks.castShadow = shadows;
    const crownGeometry = new THREE.SphereGeometry(1.45, 9, 7);
    const crowns = new THREE.InstancedMesh(crownGeometry, materials.foliage, instances.length);
    crowns.name = '行道树树冠';
    crowns.castShadow = shadows;
    const matrix = new THREE.Matrix4();
    instances.forEach((tree, index) => {
      const base = heightAt(tree.x, tree.z);
      matrix.makeScale(tree.scale, tree.scale, tree.scale);
      matrix.setPosition(tree.x, base + 1.3 * tree.scale, tree.z);
      trunks.setMatrixAt(index, matrix);
      matrix.makeScale(tree.scale, tree.scale * 1.15, tree.scale);
      matrix.setPosition(tree.x, base + 3.35 * tree.scale, tree.z);
      crowns.setMatrixAt(index, matrix);
    });
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    this.root.add(trunks, crowns);
  }

  private buildBuildings(): void {
    const { materials, heightAt, shadows } = this.context;
    const palette = {
      light: materials.buildingLight,
      warm: materials.buildingWarm,
      cool: materials.buildingCool,
    } as const;
    for (const block of BUILDING_BLOCKS) {
      const base = heightAt(block.centre.x, block.centre.z);
      this.root.add(
        makeBox(
          '街区楼房',
          [block.width, block.height, block.depth],
          [block.centre.x, base + block.height * 0.5, block.centre.z],
          palette[block.material],
          shadows,
        ),
        makeBox(
          '街区楼房屋顶',
          [block.width + 0.8, 0.4, block.depth + 0.8],
          [block.centre.x, base + block.height + 0.2, block.centre.z],
          materials.roof,
          shadows,
        ),
      );
      for (let index = 0; index < 5; index += 1) {
        const offset = (index - 2) * (block.width / 6);
        this.root.add(makeBox(
          '街区楼房窗带',
          [block.width / 8, 1.3, 0.1],
          [block.centre.x + offset, base + block.height * 0.62, block.centre.z + block.depth * 0.5 + 0.06],
          materials.glassDark,
          false,
        ));
      }
      this.context.colliders.push(createStaticOBBCollider({
        id: `subject3-block-building:${block.centre.x}:${block.centre.z}`,
        x: block.centre.x, z: block.centre.z, width: block.width, length: block.depth,
        minHeight: 0, maxHeight: block.height, type: 'building',
      }));
    }
  }

  private buildPark(): void {
    const { materials, heightAt, shadows } = this.context;
    const { minimumX, maximumX, minimumZ, maximumZ } = SUBJECT3_PLACES.park;
    const lawn = new THREE.Mesh(
      new THREE.PlaneGeometry(maximumX - minimumX, maximumZ - minimumZ),
      materials.grass,
    );
    lawn.name = '街区绿地';
    lawn.rotation.x = -Math.PI * 0.5;
    lawn.position.set(
      (minimumX + maximumX) * 0.5,
      heightAt((minimumX + maximumX) * 0.5, (minimumZ + maximumZ) * 0.5) + 0.03,
      (minimumZ + maximumZ) * 0.5,
    );
    lawn.receiveShadow = shadows;
    this.root.add(lawn);
    const railHeight = 0.95;
    const corners: Subject3Point2[] = [
      { x: minimumX, z: minimumZ }, { x: maximumX, z: minimumZ },
      { x: maximumX, z: maximumZ }, { x: minimumX, z: maximumZ },
    ];
    for (let index = 0; index < corners.length; index += 1) {
      const start = corners[index]!;
      const end = corners[(index + 1) % corners.length]!;
      const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.z - start.z);
      const length = Math.hypot(end.x - start.x, end.z - start.z);
      this.root.add(makeBox(
        '绿地围栏',
        horizontal ? [length, 0.1, 0.1] : [0.1, 0.1, length],
        [(start.x + end.x) * 0.5, railHeight, (start.z + end.z) * 0.5],
        materials.metal,
        shadows,
      ));
      this.context.colliders.push(...createBarrierColliders({
        id: `subject3-park-fence:${index}`, start, end, thickness: 0.12,
        minHeight: 0, maxHeight: railHeight + 0.1, type: 'wall',
      }));
    }
  }

  private buildPlanters(): void {
    const { materials, heightAt, shadows } = this.context;
    const planters = [
      [80, -70], [116, -70], [152, -70], [188, -70],
      [-92, 59], [-56, 59], [-250, -290], [-180, -290],
    ] as const;
    for (const [x, z] of planters) {
      if (!this.isClear(x, z, 1.2)) continue;
      this.root.add(makeBox(
        '绿化花坛',
        [3.2, 0.36, 1.1],
        [x, heightAt(x, z) + 0.18, z],
        materials.curb,
        shadows,
      ));
      this.root.add(makeBox(
        '花坛绿植',
        [2.9, 0.3, 0.85],
        [x, heightAt(x, z) + 0.5, z],
        materials.foliage,
        shadows,
      ));
    }
  }

  private buildDirectionSigns(): void {
    const { context } = this;
    const { materials } = context;
    const signs = [
      { x: -270.9, z: 140, yaw: 0, text: '↑ 北侧主路\n→ 学校 / 展览馆' },
      { x: -289.1, z: -180, yaw: Math.PI, text: '↑ 商业街\n← 学校路' },
      { x: 274.5, z: 160, yaw: Math.PI, text: '↑ 商业街\n邻里超市' },
      { x: 285.5, z: -140, yaw: 0, text: '↑ 展览馆路\n← 中央内街' },
    ];
    for (const sign of signs) {
      addLabelBoard(this.root, context, '道路方向牌', sign.text, '#1f5ba6', materials.signBlue,
        sign, sign.yaw, [2.4, 1.1], 2.8);
    }
    for (const sign of [
      { x: -270.9, z: 180, yaw: 0 }, { x: -289.1, z: -230, yaw: Math.PI },
      { x: 274.5, z: 200, yaw: Math.PI }, { x: 285.5, z: -230, yaw: 0 },
    ]) {
      addLabelBoard(this.root, context, '主路限速50', '50', '#ffffff', materials.signWhite,
        sign, sign.yaw, [0.85, 0.85], 2.35, 'speed');
    }
    addLabelBoard(this.root, context, '窄街会车提示', '窄路会车\n限速 30', '#e6b439', materials.signYellow,
      { x: 5.3, z: -240 }, 0, [1.5, 1.0], 2.3);
  }
}

interface PolylineSampleResult {
  readonly point: Subject3Point2;
  readonly tangent: Subject3Point2;
}

const sampleAt = (
  points: readonly Subject3Point2[],
  targetDistance: number,
): PolylineSampleResult | null => {
  if (points.length < 2) return null;
  let travelled = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]!;
    const end = points[index]!;
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dz);
    if (length < 1e-9) continue;
    if (travelled + length >= targetDistance) {
      const t = (targetDistance - travelled) / length;
      return {
        point: { x: start.x + dx * t, z: start.z + dz * t },
        tangent: { x: dx / length, z: dz / length },
      };
    }
    travelled += length;
  }
  return null;
};

export interface Subject3EnvironmentModule {
  readonly root: THREE.Group;
}
