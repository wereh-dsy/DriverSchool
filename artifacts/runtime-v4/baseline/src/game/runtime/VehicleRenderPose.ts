import type { VehicleRuntimeSnapshot } from '../../vehicle/physics';
import { chassisBodyPose } from '../../vehicle/physics/WheelPhysicsState';

const wheels = ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'] as const;
const angle = (a: number, b: number, alpha: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * alpha;
const point = () => ({ x: 0, y: 0, z: 0 });

/** Copies only visual transforms. Physics snapshots and query/display inputs are never edited. */
export class VehicleRenderPose {
  private readonly previous = new Float64Array(30);
  private readonly current = new Float64Array(30);
  private initialized = false;
  readonly body = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 };
  readonly wheelPositions = { frontLeft: point(), frontRight: point(), rearLeft: point(), rearRight: point() };
  readonly wheelRotations = { frontLeft: 0, frontRight: 0, rearLeft: 0, rearRight: 0 };
  leftSteering = 0;
  rightSteering = 0;
  steeringWheel = 0;

  reset(snapshot: VehicleRuntimeSnapshot, bodyOffset?: number): void {
    this.capture(snapshot, bodyOffset);
    this.previous.set(this.current);
    this.initialized = true;
  }
  push(snapshot: VehicleRuntimeSnapshot, bodyOffset?: number): void {
    if (!this.initialized) { this.reset(snapshot, bodyOffset); return; }
    this.previous.set(this.current);
    this.capture(snapshot, bodyOffset);
  }
  private capture(snapshot: VehicleRuntimeSnapshot, bodyOffset?: number): void {
    const pose = chassisBodyPose(snapshot.chassis, bodyOffset, snapshot.yaw), data = this.current;
    data[0] = snapshot.x + pose.offsetX; data[1] = pose.y; data[2] = snapshot.z + pose.offsetZ;
    data[3] = snapshot.yaw; data[4] = pose.pitch; data[5] = pose.roll;
    data[6] = snapshot.leftRoadWheelAngle; data[7] = snapshot.rightRoadWheelAngle; data[8] = snapshot.steeringWheelAngle;
    for (let i = 0; i < wheels.length; i++) {
      const wheel = snapshot.wheels[wheels[i]!], at = 9 + i * 4;
      data[at] = wheel.worldPosition.x; data[at + 1] = wheel.worldPosition.y; data[at + 2] = wheel.worldPosition.z;
      data[at + 3] = wheel.rotationAngle;
    }
  }
  sample(alpha: number): void {
    const a = this.previous, b = this.current, t = Math.min(1, Math.max(0, alpha));
    const linear = (index: number) => a[index]! + (b[index]! - a[index]!) * t;
    this.body.x = linear(0); this.body.y = linear(1); this.body.z = linear(2);
    this.body.yaw = angle(a[3]!, b[3]!, t);
    this.body.pitch = angle(a[4]!, b[4]!, t);
    this.body.roll = angle(a[5]!, b[5]!, t);
    this.leftSteering = linear(6); this.rightSteering = linear(7); this.steeringWheel = linear(8);
    for (let i = 0; i < wheels.length; i++) {
      const id = wheels[i]!, at = 9 + i * 4, wheel = this.wheelPositions[id];
      wheel.x = linear(at); wheel.y = linear(at + 1); wheel.z = linear(at + 2);
      this.wheelRotations[id] = angle(a[at + 3]!, b[at + 3]!, t);
    }
  }
}
