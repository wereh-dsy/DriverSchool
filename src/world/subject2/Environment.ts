import * as THREE from 'three';
import type { Subject2AreaModule, Subject2BuildContext } from './BuildContext';
import { createModuleRoot } from './areaHelpers';
import { makeBox } from './geometry';
import type { Subject2Point2 } from './Subject2GroundConfig';
import {
  createBarrierColliders,
  createStaticOBBCollider,
  type StaticCollider,
} from '../../vehicle/physics/CollisionSystem';

const makeLabelMaterial = (
  text: string,
  fallback: THREE.Material,
): THREE.Material => {
  if (typeof document === 'undefined') return fallback;
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 240;
  const drawing = canvas.getContext('2d');
  if (!drawing) return fallback;
  drawing.fillStyle = '#185ca8';
  drawing.fillRect(0, 0, canvas.width, canvas.height);
  drawing.strokeStyle = '#f0f3e9';
  drawing.lineWidth = 14;
  drawing.strokeRect(9, 9, canvas.width - 18, canvas.height - 18);
  drawing.fillStyle = '#ffffff';
  drawing.font = '700 68px "Microsoft YaHei", sans-serif';
  drawing.textAlign = 'center';
  drawing.textBaseline = 'middle';
  drawing.fillText(text, canvas.width * 0.5, canvas.height * 0.5);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
};

const addProjectSign = (
  root: THREE.Group,
  context: Subject2BuildContext,
  name: string,
  label: string,
  position: Subject2Point2,
  yawRadians = 0,
): void => {
  const sign = new THREE.Group();
  sign.name = name;
  sign.position.set(position.x, context.heightAt(position.x, position.z), position.z);
  sign.rotation.y = yawRadians;
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.07, 1.75, 8),
    context.materials.darkMetal,
  );
  pole.position.y = 0.875;
  pole.castShadow = context.shadows;
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(2.55, 0.92, 0.075),
    makeLabelMaterial(label, context.materials.signBlue),
  );
  board.position.y = 1.72;
  board.castShadow = context.shadows;
  sign.add(pole, board);
  root.add(sign);
};

const addTree = (
  root: THREE.Group,
  context: Subject2BuildContext,
  x: number,
  z: number,
  scale: number,
): void => {
  const tree = new THREE.Group();
  tree.name = 'Sparse perimeter tree';
  tree.position.set(x, 0, z);
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18 * scale, 0.24 * scale, 2.2 * scale, 8),
    context.materials.trunk,
  );
  trunk.position.y = 1.1 * scale;
  trunk.castShadow = context.shadows;
  const crown = new THREE.Mesh(
    new THREE.SphereGeometry(1.15 * scale, 10, 7),
    context.materials.foliage,
  );
  crown.scale.y = 1.18;
  crown.position.y = 2.85 * scale;
  crown.castShadow = context.shadows;
  tree.add(trunk, crown);
  root.add(tree);
};

const addLamp = (
  root: THREE.Group,
  context: Subject2BuildContext,
  x: number,
  z: number,
): void => {
  const lamp = new THREE.Group();
  lamp.name = 'Training-ground lamp';
  lamp.position.set(x, 0, z);
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.075, 5.2, 8),
    context.materials.darkMetal,
  );
  pole.position.y = 2.6;
  pole.castShadow = context.shadows;
  const head = makeBox(
    'Lamp head',
    [0.78, 0.14, 0.28],
    [0.25, 5.12, 0],
    context.materials.metal,
    context.shadows,
  );
  head.userData.environmentLamp = true;
  lamp.add(pole, head);
  root.add(lamp);
};

