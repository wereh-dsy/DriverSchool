import { Matrix4, Plane, Vector2, Vector3, Vector4 } from 'three';

const MIRROR_TEXTURE_BIAS = new Matrix4().set(
  0.5, 0, 0, 0.5,
  0, 0.5, 0, 0.5,
  0, 0, 0.5, 0.5,
  0, 0, 0, 1,
);

export interface PlanarMirrorViewInput {
  /** The real driver's eye in world space. Head orientation is intentionally absent. */
  eye: Vector3;
  center: Vector3;
  right: Vector3;
  up: Vector3;
  normal: Vector3;
  size: Vector2;
  near: number;
  far: number;
  /** Fraction of the mirror width/height added around each frustum edge. */
  padding?: number;
  clipBias?: number;
}

/**
 * Mutable output for computePlanarMirrorView(). Keeping this state outside the
 * function makes the production path allocation-free while leaving the math
 * usable without a renderer, DOM, or test framework.
 */
export interface PlanarMirrorViewComputation {
  valid: boolean;
  mirrorDistance: number;
  near: number;
  far: number;
  readonly virtualEye: Vector3;
  readonly mirrorRight: Vector3;
  readonly mirrorUp: Vector3;
  readonly mirrorNormal: Vector3;
  /** Physical aperture corners, BL / BR / TR / TL in mirror-local axes. */
  readonly worldCorners: readonly [Vector3, Vector3, Vector3, Vector3];
  /** Camera-local +X, +Y and +Z axes in world space. */
  readonly cameraRight: Vector3;
  readonly cameraUp: Vector3;
  readonly cameraBackward: Vector3;
  readonly cameraMatrixWorld: Matrix4;
  readonly cameraMatrixWorldInverse: Matrix4;
  readonly projectionMatrix: Matrix4;
  readonly textureMatrix: Matrix4;
  readonly plane: Plane;
  readonly cameraPlane: Plane;
  readonly clipPlane: Vector4;
  readonly clipQ: Vector4;
  readonly centerDelta: Vector3;
}

export function createPlanarMirrorViewComputation(): PlanarMirrorViewComputation {
  return {
    valid: false,
    mirrorDistance: 0,
    near: 0.025,
    far: 2_500,
    virtualEye: new Vector3(),
    mirrorRight: new Vector3(1, 0, 0),
    mirrorUp: new Vector3(0, 1, 0),
    mirrorNormal: new Vector3(0, 0, 1),
    worldCorners: [new Vector3(), new Vector3(), new Vector3(), new Vector3()],
    cameraRight: new Vector3(-1, 0, 0),
    cameraUp: new Vector3(0, 1, 0),
    cameraBackward: new Vector3(0, 0, -1),
    cameraMatrixWorld: new Matrix4(),
    cameraMatrixWorldInverse: new Matrix4(),
    projectionMatrix: new Matrix4(),
    textureMatrix: new Matrix4(),
    plane: new Plane(),
    cameraPlane: new Plane(),
    clipPlane: new Vector4(),
    clipQ: new Vector4(),
    centerDelta: new Vector3(),
  };
}

/** Reflects a world-space point about an infinite plane. */
export function reflectPointAcrossPlane(
  point: Vector3,
  pointOnPlane: Vector3,
  planeNormal: Vector3,
  target = new Vector3(),
): Vector3 {
  const normalLengthSq = planeNormal.lengthSq();
  if (normalLengthSq < 1e-12) {
    return target.copy(point);
  }

  const signedScale =
    (2 * target.copy(point).sub(pointOnPlane).dot(planeNormal)) /
    normalLengthSq;

  return target.copy(point).addScaledVector(planeNormal, -signedScale);
}

/** Reflects a direction (or up vector) about a plane through the origin. */
export function reflectDirectionAcrossPlane(
  direction: Vector3,
  planeNormal: Vector3,
  target = new Vector3(),
): Vector3 {
  const normalLengthSq = planeNormal.lengthSq();
  if (normalLengthSq < 1e-12) {
    return target.copy(direction);
  }

  const scale = (2 * direction.dot(planeNormal)) / normalLengthSq;
  return target.copy(direction).addScaledVector(planeNormal, -scale);
}

/**
 * Computes a true portal-style planar-mirror camera.
 *
 * The camera pose and asymmetric frustum are determined only by the real eye
 * and the physical mirror rectangle. In particular there is no source-camera
 * direction, up vector, FOV, aspect, or zoom in this API, so rotating a head
 * camera at a fixed eye cannot move the reflected image.
 *
 * The camera uses a proper right-handed basis. Its horizontal axis is the
 * negative mirror-right axis: this is the intentional lateral parity change
 * of a real mirror, and means the raw render target is already a mirror view.
 */
