import {
  CanvasTexture,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type Object3D,
} from 'three';
import type { WindshieldHUDRenderData } from '../adas/visualization/ADASVisualizationTypes';
import { VEHICLE_RENDER_LAYERS } from '../visual/VehicleRenderLayers';
import {
  clampHUDHeightLevel,
  computeHUDPlaneCenterY,
  resolveVehicleHUDProfile,
} from './VehicleHUDProfile';
import type { VehicleHUDProfile } from './VehicleHUDTypes';

const HUD_CANVAS_W = 768;
const HUD_CANVAS_H = 288;

type Canvas2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function createHudCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(w, h);
  }
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return { width: w, height: h } as unknown as HTMLCanvasElement;
}

/**
 * Vehicle-bound 3D virtual-imaging windshield HUD plane.
 * Parented inside VehicleVisual.root on VEHICLE_RENDER_LAYERS.INTERIOR:
 * - Stays fixed in vehicle coordinate space when the driver turns their head.
 * - Produces genuine 3D parallax across seat height, head position, and FOV.
 * - Naturally occluded by A-pillars, dashboard cowl, steering wheel, and interior mirror.
 * - Redraws its transparent CanvasTexture strictly on displayed-content change.
 */
export class WindshieldHUDPlane {
  public readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly canvas: OffscreenCanvas | HTMLCanvasElement;
  private readonly ctx: Canvas2D | null;
  private readonly texture: CanvasTexture;
  private readonly geometry: PlaneGeometry;
  private readonly material: MeshBasicMaterial;

  private profile: VehicleHUDProfile = resolveVehicleHUDProfile('default');
  private activeHeightLevel = 0;
  private lastSignature = '';

