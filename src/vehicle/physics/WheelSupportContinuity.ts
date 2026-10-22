import type { RoadSurfaceSample, SurfaceReference, SurfaceSupportHint, SupportLayerClass, SupportCandidateDecision } from '../../world/SurfaceMaterial';
import type { SuspensionVerticalSnapshot } from './SuspensionSystem';
import { WHEEL_IDS, type WheelContactSet, type WheelId, type WheelSurfaceQuery } from './WheelContact';

export type SupportRejectionReason = 'invalid-normal' | 'invalid-suspension-projection' | 'non-finite-surface' |
  'normal-discontinuity' | 'unreachable-layer-switch' | 'transient-layer-return' | 'unreachable-heightfield-discontinuity' |
  'impossible-height-discontinuity' | 'outside-suspension-reach' | 'layer-switch-unconfirmed' | 'road-support-lost';
export interface SupportSelectionDiagnostics {
  predictedSurfaceHeight: number;
  candidateLayerClass: SupportLayerClass;
  previousLayerClass: SupportLayerClass;
  supportSelectionReason: string;
  rejectedThisOuterTick: boolean;
  layerSwitchConfirmationState: string;
}
const makeState = () => ({ reference: undefined as SurfaceReference | undefined,
  anchorReference: undefined as SurfaceReference | undefined, anchorSupportLost: false, anchorRoadLost: false,
  previous: undefined as SurfaceReference | undefined, height: 0,
  x: 0, z: 0, nx: 0, ny: 1, nz: 0, initialized: false, valid: false,
  acceptedTick: -1, switchTick: -100,
  tolerance: .1, xQuery: 0, zQuery: 0, anchorHeight: 0, anchorX: 0, anchorZ: 0, anchorNx: 0, anchorNy: 1, anchorNz: 0,
  anchorBottom: NaN, anchorMount: NaN, roadLost: false, supportLost: false,
  predictedSurfaceHeight: 0, candidateLayerClass: 'SAME_LAYER' as SupportLayerClass,
  previousLayerClass: 'SAME_LAYER' as SupportLayerClass, supportSelectionReason: 'seed', rejectedThisOuterTick: false,
  acceptedLayerClass: 'SAME_LAYER' as SupportLayerClass,
  layerSwitchConfirmationState: 'not-required', confirmations: 0,
  latchCount: 0, latchIds: new Array<string | undefined>(16),
  latchReasons: new Array<SupportRejectionReason | undefined>(16),
  confirmationIds: new Array<string | undefined>(16), confirmationTicks: new Int32Array(16).fill(-10),
  confirmationCounts: new Uint8Array(16), anchorFootprintPresent: false,
  anchorFootprintHeight: 0, anchorFootprintNx: 0, anchorFootprintNy: 1, anchorFootprintNz: 0 });

/** Four outer-tick anchors; candidate qualification runs inside the map's one
 * footprint query. No candidate list allocation or topology search per sample. */
export class WheelSupportContinuity {
  private readonly states = { frontLeft: makeState(), frontRight: makeState(), rearLeft: makeState(), rearRight: makeState() };
  private readonly decision: SupportCandidateDecision = { eligible: true, layerClass: 'SAME_LAYER',
    predictedError: 0, continuityRank: 0, topologyRank: 0, normalDot: 1 };
  private readonly hint: SurfaceSupportHint = { height: 0, normal: { x: 0, y: 1, z: 0 },
    heightTolerance: .1, withinTick: false, previousReachable: false,
    evaluateCandidate: (y, nx, ny, nz, ref) => {
      // The ground only calls this for footprints containing the current query.
      const s = this.states[this.current], d = this.evaluate(y, nx, ny, nz, ref, false);
      if (ref?.surfaceId === s.anchorReference?.surfaceId && d.eligible && d.layerClass === 'SAME_LAYER') {
        s.anchorFootprintPresent = true; s.anchorFootprintHeight = y;
        s.anchorFootprintNx = nx; s.anchorFootprintNy = ny; s.anchorFootprintNz = nz;
      }
      return d;
    } };
  private geometry?: SuspensionVerticalSnapshot;
  private radius = 0;
  private tick = 0;
  private current: WheelId = 'frontLeft';
  private layered = false;
  private selectedCandidate = true;
  private sameLayerContinuation = false;
  private dt = 1 / 120;
  private verticalVelocity = 0;
  public rejectedSamples = 0;
  private readonly reasons: Partial<Record<WheelId, SupportRejectionReason>> = {};

