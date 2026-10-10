import type { CityRoad, RoadType, TravelDirection } from './CityMapData';
export interface RoadStyle {
  id: string; label: string; type: RoadType; laneCount: number; laneWidth: number; speedLimit: number;
  direction: TravelDirection; sidewalkWidth: number; barrier: boolean; streetlights: boolean; elevation: number; shoulders?: { left: number; right: number };
}
export const ROAD_STYLES: readonly RoadStyle[] = [
  { id: 'collector_distributor_2', label: 'Collector distributor 2', type: 'highway', laneCount: 2, laneWidth: 3.9, speedLimit: 70, direction: 'forward', sidewalkWidth: 0, barrier: true, streetlights: false, elevation: 0, shoulders: { left: 0.75, right: 1.75 } },
  { id: 'urban_auxiliary_2', label: 'Urban frontage 2', type: 'highway', laneCount: 2, laneWidth: 3.5, speedLimit: 40, direction: 'forward', sidewalkWidth: 3, barrier: false, streetlights: false, elevation: 0 },
  { id: 'urban_local_2', label: 'Urban Local 2', type: 'urban_2lane', laneCount: 2, laneWidth: 3.6, speedLimit: 30, direction: 'two-way', sidewalkWidth: 2, barrier: false, streetlights: true, elevation: 0 },
  { id: 'urban_street_4', label: 'Urban Street 4', type: 'urban_4lane', laneCount: 4, laneWidth: 3.6, speedLimit: 40, direction: 'two-way', sidewalkWidth: 2.5, barrier: false, streetlights: true, elevation: 0 },
  { id: 'urban_boulevard_6', label: 'Urban Boulevard 6', type: 'urban_6lane', laneCount: 6, laneWidth: 3.75, speedLimit: 60, direction: 'two-way', sidewalkWidth: 3, barrier: false, streetlights: true, elevation: 0 },
  { id: 'urban_expressway_6', label: 'Urban Expressway 6', type: 'urban_6lane', laneCount: 6, laneWidth: 3.75, speedLimit: 80, direction: 'two-way', sidewalkWidth: 0, barrier: true, streetlights: true, elevation: 0 },
  { id: 'highway_6', label: 'Highway 6', type: 'highway', laneCount: 6, laneWidth: 3.75, speedLimit: 100, direction: 'two-way', sidewalkWidth: 0, barrier: true, streetlights: false, elevation: 0 },
  { id: 'elevated_expressway_6', label: 'Elevated Expressway 6', type: 'highway', laneCount: 6, laneWidth: 3.75, speedLimit: 80, direction: 'two-way', sidewalkWidth: 0, barrier: true, streetlights: true, elevation: 8, shoulders: { left: 0.75, right: 1.75 } },
  { id: 'ramp_1', label: 'Ramp 1', type: 'ramp_1', laneCount: 1, laneWidth: 3.9, speedLimit: 40, direction: 'forward', sidewalkWidth: 0, barrier: true, streetlights: false, elevation: 0, shoulders: { left: 0.75, right: 1.75 } },
];
export function applyRoadStyle(road: CityRoad, id: string): void {
  const s = ROAD_STYLES.find(s => s.id === id); if (!s) throw new Error(`Unknown road style: ${id}`);
  Object.assign(road, { styleId: s.id, type: s.type, laneCount: s.laneCount, laneWidth: s.laneWidth, speedLimit: s.speedLimit,
    shoulders: s.shoulders ? { ...s.shoulders } : undefined, travelDirection: s.direction, sidewalk: { enabled: s.sidewalkWidth > 0, width: s.sidewalkWidth || 2.5 },
    markings: true, curb: s.sidewalkWidth > 0, streetlights: s.streetlights,
    elevationMode: s.elevation > 0 ? 'elevated' : 'ground', elevation: s.elevation,
    structure: { barrierEnabled: s.barrier, pierSpacing: 30, pierStyle: 'round', piersEnabled: true, barrierOffset: s.shoulders ? 0.25 : 0 } });
  road.centerline.forEach(p => { p.y = s.elevation; });
}
