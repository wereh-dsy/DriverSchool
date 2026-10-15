import type { RoadIntersectionData, RoadPoint, RoadSegmentData, RoadMapAnnotation } from '../world/navigation/RoadNetwork';

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
