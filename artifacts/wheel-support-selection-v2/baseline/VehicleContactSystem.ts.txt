import type { VehicleInputState } from '../../input/VehicleInputState';
import type { DrivingGround } from '../../world/DrivingGround';
import { VehicleCollisionSystem, type CollisionDimensions, type CollisionResolution } from './CollisionSystem';
import { VehicleDynamics, type VehicleSnapshotFor, type VehicleEnvironment } from './VehicleDynamics';
import type { Powertrain } from '../powertrain/Powertrain';
import { WHEEL_IDS, sampleWheelContacts, createWheelContactBuffer, averageWheelGroundGeometry, type WheelContactSet } from './WheelContact';
import { chassisBodyPose } from './WheelPhysicsState';
import { centerOfMassOffsetZ } from '../VehicleDimensions';
import type { VehiclePhysicsBlackBox } from '../diagnostics/VehiclePhysicsBlackBox';
import { WheelSupportContinuity } from './WheelSupportContinuity';

/** Scene contact adapter. Drivetrain and input remain independent of map geometry. */
export class VehicleContactSystem {
  /** Undefined while OFF: no recorder allocation, sampling, triggers or extra queries. */
  public blackBox?: VehiclePhysicsBlackBox;
  public readonly collisionSystem: VehicleCollisionSystem;
  public wheelContacts: WheelContactSet | null = null;
  public collision: CollisionResolution | null = null;
  public lastCollision: CollisionResolution | null = null;
  public secondsSinceCollision = Number.POSITIVE_INFINITY;
  private sampledPose: { x: number; z: number; yaw: number; chassisY: number } | null = null;
  private wetness = 0;
  private roadGripMultiplier = 1;
  private contactBuffer = createWheelContactBuffer();
  private verticalContactBuffer = createWheelContactBuffer();
  public readonly supportContinuity = new WheelSupportContinuity();
  private wheelRadius = 0;
  private readonly verticalPose = { x: 0, z: 0, yaw: 0, wheels: {
    frontLeft: { worldPosition: { x: 0, z: 0 } }, frontRight: { worldPosition: { x: 0, z: 0 } },
    rearLeft: { worldPosition: { x: 0, z: 0 } }, rearRight: { worldPosition: { x: 0, z: 0 } } } };
  private readonly sampleVerticalContacts: NonNullable<VehicleEnvironment['sampleVerticalContacts']> =
    (x, z, yaw, chassisY, geometry, dimensions) => {
      this.ground.setSurfaceReferenceHeight?.(chassisY);
      const pose = this.verticalPose;
      pose.x = x; pose.z = z; pose.yaw = yaw;
      for (const id of WHEEL_IDS) {
        pose.wheels[id].worldPosition = geometry.wheels[id].wheelCenterWorld;
      }
      this.supportContinuity.prepare(geometry, this.wheelRadius);
      const contacts = sampleWheelContacts(this.ground, pose, dimensions,
        this.wetness, this.roadGripMultiplier, this.verticalContactBuffer, this.supportContinuity);
      this.blackBox?.observeContacts(contacts, this.ground);
      return contacts;
    };

  public setWetness(wetness: number): void {
    const value = Number.isFinite(wetness) ? Math.min(1, Math.max(0, wetness)) : 0;
    const delta = Math.abs(value - this.wetness);
    this.wetness = value;
    // Discard cached contacts on a meaningful change; continuous transitions
    // avoid invalidating the cache every frame.
    if (delta > .005) this.wheelContacts = null;
  }

  /** Shared weather grip scale; all vehicles consume the same value. */
  public setRoadGripMultiplier(multiplier: number): void {
    const value = Number.isFinite(multiplier) ? Math.min(1, Math.max(0, multiplier)) : 1;
    const delta = Math.abs(value - this.roadGripMultiplier);
    this.roadGripMultiplier = value;
    if (delta > .002) this.wheelContacts = null;
  }

  public constructor(private ground: DrivingGround, private collisionDimensions: CollisionDimensions) {
    this.collisionSystem = new VehicleCollisionSystem(ground.colliders);
  }

  public setCollisionDimensions(dimensions: CollisionDimensions): void {
    this.collisionDimensions = dimensions;
    this.reset();
  }

  public setGround(ground: DrivingGround): void {
    this.ground = ground;
    this.collisionSystem.setColliders(ground.colliders);
    this.reset();
  }

  public reset(): void {
    this.supportContinuity.reset();
    this.collisionSystem.reset();
    this.wheelContacts = null;
    this.sampledPose = null;
    this.collision = null;
    this.lastCollision = null;
    this.secondsSinceCollision = Number.POSITIVE_INFINITY;
  }

  /** Spawn/reset contact initialization belongs to physics, never the renderer. */
  public synchronize<P extends Powertrain>(dynamics: VehicleDynamics<P>): VehicleSnapshotFor<P> {
    const before = dynamics.getSnapshot();
    this.ground.setSurfaceReferenceHeight?.(this.sampledPose === null ? this.ground.spawnPose.position.y - 0.04 : before.chassis.chassisY);
    this.wheelContacts = sampleWheelContacts(this.ground, before, dynamics.config,
      this.wetness, this.roadGripMultiplier, this.contactBuffer);
    dynamics.syncWheelContacts(this.wheelContacts);
    this.supportContinuity.reset();
    this.supportContinuity.seed(this.wheelContacts);
    this.wheelRadius = dynamics.config.wheelRadius;
    const after = dynamics.getSnapshot();
    this.sampledPose = { x: after.x, z: after.z, yaw: after.yaw, chassisY: after.chassis.chassisY };
    return after;
  }

