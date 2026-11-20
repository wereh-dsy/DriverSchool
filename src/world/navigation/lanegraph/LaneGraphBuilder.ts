import type { CityIntersection, CityMapData, CityPoint, CityRoad } from '../../city/CityMapData';
import { hasCentralBarrier } from '../../city/RoadCarriageway';
import { polylineLength, roadPoints, sampleAt } from '../../city/geometry';
import type {
  LaneBoundary,
  LaneBoundaryType,
  LaneConflictArea,
  LaneEdge,
  LaneManeuver,
  LanePoint,
  LaneStopLine,
  RoadMarkingConflict,
} from './LaneGraphTypes';
import { RoadMarkingGovernance } from './RoadMarkingGovernance';

export interface LaneGraphBuildOptions {
  sampleSpacingMetres?: number;
}

export class LaneGraphBuilder {
  /**
   * Builds a complete, connected LaneGraph from CityMapData.
   */
  public static build(
    map: CityMapData,
    options: LaneGraphBuildOptions = {}
  ): { lanes: Map<string, LaneEdge>; markingConflicts: RoadMarkingConflict[] } {
    const spacing = options.sampleSpacingMetres ?? 1.5;
    const lanes = new Map<string, LaneEdge>();
    const roadMap = new Map(map.roads.map(r => [r.id, r]));

    // 1. Build physical lanes for all roads
    for (const road of map.roads) {
      const roadLanes = LaneGraphBuilder.buildRoadLanes(road, spacing);
      for (const lane of roadLanes) {
        lanes.set(lane.id, lane);
      }
    }

    // 2. Connect direct road-to-road links (roadLinks)
    if (map.roadLinks) {
      for (const link of map.roadLinks) {
        const fromRoad = roadMap.get(link.from.roadId);
        const toRoad = roadMap.get(link.to.roadId);
        if (!fromRoad || !toRoad) continue;

        const fromLanes = Array.from(lanes.values()).filter(l => l.roadId === fromRoad.id);
        const toLanes = Array.from(lanes.values()).filter(l => l.roadId === toRoad.id);

        for (const fLane of fromLanes) {
          // Check if this lane travels towards the link endpoint
          const isFromExit = (fLane.direction === 'forward' && link.from.end === 'end') ||
                            (fLane.direction === 'reverse' && link.from.end === 'start');
          if (!isFromExit) continue;

          for (const tLane of toLanes) {
            const isToEntrance = (tLane.direction === 'forward' && link.to.end === 'start') ||
                                 (tLane.direction === 'reverse' && link.to.end === 'end');
            if (!isToEntrance) continue;

            // Match lanes by relative lateral position or index
            const fCenter = fLane.centerline.at(-1)!;
            const tCenter = tLane.centerline[0]!;
            const dist = Math.hypot(fCenter.x - tCenter.x, fCenter.z - tCenter.z);

            if (dist < 4.5 && Math.abs(fCenter.y - tCenter.y) < 0.6) {
              if (!fLane.successors.includes(tLane.id)) fLane.successors.push(tLane.id);
              if (!tLane.predecessors.includes(fLane.id)) tLane.predecessors.push(fLane.id);
            }
          }
        }
      }
    }

    // 3. Build virtual junction connector lanes
    for (const j of map.intersections) {
      const virtualLanes = LaneGraphBuilder.buildJunctionLanes(j, map, lanes, spacing);
      for (const vLane of virtualLanes) {
        lanes.set(vLane.id, vLane);
      }
    }

    // 4. Calculate conflict zones for virtual junction lanes
    LaneGraphBuilder.resolveJunctionConflicts(lanes, map.intersections);

    // 5. Audit road markings
    const markingConflicts = RoadMarkingGovernance.audit(map);

    return { lanes, markingConflicts };
  }

