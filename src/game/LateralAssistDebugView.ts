import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments, type Scene } from 'three';
import type { LaneObservation } from '../world/navigation/LaneObservation';
import type { LateralAssistController } from '../vehicle/control/LateralAssistController';

/** Development-only, F9. Reuses fixed geometry; no production HUD elements. */
export class LateralAssistDebugView {
  private readonly positions = new Float32Array(18);
  private readonly geometry = new BufferGeometry();
  private readonly material = new LineBasicMaterial({ color: 0x51e8cf, depthTest: false });
  private readonly lines = new LineSegments(this.geometry, this.material);
  private readonly label = document.createElement('pre');
  private enabled = false;
  private elapsed = 0;
  public constructor(scene: Scene) {
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.lines.visible = false; this.lines.frustumCulled = false; this.lines.renderOrder = 100;
    scene.add(this.lines);
    this.label.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:100;color:#51e8cf;background:#10202cdd;padding:10px;pointer-events:none';
    this.label.hidden = true; document.body.append(this.label);
  }
  public toggle(): void { this.enabled = !this.enabled; this.label.hidden = !this.enabled; this.lines.visible = false; }
  public update(dt: number, lane: LaneObservation, assist: LateralAssistController, y: number): void {
    if (!this.enabled) return;
    this.lines.visible = lane.valid;
    const x = lane.lookAheadX, z = lane.lookAheadZ, h = lane.targetYaw;
    this.positions.set([lane.centerX,y+.2,lane.centerZ,x,y+.2,z,
      x,y+.2,z,x-Math.sin(h)*5,y+.2,z-Math.cos(h)*5,
      x-Math.cos(h),y+.2,z+Math.sin(h),x+Math.cos(h),y+.2,z-Math.sin(h)]);
    this.geometry.attributes.position!.needsUpdate = true;
    this.elapsed += dt;
    if (this.elapsed < .1) return;
    this.elapsed = 0;
    this.label.textContent = `Lateral assist · F9\n${lane.laneId ?? 'no logical lane'} · valid ${lane.valid} · confidence ${lane.confidence.toFixed(2)}\noffset ${lane.lateralOffset.toFixed(2)} m · heading ${(lane.headingError*180/Math.PI).toFixed(1)}°\nlook ${lane.lookAheadDistance.toFixed(1)} m · curvature ${lane.curvature.toFixed(5)}\nLKA ${assist.display.lkaState} · LCC ${assist.display.lccState}\nassist ${assist.output.steeringAssist.toFixed(3)} · authority ${assist.output.authority.toFixed(3)}`;
  }
  public dispose(): void { this.lines.removeFromParent(); this.geometry.dispose(); this.material.dispose(); this.label.remove(); }
}
