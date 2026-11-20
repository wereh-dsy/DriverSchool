import { resolveAnnotationAccentHex } from './HUDProjectionUtils';
import type { VehicleHUDState, VehicleHUDTargetAnnotation } from './VehicleHUDTypes';

const MAX_ANNOTATION_NODES = 8;

const HUD_STYLE_CSS = `
.vehicle-hud-root {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 30;
  font-family: "DIN Alternate", "Bahnschrift", "Segoe UI", "PingFang SC", sans-serif;
  user-select: none;
  overflow: hidden;
  transition: opacity 220ms ease;
}
.vehicle-hud-root[data-visible="false"] {
  opacity: 0;
  visibility: hidden;
}
/* Windshield projection plane: gentle forward optical depth tilt */
.vhud-windshield-anchor {
  position: fixed;
  left: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  transform-origin: center bottom;
  will-change: transform;
}
/* Emergency/Takeover alert: slim translucent open optical sweep (no heavy UI card) */
.vhud-warning-pill {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 20px;
  background: transparent;
  border: none;
  font-size: 12px;
  letter-spacing: 0.04em;
  max-width: 460px;
}
.vhud-warning-pill[data-severity="hazard"] {
  background: linear-gradient(90deg, transparent, rgba(168, 28, 32, 0.34), transparent);
  border-top: 1px solid rgba(255, 118, 118, 0.56);
  border-bottom: 1px solid rgba(255, 118, 118, 0.56);
  color: #ffe8e8;
}
.vhud-warning-pill[data-severity="caution"] {
  background: linear-gradient(90deg, transparent, rgba(128, 86, 18, 0.30), transparent);
  border-top: 1px solid rgba(246, 188, 76, 0.52);
  border-bottom: 1px solid rgba(246, 188, 76, 0.52);
  color: #fff4dd;
}
.vhud-warning-title {
  font-weight: 600;
  white-space: nowrap;
}
.vhud-warning-detail {
  opacity: 0.86;
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.vhud-maneuver-pill {
  padding: 2px 10px;
  background: transparent;
  border: none;
  border-bottom: 1.5px solid rgba(116, 224, 250, 0.52);
  font-size: 11.5px;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: rgba(218, 246, 255, 0.94);
}
.vhud-maneuver-pill[data-tone="caution"] {
  border-bottom-color: rgba(244, 184, 72, 0.65);
  color: #ffe9c2;
}
.vhud-maneuver-pill[data-tone="hazard"] {
  border-bottom-color: rgba(255, 108, 108, 0.72);
  color: #ffdcdc;
}
/* Primary floating windshield optical cluster: zero dark background box, zero border card */
.vhud-primary-bar {
  display: flex;
  align-items: baseline;
  gap: 22px;
  padding: 2px 6px 4px;
  background: transparent;
  border: none;
  backdrop-filter: none;
  transform: perspective(860px) rotateX(8deg);
  position: relative;
}
.vhud-primary-bar::after {
  content: "";
  position: absolute;
  left: 6%;
  right: 6%;
  bottom: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(154, 218, 240, 0.24), transparent);
}
.vhud-speed-group {
  display: flex;
  align-items: baseline;
  gap: 5px;
}
.vhud-speed-val {
  font-size: 42px;
  font-weight: 300;
  line-height: 0.96;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.025em;
}
.vhud-speed-unit {
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.10em;
  opacity: 0.62;
}
.vhud-divider {
  width: 1px;
  height: 16px;
  align-self: center;
  background: linear-gradient(180deg, transparent, rgba(210, 236, 248, 0.28), transparent);
}
.vhud-limit-sign {
  width: 28px;
  height: 28px;
  align-self: center;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  border: 1.8px solid rgba(226, 240, 248, 0.62);
  background: transparent;
}
.vhud-limit-sign[data-overspeed="mild"] {
  border-color: rgba(246, 188, 76, 0.90);
  color: #ffe09a;
}
.vhud-limit-sign[data-overspeed="severe"] {
  border-color: rgba(255, 102, 102, 0.96);
  color: #ffb0b0;
  box-shadow: 0 0 8px rgba(255, 92, 92, 0.42);
}
.vhud-gear-box {
  min-width: 20px;
  text-align: center;
  font-size: 17px;
  font-weight: 500;
  letter-spacing: 0.04em;
  font-variant-numeric: tabular-nums;
}
.vhud-range-box {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.1;
}
.vhud-range-label {
  font-size: 8.5px;
  letter-spacing: 0.08em;
  opacity: 0.56;
}
.vhud-range-val {
  font-size: 12.5px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
/* Floating optical navigation guidance in forward plane (zero card box) */
.vhud-nav-strip {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 1px 4px;
  background: transparent;
  border: none;
  backdrop-filter: none;
  transform: perspective(860px) rotateX(6deg);
  font-size: 12px;
}
.vhud-nav-sym {
  font-size: 18px;
  font-weight: 600;
  line-height: 1;
}
.vhud-nav-dist {
  font-weight: 600;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
}
.vhud-nav-road {
  opacity: 0.78;
  max-width: 185px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.vhud-nav-lanes {
  display: flex;
  align-items: center;
  gap: 5px;
  padding-left: 8px;
  border-left: 1px solid rgba(210, 236, 248, 0.20);
}
.vhud-lane-pill {
  width: 12px;
  height: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  opacity: 0.34;
  background: transparent;
  border-bottom: 1.5px solid transparent;
}
.vhud-lane-pill[data-rec="true"] {
  opacity: 0.96;
  color: #92ebff;
  font-weight: 700;
  border-bottom-color: rgba(116, 224, 250, 0.85);
}
.vhud-lane-pill[data-active="true"] {
  opacity: 0.90;
  text-shadow: 0 0 6px rgba(255, 255, 255, 0.6);
}
/* Restrained automotive AR optical callout: floating numeric + thin optical tick bar (no dark game box!) */
.vhud-target-tag {
  position: fixed;
  top: 0;
  left: 0;
  --tag-accent: #73d3ec;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 0 2px 3px;
  background: transparent;
  border: none;
  border-radius: 0;
  backdrop-filter: none;
  color: rgba(240, 250, 255, 0.94);
  font-size: 10.5px;
  line-height: 1.15;
  white-space: nowrap;
  will-change: transform;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.92), 0 0 2px rgba(0, 0, 0, 0.85);
}
.vhud-target-tag::after {
  content: "";
  width: 18px;
  height: 1.5px;
  margin-top: 2px;
  background: var(--tag-accent);
  box-shadow: 0 0 6px var(--tag-accent);
}
.vhud-target-tag[data-edge="LR"],
.vhud-target-tag[data-edge="RR"] {
  padding: 4px 8px;
  border-top: 1px solid var(--tag-accent);
  border-bottom: 1px solid var(--tag-accent);
}
.vhud-target-tag[data-edge="LR"]::after,
.vhud-target-tag[data-edge="RR"]::after {
  display: none;
}
.vhud-target-main {
  font-weight: 600;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--tag-accent);
}
.vhud-target-sub {
  font-size: 9.5px;
  opacity: 0.84;
  font-variant-numeric: tabular-nums;
}
.vhud-target-sub:empty {
  display: none;
}
`;

