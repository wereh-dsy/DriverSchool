import {
  BufferGeometry, Color, DynamicDrawUsage, Float32BufferAttribute, Fog,
  InstancedMesh, LineBasicMaterial, LineSegments, Matrix4, Mesh,
  MeshStandardMaterial, PointLight, Vector3,
} from 'three';
import type { DirectionalLight, HemisphereLight, Object3D, Scene, ShaderMaterial } from 'three';
import type { EnvironmentTime, WeatherSystem } from './WeatherSystem';
import type { DrivingGround } from '../DrivingGround';

interface SurfaceMaterialState {
  material: MeshStandardMaterial;
  color: Color;
  roughness: number;
  metalness: number;
  references: number;
  /** Road paint gets a much smaller treatment than the carriageway. */
  marking: boolean;
}

interface TimePalette {
  readonly top: number; readonly horizon: number; readonly ground: number;
  readonly haze: number; readonly sun: number; readonly hemiSky: number; readonly hemiGround: number;
}

const TIME_PALETTES: Readonly<Record<EnvironmentTime, TimePalette>> = {
  DAY: { top: 0x6f9fb0, horizon: 0xd4d8cf, ground: 0x8e9c84, haze: 0xaebfc0, sun: 0xfff1cf, hemiSky: 0xd9edf2, hemiGround: 0x52613e },
  DUSK: { top: 0x354963, horizon: 0x946951, ground: 0x434741, haze: 0x625b5c, sun: 0xffad72, hemiSky: 0xd9edf2, hemiGround: 0x52613e },
  NIGHT: { top: 0x040913, horizon: 0x111b2b, ground: 0x080f16, haze: 0x0c1420, sun: 0x9cb5d5, hemiSky: 0x7d93b5, hemiGround: 0x52613e },
};

/** Overcast targets stay dark at night so weather never overrides day/night. */
const OVERCAST_TINTS: Readonly<Record<EnvironmentTime, { top: number; horizon: number; ground: number; haze: number; sun: number }>> = {
  DAY: { top: 0x7d878d, horizon: 0xb0b4b2, ground: 0x79807a, haze: 0x9fa8a8, sun: 0xb9c4cc },
  DUSK: { top: 0x4a5158, horizon: 0x8a8078, ground: 0x3d423d, haze: 0x6c6664, sun: 0x8b7f7a },
  NIGHT: { top: 0x0b1118, horizon: 0x151d26, ground: 0x0a1015, haze: 0x121b24, sun: 0x3a4a5e },
};

const FLASH_COLOR = new Color(0xdce8ff);
const RAIN_TOP = new Color(0x4d5861);
const RAIN_HORIZON = new Color(0x8a9498);
const RAIN_GROUND = new Color(0x555e5b);
const MAX_RAIN_DROPS = 1_200;
const RAIN_SPREAD = 28;

const clamp = (value: number): number => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

/** Shared material edits, one camera-local rain draw, and a bounded street-light pool.
 * All per-frame work is scalar or material-uniform sized; no map traversal happens here.
 */
export class EnvironmentVisual {
  private readonly materials = new Map<MeshStandardMaterial, SurfaceMaterialState>();
  private meshMaterials = new WeakMap<Mesh, MeshStandardMaterial[]>();
  private observedMeshes = new WeakSet<Mesh>();
  private readonly lampMaterials: MeshStandardMaterial[] = [];
  private readonly lampGlowCache = new Map<MeshStandardMaterial, MeshStandardMaterial>();
  private readonly lampMeshes: { mesh: Mesh; original: MeshStandardMaterial; positions: Vector3[] }[] = [];
  private readonly lampPositions: Vector3[] = [];
  private readonly lamps = Array.from({ length: 6 }, () => {
    const lamp = new PointLight(0xffe4b3, 0, 32, 1.5);
    lamp.castShadow = false;
    return lamp;
  });
  private readonly selectedLamps = new Int32Array(6);
  private readonly rainGeometry = new BufferGeometry();
  private readonly rainMaterial = new LineBasicMaterial({
    color: 0xc8d9e3, transparent: true, opacity: 0.38, depthWrite: false,
  });
  private readonly rain = new LineSegments(this.rainGeometry, this.rainMaterial);
  private readonly drops = new Float32Array(MAX_RAIN_DROPS * 3);
  private readonly positions = new Float32BufferAttribute(new Float32Array(MAX_RAIN_DROPS * 6), 3);
  private rainElapsed = 0;
  private lampElapsed = 1;
  private readonly previousEye = new Vector3();
  private hasEye = false;

