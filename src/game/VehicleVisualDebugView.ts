import {
  Box3, BufferGeometry, DynamicDrawUsage, Float32BufferAttribute, Group,
  LineBasicMaterial, LineSegments, PerspectiveCamera, Vector3,
} from 'three';
import type { DriverCamera } from '../camera/DriverCamera';
import type { MirrorSystem } from '../camera/MirrorSystem';
import type { VehicleContactSystem } from '../vehicle/physics/VehicleContactSystem';
import type { VehicleVisual } from '../vehicle/visual/VehicleVisual';

/** Inspection only: never changes DriverEye, mirror geometry or vehicle input. */
export class VehicleVisualDebugView {
  public readonly root = new Group();
  public readonly inspectionCamera = new PerspectiveCamera(50, 16 / 9, 0.025, 2_500);
  private readonly geometry = new BufferGeometry();
  private readonly positions = new Float32BufferAttribute(new Float32Array(2048 * 3), 3).setUsage(DynamicDrawUsage);
  private readonly colors = new Float32BufferAttribute(new Float32Array(2048 * 3), 3).setUsage(DynamicDrawUsage);
  private readonly material = new LineBasicMaterial({ vertexColors: true, depthTest: false, toneMapped: false });
  private readonly panel: HTMLPreElement;
  private shown = false;
  private inspectionIndex = -1;
  private readonly eye = new Vector3();
  private readonly bounds = new Box3();

  public constructor(host: HTMLElement) {
    this.root.name = 'F7 vehicle dimensions and mirror geometry';
    this.geometry.setAttribute('position', this.positions);
    this.geometry.setAttribute('color', this.colors);
    const lines = new LineSegments(this.geometry, this.material);
    lines.layers.set(4); // DEBUG, excluded from every mirror pass.
    lines.frustumCulled = false;
    lines.renderOrder = 1_001;
    this.root.add(lines);
    this.root.visible = false;
    this.inspectionCamera.layers.enableAll();
    this.panel = document.createElement('pre');
    this.panel.className = 'visual-debug-panel';
    this.panel.setAttribute('aria-label', '车辆尺寸与镜面几何调试');
    this.panel.hidden = true;
    host.append(this.panel);
  }

  public get enabled(): boolean { return this.shown; }
  public get renderCamera(): PerspectiveCamera | null {
    return this.shown && this.inspectionIndex >= 0 ? this.inspectionCamera : null;
  }
  public toggle(): boolean {
    this.shown = !this.shown;
    this.root.visible = this.shown;
    this.panel.hidden = !this.shown;
    if (!this.shown) this.inspectionIndex = -1;
    return this.shown;
  }
  public cycleInspectionView(): void {
    if (this.shown) this.inspectionIndex = (this.inspectionIndex + 2) % 9 - 1;
  }

