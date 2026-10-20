import type { VehicleInputState } from '../../input/VehicleInputState';
import type { DrivingGround } from '../../world/DrivingGround';
import type { SurfaceCandidateDebug, SurfaceReference } from '../../world/SurfaceMaterial';
import type { ChassisDynamics } from '../physics/ChassisDynamics';
import type { CollisionResolution } from '../physics/CollisionSystem';
import type { SuspensionVerticalSnapshot } from '../physics/SuspensionSystem';
import type { VehicleRuntimeSnapshot, VehicleDynamics } from '../physics/VehicleDynamics';
import type { Powertrain } from '../powertrain/Powertrain';
import { WHEEL_IDS, type WheelContactSet } from '../physics/WheelContact';
import { BLACK_BOX_SETTINGS as S, FRAME_DOUBLE_FIELDS, FRAME_FLOAT_FIELDS, FRAME_INT_FIELDS,
  WHEEL_FLOAT_FIELDS, WHEEL_INT_FIELDS, type BlackBoxMetadata, type BlackBoxStatus, type BlackBoxEvent } from './BlackBoxSchema';
import { BlackBoxTriggerThresholds as T } from './BlackBoxTriggerThresholds';

type Detail = { queries: unknown[]; microsteps: unknown[] };

/** Read-only telemetry sink. No snapshots, strings, arrays or objects are created on an ordinary armed step.
 * The scene adapter passes snapshots it already owns. All JSON work is explicitly outside the fixed loop.
 */
export class VehiclePhysicsBlackBox {
  public status: BlackBoxStatus = 'OFF';
  private readonly doubles = new Float64Array(S.frameCapacity * FRAME_DOUBLE_FIELDS.length);
  private readonly floats = new Float32Array(S.frameCapacity * FRAME_FLOAT_FIELDS.length);
  private readonly ints = new Int32Array(S.frameCapacity * FRAME_INT_FIELDS.length);
  private readonly wheelFloats = new Float32Array(S.frameCapacity * 4 * WHEEL_FLOAT_FIELDS.length);
  private readonly wheelInts = new Int32Array(S.frameCapacity * 4 * WHEEL_INT_FIELDS.length);
  private readonly events: (BlackBoxEvent | undefined)[] = new Array(S.eventCapacity);
  private readonly dictionary = new Map<string, number>();
  private readonly strings: (string | null)[] = [null]; // 0 = unavailable, never a fabricated road ID
  private readonly refs: (SurfaceReference | undefined)[] = new Array(4);
  private readonly surfaces = new Int32Array(4);
  private readonly roads = new Int32Array(4);
  private readonly segments = new Int32Array(4);
  private readonly previousRoads = new Int32Array(4);
  private readonly previousSegments = new Int32Array(4);
  private readonly previousSurfaces = new Int32Array(4);
  private readonly switchSteps = new Float64Array(4);
  private readonly heights = new Float64Array(4);
  private readonly normals = new Float32Array(12);
  private readonly initialized = new Uint8Array(4);
  private readonly grounded = new Uint8Array(4);
  private readonly fullBump = new Uint8Array(4);
  private readonly largeImpulse = new Uint8Array(4);
  private cursor = 0;
  private count = 0;
  private step = 0;
  private time = 0;
  private eventCursor = 0;
  private eventCount = 0;
  private eventSequence = 0;
  private eventsThisStep = 0;
  private contactSample = 0;
  private droppedEvents = 0;
  private dictionaryOverflow = 0;
  private floatOffset = 0;
  private wheelOffset = 0;
  private lastVy = 0;
  private lastPitchRate = 0;
  private lastRollRate = 0;
  private lastSafety = 0;
  private havePreviousFrame = false;
  private manualPending = false;
  private pendingReason: string | undefined;
  private lastSurfaceSwitch: BlackBoxEvent | undefined;
  private triggerStep: number | undefined;
  private triggerTime = 0;
  private triggerReason = '';
  private triggerLocation: ReturnType<VehiclePhysicsBlackBox['location']> | undefined;
  private cooldownUntil = 0;
  private detail: Detail | undefined;
  private lastCaptureStep = 0;
  private interrupted: string | undefined;

