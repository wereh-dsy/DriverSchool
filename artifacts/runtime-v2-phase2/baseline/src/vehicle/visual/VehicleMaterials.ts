import { DoubleSide, MeshPhysicalMaterial, type ColorRepresentation, type MeshPhysicalMaterialParameters } from 'three';

/** Shared finish calibration. Body colors and glazing opacity remain authored. */
export function vehiclePaint(color: ColorRepresentation, options: MeshPhysicalMaterialParameters = {}): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({ color, metalness: .38, roughness: .32,
    clearcoat: .55, clearcoatRoughness: .22, specularIntensity: .8, ...options });
}

export function vehicleGlass(color: ColorRepresentation, opacity: number,
  options: MeshPhysicalMaterialParameters = {}): MeshPhysicalMaterial {
  // Physical BRDF supplies angle-dependent Fresnel. Alpha glazing avoids the
  // transmission render target and keeps the existing panes and render layers.
  return new MeshPhysicalMaterial({ color, opacity, transparent: true,
    roughness: .13, metalness: 0, clearcoat: .25, clearcoatRoughness: .16,
    specularIntensity: .55, transmission: 0, depthWrite: false, side: DoubleSide, ...options });
}
