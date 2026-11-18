import type { CityFacade, CityMapData, CityObject, CityPoint, CityRoad, PrefabId } from '../CityMapData';
import { PrefabRegistry } from '../PrefabRegistry';
import { RoadClearance } from '../RoadClearance';
import { RoadsidePlacement } from '../RoadsidePlacement';
import { createSubject3Materials } from '../../subject3/materials';
import { roadPoints, polylineLength, sampleAt, roadEdges, rotatePoint } from '../geometry';

interface DecorationProfile {
  lamp: 'streetlight'|'streetlight_small'|'streetlight_dual'|'streetlight_highway';
  lampSpacing:number;treeSpacing:number;green:boolean;sidewalk:number;
}
/** Authoring configuration only: the emitted objects use the existing runtime
 * instancing and sector lifecycle. Nothing runs in the physics/update loop. */
export const CITY_V6_DECORATION_PROFILES:Record<string,DecorationProfile>={
  'civic-avenue':{lamp:'streetlight_dual',lampSpacing:80,treeSpacing:55,green:true,sidewalk:3.5},
  'new-district':{lamp:'streetlight_dual',lampSpacing:95,treeSpacing:65,green:true,sidewalk:3.2},
  'old-town':{lamp:'streetlight_small',lampSpacing:85,treeSpacing:105,green:false,sidewalk:1.4},
  'industrial':{lamp:'streetlight',lampSpacing:130,treeSpacing:240,green:false,sidewalk:2},
  'collector':{lamp:'streetlight',lampSpacing:95,treeSpacing:90,green:false,sidewalk:2.2},
  'park-edge':{lamp:'streetlight_small',lampSpacing:95,treeSpacing:75,green:false,sidewalk:2},
  'expressway':{lamp:'streetlight_highway',lampSpacing:180,treeSpacing:240,green:false,sidewalk:0},
  'ramp':{lamp:'streetlight_highway',lampSpacing:180,treeSpacing:0,green:false,sidewalk:0},
};
interface Parcel {id:string;use:string;district:string;minX:number;maxX:number;minZ:number;maxZ:number;stepX:number;stepZ:number;prefab:PrefabId;facade:CityFacade}
const PARCELS:Parcel[]=[
  {id:'west-north',use:'old-town',district:'west',minX:-1580,maxX:-1030,minZ:-700,maxZ:-240,stepX:59,stepZ:67,prefab:'residential_low',facade:'old-town'},
  {id:'west-south',use:'old-town',district:'west',minX:-1580,maxX:-1030,minZ:0,maxZ:720,stepX:63,stepZ:76,prefab:'residential_low',facade:'old-town'},
  {id:'civic',use:'government',district:'central',minX:-660,maxX:-290,minZ:-410,maxZ:510,stepX:165,stepZ:190,prefab:'school',facade:'campus'},
  {id:'finance',use:'CBD',district:'central',minX:140,maxX:610,minZ:-390,maxZ:500,stepX:115,stepZ:145,prefab:'office',facade:'office'},
  {id:'inner-west-housing',use:'residential',district:'central',minX:-1000,maxX:-780,minZ:-650,maxZ:540,stepX:100,stepZ:150,prefab:'residential_mid',facade:'residential'},
  {id:'east-housing',use:'residential',district:'east',minX:1090,maxX:1510,minZ:0,maxZ:720,stepX:110,stepZ:145,prefab:'residential_mid',facade:'residential'},
  {id:'campus',use:'campus',district:'north',minX:300,maxX:810,minZ:-1280,maxZ:-880,stepX:150,stepZ:145,prefab:'school',facade:'campus'},
  {id:'innovation',use:'innovation',district:'east',minX:1080,maxX:1530,minZ:-710,maxZ:-300,stepX:135,stepZ:150,prefab:'office',facade:'office'},
  {id:'logistics',use:'logistics',district:'south',minX:560,maxX:1500,minZ:1120,maxZ:1770,stepX:190,stepZ:210,prefab:'industrial',facade:'industrial'},
  {id:'industrial',use:'industrial',district:'south',minX:-1140,maxX:-200,minZ:1270,maxZ:1700,stepX:185,stepZ:210,prefab:'industrial',facade:'industrial'},
  {id:'northwest-housing',use:'peripheral',district:'west',minX:-1640,maxX:-1400,minZ:-1130,maxZ:-840,stepX:95,stepZ:110,prefab:'residential_low',facade:'residential'},
];
const PARKS=[
  {id:'star-lake',name:'星湖公园',x:-650,z:-1085,w:390,d:240},
  {id:'northwest-greenbelt',name:'西北生态绿地',x:-1490,z:-1240,w:240,d:160},
  {id:'civic-square',name:'市府广场',x:-570,z:-30,w:120,d:110},
  {id:'campus-green',name:'学院运动绿地',x:520,z:-1160,w:210,d:150},
  {id:'east-pocket-park',name:'春晖公园',x:1420,z:150,w:180,d:160},
];

