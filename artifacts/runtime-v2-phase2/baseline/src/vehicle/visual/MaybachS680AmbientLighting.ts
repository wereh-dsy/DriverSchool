import * as T from 'three';
import { cabinAmbientTarget } from './CabinLightResponse';
import type { InstrumentTelemetry } from './InstrumentCluster';
import type { InteriorAmbientLightingProfile } from './LuxuryVisualProfile';
import type { Vector3Tuple as P } from './VehicleVisualConfig';

export type MaybachAmbientZone = 'active' | 'direct' | 'indirect' | 'accent';
export const MAYBACH_AMBIENT_ZONES: readonly MaybachAmbientZone[] = ['active', 'direct', 'indirect', 'accent'];
export const MAYBACH_AMBIENT_ZONE_NAMES = ['主动灯带', '直接照明', '间接照明', '重点照明'];
/** Sixty-four selectable hues; OEM theme colours below remain engineering approximations. */
export const MAYBACH_AMBIENT_PALETTE = Array.from({length: 64}, (_, n) =>
  new T.Color().setHSL(n / 64, .64, .65).getHex());

/** Instance-owned HMI settings. No physical vehicle state is stored here. */
export class MaybachAmbientSettings {
  public theme: 'rose-gold' | 'amethyst' = 'amethyst';
  public selectedColor: number | null = null;
  public brightness = .78;
  public readonly zones: Record<MaybachAmbientZone, boolean> = {active: true, direct: true, indirect: true, accent: true};
  public selectTheme(theme: MaybachAmbientSettings['theme']): void { this.theme = theme; this.selectedColor = null; }
}

/** Surface-mounted optical ribbons. All geometry follows explicit sampled trim
 * datums: no spline overshoot, duplicate tubes or depth-disabled fake glow. */
export class MaybachS680AmbientLighting {
  private readonly texture: T.DataTexture;
  private readonly materials: Record<MaybachAmbientZone, T.MeshBasicMaterial>;
  private readonly upper = new T.Color(0xae8de6);
  private readonly lower = new T.Color(0xddb98e);
  private readonly targetUpper = new T.Color();
  private readonly targetLower = new T.Color();
  private readonly warmWhite = new T.Color(0xf1d2ae);
  private readonly sportTint = new T.Color(0xe3a18e);
  private readonly spills: {light: T.PointLight; zone: MaybachAmbientZone; maximum: number}[] = [];
  private readonly activeBands: T.Mesh<T.BufferGeometry, T.MeshBasicMaterial>[] = [];
  private age = Infinity;
  private modeAge = Infinity;
  private wasOn = false;
  private mode = '';
  private elapsed = 0;
  private level = 0;
  private waveWasActive = false;

