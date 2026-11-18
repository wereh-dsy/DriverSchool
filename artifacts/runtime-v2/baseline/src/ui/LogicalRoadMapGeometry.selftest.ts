import { drawLogicalRoadLayer } from './LogicalRoadMapGeometry';
import type { RoadNetworkData, RoadSegmentData, RoadIntersectionData, RoadPoint } from '../world/navigation/RoadNetwork';

/** Pixel regressions use a real browser Canvas; no screenshots or mocked paint assertions. */
export function runLogicalRoadMapPixelSelfTest(createCanvas:()=>HTMLCanvasElement,regional?:RoadNetworkData) {
  let assertions=0,regionalApproaches=0;
  const assert=(ok:unknown,message:string)=>{assertions++;if(!ok)throw new Error(`Logical map pixels: ${message}`);};
  const canvas=createCanvas();canvas.width=canvas.height=320;const c=canvas.getContext('2d')!;
  const road=(id:string,points:RoadPoint[],width=20):RoadSegmentData=>({id,centerline:points,width,length:100,laneCountPerDirection:1,laneWidth:width/2,travelDirection:'two-way',roadType:'urban'});
  const bg='#193345',pavement='#f0e0b0',upper='#2090d0',casing='#627580';
  const fillAt=(x:number,y:number)=>{const p=c.getImageData(Math.floor(x),Math.floor(y),1,1).data;return {r:p[0]!,g:p[1]!,b:p[2]!};};
  const painted=(x:number,y:number)=>{const p=fillAt(x,y);return Math.abs(p.r-25)+Math.abs(p.g-51)+Math.abs(p.b-69)>70;};
  const draw=(roads:readonly RoadSegmentData[],junctions:readonly RoadIntersectionData[],scale:number,center={x:0,z:0})=>{
    c.fillStyle=bg;c.fillRect(0,0,320,320);
    drawLogicalRoadLayer(c,roads,junctions,(x,z)=>({x:160+(x-center.x)*scale,y:160+(z-center.z)*scale}),scale,2,
      r=>r.id==='upper'?upper:pavement,pavement,{outlineColor:casing,outlineWidth:1});
  };
  const arms=[road('north',[{x:0,z:-80},{x:0,z:-16}]),road('south',[{x:0,z:16},{x:0,z:80}]),road('east',[{x:16,z:0},{x:80,z:0}]),road('west',[{x:-80,z:0},{x:-16,z:0}])];
  const junction:RoadIntersectionData={id:'junction',center:{x:0,y:0,z:0},halfExtentX:16,halfExtentZ:16,pavementFootprint:[{x:-16,z:-16},{x:16,z:-16},{x:16,z:16},{x:-16,z:16}],arms:arms.map(r=>({segmentId:r.id,outward:{x:0,z:1},approachYawRadians:0,approachLaneCount:1}))};
  for(const scale of [.1,.25,.5,1,2]) {
    draw(arms,[junction],scale);
    for(const direction of [{x:0,z:1},{x:0,z:-1},{x:1,z:0},{x:-1,z:0}])for(let distance=0;distance<65;distance+=2)assert(painted(160+direction.x*distance*scale,160+direction.z*distance*scale),`continuous urban junction at ${scale} px/m`);
    const parts=[road('a',[{x:-100,y:0,z:0},{x:0,y:4,z:0}]),road('b',[{x:.15,y:4,z:0},{x:100,y:8,z:0}])];
    draw(parts,[],scale);
    for(let x=-30;x<=30;x++) {const p=fillAt(160+x*scale,160);assert(p.r>170&&p.g>150&&p.b<200,`no segment/elevation-band casing ring at ${scale} px/m, x=${x}`);}
    draw([road('tunnel',[{x:-100,y:-8,z:0},{x:100,y:-8,z:0}])],[],scale);
    for(let x=-70;x<=70;x+=3)assert(painted(160+x*scale,160),'tunnel pavement is continuous');
  }
  draw([...arms,road('upper',[{x:-100,y:8,z:0},{x:100,y:8,z:0}],12)],[junction],1);
  const bridge=fillAt(160,160);assert(bridge.b>bridge.r+60,'upper deck is not covered by lower junction pavement');
  assert(painted(160,200),'lower approach remains visible outside upper deck');
  if(regional)for(const j of regional.intersections) {
    const ids=new Set(j.arms.map(a=>a.segmentId)),roads=regional.segments.filter(r=>ids.has(r.id));
    const nearbyJunctions=regional.intersections.filter(n=>Math.hypot(n.center.x-j.center.x,n.center.z-j.center.z)<150);
    for(const scale of [.25,1]) {
      draw(roads,nearbyJunctions,scale,j.center);
      for(const arm of j.arms) {
        const r=roads.find(r=>r.id===arm.segmentId)!;
        const a=r.centerline[0]!,b=r.centerline.at(-1)!;
        const p=Math.hypot(a.x-j.center.x,a.z-j.center.z)<Math.hypot(b.x-j.center.x,b.z-j.center.z)?a:b;
        for(const t of [.15,.4,.65,.9])assert(painted(160+(p.x-j.center.x)*t*scale,160+(p.z-j.center.z)*t*scale),`regional junction mouth is connected: ${j.id}/${r.id}/${scale}, t=${t}, center=${JSON.stringify(j.center)}, mouth=${JSON.stringify(p)}`);
        regionalApproaches++;
      }
    }
  }
  return {assertions,regionalApproaches};
}