  // Reused colors: weather transitions must not allocate per frame.
  private readonly skyTop = new Color();
  private readonly skyHorizon = new Color();
  private readonly skyGround = new Color();
  private readonly haze = new Color();
  private readonly sunColor = new Color();
  private readonly hemiSky = new Color();
  private readonly hemiGround = new Color();
  private readonly tint = new Color();
  private appliedWetness = -1;
  private lastCloud = -1;
  private lastRain = -1;
  private lastFog = -1;
  private lastStorm = -1;
  private lastFlash = -1;
  private lastTime: EnvironmentTime | null = null;

  public constructor(
    private readonly scene: Scene,
    private readonly state: WeatherSystem,
    private readonly sun: DirectionalLight,
    private readonly hemisphere: HemisphereLight,
    private readonly sky: ShaderMaterial,
    private readonly setExposure?: (value: number) => void,
  ) {
    this.positions.setUsage(DynamicDrawUsage);
    this.rainGeometry.setAttribute('position', this.positions);
    this.rainGeometry.setDrawRange(0, 0);
    this.rain.visible = false;
    this.rain.frustumCulled = false;
    this.rain.name = 'Camera-local rainfall';
    for (let i = 0; i < MAX_RAIN_DROPS; i++) this.resetDrop(i);
    scene.add(this.rain, ...this.lamps);
  }

  public setGround(ground: Pick<DrivingGround, 'root'>): void {
    this.restoreMaterials();
    this.meshMaterials = new WeakMap(); this.observedMeshes = new WeakSet();
    this.lampPositions.length = 0;
    this.releaseLamps(false);
    this.addVisualRoot(ground.root);
  }

  public addVisualRoot(root: Object3D): void {
    const matrix = new Matrix4();
    root.updateWorldMatrix(true, true);
    root.traverse(object => {
      if (!(object instanceof Mesh) || this.observedMeshes.has(object)) return;
      this.observedMeshes.add(object);
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const registered: MeshStandardMaterial[] = [];
      for (const material of materials) {
        if (!(material instanceof MeshStandardMaterial) || registered.includes(material)) continue;
        const wetRoad = material.userData.wetRoad === true;
        // Road paint shares one material per map; a bounded registry avoids clones.
        const marking = !wetRoad && (material.polygonOffset === true || material.userData.roadMarking === true);
        if (!wetRoad && !marking) continue;
        registered.push(material);
        let state = this.materials.get(material);
        if (!state) {
          state = {
            material, color: material.color.clone(), roughness: material.roughness,
            metalness: material.metalness, references: 0, marking,
          };
          this.materials.set(material, state);
        }
        state.references++;
        this.applyMaterial(state, this.appliedWetness < 0 ? this.state.wetness : this.appliedWetness);
      }
      this.meshMaterials.set(object, registered);
      if (object.userData.environmentLamp !== true || !(object.material instanceof MeshStandardMaterial)) return;
      let glow = this.lampGlowCache.get(object.material);
      if (!glow) { glow = object.material.clone(); glow.emissive.set(0xffdf9d); this.lampGlowCache.set(object.material, glow); }
      const positions: Vector3[] = [];
      this.lampMeshes.push({ mesh: object, original: object.material, positions });
      object.material = glow;
      if (!this.lampMaterials.includes(glow)) this.lampMaterials.push(glow);
      if (object instanceof InstancedMesh) {
        for (let i = 0; i < object.count; i++) {
          object.getMatrixAt(i, matrix);
          const position = new Vector3().setFromMatrixPosition(matrix).applyMatrix4(object.matrixWorld);
          positions.push(position); this.lampPositions.push(position);
        }
      } else { const position = object.getWorldPosition(new Vector3()); positions.push(position); this.lampPositions.push(position); }
    });
    for (const [original, glow] of this.lampGlowCache) if (!this.lampMaterials.includes(glow)) { glow.dispose(); this.lampGlowCache.delete(original); }
    this.lampElapsed = 1;
    this.applyState();
  }

