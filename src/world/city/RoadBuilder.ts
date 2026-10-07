import { BoxGeometry, BufferGeometry, CylinderGeometry, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Mesh } from 'three';
import { createStripGeometry, makeMarkingRibbon, makeRoadRibbon } from '../subject3/geometry';
import type { Subject3Materials } from '../subject3/materials';
import type { CityMapData, CityPoint, CityRoad } from './CityMapData';
import { polylineLength, roadPoints, sampleAt } from './geometry';
import { barrierPoints, roadPiers } from './RoadInfrastructure';

/** Shared editor/runtime builder. SectorManager batches its output by material. */
export class RoadBuilder {
  constructor(private readonly materials: Subject3Materials, private readonly map?: CityMapData) {}
  build(road: CityRoad): Group {
    const root = new Group(), points = roadPoints(road), half = road.laneCount * road.laneWidth / 2;
    root.name = road.id;
    const add = (mesh: Mesh | null) => { if (mesh) root.add(mesh); };
    add(makeRoadRibbon(road.id, points, half * 2, this.materials.asphalt, () => 0, true));
    const line = (path: CityPoint[], offset: number, yellow = false) => add(makeMarkingRibbon('road paint', path, 0.12,
      yellow ? this.materials.yellowPaint : this.materials.whitePaint, () => 0, 0.008, offset));
    if (road.markings !== false) {
    if (road.travelDirection === 'two-way') { line(points, -0.13, true); line(points, 0.13, true); }
    line(points, -half + 0.15); line(points, half - 0.15);
    const length = polylineLength(points);
    for (let lane = 1; lane < road.laneCount; lane++) {
      if (road.travelDirection === 'two-way' && lane === road.laneCount / 2) continue;
      for (let d = 0; d < length; d += 9) {
        const end = Math.min(d + 3, length), path: CityPoint[] = [sampleAt(points, d).point];
        // Include bends inside a dash, rather than drawing a chord through them.
        for (let s = d + 0.75; s < end; s += 0.75) path.push(sampleAt(points, s).point);
        path.push(sampleAt(points, end).point);
        line(path, -half + lane * road.laneWidth);
      }
    }
    }
    if (road.sidewalk?.enabled) for (const side of [-1, 1]) {
      const strip = (a: number, b: number, y: number, curb: boolean) => {
        const geometry = createStripGeometry(points, () => 0, { innerOffset: Math.min(a, b), outerOffset: Math.max(a, b), yOffset: y, maximumSpacing: 3 });
        if (geometry) { const mesh = new Mesh(geometry, curb ? this.materials.curb : this.materials.sidewalk); mesh.receiveShadow = true; root.add(mesh); }
      };
      strip(side * half, side * (half + road.sidewalk.width), 0.15, false);
      if (road.curb !== false) strip(side * half, side * (half + 0.22), 0.17, true);
    }
    const length = polylineLength(points), elevated = points.some(p => (p.y ?? 0) > 2);
    if (elevated) {
      const bottom = createStripGeometry(points, () => 0, { innerOffset: -half, outerOffset: half, yOffset: -0.65, maximumSpacing: 3 });
      if (bottom) { const index = bottom.getIndex()!; for (let i = 0; i < index.count; i += 3) { const a = index.getX(i); index.setX(i, index.getX(i + 2)); index.setX(i + 2, a); } bottom.computeVertexNormals(); root.add(new Mesh(bottom, this.materials.curb)); }
      for (const side of [-1, 1]) this.wall(root, points, side * half, -0.65, 0.02, this.materials.curb);
      const piers = roadPiers(road, this.map);
      if (piers.length) {
        const geometry = road.structure?.pierStyle === 'rectangular' ? new BoxGeometry(1.2, 1, 1.2) : new CylinderGeometry(0.6, 0.6, 1, 8);
        const mesh = new InstancedMesh(geometry, this.materials.curb, piers.length), matrix = new Matrix4(); mesh.name = `${road.id}:piers`;
        piers.forEach((pier, i) => { matrix.makeScale(1, pier.height, 1); matrix.setPosition(pier.position.x, pier.height / 2, pier.position.z); mesh.setMatrixAt(i, matrix); });
        mesh.castShadow = true; root.add(mesh);
      }
    }
    if (road.structure?.barrierEnabled === true || elevated && road.structure?.barrierEnabled !== false) for (const side of [-1, 1]) this.wall(root, barrierPoints(road, this.map), side * half, 0.1, 1.1, this.materials.metal);
    if (road.streetlights) {
      const positions: { x: number; y: number; z: number }[] = [];
      for (let d = 25; d < length - 20; d += 50) { const s = sampleAt(points, d); positions.push({ x: s.point.x - s.tangent.z * (half + 0.6), y: (s.point.y ?? 0) + 3.7, z: s.point.z + s.tangent.x * (half + 0.6) }); }
      if (positions.length) {
        const poles = new InstancedMesh(new CylinderGeometry(0.08, 0.12, 7.4, 8), this.materials.darkMetal, positions.length);
        const heads = new InstancedMesh(new BoxGeometry(0.5, 0.16, 0.85), this.materials.lampHead, positions.length); heads.userData.environmentLamp = true;
        positions.forEach((p, i) => { const matrix = new Matrix4().makeTranslation(p.x, p.y, p.z); poles.setMatrixAt(i, matrix); matrix.setPosition(p.x, p.y + 3.5, p.z); heads.setMatrixAt(i, matrix); }); root.add(poles, heads);
      }
    }
    return root;
  }
  private wall(root: Group, points: CityPoint[], offset: number, bottom: number, top: number, material: Subject3Materials['curb']): void {
    const positions: number[] = [], indices: number[] = [];
    // Dense longitudinal samples keep curved side walls and barriers attached to the ribbon.
    const length = polylineLength(points), count = Math.max(1, Math.ceil(length / 3));
    for (let i = 0; i <= count; i++) {
      const s = sampleAt(points, length * i / count), x = s.point.x - s.tangent.z * offset, z = s.point.z + s.tangent.x * offset;
      positions.push(x, (s.point.y ?? 0) + bottom, z, x, (s.point.y ?? 0) + top, z);
      if (i < count) { const b = i * 2; indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2, b + 2, b + 1, b, b + 2, b + 3, b + 1); }
    }
    const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(positions, 3)); geometry.setIndex(indices);
    // Separate vertices keep the two face normals from cancelling each other.
    const faces = geometry.toNonIndexed(); geometry.dispose(); faces.computeVertexNormals(); root.add(new Mesh(faces, material));
  }
}
