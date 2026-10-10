import {
  BufferGeometry, DynamicDrawUsage, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments,
} from 'three';
import type { DrivingGround } from '../world/DrivingGround';
import type { CollisionOBB } from '../vehicle/physics/CollisionSystem';
import type { VehicleContactSystem } from '../vehicle/physics/VehicleContactSystem';
import type { SurfaceType } from '../world/SurfaceMaterial';
import { wheelContactsAsArray } from '../vehicle/physics/WheelContact';
import type { VehicleRuntimeSnapshot } from '../vehicle/physics/VehicleDynamics';

const SURFACE_COLORS: Record<SurfaceType, readonly [number, number, number]> = {
  asphalt: [0.25, 0.9, 1], concrete: [0.8, 0.85, 0.9],
  'compact-shoulder': [1, 0.75, 0.2], grass: [0.35, 1, 0.25], curb: [1, 0.4, 0.65],
  'compact-gravel': [0.9, 0.8, 0.5], 'loose-gravel': [1, 0.6, 0.2],
  dirt: [0.75, 0.5, 0.25], 'damp-dirt': [0.5, 0.35, 0.2],
};

/** Optional contact diagnostics; no physics or camera authority. */
export class ContactDebugView {
  public readonly root = new Group();
  private readonly geometry = new BufferGeometry();
  private readonly positions = new Float32BufferAttribute(new Float32Array(4096 * 3), 3).setUsage(DynamicDrawUsage);
  private readonly colors = new Float32BufferAttribute(new Float32Array(4096 * 3), 3).setUsage(DynamicDrawUsage);
  private readonly material = new LineBasicMaterial({
    vertexColors: true, depthTest: false, toneMapped: false,
  });
  private readonly panel: HTMLPreElement;
  private shown = false;
  private lastContactText = '';
  private lastContactSeconds = 0;

  public constructor(host: HTMLElement) {
    this.root.name = 'F6 wheel and static collision diagnostics';
    this.geometry.setAttribute('position', this.positions);
    this.geometry.setAttribute('color', this.colors);
    const lines = new LineSegments(this.geometry, this.material);
    lines.layers.set(4); // DEBUG: reflection cameras only render WORLD + EXTERIOR.
    lines.frustumCulled = false;
    lines.renderOrder = 1_000;
    this.root.add(lines);
    this.root.visible = false;
    this.panel = document.createElement('pre');
    this.panel.className = 'contact-debug-panel';
    this.panel.hidden = true;
    this.panel.setAttribute('aria-label', '四轮接触与碰撞调试');
    host.append(this.panel);
  }

  public toggle(): boolean {
    this.shown = !this.shown;
    this.panel.hidden = !this.shown;
    this.root.visible = this.shown;
    return this.shown;
  }

