import type { CityMapData, CityIntersection, IntersectionPort } from './CityMapData';
import { newCityMap } from './CityMapData';
import { loadCityMap } from './CityMapLoader';
import { buildCityRoadNetwork } from './CityRoadNetwork';
import { validateMap } from './CityMapValidation';
import { connectionPoint, roadPoints, roadEdges, rotatePoint, polylineLength, sampleAt } from './geometry';
import { junctionSurfaceContains, junctionSurfaceHeight } from './JunctionSurface';
import { insideIntersectionMarkingFootprint } from './MarkingOwnership';
import { IntersectionBuilder } from './IntersectionBuilder';
import { RoadBuilder } from './RoadBuilder';
import { createSubject3Materials } from '../subject3/materials';
import { Mesh } from 'three';
import { drawLogicalRoadLayer } from '../../ui/LogicalRoadMapGeometry';
import { CityGround } from './CityGround';
import { cityMainCrossingIssues } from './CityMain.selftest';
import { VehicleCollisionSystem } from '../../vehicle/physics/CollisionSystem';
const assert=(v:unknown,message:string)=>{if(!v)throw new Error('City V4.1: '+message);};
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function fixture(counts:number[],angles:number[]):CityMapData {
  const map=newCityMap(),ports:IntersectionPort[]=counts.length===3?['north','east','west']:['north','east','south','west','extra'];
  const j:CityIntersection={id:'test-junction',position:{x:0,y:0,z:0},rotation:.17,type:counts.length===5?'irregular':counts.length===3?'t_4lane':'cross_6lane',signalized:true,connections:[],portAngles:{}};
  map.intersections.push(j);
  counts.forEach((count,i)=>{const port=ports[i]!;j.portAngles![port]=angles[i]!;
    const d=rotatePoint({x:Math.sin(angles[i]!),z:-Math.cos(angles[i]!)},j.rotation);
    map.roads.push({id:'arm-'+i,type:count===6?'urban_6lane':count===4?'urban_4lane':'urban_2lane',laneCount:count,laneWidth:3.5,travelDirection:'two-way',speedLimit:40,sidewalk:{enabled:true,width:2},shoulders:i===0?{left:.6,right:1.2}:undefined,elevationMode:'ground',centerline:[{x:d.x*100,y:0,z:d.z*100},{x:0,y:0,z:0}]});
    j.connections.push({roadId:'arm-'+i,end:'end',port});
  });
  return loadCityMap(map);
}
function verifyGeometry(map:CityMapData):{junctions:number;roadTriangles:number} {
  const materials=createSubject3Materials(),builder=new RoadBuilder(materials,map),junctionBuilder=new IntersectionBuilder(map,materials);
  let roadTriangles=0;
  const pavementSamples:{owner:string;points:{x:number;z:number}[]}[]=[];
  try{
    for(const j of map.intersections){
      assert(j.pavementFootprint&&j.pavementFootprint.length>=3,'dynamic outline '+j.id);
      assert(j.markingFootprint?.kind==='polygon'&&equal(j.markingFootprint.points,j.pavementFootprint),'same paint/surface outline '+j.id);
      const root=junctionBuilder.build(j),meshes=root.children.filter(o=>o.name==='junction pavement');
      assert(meshes.length===1,'one visual pavement '+j.id);
      root.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});
      for(let x=-20;x<=20;x+=2)for(let z=-20;z<=20;z+=2){const p={x:j.position.x+x,y:junctionSurfaceHeight(j,{x:j.position.x+x,z:j.position.z+z}),z:j.position.z+z};assert(insideIntersectionMarkingFootprint(j,map,p)===junctionSurfaceContains(j,map,p),'identical suppression at '+j.id);}
    }
    for(const r of map.roads.filter(r=>map.intersections.some(j=>j.connections.some(c=>c.roadId===r.id)))){
      const root=builder.build(r),junctions=map.intersections.filter(j=>j.connections.some(c=>c.roadId===r.id));
      root.traverse(o=>{
        if(!(o instanceof Mesh))return;
        if(['road pavement','road curb','road sidewalk'].includes(o.name)){
          const p=o.geometry.getAttribute('position'),index=o.geometry.index,offset=o.name==='road pavement'?.024:o.name==='road curb'?.17:.15;
          for(let i=0;i<(index?.count??p.count);i+=3){
            let x=0,y=0,z=0;for(let k=0;k<3;k++){const n=index?index.getX(i+k):i+k;x+=p.getX(n)/3;y+=p.getY(n)/3;z+=p.getZ(n)/3;}
            for(const j of junctions)if(Math.abs(y-offset-junctionSurfaceHeight(j,{x,z}))<.2)assert(!junctionSurfaceContains(j,map,{x,z},-1e-4),'no repeated '+o.name+' triangle in '+j.id+' from '+r.id+' at '+JSON.stringify({x,y,z}));
            roadTriangles++;
            if(map.id==='new-city'&&o.name==='road pavement')pavementSamples.push({owner:r.id,points:Array.from({length:3},(_,k)=>{const n=index?index.getX(i+k):i+k;return {x:p.getX(n),z:p.getZ(n)};})});
          }
        }
        o.geometry.dispose();
      });
    }
    if(map.id==='new-city')for(let x=-65+.37;x<65;x+=2)for(let z=-65+.61;z<65;z+=2){
      const owners=new Set(map.intersections.filter(j=>junctionSurfaceContains(j,map,{x,z},-.001)).map(j=>j.id));
      for(const triangle of pavementSamples){const [a,b,c]=triangle.points as [typeof triangle.points[number],typeof triangle.points[number],typeof triangle.points[number]];
        if(x<Math.min(a.x,b.x,c.x)||x>Math.max(a.x,b.x,c.x)||z<Math.min(a.z,b.z,c.z)||z>Math.max(a.z,b.z,c.z))continue;
        const den=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);if(Math.abs(den)<1e-6)continue;
        const u=((x-a.x)*(c.z-a.z)-(z-a.z)*(c.x-a.x))/den,v=((b.x-a.x)*(z-a.z)-(b.z-a.z)*(x-a.x))/den;
        if(u>1e-5&&v>1e-5&&u+v<1-1e-5)owners.add(triangle.owner);
      }assert(owners.size<=1,'one pavement owner including approach-to-approach overlap '+JSON.stringify({x,z,owners:[...owners]}));
    }
  }finally{Object.values(materials).forEach(m=>m.dispose());}
  return {junctions:map.intersections.length,roadTriangles};
}
function verifyLogicalLayer(map:CityMapData):void {
  const graph=buildCityRoadNetwork(map);let strokes=0,fills=0,clips=0;const caps:string[]=[];
  const context={save(){},restore(){},beginPath(){},rect(){},moveTo(){},lineTo(){},closePath(){},stroke(){strokes++;},fill(){fills++;},fillRect(){throw new Error('No legacy rectangle expected');},clip(rule:string){assert(rule==='evenodd','explicit footprint clip');clips++;},set lineCap(s:string){caps.push(s);},set lineJoin(_s:string){},set strokeStyle(_s:string){},set lineWidth(_v:number){},set fillStyle(_s:string){}} as unknown as CanvasRenderingContext2D;
  drawLogicalRoadLayer(context,graph.segments,graph.intersections,(x,z)=>({x,y:z}),1,0,()=> '#ccc','#bbb');
  assert(strokes===graph.segments.length&&fills===graph.intersections.length,'one logical draw per road/junction');
  assert(clips===map.intersections.reduce((n,j)=>n+j.connections.length,0)&&caps[0]==='butt','roads clipped to connected junctions without round caps');
  assert(graph.segments.length===map.roads.length&&graph.intersections.length===map.intersections.length,'no visual helpers in map');
}
export function runCityMainV41SelfTest(source:CityMapData,baseline:CityMapData){
  const map=loadCityMap(source),before=loadCityMap(baseline),validation=validateMap(map);
  assert(validation.valid&&!validation.warnings.some(w=>w.code!=='port.unused'),'map/grades valid');
  assert(map.roads.length===500&&map.intersections.length===84,'no network expansion');
  const frozen=baseline.roads.filter(r=>r.groupId?.startsWith('system-')||r.groupId==='peripheral-interchange');
  for(const r of frozen)assert(equal(r,source.roads.find(a=>a.id===r.id)),'frozen system geometry '+r.id);
  const beforeGraph=buildCityRoadNetwork(before),graph=buildCityRoadNetwork(map);
  assert(equal(beforeGraph.laneConnections,graph.laneConnections),'all directed lane connectivity unchanged');
  const crossings=cityMainCrossingIssues(map);assert(crossings.length===0,'access grade separation '+JSON.stringify(crossings.slice(0,5)));
  assert(equal(source.objects,baseline.objects)&&equal(source.signs,baseline.signs)&&equal(source.bounds,baseline.bounds),'landscape/signs/bounds unchanged');
  const access=(r:typeof map.roads[number])=>!!r.groupId&&(/^(diamond-|direct-)/.test(r.groupId));
  const mainlineEdits=new Set<string>();
  for(const r of map.roads.filter(r=>!access(r))){
    const old=before.roads.find(q=>q.id===r.id)!;
    if(equal(r,old))continue;
    assert(r.type==='highway'&&!r.groupId,'only ordinary access mainline split boundaries may move '+r.id);mainlineEdits.add(r.id);
  }
  // Verify changed mainline ribbons still follow the same exact altitude/alignment.
  for(const id of mainlineEdits){const r=map.roads.find(q=>q.id===id)!,path=roadPoints(r);
    for(let d=0;d<=polylineLength(path);d+=5){const p=sampleAt(path,d).point;let found=false;
      for(const old of before.roads.filter(q=>q.type==='highway'&&!q.groupId))for(let i=1;i<old.centerline.length;i++){
        const a=old.centerline[i-1]!,b=old.centerline[i]!,dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz,t=((p.x-a.x)*dx+(p.z-a.z)*dz)/l2;
        if(t>=-1e-6&&t<=1+1e-6&&Math.hypot(a.x+t*dx-p.x,a.z+t*dz-p.z)<.001&&Math.abs((a.y??0)+t*((b.y??0)-(a.y??0))-(p.y??0))<.001)found=true;
      }assert(found,'mainline profile preserved '+id);
    }
  }
  const fixtures={wideNarrow:fixture([6,2,6,2],[0,Math.PI/2,Math.PI,-Math.PI/2]),wideMedium:fixture([6,4,6,4],[0,Math.PI/2,Math.PI,-Math.PI/2]),mediumNarrow:fixture([4,2,4,2],[0,Math.PI/2,Math.PI,-Math.PI/2]),angled:fixture([6,4,6,4],[0,.65,Math.PI,Math.PI+.65]),T:fixture([2,6,6],[0,Math.PI/2,-Math.PI/2]),irregular:fixture([6,2,4,2,2],[0,1,2.3,3.6,5.2])};
  const fixtureResults=Object.fromEntries(Object.entries(fixtures).map(([key,m])=>{verifyLogicalLayer(m);return [key,verifyGeometry(m)];}));
  const actualGeometry=verifyGeometry(map);verifyLogicalLayer(map);
  const diamonds=map.roads.filter(r=>r.groupId?.startsWith('diamond-')&&r.gore),direct=map.roads.filter(r=>r.groupId?.startsWith('direct-')&&/:on-|:off-/.test(r.id));
  assert(direct.length===12&&diamonds.length===8&&direct.length>diamonds.length,'direct access majority');
  const footprint=(roads:typeof map.roads)=>{const p=roads.flatMap(r=>r.centerline);return {x:Math.max(...p.map(q=>q.x))-Math.min(...p.map(q=>q.x)),z:Math.max(...p.map(q=>q.z))-Math.min(...p.map(q=>q.z))};};
  const accessFootprints=Object.fromEntries(['diamond-west','diamond-east','direct-west','direct-north','direct-south'].map(g=>{
    const filter=(m:CityMapData)=>m.roads.filter(r=>r.groupId===g&&r.gore);
    const a=footprint(filter(map)),b=footprint(filter(before));assert(a.x*a.z<b.x*b.z*.7,'compact footprint '+g);
    if(g.startsWith('diamond'))assert(a.x<=240&&a.z<=145,'compact diamond bounds '+g);
    return [g,{before:b,after:a}];
  }));
  const ground=new CityGround(map,{loadRadius:0}),collision=new VehicleCollisionSystem(ground.colliders);let contacts=0,clearances=0;
  try{for(const r of [...direct,...diamonds]){
    const points=roadPoints(r),length=polylineLength(points),edges=roadEdges(r);
    for(let d=0;d<=length;d+=4){const s=sampleAt(points,d),p=s.point,y=p.y??0;
      for(const offset of [0,edges.left+.8,edges.right-.8]){
        const contact=ground.sampleRoadSurface(p.x-s.tangent.z*offset,p.z+s.tangent.x*offset,{x:s.tangent.x,y:s.tangent.z},y);
        assert(contact.surfaceType==='asphalt'&&Math.abs(contact.height-y)<.12,'ramp supports carriageway '+r.id+' '+d);contacts++;
      }
    }
    for(let d=8;d<length-8;d+=12){const s=sampleAt(points,d),pose={x:s.point.x,y:s.point.y??0,z:s.point.z,yaw:Math.atan2(-s.tangent.x,-s.tangent.z)};
      const result=collision.resolve({previousPose:pose,pose,velocity:{x:0,z:0},dimensions:{width:2.02,length:5.05,height:1.95},dt:1/120});
      assert(!result.collided,'access structure clearance '+r.id+' '+d+': '+result.contacts.map(c=>c.colliderId));clearances++;
    }
    for(const end of ['start','end'] as const){const p=end==='start'?r.centerline[0]!:r.centerline.at(-1)!,j=map.intersections.find(j=>j.connections.some(c=>c.roadId===r.id&&c.end===end));
      if(j){const c=j.connections.find(c=>c.roadId===r.id&&c.end===end)!;assert(equal(p,connectionPoint(j,c.port,map)),'terminal stitched '+r.id);}
      else assert((map.roadLinks??[]).some(l=>[l.from,l.to].some(e=>e.roadId===r.id&&e.end===end)),'ramp endpoint connected '+r.id);
    }
  }}finally{ground.dispose();}
  return {passed:true,frozenSystemRoads:frozen.length,unchangedLaneConnections:graph.laneConnections.length,roadCount:map.roads.length,fixtures:fixtureResults,actualGeometry,logicalMap:'one draw per logical junction; connected-road clipping; no visual helpers',mainlineSeamsRelocated:mainlineEdits.size,directOn:direct.filter(r=>r.id.includes(':on-')).length,directOff:direct.filter(r=>r.id.includes(':off-')).length,compactDiamonds:2,signalizedDiamondTerminals:4,accessFootprints,rampSurfaceContacts:contacts,rampClearanceChecks:clearances};
}
