import type { CityPoint } from './CityMapData';
export interface RoadNameEntry { primaryText:string;secondaryText?:string;kind:'expressway'|'urban'|'interchange'|'destination' }
export type RoadNameRegistry=Record<string,RoadNameEntry>;
export type RoadSignType='EXPRESSWAY_ADVANCE'|'EXPRESSWAY_DIVERGE'|'RAMP_CONFIRMATION'|'URBAN_DIRECTION'|'ROAD_NAME'|'INTERCHANGE_NAME';
export type RoadSignTemplate='single-post'|'dual-post'|'gantry'|'ramp-confirmation'|'urban-name';
export type RoadSignSize='small'|'medium'|'large';
export type RoadSignArrow='straight'|'left'|'right'|'exit-right';
export interface RoadSignDestination { roadNameId:string;directionId?:string;arrow:RoadSignArrow;distanceMetres?:number }
export interface RoadSignDefinition {
  id:string;type:RoadSignType;template:RoadSignTemplate;size:RoadSignSize;roadId:string;
  position:CityPoint;/** Heading of the approaching vehicle; the readable face points back toward it. */heading:number;
  laneDirection:'forward'|'reverse';destinations:RoadSignDestination[];interchangeId?:string;
  language:'zh-CN';exitNumber?:string;advanceMetres?:number;
}
export function resolveSignContent(sign:RoadSignDefinition,names:RoadNameRegistry) {
  const name=(id:string)=>{const entry=names[id];if(!entry)throw new Error('Unknown road/sign name '+id);return entry;};
  return {type:sign.type,template:sign.template,size:sign.size,language:sign.language,
    color:['URBAN_DIRECTION','ROAD_NAME'].includes(sign.type)?'#155aa0':'#087747',
    interchange:sign.interchangeId?name(sign.interchangeId).primaryText:undefined,exitNumber:sign.exitNumber,
    destinations:sign.destinations.map(d=>({name:name(d.roadNameId).primaryText,secondaryText:name(d.roadNameId).secondaryText,
      direction:d.directionId?name(d.directionId).primaryText:undefined,arrow:d.arrow,distanceMetres:d.distanceMetres}))};
}
