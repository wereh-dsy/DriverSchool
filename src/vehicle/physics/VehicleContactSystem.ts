import type { VehicleInputState } from '../../input/VehicleInputState';
import type { DrivingGround } from '../../world/DrivingGround';
import { VehicleCollisionSystem, type CollisionDimensions, type CollisionResolution } from './CollisionSystem';
import { VehicleDynamics, type VehicleSnapshot } from './VehicleDynamics';
import { sampleWheelContacts, averageWheelGroundGeometry, type WheelContactSet } from './WheelContact';
import { chassisBodyPose } from './WheelPhysicsState';

/** Scene contact adapter. Drivetrain and input remain independent of map geometry. */
export class VehicleContactSystem {
  public readonly collisionSystem: VehicleCollisionSystem;
  public wheelContacts: WheelContactSet | null = null;
  public collision: CollisionResolution | null = null;
  public lastCollision: CollisionResolution | null = null;
  public secondsSinceCollision = Number.POSITIVE_INFINITY;
  private sampledPose: { x: number; z: number; yaw: number } | null = null;
  private wetness = 0;

  public setWetness(wetness: number): void {
    const value = Number.isFinite(wetness) ? Math.min(1, Math.max(0, wetness)) : 0;
    if (value === this.wetness) return;
    this.wetness = value;
    // Discard cached dry contacts so the next fixed step uses actual wet grip.
    this.wheelContacts = null;
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
    this.collisionSystem.reset();
    this.wheelContacts = null;
    this.sampledPose = null;
    this.collision = null;
    this.lastCollision = null;
    this.secondsSinceCollision = Number.POSITIVE_INFINITY;
  }

  public step(dt: number, controls: VehicleInputState, dynamics: VehicleDynamics): VehicleSnapshot {
    let before = dynamics.getSnapshot();
    this.ground.setSurfaceReferenceHeight?.(this.sampledPose === null ? this.ground.spawnPose.position.y - 0.04 : before.chassis.groundHeight);
    // The last final-pose samples become the next step's input. Re-query when
    // a spawn/reset/editor correction changed pose outside this adapter.
    if (this.wheelContacts === null || this.sampledPose?.x !== before.x ||
      this.sampledPose.z !== before.z || this.sampledPose.yaw !== before.yaw) {
      this.wheelContacts = sampleWheelContacts(this.ground, before, dynamics.config, this.wetness);
      dynamics.syncWheelContacts(this.wheelContacts);
      before = dynamics.getSnapshot();
    }
    const { normal } = averageWheelGroundGeometry(this.wheelContacts);
    const previousBody = chassisBodyPose(before.chassis, this.collisionDimensions.bodyOffsetY);
    let after = dynamics.stepFixed(dt, controls, {
      wheelContacts: this.wheelContacts,
      groundNormal: normal,
      bounds: this.ground.worldBounds,
    });
    // Reuse this final-pose query next tick, and give rendering/collision the
    // same support plane even when this step crosses a curb or crest.
    this.ground.setSurfaceReferenceHeight?.(after.chassis.groundHeight);
    this.wheelContacts = sampleWheelContacts(this.ground, after, dynamics.config, this.wetness);
    dynamics.syncWheelContacts(this.wheelContacts);
    after = dynamics.getSnapshot();
    const sin = Math.sin(after.yaw);
    const cos = Math.cos(after.yaw);
    const body = chassisBodyPose(after.chassis, this.collisionDimensions.bodyOffsetY);
    this.collision = this.collisionSystem.resolve({
      previousPose: { ...before, ...previousBody },
      pose: { ...after, ...body },
      velocity: {
        x: -sin * after.speed + cos * after.lateralVelocity,
        z: -cos * after.speed - sin * after.lateralVelocity,
      },
      dimensions: this.collisionDimensions,
      dt,
    });
    if (this.collision.collided) {
      this.lastCollision = this.collision;
      this.secondsSinceCollision = 0;
      dynamics.applyContactCorrection({
        x: this.collision.pose.x,
        z: this.collision.pose.z,
        velocityX: this.collision.velocity.x,
        velocityZ: this.collision.velocity.z,
        // No impact-induced spin. Ordinary steering recovers after leaving contact.
        yawRate: 0,
      });
    }
    if (!this.collision.collided) this.secondsSinceCollision += dt;
    const finalPose = dynamics.getSnapshot();
    if (this.collision.collided) {
      this.wheelContacts = sampleWheelContacts(this.ground, finalPose, dynamics.config, this.wetness);
      dynamics.syncWheelContacts(this.wheelContacts);
    }
    this.sampledPose = { x: finalPose.x, z: finalPose.z, yaw: finalPose.yaw };
    return dynamics.getSnapshot();
  }
}