  public update(contacts: VehicleContactSystem, ground: DrivingGround, dt: number, physics?: VehicleRuntimeSnapshot): void {
    if (!this.shown || contacts.wheelContacts === null || contacts.collision === null) return;
    if (contacts.lastCollision === null) {
      this.lastContactText = '';
      this.lastContactSeconds = 0;
    }
    const positions: number[] = [];
    const colors: number[] = [];
    const line = (
      a: readonly [number, number, number], b: readonly [number, number, number],
      color: readonly [number, number, number],
    ): void => {
      if (positions.length + 6 > this.positions.array.length) return;
      positions.push(...a, ...b);
      colors.push(...color, ...color);
    };
    const outline = (obb: CollisionOBB, color: readonly [number, number, number], y?: number): void => {
      obb.corners.forEach((a, index, corners) => {
        const b = corners[(index + 1) % corners.length]!;
        line([a.x, y ?? ground.getRoadHeightAt(a.x, a.z) + 0.14, a.z],
          [b.x, y ?? ground.getRoadHeightAt(b.x, b.z) + 0.14, b.z], color);
      });
    };
    const wheels = wheelContactsAsArray(contacts.wheelContacts);
    const rows = ['PHYSICS V0.2C · F6 关闭', '采样点/法线 · 青色车身框 · 橙色障碍'];
    for (const wheel of wheels) {
      const y = wheel.height + 0.09;
      const color = SURFACE_COLORS[wheel.surfaceType];
      line([wheel.x - 0.15, y, wheel.z], [wheel.x + 0.15, y, wheel.z], color);
      line([wheel.x, y, wheel.z - 0.15], [wheel.x, y, wheel.z + 0.15], color);
      line([wheel.x, y, wheel.z], [wheel.x + wheel.normal.x * 0.6,
        y + wheel.normal.y * 0.6, wheel.z + wheel.normal.z * 0.6], color);
      const label = { frontLeft: 'FL', frontRight: 'FR', rearLeft: 'RL', rearRight: 'RR' }[wheel.id];
      rows.push(`${label} ${wheel.surfaceType.padEnd(16)} μ ${wheel.longitudinalGrip.toFixed(2)}/${wheel.lateralGrip.toFixed(2)} R ${wheel.rollingResistance.toFixed(2)}`);
      rows.push(`   n ${wheel.normal.x.toFixed(2)}, ${wheel.normal.y.toFixed(2)}, ${wheel.normal.z.toFixed(2)} · h ${wheel.height.toFixed(2)}m`);
      const state = physics?.wheels[wheel.id];
      if (state !== undefined) {
        rows.push(`   load ${state.normalLoad.toFixed(0)}N · drive ${state.driveTorque.toFixed(0)}Nm · brake ${state.appliedBrakeTorque.toFixed(0)}Nm`);
        rows.push(`   wheel ${state.angularVelocity.toFixed(1)}rad/s · slip ${(state.slipRatio * 100).toFixed(1)}% · Fx ${state.longitudinalForce.toFixed(0)}N`);
        rows.push(`   lateral ${state.lateralForce.toFixed(0)}N · spring ${(state.suspensionCompression * 1_000).toFixed(1)}mm · v ${state.suspensionVelocity.toFixed(3)}m/s`);
      }
    }
    const collision = contacts.collision;
    outline(collision.vehicleOBB, [0.1, 1, 1]);
    for (const collider of collision.nearbyColliders) {
      outline(collider, [1, 0.55, 0.12]);
    }
    const visibleContacts = contacts.secondsSinceCollision < 0.5
      ? contacts.lastCollision?.contacts ?? collision.contacts
      : collision.contacts;
    for (const contact of visibleContacts) {
      const y = ground.getRoadHeightAt(contact.point.x, contact.point.z) + 0.5;
      line([contact.point.x, y, contact.point.z],
        [contact.point.x + contact.normal.x * 1.3, y, contact.point.z + contact.normal.z * 1.3], [1, 0.15, 0.15]);
      line([contact.point.x, y - 0.25, contact.point.z], [contact.point.x, y + 0.25, contact.point.z], [1, 0.15, 0.15]);
      this.lastContactText = `${contact.colliderId}\n接触 (${contact.point.x.toFixed(2)}, ${contact.point.z.toFixed(2)})\n法线 (${contact.normal.x.toFixed(2)}, ${contact.normal.z.toFixed(2)}) · 深度 ${contact.penetration.toFixed(3)}m`;
      this.lastContactSeconds = 0.75;
    }
    this.lastContactSeconds = Math.max(0, this.lastContactSeconds - dt);
    rows.push(`附近障碍 ${collision.nearbyColliders.length} · 碰撞 ${collision.collided ? '接触中' : '无'}`);
    if (physics !== undefined) {
      rows.push(`pitch ${(physics.chassis.pitch * 180 / Math.PI).toFixed(2)}° · roll ${(physics.chassis.roll * 180 / Math.PI).toFixed(2)}° · heave ${(physics.chassis.rideOffset * 1_000).toFixed(1)}mm`);
    }
    if (this.lastContactSeconds > 0) rows.push(this.lastContactText);
    this.panel.textContent = rows.join('\n');
    this.positions.array.set(positions);
    this.colors.array.set(colors);
    this.positions.needsUpdate = true;
    this.colors.needsUpdate = true;
    this.geometry.setDrawRange(0, positions.length / 3);
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.panel.remove();
  }
}