  public constructor(public readonly settings: MaybachAmbientSettings, private readonly profile: InteriorAmbientLightingProfile) {
    const width = 256, height = 32, pixels = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const v = (y + .5) / height * 2 - 1, edge = Math.max(0, 1 - Math.abs(v) ** 6);
      const alpha = (.64 * Math.exp(-((v / .45) ** 2)) + .36 * Math.exp(-((v / .12) ** 2))) * edge;
      const offset = (y * width + x) * 4;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 255; pixels[offset + 3] = Math.round(alpha * 255);
    }
    this.texture = new T.DataTexture(pixels, width, height, T.RGBAFormat);
    this.texture.name = 'Maybach optical-fibre diffusion profile';
    this.texture.magFilter = this.texture.minFilter = T.LinearFilter; this.texture.needsUpdate = true;
    const material = () => new T.MeshBasicMaterial({map: this.texture, transparent: true, depthWrite: false,
      depthTest: true, blending: T.AdditiveBlending, side: T.DoubleSide, toneMapped: false, vertexColors: true, opacity: 0});
    this.materials = {active: material(), direct: material(), indirect: material(), accent: material()};
  }

  public ribbon(name: string, points: readonly P[], zone: MaybachAmbientZone, width: number,
    across: P | ((progress: number) => P) = [0, 1, 0], routeStart = 0, routeEnd = 1): T.Mesh {
    const positions: number[] = [], uv: number[] = [], colors: number[] = [], indices: number[] = [];
    const count = points.length;
    for (let n = 0; n < count; n++) for (const edge of [-.5, .5]) {
      const p = points[n]!, direction = typeof across === 'function' ? across(n / (count - 1)) : across;
      positions.push(p[0] + direction[0] * width * edge, p[1] + direction[1] * width * edge, p[2] + direction[2] * width * edge);
      uv.push(T.MathUtils.lerp(routeStart, routeEnd, n / (count - 1)), edge + .5); colors.push(1, 1, 1);
      if (n < count - 1 && edge < 0) { const a = n * 2; indices.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3)); geometry.setIndex(indices);
    geometry.computeVertexNormals(); geometry.computeBoundingSphere();
    const strip = new T.Mesh(geometry, this.materials[zone]); strip.name = name;
    strip.userData.maybachAmbientZone = zone; strip.userData.maybachAmbientWidth = width;
    strip.castShadow = false; strip.renderOrder = 2;
    if (zone === 'active') this.activeBands.push(strip);
    return strip;
  }

  public spill(light: T.PointLight, zone: MaybachAmbientZone, maximum: number): void { this.spills.push({light, zone, maximum}); }

  public update(t: InstrumentTelemetry, dt: number): void {
    const on = t.ignitionOn ?? t.engineRunning ?? true, day = t.ambientDaylight ?? 1;
    if (on && !this.wasOn) this.age = 0;
    if (this.mode && this.mode !== t.driveMode) this.modeAge = 0;
    this.mode = t.driveMode ?? ''; this.wasOn = on;
    this.age = on ? this.age + dt : Infinity; this.modeAge += dt;
    const welcome = this.age < 2.8 ? Math.sin(Math.PI * this.age / 2.8) * .22 * (1 - day * .65) : 0;
    this.level = T.MathUtils.damp(this.level, Math.max(welcome, cabinAmbientTarget(this.profile, on, true, day)) * this.settings.brightness, this.profile.fadeResponse, dt);
    if (this.settings.selectedColor === null) {
      this.targetUpper.set(this.settings.theme === 'rose-gold' ? 0xe5bc9f : 0xa889e6);
      this.targetLower.set(this.settings.theme === 'rose-gold' ? 0xe9dfce : 0xdcb28a);
    } else {
      this.targetUpper.set(MAYBACH_AMBIENT_PALETTE[this.settings.selectedColor]!);
      this.targetLower.copy(this.targetUpper).lerp(this.warmWhite, .32);
    }
    this.upper.lerp(this.targetUpper, 1 - Math.exp(-dt * 3)); this.lower.lerp(this.targetLower, 1 - Math.exp(-dt * 3));
    for (const zone of MAYBACH_AMBIENT_ZONES) {
      const material = this.materials[zone];
      material.opacity = this.settings.zones[zone] ? this.level * (zone === 'active' ? 3.1 : zone === 'accent' ? 1.6 : 2.0) : 0;
      material.color.copy(zone === 'active' ? this.upper : this.lower);
    }
    for (const {light, zone, maximum} of this.spills) {
      light.color.copy(zone === 'active' || zone === 'indirect' ? this.upper : this.lower);
      light.intensity = this.settings.zones[zone] ? maximum * this.level / this.profile.nightIntensity : 0;
    }
    // Only the short welcome/mode wave updates vertex colour. Steady cruising
    // keeps one static texture and does not upload an animation every frame.
    this.elapsed += dt;
    if (this.elapsed < .05) return; this.elapsed = 0;
    const age = Math.min(this.age, this.modeAge), wave = age < 2.8 ? age / 2.8 : -1;
    if (wave < 0 && !this.waveWasActive) return;
    this.waveWasActive = wave >= 0;
    const tint = t.driveMode === 'SPORT' ? this.sportTint : this.lower;
    for (const strip of this.activeBands) {
      const uv = strip.geometry.getAttribute('uv'), color = strip.geometry.getAttribute('color');
      for (let n = 0; n < color.count; n++) {
        const amount = wave < 0 ? 0 : .55 * Math.exp(-(((uv.getX(n) - wave) / .12) ** 2)) * Math.sin(Math.PI * age / 2.8);
        color.setXYZ(n, 1 + (tint.r - 1) * amount, 1 + (tint.g - 1) * amount, 1 + (tint.b - 1) * amount);
      }
      color.needsUpdate = true;
    }
  }
}
