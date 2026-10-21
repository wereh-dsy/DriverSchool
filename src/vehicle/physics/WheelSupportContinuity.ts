import type { RoadSurfaceSample, SurfaceReference, SurfaceSupportHint } from '../../world/SurfaceMaterial';
import type { SuspensionVerticalSnapshot } from './SuspensionSystem';
import { WHEEL_IDS, type WheelContactSet, type WheelId, type WheelSurfaceQuery } from './WheelContact';

const makeState = () => ({ reference: undefined as SurfaceReference | undefined,
  previous: undefined as SurfaceReference | undefined, height: 0, previousHeight: 0,
  x: 0, z: 0, mountY: 0, nx: 0, ny: 1, nz: 0, initialized: false, valid: false,
  acceptedTick: -1, switchTick: -100, transient: undefined as string | undefined, transientUntil: -1,
  tolerance: .1 });

export type SupportRejectionReason = 'invalid-normal' | 'invalid-suspension-projection' | 'non-finite-surface' |
  'normal-discontinuity' | 'unreachable-layer-switch' | 'transient-layer-return' | 'unreachable-heightfield-discontinuity';

/** Four reusable wheel anchors. Never extrapolate an old footprint: the map
 * revalidates it, and rejected new layers explicitly lose contact before forces. */
export class WheelSupportContinuity {
  private readonly states = { frontLeft: makeState(), frontRight: makeState(),
    rearLeft: makeState(), rearRight: makeState() };
  private readonly hint: SurfaceSupportHint = { height: 0, normal: { x: 0, y: 1, z: 0 },
    heightTolerance: .1, withinTick: false, previousReachable: false };
  private geometry?: SuspensionVerticalSnapshot;
  private radius = 0;
  private tick = 0;
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
      s.reference = c.reference; s.height = c.height; s.x = c.x; s.z = c.z;
      s.nx = c.normal.x; s.ny = c.normal.y; s.nz = c.normal.z;
      s.initialized = true; s.valid = c.supportValid !== false;
    }
  }
  public beginStep(): void { this.tick++; }
  public prepare(geometry: SuspensionVerticalSnapshot, radius: number): void {
    this.geometry = geometry; this.radius = radius;
  }
  public valid(id: WheelId): boolean { return this.states[id].valid; }
  public heightTolerance(id: WheelId): number { return this.states[id].tolerance; }
  public rejectionReason(id: WheelId): SupportRejectionReason | undefined { return this.reasons[id]; }

  public sample(ground: WheelSurfaceQuery, id: WheelId, x: number, z: number): RoadSurfaceSample {
    const s = this.states[id], g = this.geometry!.wheels[id], h = this.hint;
    const dx = x - s.x, dz = z - s.z, travel = g.maxSuspensionLength - g.minSuspensionLength;
    // The old local plane accounts for horizontal travel on a real grade.
    const expected = s.height - (s.nx * dx + s.nz * dz) / Math.max(.1, s.ny);
    const mountMotion = s.acceptedTick >= 0 ? Math.abs(g.attachmentWorldPosition.y - s.mountY) : 0;
    const tolerance = Math.max(.025, travel * .75) + mountMotion +
      Math.hypot(dx, dz) * Math.min(.25, Math.hypot(s.nx, s.nz) / Math.max(.1, s.ny));
    s.tolerance = tolerance;
    const a = g.attachmentWorldPosition, axis = g.suspensionAxis;
    const oldProjection = -(axis.x * s.nx + axis.y * s.ny + axis.z * s.nz);
    const oldRequired = oldProjection > .1 ? ((a.x - x) * s.nx + (a.y - expected) * s.ny +
      (a.z - z) * s.nz - this.radius) / oldProjection : Infinity;
    h.previousReachable = oldRequired >= g.minSuspensionLength - tolerance &&
      oldRequired <= g.maxSuspensionLength + tolerance;
    h.reference = s.initialized ? s.reference : undefined;
    h.height = h.previousReachable ? expected : g.wheelCenterWorld.y - this.radius;
    h.heightTolerance = tolerance;
    h.normal.x = s.nx; h.normal.y = s.ny; h.normal.z = s.nz;
    h.withinTick = s.acceptedTick === this.tick;
    h.transientSurface = this.tick <= s.transientUntil ? s.transient : undefined;
    const candidate = ground.sampleRoadSurfaceForSupport?.(x, z, h) ?? ground.sampleRoadSurface(x, z);
    const n = candidate.normal;
    const projection = -(axis.x * n.x + axis.y * n.y + axis.z * n.z);
    const required = projection > .1 ? ((a.x - x) * n.x + (a.y - candidate.height) * n.y +
      (a.z - z) * n.z - this.radius) / projection : -Infinity;
    const changed = candidate.reference?.surfaceId !== s.reference?.surfaceId;
    const jump = candidate.height - expected;
    const dot = n.x * s.nx + n.y * s.ny + n.z * s.nz;
    const returned = changed && candidate.reference?.surfaceId === s.previous?.surfaceId &&
      this.tick - s.switchTick <= 3 && Math.abs(candidate.height - s.previousHeight) < tolerance;
    // Ordinary landing on a trusted continuous plane keeps the real limit solver.
    // A new plane far above full bump cannot create a mechanical collision.
    // A single-valued heightfield has no competing road layers. Its changing
    // terrain normal and real bump/landing must reach the physical force path.
    const layered = ground.sampleRoadSurfaceForSupport !== undefined || candidate.reference?.roadId !== undefined;
    const fieldResidual = candidate.height - s.height + .5 * ((s.nx * dx + s.nz * dz) / Math.max(.1, s.ny) +
      (n.x * dx + n.z * dz) / Math.max(.1, n.y));
    const reason: SupportRejectionReason | undefined = !Number.isFinite(n.x + n.y + n.z) || n.y < .1 ? 'invalid-normal'
      : !Number.isFinite(projection) || projection <= .1 ? 'invalid-suspension-projection'
      : !Number.isFinite(required) ? 'non-finite-surface'
      : !layered ? s.initialized && fieldResidual > Math.max(tolerance * 3, travel * 2) &&
        required < g.minSuspensionLength - travel ? 'unreachable-heightfield-discontinuity' : undefined
      : s.initialized && dot < .6 ? 'normal-discontinuity'
      : s.initialized && returned && Math.abs(jump) > tolerance ? 'transient-layer-return'
      : s.initialized && jump > tolerance && required < g.minSuspensionLength - tolerance ||
        !s.initialized && required < g.minSuspensionLength - travel ? 'unreachable-layer-switch' : undefined;
    this.reasons[id] = reason;
    s.valid = reason === undefined;
    if (reason) {
      s.transient = candidate.reference?.surfaceId; s.transientUntil = this.tick + 3;
      this.rejectedSamples++;
      return candidate;
    }
    if (changed) {
      s.previous = s.reference; s.previousHeight = s.height; s.switchTick = this.tick;
    }
    s.reference = candidate.reference; s.height = candidate.height; s.x = x; s.z = z;
    s.nx = n.x; s.ny = n.y; s.nz = n.z; s.mountY = a.y;
    s.initialized = true; s.acceptedTick = this.tick;
    return candidate;
  }
}