const addParkedCar = (
  root: THREE.Group,
  context: Subject2BuildContext,
  x: number,
  z: number,
  material: THREE.Material,
): void => {
  const car = new THREE.Group();
  car.name = 'Static training car';
  car.position.set(x, 0, z);
  const body = makeBox('Static car body', [1.72, 0.62, 4.35], [0, 0.54, 0], material, context.shadows);
  const cabin = makeBox('Static car cabin', [1.5, 0.58, 2.05], [0, 1.04, -0.1], material, context.shadows);
  const wheelGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.18, 12);
  wheelGeometry.rotateZ(Math.PI * 0.5);
  for (const wheelX of [-0.88, 0.88]) {
    for (const wheelZ of [-1.38, 1.38]) {
      const wheel = new THREE.Mesh(wheelGeometry, context.materials.tyre);
      wheel.position.set(wheelX, 0.31, wheelZ);
      wheel.castShadow = context.shadows;
      car.add(wheel);
    }
  }
  car.add(body, cabin);
  root.add(car);
};

export class Environment implements Subject2AreaModule {
  public readonly root = createModuleRoot('Subject 2 environment');
  public readonly colliders: StaticCollider[] = [];

  public constructor(context: Subject2BuildContext) {
    this.buildFence(context);
    this.buildBuildings(context);
    this.buildFurniture(context);
    this.buildSigns(context);
    this.root.userData.gameplayLogic = false;
  }

  private buildFence(context: Subject2BuildContext): void {
    const halfLength = context.config.site.length * 0.5;
    const halfWidth = context.config.site.width * 0.5;
    const railHeight = [0.52, 1.08] as const;
    const fenceCorners = [
      { x: -halfLength, z: -halfWidth }, { x: halfLength, z: -halfWidth },
      { x: halfLength, z: halfWidth }, { x: -halfLength, z: halfWidth },
    ];
    for (let index = 0; index < fenceCorners.length; index += 1) {
      this.colliders.push(...createBarrierColliders({
        id: `subject2-perimeter:${index}`,
        start: fenceCorners[index]!, end: fenceCorners[(index + 1) % fenceCorners.length]!,
        thickness: 0.055, minHeight: 0, maxHeight: 1.25, type: 'guardrail',
      }));
    }
    for (const y of railHeight) {
      this.root.add(
        makeBox('North perimeter fence rail', [context.config.site.length, 0.055, 0.055], [0, y, -halfWidth], context.materials.metal, context.shadows),
        makeBox('South perimeter fence rail', [context.config.site.length, 0.055, 0.055], [0, y, halfWidth], context.materials.metal, context.shadows),
        makeBox('West perimeter fence rail', [0.055, 0.055, context.config.site.width], [-halfLength, y, 0], context.materials.metal, context.shadows),
        makeBox('East perimeter fence rail', [0.055, 0.055, context.config.site.width], [halfLength, y, 0], context.materials.metal, context.shadows),
      );
    }

    const posts: Subject2Point2[] = [];
    for (let x = -halfLength; x <= halfLength + 0.01; x += 5.5) {
      posts.push({ x: Math.min(x, halfLength), z: -halfWidth }, { x: Math.min(x, halfLength), z: halfWidth });
    }
    for (let z = -halfWidth + 5.5; z < halfWidth; z += 5.5) {
      posts.push({ x: -halfLength, z }, { x: halfLength, z });
    }
    const postGeometry = new THREE.CylinderGeometry(0.04, 0.055, 1.25, 7);
    const postInstances = new THREE.InstancedMesh(postGeometry, context.materials.darkMetal, posts.length);
    postInstances.name = 'Perimeter fence posts';
    postInstances.castShadow = context.shadows;
    const matrix = new THREE.Matrix4();
    posts.forEach((point, index) => {
      matrix.makeTranslation(point.x, 0.625, point.z);
      postInstances.setMatrixAt(index, matrix);
    });
    postInstances.instanceMatrix.needsUpdate = true;
    this.root.add(postInstances);
  }

