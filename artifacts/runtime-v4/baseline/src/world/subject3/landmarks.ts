import * as THREE from 'three';
import { createBarrierColliders, createStaticOBBCollider } from '../../vehicle/physics/CollisionSystem';
import type { Subject3AreaModule, Subject3BuildContext } from './BuildContext';
import { makeBox, makeMarkingRectangle } from './geometry';
import { SUBJECT3_PLACES, type Subject3Point2 } from './Subject3GroundConfig';
import { createModuleRoot } from './roads';
import { addLabelBoard } from './signs';

/** Only authored landmarks and their static solids; no examination behaviour. */
export class Subject3Landmarks implements Subject3AreaModule {
  public readonly root = createModuleRoot('Subject 3 landmarks');
  public constructor(private readonly context: Subject3BuildContext) {
    this.root.userData.landmarks = [];
    this.buildSchool();
    this.buildBusStop();
    this.buildCommercialArea();
    this.buildNorthLandmark();
  }

  private pave(name: string, x: number, z: number, width: number, depth: number): void {
    const { materials, heightAt, shadows, surfaces } = this.context;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), materials.sidewalk);
    mesh.name = name;
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, heightAt(x, z) + 0.024, z);
    mesh.receiveShadow = shadows;
    this.root.add(mesh);
    surfaces.addPavementRectangle(x, z, width, depth);
  }

  private buildSchool(): void {
    const { context } = this;
    const { materials, shadows } = context;
    const s = SUBJECT3_PLACES.school;
    this.pave('学校院落', (s.minimumX + s.maximumX) / 2, (s.minimumZ + s.maximumZ) / 2,
      s.maximumX - s.minimumX, s.maximumZ - s.minimumZ);
    this.pave('校门步行入口', s.gateX, 41.4, 14, 2.8);
    const buildings = [
      { x: -198, z: -18, width: 44, depth: 16, height: 11 },
      { x: -138, z: -14, width: 32, depth: 14, height: 8.5 },
    ];
    buildings.forEach((b, index) => {
      this.root.add(
        makeBox('学校教学楼', [b.width, b.height, b.depth], [b.x, b.height / 2, b.z],
          index ? materials.buildingWarm : materials.buildingLight, shadows),
        makeBox('学校教学楼屋顶', [b.width + 0.6, 0.4, b.depth + 0.6],
          [b.x, b.height + 0.2, b.z], materials.roof, shadows),
      );
      for (const y of [2.8, 6]) for (let column = 0; column < 6; column += 1) {
        this.root.add(makeBox('教学楼窗', [2.7, 1.5, 0.08],
          [b.x + (column - 2.5) * b.width / 7, y, b.z + b.depth / 2 + 0.06], materials.glass, false));
      }
      context.colliders.push(createStaticOBBCollider({
        id: `subject3-school-building:${index}`, x: b.x, z: b.z, width: b.width,
        length: b.depth, minHeight: 0, maxHeight: b.height, type: 'building',
      }));
    });

    const walls: readonly (readonly [Subject3Point2, Subject3Point2])[] = [
      [{ x: s.minimumX, z: s.minimumZ }, { x: s.maximumX, z: s.minimumZ }],
      [{ x: s.minimumX, z: s.minimumZ }, { x: s.minimumX, z: s.maximumZ }],
      [{ x: s.maximumX, z: s.minimumZ }, { x: s.maximumX, z: s.maximumZ }],
      [{ x: s.minimumX, z: s.maximumZ }, { x: s.gateX - 7, z: s.maximumZ }],
      [{ x: s.gateX + 7, z: s.maximumZ }, { x: s.maximumX, z: s.maximumZ }],
    ];
    walls.forEach(([a, b], index) => {
      const horizontal = a.z === b.z;
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      this.root.add(makeBox('学校围墙', horizontal ? [length, 1.9, 0.3] : [0.3, 1.9, length],
        [(a.x + b.x) / 2, 0.95, (a.z + b.z) / 2], materials.wall, shadows));
      context.colliders.push(...createBarrierColliders({
        id: `subject3-school-wall:${index}`, start: a, end: b, thickness: 0.3,
        minHeight: 0, maxHeight: 1.9, type: 'wall',
      }));
    });
    for (const offset of [-7, 7]) {
      this.root.add(makeBox('校门柱', [0.9, 3.9, 0.9], [s.gateX + offset, 1.95, s.maximumZ],
        materials.buildingLight, shadows));
    }
    this.root.add(makeBox('校门横梁', [15, 0.55, 0.7], [s.gateX, 3.65, s.maximumZ], materials.buildingLight, shadows));
    const board = addLabelBoard(this.root, context, '校门学校标识', '阳光学校', '#1f5ba6', materials.signBlue,
      { x: s.gateX, z: s.maximumZ + 0.4 }, 0, [5.8, 0.85], 3.35);
    board.children[0]!.visible = false;
    for (const x of [-215, -195, -145, -125]) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 2.6, 8), materials.trunk);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(1.5, 9, 7), materials.foliage);
      trunk.position.set(x, 1.3, 27);
      crown.position.set(x, 3.4, 27);
      trunk.castShadow = crown.castShadow = shadows;
      this.root.add(trunk, crown);
    }
    const schoolRoad = context.topology.segments.find((road) => road.id === 'middle-west')!;
    const schoolCrossingStripes = Math.floor(schoolRoad.width / 0.86);
    for (let i = 0; i < schoolCrossingStripes; i += 1) {
      const stripe = makeMarkingRectangle('校门前人行横道',
        { x: s.gateX, z: 50 + (i - (schoolCrossingStripes - 1) / 2) * 0.86 }, -Math.PI / 2, 0.45, 3.2,
        materials.whitePaint, context.heightAt, context.config.markings.surfaceClearance);
      if (stripe) this.root.add(stripe);
    }
    const schoolSignOffset = schoolRoad.width / 2 + context.config.environment.sidewalkWidth * 0.55;
    for (const [x, z, yaw] of [[-214, 50 + schoolSignOffset, -Math.PI / 2], [-127, 50 - schoolSignOffset, Math.PI / 2]]) {
      addLabelBoard(this.root, context, '学校区域警示', '学校区域\n注意儿童', '#e6b439', materials.signYellow,
        { x: x!, z: z! }, yaw!, [2.1, 1.1], 2.2);
      addLabelBoard(this.root, context, '学校限速30', '30', '#ffffff', materials.signWhite,
        { x: x! + (yaw! < 0 ? 5 : -5), z: z! }, yaw!, [0.8, 0.8], 2.2, 'speed');
    }
    this.root.userData.landmarks.push({ id: 'school', center: { x: s.gateX, z: s.maximumZ } });
  }

  private buildBusStop(): void {
    const { context } = this;
    const { materials, shadows, surfaces } = context;
    const b = SUBJECT3_PLACES.bus;
    this.root.add(makeBox('公交站站台', [b.width, 0.14, b.length], [b.x, 0.21, b.z], materials.sidewalk, shadows));
    surfaces.addPavementRectangle(b.x, b.z, b.width, b.length);
    for (const dx of [-1, 1]) for (const dz of [-2.7, 2.7]) {
      this.root.add(makeBox('公交候车亭立柱', [0.12, 2.5, 0.12], [b.x + dx, 1.4, b.z + dz],
        materials.darkMetal, shadows));
    }
    this.root.add(
      makeBox('公交候车亭顶棚', [2.8, 0.16, 6.2], [b.x, 2.75, b.z], materials.shelterRoof, shadows),
      makeBox('公交候车亭背板', [0.1, 1.7, 5.8], [b.x + 1.25, 1.2, b.z], materials.glass, false),
      makeBox('公交候车亭座椅', [0.45, 0.14, 4.7], [b.x + 0.8, 0.65, b.z], materials.buildingWarm, shadows),
    );
    const line = makeMarkingRectangle('公交停靠边线', { x: -273.25, z: b.z }, 0, 0.12, b.length,
      materials.yellowPaint, context.heightAt, context.config.markings.surfaceClearance);
    if (line) this.root.add(line);
    for (const z of [b.z - b.length / 2, b.z + b.length / 2]) {
      const end = makeMarkingRectangle('公交停靠端线', { x: -274.2, z }, 0, 2.1, 0.12,
        materials.yellowPaint, context.heightAt, context.config.markings.surfaceClearance);
      if (end) this.root.add(end);
    }
    addLabelBoard(this.root, context, '公交站牌', '公交站\n学校路口', '#1f5ba6', materials.signBlue,
      { x: b.x, z: b.z - 10 }, 0, [1.5, 1.2], 2.25);
    this.root.userData.landmarks.push({ id: 'bus-stop', center: { x: b.x, z: b.z } });
  }

  private buildCommercialArea(): void {
    const { context } = this;
    const { materials, shadows } = context;
    const b = SUBJECT3_PLACES.supermarket, f = b.forecourt;
    this.pave('超市停车场', (f.minimumX + f.maximumX) / 2, (f.minimumZ + f.maximumZ) / 2,
      f.maximumX - f.minimumX, f.maximumZ - f.minimumZ);
    // Flush driveway through the matching sidewalk gap in Subject3Roads.
    const roadEdge = 280 + context.topology.segments.find((road) => road.id === 'south-road')!.width / 2;
    this.pave('超市车辆入口', b.drivewayX, (roadEdge + f.minimumZ) / 2,
      b.drivewayWidth, f.minimumZ - roadEdge + 0.2);
    this.root.add(
      makeBox('超市主体', [b.width, 7.5, b.depth], [b.x, 3.75, b.z], materials.buildingCool, shadows),
      makeBox('超市屋顶', [b.width + 1, 0.4, b.depth + 1], [b.x, 7.7, b.z], materials.roof, shadows),
      makeBox('超市玻璃门面', [b.width - 4, 3.2, 0.15], [b.x, 1.75, b.z - b.depth / 2 - 0.1],
        materials.glass, false),
    );
    const sign = addLabelBoard(this.root, context, '超市招牌', '邻里超市', '#b8342c', materials.signRed,
      { x: b.x, z: b.z - b.depth / 2 - 0.3 }, Math.PI, [9, 1.35], 5.5);
    sign.children[0]!.visible = false;
    context.colliders.push(createStaticOBBCollider({
      id: 'subject3-supermarket', x: b.x, z: b.z, width: b.width, length: b.depth,
      minHeight: 0, maxHeight: 8, type: 'building',
    }));
    const firstX = -211, bayWidth = 2.7, z = 312;
    for (let i = 0; i <= 9; i += 1) {
      const mark = makeMarkingRectangle('超市停车位线', { x: firstX + i * bayWidth, z }, 0, 0.12, 5.2,
        materials.whitePaint, context.heightAt, context.config.markings.surfaceClearance);
      if (mark) this.root.add(mark);
    }
    const end = makeMarkingRectangle('超市停车区边线', { x: firstX + 4.5 * bayWidth, z: z + 2.6 },
      0, 9 * bayWidth, 0.12, materials.whitePaint, context.heightAt, context.config.markings.surfaceClearance);
    if (end) this.root.add(end);
    addLabelBoard(this.root, context, '超市停车提示', 'P  停车场', '#1f5ba6', materials.signBlue,
      { x: b.drivewayX + 5.5, z: f.minimumZ + 1 }, Math.PI, [1.8, 0.7], 2.3);
    this.root.userData.landmarks.push({ id: 'commercial', center: { x: b.x, z: b.z } });
  }

  private buildNorthLandmark(): void {
    const { context } = this;
    const { materials, heightAt, shadows, surfaces } = context;
    const centre: Subject3Point2 = { ...SUBJECT3_PLACES.northDome };
    const podium = new THREE.Mesh(
      new THREE.CylinderGeometry(15, 15.6, 1.1, 28),
      materials.buildingLight,
    );
    podium.name = '北侧地标基座';
    podium.position.set(centre.x, 0.55, centre.z);
    podium.castShadow = shadows;
    podium.receiveShadow = shadows;
    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(11, 11, 7.4, 28),
      materials.buildingCool,
    );
    drum.name = '北侧地标主体';
    drum.position.set(centre.x, 4.6, centre.z);
    drum.castShadow = shadows;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(11, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.5),
      materials.domeShell,
    );
    dome.name = '北侧地标穹顶';
    dome.position.set(centre.x, 8.3, centre.z);
    dome.castShadow = shadows;
    const finial = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.5, 3.4, 10),
      materials.domeAccent,
    );
    finial.position.set(centre.x, 20.2, centre.z);
    finial.castShadow = shadows;
    this.root.add(podium, drum, dome, finial);

    for (let index = 0; index < 8; index += 1) {
      const rib = new THREE.Mesh(
        new THREE.TorusGeometry(11.08, 0.16, 6, 18, Math.PI * 0.5),
        materials.domeAccent,
      );
      rib.name = '北侧地标穹顶肋';
      rib.position.set(centre.x, 8.3, centre.z);
      rib.rotation.y = (index / 8) * Math.PI;
      this.root.add(rib);
    }
    const forecourt = new THREE.Mesh(new THREE.PlaneGeometry(64, 48), materials.sidewalk);
    forecourt.name = '北侧地标广场';
    forecourt.rotation.x = -Math.PI * 0.5;
    forecourt.position.set(centre.x, heightAt(centre.x, centre.z) + 0.015, centre.z);
    forecourt.receiveShadow = shadows;
    this.root.add(forecourt);
    surfaces.addPavementRectangle(centre.x, centre.z, 64, 48);
    addLabelBoard(
      this.root,
      context,
      '北侧地标标识',
      '展览馆',
      '#1f5ba6',
      materials.signBlue,
      { x: centre.x, z: centre.z + 22 },
      0,
      [4.2, 1.1],
      2.2,
    );
    context.colliders.push(createStaticOBBCollider({
      id: 'subject3-north-dome', x: centre.x, z: centre.z, width: 30, length: 30,
      minHeight: 0, maxHeight: 22, type: 'building',
    }));
    this.root.userData.landmarks.push({ id: 'north-dome', center: centre });
  }
}