function profileFor(r:CityRoad):string {
  if(r.gore||r.travelDirection!=='two-way'&&r.laneCount<3)return 'ramp';
  if(r.laneCount===3&&r.type==='highway'&&r.speedLimit>=80)return 'expressway';
  if(r.groupId==='east-main-aux')return 'industrial';
  if(r.district==='south'||r.district==='motorway')return 'industrial';
  if(r.roadNameId==='v5-north-park'||r.roadNameId==='v5-north-campus')return 'park-edge';
  if(r.district==='west')return 'old-town';
  if(r.district==='east'||r.district==='north')return 'new-district';
  return r.laneCount>=4?'civic-avenue':'collector';
}

export function addCityMainV6Environment(map:CityMapData,cityV6Alignment:(p:CityPoint)=>CityPoint):void {
  const materials=createSubject3Materials(),prefabs=new PrefabRegistry(materials),clearance=new RoadClearance(map),placement=new RoadsidePlacement(map,clearance);
  let serial=0;
  const occupied:{p:CityPoint;radius:number}[]=[];
  const isPark=(p:CityPoint,pad=0)=>PARKS.some(a=>{const c=cityV6Alignment({x:a.x,z:a.z});return Math.abs(p.x-c.x)<a.w/2+pad&&Math.abs(p.z-c.z)<a.d/2+pad;});
  const dimensions=(o:CityObject)=>{const s=prefabs.entries.get(o.prefabId)!.size;return {radius:Math.hypot(s[0]*(o.scale?.x??1),s[2]*(o.scale?.z??1))/2,height:s[1]*(o.scale?.y??1)};};
  const building=(o:CityObject)=>['residential_low','residential_mid','office','industrial','school','commercial','garage'].includes(o.prefabId);
  const before=map.objects.length;
  // Replace the old uniform roadside belts, not the authored district landmarks.
  map.objects=map.objects.filter(o=>!['tree','green_strip','streetlight'].includes(o.prefabId)).filter(o=>{
    const {radius,height}=dimensions(o);
    if(building(o)&&isPark(o.position,radius))return false;
    if(['noise_barrier','guardrail'].includes(o.prefabId)) {
      const size=prefabs.entries.get(o.prefabId)!.size,width=size[0]*(o.scale?.x??1),depth=size[2]*(o.scale?.z??1);
      for(let x=-width/2;x<=width/2+.01;x+=2)for(const z of [-depth/2,depth/2]) {
        const q=rotatePoint({x,z},o.rotation),p={x:o.position.x+q.x,y:o.position.y??0,z:o.position.z+q.z};
        if(!placement.permits(p,.25,height))return false;
      }return true;
    }
    return o.prefabId==='hardscape'||o.prefabId==='embankment'||placement.permits(o.position,radius+.5,height);
  });
  for(const o of map.objects.filter(building)) {const {radius}=dimensions(o);occupied.push({p:o.position,radius});o.facade=o.prefabId==='industrial'?'industrial':o.district==='west'?'old-town':o.prefabId==='office'?'office':o.prefabId==='school'?'campus':'residential';}
  const add=(prefabId:PrefabId,p:CityPoint,scale={x:1,y:1,z:1},district='central',color?:string,rotation=0,facade?:CityFacade,group='environment')=>{
    const o:CityObject={id:`v6-${group}-${serial++}`,prefabId,position:{...p,y:p.y??0},rotation,scale,district,color,facade,groupId:'v6-'+group};map.objects.push(o);return o;
  };
  const fits=(p:CityPoint,w:number,d:number,height:number)=>{
    // Sample the entire slab footprint; water/green courts must not cover roads.
    for(let x=-w/2;x<=w/2+.01;x+=Math.min(12,w/2))for(let z=-d/2;z<=d/2+.01;z+=Math.min(12,d/2)) {
      const q={x:p.x+x,y:p.y??0,z:p.z+z};if(clearance.roadAt(q,2,-50,height+.7)||clearance.junctionAt(q,3,-50,height+.7))return false;
    }return true;
  };
  const parkReport:Record<string,unknown>[]=[];
  for(const park of PARKS) {
    const p=cityV6Alignment({x:park.x,y:.015,z:park.z});let tiles=0;
    for(let x=-park.w/2+20;x<park.w/2;x+=40)for(let z=-park.d/2+20;z<park.d/2;z+=40) {
      const q={x:p.x+x,y:.015,z:p.z+z};if(!fits(q,39,39,.05))continue;
      add(park.id==='civic-square'?'hardscape':'green_strip',q,{x:park.id==='civic-square'?.975:1.95,y:1,z:park.id==='civic-square'?1.3:4.875},park.id==='campus-green'?'north':'central',park.id==='civic-square'?'#c4c2b6':'#b4c58c',0,undefined,park.id);tiles++;
    }
    parkReport.push({...park,tiles});
  }
  // A simple flat basin with an opaque surface. The shoreline is an ellipse,
  // surrounded by the reserved green parcel and kept clear of all road layers.
  const lake=cityV6Alignment({x:-650,y:.075,z:-1085});
  if(!fits(lake,220,110,.1))throw new Error('V6 Star Lake basin intersects a road');
  add('water',lake,{x:11,y:1,z:5.5},'north',undefined,0,undefined,'star-lake');
  const sports=cityV6Alignment({x:520,y:.08,z:-1160});
  if(fits(sports,120,72,.1))add('sports_field',sports,{x:1.2,y:1,z:1.2},'north','#91ac7a',0,undefined,'campus-green');
  for(const parcel of PARCELS) {
    let count=0,row=0;
    for(let z=parcel.minZ;z<=parcel.maxZ;z+=parcel.stepZ,row++)for(let x=parcel.minX,col=0;x<=parcel.maxX;x+=parcel.stepX,col++) {
      if(parcel.use==='residential'&&(col+row*2)%5===0)continue; // Shared courtyards.
      const old=parcel.use==='old-town',jitter=old?((row*13+col*7)%17-8):0;
      const p=cityV6Alignment({x:x+jitter,y:0,z:z-jitter}),n=(col*7+row*11)%5;
      if(isPark(p,15))continue;
      const scale=old?{x:.9+n*.06,y:1.15+n*.26,z:.85+n*.05}:
        parcel.use==='logistics'||parcel.use==='industrial'?{x:2+n*.18,y:.85+n*.04,z:1.7+(row%3)*.25}:
        parcel.use==='campus'||parcel.use==='government'?{x:1.25+n*.1,y:.9+n*.08,z:1.15}:
        parcel.use==='residential'?{x:1.2,y:1.15+n*.2,z:1.1}:
        {x:1.1+n*.14,y:parcel.use==='CBD'&&row%3===0?1.65+n*.3:.8+n*.16,z:1.15};
      const size=prefabs.entries.get(parcel.prefab)!.size,radius=Math.hypot(size[0]*scale.x,size[2]*scale.z)/2+4,height=size[1]*scale.y;
      if(!placement.permits(p,radius,height)||occupied.some(o=>Math.hypot(p.x-o.p.x,p.z-o.p.z)<radius+o.radius+5))continue;
      const o=add(parcel.prefab,p,scale,parcel.district,old?'#e1ceaf':parcel.facade==='office'?'#cedde2':'#e1e2d5',old?(n-2)*.025:0,parcel.facade,parcel.id);
      occupied.push({p,radius:dimensions(o).radius});count++;
      if(['logistics','industrial'].includes(parcel.use)) {
        const yard={x:p.x,y:.03,z:p.z+size[2]*scale.z/2+30};
        if(fits(yard,100,42,.1))add('hardscape',yard,{x:2.5,y:1,z:1.4},parcel.district,'#a3aaa5',0,undefined,parcel.id+'-yard');
      }
    }
    (parcel as Parcel&{buildingCount?:number}).buildingCount=count;
  }
  let trees=0,lamps=0,shrubs=0;
  for(const r of map.roads) {
    const key=profileFor(r),profile=CITY_V6_DECORATION_PROFILES[key]!;r.decorationProfile=key;
    if(r.travelDirection==='two-way') {
      r.roadClass=r.laneCount>=6?'avenue':r.district==='south'?(r.laneCount>=4?'arterial':'industrial'):r.laneCount>=4?'arterial':r.roadNameId?.endsWith('lane')?'alley':r.district==='west'?'local':'collector';
      // Existing geometry/width remains authoritative; only authored new roads
      // use this profile's sidewalk default.
      if(r.id.startsWith('v6-')&&r.sidewalk?.enabled)r.sidewalk.width=profile.sidewalk;
    }
    r.streetlights=false;
    // The old 25 cm visual offset left a slit between asphalt and bridge skirt.
    // City rails now sit exactly on the shared paved edge, including seam joins.
    if(r.structure?.barrierEnabled!==false)r.structure={...r.structure,barrierOffset:0};
    if(key==='expressway'&&!r.structure?.enclosure)r.structure={...r.structure,barrierEnabled:true,barrierOffset:0,barrierStyle:'metal',medianBarrierStyle:'concrete'};
    const path=roadPoints(r),length=polylineLength(path),edges=roadEdges(r);
    if(r.structure?.enclosure)continue;
    for(let d=profile.lampSpacing*.55;d<length-25;d+=profile.lampSpacing) {
      const s=sampleAt(path,d);if((s.point.y??0)<-.1)continue;
      for(const side of r.travelDirection==='two-way'&&key==='civic-avenue'?[-1,1]:[(Math.floor(d/profile.lampSpacing)+r.id.length)%2===0&&r.travelDirection==='two-way'?-1:1]) {
        const offset=(side<0?edges.left:edges.right)+side*(r.sidewalk?.enabled?r.sidewalk.width-.45:1.8);
        const p={x:s.point.x-s.tangent.z*offset,y:(s.point.y??0)+.15,z:s.point.z+s.tangent.x*offset};
        // A two-arm lamp at each avenue side has arms parallel to the road edge.
        if(placement.permits(p,.45,profile.lamp==='streetlight_highway'?12:profile.lamp==='streetlight_dual'?10:profile.lamp==='streetlight_small'?5:7.5)) {
          add(profile.lamp,p,{x:1,y:1,z:1},r.district??'expressway',undefined,Math.atan2(s.tangent.x,s.tangent.z)+(side<0?Math.PI:0),undefined,'lamps');lamps++;
        }
      }
    }
    if(!profile.treeSpacing)continue;
    for(let d=35;d<length-35;d+=profile.treeSpacing) {
      const s=sampleAt(path,d);if(Math.abs(s.point.y??0)>.1)continue;
      const irregular=key==='old-town'?Math.sin(d*.13+r.id.length)*7:0;
      for(const side of [-1,1]) {
        const offset=(side<0?edges.left:edges.right)+side*(r.sidewalk?.width??0)+side*(key==='expressway'?13:6);
        const p={x:s.point.x-s.tangent.z*offset+s.tangent.x*irregular,y:0,z:s.point.z+s.tangent.x*offset+s.tangent.z*irregular};
        if(!placement.permits(p,3,7)||occupied.some(o=>Math.hypot(o.p.x-p.x,o.p.z-p.z)<o.radius+4))continue;
        add('tree',p,{x:1,y:.9+((Math.floor(d)+r.id.length)%5)*.04,z:1},r.district??'central',key==='old-town'?'#b9b794':'#b2c7a0',0,undefined,'road-trees');trees++;
        if(profile.green&&Math.floor(d/profile.treeSpacing)%3!==0) {
          const q={x:p.x,y:.015,z:p.z};if(fits(q,10,3,.1)){add('green_strip',q,{x:.5,y:2,z:.375},r.district??'central','#9cba88',Math.atan2(-s.tangent.z,s.tangent.x),undefined,'shrubs');shrubs++;}
        }
      }
    }
  }
  for(const park of PARKS.filter(p=>p.id!=='civic-square'))for(let i=0;i<48;i++) {
    // Deterministic clusters; leave the central lake/field and paths open.
    const theta=i*2.399963,ring=.68+(i%4)*.07,p=cityV6Alignment({x:park.x+Math.cos(theta)*park.w*.48*ring,y:0,z:park.z+Math.sin(theta)*park.d*.46*ring});
    if(park.id==='star-lake'&&((p.x-lake.x)/125)**2+((p.z-lake.z)/70)**2<1)continue;
    if(placement.permits(p,3,7.5)&&!occupied.some(o=>Math.hypot(o.p.x-p.x,o.p.z-p.z)<o.radius+4)){add('tree',p,{x:1.1,y:1.1,z:1.1},'north','#acc295',theta,undefined,park.id);trees++;}
  }
  let reservedEnds=0;
  for(const port of map.connectionPorts!.filter(p=>p.label.startsWith('Frontage'))) {
    const e=port.endpoint;
    if(map.roadLinks!.some(l=>[l.from,l.to].some(q=>q.roadId===e.roadId&&q.end===e.end))||map.intersections.some(j=>j.connections.some(q=>q.roadId===e.roadId&&q.end===e.end)))continue;
    const r=map.roads.find(r=>r.id===e.roadId)!,path=roadPoints(r),length=polylineLength(path),s=sampleAt(path,e.end==='start'?0:length),direction=e.end==='start'?-1:1;
    const dx=s.tangent.x*direction,dz=s.tangent.z*direction,p={x:s.point.x+dx*7,y:s.point.y??0,z:s.point.z+dz*7},heading=Math.atan2(-dx,-dz);
    if(placement.permits(p,5.1,1.1))add('guardrail',p,{x:1,y:1,z:1},r.district,undefined,heading,undefined,'reserved-end');
    const label={x:s.point.x+dx*6-dz*8,y:s.point.y??0,z:s.point.z+dz*6+dx*8};
    if(placement.permits(label,3.2,5.4))add('guide_sign',label,{x:1,y:1,z:1},r.district,'#dbad60',heading,undefined,'reserved-end').label='道路预留 暂不通行';
    port.label='辅路远期接续（封闭预留）';reservedEnds++;
  }
  map.environment.metadata={...map.environment.metadata,v6LandUse:JSON.stringify(PARCELS),v6Anchors:JSON.stringify(parkReport),
    v6DecorationProfiles:JSON.stringify(CITY_V6_DECORATION_PROFILES),v6Environment:JSON.stringify({before,after:map.objects.length,buildings:map.objects.filter(building).length,trees,lamps,shrubs,reservedEnds,facadeAtlases:5,water:'one opaque shared material; no simulation'})};
  prefabs.dispose();Object.values(materials).forEach(m=>m.dispose());
}
