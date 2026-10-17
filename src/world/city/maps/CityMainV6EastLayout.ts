import type { CityMapData, LaneMovement } from '../CityMapData';
import { deleteObject } from '../MapAPI';
import { syncConnections, roadPoints, polylineLength, sampleAt } from '../geometry';
import { setJunctionPavementFootprint } from '../JunctionSurface';

/** The eastern diagonal ran beside Dongcheng Avenue for 880 m and entered at
 * 2.7 degrees. Share the existing arterial between its two cross streets instead
 * of retaining a redundant ribbon and a sliver-shaped block. */
export function regularizeCityV6East(map:CityMapData):void {
  const id='urban-diagonal-split-split-split',road=map.roads.find(r=>r.id===id);
  if(!road)throw new Error('Missing eastern parallel road');
  const oldPath=roadPoints(road);
  deleteObject(map,id);
  for(const jid of ['urban-junction-13','urban-junction-97']) {
    const j=map.intersections.find(j=>j.id===jid)!;
    const from='south',to=jid==='urban-junction-13'?'west':'north';
    const c=j.connections.find(c=>c.port===from)!;c.port=to;
    const angle=j.portAngles![from]!;delete j.portAngles![from];j.portAngles![to]=angle;
    j.type='t_4lane';j.channelized=false;j.approaches={};
    delete j.pavementFootprint;delete j.markingFootprint;
    for(const c of j.connections) {
      const r=map.roads.find(r=>r.id===c.roadId)!,count=r.travelDirection==='two-way'?r.laneCount/2:r.laneCount;
      const lanes:LaneMovement[]=Array.from({length:count},()=> 'straight');
      const stem=jid==='urban-junction-13'?c.port==='east':c.port==='north';
      if(stem) {lanes[0]='left';lanes[count-1]='right';if(count===1)lanes[0]='left-right';else if(count>2)lanes[1]='left-right';}
      else if(jid==='urban-junction-13'?c.port==='west':c.port==='east')lanes[0]='straight-left';
      else lanes[count-1]='straight-right';
      j.approaches[c.port]={lanes,arrowDistance:30};
    }
    setJunctionPavementFootprint(j,map);
  }
  syncConnections(map);
  // Retire only lamps stranded by this specific removed ribbon; retain furniture
  // that still borders Dongcheng Avenue or another surviving road.
  const near=(path:typeof oldPath,p:{x:number;z:number},radius:number)=>{
    const length=polylineLength(path);for(let station=0;station<=length;station+=5){const q=sampleAt(path,station).point;if(Math.hypot(q.x-p.x,q.z-p.z)<radius)return true;}return false;
  };
  const localPaths=map.roads.filter(r=>r.centerline.some(p=>p.x>1150&&p.x<1300&&p.z> -550&&p.z<450)).map(roadPoints);
  map.objects=map.objects.filter(o=>!o.prefabId.startsWith('streetlight')||!near(oldPath,o.position,25)||localPaths.some(path=>near(path,o.position,30)));
  map.environment.metadata={...map.environment.metadata,v6EastLayout:'Removed 880m near-parallel eastern diagonal; use Dongcheng Avenue and existing garden cross street; two T junctions, >=86-degree separation'};
}