/**
 * Vehicle-native windshield HUD DOM overlay mounted outside `.game-ui`
 * so Immersive Mode can hide Game UI while leaving core Vehicle HUD visible.
 */
export class VehicleHUDOverlay {
  private readonly root: HTMLDivElement;
  private readonly anchor: HTMLDivElement;
  private readonly warningPill: HTMLDivElement;
  private readonly warningTitle: HTMLSpanElement;
  private readonly warningDetail: HTMLSpanElement;
  private readonly maneuverPill: HTMLDivElement;
  private readonly primaryBar: HTMLDivElement;
  private readonly speedVal: HTMLSpanElement;
  private readonly limitSign: HTMLDivElement;
  private readonly gearBox: HTMLDivElement;
  private readonly rangeLabel: HTMLSpanElement;
  private readonly rangeVal: HTMLSpanElement;
  private readonly navStrip: HTMLDivElement;
  private readonly navSym: HTMLSpanElement;
  private readonly navDist: HTMLSpanElement;
  private readonly navRoad: HTMLSpanElement;
  private readonly navLanes: HTMLDivElement;
  private readonly targetNodes: Array<{
    box: HTMLDivElement;
    main: HTMLSpanElement;
    sub: HTMLSpanElement;
  }> = [];

  private styleNode: HTMLStyleElement | null = null;
  private disposed = false;

