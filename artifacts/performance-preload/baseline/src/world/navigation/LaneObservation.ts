import type { LogicalLaneData, RoadNetworkData, RoadSegmentData } from './RoadNetwork';

export type LaneBoundaryType = 'solid' | 'dashed' | 'unavailable';
export interface LaneObservation {
  valid: boolean; laneId?: string; laneWidth: number;
  /** Positive = vehicle right of the lane centre, in travel direction (metres). */
  lateralOffset: number;
  /** Positive = vehicle heading towards lane-right. Three.js yaw has the opposite sign. */
  headingError: number;
  /** Vehicle-centre clearance, metres; negative means centre crossed the line. */
  distanceToLeftBoundary: number; distanceToRightBoundary: number;
  leftBoundaryType: LaneBoundaryType; rightBoundaryType: LaneBoundaryType;
  /** Positive = road turns right, radians/metre. */
  curvature: number;
  /** Straight-ahead vehicle point minus future lane centre, projected on lane-right. */
  lookAheadLateralOffset: number; lookAheadHeadingError: number; lookAheadDistance: number;
  isIntersection: boolean; isMerge: boolean; isDiverge: boolean; ambiguous: boolean; confidence: number;
  centerX: number; centerZ: number; lookAheadX: number; lookAheadZ: number; targetYaw: number;
}
export const createLaneObservation = (): LaneObservation => ({ valid: false, laneWidth: 0,
  lateralOffset: 0, headingError: 0, distanceToLeftBoundary: 0, distanceToRightBoundary: 0,
  leftBoundaryType: 'unavailable', rightBoundaryType: 'unavailable', curvature: 0,
  lookAheadLateralOffset: 0, lookAheadHeadingError: 0, lookAheadDistance: 0,
  isIntersection: false, isMerge: false, isDiverge: false, ambiguous: false, confidence: 0,
  centerX: 0, centerZ: 0, lookAheadX: 0, lookAheadZ: 0, targetYaw: 0 });
export interface LanePose { x: number; z: number; yaw: number; y: number }
type LaneRef = { lane: LogicalLaneData; road: RoadSegmentData; next: LaneRef[]; previous: LaneRef[] };
type Sample = { x: number; z: number; y: number; yaw: number };
const sample = (): Sample => ({ x: 0, z: 0, y: 0, yaw: 0 });
export const wrapLaneAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** Extends the existing road query with logical-lane tracking. Nearby roads are supplied
 * by LocalRoadMap's existing spatial index. No meshes, markings, or invented lanes. */
