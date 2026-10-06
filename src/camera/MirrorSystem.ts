import {
  ClampToEdgeWrapping,
  Color,
  type ColorRepresentation,
  DoubleSide,
  Euler,
  LinearFilter,
  Matrix4,
  Mesh,
  type Material,
  Object3D,
  PerspectiveCamera,
  Plane,
  Quaternion,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  type Texture,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  WebGLRenderer,
} from 'three';
import { DriverCamera } from './DriverCamera';
import { VEHICLE_RENDER_LAYERS } from '../vehicle/visual/VehicleRenderLayers';
import {
  computePlanarMirrorView,
  createPlanarMirrorViewComputation,
  type PlanarMirrorViewComputation,
} from './MirrorMath';
import {
  readEuler,
  readQuaternion,
  readVector2,
  readVector3,
  type EulerLike,
  type QuaternionLike,
  type Vector2Like,
  type Vector3Like,
} from './types';

export type MirrorSide = 'left' | 'right';
export type MirrorTransformSpace = 'vehicle' | 'world';
export const MIRROR_CONTENT_LAYERS_MASK = (1 << VEHICLE_RENDER_LAYERS.WORLD)
  | (1 << VEHICLE_RENDER_LAYERS.EXTERIOR);

export type MirrorResolution =
  | number
  | readonly [number, number]
  | { width: number; height: number };

export interface MirrorPlaneConfig {
  /** Plane origin, in vehicle-local space unless space is "world". */
  position?: Vector3Like;
  /** Euler rotation. Ignored when quaternion is supplied. */
  rotation?: EulerLike;
  quaternion?: QuaternionLike;
  /** Width and height in metres. */
  size: Vector2Like;
  /** Plane normal in mirror-local space. PlaneGeometry's default is +Z. */
  normal?: Vector3Like;
  space?: MirrorTransformSpace;
  /**
   * The real visible mirror object. When supplied, its matrixWorld is the
   * authoritative plane transform and it is hidden during reflection passes.
   */
  surface?: Object3D;
  resolution?: MirrorResolution;
  enabled?: boolean;
  /** Optional subset of WORLD + CAR_EXTERIOR. Interior/mirror layers are never included. */
  layersMask?: number;
  /** Prevents geometry behind the mirror entering the reflected view. */
  clipBias?: number;
  /**
   * Retained for configuration compatibility. Mirror cameras now always use
   * the physical aperture; set viewportPadding to control the extra border.
   */
  cropToMirror?: boolean;
  /** Fractional padding around the exact physical-mirror frustum. */
  viewportPadding?: number;
}

export interface MirrorSystemOptions {
  driverCamera: DriverCamera | PerspectiveCamera;
  vehicleRoot: Object3D;
  mirrors: Record<MirrorSide, MirrorPlaneConfig>;
  defaultResolution?: MirrorResolution;
  /** Additional objects to suppress in every reflection pass. */
  hiddenDuringReflection?: readonly Object3D[];
  /** Replaces supplied mirror Mesh materials with projective mirror materials. */
  autoBindSurfaces?: boolean;
  clearBeforeRender?: boolean;
}

export interface MirrorSurfaceMaterialOptions {
  tint?: ColorRepresentation;
  brightness?: number;
  opacity?: number;
}

export interface MirrorView {
  readonly side: MirrorSide;
  readonly camera: PerspectiveCamera;
  readonly renderTarget: WebGLRenderTarget;
  readonly texture: Texture;
  readonly textureMatrix: Matrix4;
  readonly plane: Plane;
  readonly worldPosition: Vector3;
  readonly worldNormal: Vector3;
  readonly worldRight: Vector3;
  readonly worldUp: Vector3;
  readonly worldSize: Vector2;
  /** Actual mirror aperture in world space: BL / BR / TR / TL. */
  readonly worldCorners: readonly [Vector3, Vector3, Vector3, Vector3];
  readonly virtualEye: Vector3;
  readonly reflectedDirection: Vector3;
  readonly reflectedUp: Vector3;
  readonly surface?: Object3D;
  enabled: boolean;
  valid: boolean;
}

interface InternalMirrorView extends MirrorView {
  readonly config: MirrorPlaneConfig;
  readonly localPosition: Vector3;
  readonly localQuaternion: Quaternion;
  readonly localNormal: Vector3;
  readonly localSize: Vector2;
  readonly computation: PlanarMirrorViewComputation;
}

