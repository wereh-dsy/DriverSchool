import type { CityMapData } from '../../city/CityMapData';
import { LaneGraphBuilder } from './LaneGraphBuilder';
import type {
  LaneEdge,
  LaneGraphValidationReport,
  LanePoint,
  RoadMarkingConflict,
} from './LaneGraphTypes';

export class LaneGraph {
  private readonly lanes: Map<string, LaneEdge>;
  private readonly conflicts: RoadMarkingConflict[];
  private readonly spatialGrid = new Map<string, LaneEdge[]>();
  private readonly cellSize = 50;

  constructor(lanes: Map<string, LaneEdge>, conflicts: RoadMarkingConflict[] = []) {
    this.lanes = lanes;
    this.conflicts = conflicts;
    this.buildSpatialIndex();
  }

  /**
   * Builds a LaneGraph instance directly from a CityMapData structure.
   */
  public static fromMap(map: CityMapData): LaneGraph {
    const { lanes, markingConflicts } = LaneGraphBuilder.build(map);
    return new LaneGraph(lanes, markingConflicts);
  }

  public getLane(id: string): LaneEdge | undefined {
    return this.lanes.get(id);
  }

  public getAllLanes(): LaneEdge[] {
    return Array.from(this.lanes.values());
  }

  public getSuccessors(laneId: string): LaneEdge[] {
    const lane = this.lanes.get(laneId);
    if (!lane) return [];
    return lane.successors.map(id => this.lanes.get(id)).filter((l): l is LaneEdge => l !== undefined);
  }

  public getPredecessors(laneId: string): LaneEdge[] {
    const lane = this.lanes.get(laneId);
    if (!lane) return [];
    return lane.predecessors.map(id => this.lanes.get(id)).filter((l): l is LaneEdge => l !== undefined);
  }

  public getAdjacentLanes(laneId: string): {
    left?: LaneEdge;
    right?: LaneEdge;
    canChangeLeft: boolean;
    canChangeRight: boolean;
  } {
    const lane = this.lanes.get(laneId);
    if (!lane) return { canChangeLeft: false, canChangeRight: false };

    const left = lane.leftLaneId ? this.lanes.get(lane.leftLaneId) : undefined;
    const right = lane.rightLaneId ? this.lanes.get(lane.rightLaneId) : undefined;

    return {
      left,
      right,
      canChangeLeft: lane.laneChangeLeft && left !== undefined,
      canChangeRight: lane.laneChangeRight && right !== undefined,
    };
  }

  /**
   * Projects a world position onto the nearest lane.
   * Filters by elevation layer (ground vs elevated) to prevent snapping to an overpass.
   */
  public findNearestLane(
    x: number,
    z: number,
    y = 0,
    maxDistance = 20,
    preferredLayer?: number
  ): { lane: LaneEdge; s: number; d: number; point: LanePoint } | undefined {
    const candidates = this.findLanesInRadius(x, z, maxDistance);
    let bestDist = Infinity;
    let bestResult: { lane: LaneEdge; s: number; d: number; point: LanePoint } | undefined;

    for (const lane of candidates) {
      if (preferredLayer !== undefined && lane.layerIndex !== preferredLayer) continue;

      // Project onto lane polyline
      const proj = projectPointToPolyline(lane.centerline, x, z, y);
      if (proj && proj.dist < bestDist && proj.dist <= maxDistance) {
        bestDist = proj.dist;
        bestResult = {
          lane,
          s: proj.s,
          d: proj.d,
          point: proj.point,
        };
      }
    }

    return bestResult;
  }

  public findLanesInRadius(x: number, z: number, radius: number): LaneEdge[] {
    const result = new Set<LaneEdge>();
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minZ = Math.floor((z - radius) / this.cellSize);
    const maxZ = Math.floor((z + radius) / this.cellSize);

    for (let gx = minX; gx <= maxX; gx++) {
      for (let gz = minZ; gz <= maxZ; gz++) {
        const key = `${gx},${gz}`;
        const bucket = this.spatialGrid.get(key);
        if (bucket) {
          for (const lane of bucket) result.add(lane);
        }
      }
    }

    return Array.from(result);
  }