  public constructor(public readonly metadata: Readonly<BlackBoxMetadata>) {}
  public get recording(): boolean { return this.status === 'ARMED' || this.status === 'SAVED' || this.highDetail; }
  public get highDetail(): boolean { return this.status === 'CAPTURING POST-EVENT'; }
  public get frameCount(): number { return this.count; }
  public get allocatedFrameBytes(): number {
    return this.doubles.byteLength + this.floats.byteLength + this.ints.byteLength + this.wheelFloats.byteLength + this.wheelInts.byteLength;
  }
  public arm(): void { if (this.status === 'OFF') this.status = 'ARMED'; }
  public disable(): void { this.status = 'OFF'; this.detail = undefined; this.manualPending = false; }
  public fail(): void { this.status = 'ERROR'; this.detail = undefined; }
  public freezeInterrupted(reason: string): void {
    if (!this.highDetail) return;
    this.interrupted = reason; this.status = 'FROZEN'; this.detail = undefined;
  }
  public requestManualTrigger(): void {
    if (!this.recording) return;
    this.manualPending = true; // Latched to the next actual frame; triggerStep always has a matching sample.
  }
  public beginStep(dt: number): void {
    if (!this.recording) return;
    this.step++; this.time += dt; this.eventsThisStep = 0; this.contactSample = 0; this.pendingReason = undefined;
    this.detail = this.highDetail ? { queries: [], microsteps: [] } : undefined;
  }
  public intern(value: string | undefined): number {
    if (value === undefined) return 0;
    const existing = this.dictionary.get(value);
    if (existing !== undefined) return existing;
    if (this.strings.length >= S.dictionaryCapacity) { this.dictionaryOverflow++; return 0; }
    const handle = this.strings.length;
    this.dictionary.set(value, handle); this.strings.push(value);
    return handle;
  }
  private event(type: string, detail: unknown): BlackBoxEvent | undefined {
    if (!this.recording) return undefined;
    if (this.eventsThisStep++ >= S.maxEventsPerStep) { this.droppedEvents++; return undefined; }
    const event = { step: this.step, time: this.time, sequence: ++this.eventSequence, type, detail };
    if (this.eventCount === S.eventCapacity) this.droppedEvents++;
    this.events[this.eventCursor] = event;
    this.eventCursor = (this.eventCursor + 1) % S.eventCapacity;
    this.eventCount = Math.min(S.eventCapacity, this.eventCount + 1);
    return event;
  }
  private anomaly(reason: string): void {
    if (!this.highDetail && this.step >= this.cooldownUntil) this.pendingReason ??= reason;
  }
  private candidates(ground: DrivingGround, contacts: WheelContactSet, index: number): unknown {
    const contact = contacts[WHEEL_IDS[index]!];
    if (!ground.debugSurfaceCandidates) return { available: false };
    const query = ground.debugSurfaceCandidates(contact.x, contact.z, contact.referenceHeight ?? contact.height);
    return this.encodeCandidates(query);
  }
  private encodeCandidates(query: SurfaceCandidateDebug) {
    const shortlist = query.candidates.slice(0, S.maxCandidatesPerQuery);
    const chosen = query.candidates.find(c => c.id === query.chosen);
    if (chosen && !shortlist.includes(chosen)) shortlist[shortlist.length - 1] = chosen;
    return { x: query.x, z: query.z, referenceHeight: query.referenceHeight, chosen: this.intern(query.chosen ?? undefined),
      shortlistLimit: S.maxCandidatesPerQuery, candidateCount: query.candidates.length,
      truncated: query.candidates.length > shortlist.length,
      candidates: shortlist.map(c => ({
        surface: this.intern(c.id), road: this.intern(c.roadId), segment: this.intern(c.segmentId), segmentIndex: c.segmentIndex ?? null,
        height: c.height, normal: { ...c.normal }, distance: c.distance, score: c.score,
        accepted: c.accepted, reason: c.reason ?? (c.accepted ? 'eligible' : 'rejected'),
      })) };
  }
  /** Called on the actual microstep queries as well as final contacts. No nearest-road lookup. */
  public observeContacts(contacts: WheelContactSet, ground: DrivingGround): void {
    if (!this.recording) return;
    try {
      this.contactSample++;
      for (let i = 0; i < 4; i++) {
        const contact = contacts[WHEEL_IDS[i]!], ref = contact.reference;
        if (contact.supportValid === false) {
          this.event('support-candidate-rejected', { wheel: i, contactSample: this.contactSample,
            surface: this.intern(ref?.surfaceId), road: this.intern(ref?.roadId), segment: this.intern(ref?.segmentId),
            heightDelta: contact.height - this.heights[i]!, heightThreshold: contact.supportHeightTolerance,
            supportValid: false, candidates: this.candidates(ground, contacts, i) });
          this.anomaly('support-candidate-rejected');
          // This candidate never became physical support. Retain the last real
          // support identity so rejection cannot manufacture an A-B-A event.
          continue;
        }
        const oldSurface = this.surfaces[i]!, oldRoad = this.roads[i]!, oldSegment = this.segments[i]!;
        if (this.refs[i] !== ref) {
          this.refs[i] = ref;
          this.surfaces[i] = this.intern(ref?.surfaceId);
          this.roads[i] = this.intern(ref?.roadId);
          this.segments[i] = this.intern(ref?.segmentId);
        }
        const changed = this.initialized[i] !== 0 && oldSurface !== this.surfaces[i];
        const heightDelta = contact.height - this.heights[i]!;
        const n = contact.normal, j = i * 3;
        const dot = n.x * this.normals[j]! + n.y * this.normals[j + 1]! + n.z * this.normals[j + 2]!;
        const heightThreshold = contact.supportHeightTolerance ?? T.surfaceHeightDelta;
        const jump = this.initialized[i] !== 0 && Math.abs(heightDelta) > heightThreshold;
        const normalJump = this.initialized[i] !== 0 && dot < T.normalDot;
        if (changed || jump || normalJump) {
          const returned = changed && this.surfaces[i] !== 0 && this.surfaces[i] === this.previousSurfaces[i] &&
            this.step - this.switchSteps[i]! <= T.supportReturnSteps;
          const type = changed ? 'support-surface-changed' : jump ? 'surface-height-jump' : 'surface-normal-jump';
          const event = this.event(type, { wheel: i, contactSample: this.contactSample, previousSurface: oldSurface, surface: this.surfaces[i],
            previousRoad: oldRoad, previousSegment: oldSegment, road: this.roads[i], segment: this.segments[i],
            heightDelta, heightThreshold, supportValid: true,
            normalDot: dot, heightJump: jump, normalJump, returnedToPreviousSurface: returned,
            candidates: this.candidates(ground, contacts, i) });
          if (changed) {
            this.lastSurfaceSwitch = event ?? this.lastSurfaceSwitch;
            this.previousSurfaces[i] = oldSurface; this.previousRoads[i] = oldRoad; this.previousSegments[i] = oldSegment;
            this.switchSteps[i] = this.step;
          }
          if (jump) this.anomaly('surface-height-jump');
          if (normalJump) this.anomaly('surface-normal-jump');
          if (returned && Math.abs(heightDelta) > T.supportReturnHeightDelta) this.anomaly('support-A-B-A');
        }
        this.heights[i] = contact.height;
        this.normals[j] = n.x; this.normals[j + 1] = n.y; this.normals[j + 2] = n.z;
        this.initialized[i] = 1;
        if (this.detail && this.detail.queries.length < S.maxDetailQueriesPerStep) {
          this.detail.queries.push({ wheel: i, contactSample: this.contactSample, query: this.candidates(ground, contacts, i) });
        }
      }
    } catch { this.fail(); }
  }

