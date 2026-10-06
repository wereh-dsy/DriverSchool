import type { VehicleInputState } from '../../input/VehicleInputState';
import type { DrivingGround } from '../../world/DrivingGround';
import { VehicleCollisionSystem, type CollisionDimensions, type CollisionResolution } from './CollisionSystem';
import { VehicleDynamics, type VehicleSnapshot } from './VehicleDynamics';
import { sampleWheelContacts, averageWheelGroundGeometry, type WheelContactSet } from './WheelContact';

/** Scene contact adapter. Drivetrain and input remain independent of map geometry. */
export class VehicleContactSystem {
  public readonly collisionSystem: VehicleCollisionSystem;
  public wheelContacts: WheelContactSet | null = null;
  public collision: CollisionResolution | null = null;
  public lastCollision: CollisionResolution | null = null;
  public secondsSinceCollision = Number.POSITIVE_INFINITY;
  private sampledPose: { x: number; z: number; yaw: number } | null = null;

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
    const before = dynamics.getSnapshot();
    // The last final-pose samples become the next step's input. Re-query when
    // a spawn/reset/editor correction changed pose outside this adapter.
    if (this.wheelContacts === null || this.sampledPose?.x !== before.x ||
      this.sampledPose.z !== before.z || this.sampledPose.yaw !== before.yaw) {
      this.wheelContacts = sampleWheelContacts(this.ground, before, dynamics.config);
    }
    const { normal } = averageWheelGroundGeometry(this.wheelContacts);
    const after = dynamics.stepFixed(dt, controls, {
      wheelContacts: this.wheelContacts,
      groundNormal: normal,
      bounds: this.ground.worldBounds,
    });
    const sin = Math.sin(after.yaw);
    const cos = Math.cos(after.yaw);
    this.collision = this.collisionSystem.resolve({
      previousPose: { ...before, y: this.ground.getRoadHeightAt(before.x, before.z) },
      pose: { ...after, y: this.ground.getRoadHeightAt(after.x, after.z) },
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
    this.wheelContacts = sampleWheelContacts(this.ground, finalPose, dynamics.config);
    this.sampledPose = { x: finalPose.x, z: finalPose.z, yaw: finalPose.yaw };
    dynamics.syncWheelContacts(this.wheelContacts);
    return dynamics.getSnapshot();
  }
}
