import {
  Euler, Group, MathUtils, Matrix4,
  Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, PlaneGeometry,
  Raycaster, Scene, Vector3, type WebGLRenderer,
} from 'three';
import { buildVehicleExterior } from '../vehicle/visual/VehicleExterior';
import { DEFAULT_SEDAN_VISUAL_CONFIG, SPORTS_COUPE_VISUAL_CONFIG, type VehicleVisualConfig } from '../vehicle/visual/VehicleVisualConfig';
import { VEHICLE_RENDER_LAYERS } from '../vehicle/visual/VehicleRenderLayers';
import { MirrorAdjustmentController } from './MirrorAdjustmentController';
import { computePlanarMirrorView, writeMirrorApertureUvs } from './MirrorMath';
import { MirrorSystem, type MirrorSide, type MirrorView } from './MirrorSystem';
import { MirrorGeometryDebug } from './MirrorGeometryDebug';

export interface MirrorReflectionSelfTestResult {
  readonly assertions: number;
  readonly bodyCoverage: Readonly<Record<string, number>>;
  readonly rearBodyMaximumZ: Readonly<Record<string, number>>;
  readonly visibleBodyParts: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly hudMatchesPhysicalAperture: boolean;
  readonly clippedBehindPlane: boolean;
  readonly worldExteriorOnly: boolean;
}