  /**
   * Builds individual physical lanes from a road segment.
   */
  private static buildRoadLanes(road: CityRoad, spacing: number): LaneEdge[] {
    const pts = roadPoints(road);
    const totalRoadLength = polylineLength(pts);
    const result: LaneEdge[] = [];
    const count = road.laneCount;
    const laneWidth = road.laneWidth;
    const halfWidth = (count * laneWidth) / 2;
    const isTwoWay = road.travelDirection === 'two-way';
    const hasBarrier = hasCentralBarrier(road);
    const speedKmh = road.speedLimit ?? 50;
    const speedMps = speedKmh / 3.6;

    // Resample centerline at regular spacing
    const numSamples = Math.max(2, Math.ceil(totalRoadLength / spacing));
    const samples: { point: CityPoint; tangent: CityPoint; s: number }[] = [];
    for (let i = 0; i <= numSamples; i++) {
      const s = (i / numSamples) * totalRoadLength;
      const sampled = sampleAt(pts, s);
      samples.push({ point: sampled.point, tangent: sampled.tangent, s });
    }

    for (let index = 0; index < count; index++) {
      const id = `${road.id}:lane:${index}`;
      // In two-way roads: index < count / 2 travels reverse, index >= count / 2 travels forward
      const isReverse = isTwoWay ? index < count / 2 : road.travelDirection === 'reverse';
      const direction: 'forward' | 'reverse' = isReverse ? 'reverse' : 'forward';

      // Centerline lateral offset from road centerline (negative = left, positive = right)
      const laneCenterOffset = -halfWidth + (index + 0.5) * laneWidth;
      const leftBoundaryOffset = laneCenterOffset - laneWidth / 2;
      const rightBoundaryOffset = laneCenterOffset + laneWidth / 2;

      // Generate forward points
      const rawPoints: LanePoint[] = [];
      const leftPoints: LanePoint[] = [];
      const rightPoints: LanePoint[] = [];

      let runningS = 0;
      for (let i = 0; i < samples.length; i++) {
        const s = samples[i]!;
        // Normal pointing to the right of travel (+X when heading forward)
        // Tangent: (-sin(yaw), cos(yaw)) in planar geometry
        const nx = -s.tangent.z;
        const nz = s.tangent.x;

        const cx = s.point.x + nx * laneCenterOffset;
        const cy = s.point.y ?? 0;
        const cz = s.point.z + nz * laneCenterOffset;

        const lx = s.point.x + nx * leftBoundaryOffset;
        const lz = s.point.z + nz * leftBoundaryOffset;

        const rx = s.point.x + nx * rightBoundaryOffset;
        const rz = s.point.z + nz * rightBoundaryOffset;

        let segLength = 0;
        if (i > 0) {
          const prev = rawPoints[i - 1]!;
          segLength = Math.hypot(cx - prev.x, cz - prev.z, cy - prev.y);
          runningS += segLength;
        }

        const heading = Math.atan2(-s.tangent.x, -s.tangent.z);

        rawPoints.push({
          x: cx,
          y: cy,
          z: cz,
          s: runningS,
          heading,
          curvature: 0,
          grade: 0,
        });

        leftPoints.push({
          x: lx,
          y: cy,
          z: lz,
          s: runningS,
          heading,
          curvature: 0,
          grade: 0,
        });

        rightPoints.push({
          x: rx,
          y: cy,
          z: rz,
          s: runningS,
          heading,
          curvature: 0,
          grade: 0,
        });
      }

      // Compute curvature and grade
      for (let i = 0; i < rawPoints.length; i++) {
        const pPrev = rawPoints[Math.max(0, i - 1)]!;
        const pNext = rawPoints[Math.min(rawPoints.length - 1, i + 1)]!;
        const ds = Math.max(0.1, pNext.s - pPrev.s);
        let dHeading = pNext.heading - pPrev.heading;
        while (dHeading > Math.PI) dHeading -= Math.PI * 2;
        while (dHeading < -Math.PI) dHeading += Math.PI * 2;
        rawPoints[i]!.curvature = dHeading / ds;
        rawPoints[i]!.grade = (pNext.y - pPrev.y) / ds;
      }

      // If travel direction is reverse, reverse the array so centerline[0] is start of travel
      let finalCenterline = rawPoints;
      let finalLeft = leftPoints;
      let finalRight = rightPoints;

      if (isReverse) {
        finalCenterline = rawPoints.slice().reverse();
        // Recompute s from 0
        let sAcc = 0;
        finalCenterline[0]!.s = 0;
        for (let i = 1; i < finalCenterline.length; i++) {
          const prev = finalCenterline[i - 1]!;
          const curr = finalCenterline[i]!;
          sAcc += Math.hypot(curr.x - prev.x, curr.z - prev.z, curr.y - prev.y);
          curr.s = sAcc;
          // Invert heading for reverse travel
          let h = curr.heading + Math.PI;
          while (h > Math.PI) h -= Math.PI * 2;
          while (h < -Math.PI) h += Math.PI * 2;
          curr.heading = h;
          curr.curvature = -curr.curvature;
          curr.grade = -curr.grade;
        }

        // For reverse direction, left and right swap relative to travel direction!
        const temp = leftPoints.slice().reverse();
        finalLeft = rightPoints.slice().reverse();
        finalRight = temp;
      }

      // Boundary types
      let leftType: LaneBoundaryType = 'broken-white';
      let rightType: LaneBoundaryType = 'broken-white';

      if (!isReverse) {
        const isInnerForward = isTwoWay ? index === count / 2 : index === 0;
        if (isInnerForward) {
          leftType = isTwoWay ? (hasBarrier ? 'curb' : 'double-yellow') : 'solid-white';
        }
        if (index === count - 1) {
          rightType = 'solid-white';
        }
      } else {
        const isInnerReverse = isTwoWay ? index === count / 2 - 1 : index === count - 1;
        if (isInnerReverse) {
          leftType = isTwoWay ? (hasBarrier ? 'curb' : 'double-yellow') : 'solid-white';
        }
        if (index === 0) {
          rightType = 'solid-white';
        }
      }

      const leftBoundary: LaneBoundary = { type: leftType, points: finalLeft };
      const rightBoundary: LaneBoundary = { type: rightType, points: finalRight };

      // Adjacent lane connections
      let leftLaneId: string | undefined;
      let rightLaneId: string | undefined;

      if (!isReverse) {
        if (index > (isTwoWay ? count / 2 : 0)) {
          leftLaneId = `${road.id}:lane:${index - 1}`;
        }
        if (index < count - 1) {
          rightLaneId = `${road.id}:lane:${index + 1}`;
        }
      } else {
        if (index < count / 2 - 1) {
          leftLaneId = `${road.id}:lane:${index + 1}`;
        }
        if (index > 0) {
          rightLaneId = `${road.id}:lane:${index - 1}`;
        }
      }

      const laneChangeLeft = leftType === 'broken-white';
      const laneChangeRight = rightType === 'broken-white';

      // Elevation and curvature statistics
      const ys = finalCenterline.map(p => p.y);
      const curvatures = finalCenterline.map(p => Math.abs(p.curvature));
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const maxCurvature = Math.max(...curvatures);
      const meanCurvature = curvatures.reduce((a, b) => a + b, 0) / Math.max(1, curvatures.length);

      const layerIndex = minY >= 4.0 ? 1 : minY <= -2.0 ? -1 : 0;

      result.push({
        id,
        roadId: road.id,
        isVirtual: false,
        index,
        direction,
        width: laneWidth,
        speedLimitMps: speedMps,
        speedLimitKmh: speedKmh,
        centerline: finalCenterline,
        length: finalCenterline.at(-1)?.s ?? totalRoadLength,
        leftBoundary,
        rightBoundary,
        laneChangeLeft,
        laneChangeRight,
        leftLaneId,
        rightLaneId,
        predecessors: [],
        successors: [],
        allowedManeuvers: ['straight', 'left', 'right'],
        elevationProfile: {
          minY,
          maxY,
          averageGrade: finalCenterline.length > 1 ? (finalCenterline.at(-1)!.y - finalCenterline[0]!.y) / finalCenterline.at(-1)!.s : 0,
        },
        curvatureProfile: {
          maxCurvature,
          meanCurvature,
        },
        layerIndex,
        roadFunction: road.roadClass,
      });
    }

    return result;
  }

