import { DataTexture, LinearFilter, RGBAFormat } from 'three';

/** Angular luminous-intensity approximation, not an OEM photometric data set.
 * UV +Y points above the optical axis. Low beam has a flat left cutoff and a
 * small right-hand-traffic shoulder rise; the main beam has a narrow hot spot.
 * Projecting light (rather than a ground decal) also illuminates real surfaces. */
export function createHeadlampBeamTexture(high: boolean): DataTexture {
  const size = 256, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + .5) / size * 2 - 1, v = (y + .5) / size * 2 - 1;
    let intensity: number;
    if (high) {
      intensity = Math.exp(-((u / .34) ** 2 + (v / .20) ** 2) * 1.3) * .82 +
        .16 * Math.exp(-((u / .70) ** 2 + (v / .46) ** 2) * 1.8);
    } else {
      const cutoff = .065 * Math.min(1, Math.max(0, (u - .02) / .22));
      const edge = Math.min(1, Math.max(0, (cutoff - v) / .012 + .5));
      const hot = Math.exp(-((u / .26) ** 2 + ((v + .035) / .115) ** 2) * 1.2);
      const spread = .23 * Math.exp(-((u / .85) ** 2 + ((v + .18) / .32) ** 2) * 1.4);
      intensity = (hot * .74 + spread) * edge;
    }
    const offset = (y * size + x) * 4, value = Math.round(Math.min(1, intensity) * 255);
    data[offset] = data[offset + 1] = data[offset + 2] = value; data[offset + 3] = 255;
  }
  const texture = new DataTexture(data, size, size, RGBAFormat);
  texture.name = high ? 'LED main-beam angular distribution' : 'LED dipped-beam cutoff RHT';
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