  /** Copies solver diagnostics before safety clamps; the observer never receives mutable ownership. */
  public readonly observeMicrostep: NonNullable<ChassisDynamics['diagnosticObserver']> = (motion, frame, constraints) => {
    if (!this.detail || !this.highDetail) return;
    try {
      this.detail.microsteps.push({ microstep: this.detail.microsteps.length + 1, microstepCount: motion.microsteps,
        phase: 'after-constraint-solve-before-safety-and-pose-integration', y: motion.y, verticalVelocity: motion.velocity,
        pitch: motion.pitch, roll: motion.roll, pitchRate: motion.pitchAngularVelocity, rollRate: motion.rollAngularVelocity,
        constraints: constraints.map(c => ({ ...c })),
        wheels: WHEEL_IDS.map(id => { const c = frame.wheels[id]; return { requiredLength: c.requiredLength,
          length: c.suspensionLength, penetration: c.penetration, grounded: c.grounded,
          spring: c.springForce, damper: c.damperForce, bumpStop: c.bumpStopForce, ARB: c.antiRollForce,
          normalLoad: c.normalLoad }; }) });
    } catch { this.fail(); }
  };

  public readonly observeRecovery = (kind: 'contact' | 'non-finite', dynamics: Readonly<VehicleDynamics<Powertrain>>, correction: number): void => {
    if (!this.recording) return;
    try {
      const m = dynamics.chassisMotion;
      this.event(kind === 'contact' ? 'contact-recovery' : 'non-finite-before-recovery', {
        correction, x: dynamics.x, y: m.y, z: dynamics.z, yaw: dynamics.yaw,
        signedSpeed: dynamics.speed, lateralVelocity: dynamics.lateralVelocity,
        verticalVelocity: m.velocity, pitch: m.pitch, roll: m.roll,
        pitchRate: m.pitchAngularVelocity, rollRate: m.rollAngularVelocity });
      if (kind === 'non-finite') this.anomaly('non-finite-recovery');
      else if (correction > T.contactRecoveryDistance) this.anomaly('contact-recovery');
    } catch { this.fail(); }
  };
  public readonly observeSafety: NonNullable<ChassisDynamics['safetyObserver']> = motion => {
    if (!this.recording) return;
    try {
      this.event('contact-safety-before-recovery', { y: motion.y, verticalVelocity: motion.velocity,
        pitch: motion.pitch, roll: motion.roll, pitchRate: motion.pitchAngularVelocity, rollRate: motion.rollAngularVelocity });
      this.anomaly('contact-safety-recovery');
    } catch { this.fail(); }
  };

