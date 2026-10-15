import * as THREE from 'three';
import type { DrivingGround } from '../DrivingGround';
import type { RoadMapAnnotation, RoadNetworkData, RoadSegmentData } from '../navigation/RoadNetwork';
import { sampleGroundGeometry, surfaceResponseAliases, type RoadSurfaceSample } from '../SurfaceMaterial';
import { createCircuitBandGeometry, createCircuitRibbonGeometry, createRoutePatch } from '../circuit/geometry';
import { createCircuitMaterials } from '../circuit/materials';
import { createBarrierColliders, createStaticOBBCollider, type StaticCollider,
  type BarrierColliderOptions, type StaticOBBColliderOptions } from '../../vehicle/physics/CollisionSystem';
import { bandEnvelope, TSUKUBA_ID, TsukubaLayout } from './TsukubaLayout';
import { TsukubaSurface } from './TsukubaSurface';

interface Beam { readonly a: THREE.Vector3; readonly b: THREE.Vector3; readonly height: number; readonly thickness: number }

/** Independent authored ground using the same road, contact, loading and HUD contracts. */
export class TsukubaGround implements DrivingGround {
  public readonly root = new THREE.Group();
  public readonly layout = new TsukubaLayout();
  public readonly worldBounds = this.layout.bounds;
  public readonly metadata = Object.freeze({ id: TSUKUBA_ID, version: 2,
    displayName: 'Tsukuba Circuit TC2000 · 筑波赛道',
    description: '现实筑波 TC2000 四轮路线：2,045 米顺时针闭环、S 弯、双发夹、80R、高速末弯与贯通维修道。',
    lapLength: this.layout.length, routeCenterline: this.layout.samples,
    source: 'https://www.tsukuba-circuit.jp/guide/course-spec.html' });
  public readonly spawnPose = this.layout.poseAt(-24);
  public readonly roadNetwork: RoadNetworkData;
  public readonly lapCourse: NonNullable<DrivingGround['lapCourse']>;
  public readonly colliders: StaticCollider[] = [];
  private readonly surface = new TsukubaSurface(this.layout);
  private readonly materials = createCircuitMaterials();

