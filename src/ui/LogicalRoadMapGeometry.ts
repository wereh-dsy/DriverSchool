import type { RoadIntersectionData, RoadPoint, RoadSegmentData } from '../world/navigation/RoadNetwork';

/** Shared logical map layer. Visual meshes/patches never enter this API. */
export function drawLogicalRoadLayer(
  ctx: CanvasRenderingContext2D, roads: Iterable<RoadSegmentData>, junctions: Iterable<RoadIntersectionData>,
  point: (x:number,z:number)=>{x:number;y:number}, scale:number, minimumWidth:number,
  roadColor: (road:RoadSegmentData)=>string, junctionColor:string,
): void {
  const nodes=[...junctions];
  const outline=(polygon:readonly RoadPoint[])=>{
    polygon.forEach((q,i)=>{const p=point(q.x,q.z);if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);});ctx.closePath();
  };
  ctx.lineCap='butt';ctx.lineJoin='round';
  for(const road of roads){
    ctx.save();
    // Cut only this road's logical junctions: an unrelated upper deck stays visible.
    const mouths=nodes.filter(j=>j.pavementFootprint&&j.arms.some(a=>a.segmentId===road.id));
    for(const j of mouths){ctx.beginPath();ctx.rect(-1e7,-1e7,2e7,2e7);outline(j.pavementFootprint!);ctx.clip('evenodd');}
    ctx.strokeStyle=roadColor(road);ctx.lineWidth=Math.max(minimumWidth,road.width*scale);
    ctx.beginPath();road.centerline.forEach((q,i)=>{const p=point(q.x,q.z);if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);});ctx.stroke();ctx.restore();
  }
  ctx.fillStyle=junctionColor;
  for(const j of nodes){
    if(j.pavementFootprint){ctx.beginPath();outline(j.pavementFootprint);ctx.fill();}
    else{const p=point(j.center.x,j.center.z);ctx.fillRect(p.x-j.halfExtentX*scale,p.y-j.halfExtentZ*scale,j.halfExtentX*2*scale,j.halfExtentZ*2*scale);}
  }
}
