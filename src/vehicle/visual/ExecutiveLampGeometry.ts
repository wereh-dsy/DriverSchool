import * as T from 'three';
import type { VehicleVisualConfig } from './VehicleVisualConfig';
import { executiveUV } from './ExecutiveExteriorSurfaces';

// Optical surfaces only. Lamp state, sequencing and real beams stay in VehicleLighting.
export const executiveDRLHeight = (u: number): number => .720 + .005 * u + .047 * Math.max(0, (u - .62) / .38) ** 1.25;
export const executiveTurnHeight = (u: number): number => .773 + .018 * u;

export function executiveLampHousing(config: VehicleVisualConfig, side: number, front: boolean): T.BufferGeometry {
  const points = front
    ? [[.390, .736], [.417, .769], [.861, .812], [.892, .790], [.843, .716], [.476, .707]]
    : [[.395, .722], [.432, .789], [.865, .804], [.898, .759], [.860, .686], [.805, .721]];
  const shape = new T.Shape();
  points.forEach(([x, y], i) => i ? shape.lineTo(side * x!, y!) : shape.moveTo(side * x!, y!)); shape.closePath();
  const geometry = new T.ShapeGeometry(shape), p = geometry.getAttribute('position');
  const u: number[] = [], v: number[] = [];
  for (let i = 0; i < p.count; i++) {
    u.push((Math.abs(p.getX(i)) - .39) / .51);
    v.push((p.getY(i) - (front ? .70 : .68)) / (front ? .115 : .13));
  }
  executiveUV(geometry, front ? 'front-lamp' : 'rear-lamp', u, v);
  if (front) { const index = geometry.getIndex()!; for (let i = 0; i < index.count; i += 3) {
    const b = index.getX(i + 1); index.setX(i + 1, index.getX(i + 2)); index.setX(i + 2, b);
  } }
  const halfLength = (config.dimensions.length - .0226) / 2;
  geometry.translate(0, 0, front ? -halfLength - .006 : halfLength + .008);
  geometry.computeVertexNormals(); return geometry;
}

/** All fins, lower guide and outer return share one mesh/material on each side. */
export function executiveTailSignature(side: number): T.BufferGeometry {
  const positions: number[] = [], indices: number[] = [];
  const originX = side * .624, originY = .7344;
  const strip = (x0: number, y0: number, x1: number, y1: number, width: number) => {
    const dx = side * (x1 - x0), dy = y1 - y0, length = Math.hypot(dx, dy);
    const nx = -dy / length * width / 2, ny = dx / length * width / 2, base = positions.length / 3;
    for (const [x, y] of [[side * x0 - nx, y0 - ny], [side * x1 - nx, y1 - ny],
      [side * x1 + nx, y1 + ny], [side * x0 + nx, y0 + ny]]) positions.push(x! - originX, y! - originY, 0);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  strip(.400, .732, .680, .735, .010);
  strip(.680, .735, .860, .751, .010);
  strip(.860, .751, .840, .694, .014);
  for (let i = 0; i < 6; i++) strip(.468 + i * .061, .775 + i * .0015, .509 + i * .061, .779 + i * .0015, .013);
  const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}
