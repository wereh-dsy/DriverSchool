import * as T from 'three';
import { cabinAmbientTarget } from './CabinLightResponse';
import { tankRibbon } from './Tank500BodyGeometry';
import type { InstrumentTelemetry } from './InstrumentCluster';
import type { VehicleVisualConfig, Vector3Tuple as P } from './VehicleVisualConfig';

/** One diffusion texture and four unshadowed, short-range cabin lights. */
export class Tank500CabinLighting {
  public readonly ambient: T.MeshBasicMaterial;
  private readonly courtesy: T.PointLight;
  private readonly footwells: T.PointLight[] = [];
  private readonly dashboard: T.PointLight;
  private intensity = 0;
  private age = 10;
  private wasOn = false;
  private readonly targetColor = new T.Color();
  public constructor(root: T.Group, private readonly c: VehicleVisualConfig) {
    const pixels = new Uint8Array(8 * 32 * 4);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 8; x++) {
      const at = (y * 8 + x) * 4, value = Math.round(Math.exp(-(((y / 31 - .5) / .20) ** 2)) * 255);
      pixels[at] = pixels[at + 1] = pixels[at + 2] = 255; pixels[at + 3] = value;
    }
    const texture = new T.DataTexture(pixels, 8, 32, T.RGBAFormat); texture.name = 'Tank ambient optical diffusion'; texture.needsUpdate = true;
    texture.minFilter = texture.magFilter = T.LinearFilter;
    this.ambient = new T.MeshBasicMaterial({ map: texture, color: c.interiorAmbientLighting?.color ?? 0xd6ab6b,
      transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: T.DoubleSide });
    const strip = (name: string, points: P[]) => { const node = tankRibbon(name, points, .010, this.ambient); node.castShadow = node.receiveShadow = false; root.add(node); };
    strip('Tank dashboard ambient ribbon', [[-.84, 1.151, -.466], [-.25, 1.151, -.466], [.10, 1.151, -.466], [.84, 1.151, -.466]]);
    for (const side of [-1, 1]) {
      strip(side < 0 ? 'Tank driver door ambient ribbon' : 'Tank passenger ambient ribbon', [[side * .830, 1.151, -.88], [side * .830, 1.151, -.25], [side * .830, 1.151, .27]]);
      const light = new T.PointLight(0xd6b67d, 0, 1.25, 2); light.name = 'Tank restrained footwell fill'; light.position.set(side * .43, .76, -.40); root.add(light); this.footwells.push(light);
    }
    this.dashboard = new T.PointLight(0xe0b879, 0, 1.6, 2); this.dashboard.name = 'Tank ambient dashboard spill';
    this.dashboard.position.set(.02, 1.40, -.30); root.add(this.dashboard);
    this.courtesy = new T.PointLight(0xffe0b2, 0, 1.9, 2); this.courtesy.name = 'Tank door courtesy illumination';
    this.courtesy.position.set(-.52, 1.70, -.10); root.add(this.courtesy);
  }
  public update(t: InstrumentTelemetry, dt: number): void {
    const on = t.ignitionOn ?? true, day = T.MathUtils.clamp(t.ambientDaylight ?? 1, 0, 1);
    if (on && !this.wasOn) this.age = 0; this.age += dt; this.wasOn = on;
    const lamps = !!(t.indicators?.headlights || t.indicators?.positionLights || t.indicators?.highBeam);
    const p = this.c.interiorAmbientLighting!;
    this.intensity = T.MathUtils.damp(this.intensity, cabinAmbientTarget(p, on, lamps, day), p.fadeResponse, dt);
    const welcome = on && this.age < 1.8 ? .20 * Math.sin(this.age / 1.8 * Math.PI) * (1 - day) : 0;
    this.ambient.opacity = Math.min(.88, (this.intensity + welcome) * 2.4);
    this.targetColor.set(t.driveMode === 'SPORT' ? 0xda8a5d : p.color); this.ambient.color.lerp(this.targetColor, 1 - Math.exp(-dt * 2.5));
    for (const light of this.footwells) light.intensity = this.intensity * p.footwellIntensity * 12;
    this.dashboard.intensity = this.intensity * (p.dashboardFillIntensity ?? 0) * 12;
    const door = t.driverAccess?.doorOpen ?? 0;
    this.courtesy.intensity = T.MathUtils.damp(this.courtesy.intensity, door * 1.1 * (1 - day * .85), 6, dt);
  }
}
