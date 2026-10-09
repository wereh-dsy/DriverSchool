import * as THREE from 'three';
import { wetRoadMaterial } from '../environment/WetRoadMaterial';
import { MountainRoute, smooth } from './MountainRoute';
import { MountainSurface, SERVICE, serviceDistance } from './MountainSurface';

interface TerrainCell {
  x: number; z: number; size: number;
  children?: TerrainCell[];
  ring?: number[];
  centre?: number;
}
const MIN_X = -1280, MIN_Z = -1088, COLS = 80, ROWS = 68, CELL = 32;
export const MOUNTAIN_BOUNDS = Object.freeze({ minX: MIN_X, maxX: -MIN_X, minZ: MIN_Z, maxZ: -MIN_Z });

/** One stitched mesh provides both rendering and contact. Only road corridors are refined. */
export class MountainTerrain {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  readonly paving: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  readonly minimumHeight: number;
  readonly maximumHeight: number;
  readonly leaves: TerrainCell[] = [];
  private readonly roots: TerrainCell[] = [];
  private readonly positions: Float32Array;
  constructor(readonly route: MountainRoute, surface: MountainSurface, shadows: boolean) {
    const split = (x: number, z: number, size: number): TerrainCell => {
      const cell: TerrainCell = { x, z, size };
      const hit = route.nearest(x + size / 2, z + size / 2);
      let resolution = 32;
      if (hit) {
        const distance = Math.max(0, hit.distance - size * Math.SQRT1_2);
        const width = hit.route.width(hit.s) / 2;
        const main = hit.route === route.main;
        const rough = !main ? hit.route.id === 'deep-ruts' :
          hit.s > route.main.section('broken-dirt').start && hit.s < route.main.section('articulation').end;
        if (distance < width + 0.8) resolution = rough ? 0.5 : 1;
        else if (distance < width + 4) resolution = 2;
        else if (distance < width + 18) resolution = 4;
        else if (distance < 45) resolution = 8;
      }
      if (serviceDistance(x + size / 2, z + size / 2) < size * Math.SQRT1_2 + 2) resolution = Math.min(resolution, 2);
      if (size > resolution) {
        const half = size / 2;
        cell.children = [split(x, z, half), split(x + half, z, half),
          split(x, z + half, half), split(x + half, z + half, half)];
      } else this.leaves.push(cell);
      return cell;
    };
    for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) {
      this.roots.push(split(MIN_X + col * CELL, MIN_Z + row * CELL, CELL));
    }
    // Share all edge breakpoints, including finer neighbours, to eliminate T-junction cracks.
    const horizontal = new Map<number, Set<number>>(), vertical = new Map<number, Set<number>>();
    const edge = (map: Map<number, Set<number>>, axis: number, a: number, b: number): void => {
      let entries = map.get(axis);
      if (!entries) { entries = new Set(); map.set(axis, entries); }
      entries.add(a); entries.add(b);
    };
    for (const c of this.leaves) {
      edge(horizontal, c.z, c.x, c.x + c.size); edge(horizontal, c.z + c.size, c.x, c.x + c.size);
      edge(vertical, c.x, c.z, c.z + c.size); edge(vertical, c.x + c.size, c.z, c.z + c.size);
    }
    const h = new Map([...horizontal].map(([k, v]) => [k, [...v].sort((a, b) => a - b)]));
    const v = new Map([...vertical].map(([k, entries]) => [k, [...entries].sort((a, b) => a - b)]));
    const coords = new Map<string, number>(), positions: number[] = [], colors: number[] = [], indices: number[] = [], pavedIndices: number[] = [], pavedVertices: boolean[] = [];
    let low = Infinity, high = -Infinity;
    const vertex = (x: number, z: number): number => {
      const key = `${x},${z}`;
      const previous = coords.get(key);
      if (previous !== undefined) return previous;
      const y = this.authoredHeightAt(x, z), color = surface.colorAt(x, z), i = positions.length / 3;
      low = Math.min(low, y); high = Math.max(high, y);
      coords.set(key, i); positions.push(x, y, z); colors.push(color.r, color.g, color.b);
      pavedVertices.push(surface.materialAt(x, z).surfaceType === 'asphalt');
      return i;
    };
    const interval = (entries: number[], start: number, end: number): number[] => {
      let low = 0, high = entries.length;
      while (low < high) { const mid = (low + high) >>> 1; if (entries[mid]! < start) low = mid + 1; else high = mid; }
      const result: number[] = [];
      for (let i = low; i < entries.length && entries[i]! <= end; i++) result.push(entries[i]!);
      return result;
    };
    for (const c of this.leaves) {
      const ring: number[] = [];
      // Clockwise in the X/Z plane produces +Y triangle normals.
      for (const z of interval(v.get(c.x)!, c.z, c.z + c.size).slice(0, -1)) ring.push(vertex(c.x, z));
      for (const x of interval(h.get(c.z + c.size)!, c.x, c.x + c.size).slice(0, -1)) ring.push(vertex(x, c.z + c.size));
      for (const z of interval(v.get(c.x + c.size)!, c.z, c.z + c.size).reverse().slice(0, -1)) ring.push(vertex(c.x + c.size, z));
      for (const x of interval(h.get(c.z)!, c.x, c.x + c.size).reverse().slice(0, -1)) ring.push(vertex(x, c.z));
      c.ring = ring; c.centre = vertex(c.x + c.size / 2, c.z + c.size / 2);
      for (let i = 0; i < ring.length; i++) {
        const a = c.centre, b = ring[i]!, d = ring[(i + 1) % ring.length]!;
        const paved = Number(pavedVertices[a]) + Number(pavedVertices[b]) + Number(pavedVertices[d]) >= 2;
        (paved ? pavedIndices : indices).push(a, b, d);
      }
    }
    this.positions = new Float32Array(positions);
    this.minimumHeight = low; this.maximumHeight = high;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    // Compute normals with the complete topology, then split material batches.
    // Both meshes share the same attributes and exact contact vertices at their seam.
    geometry.setIndex([...indices, ...pavedIndices]); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
    const pavingGeometry = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'color']) pavingGeometry.setAttribute(name, geometry.getAttribute(name));
    pavingGeometry.setIndex(pavedIndices); pavingGeometry.computeBoundingSphere();
    geometry.setIndex(indices);
    this.paving = new THREE.Mesh(pavingGeometry, wetRoadMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94 })));
    this.paving.name = 'Mountain service paving and asphalt transitions';
    this.paving.receiveShadow = shadows;
    this.mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98 }));
    this.mesh.name = 'Mountain terrain and continuous road contact';
    this.mesh.receiveShadow = shadows;
    this.mesh.userData.mountainContactMesh = true;
  }
  /** Structured landforms: southern basin, west slope, northern ridge, east valley. */
  baseHeightAt(x: number, z: number): number {
    const ridge = 80 * Math.exp(-1 * ((x + 180) / 880) ** 4 - ((z + 650) / 250) ** 2);
    const west = 28 * Math.exp(-1 * ((x + 820) / 230) ** 2 - ((z + 180) / 530) ** 2);
    const centre = 20 * Math.exp(-1 * ((x + 70) / 480) ** 2 - ((z + 30) / 400) ** 2);
    const east = 22 * Math.exp(-1 * ((x - 680) / 240) ** 2 - ((z + 150) / 420) ** 2);
    const peak = 13 * Math.exp(-1 * ((x + 520) / 170) ** 2 - ((z + 700) / 180) ** 2);
    const height = 2 + ridge + west + centre + east + peak;
    const general = height < 90 ? height : 90 + 5 * Math.tanh((height - 90) / 5);
    const northwest = 18 + 68 * smooth((-z - 400) / 215);
    const westLand = THREE.MathUtils.lerp(general, northwest, smooth((-x - 530) / 180) * smooth((-z - 300) / 100));
    const eastLand = 2 + 78 * (1 - smooth((z + 160) / 800));
    return THREE.MathUtils.lerp(westLand, eastLand, smooth((x - 380) / 250));
  }
  authoredHeightAt(x: number, z: number): number {
    const base = this.baseHeightAt(x, z);
    const parent = this.route.main.nearest(x, z);
    let mainBed = base, parentHeight = base, parentInfluence = 0;
    if (parent) {
      const influence = 1 - smooth((parent.distance - this.route.main.width(parent.s) / 2 - 1) / 18);
      const height = this.route.main.height(parent.s) + this.route.main.bank(parent.s) * parent.lateral
        + this.route.main.disturbance(parent.s, parent.lateral);
      parentHeight = height; parentInfluence = influence;
    }
    let roadHeight = 0, weight = 0, coverage = 0, nearestBranch = Infinity, forkWidth = 5;
    for (const path of this.route.branches) {
      const hit = path.nearest(x, z);
      if (!hit) continue;
      const influence = 1 - smooth((hit.distance - path.width(hit.s) / 2 - 1) / 18);
      if (influence <= 0) continue;
      if (hit.distance < nearestBranch) { nearestBranch = hit.distance; forkWidth = path.id === 'steep-climb' ? 13 : 5; }
      const priority = influence / (0.25 + hit.distance ** 4);
      const road = path.height(hit.s) + path.bank(hit.s) * hit.lateral + path.disturbance(hit.s, hit.lateral);
      roadHeight += road * priority; weight += priority; coverage = Math.max(coverage, influence);
    }
    mainBed = THREE.MathUtils.lerp(base, parentHeight, Math.max(parentInfluence, coverage));
    // Blend the road beds directly, rather than multiplying normalized weights:
    // this retains a metre-scale, smooth fork transition and protects main-road grade.
    const forkBlend = parent ? smooth((parent.distance - this.route.main.width(parent.s) / 2 - 0.8) / forkWidth) : 1;
    const shaped = weight > 0 ? THREE.MathUtils.lerp(mainBed, roadHeight / weight, coverage * forkBlend) : mainBed;
    return THREE.MathUtils.lerp(shaped, SERVICE.height, 1 - smooth(serviceDistance(x, z) / 12));
  }
  /** Barycentric height on the exact Float32 triangles drawn by Three.js. */
  heightAt(x: number, z: number): number {
    const col = Math.floor((x - MIN_X) / CELL), row = Math.floor((z - MIN_Z) / CELL);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return this.authoredHeightAt(x, z);
    let c = this.roots[row * COLS + col]!;
    while (c.children) {
      c = c.children[(x >= c.x + c.size / 2 ? 1 : 0) + (z >= c.z + c.size / 2 ? 2 : 0)]!;
    }
    const a = c.centre! * 3, p = this.positions, ring = c.ring!;
    for (let i = 0; i < ring.length; i++) {
      const b = ring[i]! * 3, d = ring[(i + 1) % ring.length]! * 3;
      const abx = p[b]! - p[a]!, abz = p[b + 2]! - p[a + 2]!;
      const adx = p[d]! - p[a]!, adz = p[d + 2]! - p[a + 2]!;
      const dx = x - p[a]!, dz = z - p[a + 2]!;
      const denominator = abx * adz - abz * adx;
      const u = (dx * adz - dz * adx) / denominator, w = (abx * dz - abz * dx) / denominator;
      if (u >= -1e-7 && w >= -1e-7 && u + w <= 1.0000001) {
        return p[a + 1]! + u * (p[b + 1]! - p[a + 1]!) + w * (p[d + 1]! - p[a + 1]!);
      }
    }
    throw new Error(`Mountain contact hole at ${x}, ${z}`);
  }
}
