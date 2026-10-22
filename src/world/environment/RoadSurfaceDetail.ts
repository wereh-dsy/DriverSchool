import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, type MeshStandardMaterial } from 'three';
import { VISUAL_ENVIRONMENT as V } from './VisualEnvironmentConfig';

/** Packed linear data: R albedo, G roughness, B micro relief. Generated once
 * per shared material, mipmapped and sampled once per fragment, with no UV or
 * geometry changes. The map property keeps upload/disposal ownership explicit. */
export function roadSurfaceDetail<T extends MeshStandardMaterial>(material: T, marking = false): T {
  const size = marking ? 128 : 512;
  const pixels = new Uint8Array(size * size * 4);
  let seed = 731;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const grain = seed / 4294967296;
    const u = x / size * Math.PI * 2, v = y / size * Math.PI * 2;
    const broad = Math.sin(u + Math.sin(v)) * Math.cos(v * 2 - .7);
    // A restrained, seamless resurfacing scar occupies only a small tile area.
    const patch = Math.max(0, Math.cos(u - .8) * Math.cos(v + 1.3) - .88) / .12;
    const i = (y * size + x) * 4;
    pixels[i] = Math.round(marking ? 242 + broad * 5 - grain * 14 : 242 + broad * 7 - grain * 8 - patch * 10);
    pixels[i + 1] = Math.round(marking ? 237 + grain * 18 : 238 + broad * 5 + grain * 12);
    pixels[i + 2] = Math.round(grain * 255);
    pixels[i + 3] = 255;
  }
  const texture = new DataTexture(pixels, size, size);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter; texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.anisotropy = 4; texture.needsUpdate = true;
  material.map = texture;
  material.addEventListener('dispose', () => texture.dispose());
  if (marking) material.userData.roadMarking = true;
  material.customProgramCacheKey = () => marking ? 'road-paint-detail-v1' : 'asphalt-detail-v1';
  material.onBeforeCompile = shader => {
    shader.uniforms.surfaceBumpScale = { value: marking ? 0 : V.roadBumpScale };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vSurfaceXZ;')
      .replace('#include <project_vertex>', `
        #include <project_vertex>
        vec4 surfacePosition = vec4(transformed, 1.0);
        #ifdef USE_BATCHING
          surfacePosition = batchingMatrix * surfacePosition;
        #endif
        #ifdef USE_INSTANCING
          surfacePosition = instanceMatrix * surfacePosition;
        #endif
        vSurfaceXZ = (modelMatrix * surfacePosition).xz;
      `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
      '#include <common>\nvarying vec2 vSurfaceXZ;\nuniform float surfaceBumpScale;')
      .replace('#include <map_fragment>', `
        vec3 surfaceDetail = texture2D(map, vSurfaceXZ / ${marking ? '3.0' : '12.0'}).rgb;
        diffuseColor.rgb *= surfaceDetail.rrr;
      `)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * surfaceDetail.g;');
    if (!marking) shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
      #include <normal_fragment_maps>
      float relief = surfaceDetail.b * surfaceBumpScale * (1.0 - smoothstep(25.0, 85.0, length(vViewPosition)));
      vec3 sx = normalize(dFdx(-vViewPosition)), sy = normalize(dFdy(-vViewPosition));
      vec3 rx = cross(sy, normal), ry = cross(normal, sx);
      float determinant = dot(sx, rx) * faceDirection;
      normal = normalize(abs(determinant) * normal - sign(determinant) * (dFdx(relief) * rx + dFdy(relief) * ry));
    `);
  };
  return material;
}
