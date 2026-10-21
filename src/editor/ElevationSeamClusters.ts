import type { CityMapData,CityPoint } from '../world/city/CityMapData';
import {compileJunctionSurface} from '../world/city/JunctionSurface';
import {rotatePoint} from '../world/city/geometry';
import {bounds,distance,EditorSpatialIndex,union,overlaps} from './EditorGeometry';
import {makePavementSegments,type ElevationSeam,type SeamScope} from './ElevationSeams';

export type SeamConclusion='FIXED'|'INTENTIONAL_PROFILE'|'GRADE_SEPARATED'|'NON_DRIVABLE_OVERLAP'|'DEFER_UNCERTAIN';
export interface SeamCluster {
  id:string;roadIds:[string,string];junctionId?:string;members:ElevationSeam[];bbox:ElevationSeam['bbox'];
  location:CityPoint;maxHeightDelta:number;minHeightDelta:number;normalDot:number;overlapLength:number;
  stationRanges:ElevationSeam['stationRanges'];topologyRelations:string[];footprintOverlap:boolean;
  supportSwitchPossible:boolean;risk:'high'|'medium'|'structure';conclusion?:SeamConclusion;
}
/** Category-independent connected runs of one physical road pair. */
export function clusterElevationSeams(issues:ElevationSeam[],gap=35):SeamCluster[]{
  const pairs=new Map<string,ElevationSeam[]>();
  for(const issue of issues){
    const s=structuredClone(issue);
    if(s.roadIds[0]>s.roadIds[1]){s.roadIds.reverse();s.stationRanges.reverse();s.localGrade.reverse();}
    const key=s.roadIds.join('|'),list=pairs.get(key)??[];list.push(s);pairs.set(key,list);
  }
  const result:SeamCluster[]=[];
  for(const list of pairs.values()){
    list.sort((a,b)=>a.stationRanges[0][0]-b.stationRanges[0][0]);
    const runs:ElevationSeam[][]=[];
    for(const s of list){
      const matching=runs.filter(run=>run.some(t=>s.stationRanges.every((r,i)=>r[0]<=t.stationRanges[i]![1]+gap&&r[1]>=t.stationRanges[i]![0]-gap)));
      if(!matching.length)runs.push([s]);else{matching[0]!.push(s);for(const other of matching.slice(1)){matching[0]!.push(...other);runs.splice(runs.indexOf(other),1);}}
    }
    for(const members of runs){
      const worst=members.reduce((a,b)=>a.maxHeightDelta>b.maxHeightDelta?a:b),stationRanges=([0,1] as const).map(i=>[Math.min(...members.map(s=>s.stationRanges[i][0])),Math.max(...members.map(s=>s.stationRanges[i][1]))]) as ElevationSeam['stationRanges'];
      const footprintOverlap=members.some(s=>s.footprintOverlap),possible=members.some(s=>s.footprintOverlap&&s.maxHeightDelta>=.02&&s.minHeightDelta<1.75);
      const junction=worst.roadIds.find(id=>id.startsWith('junction:'));
      result.push({id:'cluster:'+worst.roadIds.join('|')+':'+stationRanges[0][0].toFixed(1)+':'+stationRanges[1][0].toFixed(1),roadIds:worst.roadIds,members,bbox:union(members.map(s=>s.bbox))!,location:worst.location,maxHeightDelta:worst.maxHeightDelta,minHeightDelta:Math.min(...members.map(s=>s.minHeightDelta)),normalDot:Math.min(...members.map(s=>s.normalDot)),overlapLength:Math.max(...stationRanges.map(s=>s[1]-s[0])),stationRanges,topologyRelations:[...new Set(members.map(s=>s.topologyRelation))],footprintOverlap,supportSwitchPossible:possible,risk:possible&&members.some(s=>s.normalDot>.99&&s.maxHeightDelta>=.05&&s.minHeightDelta<=.3)?'high':possible?'medium':'structure',...(junction?{junctionId:junction.slice(9)}:{})});
    }
  }
  return result.sort((a,b)=>a.id.localeCompare(b.id));
}

