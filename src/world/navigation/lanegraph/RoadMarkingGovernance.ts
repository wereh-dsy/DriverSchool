import type { CityMapData } from '../../city/CityMapData';
import { hasCentralBarrier } from '../../city/RoadCarriageway';
import { roadPoints } from '../../city/geometry';
import type { RoadMarkingConflict } from './LaneGraphTypes';

/**
 * Systematically audits and governs road markings across a city map.
 * Ensures consistent traffic rules, lane boundary legality, and seamless visual/semantic alignment.
 */
export class RoadMarkingGovernance {
  /**
   * Scans a map for marking violations and semantic anomalies.
   */
  public static audit(map: CityMapData): RoadMarkingConflict[] {
    const conflicts: RoadMarkingConflict[] = [];
    const roads = map.roads;
    const roadMap = new Map(roads.map(r => [r.id, r]));

    for (const road of roads) {
      if (road.markings === false) continue;
      const pts = roadPoints(road);
      if (pts.length < 2) continue;
      const start = { x: pts[0]!.x, y: pts[0]!.y ?? 0, z: pts[0]!.z };
      const isTwoWay = road.travelDirection === 'two-way';
      const hasBarrier = hasCentralBarrier(road);

      // Check 1: Central median markings on two-way roads
      if (isTwoWay) {
        if (hasBarrier) {
          // Dual carriageway with physical central barrier should have white edge line + barrier, not double yellow
          // Check if road style erroneously specified unseparated paint
          if (road.styleId === 'urban_expressway_6' && !road.structure?.barrierEnabled) {
            conflicts.push({
              roadId: road.id,
              kind: 'missing-barrier-median',
              description: `Two-way expressway ${road.id} has high speed limit (${road.speedLimit} km/h) but missing central physical barrier.`,
              location: start,
              severity: 'warning',
            });
          }
        } else {
          // Undivided two-way: must use double yellow or solid yellow
          // If laneCount >= 4 and no central barrier, double yellow is strictly required
          if (road.laneCount >= 4 && !road.markings) {
            conflicts.push({
              roadId: road.id,
              kind: 'missing-double-yellow',
              description: `Undivided 4+ lane two-way road ${road.id} missing central double yellow marking.`,
              location: start,
              severity: 'error',
            });
          }
        }
      }

      // Check 2: Elevation cliffs between connected road links
      if (map.roadLinks) {
        for (const link of map.roadLinks) {
          if (link.from.roadId !== road.id) continue;
          const other = roadMap.get(link.to.roadId);
          if (!other) continue;
          const ptsA = pts;
          const ptsB = roadPoints(other);
          const endA = link.from.end === 'start' ? ptsA[0]! : ptsA.at(-1)!;
          const endB = link.to.end === 'start' ? ptsB[0]! : ptsB.at(-1)!;
          const yDiff = Math.abs((endA.y ?? 0) - (endB.y ?? 0));
          if (yDiff > 0.35) {
            conflicts.push({
              roadId: road.id,
              kind: 'elevation-cliff',
              description: `Vertical elevation step of ${yDiff.toFixed(2)}m between road ${road.id} and ${other.id}.`,
              location: { x: endA.x, y: endA.y ?? 0, z: endA.z },
              severity: 'error',
            });
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * Returns whether a boundary between two lanes allows legal lane changing.
   */
  public static canChangeLane(
    boundaryType: string,
    isOuterEdge: boolean,
    isOpposingDirection: boolean
  ): boolean {
    if (isOuterEdge || isOpposingDirection) return false;
    if (boundaryType === 'broken-white') return true;
    if (boundaryType === 'solid-white' || boundaryType === 'double-yellow' || boundaryType === 'curb' || boundaryType === 'barrier') {
      return false;
    }
    return false;
  }
}
