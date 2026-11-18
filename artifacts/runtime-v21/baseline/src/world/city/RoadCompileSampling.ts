import type { CityPoint } from './CityMapData';
import { sampleAt } from './geometry';

/** Compile-scope sampler. Cache only segment lengths, never rounded prefix sums:
 * subtraction order, endpoint choices and XYZ remain bit-for-bit sampleAt's.
 * No global path cache can retain unloaded sectors or become stale after edits. */
export function roadCompileSampler(points:readonly CityPoint[]):(distance:number)=>ReturnType<typeof sampleAt> {
  if(points.length<16)return distance=>sampleAt(points,distance);
  const lengths=new Float64Array(points.length);
  for(let i=1;i<points.length;i++)lengths[i]=Math.hypot(points[i]!.x-points[i-1]!.x,points[i]!.z-points[i-1]!.z);
  return distance=>{
    for(let i=1;i<points.length;i++){
      const a=points[i-1]!,b=points[i]!,length=lengths[i]!;
      if(length<1e-8)continue;
      if(distance<=length||i===points.length-1){const t=Math.min(1,distance/length);return {point:{x:a.x+(b.x-a.x)*t,y:(a.y??0)+((b.y??0)-(a.y??0))*t,z:a.z+(b.z-a.z)*t},tangent:{x:(b.x-a.x)/length,y:((b.y??0)-(a.y??0))/length,z:(b.z-a.z)/length}};}
      distance-=length;
    }
    return {point:points[0]!,tangent:{x:0,z:-1}};
  };
}