  public constructor(private readonly host: HTMLElement) {
    if (typeof document !== 'undefined') {
      document.getElementById('vehicle-hud-v11-styles')?.remove();
      const existingStyle = document.getElementById('vehicle-hud-v12-styles');
      if (!existingStyle) {
        const st = document.createElement('style');
        st.id = 'vehicle-hud-v12-styles';
        st.textContent = HUD_STYLE_CSS;
        document.head.appendChild(st);
        this.styleNode = st;
      }
    }

    this.root = document.createElement('div');
    this.root.className = 'vehicle-hud-root';
    this.root.dataset.visible = 'false';

    this.anchor = document.createElement('div');
    this.anchor.className = 'vhud-windshield-anchor';

    this.warningPill = document.createElement('div');
    this.warningPill.className = 'vhud-warning-pill';
    this.warningPill.hidden = true;
    this.warningTitle = document.createElement('span');
    this.warningTitle.className = 'vhud-warning-title';
    this.warningDetail = document.createElement('span');
    this.warningDetail.className = 'vhud-warning-detail';
    this.warningPill.append(this.warningTitle, this.warningDetail);

    this.maneuverPill = document.createElement('div');
    this.maneuverPill.className = 'vhud-maneuver-pill';
    this.maneuverPill.hidden = true;

    this.navStrip = document.createElement('div');
    this.navStrip.className = 'vhud-nav-strip';
    this.navStrip.hidden = true;
    this.navSym = document.createElement('span');
    this.navSym.className = 'vhud-nav-sym';
    this.navDist = document.createElement('span');
    this.navDist.className = 'vhud-nav-dist';
    this.navRoad = document.createElement('span');
    this.navRoad.className = 'vhud-nav-road';
    this.navLanes = document.createElement('div');
    this.navLanes.className = 'vhud-nav-lanes';
    this.navStrip.append(this.navSym, this.navDist, this.navRoad, this.navLanes);

    this.primaryBar = document.createElement('div');
    this.primaryBar.className = 'vhud-primary-bar';

    const speedGroup = document.createElement('div');
    speedGroup.className = 'vhud-speed-group';
    this.speedVal = document.createElement('span');
    this.speedVal.className = 'vhud-speed-val';
    this.speedVal.textContent = '0';
    const speedUnit = document.createElement('span');
    speedUnit.className = 'vhud-speed-unit';
    speedUnit.textContent = 'km/h';
    speedGroup.append(this.speedVal, speedUnit);

    const div1 = document.createElement('div');
    div1.className = 'vhud-divider';
    this.limitSign = document.createElement('div');
    this.limitSign.className = 'vhud-limit-sign';
    this.limitSign.textContent = '—';

    const div2 = document.createElement('div');
    div2.className = 'vhud-divider';
    this.gearBox = document.createElement('div');
    this.gearBox.className = 'vhud-gear-box';
    this.gearBox.textContent = 'N';

    const div3 = document.createElement('div');
    div3.className = 'vhud-divider';
    const rangeBox = document.createElement('div');
    rangeBox.className = 'vhud-range-box';
    this.rangeLabel = document.createElement('span');
    this.rangeLabel.className = 'vhud-range-label';
    this.rangeLabel.textContent = '续航';
    this.rangeVal = document.createElement('span');
    this.rangeVal.className = 'vhud-range-val';
    this.rangeVal.textContent = '—';
    rangeBox.append(this.rangeLabel, this.rangeVal);

    this.primaryBar.append(speedGroup, div1, this.limitSign, div2, this.gearBox, div3, rangeBox);
    this.anchor.append(this.warningPill, this.maneuverPill, this.navStrip, this.primaryBar);
    this.root.appendChild(this.anchor);

    for (let i = 0; i < MAX_ANNOTATION_NODES; i++) {
      const box = document.createElement('div');
      box.className = 'vhud-target-tag';
      box.hidden = true;
      const main = document.createElement('span');
      main.className = 'vhud-target-main';
      const sub = document.createElement('span');
      sub.className = 'vhud-target-sub';
      box.append(main, sub);
      this.root.appendChild(box);
      this.targetNodes.push({ box, main, sub });
    }

    this.host.appendChild(this.root);
  }