  public constructor() {
    this.canvas = createHudCanvas(HUD_CANVAS_W, HUD_CANVAS_H);
    this.ctx =
      typeof (this.canvas as OffscreenCanvas).getContext === 'function'
        ? ((this.canvas as OffscreenCanvas).getContext('2d') as Canvas2D | null)
        : null;

    this.texture = new CanvasTexture(this.canvas as unknown as HTMLCanvasElement);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.minFilter = LinearFilter;
    this.texture.magFilter = LinearFilter;
    this.texture.generateMipmaps = false;

    this.geometry = new PlaneGeometry(1, 1);
    this.material = new MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
      opacity: 1.0,
    });

    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.name = 'VehicleWindshieldVirtualHUD';
    this.mesh.layers.set(VEHICLE_RENDER_LAYERS.INTERIOR);
    this.mesh.renderOrder = 6;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    // Slight ergonomic inclination matching automotive windshield optical focal plane
    this.mesh.rotation.set(0.045, 0, 0);
  }

  public attachToVehicle(vehicleRoot: Object3D, vehicleId: string): void {
    this.profile = resolveVehicleHUDProfile(vehicleId);
    vehicleRoot.add(this.mesh);
    this.applyPlacement();
  }

  private applyPlacement(): void {
    const p = this.profile;
    const centerY = computeHUDPlaneCenterY(p, this.activeHeightLevel);
    this.mesh.position.set(p.centerXM, centerY, p.centerZM);
    this.mesh.scale.set(p.planeWidthM, p.planeHeightM, 1);
  }

  public update(data: WindshieldHUDRenderData | null | undefined, cockpitView: boolean): void {
    if (!data || !data.visible || !cockpitView) {
      this.mesh.visible = false;
      return;
    }

    const nextLevel = clampHUDHeightLevel(data.heightLevel);
    if (nextLevel !== this.activeHeightLevel) {
      this.activeHeightLevel = nextLevel;
      this.applyPlacement();
    } else if (!this.mesh.visible) {
      this.applyPlacement();
    }

    this.mesh.visible = true;
    this.material.opacity = data.theme === 'NIGHT' ? 0.80 : data.theme === 'DUSK' ? 0.90 : 0.96;

    const lanesKey = data.navShowLanes
      ? data.navLanes.map((l) => `${l.index}:${l.active ? 1 : 0}:${l.recommended ? 1 : 0}:${l.direction[0]}`).join(',')
      : '';
    const highContrast = data.rainIntensity >= 0.45 || data.fogIntensity >= 0.35 ? 1 : 0;
    const sig =
      `${data.theme}|${highContrast}|${data.speedKmh}|${data.speedLimitKmh ?? 'n'}|${data.overspeedSeverity}|` +
      `${data.gearLabel}|${data.rangeLabel}|${data.rangeKind}|` +
      `${data.navActive ? 1 : 0}|${data.navDirection}|${data.navDistanceText}|${data.navRoadName}|${lanesKey}|` +
      `${data.warningSeverity ?? 'n'}|${data.warningTitle}|${data.warningDetail}|` +
      `${data.maneuverVisible ? 1 : 0}|${data.maneuverTone}|${data.maneuverPhrase}`;

    if (sig !== this.lastSignature) {
      this.lastSignature = sig;
      this.paint(data, highContrast === 1);
      this.texture.needsUpdate = true;
    }
  }

  private paint(data: WindshieldHUDRenderData, highContrast: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;

    ctx.clearRect(0, 0, HUD_CANVAS_W, HUD_CANVAS_H);

    const night = data.theme === 'NIGHT';
    const dusk = data.theme === 'DUSK';
    const primaryCol = night
      ? 'rgba(210, 232, 240, 0.92)'
      : dusk
        ? 'rgba(236, 248, 254, 0.95)'
        : 'rgba(244, 251, 255, 0.98)';
    const mutedCol = night
      ? 'rgba(154, 186, 198, 0.72)'
      : 'rgba(202, 228, 240, 0.78)';
    const cyanCol = night
      ? 'rgba(104, 194, 214, 0.90)'
      : 'rgba(116, 224, 248, 0.95)';
    const amberCol = night ? 'rgba(226, 168, 72, 0.92)' : 'rgba(246, 188, 76, 0.96)';
    const redCol = night ? 'rgba(232, 98, 98, 0.94)' : 'rgba(255, 108, 108, 0.98)';

    // Subtle crisp legibility halo on sunlit/wet asphalt without heavy box shadow
    ctx.shadowColor = highContrast ? 'rgba(0, 6, 12, 0.85)' : 'rgba(0, 8, 16, 0.62)';
    ctx.shadowBlur = highContrast ? 7 : 4;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 1;

    // 1. Optional slender upper optical alert/maneuver strip (no boxes, no persistent ADAS text)
    if (data.warningSeverity !== null) {
      const warnCol = data.warningSeverity === 'hazard' ? redCol : amberCol;
      ctx.save();
      ctx.strokeStyle = warnCol;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(190, 56);
      ctx.lineTo(578, 56);
      ctx.stroke();

      ctx.fillStyle = warnCol;
      ctx.font = '600 22px "Segoe UI", "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = data.warningDetail ? `${data.warningTitle}  ·  ${data.warningDetail}` : data.warningTitle;
      ctx.fillText(label, HUD_CANVAS_W * 0.5, 32, 540);
      ctx.restore();
    } else if (data.maneuverVisible && data.maneuverPhrase) {
      const manCol =
        data.maneuverTone === 'hazard' ? redCol : data.maneuverTone === 'caution' ? amberCol : cyanCol;
      ctx.save();
      ctx.fillStyle = manCol;
      ctx.font = '500 21px "Segoe UI", "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(data.maneuverPhrase, HUD_CANVAS_W * 0.5, 36, 460);
      ctx.restore();
    }

    // 2. Central visual anchor: Vehicle Speed
    const speedCol =
      data.overspeedSeverity === 'severe'
        ? redCol
        : data.overspeedSeverity === 'mild'
          ? amberCol
          : primaryCol;
    ctx.save();
    ctx.fillStyle = speedCol;
    ctx.font = '300 112px "Bahnschrift", "DIN Alternate", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(String(data.speedKmh), 384, 206);

    ctx.fillStyle = mutedCol;
    ctx.font = '600 18px "Bahnschrift", "Segoe UI", sans-serif';
    ctx.fillText('km/h', 384, 236);
    ctx.restore();

    // 3. Left flank: Speed Limit optical ring, Gear, Range
    // 3a. Open circular speed limit halo (left of speed)
    ctx.save();
    const limitCx = 242;
    const limitCy = 172;
    const limitRingCol =
      data.overspeedSeverity === 'severe'
        ? redCol
        : data.overspeedSeverity === 'mild'
          ? amberCol
          : 'rgba(218, 238, 248, 0.72)';
    ctx.strokeStyle = limitRingCol;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.arc(limitCx, limitCy, 27, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = data.overspeedSeverity !== 'none' ? limitRingCol : primaryCol;
    ctx.font = '600 24px "Bahnschrift", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(data.speedLimitKmh !== null ? String(data.speedLimitKmh) : '—', limitCx, limitCy + 1);

    // 3b. Subtle optical hairline divider
    ctx.strokeStyle = 'rgba(180, 224, 240, 0.24)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(196, 146);
    ctx.lineTo(196, 204);
    ctx.stroke();

    // 3c. Gear & Range
    ctx.fillStyle = cyanCol;
    ctx.font = '600 32px "Bahnschrift", "Segoe UI", sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(data.gearLabel, 174, 174);

    ctx.fillStyle = mutedCol;
    ctx.font = '500 20px "Bahnschrift", "Segoe UI", "PingFang SC", sans-serif';
    ctx.fillText(data.rangeLabel, 174, 212);
    ctx.restore();

    // 4. Right flank: Compact Navigation & Optical Lane Ticks (only when navigating)
    if (data.navActive) {
      ctx.save();
      ctx.strokeStyle = 'rgba(180, 224, 240, 0.24)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(486, 142);
      ctx.lineTo(486, 214);
      ctx.stroke();

      // Clean vector arrow glyph
      this.drawNavVectorArrow(ctx, 524, 166, data.navDirection, cyanCol);

      ctx.fillStyle = primaryCol;
      ctx.font = '600 30px "Bahnschrift", "Segoe UI", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(data.navDistanceText, 558, 174);

      if (data.navRoadName) {
        ctx.fillStyle = mutedCol;
        ctx.font = '500 19px "Segoe UI", "PingFang SC", sans-serif';
        ctx.fillText(data.navRoadName, 558, 204, 188);
      }

      if (data.navShowLanes && data.navLanes.length > 0) {
        const startX = 558;
        const laneY = 236;
        for (let i = 0; i < data.navLanes.length && i < 6; i++) {
          const lane = data.navLanes[i]!;
          const lx = startX + i * 24;
          ctx.strokeStyle = lane.recommended
            ? cyanCol
            : lane.active
              ? primaryCol
              : 'rgba(180, 212, 226, 0.34)';
          ctx.lineWidth = lane.recommended ? 2.6 : 1.6;
          ctx.beginPath();
          ctx.moveTo(lx, laneY + 8);
          ctx.lineTo(lx, laneY - 8);
          if (lane.direction === 'left') {
            ctx.lineTo(lx - 6, laneY - 3);
          } else if (lane.direction === 'right') {
            ctx.lineTo(lx + 6, laneY - 3);
          } else if (lane.direction === 'uturn') {
            ctx.arc(lx - 4, laneY - 4, 4, 0, Math.PI, true);
          } else {
            ctx.moveTo(lx - 4, laneY - 3);
            ctx.lineTo(lx, laneY - 8);
            ctx.lineTo(lx + 4, laneY - 3);
          }
          ctx.stroke();
          if (lane.active) {
            ctx.fillStyle = primaryCol;
            ctx.fillRect(lx - 4, laneY + 12, 8, 2);
          }
        }
      }
      ctx.restore();
    }
  }

  private drawNavVectorArrow(
    ctx: Canvas2D,
    cx: number,
    cy: number,
    dir: 'straight' | 'left' | 'right' | 'uturn',
    color: string,
  ): void {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (dir === 'left') {
      ctx.moveTo(cx + 8, cy + 16);
      ctx.lineTo(cx + 8, cy - 2);
      ctx.lineTo(cx - 10, cy - 2);
      ctx.moveTo(cx - 2, cy - 10);
      ctx.lineTo(cx - 10, cy - 2);
      ctx.lineTo(cx - 2, cy + 6);
    } else if (dir === 'right') {
      ctx.moveTo(cx - 8, cy + 16);
      ctx.lineTo(cx - 8, cy - 2);
      ctx.lineTo(cx + 10, cy - 2);
      ctx.moveTo(cx + 2, cy - 10);
      ctx.lineTo(cx + 10, cy - 2);
      ctx.lineTo(cx + 2, cy + 6);
    } else if (dir === 'uturn') {
      ctx.moveTo(cx + 8, cy + 16);
      ctx.lineTo(cx + 8, cy - 4);
      ctx.arc(cx, cy - 4, 8, 0, Math.PI, true);
      ctx.lineTo(cx - 8, cy + 10);
      ctx.moveTo(cx - 14, cy + 4);
      ctx.lineTo(cx - 8, cy + 10);
      ctx.lineTo(cx - 2, cy + 4);
    } else {
      ctx.moveTo(cx, cy + 16);
      ctx.lineTo(cx, cy - 14);
      ctx.moveTo(cx - 8, cy - 6);
      ctx.lineTo(cx, cy - 14);
      ctx.lineTo(cx + 8, cy - 6);
    }
    ctx.stroke();
    ctx.restore();
  }

  public dispose(): void {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
