import type { CityMapData, CityPoint, PrefabId } from '../CityMapData';
import { RoadClearance } from '../RoadClearance';
import { polylineLength, roadEdges, roadPoints, sampleAt } from '../geometry';
import { placePrefab } from '../MapAPI';

/** Deterministic, clearance-checked content; the existing prefab/sector kit owns rendering. */
export function addCityMainLandscape(map:CityMapData):void {
  const clearance=new RoadClearance(map);let serial=0;
  const add=(prefabId:PrefabId,p:CityPoint,rotation:number,district:string,scale={x:1,y:1,z:1},color?:string,label?:string):void=>{
    placePrefab(map,{id:`landscape-${prefabId}-${serial++}`,prefabId,position:p,rotation,district,scale,color,label});
  };
  const clear=(p:CityPoint,radius:number,height:number)=>clearance.permitsProp(p,radius,height);
  for(const r of map.roads) {
    const pts=roadPoints(r),length=polylineLength(pts),edges=roadEdges(r),motorway=r.id.startsWith('intercity-'),urban=r.id.startsWith('urban-')&&r.laneCount>=4;
    if((r.district==='expressway'||motorway)&&!r.gore&&!r.structure?.enclosure)r.streetlights=true;
    if(motorway)r.streetlights=false;
    const selected=(r.id.startsWith('ring-')||urban||motorway)&&!r.gore;
    if(!selected)continue;
    const spacing=motorway?65:r.district==='west'?60:45;
    for(let d=30;d<length-25;d+=spacing) {
      const s=sampleAt(pts,d),rotation=Math.atan2(-s.tangent.z,s.tangent.x);
      // Leave breaks in each tree belt rather than planting every edge continuously.
      if(Math.floor((s.point.x+s.point.z+8000)/240)%4===0)continue;
      for(const side of [-1,1]) {
        const offset=(side<0?edges.left:edges.right)+side*(motorway?16:9),p={x:s.point.x-s.tangent.z*offset,y:0,z:s.point.z+s.tangent.x*offset};
        if(clear(p,2.8,7))add('tree',p,rotation,r.district??'east',{x:1,y:1,z:1},r.district==='west'?'#738257':'#4f7653');
        const stripOffset=(side<0?edges.left:edges.right)+side*5,strip={x:s.point.x-s.tangent.z*stripOffset,y:0,z:s.point.z+s.tangent.x*stripOffset};
        if([-17,0,17].every(along=>!clearance.roadAt({x:strip.x+s.tangent.x*along,y:0,z:strip.z+s.tangent.z*along},2.8,-50,100))&&!clearance.junctionAt(strip,18))add('green_strip',strip,rotation,r.district??'east',{x:1.7,y:1,z:0.65},'#55754c');
        if(motorway&&s.point.x>2300&&d%130<70) {
          const offset=(side<0?edges.left:edges.right)+side*8,p={x:s.point.x-s.tangent.z*offset,y:0,z:s.point.z+s.tangent.x*offset};
          if([-20,0,20].every(d=>clear({x:p.x+s.tangent.x*d,y:0,z:p.z+s.tangent.z*d},5.5,3)))add('embankment',p,rotation+(side<0?Math.PI:0),'motorway',{x:2,y:1,z:1},'#71864e');
        }
      }
      if(motorway&&s.point.x>2650&&d%260<65) {
        const offset=edges.right+3,p={x:s.point.x-s.tangent.z*offset,y:s.point.y??0,z:s.point.z+s.tangent.x*offset};
        if(clear(p,0.4,7.5))add('streetlight',p,Math.atan2(-s.tangent.x,-s.tangent.z),'motorway');
      }
      if(r.id.startsWith('ring-')&&(s.point.z<-1150||s.point.x>1500&&s.point.z<0)&&Math.abs(s.point.y??0)>5) {
        const offset=edges.right+1.5,p={x:s.point.x-s.tangent.z*offset,y:s.point.y??0,z:s.point.z+s.tangent.x*offset};
        const fits=[-10,0,10].every(along=>clear({x:p.x+s.tangent.x*along,y:p.y,z:p.z+s.tangent.z*along},0.5,3.5));
        if(fits)add('noise_barrier',p,rotation,s.point.z<-1150?'north':'east',{x:1,y:1,z:1},'#718d93');
      }
    }
  }
  // Plots are placed at authored district scales, then rejected if their full
  // circumscribed envelope meets roads, ramps, bridges or junction clear zones.
  const plots:{district:string;prefab:PrefabId;x:number;z:number;cols:number;rows:number;stepX:number;stepZ:number;scale:number;color:string}[]=[
    {district:'central',prefab:'office',x:250,z:180,cols:4,rows:3,stepX:90,stepZ:135,scale:1.35,color:'#aab3ba'},
    {district:'west',prefab:'residential_low',x:-1550,z:350,cols:5,rows:7,stepX:75,stepZ:90,scale:1.45,color:'#bcaf98'},
    {district:'west',prefab:'residential_mid',x:-1450,z:-500,cols:4,rows:3,stepX:90,stepZ:100,scale:1.2,color:'#aba695'},
    {district:'west',prefab:'industrial',x:-1600,z:1100,cols:3,rows:2,stepX:100,stepZ:120,scale:1.25,color:'#9b9c91'},
    {district:'east',prefab:'residential_mid',x:950,z:100,cols:5,rows:3,stepX:125,stepZ:135,scale:1.65,color:'#b0b7b9'},
    {district:'east',prefab:'office',x:950,z:550,cols:4,rows:2,stepX:150,stepZ:125,scale:1.4,color:'#abbac4'},
    {district:'north',prefab:'residential_mid',x:500,z:-1250,cols:5,rows:2,stepX:125,stepZ:105,scale:1.4,color:'#b9c2b5'},
    {district:'south',prefab:'industrial',x:700,z:1600,cols:6,rows:3,stepX:150,stepZ:125,scale:1.6,color:'#a4a99f'},
    {district:'motorway',prefab:'industrial',x:2450,z:1050,cols:5,rows:2,stepX:165,stepZ:150,scale:2,color:'#a4aa99'},
  ];
  const sizes:Partial<Record<PrefabId,[number,number,number]>>={office:[26,38.4,22],residential_low:[20,9.4,16],residential_mid:[26,23.4,20],industrial:[46,11.4,30]};
  for(const plot of plots)for(let row=0;row<plot.rows;row++)for(let col=0;col<plot.cols;col++) {
    const jitter=plot.district==='west'?((row*17+col*11)%19-9):0,p={x:plot.x+col*plot.stepX+jitter,y:0,z:plot.z+row*plot.stepZ-jitter},size=sizes[plot.prefab]!,scale=plot.scale;
    const radius=Math.hypot(size[0],size[2])*scale/2+4;
    if(clear(p,radius,size[1]*scale))add(plot.prefab,p,plot.district==='west'?0.06*(col%3-1):0,plot.district,{x:scale,y:scale,z:scale},plot.color);
  }
  const park={x:400,y:0,z:-600};
  if(!clearance.roadAt(park,90,-50,0.65))add('green_strip',park,0,'north',{x:8,y:1,z:14},'#467958');
  for(const [x,z] of [[-90,-75],[-60,-80],[70,-80],[95,10],[-90,35],[60,75]] as const) {
    const p={x:park.x+x,y:0,z:park.z+z};if(clear(p,3,7))add('tree',p,0,'north');
  }
  for(const center of [{x:0,z:-150},{x:-1750,z:-150},{x:1750,z:-150}])for(const side of [-1,1]) {
    const p={x:center.x+side*90,y:0,z:center.z+side*85};if(!clearance.roadAt(p,26,-50,0.65)&&!clearance.junctionAt(p,28))add('hardscape',p,0,'expressway',{x:1.5,y:1,z:1.5},'#91968f');
  }
  // Static infrastructure corridor: twin rails plus the existing fence/underpass.
  for(const x of [-1252,-1248])for(let z=-1250;z<=-1050;z+=50) {
    const p={x,y:0,z};if(clear(p,0.2,1.1))add('guardrail',p,Math.PI/2,'west',{x:5,y:0.15,z:0.5});
  }
  const labels=['Ring','City Center','East','West','North','South','Intercity Expressway'];
  for(const label of labels) {
    const family=label==='Intercity Expressway'?'intercity-':label==='North'||label==='South'?'ns-':label==='Ring'?'ring-':'ew-';
    let count=0;
    for(const r of map.roads.filter(r=>r.id.startsWith(family)&&!r.gore)) {
      const pts=roadPoints(r),length=polylineLength(pts),edges=roadEdges(r);
      for(let d=100;d<length-25&&count<2;d+=160) {
        const s=sampleAt(pts,d);if((s.point.y??0)<0)continue;
        const offset=edges.right+5,p={x:s.point.x-s.tangent.z*offset,y:s.point.y??0,z:s.point.z+s.tangent.x*offset};
        if(clear(p,3.1,5.4)){add('guide_sign',p,Math.atan2(-s.tangent.x,-s.tangent.z),r.district??'expressway',undefined,label==='Intercity Expressway'?'#17714f':'#216383',label);count++;}
      }
      if(count===2)break;
    }
  }
  map.environment.metadata!.landscapeObjects=String(serial);
}