  public step<P extends Powertrain>(dt: number, controls: VehicleInputState, dynamics: VehicleDynamics<P>): VehicleSnapshotFor<P> {
    const recorder = this.blackBox;
    if (recorder) {
      recorder.beginStep(dt);
      dynamics.chassisMotion.diagnosticObserver = recorder.highDetail ? recorder.observeMicrostep : undefined;
      dynamics.chassisMotion.safetyObserver = recorder.recording ? recorder.observeSafety : undefined;
      dynamics.diagnosticRecoveryObserver = recorder.recording ? recorder.observeRecovery : undefined;
    }
    let before = dynamics.getSnapshot();
    // The last final-pose samples become the next step's input. Re-query when
    // a spawn/reset/editor correction changed pose outside this adapter.
    if (this.wheelContacts === null || this.sampledPose?.x !== before.x ||
      this.sampledPose.z !== before.z || this.sampledPose.yaw !== before.yaw ||
      this.sampledPose.chassisY !== before.chassis.chassisY) {
      before = this.synchronize(dynamics);
    }
    const currentContacts = this.wheelContacts!;
    this.supportContinuity.beginStep();
    recorder?.observeContacts(currentContacts, this.ground);
    const vertical = dynamics.suspension.getVerticalSnapshot();
    const { normal } = averageWheelGroundGeometry(currentContacts,
      vertical.active ? dynamics.suspension.getGroundedWheels() : undefined);
    const previousBody = chassisBodyPose(before.chassis, this.collisionDimensions.bodyOffsetY, before.yaw);
    let after = dynamics.stepFixed(dt, controls, {
      wheelContacts: currentContacts,
      groundNormal: normal,
      bounds: this.ground.worldBounds,
      sampleVerticalContacts: this.sampleVerticalContacts,
    });
    // Reuse this final-pose query next tick, and give rendering/collision the
    // same support plane even when this step crosses a curb or crest.
    this.wheelContacts = this.verticalContactBuffer;
    this.verticalContactBuffer = this.contactBuffer;
    this.contactBuffer = this.wheelContacts;
    this.ground.setSurfaceReferenceHeight?.(after.chassis.chassisY);
    const sin = Math.sin(after.yaw);
    const cos = Math.cos(after.yaw);
    // Collision geometry and sweep use the body origin, so supply its point velocity.
    const bodyOriginLateralVelocity = after.lateralVelocity - after.yawRate * centerOfMassOffsetZ(dynamics.config);
    const body = chassisBodyPose(after.chassis, this.collisionDimensions.bodyOffsetY, after.yaw);
    this.collision = this.collisionSystem.resolve({
      previousPose: { x: before.x + previousBody.offsetX, z: before.z + previousBody.offsetZ, yaw: before.yaw, ...previousBody },
      pose: { x: after.x + body.offsetX, z: after.z + body.offsetZ, yaw: after.yaw, ...body },
      velocity: {
        x: -sin * after.speed + cos * bodyOriginLateralVelocity,
        z: -cos * after.speed - sin * bodyOriginLateralVelocity,
      },
      dimensions: this.collisionDimensions,
      dt,
    });
    if (this.collision.collided) {
      const beforeCollision = after;
      this.lastCollision = this.collision;
      this.secondsSinceCollision = 0;
      dynamics.applyContactCorrection({
        x: this.collision.pose.x - body.offsetX,
        z: this.collision.pose.z - body.offsetZ,
        velocityX: this.collision.velocity.x,
        velocityZ: this.collision.velocity.z,
        // No impact-induced spin. Ordinary steering recovers after leaving contact.
        yawRate: 0,
      });
      const finalPose = dynamics.getSnapshot();
      this.ground.setSurfaceReferenceHeight?.(finalPose.chassis.chassisY);
      this.supportContinuity.prepare(dynamics.suspension.getVerticalSnapshot(), this.wheelRadius);
      this.wheelContacts = sampleWheelContacts(this.ground, finalPose, dynamics.config, this.wetness,
        this.roadGripMultiplier, this.contactBuffer, this.supportContinuity);
      dynamics.syncWheelContacts(this.wheelContacts);
      after = dynamics.getSnapshot();
      recorder?.collision(beforeCollision, after, this.collision);
    } else this.secondsSinceCollision += dt;
    if (!this.sampledPose) this.sampledPose = { x: after.x, z: after.z, yaw: after.yaw, chassisY: after.chassis.chassisY };
    else { this.sampledPose.x = after.x; this.sampledPose.z = after.z; this.sampledPose.yaw = after.yaw;
      this.sampledPose.chassisY = after.chassis.chassisY; }
    if (recorder) {
      recorder.capture(after, controls, this.wheelContacts!, dynamics.suspension.getVerticalSnapshot(), dynamics.chassisMotion, this.ground);
      if (!recorder.highDetail) dynamics.chassisMotion.diagnosticObserver = undefined;
      if (!recorder.recording) {
        dynamics.chassisMotion.safetyObserver = undefined;
        dynamics.diagnosticRecoveryObserver = undefined;
      }
    }
    return after;
  }
}