  /**
   * Generates virtual connector lanes inside an intersection.
   */
  private static buildJunctionLanes(
    j: CityIntersection,
    map: CityMapData,
    allLanes: Map<string, LaneEdge>,
    spacing: number
  ): LaneEdge[] {
    const virtualLanes: LaneEdge[] = [];
    const roads = new Map(map.roads.map(r => [r.id, r]));

    for (const incoming of j.connections) {
      const fromRoad = roads.get(incoming.roadId);
      if (!fromRoad) continue;

      for (const outgoing of j.connections) {
        if (incoming.roadId === outgoing.roadId) continue;
        const toRoad = roads.get(outgoing.roadId);
        if (!toRoad) continue;

        // Classify turn movement
        const ptsFrom = roadPoints(fromRoad);
        const ptsTo = roadPoints(toRoad);
        const movement = turnMovement(ptsFrom, incoming.end, ptsTo, outgoing.end);

        // Find incoming lanes heading into this junction
        const incomingLanes = Array.from(allLanes.values()).filter(l => {
          if (l.roadId !== fromRoad.id) return false;
          return (l.direction === 'forward' && incoming.end === 'end') ||
                 (l.direction === 'reverse' && incoming.end === 'start');
        });

        // Find outgoing lanes heading away from this junction
        const outgoingLanes = Array.from(allLanes.values()).filter(l => {
          if (l.roadId !== toRoad.id) return false;
          return (l.direction === 'forward' && outgoing.end === 'start') ||
                 (l.direction === 'reverse' && outgoing.end === 'end');
        });

        if (incomingLanes.length === 0 || outgoingLanes.length === 0) continue;

        // Pair lanes appropriately (e.g. left-turn from leftmost to leftmost)
        for (let i = 0; i < incomingLanes.length; i++) {
          const fromLane = incomingLanes[i]!;
          // Match to best outgoing lane
          const targetIndex = Math.min(i, outgoingLanes.length - 1);
          const toLane = outgoingLanes[targetIndex]!;

          const pStart = fromLane.centerline.at(-1)!;
          const pEnd = toLane.centerline[0]!;

          // Generate cubic Bezier curve through junction
          const dist = Math.hypot(pEnd.x - pStart.x, pEnd.z - pStart.z);
          if (dist > 150) continue; // Skip implausible connections

          const tanLen = Math.max(3, dist * 0.4);
          const cp1x = pStart.x - Math.sin(pStart.heading) * tanLen;
          const cp1z = pStart.z - Math.cos(pStart.heading) * tanLen;
          const cp2x = pEnd.x + Math.sin(pEnd.heading) * tanLen;
          const cp2z = pEnd.z + Math.cos(pEnd.heading) * tanLen;

          const numSteps = Math.max(4, Math.ceil(dist / spacing));
          const curvePoints: LanePoint[] = [];

          let sAcc = 0;
          for (let step = 0; step <= numSteps; step++) {
            const t = step / numSteps;
            const t1 = 1 - t;
            const x = t1 * t1 * t1 * pStart.x + 3 * t1 * t1 * t * cp1x + 3 * t1 * t * t * cp2x + t * t * t * pEnd.x;
            const z = t1 * t1 * t1 * pStart.z + 3 * t1 * t1 * t * cp1z + 3 * t1 * t * t * cp2z + t * t * t * pEnd.z;
            const y = (1 - t) * pStart.y + t * pEnd.y;

            if (step > 0) {
              const prev = curvePoints[step - 1]!;
              sAcc += Math.hypot(x - prev.x, z - prev.z, y - prev.y);
            }

            // Tangent derivative:
            const dx = 3 * t1 * t1 * (cp1x - pStart.x) + 6 * t1 * t * (cp2x - cp1x) + 3 * t * t * (pEnd.x - cp2x);
            const dz = 3 * t1 * t1 * (cp1z - pStart.z) + 6 * t1 * t * (cp2z - cp1z) + 3 * t * t * (pEnd.z - cp2z);
            const heading = Math.atan2(-dx, -dz);

            curvePoints.push({
              x,
              y,
              z,
              s: sAcc,
              heading,
              curvature: 0,
              grade: (pEnd.y - pStart.y) / Math.max(1, dist),
            });
          }

          // Calculate curvature
          for (let k = 0; k < curvePoints.length; k++) {
            const pPrev = curvePoints[Math.max(0, k - 1)]!;
            const pNext = curvePoints[Math.min(curvePoints.length - 1, k + 1)]!;
            const ds = Math.max(0.1, pNext.s - pPrev.s);
            let dHeading = pNext.heading - pPrev.heading;
            while (dHeading > Math.PI) dHeading -= Math.PI * 2;
            while (dHeading < -Math.PI) dHeading += Math.PI * 2;
            curvePoints[k]!.curvature = dHeading / ds;
          }

          const vId = `virtual:${j.id}:${fromLane.id}->${toLane.id}`;
          const stopLine: LaneStopLine = {
            intersectionId: j.id,
            signalId: (j.signalized || j.signals) ? `signal:${j.id}` : undefined,
            position: { x: pStart.x, y: pStart.y, z: pStart.z },
            normal: { x: -Math.sin(pStart.heading), y: 0, z: -Math.cos(pStart.heading) },
            width: fromLane.width,
          };

          const virtualEdge: LaneEdge = {
            id: vId,
            roadId: j.id,
            isVirtual: true,
            index: i,
            direction: 'forward',
            width: fromLane.width,
            speedLimitMps: Math.min(fromLane.speedLimitMps, 30 / 3.6),
            speedLimitKmh: Math.min(fromLane.speedLimitKmh, 30),
            centerline: curvePoints,
            length: sAcc,
            leftBoundary: { type: 'virtual', points: [] },
            rightBoundary: { type: 'virtual', points: [] },
            laneChangeLeft: false,
            laneChangeRight: false,
            predecessors: [fromLane.id],
            successors: [toLane.id],
            allowedManeuvers: [movement],
            turnDirection: movement,
            stopLine,
            trafficSignalId: (j.signalized || j.signals) ? `signal:${j.id}` : undefined,
            elevationProfile: {
              minY: Math.min(pStart.y, pEnd.y),
              maxY: Math.max(pStart.y, pEnd.y),
              averageGrade: (pEnd.y - pStart.y) / Math.max(1, sAcc),
            },
            curvatureProfile: {
              maxCurvature: Math.max(...curvePoints.map(p => Math.abs(p.curvature))),
              meanCurvature: curvePoints.reduce((a, b) => a + Math.abs(b.curvature), 0) / curvePoints.length,
            },
            layerIndex: fromLane.layerIndex,
          };

          // Link predecessor and successor
          if (!fromLane.successors.includes(vId)) fromLane.successors.push(vId);
          if (!toLane.predecessors.includes(vId)) toLane.predecessors.push(vId);

          virtualLanes.push(virtualEdge);
        }
      }
    }

    return virtualLanes;
  }