  public reset(): void {
    for (const id of WHEEL_IDS) Object.assign(this.states[id], makeState());
    this.geometry = undefined; this.tick = 0; this.rejectedSamples = 0;
    for (const id of WHEEL_IDS) this.reasons[id] = undefined;
  }
  public seed(contacts: WheelContactSet): void {
    for (const id of WHEEL_IDS) {
      const c = contacts[id], s = this.states[id];
      s.reference = s.anchorReference = c.reference; s.height = s.anchorHeight = c.height; s.x = s.anchorX = c.x; s.z = s.anchorZ = c.z;
      s.nx = s.anchorNx = c.normal.x; s.ny = s.anchorNy = c.normal.y; s.nz = s.anchorNz = c.normal.z;
      s.initialized = true; s.valid = c.supportValid !== false;
    }
  }
  public beginStep(dt = 1 / 120, verticalVelocity = 0): void {
    this.tick++; this.dt = dt; this.verticalVelocity = verticalVelocity;
    for (const id of WHEEL_IDS) {
      const s = this.states[id], g = this.geometry?.wheels[id];
      s.anchorReference = s.reference; s.anchorSupportLost = s.supportLost; s.anchorRoadLost = s.roadLost;
      s.anchorHeight = s.height; s.anchorX = s.x; s.anchorZ = s.z;
      s.anchorNx = s.nx; s.anchorNy = s.ny; s.anchorNz = s.nz;
      s.anchorBottom = g ? g.wheelCenterWorld.y - (g.effectiveRadius ?? this.radius) : NaN;
      s.anchorMount = g?.attachmentWorldPosition.y ?? NaN;
      s.previousLayerClass = s.acceptedLayerClass;
      s.latchCount = 0; s.rejectedThisOuterTick = false;
    }
  }
  public prepare(geometry: SuspensionVerticalSnapshot, radius: number): void { this.geometry = geometry; this.radius = radius; }
  public valid(id: WheelId): boolean { return this.states[id].valid; }
  public heightTolerance(id: WheelId): number { return this.states[id].tolerance; }
  public rejectionReason(id: WheelId): SupportRejectionReason | undefined { return this.reasons[id]; }
  public diagnostics(id: WheelId): Readonly<SupportSelectionDiagnostics> { return this.states[id]; }

  private reject(reason: SupportRejectionReason, surface: string | undefined): SupportCandidateDecision {
    const s = this.states[this.current], d = this.decision;
    d.eligible = false; d.reason = reason;
    // Ranking a rejected alternative must not poison the selected wheel support.
    // Only the final selected/rejected sample commits a same-tick latch.
    if (!this.selectedCandidate) return d;
    if (reason !== 'layer-switch-unconfirmed') for (let i = 0; i < 16; i++) {
      if (s.confirmationIds[i] === surface) s.confirmationCounts[i] = 0;
    }
    if (reason === 'unreachable-layer-switch' || reason === 'transient-layer-return' ||
      reason === 'invalid-suspension-projection' || reason === 'impossible-height-discontinuity' ||
      reason === 'unreachable-heightfield-discontinuity') {
      s.rejectedThisOuterTick = true;
      let found = false;
      for (let i = 0; i < s.latchCount; i++) if (s.latchIds[i] === surface) found = true;
      if (!found && s.latchCount < 16) { s.latchIds[s.latchCount] = surface; s.latchReasons[s.latchCount++] = reason; }
    }
    return d;
  }