  public removeVisualRoot(root: Object3D): void {
    root.traverse(object => {
      if (!(object instanceof Mesh) || !this.observedMeshes.delete(object)) return;
      for (const material of this.meshMaterials.get(object) ?? []) {
        const state = this.materials.get(material);
        if (!state) continue;
        if (--state.references === 0) { this.restoreMaterial(state); this.materials.delete(material); }
      }
      this.meshMaterials.delete(object);
      const index = this.lampMeshes.findIndex(entry => entry.mesh === object);
      if (index >= 0) { object.material = this.lampMeshes[index]!.original; this.lampMeshes.splice(index, 1); }
    });
    this.lampPositions.length = 0; this.lampMaterials.length = 0;
    for (const entry of this.lampMeshes) {
      this.lampPositions.push(...entry.positions);
      const glow = entry.mesh.material as MeshStandardMaterial;
      if (!this.lampMaterials.includes(glow)) this.lampMaterials.push(glow);
    }
    for (const [original, glow] of this.lampGlowCache) if (!this.lampMaterials.includes(glow)) { glow.dispose(); this.lampGlowCache.delete(original); }
    this.lampElapsed = 1;
  }

  /** Immediate full re-apply for tests, map publication and settings changes. */
  public applyState(): void {
    this.applyLighting();
    this.applySurface(true);
    this.lampElapsed = 1;
  }

  public update(dt: number, eye: Vector3): void {
    this.updateRain(dt, eye);
    this.updateLamps(dt, eye);
    const cloud = this.state.cloudiness, rain = this.state.rainIntensity;
    const fog = this.state.fogIntensity, storm = this.state.stormIntensity;
    const flash = this.state.lightningFlash;
    const flashDirty = flash !== this.lastFlash && (flash > 0 || this.lastFlash > 0);
    const dirtyLight = this.lastTime !== this.state.time ||
      Math.abs(cloud - this.lastCloud) > .0005 || Math.abs(rain - this.lastRain) > .0005 ||
      Math.abs(fog - this.lastFog) > .0005 || Math.abs(storm - this.lastStorm) > .0005 || flashDirty;
    if (dirtyLight) this.applyLighting();
    if (Math.abs(this.state.wetness - this.appliedWetness) > .002) this.applySurface(false);
  }

  public dispose(): void {
    this.rain.removeFromParent();
    this.rainGeometry.dispose();
    this.rainMaterial.dispose();
    for (const lamp of this.lamps) lamp.removeFromParent();
    this.releaseLamps();
    this.restoreMaterials();
  }