  /**
   * Identifies intersections between virtual lanes inside junctions.
   */
  private static resolveJunctionConflicts(
    lanes: Map<string, LaneEdge>,
    intersections: CityIntersection[]
  ): void {
    for (const j of intersections) {
      const vLanes = Array.from(lanes.values()).filter(l => l.isVirtual && l.roadId === j.id);

      for (let i = 0; i < vLanes.length; i++) {
        const laneA = vLanes[i]!;
        for (let k = i + 1; k < vLanes.length; k++) {
          const laneB = vLanes[k]!;

          // Check if paths cross each other
          for (const ptA of laneA.centerline) {
            for (const ptB of laneB.centerline) {
              const dist = Math.hypot(ptA.x - ptB.x, ptA.z - ptB.z);
              if (dist < 2.8) {
                // Conflict point found
                const conflictBox = {
                  minX: Math.min(ptA.x, ptB.x) - 2.0,
                  maxX: Math.max(ptA.x, ptB.x) + 2.0,
                  minZ: Math.min(ptA.z, ptB.z) - 2.0,
                  maxZ: Math.max(ptA.z, ptB.z) + 2.0,
                  minY: Math.min(ptA.y, ptB.y) - 1.0,
                  maxY: Math.max(ptA.y, ptB.y) + 1.0,
                };

                const conflict: LaneConflictArea = {
                  intersectionId: j.id,
                  conflictingLaneIds: [laneA.id, laneB.id],
                  bounds: conflictBox,
                };

                laneA.conflictAreas ??= [];
                laneB.conflictAreas ??= [];
                laneA.conflictAreas.push(conflict);
                laneB.conflictAreas.push(conflict);
                break;
              }
            }
          }
        }
      }
    }
  }
}

function turnMovement(
  from: readonly CityPoint[],
  fromEnd: 'start' | 'end',
  to: readonly CityPoint[],
  toEnd: 'start' | 'end'
): LaneManeuver {
  const a = fromEnd === 'end' ? from.at(-2)! : from[1]!;
  const b = fromEnd === 'end' ? from.at(-1)! : from[0]!;
  const c = toEnd === 'start' ? to[0]! : to.at(-1)!;
  const d = toEnd === 'start' ? to[1]! : to.at(-2)!;
  const angle = Math.atan2((b.x - a.x) * (d.z - c.z) - (b.z - a.z) * (d.x - c.x), (b.x - a.x) * (d.x - c.x) + (b.z - a.z) * (d.z - c.z));
  return Math.abs(angle) < Math.PI / 5 ? 'straight' : angle > 0 ? 'right' : 'left';
}
