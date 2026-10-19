import type { CityIntersection, CityMapData, CityObject, CityPoint, CityRoad, RoadEndpoint, RoadFunction } from '../world/city/CityMapData';
import type { PresetParameters } from '../world/city/presets/InfrastructurePresets';
import type { RoadNameEntry, RoadSignDefinition } from '../world/city/RoadSignData';

export type CrossingMode = 'intersection' | 'overpass' | 'underpass' | 'none';
export type RoadPresetId = keyof typeof EDITOR_ROAD_PRESETS;
const preset = (label: string, roadClass: RoadFunction, lanes: number, speed: number, shouldered = false, oneWay = false) => ({
  label, properties: { roadClass, crossSection: shouldered ? 'shouldered' as const : lanes > 2 ? 'boulevard' as const : 'street' as const,
    laneCount: lanes, laneWidth: shouldered ? 3.75 : 3.6, speedLimit: speed, travelDirection: oneWay ? 'forward' as const : 'two-way' as const,
    sidewalk: { enabled: !shouldered, width: lanes > 2 ? 3 : 2 }, curb: !shouldered,
    shoulders: { left: shouldered ? 0.75 : 0, right: shouldered ? 1.75 : 0 }, elevationMode: 'custom' as const } satisfies Partial<CityRoad> });