export function computePlanarMirrorView(
  input: PlanarMirrorViewInput,
  output = createPlanarMirrorViewComputation(),
): PlanarMirrorViewComputation {
  output.valid = false;

  if (
    !isFiniteVector(input.eye) ||
    !isFiniteVector(input.center) ||
    !isFiniteVector(input.right) ||
    !isFiniteVector(input.up) ||
    !isFiniteVector(input.normal) ||
    !Number.isFinite(input.size.x) ||
    !Number.isFinite(input.size.y)
  ) {
    resetMirrorComputation(output);
    return output;
  }

  // Build a stable orthonormal frame from the supplied physical plane axes.
  // Prefer the authored right vector; the authored up vector selects its sign.
  output.mirrorNormal.copy(input.normal);
  if (output.mirrorNormal.lengthSq() < 1e-12) {
    resetMirrorComputation(output);
    return output;
  }
  output.mirrorNormal.normalize();

  output.mirrorRight
    .copy(input.right)
    .addScaledVector(
      output.mirrorNormal,
      -input.right.dot(output.mirrorNormal),
    );
  if (output.mirrorRight.lengthSq() < 1e-12) {
    output.mirrorRight.crossVectors(input.up, output.mirrorNormal);
  }
  if (output.mirrorRight.lengthSq() < 1e-12) {
    // Pick the cardinal direction least parallel to the plane normal.
    if (Math.abs(output.mirrorNormal.y) < 0.9) {
      output.mirrorRight.set(0, 1, 0).cross(output.mirrorNormal);
    } else {
      output.mirrorRight.set(1, 0, 0).cross(output.mirrorNormal);
    }
  }
  output.mirrorRight.normalize();
  output.mirrorUp
    .crossVectors(output.mirrorNormal, output.mirrorRight)
    .normalize();
  if (output.mirrorUp.dot(input.up) < 0) {
    output.mirrorRight.negate();
    output.mirrorUp.negate();
  }

  // Plane signs are mathematically interchangeable. Pointing the normal at
  // the real eye makes the clipping half-space deterministic. Keep world-up
  // stable and flip right with normal so right x up = normal remains true.
  output.centerDelta.copy(input.eye).sub(input.center);
  if (output.centerDelta.dot(output.mirrorNormal) < 0) {
    output.mirrorNormal.negate();
    output.mirrorRight.negate();
  }

  output.plane.setFromNormalAndCoplanarPoint(
    output.mirrorNormal,
    input.center,
  );
  reflectPointAcrossPlane(
    input.eye,
    input.center,
    output.mirrorNormal,
    output.virtualEye,
  );

  // A Three camera looks along local -Z. Flipping only the horizontal axis
  // preserves an upright image and supplies the real mirror's lateral parity:
  // (-right) x up = -normal (the camera's local +Z/backward axis).
  output.cameraRight.copy(output.mirrorRight).negate();
  output.cameraUp.copy(output.mirrorUp);
  output.cameraBackward.copy(output.mirrorNormal).negate();
  output.cameraMatrixWorld
    .makeBasis(
      output.cameraRight,
      output.cameraUp,
      output.cameraBackward,
    )
    .setPosition(output.virtualEye);
  output.cameraMatrixWorldInverse
    .copy(output.cameraMatrixWorld)
    .invert();

  output.centerDelta.copy(input.center).sub(output.virtualEye);
  output.mirrorDistance = output.centerDelta.dot(output.mirrorNormal);
  const width = Math.abs(input.size.x);
  const height = Math.abs(input.size.y);
  if (
    output.mirrorDistance <= 1e-5 ||
    width <= 1e-5 ||
    height <= 1e-5
  ) {
    resetMirrorComputation(output);
    return output;
  }

  const requestedNear = finitePositiveOr(input.near, 0.025);
  // The virtual eye is normally much farther from the plane than near, but a
  // defensive cap keeps the aperture in front of the near plane for any rig.
  output.near = Math.max(
    1e-4,
    Math.min(requestedNear, output.mirrorDistance * 0.5),
  );
  output.far = Math.max(
    output.near + 1e-3,
    finitePositiveOr(input.far, 2_500),
  );

  const padding = clampFinite(input.padding ?? 0, 0, 0.5);
  for (let index = 0; index < 4; index += 1) {
    const corner = output.worldCorners[index]!;
    corner.copy(input.center)
      .addScaledVector(output.mirrorRight, (index === 1 || index === 2 ? 1 : -1) * width * 0.5)
      .addScaledVector(output.mirrorUp, (index >= 2 ? 1 : -1) * height * 0.5);
  }
  const halfWidth = width * (0.5 + padding);
  const halfHeight = height * (0.5 + padding);
  const centerX = output.centerDelta.dot(output.cameraRight);
  const centerY = output.centerDelta.dot(output.cameraUp);
  const nearScale = output.near / output.mirrorDistance;
  const left = (centerX - halfWidth) * nearScale;
  const right = (centerX + halfWidth) * nearScale;
  const bottom = (centerY - halfHeight) * nearScale;
  const top = (centerY + halfHeight) * nearScale;
  if (
    !Number.isFinite(left) ||
    !Number.isFinite(right) ||
    !Number.isFinite(bottom) ||
    !Number.isFinite(top) ||
    right - left <= 1e-8 ||
    top - bottom <= 1e-8
  ) {
    resetMirrorComputation(output);
    return output;
  }

  output.projectionMatrix.makePerspective(
    left,
    right,
    top,
    bottom,
    output.near,
    output.far,
  );
  applyMirrorObliqueClipping(
    output,
    clampFinite(input.clipBias ?? 0.002, 0, 0.1),
  );
  output.textureMatrix
    .copy(MIRROR_TEXTURE_BIAS)
    .multiply(output.projectionMatrix)
    .multiply(output.cameraMatrixWorldInverse);
  output.valid = matrixIsFinite(output.cameraMatrixWorld) &&
    matrixIsFinite(output.projectionMatrix) &&
    matrixIsFinite(output.textureMatrix);
  return output;
}

