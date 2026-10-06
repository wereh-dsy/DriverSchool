import {
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  Texture,
  WebGLRenderer,
} from 'three';
import { writeMirrorApertureUvs } from '../camera/MirrorMath';
import type { MirrorView } from '../camera/MirrorSystem';

/** Draws an existing mirror render-target texture into a HUD viewport. */
export class MirrorOverlayRenderer {
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 2);
  private readonly geometry = new PlaneGeometry(2, 2);
  private readonly material: MeshBasicMaterial;
  private view: MirrorView | null = null;

  constructor(texture: Texture) {
    // The mirror pass is already rendered through the active tone mapper.
    // Applying it again here crushed grass/asphalt into an almost uniform
    // grey panel, so the HUD only performs the final output-colour conversion.
    this.material = new MeshBasicMaterial({ map: texture, toneMapped: false });
    this.material.color.setRGB(1.12, 1.12, 1.12);
    const quad = new Mesh(this.geometry, this.material);
    quad.position.z = -1;
    this.scene.add(quad);
  }

  setTexture(texture: Texture): void {
    if (this.material.map === texture) return;
    this.material.map = texture;
    this.material.needsUpdate = true;
  }

  /** Reuses the physical mirror target and its aperture mapping, not a rear camera. */
  setView(view: MirrorView): void {
    this.view = view;
    this.setTexture(view.texture);
  }

  render(renderer: WebGLRenderer, domRect: DOMRect): void {
    if (this.view !== null && this.view.valid) {
      const uv = this.geometry.getAttribute('uv');
      writeMirrorApertureUvs(this.view.worldCorners, this.view.textureMatrix, uv.array as Float32Array);
      uv.needsUpdate = true;
    }
    const canvasRect = renderer.domElement.getBoundingClientRect();
    const x = Math.max(0, domRect.left - canvasRect.left);
    const y = Math.max(0, canvasRect.bottom - domRect.bottom);
    const width = Math.min(domRect.width, canvasRect.width - x);
    const height = Math.min(domRect.height, canvasRect.height - y);
    if (width <= 1 || height <= 1) return;

    renderer.setScissorTest(true);
    renderer.setViewport(x, y, width, height);
    renderer.setScissor(x, y, width, height);
    renderer.clear(true, true, true);
    renderer.render(this.scene, this.camera);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, canvasRect.width, canvasRect.height);
  }

  dispose(): void {
    this.material.map = null;
    this.geometry.dispose();
    this.material.dispose();
  }
}