  public update(vehicle: VehicleVisual, contacts: VehicleContactSystem, driver: DriverCamera, mirrors: MirrorSystem): void {
    if (!this.shown) return;
    const vertices: number[] = [];
    const colors: number[] = [];
    const segment = (a: Vector3, b: Vector3, color: readonly [number, number, number]): void => {
      vertices.push(a.x, a.y, a.z, b.x, b.y, b.z);
      colors.push(...color, ...color);
    };
    const marker = (p: Vector3, color: readonly [number, number, number], size = 0.11): void => {
      segment(p.clone().add(new Vector3(-size, 0, 0)), p.clone().add(new Vector3(size, 0, 0)), color);
      segment(p.clone().add(new Vector3(0, -size, 0)), p.clone().add(new Vector3(0, size, 0)), color);
      segment(p.clone().add(new Vector3(0, 0, -size)), p.clone().add(new Vector3(0, 0, size)), color);
    };
    const box = (minimum: Vector3, maximum: Vector3, color: readonly [number, number, number]): void => {
      const corners: Vector3[] = [];
      for (const y of [minimum.y, maximum.y]) for (const z of [minimum.z, maximum.z]) for (const x of [minimum.x, maximum.x]) {
        corners.push(new Vector3(x, y, z));
      }
      for (const [a, b] of [[0, 1], [0, 2], [1, 3], [2, 3], [4, 5], [4, 6], [5, 7], [6, 7], [0, 4], [1, 5], [2, 6], [3, 7]]) {
        segment(corners[a!]!, corners[b!]!, color);
      }
    };
    vehicle.root.updateWorldMatrix(true, true);
    vehicle.getVisualBodyBounds(this.bounds);
    box(this.bounds.min, this.bounds.max, [0.9, 0.3, 1]);
    const collision = contacts.collision;
    if (collision !== null) collision.vehicleOBB.corners.forEach((a, index, corners) => {
      const b = corners[(index + 1) % corners.length]!;
      segment(new Vector3(a.x, vehicle.root.position.y + 0.08, a.z), new Vector3(b.x, vehicle.root.position.y + 0.08, b.z), [0.1, 1, 1]);
    });
    driver.camera.getWorldPosition(this.eye);
    marker(this.eye, [1, 1, 0.2]);
    const rows = ['VISUAL V0.2B · F7 关闭 / F8 切换观察角度', '紫:车体包络(不含镜壳) 青:碰撞边界 黄:DriverEye',
      `视角 ${this.inspectionIndex < 0 ? '驾驶位' : ['前方', '左前', '左侧', '左后', '后方', '右后', '右侧', '右前'][this.inspectionIndex]}`];
    if (contacts.wheelContacts !== null) {
      for (const [id, wheel] of Object.entries(contacts.wheelContacts)) {
        marker(new Vector3(wheel.x, wheel.height + vehicle.config.wheelRadius, wheel.z), [0.3, 1, 0.5]);
        rows.push(`${id}: ${wheel.x.toFixed(2)}, ${wheel.height.toFixed(2)}, ${wheel.z.toFixed(2)}`);
      }
    }
    for (const side of ['left', 'right'] as const) {
      const view = mirrors.getView(side);
      const color: readonly [number, number, number] = side === 'left' ? [1, 0.3, 0.25] : [0.25, 0.5, 1];
      const corners = view.worldCorners;
      for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0]]) segment(corners[a!]!, corners[b!]!, color);
      segment(view.worldPosition, view.worldPosition.clone().addScaledVector(view.worldNormal, 0.7), color);
      marker(view.virtualEye, color, 0.16);
      for (const corner of corners) {
        marker(corner, color, 0.025);
        segment(view.virtualEye, corner, color);
      }
      rows.push(`${side}: normal ${view.worldNormal.toArray().map((n) => n.toFixed(2)).join(', ')} · ${view.valid ? 'valid' : 'invalid'}`);
      rows.push(`   virtualEye ${view.virtualEye.toArray().map((n) => n.toFixed(2)).join(', ')}`);
    }
    this.positions.array.set(vertices);
    this.colors.array.set(colors);
    this.positions.needsUpdate = true;
    this.colors.needsUpdate = true;
    this.geometry.setDrawRange(0, vertices.length / 3);
    this.panel.textContent = rows.join('\n');
    if (this.inspectionIndex >= 0) {
      const angle = this.inspectionIndex * Math.PI / 4;
      const offset = new Vector3(-Math.sin(angle) * 7, 2.9, -Math.cos(angle) * 7)
        .applyAxisAngle(new Vector3(0, 1, 0), vehicle.root.rotation.y);
      this.inspectionCamera.position.copy(vehicle.root.position).add(offset);
      this.inspectionCamera.lookAt(vehicle.root.position.clone().add(new Vector3(0, 0.8, 0)));
      this.inspectionCamera.aspect = driver.camera.aspect;
      this.inspectionCamera.updateProjectionMatrix();
      this.inspectionCamera.updateMatrixWorld(true);
    }
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.panel.remove();
  }
}