/** Scan the actual ownership boundary, not the deliberately hidden road beneath a junction. */
export function diagnoseJunctionElevationSeams(map:CityMapData,threshold=.02,scope:SeamScope={}){
  const segments=makePavementSegments(map),index=new EditorSpatialIndex(64);segments.forEach((s,i)=>index.set(String(i),s.box));
  const hits=new Map<string,ElevationSeam>();let samples=0;
  for(const j of map.intersections){
    if(!j.pavementFootprint)continue;const surface=compileJunctionSurface(j),outline=j.pavementFootprint.map(p=>{const q=rotatePoint(p,j.rotation);return {x:j.position.x+q.x,z:j.position.z+q.z};});
    if(scope.bbox&&!overlaps(bounds(outline),scope.bbox))continue;
    for(let k=0;k<outline.length;k++){
      const a=outline[k]!,b=outline[(k+1)%outline.length]!,length=distance(a,b);if(length<.001)continue;
      const nx=-(b.z-a.z)/length,nz=(b.x-a.x)/length,count=Math.max(1,Math.ceil(length/.5));
      for(let n=0;n<=count;n++){
        const p={x:a.x+(b.x-a.x)*n/count,z:a.z+(b.z-a.z)*n/count},plus={x:p.x+nx*.025,z:p.z+nz*.025},minus={x:p.x-nx*.025,z:p.z-nz*.025};
        const positive=surface.contains(plus.x,plus.z),negative=surface.contains(minus.x,minus.z);if(positive===negative)continue;
        const outside=positive?minus:plus,inside=positive?plus:minus;
        if(scope.bbox&&(outside.x<scope.bbox.minX||outside.x>scope.bbox.maxX||outside.z<scope.bbox.minZ||outside.z>scope.bbox.maxZ))continue;
        const jY=surface.heightAt(p.x,p.z),jx=(surface.heightAt(inside.x+.001,inside.z)-surface.heightAt(inside.x-.001,inside.z))/.002,jz=(surface.heightAt(inside.x,inside.z+.001)-surface.heightAt(inside.x,inside.z-.001))/.002;
        for(const id of index.query(bounds([outside],.001))){const s=segments[Number(id)]!;
          if(scope.roadId&&scope.roadId!==s.road.id)continue;
          if(s.surface.extensionAt(outside.x,outside.z)>.02||!s.surface.contains(0)(outside.x,outside.z))continue;samples++;
          const y=s.surface.heightAt(p.x,p.z),delta=Math.abs(y-jY);if(delta<threshold)continue;
          const key=s.road.id+'|'+j.id,station=s.start+Math.max(0,Math.min(s.length,(p.x-s.a.x)*s.tx+(p.z-s.a.z)*s.tz)),normal=(1+s.surface.gx*jx+s.surface.gz*jz)/Math.hypot(1,s.surface.gx,s.surface.gz)/Math.hypot(1,jx,jz),old=hits.get(key);
          if(old){old.minHeightDelta=Math.min(old.minHeightDelta,delta);old.normalDot=Math.min(old.normalDot,normal);old.bbox=union([old.bbox,bounds([p])])!;old.stationRanges[0][0]=Math.min(old.stationRanges[0][0],station);old.stationRanges[0][1]=Math.max(old.stationRanges[0][1],station);old.overlapLength=old.stationRanges[0][1]-old.stationRanges[0][0];if(!old.segmentIds.includes(s.road.id+':'+s.index))old.segmentIds.push(s.road.id+':'+s.index);
            if(delta>old.maxHeightDelta){old.maxHeightDelta=delta;old.location={...p,y};}continue;}
          hits.set(key,{id:'junction-seam:'+key,category:'MANUAL_REVIEW',roadIds:[s.road.id,'junction:'+j.id],segmentIds:[s.road.id+':'+s.index],bbox:bounds([p]),location:{...p,y},maxHeightDelta:delta,minHeightDelta:delta,normalDot:normal,localGrade:[(s.surface.gx*s.tx+s.surface.gz*s.tz),jx*s.tx+jz*s.tz],gradeDiscontinuity:Math.abs((s.surface.gx-jx)*s.tx+(s.surface.gz-jz)*s.tz),overlapLength:0,overlapArea:0,footprintOverlap:true,horizontalGap:0,topologyRelation:j.connections.some(c=>c.roadId===s.road.id)?'junction-boundary-connected':'junction-boundary-projection',stationRanges:[[station,station],[0,0]],reasons:['Physical road-to-junction ownership boundary height mismatch; includes actual outside approach support']});
        }
      }
    }
  }
  return {coverage:{junctions:map.intersections.length,boundarySamples:samples},issues:[...hits.values()]};
}