  private buildBuildings(context: Subject2BuildContext): void {
    this.colliders.push(createStaticOBBCollider({
      id: 'subject2-office', x: -71, z: 25.4, width: 16, length: 7,
      minHeight: 0, maxHeight: 3.3, type: 'building',
    }));
    this.root.add(
      makeBox('Driving school office', [16, 3.3, 7], [-71, 1.65, 25.4], context.materials.wall, context.shadows),
      makeBox('Driving school office roof', [16.8, 0.32, 7.8], [-71, 3.42, 25.4], context.materials.roof, context.shadows),
    );
    for (const x of [-76, -71, -66]) {
      this.root.add(makeBox('Office window', [2.1, 1.05, 0.07], [x, 1.9, 21.87], context.materials.glass, false));
    }

    const shelter = new THREE.Group();
    shelter.name = 'Waiting shelter';
    for (const x of [-61.7, -55.3]) {
      for (const z of [27, 30]) {
        shelter.add(makeBox('Waiting shelter post', [0.09, 2.4, 0.09], [x, 1.2, z], context.materials.darkMetal, context.shadows));
        this.colliders.push(createStaticOBBCollider({
          id: `subject2-shelter-post:${x}:${z}`, x, z, width: 0.09, length: 0.09,
          minHeight: 0, maxHeight: 2.4, type: 'obstacle',
        }));
      }
    }
    shelter.add(
      makeBox('Waiting shelter roof', [7.2, 0.18, 3.8], [-58.5, 2.5, 28.5], context.materials.shelterRoof, context.shadows),
      makeBox('Waiting shelter bench', [4.6, 0.16, 0.52], [-58.5, 0.52, 28.8], context.materials.wall, context.shadows),
    );
    this.root.add(shelter);
    this.colliders.push(createStaticOBBCollider({
      id: 'subject2-shelter-bench', x: -58.5, z: 28.8, width: 4.6, length: 0.52,
      minHeight: 0.44, maxHeight: 0.6, type: 'obstacle',
    }));
  }

  private buildFurniture(context: Subject2BuildContext): void {
    const treePositions = [
      [-83, -43, 0.9], [-67, -48, 1.05], [-8, -48, 0.88], [18, -47, 1],
      [44, -45, 0.92], [73, -39, 1.05], [82, -17, 0.9], [82, 5, 1.03],
      [82, 44, 0.94], [55, 49, 0.9], [5, 49, 0.96], [-43, 51, 0.86],
    ] as const;
    for (const [x, z, scale] of treePositions) addTree(this.root, context, x, z, scale);

    const lamps = [
      [-49, 36], [-5, 30], [55, 39], [72, 8], [32, -9], [-29, -5], [-50, -25], [-8, -38],
    ] as const;
    for (const [x, z] of lamps) addLamp(this.root, context, x, z);

    const waiting = context.config.layout.waitingCenter;
    const parkingCenterZ = waiting.z + context.config.waitingArea.width * 0.5
      - context.config.waitingArea.parkingSpaceLength * 0.5;
    addParkedCar(this.root, context, waiting.x - 5.4, parkingCenterZ, context.materials.carWhite);
    addParkedCar(this.root, context, waiting.x + 5.4, parkingCenterZ, context.materials.carBlue);
  }

  private buildSigns(context: Subject2BuildContext): void {
    const signs = [
      ['Waiting-area sign', '候考区 / 起点', { x: -78, z: 30.3 }, 0],
      ['Reverse-parking sign', '倒车入库', { x: -35, z: 14.2 }, 0],
      ['Side-parking sign', '侧方停车', { x: 25, z: 27.5 }, 0],
      ['Right-angle sign', '直角转弯', { x: 72, z: 17 }, Math.PI * 0.5],
      ['Curve-driving sign', '曲线行驶', { x: 18, z: 3.2 }, 0],
      ['Hill-start sign', '坡道起步', { x: -48, z: -12 }, Math.PI * 0.5],
      ['Finish-area sign', '训练结束 / 返回区', { x: -27, z: -37.2 }, Math.PI],
    ] as const;
    for (const [name, label, position, yaw] of signs) {
      addProjectSign(this.root, context, name, label, position, yaw);
    }
  }
}
