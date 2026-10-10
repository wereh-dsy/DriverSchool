import { BoxGeometry, BufferGeometry, CylinderGeometry, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Mesh, type MeshBasicMaterial } from 'three';
import { createStripGeometry, makeMarkingRibbon } from '../subject3/geometry';
import type { Subject3Materials } from '../subject3/materials';
import type { CityMapData, CityPoint, CityRoad } from './CityMapData';
import { polylineLength, roadEdges, roadPoints, sampleAt } from './geometry';
import { barrierSections, roadPiers, retainingWallHeight } from './RoadInfrastructure';

import { barrierOffset, RoadClearance } from './RoadClearance';
import { MarkingOwnership } from './MarkingOwnership';
import {clipRoadJunctionPavement} from './JunctionSurface';

/** Shared editor/runtime builder. SectorManager batches its output by material. */
export class RoadBuilder {
  private readonly clearance?: RoadClearance;
  private readonly ownership?: MarkingOwnership;
  constructor(private readonly materials: Subject3Materials & {tunnelLight?:MeshBasicMaterial}, private readonly map?: CityMapData) { this.clearance = map ? new RoadClearance(map) : undefined;this.ownership=map?new MarkingOwnership(map):undefined; }
  build(road: CityRoad): Group {
    const root = new Group(), points = roadPoints(road), half = road.laneCount * road.laneWidth / 2;
    const edges = roadEdges(road);
    root.name = road.id;
    const add = (mesh: Mesh | null) => { if (mesh) root.add(mesh); };
    const pavement = createStripGeometry(points, () => 0, { innerOffset: edges.left, outerOffset: edges.right, yOffset: 0.024, maximumSpacing: 3 });
    if (pavement) { const mesh = new Mesh(this.map?clipRoadJunctionPavement(pavement,road,this.map):pavement, this.materials.asphalt); mesh.name='road pavement';mesh.userData.pavementOwner=road.id;mesh.receiveShadow = true; add(mesh); }
    const mergePaint = !!road.gore || !!this.map?.roads.some(r=>r.groupId===road.groupId && r.gore);
    const line = (path: CityPoint[], offset: number, yellow = false) => {
      const paint = (section: CityPoint[],owner:'road'|'merge'='road') => {
        const mesh=makeMarkingRibbon(owner==='road'?'road paint':'merge divider',section,0.12,yellow?this.materials.yellowPaint:this.materials.whitePaint,()=>0,0.008,offset);
        if(mesh){mesh.userData.markingOwner=owner;mesh.userData.markingSource=road.id;add(mesh);}
      };
      if(this.ownership) {
        for(const section of this.ownership.sections(path,offset,road,'road'))paint(section);
        if(road.gore)for(const section of this.ownership.sections(path,offset,road,'merge'))paint(section,'merge');
        return;
      }
      if (!mergePaint || !this.clearance) { paint(path); return; }
      const length=polylineLength(path), count=Math.max(1,Math.ceil(length/3));
      let section:CityPoint[]=[];
      for(let i=0;i<count;i++) {
        const a=sampleAt(path,length*i/count).point,b=sampleAt(path,length*(i+1)/count).point,s=sampleAt(path,length*(i+0.5)/count);
        const p={x:s.point.x-s.tangent.z*offset,y:s.point.y??0,z:s.point.z+s.tangent.x*offset};
        if(this.clearance.roadAt(p,0.2,p.y-0.15,p.y+0.15,road.id)) { if(section.length>1) paint(section);section=[];continue; }
        if(!section.length) section.push(a);section.push(b);
      }
      if(section.length>1) paint(section);
    };
    if (road.markings !== false) {
    if (road.travelDirection === 'two-way') { line(points, -0.13, true); line(points, 0.13, true); }
    line(points, -half + 0.15); line(points, half - 0.15);
    const length = polylineLength(points);
    if (road.gore && road.shoulders) {
      for (let d = 6; d < Math.min(road.gore.length, length / 2); d += 6) for (const start of [true, false]) {
        if (!(start ? road.gore.start : road.gore.end)) continue;
        const at = start ? d : length - d, s = sampleAt(points, at);
        const width = road.shoulders.left * Math.min(1, d / 30);
        const offset = -half - width / 2;
        const p = { x:s.point.x-s.tangent.z*offset,y:s.point.y,z:s.point.z+s.tangent.x*offset };
        if (this.clearance?.roadAt(p, 0, (p.y??0)-0.1, (p.y??0)+0.1, road.id)) continue;
        const a = { x:p.x+s.tangent.z*width/2-s.tangent.x*0.5,y:p.y,z:p.z-s.tangent.x*width/2-s.tangent.z*0.5 };
        const b = { x:p.x-s.tangent.z*width/2+s.tangent.x*0.5,y:p.y,z:p.z+s.tangent.x*width/2+s.tangent.z*0.5 };
        if(this.ownership&&this.ownership.ownerAt(p)?.id!==road.id)continue;
        const hatch=makeMarkingRibbon('gore hatch',[a,b],0.18,this.materials.whitePaint,()=>0,0.008);
        if(hatch){hatch.userData.markingOwner='merge';hatch.userData.markingSource=road.id;add(hatch);}
      }
    }
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
      const sections:CityPoint[][]=[];let current:CityPoint[]=[];
      const flush=()=>{if(current.length>1)sections.push(current);current=[];};
      for(let i=0;i<points.length;i++) {
        const a=points[i]!,b=points[Math.min(points.length-1,i+1)]??a,c=i===points.length-1?points[i-1]!:a;
        const dx=b.x-c.x,dz=b.z-c.z,l=Math.hypot(dx,dz)||1;
        const p={x:a.x-dz/l*side*(half+0.1),y:a.y??0,z:a.z+dx/l*side*(half+0.1)};
        if(mergePaint&&this.clearance?.roadAt(p,0.3,p.y-0.2,p.y+0.2,road.id)){flush();continue;}current.push(a);
      }flush();
      const strip = (a: number, b: number, y: number, curb: boolean) => {
        for(const section of sections){const geometry = createStripGeometry(section, () => 0, { innerOffset: Math.min(a, b), outerOffset: Math.max(a, b), yOffset: y, maximumSpacing: 3 });
        if (geometry) { const mesh = new Mesh(this.map?clipRoadJunctionPavement(geometry,road,this.map,y,true):geometry, curb ? this.materials.curb : this.materials.sidewalk); mesh.name=curb?'road curb':'road sidewalk';mesh.receiveShadow = true; root.add(mesh); }}
      };
      strip(side * half, side * (half + road.sidewalk.width), 0.15, false);
      if (road.curb !== false) strip(side * half, side * (half + 0.22), 0.17, true);
    }
    const length = polylineLength(points), elevated = points.some(p => (p.y ?? 0) > 2);
    if (elevated) {
      const bottom = createStripGeometry(points, () => 0, { innerOffset: barrierOffset(road, -1), outerOffset: barrierOffset(road, 1), yOffset: -0.65, maximumSpacing: 3 });
      if (bottom) { const index = bottom.getIndex()!; for (let i = 0; i < index.count; i += 3) { const a = index.getX(i); index.setX(i, index.getX(i + 2)); index.setX(i + 2, a); } bottom.computeVertexNormals(); root.add(new Mesh(bottom, this.materials.curb)); }
      for (const section of barrierSections(road, this.map, this.clearance)) this.wall(root, section.points, barrierOffset(road, section.side), -0.65, 0.02, this.materials.curb);
      const piers = roadPiers(road, this.map, this.clearance);
      if (piers.length) {
        const geometry = road.structure?.pierStyle === 'rectangular' ? new BoxGeometry(1.2, 1, 1.2) : new CylinderGeometry(0.6, 0.6, 1, 8);
        const mesh = new InstancedMesh(geometry, this.materials.curb, piers.length), matrix = new Matrix4(); mesh.name = `${road.id}:piers`;
        piers.forEach((pier, i) => { matrix.makeScale(1, pier.height, 1); matrix.setPosition(pier.position.x, pier.height / 2, pier.position.z); mesh.setMatrixAt(i, matrix); });
        mesh.castShadow = true; root.add(mesh);
      }
    }
    if (road.structure?.barrierEnabled === true || elevated && road.structure?.barrierEnabled !== false) for (const section of barrierSections(road, this.map, this.clearance)) this.wall(root, section.points, barrierOffset(road, section.side), 0.1, 1.1, this.materials.metal);
    const enclosure=road.structure?.enclosure;
    if(enclosure) {
      const walls=enclosure.kind==='cutting'?barrierSections(road,this.map,this.clearance,true):[-1,1].map(side=>({side,points}));
      for(const {side,points:wallPoints} of walls)this.wall(root,wallPoints,barrierOffset(road,side),0,enclosure.kind==='cutting'?p=>retainingWallHeight(road,p,this.clearance):enclosure.clearance,this.materials.wall);
      if(enclosure.kind!=='cutting') {
        for(const underside of [true,false]) {
          const roof=createStripGeometry(points,()=>0,{innerOffset:edges.left-0.3,outerOffset:edges.right+0.3,yOffset:enclosure.clearance+(underside?0:0.65),maximumSpacing:3});
          if(roof) {if(underside) {const index=roof.getIndex()!;for(let i=0;i<index.count;i+=3){const a=index.getX(i);index.setX(i,index.getX(i+2));index.setX(i+2,a);}roof.computeVertexNormals();}root.add(new Mesh(roof,this.materials.wall));}
        }
        const count=Math.floor(length/30), lights=new InstancedMesh(new BoxGeometry(0.3,0.08,1.8),this.materials.tunnelLight??this.materials.signalAmber,count*2),matrix=new Matrix4();
        for(let i=0;i<count;i++)for(let side=0;side<2;side++) {
          const s=sampleAt(points,15+i*30),offset=(side?1:-1)*half*0.6;
          matrix.makeRotationY(Math.atan2(s.tangent.x,s.tangent.z));matrix.setPosition(s.point.x-s.tangent.z*offset,(s.point.y??0)+enclosure.clearance-0.06,s.point.z+s.tangent.x*offset);lights.setMatrixAt(i*2+side,matrix);
        }
        root.add(lights);
      }
    }
    if (road.streetlights) {
      const positions: { x: number; y: number; z: number }[] = [];
      for (let d = 25; d < length - 20; d += 50) {
        const s = sampleAt(points, d), offset = edges.right + (road.sidewalk?.enabled ? road.sidewalk.width : 0) + 0.8;
        const p = { x: s.point.x - s.tangent.z * offset, y: s.point.y ?? 0, z: s.point.z + s.tangent.x * offset };
        if (this.clearance && !this.clearance.permitsProp(p, 0.4, 7.5)) continue;
        if (this.map?.objects.some(o => Math.hypot(o.position.x - p.x, o.position.z - p.z) < 2)) continue;
        positions.push({ ...p, y: p.y + 3.7 });
      }
      if (positions.length) {
        const poles = new InstancedMesh(new CylinderGeometry(0.08, 0.12, 7.4, 8), this.materials.darkMetal, positions.length);
        const heads = new InstancedMesh(new BoxGeometry(0.5, 0.16, 0.85), this.materials.lampHead, positions.length); heads.userData.environmentLamp = true;
        positions.forEach((p, i) => { const matrix = new Matrix4().makeTranslation(p.x, p.y, p.z); poles.setMatrixAt(i, matrix); matrix.setPosition(p.x, p.y + 3.5, p.z); heads.setMatrixAt(i, matrix); }); root.add(poles, heads);
      }
    }
    return root;
  }
  private wall(root: Group, points: CityPoint[], offset: number, bottom: number, top: number | ((p:CityPoint)=>number), material: Subject3Materials['curb']): void {
    const positions: number[] = [], indices: number[] = [];
    // Dense longitudinal samples keep curved side walls and barriers attached to the ribbon.
    const length = polylineLength(points), count = Math.max(1, Math.ceil(length / 3));
    for (let i = 0; i <= count; i++) {
      const s = sampleAt(points, length * i / count), x = s.point.x - s.tangent.z * offset, z = s.point.z + s.tangent.x * offset;
      positions.push(x, (s.point.y ?? 0) + bottom, z, x, (s.point.y ?? 0) + (typeof top==='number'?top:top({x,y:s.point.y,z})), z);
      if (i < count) { const b = i * 2; indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2, b + 2, b + 1, b, b + 2, b + 3, b + 1); }
    }
    const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(positions, 3)); geometry.setIndex(indices);
    // Separate vertices keep the two face normals from cancelling each other.
    const faces = geometry.toNonIndexed(); geometry.dispose(); faces.computeVertexNormals(); root.add(new Mesh(faces, material));
  }
}
