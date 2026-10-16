import {
  BufferGeometry, Color, DynamicDrawUsage, Float32BufferAttribute, Fog,
  InstancedMesh, LineBasicMaterial, LineSegments, Matrix4, Mesh,
  MeshStandardMaterial, PointLight, Vector3,
} from 'three';
import type { DirectionalLight, HemisphereLight, Object3D, Scene, ShaderMaterial } from 'three';
import type { EnvironmentState } from './EnvironmentState';
import type { DrivingGround } from '../DrivingGround';

interface RoadMaterialState {
  material: MeshStandardMaterial;
  color: Color;
  roughness: number;
  metalness: number;
  references: number;
}

/** Shared material edits, one local rain draw, and a bounded street-light pool. */
export class EnvironmentVisual {
  private readonly roads = new Map<MeshStandardMaterial, RoadMaterialState>();
  private meshRoads = new WeakMap<Mesh, MeshStandardMaterial[]>();
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
  private readonly drops = new Float32Array(900 * 3);
  private readonly positions = new Float32BufferAttribute(new Float32Array(900 * 6), 3);
  private rainElapsed = 0;
  private lampElapsed = 1;
  private readonly previousEye = new Vector3();
  private hasEye = false;

  public constructor(
    private readonly scene: Scene,
    private readonly state: EnvironmentState,
    private readonly sun: DirectionalLight,
    private readonly hemisphere: HemisphereLight,
    private readonly sky: ShaderMaterial,
  ) {
    this.positions.setUsage(DynamicDrawUsage);
    this.rainGeometry.setAttribute('position', this.positions);
    this.rain.frustumCulled = false;
    this.rain.name = 'Local rainfall';
    for (let i = 0; i < 900; i++) this.resetDrop(i);
    scene.add(this.rain, ...this.lamps);
  }

