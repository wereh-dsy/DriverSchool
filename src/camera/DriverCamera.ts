import {
  Euler,
  MathUtils,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Vector3,
} from 'three';
import {
  readEuler,
  readQuaternion,
  readVector3,
  type EulerLike,
  type QuaternionLike,
  type Vector3Like,
} from './types';

export interface VehiclePose {
  position: Vector3Like;
  quaternion: QuaternionLike;
}

export interface DriverHeadLookOptions {
  /** Maximum left/right head rotation in radians. */
  yawLimit?: number;
  /** Maximum upward head rotation in radians. */
  pitchUpLimit?: number;
  /** Maximum downward head rotation in radians. */
  pitchDownLimit?: number;
  /** Exponential response rate used by setHeadLookTarget(). */
  response?: number;
}

export interface DriverCameraOptions {
  driverEyePosition: Vector3Like;
  /**
   * Camera mount rotation relative to the vehicle. With the project convention
   * (+X right, +Y up, -Z forward) the identity rotation looks forward.
   */
  localRotation?: EulerLike | QuaternionLike;
  fov?: number;
  aspect?: number;
  near?: number;
  far?: number;
  headLook?: DriverHeadLookOptions;
  camera?: PerspectiveCamera;
}

export interface HeadLookState {
  yaw: number;
  pitch: number;
  targetYaw: number;
  targetPitch: number;
}

/** Neutral first-person framing shared by the runtime and projection tests. */
export const DEFAULT_DRIVER_FOV_DEGREES = 62;
export const DEFAULT_DRIVER_HEAD_LOOK = Object.freeze({
  yawLimitRadians: MathUtils.degToRad(60),
  pitchUpLimitRadians: MathUtils.degToRad(24),
  pitchDownLimitRadians: MathUtils.degToRad(21),
  response: 15,
});

const DEFAULT_FOV = DEFAULT_DRIVER_FOV_DEGREES;
const DEFAULT_NEAR = 0.025;
const DEFAULT_FAR = 2_500;

/**
 * Owns the real driver's eye camera. It deliberately stays independent from
 * vehicle physics; callers supply either an Object3D or a plain world pose.
 */
export class DriverCamera {
  readonly camera: PerspectiveCamera;
  readonly driverEyePosition = new Vector3();
  readonly localRotation = new Quaternion();

  private readonly headEuler = new Euler(0, 0, 0, 'YXZ');
  private readonly headQuaternion = new Quaternion();
  private readonly worldPosition = new Vector3();
  private readonly vehiclePosition = new Vector3();
  private readonly vehicleQuaternion = new Quaternion();
  private readonly worldQuaternion = new Quaternion();
  private readonly parentWorldQuaternion = new Quaternion();

  private yaw = 0;
  private pitch = 0;
  private targetYaw = 0;
  private targetPitch = 0;
  private readonly yawLimit: number;
  private readonly pitchUpLimit: number;
  private readonly pitchDownLimit: number;
  private readonly headResponse: number;

  constructor(options: DriverCameraOptions) {
    const fov = options.fov ?? DEFAULT_FOV;
    const aspect = options.aspect ?? 16 / 9;
    const near = options.near ?? DEFAULT_NEAR;
    const far = options.far ?? DEFAULT_FAR;

    this.camera =
      options.camera ?? new PerspectiveCamera(fov, aspect, near, far);
    this.camera.name ||= 'DriverCamera';
    this.camera.fov = fov;
    this.camera.aspect = aspect;
    this.camera.near = near;
    this.camera.far = far;
    this.camera.up.set(0, 1, 0);
    this.camera.updateProjectionMatrix();

    readVector3(this.driverEyePosition, options.driverEyePosition);
    this.setLocalRotation(options.localRotation);

    const look = options.headLook;
    this.yawLimit = Math.abs(
      look?.yawLimit ?? DEFAULT_DRIVER_HEAD_LOOK.yawLimitRadians,
    );
    this.pitchUpLimit = Math.abs(
      look?.pitchUpLimit ?? DEFAULT_DRIVER_HEAD_LOOK.pitchUpLimitRadians,
    );
    this.pitchDownLimit = Math.abs(
      look?.pitchDownLimit ?? DEFAULT_DRIVER_HEAD_LOOK.pitchDownLimitRadians,
    );
    this.headResponse = Math.max(0, look?.response ?? DEFAULT_DRIVER_HEAD_LOOK.response);
  }

  /** Alias useful when an API expects a raw Three.js camera. */
  get object(): PerspectiveCamera {
    return this.camera;
  }

  setDriverEyePosition(position: Vector3Like): this {
    readVector3(this.driverEyePosition, position);
    return this;
  }

  setLocalRotation(rotation?: EulerLike | QuaternionLike): this {
    if (rotation === undefined) {
      this.localRotation.identity();
      return this;
    }

    if (isQuaternionLike(rotation)) {
      readQuaternion(this.localRotation, rotation);
    } else {
      readEuler(this.headEuler, rotation);
      this.localRotation.setFromEuler(this.headEuler);
    }

    return this;
  }

