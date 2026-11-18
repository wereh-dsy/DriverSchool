import { drain } from '../../loading/Loading';
import { BoxGeometry, BufferGeometry, CylinderGeometry, Group, InstancedMesh, Matrix4, Mesh, type MeshBasicMaterial } from 'three';
import { makeMarkingRibbon } from '../subject3/geometry';
import type { Subject3Materials } from '../subject3/materials';
import type { CityMapData, CityPoint, CityRoad } from './CityMapData';
import { polylineLength, roadEdges, roadPoints, sampleAt } from './geometry';
import { barrierSectionSteps, centralBarrierSectionSteps, roadPierSteps,roadLampAnchors,enclosureWallSectionSteps } from './RoadInfrastructure';
import {hasCentralBarrier,innerRoadSide} from './RoadCarriageway';

import { RoadClearance, runtimeRoadClearance } from './RoadClearance';
import { MarkingOwnership } from './MarkingOwnership';
import {RoadsidePlacement} from './RoadsidePlacement';
import {buildHighwayLaneMarkings,buildHighwayGoreMarkings} from '../regional/HighwayLaneRenderer';
import {RoadGeometry,type RoadGeometryTrialSelection} from './RoadGeometry';
import {newCityMap} from './CityMapData';
import { roadCompileSampler } from './RoadCompileSampling';