/** Optical ray tests do not derive expected answers from the camera matrix under test. */
export function runMirrorReflectionSelfTest(): MirrorReflectionSelfTestResult {
  let assertions = 0;
  const assert = (condition: boolean, message: string): void => {
    assertions += 1;
    if (!condition) throw new Error(`Mirror reflection self-test: ${message}`);
  };
  const bodyCoverage: Record<string, number> = {};
  const rearBodyMaximumZ: Record<string, number> = {};
  const bodyReferencePoints: Record<MirrorSide, Vector3> = { left: new Vector3(), right: new Vector3() };
  const bodyReferenceUvs: Record<MirrorSide, Vector3> = { left: new Vector3(), right: new Vector3() };
  const visibleBodyParts: Record<string, Readonly<Record<string, number>>> = {};
  const renderer = { capabilities: { maxTextureSize: 4096 } } as unknown as WebGLRenderer;
  for (const config of [DEFAULT_SEDAN_VISUAL_CONFIG, SPORTS_COUPE_VISUAL_CONFIG]) {
    const root = new Group();
    const body = new Group();
    buildVehicleExterior(body, config);
    root.add(body);
    const source = new PerspectiveCamera(62, 1.8, 0.025, 2_500);
    source.position.set(...config.driverEyePosition);
    source.layers.enableAll();
    const surfaces = makeSurfaces(config);
    root.add(surfaces.left, surfaces.right);
    const mirrors = new MirrorSystem(renderer, new Scene(), {
      driverCamera: source, vehicleRoot: root, autoBindSurfaces: false,
      mirrors: {
        left: { surface: surfaces.left, size: config.leftMirrorTransform.size },
        right: { surface: surfaces.right, size: config.rightMirrorTransform.size, layersMask: 0xffff },
      },
    });
    mirrors.update();
    for (const side of ['left', 'right'] as const) {
      const view = mirrors.getView(side);
      const name = `${config.body.profile}/${side}`;
      assert(view.valid, `${name}: plane is invalid`);
      assert(view.camera.layers.mask === 0b11, `${name}: interior or mirror layer leaked`);
      const interior = new Object3D(); interior.layers.set(VEHICLE_RENDER_LAYERS.INTERIOR);
      const exterior = new Object3D(); exterior.layers.set(VEHICLE_RENDER_LAYERS.EXTERIOR);
      assert(!view.camera.layers.test(interior.layers) && !view.camera.layers.test(surfaces[side].layers)
        && view.camera.layers.test(exterior.layers), `${name}: reflection exclusions are wrong`);
      const eye = source.getWorldPosition(new Vector3());
      const signedEyeDistance = eye.clone().sub(view.worldPosition).dot(view.worldNormal);
      const independentlyReflectedEye = eye.clone().addScaledVector(view.worldNormal, -2 * signedEyeDistance);
      assert(independentlyReflectedEye.distanceTo(view.virtualEye) < 1e-11, `${name}: virtual eye is not E-2N[(E-P)·N]`);
      const centreIncoming = view.worldPosition.clone().sub(eye).normalize();
      const centreOutgoing = centreIncoming.clone().addScaledVector(view.worldNormal,
        -2 * centreIncoming.dot(view.worldNormal));
      const groundRayDistance = -view.worldPosition.y / centreOutgoing.y;
      assert(centreOutgoing.z > 0.94 && centreOutgoing.y < -0.04
        && groundRayDistance > 2 && groundRayDistance < 14,
        `${name}: calibrated glass misses useful nearby parking ground`);

      const uv = new Float32Array(8);
      writeMirrorApertureUvs(view.worldCorners, view.textureMatrix, uv);
      assert(uv[0]! > uv[2]! && uv[1]! > uv[5]!, `${name}: aperture target parity/up is wrong`);
      for (const u of [0.08, 0.27, 0.5, 0.72, 0.93]) for (const v of [0.12, 0.45, 0.82]) {
        const aperture = view.worldPosition.clone()
          .addScaledVector(view.worldRight, (u - 0.5) * view.worldSize.x)
          .addScaledVector(view.worldUp, (v - 0.5) * view.worldSize.y);
        const incoming = aperture.clone().sub(eye).normalize();
        // Independent law of reflection at the physical aperture point.
        const outgoing = incoming.clone().addScaledVector(view.worldNormal, -2 * incoming.dot(view.worldNormal));
        const cameraRay = aperture.clone().sub(view.virtualEye).normalize();
        assert(cameraRay.distanceTo(outgoing) < 1e-10, `${name}: eye/aperture/world ray does not match virtual eye`);
        for (const distance of [2, 7, 25]) {
          const worldPoint = aperture.clone().addScaledVector(outgoing, distance);
          const targetUv = worldPoint.clone().applyMatrix4(view.textureMatrix);
          const expectedU = MathUtils.lerp(uv[4]!, uv[6]!, u);
          const expectedV = MathUtils.lerp(uv[5]!, uv[1]!, v);
          assert(Math.abs(targetUv.x - expectedU) < 1e-7 && Math.abs(targetUv.y - expectedV) < 1e-7,
            `${name}: RT/HUD light ray mismatch at aperture ${u}/${v}, distance ${distance}`);
          const opticalPoint = mirrorIntersectionFromRealObject(eye, worldPoint, view);
          assert(opticalPoint.distanceTo(aperture) < 1e-10, `${name}: reflected real object disagrees with aperture ray`);
        }
      }
      const projection = new Matrix4().multiplyMatrices(view.camera.projectionMatrix, view.camera.matrixWorldInverse);
      const realHalfSpace = view.worldPosition.clone().addScaledVector(view.worldNormal, 0.2).applyMatrix4(projection);
      const falseHalfSpace = view.worldPosition.clone().addScaledVector(view.worldNormal, -0.2).applyMatrix4(projection);
      assert(realHalfSpace.z >= -1 && realHalfSpace.z <= 1, `${name}: clip removes real eye-side objects`);
      assert(falseHalfSpace.z < -1, `${name}: geometry behind the mirror plane is not clipped`);
      const coverage = measureRealBodyReferences(body, eye, view);
      bodyCoverage[name] = coverage.ratio;
      rearBodyMaximumZ[name] = coverage.maxZ;
      visibleBodyParts[name] = coverage.parts;
      bodyReferencePoints[side].copy(coverage.reference);
      bodyReferenceUvs[side].copy(coverage.reference).applyMatrix4(view.textureMatrix);
      assert(coverage.ratio >= 0.1 && coverage.ratio <= 0.205,
        `${name}: real exterior covers ${(coverage.ratio * 100).toFixed(1)}%, expected a narrow inner body reference`);
      assert(side === 'left' ? coverage.minU > 0.55 : coverage.maxU < 0.4,
        `${name}: car body reference is not on the inner edge`);
      assert(coverage.maxZ > 1, `${name}: cannot see any real rear-side exterior`);
      assert((coverage.parts['rear-quarter'] ?? 0) >= 10 && (coverage.parts['wheel-arch'] ?? 0) >= 10,
        `${name}: reference is only glass/pillars, not real rear quarter and rear wheel arch`);
      if (config.body.profile === 'sedan') {
        assert((coverage.parts.door ?? 0) >= 10 && (coverage.parts.trunk ?? 0) >= 1,
          `${name}: missing real rear-door / boot-side references for parking`);
        assert(coverage.maxZ >= config.dimensions.length * 0.43,
          `${name}: real body reference does not reach the rear-side corner`);
      }

      // Fixed objects and a moving eye are checked against independent plane
      // intersection, not merely two mutually consistent projection matrices.
      for (const eyeShift of [new Vector3(0.04, 0, 0), new Vector3(0, 0.025, -0.035)]) {
        const movedEye = eye.clone().add(eyeShift);
        const result = computePlanarMirrorView({ eye: movedEye, center: view.worldPosition,
          right: view.worldRight, up: view.worldUp, normal: view.worldNormal,
          size: view.worldSize, near: 0.025, far: 2_500 });
        const fixed = view.worldPosition.clone().addScaledVector(view.worldNormal, 12);
        const crossing = mirrorIntersectionFromRealObject(movedEye, fixed, view);
        const expected = crossing.clone().sub(view.worldPosition);
        const actual = fixed.clone().applyMatrix4(result.textureMatrix);
        const physicalU = MathUtils.clamp(0.5 + expected.dot(result.mirrorRight) / view.worldSize.x, -100, 100);
        const physicalV = 0.5 + expected.dot(result.mirrorUp) / view.worldSize.y;
        assert(Math.abs(actual.x - (1 - physicalU)) < 1e-9 && Math.abs(actual.y - physicalV) < 1e-9,
          `${name}: eye-motion parallax disagrees with reflected-object light path`);
      }
    }

    const adjustment = new MirrorAdjustmentController(surfaces, { storage: null });
    const basePlane = mirrors.getView('left').worldNormal.clone();
    const baseEye = mirrors.getView('left').virtualEye.clone();
    adjustment.nudge('left', MathUtils.degToRad(2), MathUtils.degToRad(-1));
    mirrors.update();
    assert(mirrors.getView('left').worldNormal.distanceTo(basePlane) > 0.02,
      `${config.body.profile}: F3 did not rotate the real plane`);
    assert(mirrors.getView('left').virtualEye.distanceTo(baseEye) > 0.02,
      `${config.body.profile}: plane adjustment did not automatically reflect the virtual eye`);
    adjustment.reset(); mirrors.update();
    assert(mirrors.getView('left').worldNormal.distanceTo(basePlane) < 1e-12,
      `${config.body.profile}: resetting F3 lost the calibrated plane orientation`);

    // Red left / white rear / blue right in real world. Moving the car and
    // yawing it changes the physical crossing point, then image coordinate.
    const markers = new MirrorGeometryDebug(); markers.anchorVehicle(root); markers.setVisible(true);
    const markerPositions = markers.root.children.map(marker => marker.position.clone());
    root.position.set(0.15, 0, -0.4); root.rotation.y = 0.04; root.updateMatrixWorld(true);
    source.position.set(...config.driverEyePosition); source.position.applyMatrix4(root.matrixWorld);
    mirrors.update();
    markerPositions.forEach((position, index) => assert(position.equals(markers.root.children[index]!.position),
      'debug world markers moved with the vehicle'));
    for (const side of ['left', 'right'] as const) {
      const view = mirrors.getView(side);
      const eye = source.getWorldPosition(new Vector3());
      const movedBodyPoint = bodyReferencePoints[side].clone().applyMatrix4(root.matrixWorld);
      const movedBodyUv = movedBodyPoint.applyMatrix4(view.textureMatrix);
      assert(movedBodyUv.distanceTo(bodyReferenceUvs[side]) < 1e-9,
        `${config.body.profile}/${side}: moving/yawing the car changed its own body reference in the mirror`);
      for (const position of markerPositions) {
        const crossing = mirrorIntersectionFromRealObject(eye, position, view);
        const local = crossing.clone().sub(view.worldPosition);
        const expectedU = 0.5 - local.dot(view.worldRight) / view.worldSize.x;
        const expectedV = 0.5 + local.dot(view.worldUp) / view.worldSize.y;
        const actual = position.clone().applyMatrix4(view.textureMatrix);
        assert(Math.abs(actual.x - expectedU) < 1e-9 && Math.abs(actual.y - expectedV) < 1e-9,
          `${config.body.profile}/${side}: moving/yawed car has incorrect red/white/blue relationship`);
      }
    }
    // Reverse towards a real stationary ground line. The body remains fixed
    // within the mirror, while the ground reference moves according to the
    // independently reflected object-plane intersection.
    root.position.set(0, 0, 0); root.rotation.y = 0;
    source.position.set(...config.driverEyePosition); mirrors.update();
    for (const side of ['left', 'right'] as const) {
      const view = mirrors.getView(side);
      const eye = source.getWorldPosition(new Vector3());
      const aperture = view.worldPosition.clone()
        .addScaledVector(view.worldRight, (side === 'left' ? -0.15 : 0.15) * view.worldSize.x)
        .addScaledVector(view.worldUp, -0.3 * view.worldSize.y);
      const incoming = aperture.clone().sub(eye).normalize();
      const outgoing = incoming.clone().addScaledVector(view.worldNormal, -2 * incoming.dot(view.worldNormal));
      const fixedGroundLine = aperture.clone().addScaledVector(outgoing, -aperture.y / outgoing.y);
      const before = fixedGroundLine.clone().applyMatrix4(view.textureMatrix);
      root.position.z = 0.4;
      source.position.set(...config.driverEyePosition).applyMatrix4(root.matrixWorld);
      root.updateMatrixWorld(true);
      source.position.set(...config.driverEyePosition).applyMatrix4(root.matrixWorld);
      mirrors.update();
      const after = fixedGroundLine.clone().applyMatrix4(view.textureMatrix);
      const crossing = mirrorIntersectionFromRealObject(source.getWorldPosition(new Vector3()), fixedGroundLine, view);
      const local = crossing.sub(view.worldPosition);
      assert(Math.abs(after.x - (0.5 - local.dot(view.worldRight) / view.worldSize.x)) < 1e-9
        && Math.abs(after.y - (0.5 + local.dot(view.worldUp) / view.worldSize.y)) < 1e-9,
        `${config.body.profile}/${side}: reversing moves the parking line in the wrong mirror direction`);
      assert(Math.abs(after.y - before.y) > 0.02 && after.y < before.y,
        `${config.body.profile}/${side}: reversing should bring the stationary ground line down towards the car`);
      root.position.z = 0; root.updateMatrixWorld(true);
      source.position.set(...config.driverEyePosition); mirrors.update();
    }
    markers.dispose(); mirrors.dispose();
    root.traverse(object => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
      }
    });
  }
  return { assertions, bodyCoverage, rearBodyMaximumZ, visibleBodyParts, hudMatchesPhysicalAperture: true,
    clippedBehindPlane: true, worldExteriorOnly: true };
}