  private evaluate(height: number, nx: number, ny: number, nz: number, ref: SurfaceReference | undefined, selected = true): SupportCandidateDecision {
    this.selectedCandidate = selected; this.sameLayerContinuation = false;
    const s = this.states[this.current], g = this.geometry!.wheels[this.current], d = this.decision;
    const axis = g.suspensionAxis, a = g.attachmentWorldPosition, travel = g.maxSuspensionLength - g.minSuspensionLength;
    const projection = -(axis.x * nx + axis.y * ny + axis.z * nz);
    const changed = ref?.surfaceId !== s.anchorReference?.surfaceId;
    const terrain = ref?.kind === 'terrain' || ref?.surfaceId === 'terrain';
    const sameRoad = ref?.roadId !== undefined && ref.roadId === s.anchorReference?.roadId;
    const adjacent = sameRoad && (ref?.segmentIndex === undefined || s.anchorReference?.segmentIndex === undefined ||
      Math.abs(ref.segmentIndex - s.anchorReference.segmentIndex) <= 2);
    const linked = !!(ref?.roadId && s.anchorReference?.connectedRoadIds?.has(ref.roadId) ||
      s.anchorReference?.roadId && ref?.connectedRoadIds?.has(s.anchorReference.roadId));
    const error = Math.abs(height - s.predictedSurfaceHeight);
    if (selected) s.rejectedThisOuterTick = false;
    const dot = nx * s.anchorNx + ny * s.anchorNy + nz * s.anchorNz;
    const sameEnvelope = Math.max(.025, Math.min(.055, travel * .28));
    d.predictedError = error; d.normalDot = dot; d.reason = undefined; d.eligible = true;
    d.continuityRank = changed ? 1 : 0; d.topologyRank = adjacent || linked ? 0 : 1;
    d.layerClass = !this.layered || !changed || error <= sameEnvelope && dot > .95
      ? 'SAME_LAYER' : error > Math.max(.09, travel * .6) ? 'GRADE_SEPARATED' : 'POSSIBLE_LAYER_SWITCH';
    const currentStructure = ref?.structureKind, oldStructure = s.anchorReference?.structureKind;
    if (changed && !adjacent && !linked && currentStructure && oldStructure && currentStructure !== oldStructure &&
      currentStructure !== 'custom' && oldStructure !== 'custom' && currentStructure !== 'cutting' && oldStructure !== 'cutting')
      d.layerClass = 'GRADE_SEPARATED';
    if (changed && s.anchorSupportLost && !this.hint.previousReachable && !terrain &&
      Math.abs(height - s.anchorHeight) > travel && error <= sameEnvelope) d.layerClass = 'POSSIBLE_LAYER_SWITCH';
    if (!Number.isFinite(height + nx + ny + nz)) return this.reject('non-finite-surface', ref?.surfaceId);
    if (ny < .1) return this.reject('invalid-normal', ref?.surfaceId);
    if (projection < .25 || -axis.y < .25) return this.reject('invalid-suspension-projection', ref?.surfaceId);
    const required = ((a.x - this.states[this.current].xQuery) * nx + (a.y - height) * ny +
      (a.z - this.states[this.current].zQuery) * nz - (g.effectiveRadius ?? this.radius)) / projection;
    if (!this.layered) {
      const dx = s.xQuery - s.anchorX, dz = s.zQuery - s.anchorZ;
      const residual = height - s.anchorHeight + .5 * ((s.anchorNx * dx + s.anchorNz * dz) / Math.max(.1, s.anchorNy) +
        (nx * dx + nz * dz) / Math.max(.1, ny));
      if (residual > Math.max(s.tolerance * 3, travel * 2) && required < g.minSuspensionLength - travel)
        return this.reject('unreachable-heightfield-discontinuity', ref?.surfaceId);
    }
    if (required > g.maxSuspensionLength + .03) return this.reject(terrain && s.anchorReference?.roadId ? 'road-support-lost' : 'outside-suspension-reach', ref?.surfaceId);
    if (required < g.minSuspensionLength - (changed ? .03 : Math.max(.06, travel * .7)))
      return this.reject('unreachable-layer-switch', ref?.surfaceId);
    for (let i = 0; i < s.latchCount; i++) if (s.latchIds[i] === ref?.surfaceId) {
      if (selected) s.rejectedThisOuterTick = true;
      d.eligible = false; d.reason = s.latchReasons[i]; return d;
    }
    // Both the old and adjacent candidate footprints contain this wheel query.
    // Require continuous planes/normals and the existing suspension reach gate;
    // a road ID alone never establishes continuity (foldbacks/gaps/steps fail).
    const segment = ref?.segmentIndex, anchorSegment = s.anchorReference?.segmentIndex;
    if (changed && sameRoad && ref?.kind === 'road' && s.anchorReference?.kind === 'road' &&
      segment !== undefined && anchorSegment !== undefined && Math.abs(segment - anchorSegment) === 1 &&
      s.anchorFootprintPresent && dot > .95 && error <= sameEnvelope &&
      Math.abs(height - s.anchorFootprintHeight) <= sameEnvelope &&
      nx * s.anchorFootprintNx + ny * s.anchorFootprintNy + nz * s.anchorFootprintNz > .95 &&
      Math.abs(height - s.anchorHeight + (s.anchorNx * (s.xQuery - s.anchorX) +
        s.anchorNz * (s.zQuery - s.anchorZ)) / Math.max(.1, s.anchorNy)) <= sameEnvelope &&
      required >= g.minSuspensionLength - .03) {
      d.layerClass = 'SAME_LAYER'; this.sameLayerContinuation = true; return d;
    }
    if (s.latchCount >= 16 && changed) return this.reject('unreachable-layer-switch', ref?.surfaceId);
    if (!this.layered) return d;
    if (terrain && (s.anchorRoadLost || s.roadLost)) { d.layerClass = 'SAME_LAYER'; return d; }
    if (s.initialized && dot < .6) return this.reject('normal-discontinuity', ref?.surfaceId);
    if (changed && ref?.surfaceId === s.previous?.surfaceId && this.tick - s.switchTick <= 3 && error > sameEnvelope)
      return this.reject('transient-layer-return', ref?.surfaceId);
    if (d.layerClass === 'GRADE_SEPARATED') return this.reject('impossible-height-discontinuity', ref?.surfaceId);
    if (this.layered && !changed && error > Math.max(.10, travel * .65))
      return this.reject('impossible-height-discontinuity', ref?.surfaceId);
    if (d.layerClass === 'POSSIBLE_LAYER_SWITCH') {
      let slot = -1, oldest = 0;
      for (let i = 0; i < 16; i++) {
        if (s.confirmationIds[i] === ref?.surfaceId) { slot = i; break; }
        if (s.confirmationTicks[i]! < s.confirmationTicks[oldest]!) oldest = i;
      }
      if (slot < 0) {
        if (s.confirmationTicks[oldest]! >= this.tick - 1) return this.reject('layer-switch-unconfirmed', ref?.surfaceId);
        slot = oldest; s.confirmationIds[slot] = ref?.surfaceId; s.confirmationCounts[slot] = 0;
      }
      if (s.confirmationTicks[slot] !== this.tick) {
        s.confirmationCounts[slot] = s.confirmationTicks[slot] === this.tick - 1 ? Math.min(2, s.confirmationCounts[slot]! + 1) : 1;
        s.confirmationTicks[slot] = this.tick;
      }
      s.confirmations = s.confirmationCounts[slot]!;
      if (s.confirmations < 2) return this.reject('layer-switch-unconfirmed', ref?.surfaceId);
    }
    return d;
  }