  public update(state: VehicleHUDState): void {
    if (this.disposed) return;

    this.root.dataset.visible = state.visible ? 'true' : 'false';
    if (!state.visible) return;

    const pal = state.palette;
    const prof = state.profile;
    this.root.style.opacity = String(pal.opacityScale);
    this.root.style.color = pal.primaryTextColor;
    this.root.style.textShadow = pal.textShadow;

    this.anchor.style.bottom = `${(prof.bottomOffsetRatio * 100).toFixed(2)}vh`;
    this.anchor.style.transform = `translate3d(calc(-50% + ${prof.centerXOffsetPx}px), ${state.pitchShiftPx.toFixed(1)}px, 0) scale(${state.opticalScale.toFixed(3)}) rotate(${state.rollDeg.toFixed(2)}deg)`;

    this.primaryBar.style.background = 'transparent';
    this.primaryBar.style.borderColor = 'transparent';

    // 1. Primary Vehicle Info (speed, limit, gear, range)
    const info = state.info;
    this.speedVal.textContent = String(info.speedKmh);
    this.speedVal.style.color =
      info.overspeedSeverity === 'severe'
        ? pal.hazardColor
        : info.overspeedSeverity === 'mild'
          ? pal.cautionColor
          : pal.primaryTextColor;

    this.limitSign.textContent = info.speedLimitKmh !== null ? String(info.speedLimitKmh) : '—';
    this.limitSign.dataset.overspeed = info.overspeedSeverity;

    this.gearBox.textContent = info.gearLabel;
    this.gearBox.style.color = pal.accentCyanColor;

    this.rangeLabel.textContent =
      info.rangeKind === 'ev' ? '电续航' : info.rangeKind === 'hybrid' ? '综合续航' : '续航';
    this.rangeVal.textContent = info.rangeLabel;

    // 2. Compact Navigation Cue
    const nav = state.navigation;
    this.navStrip.hidden = !nav.active;
    if (nav.active) {
      this.navSym.textContent = nav.symbol;
      this.navSym.style.color = pal.accentCyanColor;
      this.navDist.textContent = nav.distanceText;
      this.navRoad.textContent = nav.roadName || nav.maneuverText;
      this.navLanes.hidden = !nav.showLanes;
      if (nav.showLanes) {
        while (this.navLanes.childElementCount < nav.lanes.length) {
          const pill = document.createElement('span');
          pill.className = 'vhud-lane-pill';
          this.navLanes.appendChild(pill);
        }
        while (this.navLanes.childElementCount > nav.lanes.length) {
          this.navLanes.lastElementChild?.remove();
        }
        for (let i = 0; i < nav.lanes.length; i++) {
          const lane = nav.lanes[i]!;
          const el = this.navLanes.children[i] as HTMLElement;
          el.dataset.rec = lane.recommended ? 'true' : 'false';
          el.dataset.active = lane.active ? 'true' : 'false';
          el.textContent =
            lane.direction === 'left'
              ? '↰'
              : lane.direction === 'right'
                ? '↱'
                : lane.direction === 'uturn'
                  ? '↺'
                  : '↑';
        }
      }
    }

    // 3. Warnings & urgent maneuver cue
    if (state.warning) {
      this.warningPill.hidden = false;
      this.warningPill.dataset.severity = state.warning.severity;
      this.warningTitle.textContent = state.warning.title;
      this.warningDetail.textContent = state.warning.detail;
      this.maneuverPill.hidden = true;
    } else {
      this.warningPill.hidden = true;
      this.maneuverPill.hidden = !state.maneuver.visible;
      if (state.maneuver.visible) {
        this.maneuverPill.dataset.tone = state.maneuver.tone;
        this.maneuverPill.textContent = state.maneuver.phrase;
      }
    }

    // 4. Pooled World-Projected Multi-Target Annotations
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 720;
    for (let i = 0; i < MAX_ANNOTATION_NODES; i++) {
      const node = this.targetNodes[i]!;
      const ann = state.annotations[i];
      if (!ann) {
        node.box.hidden = true;
        continue;
      }
      this.applyTargetNode(node, ann, pal.time, vw, vh);
    }
  }

  private applyTargetNode(
    node: { box: HTMLDivElement; main: HTMLSpanElement; sub: HTMLSpanElement },
    ann: VehicleHUDTargetAnnotation,
    time: 'DAY' | 'DUSK' | 'NIGHT',
    vw: number,
    vh: number,
  ): void {
    let sx = ann.screenX;
    let sy = ann.screenY;
    let edgeMode = '';
    // If blind-spot rear approacher is outside front camera frustum, dock subtle peripheral edge arc
    if (!ann.visible) {
      if (ann.slot === 'LR' || ann.slot === 'RR') {
        sx = ann.slot === 'LR' ? Math.max(76, vw * 0.10) : Math.min(vw - 76, vw * 0.90);
        sy = vh * 0.62;
        edgeMode = ann.slot;
      } else {
        node.box.hidden = true;
        return;
      }
    }
    node.box.hidden = false;
    node.box.dataset.edge = edgeMode;
    node.box.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -100%)`;
    node.box.style.setProperty('--tag-accent', resolveAnnotationAccentHex(time, ann.tone));
    node.main.textContent = ann.shortTag;
    node.sub.textContent = ann.subTag;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.remove();
    this.styleNode?.remove();
    this.styleNode = null;
  }
}
