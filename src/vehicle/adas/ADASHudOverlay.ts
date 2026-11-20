import type { ADASStatusSnapshot } from './ADASTypes';
import type {
  ADASHudVisualState,
  ADASRibbonTone,
  ADASEnvironmentTheme,
} from './visualization/ADASVisualizationTypes';

function ensureAdasV1Styles(): void {
  if (typeof document === 'undefined') return;
  const old = document.getElementById('adas-hud-dynamic-styles');
  if (old) old.remove();
  const styleId = 'adas-v1-hud-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .adas-v1-root {
      --adas-bg: rgba(11, 18, 22, 0.72);
      --adas-border: rgba(112, 196, 222, 0.24);
      --adas-accent: #67c2de;
      --adas-text: #e6f0f3;
      --adas-muted: rgba(196, 214, 220, 0.62);
      --adas-caution-accent: #d99b43;
      --adas-caution-bg: rgba(34, 24, 12, 0.78);
      --adas-caution-border: rgba(217, 155, 67, 0.45);
      --adas-hazard-accent: #dc6868;
      --adas-hazard-bg: rgba(34, 14, 14, 0.82);
      --adas-hazard-border: rgba(220, 104, 104, 0.55);
      position: fixed;
      inset: 0;
      z-index: 28;
      pointer-events: none;
      user-select: none;
      font-family: Inter, "Segoe UI Variable", "Segoe UI", "Microsoft YaHei", sans-serif;
    }
    .adas-v1-root[hidden] { display: none; }
    .adas-v1-root[data-adas-theme="dusk"] {
      --adas-bg: rgba(10, 17, 21, 0.74);
      --adas-border: rgba(96, 180, 204, 0.22);
      --adas-accent: #5bb4cc;
      --adas-text: #dfeaed;
      --adas-muted: rgba(186, 206, 212, 0.58);
    }
    .adas-v1-root[data-adas-theme="night"] {
      --adas-bg: rgba(7, 12, 15, 0.66);
      --adas-border: rgba(96, 168, 162, 0.20);
      --adas-accent: #5ba8a2;
      --adas-text: #c9d8dc;
      --adas-muted: rgba(164, 186, 188, 0.52);
      --adas-caution-accent: #bf8840;
      --adas-caution-border: rgba(191, 136, 64, 0.36);
      --adas-hazard-accent: #c45c5c;
      --adas-hazard-border: rgba(196, 92, 92, 0.44);
    }

    /* 1. Persistent minimalist edge badge (bottom-center) */
    .adas-v1-edge-badge {
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.11);
      background: var(--adas-bg);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      font-size: 10.5px;
      font-weight: 600;
      letter-spacing: 0.06em;
      color: var(--adas-muted);
      opacity: 0.68;
      transition: opacity 0.22s ease, border-color 0.22s ease, color 0.22s ease;
    }
    .adas-v1-edge-badge[data-active="true"] {
      opacity: 0.94;
      color: var(--adas-text);
      border-color: var(--adas-border);
    }
    .adas-v1-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: rgba(148, 163, 184, 0.55);
      transition: background-color 0.22s ease;
    }
    .adas-v1-edge-badge[data-active="true"] .adas-v1-dot {
      background: var(--adas-accent);
    }
    .adas-v1-edge-badge[data-tone="caution"] .adas-v1-dot {
      background: var(--adas-caution-accent);
    }
    .adas-v1-edge-badge[data-tone="hazard"] .adas-v1-dot {
      background: var(--adas-hazard-accent);
    }
    .adas-v1-subfeatures {
      font-size: 9.5px;
      font-weight: 500;
      color: var(--adas-muted);
      padding-left: 5px;
      border-left: 1px solid rgba(255, 255, 255, 0.12);
    }
    .adas-v1-subfeatures:empty { display: none; }

    /* 2. Event-triggered dynamic maneuver pill */
    .adas-v1-maneuver-pill {
      position: absolute;
      bottom: 50px;
      left: 50%;
      transform: translate(-50%, 6px);
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 12px;
      border-radius: 999px;
      border: 1px solid var(--adas-border);
      background: var(--adas-bg);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.04em;
      color: var(--adas-text);
      opacity: 0;
      transition: opacity 0.22s ease, transform 0.22s ease, border-color 0.2s ease;
    }
    .adas-v1-maneuver-pill.visible {
      opacity: 1;
      transform: translate(-50%, 0);
    }
    .adas-v1-maneuver-pill[data-tone="caution"] {
      border-color: var(--adas-caution-border);
      color: var(--adas-caution-accent);
    }
    .adas-v1-maneuver-arrow {
      font-size: 13px;
      line-height: 1;
      color: var(--adas-accent);
    }
    .adas-v1-maneuver-pill[data-tone="caution"] .adas-v1-maneuver-arrow {
      color: var(--adas-caution-accent);
    }
    .adas-v1-maneuver-arrow:empty { display: none; }

    /* 3. Restrained hazard notice (never flashes or obscures driving view) */
    .adas-v1-hazard-pill {
      position: absolute;
      bottom: 86px;
      left: 50%;
      transform: translate(-50%, 4px);
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 5px 13px;
      border-radius: 8px;
      border: 1px solid var(--adas-caution-border);
      background: var(--adas-caution-bg);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      font-size: 12px;
      font-weight: 650;
      letter-spacing: 0.03em;
      color: var(--adas-caution-accent);
      opacity: 0;
      transition: opacity 0.16s ease, transform 0.16s ease;
    }
    .adas-v1-hazard-pill.visible {
      opacity: 1;
      transform: translate(-50%, 0);
    }
    .adas-v1-hazard-pill[data-tone="hazard"] {
      border-color: var(--adas-hazard-border);
      background: var(--adas-hazard-bg);
      color: var(--adas-hazard-accent);
    }

    /* 4. Projected screen-space target distance micro-tag */
    .adas-v1-target-tag {
      position: absolute;
      top: 0;
      left: 0;
      padding: 2px 7px;
      border-radius: 4px;
      border: 1px solid var(--adas-border);
      background: var(--adas-bg);
      font-size: 10.5px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.03em;
      color: var(--adas-text);
      white-space: nowrap;
      will-change: transform, opacity;
      opacity: 0;
      transition: opacity 0.14s ease, border-color 0.18s ease, color 0.18s ease;
    }
    .adas-v1-target-tag.visible {
      opacity: 0.92;
    }
    .adas-v1-target-tag[data-tone="caution"] {
      border-color: var(--adas-caution-border);
      color: var(--adas-caution-accent);
    }
    .adas-v1-target-tag[data-tone="hazard"] {
      border-color: var(--adas-hazard-border);
      color: var(--adas-hazard-accent);
    }
  `;
  document.head.appendChild(style);
}

function isVisualState(
  input: Readonly<ADASHudVisualState | ADASStatusSnapshot>,
): input is Readonly<ADASHudVisualState> {
  return 'maneuverPhrase' in input;
}

/**
 * Minimalist ADAS V1 Screen-Space HUD Overlay.
 * Displays a compact edge ADAS ON/OFF badge, event-triggered short maneuver phrases,
 * restrained hazard cues, and a single unobstructed target distance tag.
 * Zero per-frame heap allocations.
 */
export class ADASHudOverlay {
  private readonly root: HTMLDivElement | null = null;
  private readonly edgeBadge: HTMLDivElement | null = null;
  private readonly edgeLabel: HTMLSpanElement | null = null;
  private readonly subFeatures: HTMLSpanElement | null = null;
  private readonly maneuverPill: HTMLDivElement | null = null;
  private readonly leftArrow: HTMLSpanElement | null = null;
  private readonly maneuverText: HTMLSpanElement | null = null;
  private readonly rightArrow: HTMLSpanElement | null = null;
  private readonly hazardPill: HTMLDivElement | null = null;
  private readonly hazardText: HTMLSpanElement | null = null;
  private readonly targetTag: HTMLDivElement | null = null;

  private lastTheme: ADASEnvironmentTheme = 'DAY';
  private lastEnabled: boolean | null = null;
  private lastEdgeText = '';
  private lastSubText = '';
  private lastEdgeTone = '';
  private lastManeuverPhrase = '';
  private lastManeuverDir = '';
  private lastManeuverTone = '';
  private lastHazardText = '';
  private lastHazardTone = '';
  private lastTargetVisible = false;
  private lastTargetText = '';
  private lastTargetTone = '';

  public constructor(host?: HTMLElement | null) {
    if (typeof document === 'undefined') return;
    ensureAdasV1Styles();

    const root = document.createElement('div');
    root.className = 'adas-v1-root';
    root.dataset.adasTheme = 'day';
    root.hidden = true;

    // 1. Persistent edge status badge
    const edgeBadge = document.createElement('div');
    edgeBadge.className = 'adas-v1-edge-badge';
    edgeBadge.dataset.active = 'false';
    const dot = document.createElement('span');
    dot.className = 'adas-v1-dot';
    const edgeLabel = document.createElement('span');
    edgeLabel.textContent = 'ADAS OFF';
    const subFeatures = document.createElement('span');
    subFeatures.className = 'adas-v1-subfeatures';
    edgeBadge.append(dot, edgeLabel, subFeatures);

    // 2. Event-triggered short maneuver phrase pill
    const maneuverPill = document.createElement('div');
    maneuverPill.className = 'adas-v1-maneuver-pill';
    const leftArrow = document.createElement('span');
    leftArrow.className = 'adas-v1-maneuver-arrow';
    const maneuverText = document.createElement('span');
    const rightArrow = document.createElement('span');
    rightArrow.className = 'adas-v1-maneuver-arrow';
    maneuverPill.append(leftArrow, maneuverText, rightArrow);

    // 3. Restrained hazard notice pill
    const hazardPill = document.createElement('div');
    hazardPill.className = 'adas-v1-hazard-pill';
    const hazardDot = document.createElement('span');
    hazardDot.textContent = '▲';
    hazardDot.style.fontSize = '10px';
    const hazardText = document.createElement('span');
    hazardPill.append(hazardDot, hazardText);

    // 4. Screen-projected single target distance tag
    const targetTag = document.createElement('div');
    targetTag.className = 'adas-v1-target-tag';

    root.append(targetTag, hazardPill, maneuverPill, edgeBadge);
    (host ?? document.body).append(root);

    this.root = root;
    this.edgeBadge = edgeBadge;
    this.edgeLabel = edgeLabel;
    this.subFeatures = subFeatures;
    this.maneuverPill = maneuverPill;
    this.leftArrow = leftArrow;
    this.maneuverText = maneuverText;
    this.rightArrow = rightArrow;
    this.hazardPill = hazardPill;
    this.hazardText = hazardText;
    this.targetTag = targetTag;
  }

  public update(
    _dt: number,
    input: Readonly<ADASHudVisualState | ADASStatusSnapshot>,
    visibleOverride?: boolean,
  ): void {
    if (!this.root || !this.edgeBadge || !this.edgeLabel || !this.subFeatures) return;

    const state: ADASHudVisualState = isVisualState(input)
      ? input
      : this.fromLegacyStatus(input, visibleOverride ?? true);

    const visible = visibleOverride !== undefined ? visibleOverride : state.visible;
    if (this.root.hidden === visible) {
      this.root.hidden = !visible;
    }
    if (!visible) return;

    if (state.theme !== this.lastTheme) {
      this.lastTheme = state.theme;
      this.root.dataset.adasTheme = state.theme.toLowerCase();
    }

    // 1. Edge badge update (compact V3.5 mode + authority + intent without crowding cruise view)
    const edgeText = state.enabled ? (state.modeLabel ?? 'ADAS ON') : 'ADAS OFF';
    const compactSubText =
      state.enabled && state.authorityLabel && state.intentLabel
        ? `${state.authorityLabel} · ${state.intentLabel}`
        : state.subFeatures;
    const edgeTone: ADASRibbonTone =
      state.hazardText && state.hazardTone === 'hazard'
        ? 'hazard'
        : state.hazardText || state.maneuverTone === 'caution' || state.authorityLabel === '驾驶员介入'
          ? 'caution'
          : 'normal';

    if (state.enabled !== this.lastEnabled) {
      this.lastEnabled = state.enabled;
      this.edgeBadge.dataset.active = state.enabled ? 'true' : 'false';
    }
    if (edgeTone !== this.lastEdgeTone) {
      this.lastEdgeTone = edgeTone;
      this.edgeBadge.dataset.tone = edgeTone;
    }
    if (edgeText !== this.lastEdgeText) {
      this.lastEdgeText = edgeText;
      this.edgeLabel.textContent = edgeText;
    }
    if (compactSubText !== this.lastSubText) {
      this.lastSubText = compactSubText;
      this.subFeatures.textContent = compactSubText;
    }

    // 2. Dynamic event-only maneuver pill
    if (this.maneuverPill && this.leftArrow && this.maneuverText && this.rightArrow) {
      const phrase = state.maneuverPhrase;
      const dir = state.maneuverDirection ?? '';
      if (phrase !== this.lastManeuverPhrase) {
        this.lastManeuverPhrase = phrase;
        this.maneuverText.textContent = phrase;
        this.maneuverPill.classList.toggle('visible', phrase.length > 0);
      }
      if (dir !== this.lastManeuverDir) {
        this.lastManeuverDir = dir;
        this.leftArrow.textContent = dir === 'left' ? '‹' : dir === 'uturn' ? '↺' : '';
        this.rightArrow.textContent = dir === 'right' ? '›' : '';
      }
      if (state.maneuverTone !== this.lastManeuverTone) {
        this.lastManeuverTone = state.maneuverTone;
        this.maneuverPill.dataset.tone = state.maneuverTone;
      }
    }

    // 3. Restrained hazard notice pill
    if (this.hazardPill && this.hazardText) {
      if (state.hazardText !== this.lastHazardText) {
        this.lastHazardText = state.hazardText;
        this.hazardText.textContent = state.hazardText;
        this.hazardPill.classList.toggle('visible', state.hazardText.length > 0);
      }
      if (state.hazardTone !== this.lastHazardTone) {
        this.lastHazardTone = state.hazardTone;
        this.hazardPill.dataset.tone = state.hazardTone;
      }
    }

    // 4. Projected target vehicle / obstacle distance micro-tag
    if (this.targetTag) {
      const tag = state.targetTag;
      if (tag.visible !== this.lastTargetVisible) {
        this.lastTargetVisible = tag.visible;
        this.targetTag.classList.toggle('visible', tag.visible);
      }
      if (tag.visible) {
        this.targetTag.style.transform = `translate3d(${tag.x.toFixed(1)}px, ${tag.y.toFixed(1)}px, 0) translate(-50%, -100%)`;
        if (tag.label !== this.lastTargetText) {
          this.lastTargetText = tag.label;
          this.targetTag.textContent = tag.label;
        }
        if (tag.tone !== this.lastTargetTone) {
          this.lastTargetTone = tag.tone;
          this.targetTag.dataset.tone = tag.tone;
        }
      }
    }
  }

  public dispose(): void {
    this.root?.remove();
  }

  private fromLegacyStatus(status: Readonly<ADASStatusSnapshot>, visible: boolean): ADASHudVisualState {
    let maneuverPhrase = '';
    let maneuverDirection: ADASHudVisualState['maneuverDirection'] = null;
    let hazardText = '';
    const hitLabel = status.collisionTargetLabel;
    if (status.state === 'COLLISION_HANDOVER') {
      hazardText = hitLabel
        ? `碰撞停车（${hitLabel}）· 双闪开启 · ADAS 已解除，请接管`
        : '碰撞停车 · 双闪开启 · ADAS 已解除，请接管';
    } else if (status.state === 'COLLISION_STOPPING' || status.state === 'COLLISION_HOLD') {
      hazardText = hitLabel ? `碰撞停车（${hitLabel}）· 双闪开启` : '碰撞停车 · 双闪开启';
    } else if (status.state === 'BLOCKED_RECOVERY_FAILED') {
      hazardText = status.reason.includes('后方存在危险')
        ? '后方存在危险，倒车已停止 · 脱困失败，请人工接管'
        : '脱困失败，请人工接管';
    } else if (status.enabled) {
      if (status.state === 'BLOCKED_REVERSE_STOP') {
        if (status.reason.includes('危险')) hazardText = '后方存在危险，倒车已停止';
        else maneuverPhrase = '正在重新规划前进路径';
      } else if (status.state === 'BLOCKED_RECOVERY_CHECK') {
        maneuverPhrase = '前方受阻，正在检查倒车空间';
      } else if (status.state === 'BLOCKED_REVERSE') {
        maneuverPhrase = '正在低速倒车脱困';
      } else if (status.state === 'BLOCKED_FORWARD_AVOIDANCE') {
        maneuverPhrase = '正在重新规划前进路径';
      } else if (status.state === 'EMERGENCY_BRAKING') hazardText = '请注意 · 紧急制动';
      else if (status.state === 'ROAD_BLOCKED' || status.state === 'SAFE_STOP') hazardText = '道路受阻 · 请接管';
      else if (status.state === 'UNAVAILABLE') hazardText = status.reason || 'ADAS 暂不可用';
      else if (status.state === 'PREPARING_LANE_CHANGE') {
        maneuverDirection = status.desiredTurnSignal;
        maneuverPhrase = maneuverDirection === 'left' ? '准备左变道' : '准备右变道';
      } else if (status.state === 'LANE_CHANGING' || status.state === 'LANE_CHANGE') {
        maneuverDirection = status.desiredTurnSignal;
        maneuverPhrase = status.overtakingPhase && status.overtakingPhase !== 'none'
          ? '正在超车'
          : maneuverDirection === 'left'
            ? '正在左变道'
            : '正在右变道';
      } else if (status.state === 'AVOIDANCE') {
        maneuverPhrase = '绕行障碍物';
      } else if (status.maneuver === 'TURN_LEFT') {
        maneuverDirection = 'left';
        maneuverPhrase = '即将左转';
      } else if (status.maneuver === 'TURN_RIGHT') {
        maneuverDirection = 'right';
        maneuverPhrase = '即将右转';
      } else if (status.maneuver === 'EXIT_RAMP' || status.state === 'RAMP_EXIT') {
        maneuverDirection = 'right';
        maneuverPhrase = '驶出匝道';
      } else if (status.maneuver === 'MERGE' || status.state === 'RAMP_ENTRY') {
        maneuverDirection = 'left';
        maneuverPhrase = '驶入匝道';
      }
    }
    const modeLabel: ADASHudVisualState['modeLabel'] =
      status.drivingMode === 'MAP_DEGRADED' || status.degraded || status.state === 'DEGRADED'
        ? '降级驾驶'
        : status.drivingMode === 'FREE_DRIVING'
          ? '自由驾驶'
          : '导航驾驶';
    const authorityLabel: ADASHudVisualState['authorityLabel'] =
      status.controlAuthority === 'DRIVER_INTERVENING' ||
      status.driverSteeringOverride ||
      status.driverAccelerationOverride ||
      status.driverBrakeOverride
        ? '驾驶员介入'
        : status.controlAuthority === 'RECOVERING'
          ? '等待恢复'
          : '系统控制';
    const intentLabel =
      status.driverIntent === 'EXIT_RAMP' || status.maneuver === 'EXIT_RAMP'
        ? '匝道驶出'
        : status.maneuver === 'MERGE'
          ? '匝道合流'
          : status.driverIntent === 'TURN_LEFT' || status.maneuver === 'TURN_LEFT'
            ? '左转'
            : status.driverIntent === 'TURN_RIGHT' || status.maneuver === 'TURN_RIGHT'
              ? '右转'
              : status.maneuver === 'LANE_CHANGE_LEFT' || status.maneuver === 'LANE_CHANGE_RIGHT'
                ? '变道'
                : '直行';
    return {
      visible,
      enabled: status.enabled,
      state: status.state,
      theme: 'DAY',
      subFeatures: status.enabled ? 'ACC · LKA' : '',
      modeLabel,
      authorityLabel,
      intentLabel,
      maneuverPhrase,
      maneuverDirection,
      maneuverTone: 'normal',
      hazardText,
      hazardTone: status.state === 'UNAVAILABLE' ? 'caution' : 'hazard',
      targetTag: { visible: false, x: 0, y: 0, label: '', tone: 'normal' },
    };
  }
}