/** Shared editor/runtime builder. SectorManager batches its output by material. */
export class RoadBuilder {
  private readonly clearance?: RoadClearance;
  private readonly ownership?: MarkingOwnership;
  private readonly placement?:RoadsidePlacement;
  private readonly sharedGeometry=new Map<string,BufferGeometry>();
  private readonly geometrySystem?: RoadGeometry;
  get geometryCacheStatistics(){return this.geometrySystem?.cache.state;}
  private geometry(key:string,create:()=>BufferGeometry):BufferGeometry {let geometry=this.sharedGeometry.get(key);if(!geometry){geometry=create();this.sharedGeometry.set(key,geometry);}return geometry;}
  constructor(private readonly materials: Subject3Materials & {tunnelLight?:MeshBasicMaterial}, private readonly map?: CityMapData, _trial?: RoadGeometryTrialSelection) { this.geometrySystem=map?new RoadGeometry(map,materials):undefined;this.clearance = map ? runtimeRoadClearance(map) : undefined;this.ownership=map?new MarkingOwnership(map):undefined;this.placement=map?new RoadsidePlacement(map,this.clearance):undefined; }
  build(road: CityRoad): Group { return drain(this.buildSteps(road)); }
  *buildSteps(road: CityRoad,trace?:{phase:string}): Generator<void,Group> {
    const root = new Group(), points = roadPoints(road), half = road.laneCount * road.laneWidth / 2;
    const edges = roadEdges(road);
    const continuous=this.geometrySystem??new RoadGeometry({...newCityMap(),roads:[road]},this.materials);
    root.userData.roadGeometrySystem='continuous-v5';
    root.name = road.id;
    if(road.highwayTransition&&this.map)root.add(buildHighwayLaneMarkings(road,this.map,this.materials));
    if(road.gore&&this.map)root.add(buildHighwayGoreMarkings(road,this.map,this.materials));
    const add = (mesh: Mesh | null) => { if (mesh) root.add(mesh); };
    const pavement=continuous.pavement(road);
    const surface=new Mesh(pavement,this.materials.asphalt);surface.name='road pavement';surface.userData.pavementOwner=road.id;surface.receiveShadow=true;root.add(surface);
    yield;
    if(trace){trace.phase='paint';yield;}
    const mergePaint = !!road.gore || !!this.map?.roads.some(r=>r.groupId===road.groupId && r.gore);
    const owner=this.ownership,materials=this.materials,clearance=this.clearance;
    function* line(path: CityPoint[], offset: number, yellow = false):Generator<void> {
      const paint = (section: CityPoint[],owner:'road'|'merge'='road') => {
        const mesh=makeMarkingRibbon(owner==='road'?'road paint':'merge divider',section,0.12,yellow?materials.yellowPaint:materials.whitePaint,()=>0,0.008,offset);
        if(mesh){mesh.userData.markingOwner=owner;mesh.userData.markingSource=road.id;add(mesh);}
      };
      if(owner) {
        const boundary=Math.abs(Math.abs(offset)-(half-.15))<1e-6;
        for(const section of (yield* owner.sectionSteps(path,offset,road,'road',boundary,yellow)))paint(section);
        if(road.gore)for(const section of (yield* owner.sectionSteps(path,offset,road,'merge',boundary)))paint(section,'merge');
        return;
      }
      if (!mergePaint || !clearance) { paint(path); return; }
      const length=polylineLength(path), count=Math.max(1,Math.ceil(length/3));
      let section:CityPoint[]=[];
      for(let i=0;i<count;i++) {
        const a=sampleAt(path,length*i/count).point,b=sampleAt(path,length*(i+1)/count).point,s=sampleAt(path,length*(i+0.5)/count);
        const p={x:s.point.x-s.tangent.z*offset,y:s.point.y??0,z:s.point.z+s.tangent.x*offset};
        if(clearance.roadAt(p,0.2,p.y-0.15,p.y+0.15,road.id)) { if(section.length>1) paint(section);section=[];continue; }
        if(!section.length) section.push(a);section.push(b);
      }
      if(section.length>1) paint(section);
    };
    if (road.markings !== false&&!road.highwayTransition) {
    if (road.travelDirection === 'two-way') {
      if(hasCentralBarrier(road)){yield* line(points,-.27);yield* line(points,.27);}
      else {yield* line(points,-.13,true);yield* line(points,.13,true);}
    }
    yield* line(points, -half + 0.15); yield* line(points, half - 0.15);
    const length = polylineLength(points);
    const sample=roadCompileSampler(points);
    if (road.gore && road.shoulders && !this.map) {
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
        yield;
        const end = Math.min(d + 3, length), path: CityPoint[] = [sample(d).point];
        // Include bends inside a dash, rather than drawing a chord through them.
        for (let s = d + 0.75; s < end; s += 0.75) path.push(sample(s).point);
        path.push(sample(end).point);
        yield* line(path, -half + lane * road.laneWidth);
      }
    }
    }
    if(trace){trace.phase='sidewalk';yield;}
    continuous.sidewalks(root,road);
    const length = polylineLength(points), elevated = points.some(p => (p.y ?? 0) > 2);
    if(trace){trace.phase='bridge';yield;}
    if (elevated) {
      continuous.deck(root,road);
      const piers = (yield* roadPierSteps(road, this.map, this.clearance));
      if (piers.length) {
        const geometry = road.structure?.pierStyle === 'rectangular' ? this.geometry('pier-rectangular',()=>new BoxGeometry(1.2, 1, 1.2)) : this.geometry('pier-round',()=>new CylinderGeometry(0.6, 0.6, 1, 8));
        const mesh = new InstancedMesh(geometry, this.materials.curb, piers.length), matrix = new Matrix4(); mesh.name = `${road.id}:piers`;mesh.userData.roadStructureKind='bridge-piers';
        piers.forEach((pier, i) => { matrix.makeScale(1, pier.height, 1); matrix.setPosition(pier.position.x, pier.baseY+ pier.height / 2, pier.position.z); mesh.setMatrixAt(i, matrix); });
        mesh.castShadow = true; root.add(mesh);
      }
    }
    if(trace){trace.phase='barrier';yield;}
    if (road.structure?.barrierEnabled === true || elevated && road.structure?.barrierEnabled !== false) for (const section of (yield* barrierSectionSteps(road, this.map, this.clearance))) {
      const concrete=road.structure?.barrierStyle==='concrete'||road.travelDirection!=='two-way'&&section.side===innerRoadSide(road)&&road.structure?.medianBarrierStyle==='concrete';
      continuous.barrier(root,section.points,section.side,concrete,section.kind==='shared-median',()=>this.geometry('continuous-guardrail-post',()=>new BoxGeometry(.08,1.05,.1)));
    }
    for(const section of (yield* centralBarrierSectionSteps(road,this.map,this.clearance))){
      continuous.median(root,section);
    }
    if(trace){trace.phase='enclosure';yield;}
    const enclosure=road.structure?.enclosure;
    if(enclosure) {
      const walls=yield* enclosureWallSectionSteps(road,this.map,this.clearance);
      for(const {side,points:wallPoints} of walls) {
        continuous.enclosureWall(root,road,wallPoints,side);
      }
      if(enclosure.kind!=='cutting') {
        continuous.roof(root,road);
        const count=Math.floor(length/30), lights=new InstancedMesh(this.geometry('tunnel-light',()=>new BoxGeometry(0.3,0.08,1.8)),this.materials.tunnelLight??this.materials.signalAmber,count*2),matrix=new Matrix4();
        for(let i=0;i<count;i++)for(let side=0;side<2;side++) {
          const s=sampleAt(points,15+i*30),offset=(side?1:-1)*half*0.6;
          matrix.makeRotationY(Math.atan2(s.tangent.x,s.tangent.z));matrix.setPosition(s.point.x-s.tangent.z*offset,(s.point.y??0)+enclosure.clearance-0.06,s.point.z+s.tangent.x*offset);lights.setMatrixAt(i*2+side,matrix);
        }
        root.add(lights);
      }
    }
    if(trace){trace.phase='fixtures';yield;}
    if (road.streetlights) {
      const positions: { x: number; y: number; z: number }[] = [];
      if(this.map)for(const p of roadLampAnchors(road,this.map,this.clearance,(point,radius,height,roadId)=>this.placement?.permits(point,radius,height,roadId)??true))positions.push({...p,y:(p.y??0)+3.7});
      else
      for (let d = 25; d < length - 20; d += 50) {
        const s = sampleAt(points, d), offset = edges.right + (road.sidewalk?.enabled ? road.sidewalk.width : 0) + 0.8;
        const p = { x: s.point.x - s.tangent.z * offset, y: s.point.y ?? 0, z: s.point.z + s.tangent.x * offset };
        if (this.clearance && !this.clearance.permitsProp(p, 0.4, 7.5)) continue;
        if(this.placement&&!this.placement.permits(p,.4,7.5))continue;
        positions.push({ ...p, y: p.y + 3.7 });
      }
      if (positions.length) {
        const poles = new InstancedMesh(this.geometry('lamp-pole',()=>new CylinderGeometry(0.08, 0.12, 7.4, 8)), this.materials.darkMetal, positions.length);
        const heads = new InstancedMesh(this.geometry('lamp-head',()=>new BoxGeometry(0.5, 0.16, 0.85)), this.materials.lampHead, positions.length); heads.userData.environmentLamp = true;
        positions.forEach((p, i) => { const matrix = new Matrix4().makeTranslation(p.x, p.y, p.z); poles.setMatrixAt(i, matrix); matrix.setPosition(p.x, p.y + 3.5, p.z); heads.setMatrixAt(i, matrix); }); root.add(poles, heads);
      }
    }
    if(road.id.startsWith('regional:')&&road.laneCount>1&&!road.structure?.enclosure){
      const positions:CityPoint[]=[];
      for(const section of (yield* barrierSectionSteps(road,this.map,this.clearance))){
        const length=polylineLength(section.points);
        for(let d=8;d<length;d+=50)positions.push(sampleAt(section.points,d).point);
      }
      if(positions.length){
        const bodies=new InstancedMesh(this.geometry('reflector-body',()=>new BoxGeometry(.12,.85,.12)),this.materials.curb,positions.length);
        const caps=new InstancedMesh(this.geometry('reflector-cap',()=>new BoxGeometry(.14,.16,.14)),this.materials.whitePaint,positions.length);
        positions.forEach((p,i)=>{const m=new Matrix4().makeTranslation(p.x,(p.y??0)+.55,p.z);bodies.setMatrixAt(i,m);m.setPosition(p.x,(p.y??0)+1,p.z);caps.setMatrixAt(i,m);});bodies.name='highway reflector posts';caps.name='highway reflector caps';root.add(bodies,caps);
      }
    }
    if(trace){trace.phase='projection';yield;}
    yield* continuous.finishRoadSteps(root,road,pavement);
    return root;
  }
}