  public collision(before: VehicleRuntimeSnapshot, after: VehicleRuntimeSnapshot, result: CollisionResolution): void {
    if (!this.recording || !result.collided) return;
    try {
      const sin = Math.sin(before.yaw), cos = Math.cos(before.yaw);
      const afterSin = Math.sin(after.yaw), afterCos = Math.cos(after.yaw);
      const bodyLateral = before.lateralVelocity - before.yawRate * (before.chassis.centerOfMassOffsetZ ?? 0);
      this.event('collision', { contacts: result.contacts.map(c => ({ collider: this.intern(c.colliderId),
        colliderType: this.intern(result.nearbyColliders.find(s => s.id === c.colliderId)?.type),
        point: { x: c.point.x, y: null, z: c.point.z }, normal: { x: c.normal.x, y: 0, z: c.normal.z },
        penetration: c.penetration, inwardSpeed: c.inwardSpeed })),
        velocityBefore: { x: -sin * before.speed + cos * before.lateralVelocity, y: before.chassis.verticalVelocity,
          z: -cos * before.speed - sin * before.lateralVelocity },
        velocityAfter: { x: -afterSin * after.speed + afterCos * after.lateralVelocity, y: after.chassis.verticalVelocity,
          z: -afterCos * after.speed - afterSin * after.lateralVelocity },
        bodyOriginVelocityBefore: { x: -sin * before.speed + cos * bodyLateral, z: -cos * before.speed - sin * bodyLateral },
        bodyOriginVelocityAfter: { ...result.velocity },
        signedSpeedBefore: before.speed, signedSpeedAfter: after.speed,
        yaw: before.yaw, pitch: before.chassis.pitch, roll: before.chassis.roll,
        gear: this.gear(before), selector: this.intern(before.transmission.selectedMode ?? undefined),
        planarForward: { x: -sin, z: -cos }, driveForce: this.driveForce(before),
        worldPosition: { x: before.x, y: before.chassis.chassisY, z: before.z } });
      if (Math.max(Math.abs(before.chassis.pitch), Math.abs(before.chassis.roll)) > T.severeCollisionAttitude &&
        result.contacts.some(c => c.inwardSpeed > T.severeCollisionSpeed)) this.anomaly('severe-collision-attitude');
    } catch { this.fail(); }
  }
  private gear(s: VehicleRuntimeSnapshot): number { return s.gear === 'R' ? -1 : typeof s.gear === 'number' ? s.gear : 0; }
  private driveForce(s: VehicleRuntimeSnapshot): number {
    return s.wheels.frontLeft.driveForce * Math.cos(s.wheels.frontLeft.steeringAngle) +
      s.wheels.frontRight.driveForce * Math.cos(s.wheels.frontRight.steeringAngle) +
      s.wheels.rearLeft.driveForce * Math.cos(s.wheels.rearLeft.steeringAngle) +
      s.wheels.rearRight.driveForce * Math.cos(s.wheels.rearRight.steeringAngle);
  }
  private f(value: number): void { this.floats[this.floatOffset] = value; this.floatOffset += S.frameCapacity; }
  private w(value: number): void { this.wheelFloats[this.wheelOffset] = value; this.wheelOffset += S.frameCapacity; }

