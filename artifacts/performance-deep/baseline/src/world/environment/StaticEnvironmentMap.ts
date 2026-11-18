import {
  Color, DataTexture, EquirectangularReflectionMapping, FloatType, PMREMGenerator,
  RGBAFormat, type WebGLRenderer, type WebGLRenderTarget,
} from 'three';
import { VISUAL_ENVIRONMENT as V } from './VisualEnvironmentConfig';

/** One small, neutral outdoor IBL per renderer lifetime. No scene capture or IO. */
export function createStaticEnvironmentMap(renderer: WebGLRenderer): WebGLRenderTarget {
  const width = 512, height = 256;
  const pixels = new Float32Array(width * height * 4);
  const top = new Color(V.skyTop), horizon = new Color(V.skyHorizon), ground = new Color(V.skyGround);
  const color = new Color();
  for (let y = 0; y < height; y++) {
    // DataTexture rows run from v=0 (ground) to v=1 (zenith), with flipY=false.
    const elevation = -Math.cos(Math.PI * (y + .5) / height);
    for (let x = 0; x < width; x++) {
      const azimuth = 2 * Math.PI * (x + .5) / width;
      // Soft skyline variation gives broad reflections without pretending to
      // reflect the loaded map. No sharp sun disc or bright studio panels.
      const skyline = .06 + .035 * Math.sin(azimuth * 7) + .025 * Math.sin(azimuth * 13);
      if (elevation >= skyline) color.copy(horizon).lerp(top, Math.min(1, (elevation - skyline) * 1.4));
      else color.copy(ground).lerp(horizon, Math.max(0, 1 - (skyline - elevation) * 4)).multiplyScalar(.7);
      const i = (y * width + x) * 4;
      pixels[i] = color.r; pixels[i + 1] = color.g; pixels[i + 2] = color.b; pixels[i + 3] = 1;
    }
  }
  const source = new DataTexture(pixels, width, height, RGBAFormat, FloatType);
  source.mapping = EquirectangularReflectionMapping;
  source.needsUpdate = true;
  const generator = new PMREMGenerator(renderer);
  try { return generator.fromEquirectangular(source); }
  finally { source.dispose(); generator.dispose(); }
}