export class LaneObservationTracker {
  public readonly observation = createLaneObservation();
  private readonly lanes = new Map<string, LaneRef>();
  private network?: RoadNetworkData;
  private current?: LaneRef;
  private readonly a = sample(); private readonly b = sample(); private readonly c = sample();
  private readonly future = sample();
  private along = 0; private offset = 0; private distance = Infinity; private height = 0;
  private candidateAlong = 0;
  public get trackedLane(): Readonly<LaneRef> | undefined { return this.current; }
  public configure(network: RoadNetworkData | undefined): void {
    if (network === this.network) return;
    this.network = network; this.lanes.clear(); this.reset();
    if (!network) return;
    for (const road of network.segments) for (const lane of road.lanes ?? []) {
      if (road.markingsAvailable === false || road.centerline.length < 2 ||
        !Number.isFinite(road.length) || road.length <= 0 ||
        !Number.isFinite(lane.width) || lane.width < 2.5 || lane.width > 4.8 ||
        Math.abs(road.width - (road.lanes?.length ?? 0) * lane.width) > .05) continue;
      this.lanes.set(lane.id, { road, lane, next: [], previous: [] });
    }
    for (const link of network.laneConnections ?? []) {
      const from = this.lanes.get(link.fromLaneId), to = this.lanes.get(link.toLaneId);
      if (from && to && !from.next.includes(to)) { from.next.push(to); to.previous.push(from); }
    }
  }
  public reset(): void { this.current = undefined; this.observation.valid = false; this.observation.laneId = undefined; this.observation.confidence = 0; }
  private point(road: RoadSegmentData, s: number, out: Sample): void {
    let remaining = Math.max(0, Math.min(road.length, s));
    for (let i = 1; i < road.centerline.length; i++) {
      const a = road.centerline[i - 1]!, b = road.centerline[i]!;
      const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
      if (length < .001) continue;
      if (remaining <= length || i === road.centerline.length - 1) {
        const t = Math.min(1, remaining / length);
        out.x = a.x + dx * t; out.z = a.z + dz * t;
        out.y = (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t;
        out.yaw = Math.atan2(-dx, -dz); return;
      }
      remaining -= length;
    }
    out.x = out.z = out.y = out.yaw = NaN;
  }
  private lanePoint(ref: LaneRef, s: number, out: Sample): void {
    this.point(ref.road, s, out);
    // A short secant smooths authored polyline corners without changing road geometry.
    this.point(ref.road, s - 3, this.b); this.point(ref.road, s + 3, this.c);
    if (Math.hypot(this.c.x - this.b.x, this.c.z - this.b.z) > .001)
      out.yaw = Math.atan2(this.b.x - this.c.x, this.b.z - this.c.z);
    const offset = -ref.road.width / 2 + (ref.lane.index + .5) * ref.lane.width;
    out.x += Math.cos(out.yaw) * offset; out.z -= Math.sin(out.yaw) * offset;
    if (ref.lane.direction === 'reverse') out.yaw = wrapLaneAngle(out.yaw + Math.PI);
  }
  private project(ref: LaneRef, pose: LanePose): void {
    let travelled = 0, best = Infinity, s = 0;
    const road = ref.road;
    for (let i = 1; i < road.centerline.length; i++) {
      const a = road.centerline[i - 1]!, b = road.centerline[i]!;
      const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
      if (length < .001) continue;
      const t = Math.max(0, Math.min(1, ((pose.x - a.x) * dx + (pose.z - a.z) * dz) / (length * length)));
      const squared = (pose.x - a.x - dx * t) ** 2 + (pose.z - a.z - dz * t) ** 2;
      if (squared < best) { best = squared; s = travelled + length * t; }
      travelled += length;
    }
    this.lanePoint(ref, s, this.a);
    this.along = s; this.height = this.a.y;
    this.offset = (pose.x - this.a.x) * Math.cos(this.a.yaw) - (pose.z - this.a.z) * Math.sin(this.a.yaw);
    this.distance = Math.hypot(pose.x - this.a.x, pose.z - this.a.z);
  }
  private continuation(ref: LaneRef): LaneRef | undefined {
    this.lanePoint(ref, ref.lane.direction === 'forward' ? ref.road.length : 0, this.future);
    const yaw = this.future.yaw, x = this.future.x, z = this.future.z;
    let best: LaneRef | undefined, score = Infinity, runner = Infinity;
    for (const next of ref.next) {
      this.lanePoint(next, next.lane.direction === 'forward' ? 0 : next.road.length, this.a);
      const gap = Math.hypot(this.a.x - x, this.a.z - z);
      const turn = Math.abs(wrapLaneAngle(this.a.yaw - yaw));
      if (gap > 8 || turn > .65 || Math.abs(this.a.y - this.future.y) > 1) continue;
      const value = turn + gap * .045;
      if (value < score) { if (best?.road !== next.road) runner = score; best = next; score = value; }
      else if (best?.road !== next.road) runner = Math.min(runner, value);
    }
    this.observation.ambiguous = runner - score < .10;
    return this.observation.ambiguous ? undefined : best;
  }
  public update(pose: LanePose, speed: number, nearby: RoadNetworkData | undefined, allowBranchChange = false): LaneObservation {
    const o = this.observation;
    o.valid = false; o.confidence = 0; o.ambiguous = false; o.isIntersection = false;
    o.isMerge = o.isDiverge = false;
    if (!nearby || !Number.isFinite(pose.x) || !Number.isFinite(pose.z) || !Number.isFinite(pose.yaw) || !Number.isFinite(pose.y) || !Number.isFinite(speed)) return o;
    let current = this.current;
    if (current) {
      this.project(current, pose);
      // Sticky lane ID: centre must be 20 cm across the boundary before an adjacent lane wins.
      if (Math.abs(this.offset) > current.lane.width / 2 + .20) {
        const direction = current.lane.direction === 'forward' ? 1 : -1;
        const index = current.lane.index + Math.sign(this.offset) * direction;
        const adjacent = current.road.lanes?.[index];
        if (adjacent?.direction === current.lane.direction) current = this.lanes.get(adjacent.id);
      }
      if (current) {
        this.project(current, pose);
        const left = current.lane.direction === 'forward' ? current.road.length - this.along : this.along;
        if (left < 1.5) {
          const next = this.continuation(current);
          if (next) { this.project(next, pose); if (this.distance < next.lane.width * .65) current = next; }
        }
        this.project(current, pose);
        if (this.distance > current.lane.width / 2 + 1.2 || Math.abs(pose.y - this.height) > 2 ||
          Math.abs(wrapLaneAngle(this.a.yaw - pose.yaw)) > .85) current = undefined;
      }
    }
    // Initial acquisition / explicit branch departure uses local indexed roads only.
    if (!current || allowBranchChange && Math.abs(this.offset) > current.lane.width / 2 + .2) {
      let best = Infinity, runner = Infinity, candidate: LaneRef | undefined;
      for (const road of nearby.segments) for (const lane of road.lanes ?? []) {
        const ref = this.lanes.get(lane.id); if (!ref) continue;
        if (current && ref.road !== current.road && !current.next.includes(ref) &&
          current.road.highwayTransition?.mainRoadId !== ref.road.id && ref.road.highwayTransition?.mainRoadId !== current.road.id) continue;
        this.project(ref, pose);
        const heading = Math.abs(wrapLaneAngle(this.a.yaw - pose.yaw));
        if (this.distance > lane.width / 2 + .15 || Math.abs(pose.y - this.height) > 1.5 || heading > .6) continue;
        const score = this.distance + heading * 2;
        if (score < best) {
          if (candidate && candidate.road !== ref.road) runner = best;
          best = score; candidate = ref; this.candidateAlong = this.along;
        } else if (candidate?.road !== ref.road) runner = Math.min(runner, score);
      }
      if (candidate) { current = candidate; this.along = this.candidateAlong; }
      if (runner - best < .35) o.ambiguous = true;
    }
    this.current = current; o.laneId = current?.lane.id;
    if (!current) return o;
    this.project(current, pose);
    const s = this.along, direction = current.lane.direction === 'forward' ? 1 : -1;
    const yaw = this.a.yaw;
    o.laneWidth = current.lane.width; o.lateralOffset = this.offset;
    o.headingError = wrapLaneAngle(yaw - pose.yaw);
    o.distanceToLeftBoundary = o.laneWidth / 2 + o.lateralOffset;
    o.distanceToRightBoundary = o.laneWidth / 2 - o.lateralOffset;
    o.centerX = this.a.x; o.centerZ = this.a.z;
    o.lookAheadDistance = Math.max(9, Math.min(55, Math.abs(speed) * 1.05));
    const remaining = direction === 1 ? current.road.length - s : s;
    o.isMerge = current.road.highwayTransition?.kind === 'acceleration';
    const travelled = direction === 1 ? s : current.road.length - s;
    if (travelled < o.lookAheadDistance) o.isMerge ||= current.previous.some(p => p.road !== current!.previous[0]?.road);
    o.isDiverge = current.road.highwayTransition?.kind === 'deceleration';
    if (remaining < o.lookAheadDistance) {
      const next = this.continuation(current);
      o.isDiverge ||= current.next.some(n => n.road !== current!.next[0]?.road);
      if (!next) { o.ambiguous = true; return o; }
      const nextS = next.lane.direction === 'forward' ? o.lookAheadDistance - remaining : next.road.length - (o.lookAheadDistance - remaining);
      if (nextS < 0 || nextS > next.road.length) { o.ambiguous = true; return o; }
      this.lanePoint(next, nextS, this.future);
    } else this.lanePoint(current, s + direction * o.lookAheadDistance, this.future);
    o.lookAheadX = this.future.x; o.lookAheadZ = this.future.z; o.targetYaw = this.future.yaw;
    o.lookAheadHeadingError = wrapLaneAngle(this.future.yaw - pose.yaw);
    const fx = pose.x - Math.sin(pose.yaw) * o.lookAheadDistance;
    const fz = pose.z - Math.cos(pose.yaw) * o.lookAheadDistance;
    o.lookAheadLateralOffset = (fx - this.future.x) * Math.cos(yaw) - (fz - this.future.z) * Math.sin(yaw);
    o.curvature = -wrapLaneAngle(this.future.yaw - yaw) / o.lookAheadDistance;
    const leftIndex = current.lane.index - direction, rightIndex = current.lane.index + direction;
    o.leftBoundaryType = current.road.lanes?.[leftIndex]?.direction === current.lane.direction ? 'dashed' : 'solid';
    o.rightBoundaryType = current.road.lanes?.[rightIndex]?.direction === current.lane.direction ? 'dashed' : 'solid';
    for (const junction of nearby.intersections) if (Math.abs(pose.x - junction.center.x) < junction.halfExtentX + 2 &&
      Math.abs(pose.z - junction.center.z) < junction.halfExtentZ + 2 && Math.abs(pose.y - (junction.center.y ?? 0)) < 2) o.isIntersection = true;
    o.valid = !o.isIntersection && !o.ambiguous && Math.abs(o.lateralOffset) <= o.laneWidth / 2 + .6 &&
      Number.isFinite(o.lookAheadLateralOffset) && Number.isFinite(o.curvature) && Math.abs(o.curvature) < .03;
    o.confidence = o.valid ? 1 : 0;
    return o;
  }
}