  public capture(s: VehicleRuntimeSnapshot, input: VehicleInputState, contacts: WheelContactSet,
    vertical: SuspensionVerticalSnapshot, motion: Readonly<ChassisDynamics>, ground: DrivingGround): void {
    if (!this.recording) return;
    try { this.captureFrame(s, input, contacts, vertical, motion, ground); } catch { this.fail(); }
  }
  private captureFrame(s: VehicleRuntimeSnapshot, input: VehicleInputState, contacts: WheelContactSet,
    vertical: SuspensionVerticalSnapshot, motion: Readonly<ChassisDynamics>, ground: DrivingGround): void {
    this.observeContacts(contacts, ground);
    if (!this.recording) return;
    const c = s.chassis, cap = S.frameCapacity, slot = this.cursor;
    this.doubles[slot] = this.step; this.doubles[cap + slot] = this.time;
    this.doubles[2 * cap + slot] = s.x; this.doubles[3 * cap + slot] = c.chassisY; this.doubles[4 * cap + slot] = s.z;
    const sin = Math.sin(s.yaw), cos = Math.cos(s.yaw);
    this.floatOffset = slot;
    this.f(-sin * s.speed + cos * s.lateralVelocity); this.f(c.verticalVelocity);
    this.f(-cos * s.speed - sin * s.lateralVelocity); this.f(Math.hypot(s.speed, s.lateralVelocity));
    this.f(s.speed); this.f(c.chassisY); this.f(c.verticalVelocity); this.f(c.verticalAcceleration);
    this.f(s.yaw); this.f(c.pitch); this.f(c.roll); this.f(s.yawRate);
    this.f(c.pitchAngularVelocity ?? NaN); this.f(c.rollAngularVelocity ?? NaN);
    this.f(c.totalVerticalForce ?? NaN); this.f(c.pitchTorque ?? NaN); this.f(c.rollTorque ?? NaN);
    this.f(s.throttle); this.f(s.brake); this.f(input.steering); this.f(input.clutchPedal);
    this.f(s.rpm ?? NaN); this.f(-sin); this.f(-cos); this.f(this.driveForce(s));
    let mask = 0;
    for (let i = 0; i < 4; i++) {
      const id = WHEEL_IDS[i]!, wheel = s.wheels[id], corner = vertical.wheels[id], contact = contacts[id];
      if (corner.grounded) mask |= 1 << i;
      const impulse = motion.contactImpulses[i]!;
      this.wheelOffset = slot + i * WHEEL_FLOAT_FIELDS.length * cap;
      this.w(corner.wheelCenterWorld.x); this.w(corner.wheelCenterWorld.y); this.w(corner.wheelCenterWorld.z);
      this.w(corner.attachmentWorldPosition.x); this.w(corner.attachmentWorldPosition.y); this.w(corner.attachmentWorldPosition.z);
      this.w(corner.suspensionLength); this.w(corner.compression); this.w(corner.compressionVelocity);
      this.w(corner.requiredLength); this.w(corner.penetration); this.w(corner.surfaceHeight);
      this.w(corner.surfaceNormal.x); this.w(corner.surfaceNormal.y); this.w(corner.surfaceNormal.z);
      this.w(corner.springForce); this.w(corner.damperForce); this.w(corner.bumpStopForce); this.w(corner.antiRollForce);
      this.w(impulse); this.w(wheel.normalLoad); this.w(wheel.longitudinalForce); this.w(wheel.lateralForce);
      this.w(wheel.angularVelocity); this.w(wheel.slipRatio); this.w(wheel.slipAngle);
      const base = slot + i * WHEEL_INT_FIELDS.length * cap;
      this.wheelInts[base] = +corner.grounded; this.wheelInts[base + cap] = this.surfaces[i]!;
      this.wheelInts[base + cap * 2] = this.roads[i]!; this.wheelInts[base + cap * 3] = this.segments[i]!;
      this.wheelInts[base + cap * 4] = this.intern(contact.surfaceType);
      if (+corner.grounded !== this.grounded[i] && this.havePreviousFrame) this.event('grounded-transition', { wheel: i, grounded: corner.grounded });
      this.grounded[i] = +corner.grounded;
      const bump = corner.grounded && corner.suspensionLength <= corner.minSuspensionLength + T.fullBumpTolerance;
      if (bump && !this.fullBump[i]) this.event('full-bump', { wheel: i, requiredLength: corner.requiredLength,
        length: corner.suspensionLength, penetration: corner.penetration });
      this.fullBump[i] = +bump;
      const large = impulse > T.mechanicalImpulse;
      if (large) {
        if (!this.largeImpulse[i]) this.event('large-mechanical-impulse', { wheel: i, impulse,
          candidates: this.candidates(ground, contacts, i) });
        this.anomaly('mechanical-impulse');
      }
      this.largeImpulse[i] = +large;
    }
    this.ints[slot] = mask; this.ints[cap + slot] = c.contactMicrosteps ?? 1;
    this.ints[2 * cap + slot] = this.intern(s.transmission.selectedMode ?? undefined);
    this.ints[3 * cap + slot] = this.gear(s); this.ints[4 * cap + slot] = c.safetyInterventions ?? 0;
    this.ints[5 * cap + slot] = +s.recoveredFromInvalidState;
    if (s.recoveredFromInvalidState) { this.event('non-finite-recovery', {}); this.anomaly('non-finite-recovery'); }
    if (this.havePreviousFrame && (c.safetyInterventions ?? 0) > this.lastSafety) {
      this.event('contact-safety-recovery', { previous: this.lastSafety, current: c.safetyInterventions });
      this.anomaly('contact-safety-recovery');
    }
    if (this.havePreviousFrame) {
      if (Math.abs(c.verticalVelocity - this.lastVy) > T.verticalVelocityDelta) this.anomaly('vertical-velocity-jump');
      if (Math.abs((c.pitchAngularVelocity ?? 0) - this.lastPitchRate) > T.angularVelocityDelta ||
        Math.abs((c.rollAngularVelocity ?? 0) - this.lastRollRate) > T.angularVelocityDelta) this.anomaly('attitude-rate-jump');
    }
    // ICE RPM is deliberately NaN on EVs; absence is represented as null only at export.
    let finite = true;
    for (let j = 0; j < FRAME_DOUBLE_FIELDS.length; j++) finite &&= Number.isFinite(this.doubles[j * cap + slot]);
    for (let j = 0; j < FRAME_FLOAT_FIELDS.length; j++) if (FRAME_FLOAT_FIELDS[j] !== 'engineRPM' || s.rpm !== undefined)
      finite &&= Number.isFinite(this.floats[j * cap + slot]);
    for (let j = 0; j < 4 * WHEEL_FLOAT_FIELDS.length; j++) finite &&= Number.isFinite(this.wheelFloats[j * cap + slot]);
    if (!finite) { this.event('non-finite-frame', {}); this.anomaly('non-finite-frame'); }
    this.lastVy = c.verticalVelocity; this.lastPitchRate = c.pitchAngularVelocity ?? 0;
    this.lastRollRate = c.rollAngularVelocity ?? 0; this.lastSafety = c.safetyInterventions ?? 0;
    this.havePreviousFrame = true; this.lastCaptureStep = this.step;
    this.cursor = (slot + 1) % cap; this.count = Math.min(cap, this.count + 1);
    if (!this.highDetail) this.count = Math.min(S.preSteps + 1, this.count);
    if (this.manualPending || this.pendingReason) {
      const manual = this.manualPending;
      this.manualPending = false;
      this.event(manual ? 'manual-trigger' : 'automatic-trigger', { reason: manual ? 'manual' : this.pendingReason });
      if (!this.highDetail) {
        this.triggerStep = this.step; this.triggerTime = this.time; this.triggerReason = manual ? 'manual' : this.pendingReason!;
        this.triggerLocation = this.location(s);
        this.status = 'CAPTURING POST-EVENT';
      }
    }
    if (this.detail) this.event('post-event-detail', this.detail);
    this.detail = undefined;
    if (this.highDetail && this.step - this.triggerStep! >= S.postSteps) this.status = 'FROZEN';
  }
  private location(s: VehicleRuntimeSnapshot) {
    let primary = 0;
    for (let i = 0; i < 4; i++) if (this.grounded[i] && this.roads[i]) { primary = i; break; }
    return { map: { id: this.metadata.mapId, name: this.metadata.mapName, version: this.metadata.mapVersion },
      x: s.x, y: s.chassis.chassisY, z: s.z, yaw: s.yaw,
      planarForwardX: -Math.sin(s.yaw), planarForwardZ: -Math.cos(s.yaw),
      road: this.roads[primary], segment: this.segments[primary], sector: null,
      previousRoad: this.previousRoads[primary], previousSegment: this.previousSegments[primary],
      wheels: WHEEL_IDS.map((id, i) => ({ id, grounded: !!this.grounded[i], road: this.roads[i],
        segment: this.segments[i], surface: this.surfaces[i] })), lastSurfaceSwitch: this.lastSurfaceSwitch ?? null };
  }

