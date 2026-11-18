import { WebGLRenderer, SRGBColorSpace, ACESFilmicToneMapping, PCFSoftShadowMap } from 'three';
import { VISUAL_ENVIRONMENT as V } from '../world/environment/VisualEnvironmentConfig';
export function createGameRenderer(surface?: {canvas: OffscreenCanvas; width:number; height:number; dpr:number}): WebGLRenderer {
    const renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      canvas: surface?.canvas,
    });
    if (!surface) { renderer.domElement.className = 'webgl'; renderer.domElement.tabIndex = 0; }
    // The driver glass uses a belt-plane clip to stay inside the door slot.
    renderer.localClippingEnabled = true;
    renderer.setPixelRatio(Math.min(surface?.dpr ?? window.devicePixelRatio, 1.6));
    renderer.setSize(surface?.width ?? window.innerWidth, surface?.height ?? window.innerHeight, !surface);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = V.exposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    return renderer;
}