  /**
   * Finds the shortest lane-level route from startLaneId to endLaneId via BFS / Dijkstra.
   */
  public findRoute(startLaneId: string, endLaneId: string): LaneEdge[] | undefined {
    if (startLaneId === endLaneId) {
      const l = this.lanes.get(startLaneId);
      return l ? [l] : undefined;
    }

    const queue: { id: string; path: string[] }[] = [{ id: startLaneId, path: [startLaneId] }];
    const visited = new Set<string>([startLaneId]);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.id === endLaneId) {
        return current.path.map(id => this.lanes.get(id)!).filter(Boolean);
      }

      const lane = this.lanes.get(current.id);
      if (!lane) continue;

      // Check both successors and adjacent lane changes
      const nextIds = [...lane.successors];
      if (lane.laneChangeLeft && lane.leftLaneId) nextIds.push(lane.leftLaneId);
      if (lane.laneChangeRight && lane.rightLaneId) nextIds.push(lane.rightLaneId);

      for (const nextId of nextIds) {
        if (!visited.has(nextId)) {
          visited.add(nextId);
          queue.push({ id: nextId, path: [...current.path, nextId] });
        }
      }
    }

    return undefined;
  }

  /**
   * Validates LaneGraph topological integrity, connectivity, and marking conflicts.
   */
  public validate(): LaneGraphValidationReport {
    const all = Array.from(this.lanes.values());
    const physical = all.filter(l => !l.isVirtual);
    const virtualLanes = all.filter(l => l.isVirtual);

    const isolatedLanes: string[] = [];
    const deadEnds: string[] = [];

    for (const lane of physical) {
      if (lane.predecessors.length === 0 && lane.successors.length === 0) {
        isolatedLanes.push(lane.id);
      } else if (lane.successors.length === 0) {
        deadEnds.push(lane.id);
      }
    }

    const elevationCliffs = this.conflicts.filter(c => c.kind === 'elevation-cliff').length;

    return {
      valid: isolatedLanes.length === 0 && elevationCliffs === 0,
      totalLanes: all.length,
      physicalLanes: physical.length,
      virtualLanes: virtualLanes.length,
      isolatedLanes,
      deadEnds,
      markingConflicts: this.conflicts,
      elevationCliffCount: elevationCliffs,
    };
  }

  private buildSpatialIndex(): void {
    this.spatialGrid.clear();
    for (const lane of this.lanes.values()) {
      for (const pt of lane.centerline) {
        const gx = Math.floor(pt.x / this.cellSize);
        const gz = Math.floor(pt.z / this.cellSize);
        const key = `${gx},${gz}`;
        let bucket = this.spatialGrid.get(key);
        if (!bucket) {
          bucket = [];
          this.spatialGrid.set(key, bucket);
        }
        if (!bucket.includes(lane)) bucket.push(lane);
      }
    }
  }
}

function projectPointToPolyline(
  centerline: LanePoint[],
  x: number,
  z: number,
  y: number
): { dist: number; s: number; d: number; point: LanePoint } | undefined {
  if (centerline.length < 2) return undefined;

  let bestDist = Infinity;
  let bestS = 0;
  let bestD = 0;
  let bestPoint = centerline[0]!;

  for (let i = 1; i < centerline.length; i++) {
    const a = centerline[i - 1]!;
    const b = centerline[i]!;

    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const segLenSq = dx * dx + dz * dz;
    if (segLenSq < 1e-6) continue;

    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / segLenSq));
    const px = a.x + t * dx;
    const pz = a.z + t * dz;
    const py = a.y + t * (b.y - a.y);

    const dist = Math.hypot(x - px, z - pz, (y - py) * 1.5);
    if (dist < bestDist) {
      bestDist = dist;
      const segLen = Math.sqrt(segLenSq);
      bestS = a.s + t * segLen;

      // Lateral offset d: cross product of tangent (dx, dz) and vector (x - px, z - pz)
      // Positive = right of travel direction
      const cross = (x - px) * dz - (z - pz) * dx;
      bestD = cross / segLen;

      bestPoint = {
        x: px,
        y: py,
        z: pz,
        s: bestS,
        heading: a.heading + t * (b.heading - a.heading),
        curvature: a.curvature + t * (b.curvature - a.curvature),
        grade: a.grade,
      };
    }
  }

  return { dist: bestDist, s: bestS, d: bestD, point: bestPoint };
}