  /** Sets and immediately applies a limited head rotation. */
  setHeadLook(yaw: number, pitch: number): this {
    const clamped = this.clampHeadLook(yaw, pitch);
    this.yaw = clamped.yaw;
    this.pitch = clamped.pitch;
    this.targetYaw = clamped.yaw;
    this.targetPitch = clamped.pitch;
    return this;
  }

  /** Changes the smoothed target used by update(). */
  setHeadLookTarget(yaw: number, pitch: number): this {
    const clamped = this.clampHeadLook(yaw, pitch);
    this.targetYaw = clamped.yaw;
    this.targetPitch = clamped.pitch;
    return this;
  }

  addHeadLook(deltaYaw: number, deltaPitch: number): this {
    return this.setHeadLookTarget(
      this.targetYaw + deltaYaw,
      this.targetPitch + deltaPitch,
    );
  }

  resetHeadLook(immediate = false): this {
    if (immediate) {
      return this.setHeadLook(0, 0);
    }
    return this.setHeadLookTarget(0, 0);
  }

  getHeadLook(target: HeadLookState = {
    yaw: 0,
    pitch: 0,
    targetYaw: 0,
    targetPitch: 0,
  }): HeadLookState {
    target.yaw = this.yaw;
    target.pitch = this.pitch;
    target.targetYaw = this.targetYaw;
    target.targetPitch = this.targetPitch;
    return target;
  }

  setAspect(aspectOrWidth: number, height?: number): this {
    const aspect = height === undefined ? aspectOrWidth : aspectOrWidth / height;
    if (Number.isFinite(aspect) && aspect > 0) {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
    return this;
  }

  setFov(fovDegrees: number): this {
    if (Number.isFinite(fovDegrees)) {
      this.camera.fov = MathUtils.clamp(fovDegrees, 20, 100);
      this.camera.updateProjectionMatrix();
    }
    return this;
  }

  /**
   * Updates the eye from a vehicle pose. deltaSeconds is only used for the
   * optional smoothed head-look target and is safe to omit.
   */
  update(vehicle: Object3D | VehiclePose, deltaSeconds = 0): PerspectiveCamera {
    this.updateHeadLook(deltaSeconds);

    if (vehicle instanceof Object3D) {
      vehicle.updateWorldMatrix(true, false);
      vehicle.getWorldPosition(this.vehiclePosition);
      vehicle.getWorldQuaternion(this.vehicleQuaternion);
      this.worldPosition
        .copy(this.driverEyePosition)
        .applyMatrix4(vehicle.matrixWorld);
    } else {
      readVector3(this.vehiclePosition, vehicle.position);
      readQuaternion(this.vehicleQuaternion, vehicle.quaternion);
      this.worldPosition
        .copy(this.driverEyePosition)
        .applyQuaternion(this.vehicleQuaternion)
        .add(this.vehiclePosition);
    }

    this.headEuler.set(this.pitch, this.yaw, 0, 'YXZ');
    this.headQuaternion.setFromEuler(this.headEuler);
    this.worldQuaternion
      .copy(this.vehicleQuaternion)
      .multiply(this.localRotation)
      .multiply(this.headQuaternion)
      .normalize();

    this.applyWorldTransform(this.worldPosition, this.worldQuaternion);
    return this.camera;
  }

  getWorldEyePosition(target = new Vector3()): Vector3 {
    this.camera.updateWorldMatrix(true, false);
    return this.camera.getWorldPosition(target);
  }

  private updateHeadLook(deltaSeconds: number): void {
    if (!(deltaSeconds > 0) || this.headResponse === 0) return;
    const alpha = 1 - Math.exp(-this.headResponse * Math.min(deltaSeconds, 0.25));
    this.yaw = MathUtils.lerp(this.yaw, this.targetYaw, alpha);
    this.pitch = MathUtils.lerp(this.pitch, this.targetPitch, alpha);
  }

  private clampHeadLook(yaw: number, pitch: number): {
    yaw: number;
    pitch: number;
  } {
    return {
      yaw: MathUtils.clamp(
        Number.isFinite(yaw) ? yaw : 0,
        -this.yawLimit,
        this.yawLimit,
      ),
      pitch: MathUtils.clamp(
        Number.isFinite(pitch) ? pitch : 0,
        -this.pitchDownLimit,
        this.pitchUpLimit,
      ),
    };
  }

  private applyWorldTransform(position: Vector3, rotation: Quaternion): void {
    const parent = this.camera.parent;
    if (parent === null) {
      this.camera.position.copy(position);
      this.camera.quaternion.copy(rotation);
    } else {
      parent.updateWorldMatrix(true, false);
      this.camera.position.copy(position);
      parent.worldToLocal(this.camera.position);
      parent.getWorldQuaternion(this.parentWorldQuaternion).invert();
      this.camera.quaternion
        .copy(this.parentWorldQuaternion)
        .multiply(rotation)
        .normalize();
    }

    this.camera.updateMatrix();
    this.camera.updateMatrixWorld(true);
  }
}

function isQuaternionLike(
  value: EulerLike | QuaternionLike,
): value is QuaternionLike {
  return (
    (Array.isArray(value) && value.length === 4) ||
    (!Array.isArray(value) && 'w' in value)
  );
}