  public sample(ground: WheelSurfaceQuery, id: WheelId, x: number, z: number): RoadSurfaceSample {
    this.current = id;
    const s = this.states[id], g = this.geometry!.wheels[id], h = this.hint;
    s.xQuery = x; s.zQuery = z;
    this.layered = ground.sampleRoadSurfaceForSupport !== undefined || s.reference?.roadId !== undefined;
    const dx = x - s.anchorX, dz = z - s.anchorZ, travel = g.maxSuspensionLength - g.minSuspensionLength;
    const expected = s.anchorHeight - (s.anchorNx * dx + s.anchorNz * dz) / Math.max(.1, s.anchorNy);
    const bottom = g.wheelCenterWorld.y - (g.effectiveRadius ?? this.radius);
    if (!Number.isFinite(s.anchorBottom)) { s.anchorBottom = bottom; s.anchorMount = g.attachmentWorldPosition.y; }
    const motion = bottom - s.anchorBottom;
    const velocityPrediction = (this.verticalVelocity + g.suspensionAxis.y * g.unsprungVelocity) * this.dt;
    // Plane advection supplies grade; attachment + hub motion supplies a small,
    // bounded correction. Body heave alone never ratchets the road anchor.
    s.predictedSurfaceHeight = expected + Math.max(-.015, Math.min(.015,
      .15 * (motion - (expected - s.anchorHeight) + (Number.isFinite(velocityPrediction) ? velocityPrediction : 0))));
    s.tolerance = Math.max(.025, travel * .75) + Math.min(.02, Math.abs(g.attachmentWorldPosition.y - s.anchorMount));
    const p = -(g.suspensionAxis.x * s.anchorNx + g.suspensionAxis.y * s.anchorNy + g.suspensionAxis.z * s.anchorNz);
    const oldRequired = p > .25 ? ((g.attachmentWorldPosition.x - x) * s.anchorNx +
      (g.attachmentWorldPosition.y - expected) * s.anchorNy + (g.attachmentWorldPosition.z - z) * s.anchorNz - (g.effectiveRadius ?? this.radius)) / p : Infinity;
    h.previousReachable = oldRequired >= g.minSuspensionLength - .03 && oldRequired <= g.maxSuspensionLength + .03;
    if (!h.previousReachable && (s.anchorSupportLost || s.supportLost)) s.predictedSurfaceHeight = bottom;
    h.reference = s.anchorReference; h.height = s.predictedSurfaceHeight; h.heightTolerance = s.tolerance;
    h.normal.x = s.anchorNx; h.normal.y = s.anchorNy; h.normal.z = s.anchorNz;
    h.withinTick = s.acceptedTick === this.tick;
    s.anchorFootprintPresent = false;
    const candidate = ground.sampleRoadSurfaceForSupport?.(x, z, h) ?? ground.sampleRoadSurface(x, z);
    const d = this.evaluate(candidate.height, candidate.normal.x, candidate.normal.y, candidate.normal.z, candidate.reference);
    s.candidateLayerClass = d.layerClass; s.valid = d.eligible; this.reasons[id] = d.reason as SupportRejectionReason | undefined;
    s.layerSwitchConfirmationState = d.layerClass === 'POSSIBLE_LAYER_SWITCH' ? (s.confirmations >= 2 ? 'confirmed-2-ticks' : 'pending-1-tick') : 'not-required';
    if (!d.eligible) {
      s.supportLost = true;
      s.supportSelectionReason = s.rejectedThisOuterTick ? 'same-tick-rejection-latch' : d.reason!;
      if (d.reason === 'road-support-lost') s.roadLost = true;
      this.rejectedSamples++; return candidate;
    }
    const changed = candidate.reference?.surfaceId !== s.reference?.surfaceId;
    s.supportSelectionReason = s.roadLost && candidate.reference?.surfaceId === 'terrain' ? 'terrain-support-acquired'
      : this.sameLayerContinuation ? 'SAME_LAYER_CONTINUATION'
      : changed ? d.layerClass === 'POSSIBLE_LAYER_SWITCH' ? 'confirmed-layer-switch' : 'same-layer-continuity' : 'same-surface';
    s.roadLost = false;
    s.supportLost = false;
    s.acceptedLayerClass = d.layerClass;
    if (changed) { s.previous = s.reference; s.switchTick = this.tick; }
    s.reference = candidate.reference; s.height = candidate.height; s.x = x; s.z = z;
    s.nx = candidate.normal.x; s.ny = candidate.normal.y; s.nz = candidate.normal.z;
    s.initialized = true; s.acceptedTick = this.tick;
    return candidate;
  }
}
