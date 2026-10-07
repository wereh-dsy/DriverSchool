import {
  BufferGeometry, Color, DynamicDrawUsage, Float32BufferAttribute, Fog,
  InstancedMesh, LineBasicMaterial, LineSegments, Matrix4, Mesh,
  MeshStandardMaterial, PointLight, Vector3,
} from 'three';
import type { DirectionalLight, HemisphereLight, Scene, ShaderMaterial } from 'three';
import type { EnvironmentState } from './EnvironmentState';
import type { DrivingGround } from '../DrivingGround';

interface RoadMaterialState {
  material: MeshStandardMaterial;
  color: Color;
  roughness: number;
  metalness: number;
}

/** Shared material edits, one local rain draw, and a bounded street-light pool. */
export class EnvironmentVisual {
  private readonly roads: RoadMaterialState[] = [];
  private readonly lampMaterials: MeshStandardMaterial[] = [];
  private readonly lampMeshes: { mesh: Mesh; original: MeshStandardMaterial }[] = [];
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

  public setGround(ground: DrivingGround): void {
    // Streaming may rediscover the same shared materials; restore their baseline.
    for (const road of this.roads) {
      road.material.color.copy(road.color);
      road.material.roughness = road.roughness;
      road.material.metalness = road.metalness;
    }
    this.roads.length = 0;
    this.lampPositions.length = 0;
    this.releaseLamps();
    const seen = new Set<MeshStandardMaterial>();
    const matrix = new Matrix4();
    ground.root.updateWorldMatrix(true, true);
    ground.root.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!(material instanceof MeshStandardMaterial) || !material.userData.wetRoad || seen.has(material)) continue;
        seen.add(material);
        this.roads.push({ material, color: material.color.clone(), roughness: material.roughness, metalness: material.metalness });
      }
      if (object.userData.environmentLamp !== true || !(object.material instanceof MeshStandardMaterial)) return;
      const glow = object.material.clone();
      glow.emissive.set(0xffdf9d);
      this.lampMeshes.push({ mesh: object, original: object.material });
      object.material = glow;
      this.lampMaterials.push(glow);
      if (object instanceof InstancedMesh) {
        for (let i = 0; i < object.count; i++) {
          object.getMatrixAt(i, matrix);
          this.lampPositions.push(new Vector3().setFromMatrixPosition(matrix).applyMatrix4(object.matrixWorld));
        }
      } else this.lampPositions.push(object.getWorldPosition(new Vector3()));
    });
    this.lampElapsed = 1;
    this.applyState();
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
    for (const road of this.roads) {
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

  private releaseLamps(): void {
    // Return original materials to the ground's disposal owner.
    for (const entry of this.lampMeshes) entry.mesh.material = entry.original;
    this.lampMeshes.length = 0;
    for (const material of this.lampMaterials) material.dispose();
    this.lampMaterials.length = 0;
  }

  private resetDrop(i: number): void {
    this.drops[i * 3] = (Math.random() - 0.5) * 56;
    this.drops[i * 3 + 1] = 3 + Math.random() * 22;
    this.drops[i * 3 + 2] = (Math.random() - 0.5) * 56;
  }
}
