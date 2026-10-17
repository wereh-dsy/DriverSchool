import type { CityMapData } from '../CityMapData';
import { RoadClearance } from '../RoadClearance';
import { roadPoints, polylineLength, sampleAt, roadEdges, rotatePoint } from '../geometry';
import { ROAD_SIGN_POST_Z, signDimensions } from '../RoadSignTemplates';

/** Authored transliterations, not a runtime translation dependency. */
const LATIN:Record<string,string>={
  内环大道:'Neihuan Ave.',锦城大道:'Jincheng Ave.',明远大道:'Mingyuan Ave.',北城大道:'Beicheng Ave.',南城大道:'Nancheng Ave.',城站路:'Chengzhan Rd.',春晖大道:'Chunhui Ave.',南城工业大道:'Nancheng Gongye Ave.',中央大街:'Zhongyang St.',老城街:'Laocheng St.',人民大道:'Renmin Ave.',金融路:'Jinrong Rd.',公园西路:'Gongyuan Rd. (W)',市府街:'Shifu St.',府前路:'Fuqian Rd.',市府南路:'Shifu Rd. (S)',清和路:'Qinghe Rd.',胜利街:'Shengli St.',人民路:'Renmin Rd.',工坊路:'Gongfang Rd.',解放街:'Jiefang St.',西兴南街:'Xixing St. (S)',科创路:'Kechuang Rd.',春晖路:'Chunhui Rd.',星湖路:'Xinghu Rd.',学府路:'Xuefu Rd.',仓储西路:'Cangchu Rd. (W)',物流西路:'Wuliu Rd. (W)',物流东路:'Wuliu Rd. (E)',学院西路:'Xueyuan Rd. (W)',通港大道:'Tonggang Ave.',通港辅路:'Tonggang Service Rd.',博学路:'Boxue Rd.',仓桥巷:'Cangqiao Ln.',集市街:'Jishi St.',西城二巷:'Xicheng 2nd Ln.',清和街:'Qinghe St.',科创一路:'Kechuang 1st Rd.',物流一路:'Wuliu 1st Rd.',仓储东支路:'Cangchu Branch Rd. (E)',新城二街:'Xincheng 2nd St.',西兴机务路:'Xixing Jiwu Rd.',城站广场路:'Chengzhan Guangchang Rd.',会展路:'Huizhan Rd.',求是路:'Qiushi Rd.',体育路:'Tiyu Rd.',中山路:'Zhongshan Rd.',
};

export function styleCityV62Signs(city:CityMapData):void {
  for(const entry of Object.values(city.roadNames??{}))if(entry.kind==='urban'&&LATIN[entry.primaryText])entry.secondaryText=LATIN[entry.primaryText];
  for(const s of city.signs??[])if(['URBAN_DIRECTION','ROAD_NAME'].includes(s.type)&&s.template!=='ceiling') {
    s.urbanLayout='junction-diagram';s.size='large';
  }
}

/** Re-anchor ramp safety boards to their actual travel station and shoulder.
 * A support outside a bridge is ground-founded, never left floating in space. */
export function calibrateCityV62SafetySigns(city:CityMapData,context:CityMapData):void {
  const clearance=new RoadClearance(context),roads=new Map(city.roads.map(r=>[r.id,r]));let checked=0,moved=0;
  for(const sign of city.signs??[]) {
    const road=roads.get(sign.roadId)!;
    if(!['SPEED_LIMIT','CHEVRON'].includes(sign.type)||!(road.gore||road.type==='ramp_1'))continue;
    const before=JSON.stringify(sign),path=roadPoints(road),length=polylineLength(path),station=sign.stationMetres??0,direction=sign.laneDirection==='reverse'?-1:1,half=road.laneCount*road.laneWidth/2,edges=roadEdges(road),dim=signDimensions(sign.template,sign.size);
    let placed=false;
    for(const shift of [0,-4,4,-8,8,-12,12,-20,20,-35,35,-55,55,-80,80]) {
      const d=station+shift;if(d<1||d>length-1)continue;
      const frame=sampleAt(path,d),heading=Math.atan2(-frame.tangent.x*direction,-frame.tangent.z*direction);
      const a=sampleAt(path,Math.max(0,Math.min(length,d-direction*12))).tangent,b=sampleAt(path,Math.max(0,Math.min(length,d+direction*12))).tangent;
      const turn=(a.x*b.z-a.z*b.x)*direction;
      const preferred=sign.type==='CHEVRON'&&turn>.002?-1:1;
      shoulder:for(const side of [preferred,-preferred])for(let offset=half+dim.width/2+.5;offset<=half+6;offset+=.4) {
        const q=rotatePoint({x:offset*side,z:0},heading),position={x:frame.point.x+q.x,y:frame.point.y??0,z:frame.point.z+q.z},roadOffset=offset*side*direction;
        const onDeck=roadOffset>=edges.left+.3&&roadOffset<=edges.right-.3,base=onDeck?position.y:Math.min(0,position.y),postQ=rotatePoint({x:0,z:ROAD_SIGN_POST_Z},heading),post={x:position.x+postQ.x,z:position.z+postQ.z};
        if(clearance.roadAt(post,.65,base-.15,position.y+dim.poleTop,undefined,undefined,true)||clearance.junctionAt(post,.65,base-.15,position.y+dim.poleTop)||clearance.roadAt(position,dim.width/2+.3,position.y-.15,position.y+dim.poleTop,undefined,undefined,true))continue;
        sign.position=position;sign.heading=heading;sign.stationMetres=d;
        if(onDeck||base===position.y)delete sign.postBaseY;else sign.postBaseY=base;
        if(sign.type==='CHEVRON'&&Math.abs(turn)>.002)sign.chevronDirection=turn>0?'right':'left';
        placed=true;break shoulder;
      }
      if(placed)break;
    }
    if(!placed)throw new Error('V6.2 cannot place ramp safety sign near its shoulder '+sign.id);
    checked++;if(before!==JSON.stringify(sign))moved++;
  }
  city.environment.metadata={...city.environment.metadata,v62RampSigns:JSON.stringify({checked,moved,maxShoulderExtension:6})};
}