function applyMirrorObliqueClipping(
  output: PlanarMirrorViewComputation,
  clipBias: number,
): void {
  output.cameraPlane
    .copy(output.plane)
    .applyMatrix4(output.cameraMatrixWorldInverse);
  output.clipPlane.set(
    output.cameraPlane.normal.x,
    output.cameraPlane.normal.y,
    output.cameraPlane.normal.z,
    output.cameraPlane.constant,
  );

  const elements = output.projectionMatrix.elements;
  const e0 = elements[0];
  const e5 = elements[5];
  const e10 = elements[10];
  const e14 = elements[14];
  if (
    e0 === undefined ||
    e5 === undefined ||
    e10 === undefined ||
    e14 === undefined ||
    Math.abs(e0) < 1e-12 ||
    Math.abs(e5) < 1e-12 ||
    Math.abs(e14) < 1e-12
  ) {
    return;
  }

  output.clipQ.x = (Math.sign(output.clipPlane.x) + (elements[8] ?? 0)) / e0;
  output.clipQ.y = (Math.sign(output.clipPlane.y) + (elements[9] ?? 0)) / e5;
  output.clipQ.z = -1;
  output.clipQ.w = (1 + e10) / e14;

  const denominator = output.clipPlane.dot(output.clipQ);
  if (Math.abs(denominator) < 1e-8) return;
  output.clipPlane.multiplyScalar(2 / denominator);
  elements[2] = output.clipPlane.x;
  elements[6] = output.clipPlane.y;
  elements[10] = output.clipPlane.z + 1 - clipBias;
  elements[14] = output.clipPlane.w;
}

function resetMirrorComputation(output: PlanarMirrorViewComputation): void {
  output.valid = false;
  output.mirrorDistance = 0;
  output.cameraMatrixWorld.identity();
  output.cameraMatrixWorldInverse.identity();
  output.projectionMatrix.identity();
  output.textureMatrix.identity();
}

function finitePositiveOr(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clampFinite(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function isFiniteVector(vector: Vector3): boolean {
  return Number.isFinite(vector.x) &&
    Number.isFinite(vector.y) &&
    Number.isFinite(vector.z);
}

function matrixIsFinite(matrix: Matrix4): boolean {
  return matrix.elements.every(Number.isFinite);
}

export function makeWorldPlane(
  pointOnPlane: Vector3,
  planeNormal: Vector3,
  target = new Plane(),
): Plane {
  return target.setFromNormalAndCoplanarPoint(
    planeNormal.clone().normalize(),
    pointOnPlane,
  );
}

/**
 * Texture coordinates of the real aperture, ordered for Three PlaneGeometry
 * (TL / TR / BL / BR). A HUD must use these same projective coordinates as
 * the physical glass: displaying a right-handed camera's raw target with
 * ordinary UVs has opposite horizontal parity to the aperture.
 */
export function writeMirrorApertureUvs(
  corners: readonly [Vector3, Vector3, Vector3, Vector3],
  textureMatrix: Matrix4,
  target: Float32Array,
): void {
  const matrix = textureMatrix.elements;
  for (let index = 0; index < 4; index += 1) {
    const point = corners[index === 0 ? 3 : index === 1 ? 2 : index === 2 ? 0 : 1];
    const w = matrix[3]! * point.x + matrix[7]! * point.y + matrix[11]! * point.z + matrix[15]!;
    target[index * 2] = (matrix[0]! * point.x + matrix[4]! * point.y + matrix[8]! * point.z + matrix[12]!) / w;
    target[index * 2 + 1] = (matrix[1]! * point.x + matrix[5]! * point.y + matrix[9]! * point.z + matrix[13]!) / w;
  }
}