  public setGround(ground: Pick<DrivingGround, 'root'>): void {
    for (const road of this.roads.values()) {
      road.material.color.copy(road.color);
      road.material.roughness = road.roughness;
      road.material.metalness = road.metalness;
    }
    this.roads.clear(); this.meshRoads = new WeakMap(); this.observedMeshes = new WeakSet();
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
      const roads: MeshStandardMaterial[] = [];
      for (const material of materials) {
        if (!(material instanceof MeshStandardMaterial) || !material.userData.wetRoad || roads.includes(material)) continue;
        roads.push(material);
        let state = this.roads.get(material);
        if (!state) {
          state = { material, color: material.color.clone(), roughness: material.roughness, metalness: material.metalness, references: 0 };
          this.roads.set(material, state);
        }
        state.references++;
      }
      this.meshRoads.set(object, roads);
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
      for (const material of this.meshRoads.get(object) ?? []) {
        const state = this.roads.get(material)!;
        if (--state.references === 0) {
          material.color.copy(state.color); material.roughness = state.roughness; material.metalness = state.metalness;
          this.roads.delete(material);
        }
      }
      this.meshRoads.delete(object);
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

  public applyState(): void {
    const wet = this.state.wetness;
    const time = this.state.time;
    const daylight = time === 'DAY' ? 1 : time === 'DUSK' ? 0.32 : 0.025;
    const cloud = 1 - wet * 0.48;
    this.sun.intensity = 3.4 * daylight * (1 - wet * 0.8);
    this.sun.color.set(time === 'DUSK' ? 0xffad72 : time === 'NIGHT' ? 0x9cb5d5 : 0xfff1cf);
    this.hemisphere.intensity = 2.1 * daylight * cloud;
    this.hemisphere.color.set(time === 'NIGHT' ? 0x7d93b5 : 0xd9edf2);
    const skyColors = time === 'DAY' ? [0x6f9fb0, 0xd4d8cf, 0x8e9c84]
      : time === 'DUSK' ? [0x354963, 0x946951, 0x434741]
        : [0x040913, 0x111b2b, 0x080f16];
    for (const [i, name] of ['topColor', 'horizonColor', 'groundColor'].entries()) {
      (this.sky.uniforms[name]!.value as Color).set(skyColors[i]!).lerp(new Color(time === 'NIGHT' ? 0x080d14 : 0x78848c), wet * 0.6).multiplyScalar(cloud);
    }
    const fog = this.scene.fog;
    const haze = new Color(time === 'DAY' ? 0xaebfc0 : time === 'DUSK' ? 0x625b5c : 0x0c1420).multiplyScalar(cloud);
    if (fog instanceof Fog) {
      fog.color.copy(haze);
      fog.near = 180 - wet * 100;
      fog.far = 1100 - wet * 660;
    }
    if (this.scene.background instanceof Color) this.scene.background.copy(haze);
    for (const road of this.roads.values()) {
      road.material.color.copy(road.color).multiplyScalar(1 - wet * 0.25);
      road.material.roughness = road.roughness + (0.38 - road.roughness) * wet;
      road.material.metalness = road.metalness + (0.07 - road.metalness) * wet;
    }
    const glow = time === 'NIGHT' ? 1.8 : time === 'DUSK' ? 0.45 : 0;
    for (const material of this.lampMaterials) material.emissiveIntensity = glow;
    this.rain.visible = wet > 0;
    this.rainGeometry.setDrawRange(0, (this.state.weather === 'HEAVY_RAIN' ? 900 : 240) * 2);
    this.lampElapsed = 1;
    if (time === 'DAY') for (const lamp of this.lamps) lamp.intensity = 0;
  }

  public update(dt: number, eye: Vector3): void {
    this.lampElapsed += dt;
    if (this.lampElapsed >= 0.25 && this.state.time !== 'DAY') {
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
    this.rainElapsed += dt;
    if (this.rainElapsed < 1 / 30) return;
    const elapsed = this.rainElapsed;
    this.rainElapsed = 0;
    const dx = this.hasEye ? Math.max(-10, Math.min(10, eye.x - this.previousEye.x)) : 0;
    const dz = this.hasEye ? Math.max(-10, Math.min(10, eye.z - this.previousEye.z)) : 0;
    this.previousEye.copy(eye);
    this.hasEye = true;
    if (!this.rain.visible) return;
    this.rain.position.copy(eye);
    const count = this.state.weather === 'HEAVY_RAIN' ? 900 : 240;
    for (let i = 0; i < count; i++) {
      const j = i * 3;
      this.drops[j] = this.drops[j]! - dx + elapsed * 0.8;
      this.drops[j + 1] = this.drops[j + 1]! - elapsed * 18;
      this.drops[j + 2] = this.drops[j + 2]! - dz;
      if (this.drops[j + 1]! < -2 || Math.abs(this.drops[j]!) > 28 || Math.abs(this.drops[j + 2]!) > 28) this.resetDrop(i);
      // Keep rain outside the cabin and away from the eye near plane.
      if (Math.hypot(this.drops[j]!, this.drops[j + 2]!) < 2.5) this.drops[j] = 3;
      this.positions.setXYZ(i * 2, this.drops[j]!, this.drops[j + 1]!, this.drops[j + 2]!);
      this.positions.setXYZ(i * 2 + 1, this.drops[j]! - 0.04, this.drops[j + 1]! + 0.65, this.drops[j + 2]!);
    }
    this.positions.needsUpdate = true;
  }

  public dispose(): void {
    this.rain.removeFromParent();
    this.rainGeometry.dispose();
    this.rainMaterial.dispose();
    for (const lamp of this.lamps) lamp.removeFromParent();
    this.releaseLamps();
  }

  private releaseLamps(dispose = true): void {
    // Return original materials to the ground's disposal owner.
    for (const entry of this.lampMeshes) entry.mesh.material = entry.original;
    this.lampMeshes.length = 0;
    if (dispose) { for (const material of this.lampGlowCache.values()) material.dispose(); this.lampGlowCache.clear(); }
    this.lampMaterials.length = 0;
  }

  private resetDrop(i: number): void {
    this.drops[i * 3] = (Math.random() - 0.5) * 56;
    this.drops[i * 3 + 1] = 3 + Math.random() * 22;
    this.drops[i * 3 + 2] = (Math.random() - 0.5) * 56;
  }
}
