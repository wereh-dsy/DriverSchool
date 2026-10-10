/** Coordinates always {x,y,z} metres; Y is elevation. Missing Y is V1 ground compatibility.
 * Rotations about Y in radians; speed limits in km/h. No mesh dependencies. */
export interface CityPoint { x: number; y?: number; z: number }
export type RoadType = 'urban_2lane' | 'urban_4lane' | 'urban_6lane' | 'highway' | 'ramp_1';
import type { RoadNameRegistry,RoadSignDefinition } from './RoadSignData';
export interface CityElementMetadata { groupId?: string; presetSource?: string; designProfile?: 'urban' | 'motorway';roadNameId?:string }
export type TravelDirection = 'two-way' | 'forward' | 'reverse';
export interface CityRoad extends CityElementMetadata {
  id: string; type: RoadType; centerline: CityPoint[]; curve?: 'polyline' | 'smooth';
  laneCount: number; laneWidth: number; travelDirection: TravelDirection; speedLimit: number;
  sidewalk?: { enabled: boolean; width: number }; district?: string;
  styleId?: string;
  /** Paved shoulders relative to centerline order (negative/positive ribbon offset). */
  shoulders?: { left: number; right: number };
  /** Hatched triangular inner-shoulder refuge at merge/diverge mouths. */
  gore?: { start: boolean; end: boolean; length: number };
  elevationMode?: 'ground' | 'elevated' | 'custom';
  elevation?: number;
  structure?: { pierSpacing?: number; pierStyle?: 'round' | 'rectangular'; barrierEnabled?: boolean; piersEnabled?: boolean; barrierOffset?: number;
    /** Floor-relative clear height. Cutting has retaining walls but no roof. */
    enclosure?: { kind: 'tunnel' | 'underpass' | 'cutting'; clearance: number } };
  markings?: boolean; curb?: boolean; streetlights?: boolean;
}
export type IntersectionType = 't_2lane' | 't_4lane' | 'cross_4lane' | 'cross_6lane' | 'irregular';
export type IntersectionPort = 'north' | 'east' | 'south' | 'west' | 'extra';
export interface RoadConnection { roadId: string; end: 'start' | 'end'; port: IntersectionPort }
export interface CityIntersection extends CityElementMetadata {
  id: string; type: IntersectionType; position: CityPoint; rotation: number;
  connections: RoadConnection[]; signalized: boolean;
  signals?: { offsetSeconds?: number; headHeight?: number };
  /** Optional local bearings for skewed and five-leg junctions. Existing cardinal ports are unchanged. */
  portAngles?: Partial<Record<IntersectionPort, number>>;
  channelized?: boolean;
  markingFootprint?: { kind:'junction'; margin?:number } | { kind:'rectangle'; halfWidth:number; halfDepth:number } | { kind:'polygon'; points:CityPoint[] };
  approaches?: Partial<Record<IntersectionPort,{lanes:LaneMovement[];arrowDistance?:number}>>;
}
export type LaneMovement='straight'|'left'|'right'|'straight-left'|'straight-right'|'left-right';
export const PREFAB_IDS = ['residential_low', 'residential_mid', 'office', 'commercial', 'industrial', 'school', 'garage', 'parking', 'tree', 'streetlight', 'traffic_sign', 'bus_stop', 'guardrail', 'parked_car', 'noise_barrier', 'green_strip', 'hardscape', 'embankment', 'guide_sign'] as const;
export type PrefabId = typeof PREFAB_IDS[number];
export interface CityObject extends CityElementMetadata {
  id: string; prefabId: PrefabId; position: CityPoint; rotation: number;
  scale?: { x: number; y: number; z: number }; color?: string; district?: string;
  label?: string;
}
export interface CityMapData {
  schemaVersion?: 1 | 2;
  id: string; name: string; version: number; sectorSize: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  roads: CityRoad[]; intersections: CityIntersection[]; objects: CityObject[];
  roadNames?:RoadNameRegistry;signs?:RoadSignDefinition[];
  /** Explicit endpoint connections (ramps, merges and continued roads), never inferred from crossings. */
  roadLinks?: { id: string; from: RoadEndpoint; to: RoadEndpoint }[];
  /** Labels for stamped ordinary road endpoints; no runtime preset dependency. */
  connectionPorts?: { id: string; label: string; endpoint: RoadEndpoint; groupId?: string; position?: CityPoint; heading?: number }[];
  environment: {
    districts: { id: string; name: string; description?: string }[];
    spawnPoints: { id: string; position: CityPoint; rotation: number }[];
    metadata?: Record<string, string>;
  };
}
export interface RoadEndpoint { roadId: string; end: 'start' | 'end' }
export const ROAD_LANES: Record<RoadType, number> = { urban_2lane: 2, urban_4lane: 4, urban_6lane: 6, highway: 6, ramp_1: 1 };
export const INTERSECTION_LANES: Record<IntersectionType, number> = { t_2lane: 2, t_4lane: 4, cross_4lane: 4, cross_6lane: 6, irregular: 6 };
export function newCityMap(): CityMapData {
  return { schemaVersion: 2, id: 'new-city', name: 'New City', version: 1, sectorSize: 500, roadLinks: [], connectionPorts: [],
    bounds: { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 }, roads: [], intersections: [], objects: [],
    environment: { districts: [], spawnPoints: [{ id: 'start', position: { x: 0, y: 0, z: 0 }, rotation: 0 }] } };
}