function makeSurfaces(config: VehicleVisualConfig): Record<MirrorSide, Mesh> {
  const create = (side: MirrorSide): Mesh => {
    const transform = side === 'left' ? config.leftMirrorTransform : config.rightMirrorTransform;
    const surface = new Mesh(new PlaneGeometry(...transform.size), new MeshBasicMaterial());
    surface.quaternion.setFromEuler(new Euler(...transform.rotation));
    const normal = new Vector3(0, 0, 1).applyQuaternion(surface.quaternion);
    surface.position.set(...transform.position).addScaledVector(normal, 0.004);
    surface.layers.set(VEHICLE_RENDER_LAYERS.MIRROR);
    return surface;
  };
  return { left: create('left'), right: create('right') };
}

function mirrorIntersectionFromRealObject(eye: Vector3, point: Vector3, view: MirrorView): Vector3 {
  // Reflect the *object* instead of the camera. Eye-to-virtual-object line
  // intersects the real plane at the actual reflected-image point.
  const virtualObject = point.clone().addScaledVector(view.worldNormal,
    -2 * point.clone().sub(view.worldPosition).dot(view.worldNormal));
  const direction = virtualObject.sub(eye);
  const t = view.worldPosition.clone().sub(eye).dot(view.worldNormal) / direction.dot(view.worldNormal);
  return eye.clone().addScaledVector(direction, t);
}

