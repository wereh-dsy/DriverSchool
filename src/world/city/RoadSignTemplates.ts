import type { RoadSignDefinition,RoadSignTemplate,RoadSignSize } from './RoadSignData';
import { createStaticOBBCollider } from '../../vehicle/physics/CollisionSystem';
import { rotatePoint } from './geometry';
export const ROAD_SIGN_SIZES={small:{width:3.2,height:0.95},medium:{width:6,height:2.3},large:{width:10,height:3.8}} as const;
export const ROAD_SIGN_POST_Z=-.2;
export const ROAD_SIGN_TEMPLATES:Record<RoadSignTemplate,{bottom:number;posts:number[];poleTop:number}>={
  'single-post':{bottom:3.3,posts:[0],poleTop:4.8},
  'dual-post':{bottom:3.3,posts:[-2.3,2.3],poleTop:5.7},
  // A roadside cantilever keeps supports outside both opposing carriageways.
  'gantry':{bottom:6.5,posts:[12],poleTop:10.5},
  'ramp-confirmation':{bottom:3.1,posts:[0],poleTop:4.7},
  'urban-name':{bottom:2.8,posts:[0],poleTop:3.8},
};
export function signDimensions(template:RoadSignTemplate,size:RoadSignSize,postOffset?:number) {return {...ROAD_SIGN_SIZES[size],...ROAD_SIGN_TEMPLATES[template],...(template==='gantry'&&postOffset!==undefined?{posts:[postOffset]}:{})};}
export function roadSignColliders(sign:RoadSignDefinition) {
  const t=signDimensions(sign.template,sign.size,sign.postOffset),base=sign.position.y??0;
  const at=(x:number,z=0)=>{const p=rotatePoint({x,z},sign.heading);return {x:p.x+sign.position.x,z:p.z+sign.position.z};};
  return [...t.posts.map((x,i)=>createStaticOBBCollider({id:sign.id+':post:'+i,...at(x,ROAD_SIGN_POST_Z),yaw:sign.heading,width:0.24,length:0.24,minHeight:sign.postBaseY??base,maxHeight:base+t.poleTop,type:'obstacle'})),
    createStaticOBBCollider({id:sign.id+':board',...at(0),yaw:sign.heading,width:t.width,length:0.2,minHeight:base+t.bottom,maxHeight:base+t.bottom+t.height,type:'obstacle'})];
}