  public constructor() {
    this.root.name = 'Tsukuba Circuit TC2000';
    this.root.userData.renderCategory = 'WORLD';
    this.root.userData.mapId = TSUKUBA_ID;
    this.spawnPose.position.y = this.getRoadHeightAt(this.spawnPose.position.x, this.spawnPose.position.z) + 0.04;
    const b = this.worldBounds;
    const segments: RoadSegmentData[] = this.layout.sections.map(section => ({
      id: section.id, width: Math.max(section.startWidth, section.endWidth),
      length: section.end - section.start, laneCountPerDirection: 1, laneWidth: section.endWidth,
      travelDirection: 'forward', markingsAvailable: false, roadType: 'circuit',
      // Include exact section endpoints as well as the uniform samples.
      centerline: [this.elevatedPoint(this.layout.poseAt(section.start).position),
        ...this.layout.samples.filter(p => p.distance > section.start && p.distance < section.end),
        this.elevatedPoint(this.layout.poseAt(section.end).position)],
    }));
    segments.push({ id: 'pit-lane', centerline: this.layout.pitSamples.map(p => this.elevatedPoint(p)),
      width: this.layout.pitWidth, length: this.layout.pitCurve.getLength(),
      laneCountPerDirection: 1, laneWidth: this.layout.pitWidth,
      travelDirection: 'forward', markingsAvailable: false, roadType: 'circuit' });
    const landmark = (id: string, kind: RoadMapAnnotation['kind'], label: string, distance: number): RoadMapAnnotation => {
      const pose = this.layout.poseAt(distance);
      return { id, kind, label, position: { x: pose.position.x, z: pose.position.z },
        yawRadians: pose.yawRadians, roadWidth: this.layout.widthAt(distance) };
    };
    const annotations: RoadMapAnnotation[] = [landmark('start-finish', 'start-finish', 'S/F', 0)];
    for (const [id, label] of [['t1-entry','T1'], ['hairpin-1','H1'], ['dunlop','DUNLOP'],
      ['80r-exit','80R'], ['hairpin-2','H2'], ['final-entry','LAST']] as const) {
      const section = this.layout.section(id);
      annotations.push(landmark(id, 'corner', label, (section.start + section.end) / 2));
    }
    for (const [t, label] of [[0.12, 'PIT IN'], [0.94, 'PIT OUT']] as const) {
      const p = this.layout.pitCurve.getPointAt(t);
      annotations.push({ id: label, kind: 'pit', label, position: { x: p.x, z: p.z } });
    }
    for (const d of [90, this.layout.section('dunlop-approach').start + 50,
      this.layout.section('back').start + 150, this.layout.section('back').end - 80]) {
      annotations.push(landmark(`direction-${d}`, 'direction', '', d));
    }
    this.roadNetwork = { mapId: TSUKUBA_ID,
      bounds: { minimumX: b.minX, maximumX: b.maxX, minimumZ: b.minZ, maximumZ: b.maxZ },
      segments, intersections: [], mapAnnotations: annotations };
    const gate = (distance: number) => {
      const pose = this.layout.poseAt(distance);
      return { center: this.elevatedPoint(pose.position),
        forward: { x: -Math.sin(pose.yawRadians), z: -Math.cos(pose.yawRadians) },
        halfWidth: this.layout.widthAt(distance) / 2 + 1.5, heightTolerance: 2 };
    };
    this.lapCourse = { trackId: TSUKUBA_ID, revision: 2, startFinish: gate(0),
      checkpoints: ['s-bend', 'dunlop', 'hairpin-2-exit', 'final-entry'].map(id => {
        const s = this.layout.section(id); return gate((s.start + s.end) / 2);
      }) };
    this.buildRoad();
    this.buildBarriers();
    this.buildPit();
    this.buildReferences();
    this.buildTrees();
  }

