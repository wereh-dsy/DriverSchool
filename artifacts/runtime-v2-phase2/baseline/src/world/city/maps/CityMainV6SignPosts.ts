import type { CityMapData, CityPoint } from '../CityMapData';
import { RoadClearance } from '../RoadClearance';
import { ROAD_SIGN_POST_Z, signDimensions } from '../RoadSignTemplates';
import { polylineLength, roadEdges, roadPoints, rotatePoint, sampleAt } from '../geometry';

/** Authoring pass: resolve every column against ALL carriageways and junctions,
 * including overlapping ramps. The renderer/collider consume the same offsets. */
export function calibrateCityV6SignPosts(city:CityMapData,context:CityMapData,skipRampSafety=false):void {
  const clearance=new RoadClearance(context),roads=new Map(city.roads.map(r=>[r.id,r]));
  let movedPosts=0,movedBoards=0,checked=0;
  for(const sign of city.signs??[]) {
    if(sign.template==='ceiling')continue;
    const before=JSON.stringify(sign),road=roads.get(sign.roadId)!,path=roadPoints(road),length=polylineLength(path);
    if(skipRampSafety&&['SPEED_LIMIT','CHEVRON'].includes(sign.type)&&(road.gore||road.type==='ramp_1'))continue;
    const base=structuredClone(sign),station=sign.stationMetres??0;
    const dimensions=()=>signDimensions(sign.template,sign.size,sign.postOffset,sign.gantryPosts,sign.mountHeight);
    const clearPost=(x:number)=>{
      const q=rotatePoint({x,z:ROAD_SIGN_POST_Z},sign.heading),p={x:sign.position.x+q.x,y:sign.postBaseY??sign.position.y??0,z:sign.position.z+q.z};
      return !clearance.roadAt(p,.65,p.y-.15,(sign.position.y??0)+dimensions().poleTop,undefined,undefined,true)
        &&!clearance.junctionAt(p,.65,p.y-.15,(sign.position.y??0)+dimensions().poleTop);
    };
    const lowBoardClear=()=>{
      const dim=dimensions(),y=sign.position.y??0;
      if(['SPEED_LIMIT','CHEVRON'].includes(sign.type))return !clearance.roadAt(sign.position,dim.width/2+.3,y-.15,y+dim.poleTop,undefined,undefined,true);
      if(sign.urbanLayout)for(let x=-dim.width/2;x<=dim.width/2+.01;x+=1){const q=rotatePoint({x,z:0},sign.heading),p={x:sign.position.x+q.x,z:sign.position.z+q.z};if(clearance.roadAt(p,.2,y+dim.bottom-4.5,y+dim.bottom+dim.height+.2))return false;}
      return true;
    };
    let solved=false;
    for(const shift of [0,-20,20,-40,40,-70,70,-110,110,-160,160]) {
      const next=station+shift;if(shift!==0&&(next<2||next>length-2))continue;
      if(shift) {
        const sample=sampleAt(path,next),old=sampleAt(path,station),direction=sign.laneDirection==='reverse'?-1:1;
        sign.heading=Math.atan2(-sample.tangent.x,-sample.tangent.z)+(direction===-1?Math.PI:0);
        sign.position={...sample.point};sign.stationMetres=next;
        if(base.postBaseY!==undefined)sign.postBaseY=Math.min(0,sample.point.y??0);
        if(base.actualAdvanceMetres!==undefined)sign.actualAdvanceMetres=Math.max(0,base.actualAdvanceMetres-shift*direction);
        if(['SPEED_LIMIT','CHEVRON'].includes(sign.type)) {
          const lateral=Math.hypot(base.position.x-old.point.x,base.position.z-old.point.z),q=rotatePoint({x:lateral,z:0},sign.heading);sign.position.x+=q.x;sign.position.z+=q.z;
        }
      }
      if(dimensions().posts.every(clearPost)&&lowBoardClear()){solved=true;break;}
      if(sign.template==='gantry') {
        const min=Math.ceil((road.laneCount*road.laneWidth/2+.9)*2)/2;
        for(let offset=min;offset<=30&&!solved;offset+=.5)for(const side of [1,-1])if(clearPost(offset*side)){sign.postOffset=offset*side;solved=true;break;}
        if(!solved&&base.postBaseY!==undefined) {
          // A bridge-shoulder foundation need not extend through a lower road.
          // Keep the whole 50 cm foot plate on its own paved shoulder.
          delete sign.postBaseY;
          const edges=roadEdges(road),forward=sign.laneDirection==='forward';
          for(let offset=min;offset<=Math.max(-edges.left,edges.right)-.3&&!solved;offset+=.25)for(const side of [1,-1]) {
            const local=offset*side,roadOffset=forward?local:-local;
            if(roadOffset<edges.left+.3||roadOffset>edges.right-.3)continue;
            if(clearPost(local)){sign.postOffset=local;solved=true;break;}
          }
          if(!solved)sign.postBaseY=base.postBaseY;
        }
      }else if(sign.template==='highway-gantry') {
        const min=Math.ceil((road.laneCount*road.laneWidth/2+.9)*2)/2;
        let left:number|undefined,right:number|undefined;
        for(let offset=min;offset<=24;offset+=.5){if(left===undefined&&clearPost(-offset))left=-offset;if(right===undefined&&clearPost(offset))right=offset;}
        if(left!==undefined&&right!==undefined&&right-left<=40){sign.gantryPosts=[left,right];solved=true;}
      }else if(['SPEED_LIMIT','CHEVRON'].includes(sign.type)) {
        const anchor=sampleAt(path,next).point;
        for(let offset=road.laneCount*road.laneWidth/2+2;offset<=28&&!solved;offset+=.5)for(const side of [1,-1]) {
          const q=rotatePoint({x:offset*side,z:0},sign.heading);sign.position={x:anchor.x+q.x,y:anchor.y??0,z:anchor.z+q.z};
          if(clearPost(0)&&lowBoardClear()){solved=true;break;}
        }
      }
      if(solved&&!lowBoardClear())solved=false;
      if(solved)break;
    }
    if(!solved)throw new Error('V6 cannot place a column clear of all traffic lanes: '+JSON.stringify({sign:base,roadLength:length,ends:[path[0],path.at(-1)]}));
    checked+=dimensions().posts.length;
    if(!samePosition(base.position,sign.position))movedBoards++;
    if(before!==JSON.stringify(sign))movedPosts++;
  }
  city.environment.metadata={...city.environment.metadata,v6SignPostCalibration:JSON.stringify({checked,adjustedSigns:movedPosts,relocatedBoards:movedBoards,clearanceMetres:.65})};
}
const samePosition=(a:CityPoint,b:CityPoint)=>Math.hypot(a.x-b.x,(a.y??0)-(b.y??0),a.z-b.z)<1e-6;
