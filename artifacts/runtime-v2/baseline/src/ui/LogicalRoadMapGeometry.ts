import type { RoadIntersectionData, RoadPoint, RoadSegmentData, RoadMapAnnotation } from '../world/navigation/RoadNetwork';

export interface LogicalRoadMapStyle {
  readonly layerByHeight?: boolean;
  readonly outlineColor?: string;
  /** Screen pixels on each side. Outlines are composed before pavement. */
  readonly outlineWidth?: number;
  readonly minimumRoadWidth?: (road:RoadSegmentData)=>number;
}
interface RoadMapRun { readonly road:RoadSegmentData; readonly points:readonly RoadPoint[]; readonly layer:number }
const roadRuns=new WeakMap<RoadSegmentData,readonly RoadMapRun[]>();

/** Local elevation bands preserve bridge order even when a ramp spans several levels. */
function compiledRuns(road:RoadSegmentData):readonly RoadMapRun[] {
  const cached=roadRuns.get(road);if(cached)return cached;
  const runs:{road:RoadSegmentData;points:RoadPoint[];layer:number}[]=[];
  for(let i=1;i<road.centerline.length;i++) {
    const a=road.centerline[i-1]!,b=road.centerline[i]!,ay=a.y??0,by=b.y??0;
    const steps=Math.max(1,Math.ceil(Math.abs(by-ay)));
    for(let step=0;step<steps;step++) {
      const at=(t:number):RoadPoint=>({x:a.x+(b.x-a.x)*t,y:ay+(by-ay)*t,z:a.z+(b.z-a.z)*t});
      const first=step===0?a:at(step/steps),last=step===steps-1?b:at((step+1)/steps);
      const layer=Math.round(((first.y??0)+(last.y??0))/4);
      const previous=runs.at(-1);
      if(previous?.layer===layer)previous.points.push(last);else runs.push({road,points:[first,last],layer});
    }
  }
  roadRuns.set(road,runs);return runs;
}

/** Shared logical map layer. Visual meshes/patches never enter this API. */
export function drawLogicalRoadLayer(
  ctx: CanvasRenderingContext2D, roads: Iterable<RoadSegmentData>, junctions: Iterable<RoadIntersectionData>,
  point: (x:number,z:number)=>{x:number;y:number}, scale:number, minimumWidth:number,
  roadColor: (road:RoadSegmentData)=>string,
  junctionColor:string|((junction:RoadIntersectionData,roads:readonly RoadSegmentData[])=>string),
  style:LogicalRoadMapStyle={},
): void {
  const nodes=[...junctions],segments=[...roads],byId=new Map(segments.map(r=>[r.id,r]));
  const layered=style.layerByHeight||!!style.outlineColor;
  const mouths=new Map<string,RoadIntersectionData[]>();
  for(const j of nodes)if(j.pavementFootprint)for(const arm of j.arms){const list=mouths.get(arm.segmentId)??[];list.push(j);mouths.set(arm.segmentId,list);}
  const layers=new Map<number,{runs:RoadMapRun[];nodes:RoadIntersectionData[]}>();
  const layer=(height:number)=>{let value=layers.get(height);if(!value){value={runs:[],nodes:[]};layers.set(height,value);}return value;};
  for(const road of segments) {
    const runs=layered?compiledRuns(road):[{road,points:road.centerline,layer:Math.round((road.centerline[0]?.y??0)/2)}];
    for(const run of runs)layer(run.layer).runs.push(run);
  }
  for(const j of nodes)layer(Math.round((j.center.y??0)/2)).nodes.push(j);
  const outline=(polygon:readonly RoadPoint[])=>{
    polygon.forEach((q,i)=>{const p=point(q.x,q.z);if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);});ctx.closePath();
  };
  const junctionPath=(j:RoadIntersectionData)=>{
    ctx.beginPath();if(j.pavementFootprint)outline(j.pavementFootprint);
    else {const p=point(j.center.x,j.center.z);ctx.rect(p.x-j.halfExtentX*scale,p.y-j.halfExtentZ*scale,j.halfExtentX*2*scale,j.halfExtentZ*2*scale);}
  };
  const strokeRoad=(run:RoadMapRun,casing:boolean)=>{
    const road=run.road;
    ctx.save();
    // Cut only this road's logical junctions: an unrelated upper deck stays visible.
    for(const j of mouths.get(road.id)??[]){if(layered&&Math.abs(run.layer-Math.round((j.center.y??0)/2))>1)continue;ctx.beginPath();ctx.rect(-1e7,-1e7,2e7,2e7);outline(j.pavementFootprint!);ctx.clip('evenodd');}
    ctx.strokeStyle=casing?style.outlineColor!:roadColor(road);
    ctx.lineWidth=Math.max(style.minimumRoadWidth?.(road)??minimumWidth,road.width*scale)+(casing?2*(style.outlineWidth??1):0);
    // Butt casing has no transverse end ring. Rounded pavement overlaps subpixel
    // endpoint tolerances and remains continuous across adjacent elevation bands.
    ctx.lineCap=casing||!layered?'butt':'round';ctx.beginPath();
    run.points.forEach((q,i)=>{const p=point(q.x,q.z);if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);});ctx.stroke();ctx.restore();
  };
  ctx.save();ctx.lineJoin='round';if(layered)ctx.setLineDash([]);
  for(const [,group] of [...layers].sort((a,b)=>a[0]-b[0])) {
    if(style.outlineColor) {
      for(const run of group.runs)strokeRoad(run,true);
      ctx.strokeStyle=style.outlineColor;ctx.lineWidth=2*(style.outlineWidth??1);
      for(const j of group.nodes){junctionPath(j);ctx.stroke();}
    }
    // The pavement pass erases internal segment/mouth outlines at this height.
    for(const run of group.runs)strokeRoad(run,false);
    for(const j of group.nodes){
      ctx.fillStyle=typeof junctionColor==='string'?junctionColor:junctionColor(j,j.arms.flatMap(a=>{const r=byId.get(a.segmentId);return r?[r]:[];}));
      junctionPath(j);ctx.fill();
    }
  }
  ctx.restore();
}