export const EDITOR_ROAD_PRESETS = {
  local: preset('Local 1+1', 'local', 2, 30), collector: preset('Collector 2+2', 'collector', 4, 40),
  arterial4: preset('Arterial 2+2', 'arterial', 4, 50), arterial6: preset('Arterial 3+3', 'arterial', 6, 60), arterial8: preset('Arterial 4+4', 'arterial', 8, 60),
  expressway6: preset('Expressway 3+3', 'expressway', 6, 80, true), expressway8: preset('Expressway 4+4', 'expressway', 8, 80, true),
  frontage2: preset('Frontage 1+1', 'frontage', 2, 40), frontage4: preset('Frontage 2+2', 'frontage', 4, 40),
  ramp1: preset('Ramp 1 lane', 'ramp', 1, 40, true, true), ramp2: preset('Ramp 2 lane', 'ramp', 2, 40, true, true),
};
export type EditorCommand =
  | { op:'moveObject'; id:string; delta:CityPoint }
  | { op:'rotateObject'; id:string; rotation:number }
  | { op:'removeObject'; id:string }
  | { op:'reanchorObject'; id:string; roadId?:string; station?:number; lateralOffset?:number; verticalOffset?:number; strategy?:import('./ObjectAnalysis').ObjectRepairStrategy }
  | { op:'setSignalPlacement'; intersectionId:string; approach:import('../world/city/CityMapData').IntersectionPort; position:CityPoint; heading:number; poleHeight?:number }
  | { op:'brushObjects'; brush:import('./PlacementBrush').PlacementBrushRequest }
  | {op:'modifyMap';properties:Partial<Pick<CityMapData,'id'|'name'|'sectorSize'|'bounds'>>;spawn?:{position:CityPoint;rotation:number}}
  | { op: 'createRoad'; id?: string; preset?: RoadPresetId; points: CityPoint[]; properties?: Partial<CityRoad>; crossing?: CrossingMode; corridorId?: string }
  | { op: 'extendRoad'; roadId: string; end: 'start' | 'end'; points: CityPoint[]; crossing?: CrossingMode }
  | { op: 'moveRoad' | 'moveCorridor'; id: string; delta: CityPoint }
  | { op: 'deleteRoad' | 'deleteObject'; id: string }
  | { op: 'editControlPoint'; roadId: string; index: number; point: CityPoint }
  | { op: 'splitRoad'; roadId: string; point: CityPoint }
  | { op: 'mergeRoads'; roadIds: [string, string] }
  | { op: 'connectRoads'; from: RoadEndpoint; to: RoadEndpoint }
  | { op: 'createCorridor'; id?: string; name: string; roadIds: string[]; district?: string }
  | { op: 'createParallelRoad'; id: string; side: 'left' | 'right'; offset: number; preset?: RoadPresetId; attached?: boolean; elevation?:number }
  | { op: 'generateFrontageRoads'; id: string; side: 'left' | 'right' | 'both'; offset: number; preset?: RoadPresetId; elevation?:number }
  | { op: 'detach'; id: string }
  | { op: 'createRamp'; id?: string; fromRoadId: string; toRoadId: string; fromDistance: number; toDistance: number; kind: 'on' | 'off'; lanes: 1 | 2 }
  | { op: 'modifyRamp'; id: string; points?: CityPoint[]; lanes?: 1 | 2; kind?: 'on' | 'off'; from?: { roadId: string; station: number }; to?: { roadId: string; station: number } }
  | { op: 'createIntersection'; id?: string; position: CityPoint; roadIds?: string[]; signalized?: boolean }
  | { op: 'modifyIntersection'; id: string; properties: Partial<Omit<CityIntersection, 'id'>> }
  | { op: 'changeRoadClass'; id: string; roadClass: RoadFunction }
  | { op: 'changeCrossSection'; id: string; preset: RoadPresetId; properties?: Partial<CityRoad> }
  | { op: 'setElevationProfile'; id: string; height: number; start?: number; end?: number; transition?: number; mode?: 'elevated' | 'depressed' | 'ground'; profile?: { distance: number; height: number }[] }
  | { op: 'createInterchange'; template: 'compact-diamond' | 'diamond' | 'directional-t' | 'ramp-pair'; parameters: PresetParameters }
  | { op: 'placePreset'; presetId: string; parameters: PresetParameters }
  | { op: 'createGroup'; id?: string; name: string; kind: 'corridor' | 'intersection' | 'interchange'; memberIds: string[] }
  | { op: 'setLocked'; id: string; locked: boolean }
  | { op: 'placeObject'; properties: Omit<CityObject, 'id'> & { id?: string } }
  | { op: 'modifyObject'; id: string; properties: Partial<Omit<CityObject, 'id'>> }
  | { op: 'setRoadName'; id: string; nameId: string; entry: RoadNameEntry }
  | { op: 'setCorridorName'; id: string; name: string; nameId?: string; kind?: RoadNameEntry['kind']; roadIds?: string[] }
  | { op: 'smoothRoad'; id: string; start?: number; end?: number; strength?: number; preserveEndpoints?: boolean; preserveIntersections?: boolean; tolerance?: number }
  | { op: 'repairElevation'; id: string; start?: number; end?: number; strength?: number; maxGrade?: number; preserveEndpoints?: boolean; monotonic?: boolean; tolerance?: number; strategy?:import('./RoadProfileAnalysis').ProfileStrategy; anchors?:{station:number;elevation?:number}[] }
  | { op: 'simplifyRoad'; id: string; tolerance?: number; start?: number; end?: number }
  | { op: 'repairRamp'; id: string; strength?: number; maxGrade?: number; monotonic?: boolean; start?:number; end?:number; strategy?:import('./RoadProfileAnalysis').ProfileStrategy; anchors?:{station:number;elevation?:number}[] }
  | { op: 'repairIntersection'; id: string; rebuildFootprint?: boolean; rebuildMarkings?: boolean; approachMargin?: number }
  | { op: 'repairIntersections'; bbox?: EditorArea; intersectionIds?: string[]; codes?: string[]; limit?: number }
  | { op: 'createSign'; id?: string; roadId: string; station: number; direction?: 'forward' | 'reverse'; offset?: number; properties: Partial<RoadSignDefinition> }
  | { op: 'modifySign'; id: string; properties: Partial<Omit<RoadSignDefinition, 'id'>> }
  | { op: 'deleteSign'; id: string }
  | { op: 'modifyRoad'; id: string; properties: Partial<Omit<CityRoad, 'id' | 'centerline'>> };

export interface EditorArea { minX: number; maxX: number; minZ: number; maxZ: number }
export interface EditorIssue { severity: 'error' | 'warning'; code: string; ids: string[]; message: string }
export interface EditSummary {
  id: string; revision: number; label: string; created: string[]; modified: string[]; deleted: string[];
  area: EditorArea | null; warnings: EditorIssue[]; valid: boolean;
  /** Repair measurements for the CLI/Agent receipt (never required by renderers). */
  metrics?: Record<string, unknown>;
}