  private applyLighting(): void {
    const state = this.state;
    const time = state.time;
    const palette = TIME_PALETTES[time];
    const tintSource = OVERCAST_TINTS[time];
    const cloud = clamp(state.cloudiness), rain = clamp(state.rainIntensity);
    const fog = clamp(state.fogIntensity), storm = clamp(state.stormIntensity);
    const flash = clamp(state.lightningFlash);
    const daylight = time === 'DAY' ? 1 : time === 'DUSK' ? .32 : .025;

    this.sun.intensity = 3.4 * daylight * (1 - .8 * cloud) * (1 - .35 * rain) * (1 - .35 * fog) * (1 - .12 * storm) + flash * 7.5;
    this.hemisphere.intensity = 2.1 * daylight * (1 + .06 * cloud) *
      (1 - .22 * rain - .12 * fog - .08 * storm) + flash * 3;
    this.sunColor.setHex(palette.sun).lerp(this.tint.setHex(tintSource.sun), Math.min(1, cloud * .6 + rain * .3));
    if (flash > 0) this.sunColor.lerp(FLASH_COLOR, flash * .55);
    this.sun.color.copy(this.sunColor);
    this.hemiSky.setHex(palette.hemiSky).lerp(this.tint.setHex(tintSource.top), Math.min(1, cloud * .5 + rain * .25));
    if (flash > 0) this.hemiSky.lerp(FLASH_COLOR, flash * .4);
    this.hemisphere.color.copy(this.hemiSky);
    this.hemiGround.setHex(palette.hemiGround).lerp(this.tint.setHex(tintSource.ground), cloud * .5);
    this.hemisphere.groundColor.copy(this.hemiGround);

    this.skyTop.setHex(palette.top).lerp(this.tint.setHex(tintSource.top), cloud * .8);
    this.skyHorizon.setHex(palette.horizon).lerp(this.tint.setHex(tintSource.horizon), cloud * .8);
    this.skyGround.setHex(palette.ground).lerp(this.tint.setHex(tintSource.ground), cloud * .75);
    const rainDarkness = 1 - rain * .38 - storm * .22;
    this.skyTop.multiplyScalar(rainDarkness).lerp(RAIN_TOP, rain * .35)
      .lerp(this.tint.setHex(tintSource.top), fog * .6);
    this.skyHorizon.multiplyScalar(1 - rain * .2 - storm * .18).lerp(RAIN_HORIZON, rain * .3)
      .lerp(this.tint.setHex(tintSource.horizon), fog * .7);
    this.skyGround.multiplyScalar(rainDarkness).lerp(RAIN_GROUND, rain * .3)
      .lerp(this.tint.setHex(tintSource.ground), fog * .6);
    if (flash > 0) {
      this.skyTop.lerp(FLASH_COLOR, flash * .3);
      this.skyHorizon.lerp(FLASH_COLOR, flash * .35);
      this.skyGround.lerp(FLASH_COLOR, flash * .25);
    }
    (this.sky.uniforms.topColor!.value as Color).copy(this.skyTop);
    (this.sky.uniforms.horizonColor!.value as Color).copy(this.skyHorizon);
    (this.sky.uniforms.groundColor!.value as Color).copy(this.skyGround);

    this.haze.setHex(palette.haze).lerp(this.tint.setHex(tintSource.haze), cloud * .8)
      .multiplyScalar(1 - rain * .2 - storm * .22).lerp(this.tint.setHex(tintSource.haze), fog * .7);
    if (flash > 0) this.haze.lerp(FLASH_COLOR, flash * .28);
    const fogObject = this.scene.fog;
    if (fogObject instanceof Fog) {
      fogObject.color.copy(this.haze);
      // FOG drives near=0 so haze exists from the driver outward. Keeping the
      // existing linear Fog object (instead of swapping to FogExp2) avoids a
      // shader recompile while giving the same cheap near/mid visibility feel.
      fogObject.near = Math.max(0, 180 - fog * 190 - rain * 46 - storm * 18);
      fogObject.far = Math.max(60, 1_100 - fog * 870 - rain * 420 - storm * 90);
    }
    if (this.scene.background instanceof Color) this.scene.background.copy(this.haze);

    const glow = time === 'NIGHT' ? 1.8 : time === 'DUSK' ? .45 : 0;
    const wetGlow = 1 + clamp(state.wetness) * .7;
    for (const material of this.lampMaterials) material.emissiveIntensity = glow * wetGlow;
    if (time === 'DAY') for (const lamp of this.lamps) lamp.intensity = 0;
    this.setExposure?.((1.08 * (1 - .1 * cloud - .05 * rain - .04 * fog) + flash * .35));

    this.lastCloud = cloud; this.lastRain = rain; this.lastFog = fog;
    this.lastStorm = storm; this.lastFlash = flash; this.lastTime = time;
  }

  private applySurface(force: boolean): void {
    const wet = clamp(this.state.wetness);
    if (!force && Math.abs(wet - this.appliedWetness) < .002) return;
    this.appliedWetness = wet;
    for (const state of this.materials.values()) this.applyMaterial(state, wet);
    // Rain visibility follows the same low-frequency gate.
    const rainVisible = this.state.rainIntensity > .012;
    if (this.rain.visible !== rainVisible) this.rain.visible = rainVisible;
  }

  private applyMaterial(state: SurfaceMaterialState, wetness: number): void {
    const wet = clamp(wetness);
    if (state.marking) {
      // Paint keeps its calibration; a touch of gloss sells wet lines cheaply.
      state.material.color.copy(state.color).multiplyScalar(1 - wet * .06);
      state.material.roughness = state.roughness + (Math.max(.24, state.roughness * .72) - state.roughness) * wet;
      state.material.metalness = state.metalness + (.08 - state.metalness) * wet;
      return;
    }
    state.material.color.copy(state.color).multiplyScalar(1 - wet * .25);
    state.material.roughness = state.roughness + (.38 - state.roughness) * wet;
    state.material.metalness = state.metalness + (.07 - state.metalness) * wet;
  }

