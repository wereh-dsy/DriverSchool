import { Group, Mesh, MeshBasicMaterial, Vector2, Vector3 } from 'three';
import type { DrivingGround } from '../DrivingGround';
import { SURFACE_MATERIALS, surfaceResponseAliases, type RoadSurfaceSample } from '../SurfaceMaterial';
import { createSubject3Materials } from '../subject3/materials';
import type { CityMapData, CityPoint } from './CityMapData';
import { loadCityMap } from './CityMapLoader';
import { buildCityRoadNetwork } from './CityRoadNetwork';
import { junctionExtent, roadEdges, rotatePoint } from './geometry';
import { PrefabRegistry } from './PrefabRegistry';
import { SectorManager, type SectorOptions } from './SectorManager';
import { roadStructureColliders } from './RoadInfrastructure';
import { roadSignColliders } from './RoadSignTemplates';

import { RoadClearance } from './RoadClearance';
import { cityGroundGeometry } from './CityGroundGeometry';
import {junctionSurfaceContains,junctionSurfaceHeight,compileJunctionSurface} from './JunctionSurface';
import { createStaticOBBCollider } from '../../vehicle/physics/CollisionSystem';

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
  private readonly materials = { ...createSubject3Materials(), tunnelLight: new MeshBasicMaterial({color:0xffefd0}) };
  private readonly prefabs = new PrefabRegistry(this.materials);
  private readonly surfaces = new Map<string, SurfaceArea[]>();
  private readonly editor: boolean;
  private referenceHeight = 0;
  constructor(data: unknown, options: SectorOptions & { spawnId?: string } = {}) {
    this.data = loadCityMap(data); this.editor = options.editor ?? false;
    this.worldBounds = this.data.bounds;
    this.metadata = { id: this.data.id, version: this.data.version, displayName: this.data.name, description: 'Data-driven City Map' };
    this.roadNetwork = buildCityRoadNetwork(this.data);
    this.root.name = this.data.name; this.root.userData.renderCategory = 'WORLD';
    const base = new Mesh(cityGroundGeometry(this.data), this.materials.grass);
    base.receiveShadow = true; this.root.add(base);
    this.sectors = new SectorManager(this.data, this.materials, this.prefabs, options); this.root.add(this.sectors.root);
    const clearance = new RoadClearance(this.data);
    this.colliders = [...this.data.objects.flatMap(o => { const c = this.prefabs.collider(o); return c ? [c] : []; }), ...this.data.roads.flatMap(r => roadStructureColliders(r, this.data, clearance)),...(this.data.signs??[]).flatMap(roadSignColliders)];
    for(const j of this.data.intersections.filter(j=>j.channelized))for(const sign of [-1,1]) {
      const h=junctionExtent(j,this.data),q=rotatePoint({x:sign*(h-2.5),z:sign*(h-2.5)},j.rotation);
      this.colliders.push(createStaticOBBCollider({id:j.id+':island:'+sign,x:j.position.x+q.x,z:j.position.z+q.z,width:2,length:2,yaw:j.rotation,minHeight:j.position.y??0,maxHeight:(j.position.y??0)+0.18,type:'obstacle'}));
    }
    const junctionMasks=new Map(this.data.intersections.filter(j=>j.pavementFootprint).map(j=>[j.id,compileJunctionSurface(j)]));
    for (const road of this.roadNetwork.segments) {
      const source = this.data.roads.find(r => r.id === road.id)!;
      const edges = roadEdges(source);
      const sidewalk = source.sidewalk?.enabled ? source.sidewalk.width : 0;
      const masks=[road.startIntersectionId,road.endIntersectionId].flatMap(id=>id&&junctionMasks.has(id)?[junctionMasks.get(id)!]:[]);
      for (let i = 1; i < road.centerline.length; i++) {
        const a = road.centerline[i - 1]!, c = road.centerline[i]!, dx = c.x - a.x, dz = c.z - a.z, squared = dx * dx + dz * dz;
        const dy = (c.y ?? 0) - (a.y ?? 0);
        const extensionAt = (x: number, z: number) => { const t = ((x - a.x) * dx + (z - a.z) * dz) / squared; return Math.max(0, -t, t - 1) * Math.sqrt(squared); };
        const heightAt = (x: number, z: number) => (a.y ?? 0) + dy * Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / squared));
        const contains = (extra: number) => (x: number, z: number) => {
          const along=((x-a.x)*dx+(z-a.z)*dz)/squared;
          if(i===1&&road.startIntersectionId&&along<0||i===road.centerline.length-1&&road.endIntersectionId&&along>1)return false;
          for(const mask of masks)if(mask.contains(x,z)&&Math.abs(mask.heightAt(x,z)-heightAt(x,z))<=.5)return false;
          const t = Math.max(0, Math.min(1, along));
          const offset = (-(x - a.x) * dz + (z - a.z) * dx) / Math.sqrt(squared);
          const radius = (offset < 0 ? -edges.left : edges.right) + extra;
          return (x - a.x - dx * t) ** 2 + (z - a.z - dz * t) ** 2 <= radius * radius;
        };
        const margin = Math.max(-edges.left, edges.right) + sidewalk;
        const bounds = { minX: Math.min(a.x, c.x) - margin, maxX: Math.max(a.x, c.x) + margin, minZ: Math.min(a.z, c.z) - margin, maxZ: Math.max(a.z, c.z) + margin };
        this.addArea(bounds, { contains: contains(0), pavement: false, heightAt, extensionAt, gx: dy * dx / squared, gz: dy * dz / squared });
        if (sidewalk) this.addArea(bounds, { contains: contains(sidewalk), pavement: true, heightAt, extensionAt, gx: dy * dx / squared, gz: dy * dz / squared });
      }
    }
    for (const j of this.data.intersections) {
      if(j.pavementFootprint){
        const outline=j.pavementFootprint.map(p=>rotatePoint(p,j.rotation)),base=j.position.y??0;
        for(let i=0;i<outline.length;i++){
          const a=outline[i]!,b=outline[(i+1)%outline.length]!,den=a.x*b.z-a.z*b.x;if(Math.abs(den)<1e-8)continue;
          const gx=((a.y??0)*b.z-(b.y??0)*a.z)/den,gz=(a.x*(b.y??0)-b.x*(a.y??0))/den;
          this.addArea({minX:j.position.x+Math.min(0,a.x,b.x),maxX:j.position.x+Math.max(0,a.x,b.x),minZ:j.position.z+Math.min(0,a.z,b.z),maxZ:j.position.z+Math.max(0,a.z,b.z)},{pavement:false,gx,gz,heightAt:(x,z)=>base+gx*(x-j.position.x)+gz*(z-j.position.z),contains:(x,z)=>{const qx=x-j.position.x,qz=z-j.position.z,u=(qx*b.z-qz*b.x)/den,v=(a.x*qz-a.z*qx)/den;return u>=-1e-6&&v>=-1e-6&&u+v<=1+1e-6;}});
        }
        continue;
      }
      const h = junctionExtent(j, this.data), extent = h * (Math.abs(Math.cos(j.rotation)) + Math.abs(Math.sin(j.rotation)));
      this.addArea({ minX: j.position.x - extent, maxX: j.position.x + extent, minZ: j.position.z - extent, maxZ: j.position.z + extent }, {
        pavement: false, heightAt: (x,z) => junctionSurfaceHeight(j,{x,z}), gx: 0, gz: 0, contains: (x, z) => junctionSurfaceContains(j,this.data,{x,z}),
      });
    }
    for (const o of this.data.objects) if (o.prefabId === 'parking') {
      const w = 15 * (o.scale?.x ?? 1), d = 12 * (o.scale?.z ?? 1), e = Math.hypot(w, d);
      this.addArea({ minX: o.position.x - e, maxX: o.position.x + e, minZ: o.position.z - e, maxZ: o.position.z + e }, { pavement: false, heightAt: () => o.position.y ?? 0, gx: 0, gz: 0,
        contains: (x, z) => { const p = rotatePoint({ x: x - o.position.x, z: z - o.position.z }, -o.rotation); return Math.abs(p.x) <= w && Math.abs(p.z) <= d; } });
    }
    const authored = this.data.environment.spawnPoints.find(s=>s.id===options.spawnId) ?? this.data.environment.spawnPoints[0]!;
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
