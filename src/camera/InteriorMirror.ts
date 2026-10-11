import * as T from 'three';
import { computePlanarMirrorView, createPlanarMirrorViewComputation } from './MirrorMath';
import { VEHICLE_RENDER_LAYERS as L } from '../vehicle/visual/VehicleRenderLayers';

/** Optional cabin mirror: the existing planar math, with the real interior included. */
export class InteriorMirror {
  public readonly camera = new T.PerspectiveCamera();
  public readonly renderTarget = new T.WebGLRenderTarget(768, 240);
  private readonly computation = createPlanarMirrorViewComputation();
  private readonly eye = new T.Vector3();
  private readonly center = new T.Vector3();
  private readonly right = new T.Vector3();
  private readonly up = new T.Vector3();
  private readonly normal = new T.Vector3();
  private readonly rotation = new T.Quaternion();
  private readonly size: T.Vector2;
  private readonly originalMaterial: T.Material | T.Material[];
  private readonly material: T.ShaderMaterial;
  private readonly viewport = new T.Vector4();
  private readonly scissor = new T.Vector4();
  public constructor(private readonly renderer: T.WebGLRenderer, private readonly scene: T.Scene,
    private readonly source: T.PerspectiveCamera, private readonly surface: T.Mesh,
    size: readonly [number, number], private readonly reflectiveRoot: T.Object3D) {
    this.size = new T.Vector2(...size); this.originalMaterial = surface.material;
    this.camera.name = 'Interior rear-view mirror camera'; this.camera.matrixAutoUpdate = false; this.camera.matrixWorldAutoUpdate = false;
    this.camera.layers.mask = (1 << L.WORLD) | (1 << L.EXTERIOR) | (1 << L.INTERIOR);
    this.camera.userData.isMirrorCamera = true;
    this.renderTarget.texture.name = 'Real rear cabin and outside reflection'; this.renderTarget.texture.generateMipmaps = false;
    this.material = new T.ShaderMaterial({
      uniforms: { mirrorMap: { value: this.renderTarget.texture }, textureMatrix: { value: this.computation.textureMatrix } },
      vertexShader: `uniform mat4 textureMatrix; varying vec4 mirrorCoord;
        void main(){ vec4 world=modelMatrix*vec4(position,1.0); mirrorCoord=textureMatrix*world;
          gl_Position=projectionMatrix*viewMatrix*world; }`,
      fragmentShader: `uniform sampler2D mirrorMap; varying vec4 mirrorCoord;
        void main(){ if(mirrorCoord.w<=0.0) discard; vec2 uv=mirrorCoord.xy/mirrorCoord.w;
          if(uv.x<0.0||uv.y<0.0||uv.x>1.0||uv.y>1.0) discard;
          gl_FragColor=texture2D(mirrorMap,uv);
          #include <colorspace_fragment>
        }`,
      side: T.FrontSide, toneMapped: false,
    });
    surface.material = this.material;
  }
  public update(): boolean {
    this.surface.updateWorldMatrix(true, false); this.source.updateWorldMatrix(true, false);
    this.source.getWorldPosition(this.eye); this.surface.getWorldPosition(this.center); this.surface.getWorldQuaternion(this.rotation);
    this.right.set(1, 0, 0).applyQuaternion(this.rotation); this.up.set(0, 1, 0).applyQuaternion(this.rotation); this.normal.set(0, 0, 1).applyQuaternion(this.rotation);
    const r = computePlanarMirrorView({ eye: this.eye, center: this.center, right: this.right, up: this.up, normal: this.normal,
      size: this.size, near: this.source.near, far: this.source.far, padding: .02, clipBias: .003 }, this.computation);
    if (!r.valid) return false;
    this.camera.position.copy(r.virtualEye); this.camera.quaternion.setFromRotationMatrix(r.cameraMatrixWorld);
    this.camera.matrix.copy(r.cameraMatrixWorld); this.camera.matrixWorld.copy(r.cameraMatrixWorld);
    this.camera.matrixWorldInverse.copy(r.cameraMatrixWorldInverse); this.camera.matrixWorldNeedsUpdate = false;
    this.camera.projectionMatrix.copy(r.projectionMatrix); this.camera.projectionMatrixInverse.copy(r.projectionMatrix).invert();
    return true;
  }
  public render(): void {
    if (!this.update()) return;
    const renderer = this.renderer, target = renderer.getRenderTarget(), cube = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
    const visible = this.reflectiveRoot.visible, xr = renderer.xr.enabled, shadows = renderer.shadowMap.autoUpdate, autoClear = renderer.autoClear;
    renderer.getViewport(this.viewport); renderer.getScissor(this.scissor); const scissorTest = renderer.getScissorTest();
    try {
      this.reflectiveRoot.visible = false; renderer.xr.enabled = false; renderer.shadowMap.autoUpdate = false; renderer.autoClear = true;
      renderer.setRenderTarget(this.renderTarget); renderer.setScissorTest(false); renderer.render(this.scene, this.camera);
    } finally {
      this.reflectiveRoot.visible = visible; renderer.xr.enabled = xr; renderer.shadowMap.autoUpdate = shadows; renderer.autoClear = autoClear;
      renderer.setRenderTarget(target, cube, mip); renderer.setViewport(this.viewport); renderer.setScissor(this.scissor); renderer.setScissorTest(scissorTest);
    }
  }
  public dispose(): void {
    this.surface.material = this.originalMaterial; this.material.dispose(); this.renderTarget.dispose();
  }
}
