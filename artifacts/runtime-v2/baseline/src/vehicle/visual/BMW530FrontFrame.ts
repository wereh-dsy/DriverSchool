import { sideGlassX } from './BMW530Geometry';
import type { Vector3Tuple as P } from './VehicleVisualConfig';

/** One set of front aperture datums shared by glass, body structure and cabin trim. */
export function bmwWindshieldPoint(u: number, v: number): P {
  const x = (v * 2 - 1) * (.83 - .148 * u);
  const crown = .035 * (1 - (v * 2 - 1) ** 2) * Math.sin(u * Math.PI);
  return [x, .94 + .495 * u + crown * .3 - .022 * u * (x / .7) ** 2, -.945 + .635 * u - crown];
}
export function bmwFrontWindowCorners(sign: number): P[] {
  return [[-.875,.948],[-.32,1.411],[.39,1.45],[.412,.947]].map(([z,y]) => [sign*sideGlassX(y!),y!,z!]);
}
export function bmwFrontWindowLeadingPoint(sign: number, u: number): P {
  const y = .948 + .463 * u; return [sign * sideGlassX(y), y, -.875 + .555 * u];
}
export function bmwAPillarRing(sign: number, u: number, interior: boolean): P[] {
  const a = bmwWindshieldPoint(u, sign < 0 ? 0 : 1), b = bmwFrontWindowLeadingPoint(sign, u);
  const aw = Math.abs(a[0]), bw = Math.abs(b[0]);
  if (interior) return [
    [sign*(aw-.010),a[1]+.002,a[2]+.005], [sign*(aw-.028),a[1]+.012,a[2]+.020],
    [sign*((aw+bw)/2-.025),(a[1]+b[1])/2+.014,(a[2]+b[2])/2+.022],
    [sign*(bw-.021),b[1]+.011,b[2]+.012], [sign*(bw-.004),b[1]+.002,b[2]+.005],
    [sign*((aw+bw)/2+.002),(a[1]+b[1])/2-.009,(a[2]+b[2])/2-.008],
  ];
  return [[sign*(aw+.012),a[1]-.014,a[2]-.014], [sign*(aw-.011),a[1]-.006,a[2]-.004],
    [sign*(aw-.015),a[1]+.012,a[2]+.013], [sign*(bw-.013),b[1]+.012,b[2]+.012],
    [sign*(bw+.012),b[1]-.004,b[2]+.004], [sign*(bw+.021),b[1]-.014,b[2]-.013]];
}