  /** Called only after freeze, from a later browser task / targeted tests. */
  public createExport() {
    if (this.status !== 'FROZEN') throw new Error('Black box must freeze before serialization');
    const cap = S.frameCapacity, frames = [];
    const numeric = (v: number): number | string => Number.isFinite(v) ? v : String(v);
    for (let n = 0; n < this.count; n++) {
      const slot = (this.cursor - this.count + n + cap) % cap;
      const frame: Record<string, unknown> = {};
      FRAME_DOUBLE_FIELDS.forEach((name, j) => { frame[name] = numeric(this.doubles[j * cap + slot]!); });
      FRAME_FLOAT_FIELDS.forEach((name, j) => { const value = this.floats[j * cap + slot]!;
        frame[name] = name === 'engineRPM' && Number.isNaN(value) ? null : numeric(value); });
      FRAME_INT_FIELDS.forEach((name, j) => { frame[name] = this.ints[j * cap + slot]; });
      frame.wheels = WHEEL_IDS.map((id, i) => {
        const wheel: Record<string, unknown> = { id };
        WHEEL_FLOAT_FIELDS.forEach((name, j) => { wheel[name] = numeric(this.wheelFloats[(i * WHEEL_FLOAT_FIELDS.length + j) * cap + slot]!); });
        WHEEL_INT_FIELDS.forEach((name, j) => { wheel[name] = this.wheelInts[(i * WHEEL_INT_FIELDS.length + j) * cap + slot]; });
        return wheel;
      });
      frames.push(frame);
    }
    const firstStep = Number(frames[0]?.step), lastStep = this.lastCaptureStep;
    const events: BlackBoxEvent[] = [];
    for (let n = 0; n < this.eventCount; n++) {
      const event = this.events[(this.eventCursor - this.eventCount + n + S.eventCapacity) % S.eventCapacity];
      if (event && event.step >= firstStep && event.step <= lastStep) events.push(event);
    }
    events.sort((a, b) => a.step - b.step || a.sequence - b.sequence);
    return { schemaVersion: 1, metadata: { ...this.metadata, physicsHz: S.physicsHz,
      settings: { ...S }, thresholds: { ...T }, allocatedFrameBytes: this.allocatedFrameBytes,
      coordinates: '+X right, +Y up, -Z forward; SI; yaw/pitch/roll YXZ; world Y is chassis heave datum',
      numericEncoding: 'unavailable ICE RPM: null; non-finite numeric data: NaN/Infinity/-Infinity strings',
      collisionContactY: 'unavailable (planar collision solver); null',
      droppedEvents: this.droppedEvents, dictionaryOverflow: this.dictionaryOverflow },
      incident: { triggerStep: this.triggerStep, triggerTime: this.triggerTime, reason: this.triggerReason,
        interrupted: this.interrupted ?? null,
        firstStep, lastStep, preSteps: this.triggerStep! - firstStep, postSteps: lastStep - this.triggerStep!, location: this.triggerLocation },
      dictionaries: { strings: this.strings.slice(), unknownHandle: 0 }, frames, events };
  }
  /** After a successful download, immediately resume a fresh 5-second rolling history. */
  public markSaved(): void {
    if (this.status !== 'FROZEN') return;
    this.status = 'SAVED'; this.count = 0; this.eventCount = 0; this.events.fill(undefined);
    this.triggerStep = undefined; this.triggerLocation = undefined; this.lastSurfaceSwitch = undefined;
    this.interrupted = undefined;
    this.cooldownUntil = this.step + T.automaticCooldownSteps;
  }
}

export function blackBoxFilename(date = new Date()): string {
  const pad = (v: number) => String(v).padStart(2, '0');
  return `vehicle-blackbox-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.json`;
}
