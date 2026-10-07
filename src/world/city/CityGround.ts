import { Group, Mesh, PlaneGeometry, Vector2, Vector3 } from 'three';
import type { DrivingGround } from '../DrivingGround';
import { SURFACE_MATERIALS, surfaceResponseAliases, type RoadSurfaceSample } from '../SurfaceMaterial';
import { createSubject3Materials } from '../subject3/materials';
import type { CityMapData, CityPoint } from './CityMapData';
import { loadCityMap } from './CityMapLoader';
import { buildCityRoadNetwork } from './CityRoadNetwork';
import { junctionExtent, rotatePoint } from './geometry';
import { PrefabRegistry } from './PrefabRegistry';
import { SectorManager, type SectorOptions } from './SectorManager';
import { roadStructureColliders } from './RoadInfrastructure';

interface SurfaceArea { contains(x: number, z: number): boolean; pavement: boolean; heightAt(x: number, z: number): number; extensionAt?: (x: number, z: number) => number; gx: number; gz: number }
export class CityGround implements DrivingGround {
  readonly root = new Group();
  readonly data: CityMapData;
  readonly metadata;
  readonly worldBounds;
  readonly spawnPose;
  readonly roadNetwork;
  readonly colliders;
  readonly sectors: SectorManager;
  private readonly materials = createSubject3Materials();
  private readonly prefabs = new PrefabRegistry(this.materials);
  private readonly surfaces = new Map<string, SurfaceArea[]>();
  private readonly editor: boolean;
  private referenceHeight = 0;
  constructor(data: unknown, options: SectorOptions = {}) {
    this.data = loadCityMap(data); this.editor = options.editor ?? false;
    this.worldBounds = this.data.bounds;
    this.metadata = { id: this.data.id, version: this.data.version, displayName: this.data.name, description: 'Data-driven City Map' };
    this.roadNetwork = buildCityRoadNetwork(this.data);
    this.root.name = this.data.name; this.root.userData.renderCategory = 'WORLD';
    const b = this.worldBounds;
    const base = new Mesh(new PlaneGeometry(b.maxX - b.minX, b.maxZ - b.minZ), this.materials.grass);
    base.rotation.x = -Math.PI / 2; base.position.set((b.minX + b.maxX) / 2, -0.04, (b.minZ + b.maxZ) / 2); base.receiveShadow = true; this.root.add(base);
    this.sectors = new SectorManager(this.data, this.materials, this.prefabs, options); this.root.add(this.sectors.root);
    this.colliders = [...this.data.objects.flatMap(o => { const c = this.prefabs.collider(o); return c ? [c] : []; }), ...this.data.roads.flatMap(r => roadStructureColliders(r, this.data))];
    for (const road of this.roadNetwork.segments) {
      const source = this.data.roads.find(r => r.id === road.id)!;
      const sidewalk = source.sidewalk?.enabled ? source.sidewalk.width : 0;
      for (let i = 1; i < road.centerline.length; i++) {
        const a = road.centerline[i - 1]!, c = road.centerline[i]!, dx = c.x - a.x, dz = c.z - a.z, squared = dx * dx + dz * dz;
        const dy = (c.y ?? 0) - (a.y ?? 0);
        const extensionAt = (x: number, z: number) => { const t = ((x - a.x) * dx + (z - a.z) * dz) / squared; return Math.max(0, -t, t - 1) * Math.sqrt(squared); };
        const heightAt = (x: number, z: number) => (a.y ?? 0) + dy * Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / squared));
        const contains = (radius: number) => (x: number, z: number) => {
          const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / squared));
          return (x - a.x - dx * t) ** 2 + (z - a.z - dz * t) ** 2 <= radius * radius;
        };
        const margin = road.width / 2 + sidewalk;
        const bounds = { minX: Math.min(a.x, c.x) - margin, maxX: Math.max(a.x, c.x) + margin, minZ: Math.min(a.z, c.z) - margin, maxZ: Math.max(a.z, c.z) + margin };
        this.addArea(bounds, { contains: contains(road.width / 2), pavement: false, heightAt, extensionAt, gx: dy * dx / squared, gz: dy * dz / squared });
        if (sidewalk) this.addArea(bounds, { contains: contains(margin), pavement: true, heightAt, extensionAt, gx: dy * dx / squared, gz: dy * dz / squared });
      }
    }
    for (const j of this.data.intersections) {
      const h = junctionExtent(j, this.data), extent = h * (Math.abs(Math.cos(j.rotation)) + Math.abs(Math.sin(j.rotation)));
      this.addArea({ minX: j.position.x - extent, maxX: j.position.x + extent, minZ: j.position.z - extent, maxZ: j.position.z + extent }, {
        pavement: false, heightAt: () => j.position.y ?? 0, gx: 0, gz: 0, contains: (x, z) => { const p = rotatePoint({ x: x - j.position.x, z: z - j.position.z }, -j.rotation); return Math.abs(p.x) <= h && Math.abs(p.z) <= h; },
      });
    }
    for (const o of this.data.objects) if (o.prefabId === 'parking') {
      const w = 15 * (o.scale?.x ?? 1), d = 12 * (o.scale?.z ?? 1), e = Math.hypot(w, d);
      this.addArea({ minX: o.position.x - e, maxX: o.position.x + e, minZ: o.position.z - e, maxZ: o.position.z + e }, { pavement: false, heightAt: () => o.position.y ?? 0, gx: 0, gz: 0,
        contains: (x, z) => { const p = rotatePoint({ x: x - o.position.x, z: z - o.position.z }, -o.rotation); return Math.abs(p.x) <= w && Math.abs(p.z) <= d; } });
    }
    const authored = this.data.environment.spawnPoints[0]!;
    this.referenceHeight = authored.position.y ?? 0;
    let spawn: CityPoint = authored.position;
    // Empty maps can be previewed; playable maps get a safe on-road fallback.
    if (this.sampleRoadSurface(spawn.x, spawn.z).surfaceType !== 'asphalt' && this.roadNetwork.segments.length) {
      const road = this.roadNetwork.segments[0]!, a = road.centerline[0]!, c = road.centerline[1]!;
      const dx = c.x - a.x, dz = c.z - a.z, length = Math.hypot(dx, dz);
      spawn = { x: (a.x + c.x) / 2 - dz / length * road.laneWidth / 2, y: ((a.y ?? 0) + (c.y ?? 0)) / 2, z: (a.z + c.z) / 2 + dx / length * road.laneWidth / 2 };
      this.referenceHeight = spawn.y ?? 0;
    }
    this.spawnPose = { position: new Vector3(spawn.x, this.getRoadHeightAt(spawn.x, spawn.z) + 0.04, spawn.z), yawRadians: authored.rotation };
    if (!this.editor) this.sectors.updatePosition(spawn.x, spawn.z);
  }
  private addArea(b: DrivingGround['worldBounds'], area: SurfaceArea): void {
    const size = this.data.sectorSize;
    for (let x = Math.floor(b.minX / size); x <= Math.floor(b.maxX / size); x++) for (let z = Math.floor(b.minZ / size); z <= Math.floor(b.maxZ / size); z++) {
      const key = `${x},${z}`, bucket = this.surfaces.get(key) ?? []; bucket.push(area); this.surfaces.set(key, bucket);
    }
  }
  sampleRoadSurface(x: number, z: number, direction: { x: number; y: number } = { x: 0, y: -1 }, referenceHeight = this.referenceHeight): RoadSurfaceSample {
    const areas = this.surfaces.get(`${Math.floor(x / this.data.sectorSize)},${Math.floor(z / this.data.sectorSize)}`);
    let selected: SurfaceArea | undefined, best = Infinity, height = 0;
    if (areas) for (const area of areas) if (area.contains(x, z)) {
      const y = area.heightAt(x, z), delta = Math.abs(y - referenceHeight);
      // A nearby support plane follows continuous ramps; a distant upper deck cannot capture a ground vehicle.
      if (delta > 1.75) continue;
      // Segment end caps fill bend seams but must not hold a car at the previous ramp sample's height.
      const score = delta + (area.extensionAt?.(x, z) ?? 0) * 10 + (area.pavement ? 0.2 : 0);
      if (score < best) { best = score; selected = area; height = y; }
    }
    const gx = selected?.gx ?? 0, gz = selected?.gz ?? 0, length = Math.hypot(direction.x, direction.y) || 1;
    return { height, gradient: new Vector2(gx, gz), normal: new Vector3(-gx, 1, -gz).normalize(), grade: (gx * direction.x + gz * direction.y) / length,
      ...surfaceResponseAliases(SURFACE_MATERIALS[selected ? selected.pavement ? 'concrete' : 'asphalt' : 'grass']) };
  }
  getRoadHeightAt(x: number, z: number): number { return this.sampleRoadSurface(x, z).height; }
  getRoadPitchAt(x: number, z: number, yaw: number): number { return Math.atan(this.sampleRoadSurface(x, z, { x: -Math.sin(yaw), y: -Math.cos(yaw) }).grade); }
  setSurfaceReferenceHeight(height: number): void { this.referenceHeight = height; }
  update(dt: number): void { this.sectors.update(dt); }
  updatePlayerPosition(x: number, z: number): boolean {
    if (!this.editor && this.sectors.updatePosition(x, z)) return true;
    return false;
  }
  dispose(): void {
    this.sectors.dispose(); this.prefabs.dispose();
    this.root.traverse(o => { if (o instanceof Mesh) o.geometry.dispose(); });
    for (const material of Object.values(this.materials)) material.dispose();
    this.root.clear();
  }
}