const MIRROR_VERTEX_SHADER = /* glsl */ `
  uniform mat4 mirrorTextureMatrix;
  varying vec4 vMirrorCoord;

  void main() {
    vec4 localPosition = vec4(position, 1.0);
    vec4 worldPosition = modelMatrix * localPosition;
    vMirrorCoord = mirrorTextureMatrix * worldPosition;
    gl_Position = projectionMatrix * modelViewMatrix * localPosition;
  }
`;

const MIRROR_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D mirrorMap;
  uniform vec3 mirrorTint;
  uniform float mirrorBrightness;
  uniform float mirrorOpacity;
  varying vec4 vMirrorCoord;

  void main() {
    if (vMirrorCoord.w <= 0.0) discard;
    vec2 uv = vMirrorCoord.xy / vMirrorCoord.w;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
    vec4 reflectedColor = texture2D(mirrorMap, uv);
    gl_FragColor = vec4(
      reflectedColor.rgb * mirrorTint * mirrorBrightness,
      reflectedColor.a * mirrorOpacity
    );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * Two planar side mirrors driven by the real driver's eye. The generated
 * texture is shared by the physical surface and any HUD presentation; no
 * second "rear camera" is involved.
 */
export class MirrorSystem {
  readonly views: Readonly<Record<MirrorSide, MirrorView>>;

  private readonly internalViews: Record<MirrorSide, InternalMirrorView>;
  private readonly driverCamera: DriverCamera | PerspectiveCamera;
  private readonly vehicleRoot: Object3D;
  private readonly hiddenDuringReflection: readonly Object3D[];
  private readonly clearBeforeRender: boolean;
  private readonly boundMaterials = new Map<MirrorSide, ShaderMaterial>();
  private readonly originalMaterials = new Map<
    MirrorSide,
    Material | Material[]
  >();

  private readonly sourceEye = new Vector3();
  private readonly worldQuaternion = new Quaternion();
  private readonly localEuler = new Euler();
  private readonly worldScale = new Vector3();
  private readonly transformMatrix = new Matrix4();
  private readonly localMatrix = new Matrix4();
  private rendering = false;

  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly scene: Scene,
    options: MirrorSystemOptions,
  ) {
    this.driverCamera = options.driverCamera;
    this.vehicleRoot = options.vehicleRoot;
    this.hiddenDuringReflection = options.hiddenDuringReflection ?? [];
    this.clearBeforeRender = options.clearBeforeRender ?? true;

    this.internalViews = {
      left: this.createView(
        'left',
        options.mirrors.left,
        options.defaultResolution,
      ),
      right: this.createView(
        'right',
        options.mirrors.right,
        options.defaultResolution,
      ),
    };
    this.views = this.internalViews;

    if (options.autoBindSurfaces ?? true) {
      this.bindSurfaceMaterial('left');
      this.bindSurfaceMaterial('right');
    }
  }

  getView(side: MirrorSide): MirrorView {
    return this.internalViews[side];
  }

  getTexture(side: MirrorSide): Texture {
    return this.internalViews[side].texture;
  }

  /** Explicit alias documenting that HUD and physical mirror use one target. */
  getHudTexture(side: MirrorSide): Texture {
    return this.getTexture(side);
  }

  getRenderTarget(side: MirrorSide): WebGLRenderTarget {
    return this.internalViews[side].renderTarget;
  }

  setEnabled(side: MirrorSide, enabled: boolean): void {
    this.internalViews[side].enabled = enabled;
  }

  setResolution(side: MirrorSide, resolution: MirrorResolution): void {
    const view = this.internalViews[side];
    const size = resolveResolution(
      resolution,
      view.localSize,
      this.renderer.capabilities.maxTextureSize,
    );
    view.renderTarget.setSize(size.x, size.y);
  }

  /**
   * Builds a material that performs the projective texture lookup required
   * when the mirror is oblique to the driver's view.
   */
  createSurfaceMaterial(
    side: MirrorSide,
    options: MirrorSurfaceMaterialOptions = {},
  ): ShaderMaterial {
    const view = this.internalViews[side];
    const opacity = clampFinite(options.opacity ?? 1, 0, 1);
    const material = new ShaderMaterial({
      name: `${capitalize(side)}MirrorSurfaceMaterial`,
      uniforms: {
        mirrorMap: { value: view.texture },
        mirrorTextureMatrix: { value: view.textureMatrix },
        mirrorTint: { value: new Color(options.tint ?? 0xdce7ef) },
        mirrorBrightness: {
          value: Math.max(0, finiteOr(options.brightness, 1.05)),
        },
        mirrorOpacity: { value: opacity },
      },
      vertexShader: MIRROR_VERTEX_SHADER,
      fragmentShader: MIRROR_FRAGMENT_SHADER,
      transparent: opacity < 1,
      depthWrite: opacity >= 1,
      side: DoubleSide,
      // The render target already contains the tone-mapped reflection.
      // Repeating the curve on the physical glass destroys shadow detail.
      toneMapped: false,
    });
    return material;
  }

  /**
   * Assigns the exact projective material to a configured mirror Mesh. The
   * original material is restored by dispose().
   */
  bindSurfaceMaterial(
    side: MirrorSide,
    options: MirrorSurfaceMaterialOptions = {},
  ): ShaderMaterial | undefined {
    const surface = this.internalViews[side].surface;
    if (!(surface instanceof Mesh)) return undefined;

    const priorBound = this.boundMaterials.get(side);
    if (priorBound !== undefined && surface.material === priorBound) {
      priorBound.dispose();
    } else if (!this.originalMaterials.has(side)) {
      this.originalMaterials.set(side, surface.material);
    }

    const material = this.createSurfaceMaterial(side, options);
    surface.material = material;
    this.boundMaterials.set(side, material);
    return material;
  }

  /** Updates geometry-derived virtual eyes, off-axis projections and matrices. */
  update(): void {
    const source = this.getSourceCamera();
    this.vehicleRoot.updateWorldMatrix(true, true);
    source.updateWorldMatrix(true, false);
    source.getWorldPosition(this.sourceEye);

    this.updateView(this.internalViews.left, source);
    this.updateView(this.internalViews.right, source);
  }

  /** Renders both mirrors while suppressing all reflective surfaces. */
  render(): void {
    if (this.rendering) return;
    this.rendering = true;

    const previousTarget = this.renderer.getRenderTarget();
    const previousCubeFace = this.renderer.getActiveCubeFace();
    const previousMipmapLevel = this.renderer.getActiveMipmapLevel();
    const previousXrEnabled = this.renderer.xr.enabled;
    const previousShadowAutoUpdate = this.renderer.shadowMap.autoUpdate;
    const previousAutoClear = this.renderer.autoClear;
    const previousViewport = this.renderer.getViewport(new Vector4());
    const previousScissor = this.renderer.getScissor(new Vector4());
    const previousScissorTest = this.renderer.getScissorTest();
    const visibility = new Map<Object3D, boolean>();

    try {
      this.update();
      this.hideReflectionObjects(visibility);
      this.renderer.xr.enabled = false;
      this.renderer.shadowMap.autoUpdate = false;
      // Let Three clear each render target with scene.background. With
      // autoClear disabled, the manual clear used the renderer's stale black
      // clear colour and erased the sky portion of both side mirrors.
      this.renderer.autoClear = this.clearBeforeRender;

      this.renderView(this.internalViews.left);
      this.renderView(this.internalViews.right);
    } finally {
      for (const [object, wasVisible] of visibility) {
        object.visible = wasVisible;
      }
      this.renderer.xr.enabled = previousXrEnabled;
      this.renderer.shadowMap.autoUpdate = previousShadowAutoUpdate;
      this.renderer.autoClear = previousAutoClear;
      this.renderer.setRenderTarget(
        previousTarget,
        previousCubeFace,
        previousMipmapLevel,
      );
      this.renderer.setViewport(previousViewport);
      this.renderer.setScissor(previousScissor);
      this.renderer.setScissorTest(previousScissorTest);
      this.rendering = false;
    }
  }

  dispose(): void {
    for (const side of ['left', 'right'] as const) {
      const view = this.internalViews[side];
      const surface = view.surface;
      const bound = this.boundMaterials.get(side);
      const original = this.originalMaterials.get(side);
      if (
        surface instanceof Mesh &&
        bound !== undefined &&
        original !== undefined &&
        surface.material === bound
      ) {
        surface.material = original;
      }
      bound?.dispose();
      view.renderTarget.dispose();
    }
    this.boundMaterials.clear();
    this.originalMaterials.clear();
  }

  private createView(
    side: MirrorSide,
    config: MirrorPlaneConfig,
    defaultResolution?: MirrorResolution,
  ): InternalMirrorView {
    const localPosition = readVector3(
      new Vector3(),
      config.position ?? [0, 0, 0],
    );
    const localQuaternion = new Quaternion();
    if (config.quaternion !== undefined) {
      readQuaternion(localQuaternion, config.quaternion);
    } else if (config.rotation !== undefined) {
      readEuler(this.localEuler, config.rotation);
      localQuaternion.setFromEuler(this.localEuler);
    }
    const localNormal = readVector3(
      new Vector3(),
      config.normal ?? [0, 0, 1],
    );
    if (localNormal.lengthSq() < 1e-12) localNormal.set(0, 0, 1);
    localNormal.normalize();
    const localSize = readVector2(new Vector2(), config.size);
    localSize.set(Math.abs(localSize.x), Math.abs(localSize.y));
    if (localSize.x < 1e-4 || localSize.y < 1e-4) {
      throw new Error(`${side} mirror size must be positive.`);
    }

    const resolution = resolveResolution(
      config.resolution ?? defaultResolution ?? 512,
      localSize,
      this.renderer.capabilities.maxTextureSize,
    );
    const renderTarget = new WebGLRenderTarget(resolution.x, resolution.y, {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      format: RGBAFormat,
      type: UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false,
    });
    renderTarget.texture.name = `${capitalize(side)}MirrorTexture`;
    renderTarget.texture.generateMipmaps = false;
    // Render-target pixels already use WebGL's lower-left origin. Both the
    // projective surface shader and a Three.js HUD quad therefore sample the
    // texture directly; toggling flipY would invert the mirror vertically.
    renderTarget.texture.flipY = false;
    renderTarget.texture.wrapS = ClampToEdgeWrapping;
    renderTarget.texture.wrapT = ClampToEdgeWrapping;

    const camera = new PerspectiveCamera();
    camera.name = `${capitalize(side)}MirrorCamera`;
    // MirrorSystem supplies exact matrices. Leaving either automatic update on
    // would allow Object3D.lookAt()/Euler state to overwrite the off-axis rig.
    camera.matrixAutoUpdate = false;
    camera.matrixWorldAutoUpdate = false;
    camera.userData.isMirrorCamera = true;

    const computation = createPlanarMirrorViewComputation();

    return {
      side,
      config,
      camera,
      renderTarget,
      texture: renderTarget.texture,
      textureMatrix: new Matrix4(),
      plane: new Plane(),
      worldPosition: new Vector3(),
      worldNormal: new Vector3(0, 0, 1),
      worldRight: new Vector3(1, 0, 0),
      worldUp: new Vector3(0, 1, 0),
      worldSize: localSize.clone(),
      worldCorners: computation.worldCorners,
      virtualEye: new Vector3(),
      reflectedDirection: new Vector3(0, 0, -1),
      reflectedUp: new Vector3(0, 1, 0),
      surface: config.surface,
      localPosition,
      localQuaternion,
      localNormal,
      localSize,
      computation,
      enabled: config.enabled ?? true,
      valid: false,
    };
  }

  private updateView(
    view: InternalMirrorView,
    source: PerspectiveCamera,
  ): void {
    this.resolveWorldFrame(view);

    const computation = computePlanarMirrorView(
      {
        eye: this.sourceEye,
        center: view.worldPosition,
        right: view.worldRight,
        up: view.worldUp,
        normal: view.worldNormal,
        size: view.worldSize,
        near: source.near,
        far: source.far,
        padding: view.config.viewportPadding ?? 0,
        clipBias: view.config.clipBias ?? 0.002,
      },
      view.computation,
    );

    view.worldRight.copy(computation.mirrorRight);
    view.worldUp.copy(computation.mirrorUp);
    view.worldNormal.copy(computation.mirrorNormal);
    view.virtualEye.copy(computation.virtualEye);
    // Kept for API compatibility: these now describe the geometry-derived
    // virtual camera, never a reflected head-look direction.
    view.reflectedDirection.copy(computation.mirrorNormal);
    view.reflectedUp.copy(computation.mirrorUp);
    view.plane.copy(computation.plane);
    view.textureMatrix.copy(computation.textureMatrix);
    view.valid = computation.valid;

    const camera = view.camera;
    camera.position.copy(view.virtualEye);
    camera.quaternion.setFromRotationMatrix(computation.cameraMatrixWorld);
    camera.scale.set(1, 1, 1);
    camera.up.copy(computation.cameraUp);
    camera.matrix.copy(computation.cameraMatrixWorld);
    camera.matrixWorld.copy(computation.cameraMatrixWorld);
    camera.matrixWorldInverse.copy(computation.cameraMatrixWorldInverse);
    camera.matrixWorldNeedsUpdate = false;
    camera.near = computation.near;
    camera.far = computation.far;
    camera.aspect = view.worldSize.x / view.worldSize.y;
    // The eye camera can see interior and glass. A reflected view must never
    // inherit those layers: it sees the real world and real exterior only.
    camera.layers.mask = (view.config.layersMask ?? MIRROR_CONTENT_LAYERS_MASK)
      & MIRROR_CONTENT_LAYERS_MASK;
    camera.projectionMatrix.copy(computation.projectionMatrix);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  private resolveWorldFrame(view: InternalMirrorView): void {
    if (view.surface !== undefined) {
      view.surface.updateWorldMatrix(true, false);
      this.transformMatrix.copy(view.surface.matrixWorld);
    } else if (view.config.space === 'world') {
      this.transformMatrix.compose(
        view.localPosition,
        view.localQuaternion,
        new Vector3(1, 1, 1),
      );
    } else {
      this.localMatrix.compose(
        view.localPosition,
        view.localQuaternion,
        new Vector3(1, 1, 1),
      );
      this.transformMatrix
        .copy(this.vehicleRoot.matrixWorld)
        .multiply(this.localMatrix);
    }

    this.transformMatrix.decompose(
      view.worldPosition,
      this.worldQuaternion,
      this.worldScale,
    );
    view.worldRight.set(1, 0, 0).applyQuaternion(this.worldQuaternion).normalize();
    view.worldUp.set(0, 1, 0).applyQuaternion(this.worldQuaternion).normalize();
    view.worldNormal
      .copy(view.localNormal)
      .applyQuaternion(this.worldQuaternion)
      .normalize();
    view.worldSize.set(
      view.localSize.x * Math.abs(this.worldScale.x),
      view.localSize.y * Math.abs(this.worldScale.y),
    );
  }

  private renderView(view: InternalMirrorView): void {
    if (!view.enabled || !view.valid) return;
    this.renderer.setRenderTarget(view.renderTarget);
    this.renderer.state.buffers.depth.setMask(true);
    this.renderer.render(this.scene, view.camera);
  }

  private hideReflectionObjects(visibility: Map<Object3D, boolean>): void {
    for (const view of Object.values(this.internalViews)) {
      if (view.surface !== undefined && !visibility.has(view.surface)) {
        visibility.set(view.surface, view.surface.visible);
        view.surface.visible = false;
      }
    }
    for (const object of this.hiddenDuringReflection) {
      if (!visibility.has(object)) {
        visibility.set(object, object.visible);
        object.visible = false;
      }
    }
  }

  private getSourceCamera(): PerspectiveCamera {
    return this.driverCamera instanceof DriverCamera
      ? this.driverCamera.camera
      : this.driverCamera;
  }
}

function resolveResolution(
  requested: MirrorResolution,
  mirrorSize: Vector2,
  maxTextureSize: number,
): Vector2 {
  let width: number;
  let height: number;

  if (typeof requested === 'number') {
    width = requested;
    height = requested * (mirrorSize.y / mirrorSize.x);
  } else if (Array.isArray(requested)) {
    const tuple = requested as readonly [number, number];
    width = tuple[0];
    height = tuple[1];
  } else {
    const dimensions = requested as { width: number; height: number };
    width = dimensions.width;
    height = dimensions.height;
  }

  const safeMax = Number.isFinite(maxTextureSize)
    ? Math.max(16, maxTextureSize)
    : 4_096;
  return new Vector2(
    Math.round(clampFinite(width, 16, safeMax)),
    Math.round(clampFinite(height, 16, safeMax)),
  );
}

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

function clampFinite(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