/** One landmark painter for the full HUD map and every shared vehicle map skin. */
export function drawRoadMapAnnotations(
  ctx: CanvasRenderingContext2D, annotations: readonly RoadMapAnnotation[] | undefined,
  point: (x: number, z: number) => { x: number; y: number }, metresToPixels: number,
  symbolScale = 1,
): void {
  if (!annotations?.length) return;
  const occupied: { x: number; y: number; width: number; height: number }[] = [];
  ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = 1.2 * symbolScale;
  for (const marker of annotations) {
    const p = point(marker.position.x, marker.position.z), yaw = marker.yawRadians ?? 0;
    const size = 3 * symbolScale;
    ctx.save(); ctx.translate(p.x, p.y);
    if (marker.kind === 'direction') {
      ctx.rotate(-yaw); ctx.strokeStyle = '#2b8595';
      ctx.beginPath(); ctx.moveTo(-size, size); ctx.lineTo(0, -size); ctx.lineTo(size, size); ctx.stroke();
      ctx.restore(); continue;
    }
    if (marker.kind === 'start-finish') {
      ctx.save(); ctx.rotate(-yaw); ctx.strokeStyle = '#f6d075';
      const half = Math.max(size * 1.5, (marker.roadWidth ?? 10) * metresToPixels / 2);
      ctx.beginPath(); ctx.moveTo(-half, 0); ctx.lineTo(half, 0); ctx.stroke(); ctx.restore();
    } else {
      ctx.fillStyle = marker.kind === 'pit' ? '#377ca0' : '#d4a557';
      ctx.beginPath(); ctx.arc(0, 0, size * 0.7, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    if (!marker.label) continue;
    const font = 8.5 * symbolScale, width = (marker.label.length * 5.2 + 6) * symbolScale;
    const height = 12 * symbolScale;
    // Prefer above the landmark, then below. Dense distant corners keep their dot.
    let label: { x: number; y: number; width: number; height: number } | undefined;
    for (const y of [p.y - height - size, p.y + size]) {
      const candidate = { x: p.x - width / 2, y, width, height };
      if (!occupied.some(r => candidate.x < r.x + r.width + 2 && candidate.x + width + 2 > r.x
        && candidate.y < r.y + r.height + 2 && candidate.y + height + 2 > r.y)) { label = candidate; break; }
    }
    if (!label) continue;
    occupied.push(label);
    ctx.fillStyle = '#172b35'; ctx.fillRect(label.x, label.y, label.width, label.height);
    ctx.fillStyle = '#f4eee0'; ctx.font = `600 ${font}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(marker.label, p.x, label.y + height / 2, width - 3 * symbolScale);
  }
  ctx.restore();
}
