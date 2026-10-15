import {
  BufferAttribute, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Group,
  Mesh, MeshBasicMaterial, type Scene,
} from 'three';
import { VEHICLE_RENDER_LAYERS } from '../../vehicle/visual/VehicleRenderLayers';
import type { DrivingGround } from '../../world/DrivingGround';
import { TRAJECTORY_MAX_POINTS, type TrajectoryGeometry, type TrajectoryPredictionResult } from './TrajectoryPredictor';

const LINE_WIDTH_METERS = 0.12;

/** One thick ground-projected line, coloured by future time; no labels or vehicle-width envelope. */
export class TrajectoryPredictionView {
  private readonly root = new Group();
  private readonly positions = new BufferAttribute(new Float32Array(TRAJECTORY_MAX_POINTS * 2 * 3), 3).setUsage(DynamicDrawUsage);
  private readonly colors = new BufferAttribute(new Float32Array(TRAJECTORY_MAX_POINTS * 2 * 4), 4).setUsage(DynamicDrawUsage);
  private readonly geometry = new BufferGeometry();
  private readonly material = new MeshBasicMaterial({
    vertexColors: true, depthTest: true, depthWrite: false, toneMapped: false,
    side: DoubleSide, transparent: true, polygonOffset: true, polygonOffsetFactor: -1,
  });
  // A narrow triangle strip gives consistent thickness where WebGL lines are limited to one pixel.
  private readonly mesh = new Mesh(this.geometry, this.material);
  private readonly centres = new Float64Array(TRAJECTORY_MAX_POINTS * 2);
  private readonly nearColor = new Color(0x40dfff);
  private readonly middleColor = new Color(0xffd45a);
  private readonly farColor = new Color(0xff784f);

  public constructor(scene: Scene) {
    const indices = new Uint16Array((TRAJECTORY_MAX_POINTS - 1) * 6);
    for (let i = 0; i < TRAJECTORY_MAX_POINTS - 1; i++) {
      const vertex = i * 2, index = i * 6;
      indices[index] = vertex; indices[index + 1] = vertex + 2; indices[index + 2] = vertex + 1;
      indices[index + 3] = vertex + 1; indices[index + 4] = vertex + 2; indices[index + 5] = vertex + 3;
    }
    this.geometry.setIndex(new BufferAttribute(indices, 1));
    this.geometry.setAttribute('position', this.positions);
    this.geometry.setAttribute('color', this.colors);
    this.geometry.setDrawRange(0, 0);
    this.root.name = 'Experimental trajectory prediction (2 seconds)';
    this.mesh.name = 'Trajectory prediction line';
    this.mesh.layers.set(VEHICLE_RENDER_LAYERS.DEBUG);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 100;
    this.root.add(this.mesh); this.root.visible = false; scene.add(this.root);
  }

  public update(result: TrajectoryPredictionResult, ground: Pick<DrivingGround, 'getRoadHeightAt'>,
    vehicle: TrajectoryGeometry): void {
    this.hide();
    if (result.pointCount < 2 || !Number.isFinite(vehicle.length) || vehicle.length <= 0) return;
    const noseOffset = vehicle.length * 0.5 * (result.speeds[0]! < 0 ? -1 : 1);
    for (let i = 0; i < result.pointCount; i++) {
      const yaw = result.headings[i]!;
      this.centres[i * 2] = result.positions[i * 2]! - Math.sin(yaw) * noseOffset;
      this.centres[i * 2 + 1] = result.positions[i * 2 + 1]! - Math.cos(yaw) * noseOffset;
    }
    let count = 0;
    for (let i = 0; i < result.pointCount; i++) {
      const before = Math.max(0, i - 1) * 2, after = Math.min(result.pointCount - 1, i + 1) * 2;
      const dx = this.centres[after]! - this.centres[before]!, dz = this.centres[after + 1]! - this.centres[before + 1]!;
      const distance = Math.hypot(dx, dz);
      const nx = distance > 1e-6 ? -dz / distance : Math.cos(result.headings[i]!);
      const nz = distance > 1e-6 ? dx / distance : -Math.sin(result.headings[i]!);
      const time = Math.min(1, result.times[i]! / result.horizonSeconds);
      const from = time < 0.5 ? this.nearColor : this.middleColor;
      const to = time < 0.5 ? this.middleColor : this.farColor;
      const blend = time < 0.5 ? time * 2 : (time - 0.5) * 2;
      let valid = true;
      for (let side = 0; side < 2; side++) {
        const offset = (side === 0 ? -0.5 : 0.5) * LINE_WIDTH_METERS;
        const x = this.centres[i * 2]! + nx * offset, z = this.centres[i * 2 + 1]! + nz * offset;
        const y = ground.getRoadHeightAt(x, z) + 0.06, vertex = i * 2 + side;
        // Keep the existing support discontinuity guard without changing map query state.
        if (!Number.isFinite(y) || i > 0 && Math.abs(y - this.positions.getY(vertex - 2)) > 1.25) valid = false;
        this.positions.setXYZ(vertex, x, y, z);
        this.colors.setXYZW(vertex, from.r + (to.r - from.r) * blend,
          from.g + (to.g - from.g) * blend, from.b + (to.b - from.b) * blend, 0.95 - time * 0.25);
      }
      if (!valid) break;
      count++;
    }
    if (count < 2) return;
    this.geometry.setDrawRange(0, (count - 1) * 6);
    this.positions.needsUpdate = true; this.colors.needsUpdate = true;
    this.root.visible = true;
  }

  public hide(): void { this.root.visible = false; }

  public dispose(): void {
    this.root.removeFromParent(); this.geometry.dispose(); this.material.dispose();
  }
}
