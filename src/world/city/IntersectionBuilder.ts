import { Group, Mesh, PlaneGeometry, BufferGeometry, Float32BufferAttribute } from 'three';
import { makeBox, makeDirectionArrow, makeMarkingRectangle } from '../subject3/geometry';
import type { Subject3Materials } from '../subject3/materials';
import { armControlKind, Subject3TrafficSignals } from '../subject3/trafficSignals';
import { INTERSECTION_LANES, type CityIntersection, type CityMapData } from './CityMapData';
import { junctionExtent, polylineLength, portsFor, roadPoints, rotatePoint, sampleAt } from './geometry';
import { insideIntersectionMarkingFootprint } from './MarkingOwnership';
import {junctionSurfaceHeight,junctionApproachExtent} from './JunctionSurface';
import {CityTrafficSignals} from './CityTrafficSignals';
import { approachPaintOffsets } from './SignalPlacement';

export class IntersectionBuilder {
  constructor(private readonly map: CityMapData, private readonly materials: Subject3Materials) {}
  build(j: CityIntersection, signals?: Subject3TrafficSignals, index = 0): Group {
    const root = new Group(), h = junctionExtent(j, this.map);
    root.name = j.id; root.position.set(j.position.x, j.position.y ?? 0, j.position.z); root.rotation.y = j.rotation;
    const outline=j.pavementFootprint;
    let pavement:BufferGeometry=new PlaneGeometry(h*2,h*2);
    if(outline){pavement.dispose();pavement=new BufferGeometry();pavement.setAttribute('position',new Float32BufferAttribute([0,0,0,...outline.flatMap(p=>[p.x,p.y??0,p.z])],3));pavement.setIndex(outline.flatMap((_,i)=>[0,(i+1)%outline.length+1,i+1]));pavement.computeVertexNormals();}
    const asphalt = new Mesh(pavement, this.materials.asphalt);
    asphalt.name='junction pavement';asphalt.userData.pavementOwner=j.id;
    asphalt.rotation.x = outline?0:-Math.PI / 2; asphalt.position.y = 0.024; asphalt.receiveShadow = true; root.add(asphalt);
    if(j.channelized)for(const sign of [-1,1])root.add(makeBox('channelization island',[2,0.18,2],[sign*(h-2.5),0.09,sign*(h-2.5)],this.materials.curb,true));
    const paint = (x: number, z: number, yaw: number, width: number, depth: number,role:string,port:string) => {
      const paintHeight=(x:number,z:number)=>{const q=rotatePoint({x,z},j.rotation);return junctionSurfaceHeight(j,{x:j.position.x+q.x,z:j.position.z+q.z})-(j.position.y??0);};
      const mesh = makeMarkingRectangle(role,{x,z},yaw,width,depth,this.materials.whitePaint,paintHeight,0.008);
      if(mesh){mesh.userData.markingOwner='intersection';mesh.userData.markingSource=j.id;mesh.userData.markingRole=role;mesh.userData.approachPort=port;root.add(mesh);}
    };
    // Adjacent crosswalks can overlap on very acute or kinked approaches.
    // Paint only the first one; the other approach still gets its stop line.
    const crosswalkBoxes: { x: number; z: number; right: { x: number; z: number }; width: number }[] = [];
    const crosswalkOverlaps = (a: { x: number; z: number; right: { x: number; z: number }; width: number }, b: { x: number; z: number; right: { x: number; z: number }; width: number }): boolean => {
      const axes = [a.right, { x: -a.right.z, z: a.right.x }, b.right, { x: -b.right.z, z: b.right.x }];
      const dx = b.x - a.x, dz = b.z - a.z;
      for (const axis of axes) {
        const ra = Math.abs(axis.x * a.right.x + axis.z * a.right.z) * a.width / 2 + Math.abs(axis.x * -a.right.z + axis.z * a.right.x) * 1.5;
        const rb = Math.abs(axis.x * b.right.x + axis.z * b.right.z) * b.width / 2 + Math.abs(axis.x * -b.right.z + axis.z * b.right.x) * 1.5;
        if (Math.abs(dx * axis.x + dz * axis.z) > ra + rb) return false;
      }
      return true;
    };
    for (const port of portsFor(j)) {
      const c = j.connections.find(c => c.port === port), r = this.map.roads.find(r => r.id === c?.roadId);
      if(!c||!r)continue;
      // Approach heading comes from the actual road tangent at its mouth, not
      // the nominal port. Skewed/edited approaches must not get cardinal paint.
      const path=roadPoints(r), start=c.end==='start', endpoint=start?path[0]!:path.at(-1)!, neighbour=start?path[1]??path[0]!:path.at(-2)??path.at(-1)!;
      const ox=neighbour.x-endpoint.x, oz=neighbour.z-endpoint.z, ol=Math.hypot(ox,oz)||1;
      // `d` points outwards along the arm; the served approach travels along -d.
      // `right` is the approach's right-hand normal so approach lanes stay on one side.
      const d = rotatePoint({x:ox/ol,z:oz/ol},-j.rotation), right = { x: d.z, z: -d.x }, yaw = Math.atan2(d.x, d.z);
      const h=junctionApproachExtent(j,this.map,port);
      // Paint must follow the authoritative pavement boundary. The actual
      // approach mouth is the road endpoint, not a fixed offset from center.
      const localMouth=j.approachOffsets?.[port]??rotatePoint({x:endpoint.x-j.position.x,z:endpoint.z-j.position.z},-j.rotation);
      const mouthWorld=rotatePoint(localMouth,j.rotation),outwardWorld=rotatePoint(d,j.rotation);
      const {paintApproach,crossOffset,stopOffset}=approachPaintOffsets(this.map,j,{x:j.position.x+mouthWorld.x,y:j.position.y,z:j.position.z+mouthWorld.z},outwardWorld);
      const width = r ? r.laneCount * r.laneWidth : INTERSECTION_LANES[j.type] * 3.5;
      const laneWidth = r?.laneWidth ?? 3.5;
      const laneCount = r?.laneCount ?? INTERSECTION_LANES[j.type];
      const incoming = !r || r.travelDirection === 'two-way' || (r.travelDirection === 'forward') === (c?.end === 'end');
      // Entering traffic moves along -d: stop line, zebra, then pavement.
      // Arrows stay farther out. Nothing is placed inside the conflict box.
      const crosswalk = { x: localMouth.x + d.x * crossOffset, z: localMouth.z + d.z * crossOffset, right, width };
      const drawCrosswalk = j.signalized && paintApproach && !crosswalkBoxes.some(box => crosswalkOverlaps(crosswalk, box));
      if(drawCrosswalk)crosswalkBoxes.push(crosswalk);
      if(drawCrosswalk)for (let offset = -width / 2 + 0.6; offset < width / 2; offset += 1.15) paint(crosswalk.x + right.x * offset, crosswalk.z + right.z * offset, yaw, 0.55, 3,'crosswalk',port);
      if (incoming&&r&&c) {
        const twoWay = !r || r.travelDirection === 'two-way', approachWidth = twoWay ? width / 2 : width;
        const lateral = twoWay ? width / 4 : 0;
        if(j.signalized&&paintApproach)paint(localMouth.x+d.x * stopOffset + right.x * lateral,localMouth.z+d.z * stopOffset + right.z * lateral,yaw,approachWidth-0.25,0.35,'stop line',port);
        const count = twoWay ? laneCount / 2 : laneCount;
        const approach=j.approaches?.[port];
        for (let lane = 0; lane < Math.min(count,approach?.lanes.length??0); lane++) {
          const offset = twoWay ? (lane + 0.5) * laneWidth : -width / 2 + (lane + 0.5) * laneWidth;
          if(polylineLength(roadPoints(r))<(approach?.arrowDistance??30)+5)continue;
          const path=roadPoints(r);if(c.end==='end')path.reverse();
          const s=sampleAt(path,(approach?.arrowDistance??30)-1);
          const local=rotatePoint({x:s.point.x-j.position.x+s.tangent.z*offset,z:s.point.z-j.position.z-s.tangent.x*offset},-j.rotation),world=rotatePoint(local,j.rotation);
          const tangent=rotatePoint(s.tangent,-j.rotation),arrowYaw=Math.atan2(tangent.x,tangent.z);
          if(this.map.intersections.some(other=>other.id!==j.id&&insideIntersectionMarkingFootprint(other,this.map,{x:j.position.x+world.x,y:j.position.y,z:j.position.z+world.z},2)))continue;
          const arrowHeight=(x:number,z:number)=>{if(!outline)return 0;const q=rotatePoint({x,z},j.rotation),world={x:j.position.x+q.x,z:j.position.z+q.z},points=roadPoints(r);let best=Infinity,y=j.position.y??0;for(let i=1;i<points.length;i++){const a=points[i-1]!,b=points[i]!,dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((world.x-a.x)*dx+(world.z-a.z)*dz)/(dx*dx+dz*dz))),gap=Math.hypot(world.x-a.x-dx*t,world.z-a.z-dz*t);if(gap<best){best=gap;y=(a.y??0)+((b.y??0)-(a.y??0))*t;}}return y-(j.position.y??0);};
          const arrow=makeDirectionArrow('approach arrow',local,arrowYaw,approach!.lanes[lane]!,4,1.5,this.materials.whitePaint,arrowHeight,0.008);
          if(arrow){arrow.userData.markingOwner='intersection';arrow.userData.markingSource=j.id;arrow.userData.markingRole='arrow';arrow.userData.approachPort=port;arrow.userData.approachLane=lane;root.add(arrow);}
        }
      }
      // Short corner curb returns connect to the road's sidewalk edge.
      if(!outline)for (const side of [-1, 1]) {
        const curb = makeBox('curb transition', [0.22, 0.17, 3.4], [d.x * (h - 2.4) + right.x * side * (width / 2 + 0.11), 0.085, d.z * (h - 2.4) + right.z * side * (width / 2 + 0.11)], this.materials.curb, true);
        curb.rotation.y = yaw; root.add(curb);
      }
      if (j.signalized && signals && incoming) {
        const outward = rotatePoint(d, j.rotation), worldRight = rotatePoint(right, j.rotation);
        const lateral = width / 2 + 1;
        // Far-side pole: beyond the conflict box and the opposite crossing, on the
        // served approach's right, with its arm reaching back over the approach lanes.
        const headHeight=j.signals?.placements?.[port]?.headHeight??(signals instanceof CityTrafficSignals&&j.signals?.profile?Math.max(7.2,j.signals.headHeight??7.2):j.signals?.headHeight??5.8);
        const reach=Math.max(h,Math.hypot(localMouth.x,localMouth.z));
        const base=rotatePoint(localMouth,j.rotation),poleOrigin={x:j.position.x+base.x,z:j.position.z+base.z};
        const placement=j.signals?.placements?.[port];
        const center = placement?.position??(signals instanceof CityTrafficSignals&&j.signals?.profile?signals.placePole(index,outward,worldRight,reach,width,headHeight,poleOrigin):{ x: poleOrigin.x - outward.x * (reach + 1) + worldRight.x * lateral, z: poleOrigin.z - outward.z * (reach + 1) + worldRight.z * lateral });
        signals.addHead(index, { segmentId: r?.id ?? `${j.id}:${port}`, outward, right: worldRight,
          approachYawRadians: yaw + j.rotation, approachLaneCount: r?.travelDirection === 'two-way' ? laneCount / 2 : laneCount, approachLaneWidth: laneWidth, roadWidth: width, controlKind: armControlKind(d) },
          center, placement?.heading??Math.atan2(-outward.x, -outward.z), this.materials, true, headHeight);
        signals.root.children.at(-1)!.position.y = placement?.position.y??j.position.y??0;
      }
    }
    // The closed side of a T gets an uninterrupted sidewalk and curb.
    if (!outline && j.type.startsWith('t_') && !j.portAngles) root.add(makeBox('T closed curb', [h * 2, 0.17, 0.22], [0, 0.085, h], this.materials.curb, true),
      makeBox('T closed sidewalk', [h * 2, 0.14, 2], [0, 0.07, h + 1], this.materials.sidewalk, true));
    return root;
  }
}