function measureRealBodyReferences(body: Group, eye: Vector3, view: MirrorView): {
  ratio: number; minU: number; maxU: number; maxZ: number; parts: Record<string, number>; reference: Vector3;
} {
  const ray = new Raycaster(); ray.layers.enableAll();
  let count = 0; let minU = 1; let maxU = 0; let maxZ = -Infinity;
  const parts: Record<string, number> = {};
  const reference = new Vector3();
  for (let x = 0; x < 41; x += 1) for (let y = 0; y < 21; y += 1) {
    const point = view.worldPosition.clone()
      .addScaledVector(view.worldRight, (x / 40 - 0.5) * view.worldSize.x)
      .addScaledVector(view.worldUp, (y / 20 - 0.5) * view.worldSize.y);
    const incoming = point.clone().sub(eye).normalize();
    const direction = incoming.clone().addScaledVector(view.worldNormal, -2 * incoming.dot(view.worldNormal));
    ray.set(point.clone().addScaledVector(direction, 0.001), direction);
    const hit = ray.intersectObject(body, true).find(hit => hit.object.userData.vehicleBodyPart !== 'glass');
    if (hit !== undefined && hit.point.z > 0 && Math.sign(hit.point.x) === (view.side === 'left' ? -1 : 1)) {
      count += 1; minU = Math.min(minU, x / 40); maxU = Math.max(maxU, x / 40); maxZ = Math.max(maxZ, hit.point.z);
      const category = hit.object.userData.vehicleBodyPart as string;
      parts[category] = (parts[category] ?? 0) + 1;
      if (category === 'rear-quarter') reference.copy(hit.point);
    }
  }
  return { ratio: count / (41 * 21), minU, maxU, maxZ, parts, reference };
}