  private restoreMaterial(state: SurfaceMaterialState): void {
    state.material.color.copy(state.color);
    state.material.roughness = state.roughness;
    state.material.metalness = state.metalness;
  }

  private restoreMaterials(): void {
    for (const state of this.materials.values()) this.restoreMaterial(state);
    this.materials.clear();
    this.appliedWetness = -1;
  }

  private updateLamps(dt: number, eye: Vector3): void {
    this.lampElapsed += dt;
    if (this.lampElapsed < .25 || this.state.time === 'DAY') return;
    this.lampElapsed = 0;
    this.selectedLamps.fill(-1);
    for (let slot = 0; slot < this.lamps.length; slot++) {
      let nearest = -1;
      let distance = 65 * 65;
      for (let i = 0; i < this.lampPositions.length; i++) {
        if (this.selectedLamps.includes(i)) continue;
        const candidate = this.lampPositions[i]!.distanceToSquared(eye);
        if (candidate < distance) { distance = candidate; nearest = i; }
      }
      this.selectedLamps[slot] = nearest;
      const lamp = this.lamps[slot]!;
      lamp.intensity = nearest < 0 ? 0 : this.state.time === 'NIGHT' ? 220 : 60;
      if (nearest >= 0) lamp.position.copy(this.lampPositions[nearest]!).y -= 0.15;
    }
  }

  private updateRain(dt: number, eye: Vector3): void {
    if (this.state.rainIntensity <= .012) {
      if (this.rain.visible) { this.rain.visible = false; this.rainGeometry.setDrawRange(0, 0); }
      return;
    }
    this.rain.visible = true;
    this.rainElapsed += dt;
    if (this.rainElapsed < 1 / 30) return;
    const elapsed = this.rainElapsed;
    this.rainElapsed = 0;
    const dx = this.hasEye ? Math.max(-10, Math.min(10, eye.x - this.previousEye.x)) : 0;
    const dz = this.hasEye ? Math.max(-10, Math.min(10, eye.z - this.previousEye.z)) : 0;
    this.previousEye.copy(eye);
    this.hasEye = true;
    this.rain.position.copy(eye);
    const rain = clamp(this.state.rainIntensity), wind = clamp(this.state.windIntensity);
    const count = Math.min(MAX_RAIN_DROPS, Math.round(MAX_RAIN_DROPS * (.12 + .88 * rain)));
    const fall = 16 + rain * 8;
    const length = .4 + rain * .95;
    const drift = wind * 5.5;
    const tilt = wind * .5;
    this.rainGeometry.setDrawRange(0, count * 2);
    this.rainMaterial.opacity = .12 + rain * .34;
    for (let i = 0; i < count; i++) {
      const j = i * 3;
      this.drops[j] = this.drops[j]! - dx + elapsed * drift;
      this.drops[j + 1] = this.drops[j + 1]! - elapsed * fall;
      this.drops[j + 2] = this.drops[j + 2]! - dz;
      if (this.drops[j + 1]! < -2 || Math.abs(this.drops[j]!) > RAIN_SPREAD || Math.abs(this.drops[j + 2]!) > RAIN_SPREAD) this.resetDrop(i);
      // Keep rain outside the cabin and away from the eye near plane.
      if (Math.hypot(this.drops[j]!, this.drops[j + 2]!) < 2.5) this.drops[j] = 3;
      this.positions.setXYZ(i * 2, this.drops[j]!, this.drops[j + 1]!, this.drops[j + 2]!);
      this.positions.setXYZ(i * 2 + 1, this.drops[j]! - tilt, this.drops[j + 1]! + length, this.drops[j + 2]!);
    }
    this.positions.needsUpdate = true;
  }

  private releaseLamps(dispose = true): void {
    // Return original materials to the ground's disposal owner.
    for (const entry of this.lampMeshes) entry.mesh.material = entry.original;
    this.lampMeshes.length = 0;
    if (dispose) { for (const material of this.lampGlowCache.values()) material.dispose(); this.lampGlowCache.clear(); }
    this.lampMaterials.length = 0;
  }

  private resetDrop(i: number): void {
    this.drops[i * 3] = (Math.random() - 0.5) * (RAIN_SPREAD * 2);
    this.drops[i * 3 + 1] = 3 + Math.random() * 22;
    this.drops[i * 3 + 2] = (Math.random() - 0.5) * (RAIN_SPREAD * 2);
  }
}
