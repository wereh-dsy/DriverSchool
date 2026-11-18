import * as THREE from 'three';
import { blendSurfaceMaterials, SURFACE_MATERIALS, type SurfaceMaterial, type SurfaceType } from '../SurfaceMaterial';
import { MountainRoute, smooth, type RouteHit } from './MountainRoute';

const COLORS: Partial<Record<SurfaceType, THREE.Color>> = {
  asphalt: new THREE.Color(0x484a47), 'compact-gravel': new THREE.Color(0x9d9683),
  'loose-gravel': new THREE.Color(0xb2a087), dirt: new THREE.Color(0x967653),
  'damp-dirt': new THREE.Color(0x64513b), grass: new THREE.Color(0x6d7952),
};
export const SERVICE = Object.freeze({ x: 0, z: 704, halfX: 40, halfZ: 30, height: 2 });
export const serviceDistance = (x: number, z: number): number => Math.hypot(
  Math.max(0, Math.abs(x - SERVICE.x) - SERVICE.halfX),
  Math.max(0, Math.abs(z - SERVICE.z) - SERVICE.halfZ));

/** Uses the shared contact material contract; no second grip multiplier or force model. */
export class MountainSurface {
  private readonly keys;
  constructor(readonly route: MountainRoute) {
    this.keys = new Map(route.paths.map(p => [p, p.surfaceKeys()]));
  }
  roadMaterial(hit: RouteHit): SurfaceMaterial {
    const keys = this.keys.get(hit.route)!;
    let response = SURFACE_MATERIALS[keys[0]![1]];
    for (let i = 1; i < keys.length; i++) {
      const [s, type] = keys[i]!;
      const width = type === 'asphalt' || type === 'compact-gravel' ? 65 : 40;
      if (hit.s < s - width / 2) break;
      response = blendSurfaceMaterials(response, SURFACE_MATERIALS[type], smooth((hit.s - s + width / 2) / width));
    }
    // The worn paving fades in colour and response over tens of metres.
    return response;
  }
  materialAt(x: number, z: number): SurfaceMaterial {
    const hit = this.route.nearest(x, z);
    let response: SurfaceMaterial = SURFACE_MATERIALS.grass;
    if (hit) {
      const road = this.roadMaterial(hit);
      const edge = hit.distance - hit.route.width(hit.s) / 2;
      const shoulder = blendSurfaceMaterials(road, SURFACE_MATERIALS['loose-gravel'], smooth(edge / 0.9));
      response = blendSurfaceMaterials(shoulder, SURFACE_MATERIALS.grass, smooth((edge - 0.9) / 1.6));
    }
    return blendSurfaceMaterials(response, SURFACE_MATERIALS.asphalt, 1 - smooth(serviceDistance(x, z) / 1.2));
  }
  colorAt(x: number, z: number): THREE.Color {
    // Regional colours follow the authored hillside/valley, with soft boundaries.
    const color = new THREE.Color(0x6d7952);
    color.lerp(new THREE.Color(0x8b8870), smooth((-x - 350) / 550) * smooth((550 - z) / 500));
    color.lerp(new THREE.Color(0x8d8065), smooth((-z - 450) / 300));
    color.lerp(new THREE.Color(0x9a815f), smooth((x - 400) / 500) * smooth((450 - z) / 600));
    color.lerp(new THREE.Color(0x5f6548), smooth((x - 300) / 400) * smooth((z - 350) / 300));
    const hit = this.route.nearest(x, z);
    if (hit) {
      const keys = this.keys.get(hit.route)!;
      let road = COLORS[keys[0]![1]]!.clone();
      for (let i = 1; i < keys.length; i++) {
        const [s, type] = keys[i]!;
        if (hit.s < s - 40) break;
        road.lerp(COLORS[type]!, smooth((hit.s - s + 40) / 80));
      }
      const edge = hit.distance - hit.route.width(hit.s) / 2;
      const shoulder = COLORS['loose-gravel']!.clone().lerp(road, 1 - smooth(edge / 1.1));
      color.lerp(shoulder, 1 - smooth((edge - 0.8) / 1.7));
    }
    color.lerp(COLORS.asphalt!, 1 - smooth(serviceDistance(x, z) / 1));
    // Small deterministic colour variation only; never random terrain elevations.
    const fleck = Math.sin(x * 1.7 + z * 0.23) * Math.sin(z * 1.3 - x * 0.17);
    return color.multiplyScalar(1 + fleck * 0.025);
  }
}
