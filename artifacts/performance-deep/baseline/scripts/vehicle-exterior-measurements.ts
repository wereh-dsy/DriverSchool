import * as T from 'three';
import { VEHICLE_CATALOG } from '../src/vehicle/VehicleCatalog';
import { VEHICLE_WHEEL_IDS, localWheelPositions } from '../src/vehicle/VehicleDimensions';
import { buildVehicleStaticExterior, buildVehicleStaticWheels } from '../src/vehicle/visual/VehicleStaticAssets';

/** Measures the production meshes, in loaded ground coordinates; mirrors excluded. */
export function measureVehicleExteriors() {
  return VEHICLE_CATALOG.map(descriptor => {
    const c = descriptor.visualConfig, root = new T.Group();
    buildVehicleStaticExterior(root, c);
    const { pivots } = buildVehicleStaticWheels(root, c);
    root.position.y = c.staticBodyOffsetY ?? 0;
    root.updateMatrixWorld(true);
    const bounds = new T.Box3().setFromObject(root), size = bounds.getSize(new T.Vector3());
    let triangles = 0, meshes = 0, invalidVertices = 0;
    root.traverse(o => {
      if (!(o instanceof T.Mesh)) return;
      meshes++;
      const p = o.geometry.getAttribute('position');
      triangles += (o.geometry.index?.count ?? p.count) / 3;
      for (let i = 0; i < p.count; i++) if (!Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i))) invalidVertices++;
    });
    const anchors = localWheelPositions(c.dimensions);
    const wheels = VEHICLE_WHEEL_IDS.map(id => {
      const pivot = pivots[id], tyre = pivot.children[0] as T.Mesh;
      const center = pivot.getWorldPosition(new T.Vector3());
      const box = new T.Box3().setFromObject(tyre), tyreSize = box.getSize(new T.Vector3());
      // At hub height an outward ray must reach rubber before any body panel.
      const sign = id.endsWith('Left') ? -1 : 1;
      const ray = new T.Raycaster(new T.Vector3(sign * 3, center.y, center.z), new T.Vector3(-sign, 0, 0));
      ray.layers.enableAll();
      const hit = ray.intersectObject(root, true)[0];
      return { id, center: center.toArray(), diameter: tyreSize.y, width: tyreSize.x,
        anchorError: center.distanceTo(new T.Vector3(anchors[id].x, anchors[id].y, anchors[id].z)),
        hubVisible: !!hit && (hit.object === tyre || tyre.getObjectById(hit.object.id) !== undefined),
        firstHit: hit?.object.name };
    });
    // Sample the actual exterior at loaded ride height and the physical bump
    // limit. The tyre crowns must remain uncovered, including steered fronts.
    const clearanceIssues: string[] = [];
    let clearanceRays=0;
    for(const bump of [0,descriptor.physicsConfig.suspension.suspensionTravel*.5]) {
      root.position.y=(c.staticBodyOffsetY??0)-bump;
      for(const id of VEHICLE_WHEEL_IDS) pivots[id].position.y+=bump;
      root.updateMatrixWorld(true);
      for(const id of VEHICLE_WHEEL_IDS) {
        const sign=id.endsWith('Left')?-1:1,center=pivots[id].getWorldPosition(new T.Vector3());
        const tyre=pivots[id].children[0] as T.Mesh,positions=tyre.geometry.getAttribute('position');
        const samples=new Map<string,T.Vector3>();
        // Use rounded rubber vertices, rather than the nonexistent sharp
        // corners of a tyre bounding cylinder (which overstates the shoulder).
        for(let i=0;i<positions.count;i++) {
          const point=new T.Vector3().fromBufferAttribute(positions,i).applyMatrix4(tyre.matrix);
          if(point.y<c.wheelRadius*.67 || sign*point.x<.01)continue;
          const angle=Math.atan2(point.z,point.y);
          if(![-Math.PI/4,0,Math.PI/4].some(a=>Math.abs(angle-a)<.10))continue;
          samples.set(point.toArray().map(n=>n.toFixed(5)).join(','),point);
        }
        for(const steer of id.startsWith('front')?[0,-.5,.5]:[0]) for(const sample of samples.values()) {
          const point=sample.clone().applyAxisAngle(new T.Vector3(0,1,0),steer).add(center);point.y+=.001;
          const ray=new T.Raycaster(new T.Vector3(sign*2,point.y,point.z),new T.Vector3(-sign,0,0),0,2-Math.abs(point.x));
          ray.layers.enableAll();clearanceRays++;
          const hit=ray.intersectObject(root,true).find(h=>!VEHICLE_WHEEL_IDS.some(w=>pivots[w].getObjectById(h.object.id)!==undefined));
          if(hit)clearanceIssues.push(`${id} bump=${bump.toFixed(3)} steer=${steer} sample=${point.toArray().map(n=>n.toFixed(4)).join(',')} hit=${hit.point.toArray().map(n=>n.toFixed(4)).join(',')}: ${hit.object.name}`);
        }
      }
      for(const id of VEHICLE_WHEEL_IDS)pivots[id].position.y-=bump;
    }
    const actual = { length: size.z, width: size.x, height: bounds.max.y,
      wheelBase: wheels[2]!.center[2]! - wheels[0]!.center[2]!,
      frontTrackWidth: wheels[1]!.center[0]! - wheels[0]!.center[0]!,
      rearTrackWidth: wheels[3]!.center[0]! - wheels[2]!.center[0]!,
      wheelDiameter: wheels[0]!.diameter,
      frontOverhang: -c.wheelBase / 2 - bounds.min.z,
      rearOverhang: bounds.max.z - c.wheelBase / 2 };
    const target = { length: c.dimensions.length, width: c.dimensions.width, height: c.dimensions.height,
      wheelBase: c.wheelBase, frontTrackWidth: c.dimensions.frontTrackWidth,
      rearTrackWidth: c.dimensions.rearTrackWidth, wheelDiameter: c.wheelRadius * 2 };
    const errorPercent = Object.fromEntries(Object.entries(target).map(([key, value]) =>
      [key, (actual[key as keyof typeof actual] - value) / value * 100]));
    const geometries = new Set<T.BufferGeometry>(), materials = new Set<T.Material>(), textures = new Set<T.Texture>();
    root.traverse(o => { if (o instanceof T.Mesh) {
      geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
    } });
    for (const m of materials) { for (const value of Object.values(m)) if (value instanceof T.Texture) textures.add(value); m.dispose(); }
    for (const g of geometries) g.dispose();
    for (const t of textures) t.dispose();
    return { id: descriptor.id, name: descriptor.displayName, actual, target, errorPercent, wheels,
      meshes, triangles, invalidVertices,clearanceRays,clearanceIssues };
  });
}