  public getRoadHeightAt(x: number, z: number): number { return this.surface.heightAt(x, z); }
  private elevatedPoint(p: { x: number; z: number }): { x: number; y: number; z: number } {
    return { x: p.x, y: this.getRoadHeightAt(p.x, p.z), z: p.z };
  }
  public getRoadPitchAt(x: number, z: number, yawRadians: number): number {
    const h = sampleGroundGeometry((px, pz) => this.getRoadHeightAt(px, pz), x, z,
      { x: -Math.sin(yawRadians), y: -Math.cos(yawRadians) });
    return Math.atan(h.grade);
  }
  public sampleRoadSurface(x: number, z: number, direction?: THREE.Vector2Like): RoadSurfaceSample {
    return { ...sampleGroundGeometry((px, pz) => this.getRoadHeightAt(px, pz), x, z, direction),
      ...surfaceResponseAliases(this.surface.materialAt(x, z)) };
  }
  public dispose(): void {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    this.root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      if (object instanceof THREE.InstancedMesh) object.dispose();
    });
    for (const material of [...materials, ...Object.values(this.materials)]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
    for (const texture of textures) texture.dispose();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    this.surface.dispose(); this.root.clear(); this.colliders.length = 0;
  }

  private mesh(name: string, geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name; mesh.receiveShadow = true;
    this.root.add(mesh); return mesh;
  }
  private band(name: string, start: number, end: number,
    edges: (distance: number) => readonly [number, number], material: THREE.Material,
    kerb = false, y = 0.024): void {
    const geometry = createCircuitBandGeometry(this.layout.curve, start, end, y, edges, kerb);
    this.drapeGeometry(geometry, y);
    this.mesh(name, geometry, material);
  }
  private drapeGeometry(geometry: THREE.BufferGeometry, offset: number, terrain = false): void {
    const p = geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) p.setY(i, offset + (terrain
      ? this.surface.baseHeightAt(p.getX(i), p.getZ(i)) : this.getRoadHeightAt(p.getX(i), p.getZ(i))));
    p.needsUpdate = true; geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  }
  /** Paint instances follow the local support plane, retaining shared geometry. */
  private placeOnSurface(object: THREE.Object3D, x: number, z: number, yaw: number, offset: number): void {
    const sample = sampleGroundGeometry((px, pz) => this.getRoadHeightAt(px, pz), x, z);
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    forward.addScaledVector(sample.normal, -forward.dot(sample.normal)).normalize();
    const right = forward.clone().cross(sample.normal).normalize();
    object.position.set(x, sample.height + offset, z);
    object.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, sample.normal, forward.negate()));
    object.updateMatrix();
  }
  private buildRoad(): void {
    const b = this.worldBounds;
    const ground = new THREE.PlaneGeometry(b.maxX - b.minX, b.maxZ - b.minZ,
      Math.ceil((b.maxX - b.minX) / 2), Math.ceil((b.maxZ - b.minZ) / 2));
    ground.rotateX(-Math.PI / 2);
    ground.translate((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
    this.drapeGeometry(ground, -0.045, true);
    this.mesh('Grass infield and surroundings', ground, this.materials.grass);
    this.band('TC2000 racing asphalt', 0, this.layout.length,
      d => [-this.layout.widthAt(d) / 2, this.layout.widthAt(d) / 2], this.materials.asphalt);
    for (const side of [-1, 1]) {
      this.band('Track edge white line', 0, this.layout.length, d => {
        const edge = side * (this.layout.widthAt(d) / 2 - 0.15);
        return [edge - 0.06, edge + 0.06];
      }, this.materials.marking, false, 0.029);
    }
    for (const k of this.layout.kerbs) {
      // Two half-width strips expose a raised middle vertex, matching contact height.
      for (const half of [0, 0.5]) this.band('Red and white physical kerb', k.start, k.end, d => {
        const edge = this.layout.widthAt(d) / 2, width = k.width * bandEnvelope(k, d);
        const a = k.side * (edge + width * half), b = k.side * (edge + width * (half + 0.5));
        return a < b ? [a, b] : [b, a];
      }, this.materials.kerb, true, 0.025);
    }
    const gravel = new THREE.MeshStandardMaterial({ color: 0xafa58c, roughness: 1 });
    for (const band of this.layout.runoffs) this.band('Gravel safety bed', band.start, band.end, d => {
      const inner = this.layout.widthAt(d) / 2 + 2;
      const outer = inner + band.width * bandEnvelope(band, d);
      return band.side > 0 ? [inner, outer] : [-outer, -inner];
    }, gravel, false, 0.002);
    const pit = createCircuitRibbonGeometry(this.layout.pitCurve, this.layout.pitWidth, 0.026);
    this.drapeGeometry(pit, 0.026);
    this.mesh('Continuous pit entry lane and exit', pit, this.materials.asphalt);
    for (const offset of [-1, 1]) {
      const boundary = createCircuitRibbonGeometry(this.layout.pitCurve, 0.1, 0.03, 1, offset * (this.layout.pitWidth / 2 - 0.1));
      this.drapeGeometry(boundary, 0.03);
      this.mesh('Pit lane boundary', boundary, this.materials.marking);
    }
    const line = createRoutePatch(this.layout.curve, 0, 15, 0.5, 0.032, this.materials.marking);
    line.updateMatrix(); line.geometry.applyMatrix4(line.matrix);
    line.position.set(0, 0, 0); line.rotation.set(0, 0, 0);
    this.drapeGeometry(line.geometry, 0.032);
    line.name = 'TC2000 official start finish position'; this.root.add(line);
    // Starting grid marks share a single instanced plane.
    const grid = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.1, 0.12).rotateX(-Math.PI / 2), this.materials.marking, 20);
    grid.name = 'Starting grid';
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 20; i++) {
      const pose = this.layout.poseAt(-10 - i * 6, (i % 2 ? 1 : -1) * 3.4);
      this.placeOnSurface(dummy, pose.position.x, pose.position.z, pose.yawRadians, 0.033);
      grid.setMatrixAt(i, dummy.matrix);
    }
    this.root.add(grid);
    this.buildDirectionMarkings();
  }

  private buildDirectionMarkings(): void {
    const shape = new THREE.Shape();
    shape.moveTo(0, 2); shape.lineTo(1.15, 0.4); shape.lineTo(0.4, 0.4);
    shape.lineTo(0.4, -2); shape.lineTo(-0.4, -2); shape.lineTo(-0.4, 0.4);
    shape.lineTo(-1.15, 0.4); shape.closePath();
    const poses = [this.layout.poseAt(45), this.layout.poseAt(this.layout.section('dunlop-approach').start + 30),
      this.layout.poseAt(this.layout.section('back').start + 70)];
    for (const t of [0.22, 0.5, 0.8]) {
      const position = this.layout.pitCurve.getPointAt(t), tangent = this.layout.pitCurve.getTangentAt(t);
      poses.push({ position, yawRadians: Math.atan2(-tangent.x, -tangent.z) });
    }
    const arrows = new THREE.InstancedMesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2),
      this.materials.marking, poses.length);
    arrows.name = 'Track and pit driving direction arrows';
    const dummy = new THREE.Object3D();
    poses.forEach((pose, i) => {
      this.placeOnSurface(dummy, pose.position.x, pose.position.z, pose.yawRadians, 0.034);
      arrows.setMatrixAt(i, dummy.matrix);
    });
    this.root.add(arrows);
  }

  private barrierOffset(distance: number, side: number): number {
    let offset = this.layout.widthAt(distance) / 2 + 5;
    for (const band of this.layout.runoffs) if (band.side === side && distance >= band.start && distance <= band.end) {
      offset += 2 + band.width * bandEnvelope(band, distance);
    }
    return offset;
  }
  private buildBarriers(): void {
    const rails: Beam[] = [], walls: Beam[] = [], fences: Beam[] = [], posts: Beam[] = [];
    const count = Math.ceil(this.layout.length / 4);
    for (let i = 0; i < count; i++) for (const side of [-1, 1]) {
      const d0 = this.layout.length * i / count, d1 = this.layout.length * (i + 1) / count;
      // The pit corridor has its own separator, with open entrance and exit.
      if (side === 1 && (d0 > this.layout.section('final-entry').start || d0 < this.layout.section('s-entry').end)) continue;
      const a = this.layout.poseAt(d0, side * this.barrierOffset(d0, side)).position;
      const b = this.layout.poseAt(d1, side * this.barrierOffset(d1, side)).position;
      const mid = a.clone().add(b).multiplyScalar(0.5);
      // Compact infield: never place an offset barrier across an adjacent road.
      if (this.surface.pavementClearanceAt(mid.x, mid.z) < 3) continue;
      rails.push({ a, b, height: 0.75, thickness: 0.24 });
      this.addBarriers({ id: `tsukuba-rail-${side}-${i}`, start: a, end: b,
        thickness: 0.24, minHeight: 0, maxHeight: 0.75, type: 'guardrail' });
      posts.push({ a: a.clone().setY(0), b: a.clone().setY(1.1), height: 0.11, thickness: 0.11 });
      if (side < 0) {
        const fa = this.layout.poseAt(d0, side * (this.barrierOffset(d0, side) + 0.8)).position;
        const fb = this.layout.poseAt(d1, side * (this.barrierOffset(d1, side) + 0.8)).position;
        posts.push({ a: fa.clone(), b: fa.clone().setY(3.2), height: 0.065, thickness: 0.065 });
        for (const y of [1.4, 2, 2.6, 3.2]) fences.push({ a: fa.clone().setY(y), b: fb.clone().setY(y), height: 0.025, thickness: 0.025 });
      }
    }
    // Pit wall beside the home straight, ending before the T1 turn-in.
    for (let d = this.layout.length - 65; d < this.layout.length + 140; d += 4) {
      const a = this.layout.poseAt(d, 10).position, b = this.layout.poseAt(d + 4, 10).position;
      walls.push({ a, b, height: 1, thickness: 0.35 });
      this.addBarriers({ id: `pit-wall-${d}`, start: a, end: b,
        thickness: 0.35, minHeight: 0, maxHeight: 1, type: 'wall' });
    }
    this.beams('Steel safety barriers', rails, this.materials.guardrail, true);
    this.beams('Pit concrete wall', walls, this.materials.structure, true);
    this.beams('Fence wires', fences, this.materials.guardrailPost, false, true);
    this.beams('Guardrail and fence posts', posts, this.materials.guardrailPost, true, true);
    // Low polygon tyre stacks outside the main heavy-braking corners.
    const tyrePositions: THREE.Vector3[] = [];
    for (const id of ['t1-entry', 'hairpin-1', 'hairpin-2']) {
      const s = this.layout.section(id), side = id === 'hairpin-1' ? 1 : -1;
      for (let d = s.start + 10; d < s.end - 5; d += 1.4) {
        const p = this.layout.poseAt(d, side * (this.barrierOffset(d, side) - 0.8)).position;
        if (this.surface.pavementClearanceAt(p.x, p.z) < 3) continue;
        tyrePositions.push(p);
        this.addSolid({ id: `tyres-${id}-${d}`, x: p.x, z: p.z,
          width: 1.1, length: 1.1, minHeight: 0, maxHeight: 0.75, type: 'wall' });
      }
    }
    const tyres = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 0.55, 0.75, 8),
      this.materials.startDark, tyrePositions.length);
    tyres.name = 'Tyre safety wall';
    const dummy = new THREE.Object3D();
    tyrePositions.forEach((p, i) => {
      dummy.position.set(p.x, this.surface.baseHeightAt(p.x, p.z) + 0.375, p.z);
      dummy.updateMatrix(); tyres.setMatrixAt(i, dummy.matrix);
    });
    this.root.add(tyres);
  }

  private addBarriers(options: BarrierColliderOptions): void {
    for (const collider of createBarrierColliders(options)) {
      const a = collider.barrierSegment!.start, b = collider.barrierSegment!.end;
      const ya = this.surface.baseHeightAt(a.x, a.z), yb = this.surface.baseHeightAt(b.x, b.z);
      this.colliders.push({ ...collider, minHeight: Math.min(ya, yb) + (options.minHeight ?? 0),
        maxHeight: Math.max(ya, yb) + (options.maxHeight ?? 1) });
    }
  }
  private addSolid(options: StaticOBBColliderOptions): void {
    const base = this.surface.baseHeightAt(options.x, options.z);
    this.colliders.push(createStaticOBBCollider({ ...options, minHeight: base + (options.minHeight ?? 0),
      maxHeight: base + (options.maxHeight ?? 1) }));
  }

  /** One draw per repeated structural type; authored beams also define collision. */
  private beams(name: string, beams: readonly Beam[], material: THREE.Material, shadows: boolean, absoluteY = false): void {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, beams.length);
    mesh.name = name; mesh.castShadow = shadows;
    const dummy = new THREE.Object3D(), forward = new THREE.Vector3(0, 0, 1);
    beams.forEach((beam, i) => {
      const a = beam.a.clone(), b = beam.b.clone();
      a.y += this.surface.baseHeightAt(a.x, a.z); b.y += this.surface.baseHeightAt(b.x, b.z);
      const direction = b.clone().sub(a);
      dummy.position.copy(a).add(b).multiplyScalar(0.5);
      if (!absoluteY) dummy.position.y += beam.height / 2;
      dummy.quaternion.setFromUnitVectors(forward, direction.clone().normalize());
      dummy.scale.set(beam.thickness, beam.height, direction.length() + 0.025);
      dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    });
    this.root.add(mesh);
  }

  private buildPit(): void {
    // The real pit row is small: open-front shelter, simple rear wall and bays.
    const roof: Beam[] = [], rear: Beam[] = [], posts: Beam[] = [];
    const apron = new THREE.InstancedMesh(new THREE.PlaneGeometry(11, 5.55).rotateX(-Math.PI / 2), this.materials.runoff, 18);
    apron.name = 'Pit service apron'; apron.receiveShadow = true;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 18; i++) {
      const d = -15 + i * 5.5, pose = this.layout.poseAt(d, 28);
      const tangent = new THREE.Vector3(-Math.sin(pose.yawRadians), 0, -Math.cos(pose.yawRadians));
      const right = new THREE.Vector3(-tangent.z, 0, tangent.x);
      const a = pose.position.clone().addScaledVector(tangent, -2.75);
      const b = pose.position.clone().addScaledVector(tangent, 2.75);
      roof.push({ a: a.clone().setY(3.4), b: b.clone().setY(3.4), thickness: 6.5, height: 0.25 });
      const ra = a.clone().addScaledVector(right, 3), rb = b.clone().addScaledVector(right, 3);
      rear.push({ a: ra, b: rb, thickness: 0.25, height: 3.4 });
      this.addBarriers({ id: `garage-rear-${i}`, start: ra, end: rb,
        thickness: 0.25, minHeight: 0, maxHeight: 3.4, type: 'building' });
      const p = a.clone().addScaledVector(right, -3);
      posts.push({ a: p, b: p.clone().setY(3.4), thickness: 0.18, height: 0.18 });
      this.addSolid({ id: `garage-post-${i}`, x: p.x, z: p.z,
        width: 0.18, length: 0.18, minHeight: 0, maxHeight: 3.4, type: 'obstacle' });
      const centre = this.layout.poseAt(d, 25).position;
      this.placeOnSurface(dummy, centre.x, centre.z, pose.yawRadians, 0.019);
      apron.setMatrixAt(i, dummy.matrix);
    }
    this.root.add(apron);
    this.beams('Simple pit garage roofs', roof, this.materials.roof, true, true);
    this.beams('Garage rear wall', rear, this.materials.structure, true);
    this.beams('Open pit bay posts', posts, this.materials.structure, true, true);
    const tower = this.layout.poseAt(-30, 30);
    this.box('Control tower', tower.position.x, tower.position.z, 6, 6, 10, tower.yawRadians, this.materials.structure);
    this.board(-30, 34, 'TSUKUBA', 'Control tower identification');
    // Visible navigation for both pit branches; no new pit gameplay system.
    this.board(this.layout.section('final-entry').start + 35, 7, 'PIT  >', 'Pit entry');
    this.board(this.layout.section('t1-exit').end + 20, 12, 'PIT EXIT', 'Pit exit');
  }
  private box(name: string, x: number, z: number, width: number, length: number,
    height: number, yaw: number, material: THREE.Material): void {
    const mesh = this.mesh(name, new THREE.BoxGeometry(width, height, length), material);
    mesh.position.set(x, this.surface.baseHeightAt(x, z) + height / 2, z); mesh.rotation.y = yaw; mesh.castShadow = true;
    this.addSolid({ id: name, x, z, width, length, yaw,
      minHeight: 0, maxHeight: height, type: 'building' });
  }
  private buildReferences(): void {
    for (const [id, label, turn] of [['t1-entry', 'T1', '>'], ['hairpin-1-entry', 'H1', '<'],
      ['dunlop', 'DUNLOP', '>'], ['80r-entry', '80R', '<'], ['hairpin-2', 'H2', '>'],
      ['final-entry', 'LAST', '>']] as const) {
      const distance = this.layout.section(id).start - 22;
      const side = turn === '>' ? -1 : 1;
      const offset = side * (this.barrierOffset(THREE.MathUtils.euclideanModulo(distance, this.layout.length), side) + 1);
      this.board(distance, offset, `${turn === '<' ? '< ' : ''}${label}${turn === '>' ? ' >' : ''}`, `${label} corner direction`, 1.8, 3.1);
    }
    for (const id of ['t1-entry', 'hairpin-1-entry', 'hairpin-2', 'final-entry']) {
      const section = this.layout.section(id);
      for (const before of [100, 50]) this.board(section.start - before,
        -this.barrierOffset(THREE.MathUtils.euclideanModulo(section.start - before, this.layout.length), -1) - 1.5,
        String(before), `${id} braking board ${before}`);
    }
    const dunlop = this.layout.section('dunlop');
    const d = dunlop.start + (dunlop.end - dunlop.start) * 0.7;
    const cross: Beam[] = [];
    for (const side of [-1, 1]) {
      const p = this.layout.poseAt(d, side * 10).position;
      cross.push({ a: p, b: p.clone().setY(5.8), height: 0.45, thickness: 0.45 });
      this.addSolid({ id: `dunlop-bridge-${side}`, x: p.x, z: p.z,
        width: 0.6, length: 0.6, minHeight: 0, maxHeight: 5.8, type: 'obstacle' });
    }
    const a = this.layout.poseAt(d, -10).position.setY(5.8), b = this.layout.poseAt(d, 10).position.setY(5.8);
    cross.push({ a, b, height: 0.9, thickness: 1.2 });
    this.beams('Dunlop bridge silhouette', cross, this.materials.structure, true, true);
    this.board(d, 0, 'DUNLOP', 'Dunlop corner bridge', 5.8, 8);
    this.board(0, -10.5, 'TC2000', 'Start finish reference');
  }
  private board(distance: number, offset: number, text: string, name: string, y = 1.8, width = 1.8): void {
    const pose = this.layout.poseAt(distance, offset);
    const geometry = new THREE.BoxGeometry(width, 1, 0.08);
    const plate = this.mesh(name, geometry, this.materials.structure);
    plate.position.copy(pose.position); plate.position.y = this.surface.baseHeightAt(pose.position.x, pose.position.z) + y; plate.rotation.y = pose.yawRadians;
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = '#e6e4d6'; ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#18272d'; ctx.font = 'bold 88px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 68, 490);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const face = this.mesh(`${name} label`, new THREE.PlaneGeometry(width - 0.03, 0.96),
      new THREE.MeshBasicMaterial({ map: texture }));
    face.position.copy(plate.position).add(new THREE.Vector3(0, 0, 0.046).applyAxisAngle(new THREE.Vector3(0, 1, 0), pose.yawRadians));
    face.rotation.y = pose.yawRadians;
  }
  private buildTrees(): void {
    const positions: THREE.Vector3[] = [], b = this.worldBounds;
    // Sparse perimeter plantings only; no random retry loop or infield obstruction.
    for (let x = b.minX + 10; x < b.maxX - 5; x += 27) {
      positions.push(new THREE.Vector3(x, 0, b.minZ + 12), new THREE.Vector3(x + 5, 0, b.maxZ - 12));
    }
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.25, 2.6, 6), this.materials.trunk, positions.length);
    const crowns = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(2.5, 0), this.materials.foliage, positions.length);
    trunks.name = 'Perimeter tree trunks'; crowns.name = 'Perimeter foliage';
    const dummy = new THREE.Object3D();
    positions.forEach((p, i) => {
      const base = this.surface.baseHeightAt(p.x, p.z);
      dummy.position.set(p.x, base + 1.3, p.z); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.y = base + 4; dummy.updateMatrix(); crowns.setMatrixAt(i, dummy.matrix);
      this.addSolid({ id: `tsukuba-tree-${i}`, x: p.x, z: p.z,
        width: 0.5, length: 0.5, minHeight: 0, maxHeight: 2.6, type: 'obstacle' });
    });
    this.root.add(trunks, crowns);
  }
}
