import type { CityRoad, RoadCrossSectionId } from './CityMapData';

/** Geometric defaults only: no speed, traffic function, elevation or piers. */
export const ROAD_CROSS_SECTIONS = {
  street: { laneCount: 2, laneWidth: 3.6, sidewalk: { enabled: true, width: 2 }, curb: true, shoulders: { left: 0, right: 0 } },
  boulevard: { laneCount: 6, laneWidth: 3.75, sidewalk: { enabled: true, width: 3 }, curb: true, shoulders: { left: 0, right: 0 } },
  shouldered: { laneCount: 3, laneWidth: 3.75, sidewalk: { enabled: false, width: 2 }, curb: false, shoulders: { left: 0.75, right: 1.75 } },
} satisfies Record<RoadCrossSectionId, Partial<CityRoad>>;

export function applyRoadCrossSection(road: CityRoad, id: RoadCrossSectionId): void {
  const preset = ROAD_CROSS_SECTIONS[id];
  Object.assign(road, preset, { crossSection: id, sidewalk: { ...preset.sidewalk }, shoulders: { ...preset.shoulders } });
}
