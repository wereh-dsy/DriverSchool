import type { CityPoint } from './CityMapData';
export interface RoadNameEntry { primaryText:string;secondaryText?:string;kind:'expressway'|'urban'|'interchange'|'destination';routeNumber?:string }
export type RoadNameRegistry=Record<string,RoadNameEntry>;
export type RoadSignType='EXPRESSWAY_ADVANCE'|'EXPRESSWAY_DIVERGE'|'EXPRESSWAY_ENTRY'|'EXPRESSWAY_DISTANCE'|'EXPRESSWAY_SERVICE'|'RAMP_CONFIRMATION'|'URBAN_DIRECTION'|'ROAD_NAME'|'INTERCHANGE_NAME'|'SPEED_LIMIT'|'CHEVRON';
export type RoadSignTemplate='single-post'|'dual-post'|'gantry'|'highway-gantry'|'ramp-confirmation'|'urban-name'|'ceiling'|'speed-limit'|'chevron';
export type RoadSignSize='small'|'medium'|'large';
export type RoadSignArrow='straight'|'left'|'right'|'exit-right'|'exit-left';
export interface RoadSignDestination { roadNameId:string;directionId?:string;arrow:RoadSignArrow;distanceMetres?:number }
export interface RoadSignDefinition {
  id:string;type:RoadSignType;template:RoadSignTemplate;size:RoadSignSize;roadId:string;
  position:CityPoint;/** Heading of the approaching vehicle; the readable face points back toward it. */heading:number;
  laneDirection:'forward'|'reverse';destinations:RoadSignDestination[];interchangeId?:string;
  language:'zh-CN';exitNumber?:string;advanceMetres?:number;
  /** Authoring provenance; no renderer-specific text or world-coordinate rules. */
  decisionIds?:string[];incomingRoadId?:string;outgoingRoadIds?:string[];
  /** Cantilever post attached to the paved shoulder/deck instead of a fixed
   * world-space offset beyond the bridge. Legacy templates retain their offset. */
  postOffset?:number;
  /** Ground-founded roadside supports can extend below the board's road-height
   * anchor; cantilever supports stay attached to the paved deck. */
  postBaseY?:number;
  stationMetres?:number;
  /** Two deck-mounted supports at signed shoulder offsets; independent of board text. */
  gantryPosts?: [number, number];
  highwayLayout?: boolean;
  facilities?: string[];
  actualAdvanceMetres?: number;
  /** Driver-relative lanes, left to right; independent of geographic destinations. */
  laneArrows?: RoadSignArrow[];
  approachRoadNameId?:string;
  /** Relative underside height for a board hung from a tunnel/upper deck. */
  mountHeight?:number;
  speedLimitKmh?:number;
  chevronDirection?:'left'|'right';
}
export function resolveSignContent(sign:RoadSignDefinition,names:RoadNameRegistry) {
  const name=(id:string)=>{const entry=names[id];if(!entry)throw new Error('Unknown road/sign name '+id);return entry;};
  return {type:sign.type,template:sign.template,size:sign.size,language:sign.language,
    color:['URBAN_DIRECTION','ROAD_NAME'].includes(sign.type)?'#155aa0':'#087747',
    interchange:sign.interchangeId?name(sign.interchangeId).primaryText:undefined,exitNumber:sign.exitNumber,highwayLayout:sign.highwayLayout,facilities:sign.facilities,laneArrows:sign.laneArrows,advanceMetres:sign.actualAdvanceMetres??sign.advanceMetres,approachRoadName:sign.approachRoadNameId?name(sign.approachRoadNameId).primaryText:undefined,
    speedLimitKmh:sign.speedLimitKmh,chevronDirection:sign.chevronDirection,
    destinations:sign.destinations.map(d=>({name:name(d.roadNameId).primaryText,secondaryText:name(d.roadNameId).secondaryText,routeNumber:name(d.roadNameId).routeNumber,
      direction:d.directionId?name(d.directionId).primaryText:undefined,arrow:d.arrow,distanceMetres:d.distanceMetres}))};
}
