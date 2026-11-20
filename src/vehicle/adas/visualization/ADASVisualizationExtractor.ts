import { PerspectiveCamera, Vector3 } from 'three';
import {
  clampADAS,
  evaluateLocalTrajectoryOffsetAtDs,
  type ADASObstacleAssessment,
  type ADASPlanSnapshot,
  type ADASStatusSnapshot,
  type ADASTrafficRuleDecision,
  type ADASVehicleState,
  type TrafficActorSnapshot,
} from '../ADASTypes';
import type { StaticCollider } from '../../physics/CollisionSystem';
import type { DrivingGround } from '../../../world/DrivingGround';
import {
  DEFAULT_ADAS_VISUALIZATION_CONFIG,
  type ADASVisualizationConfig,
} from './ADASVisualizationConfig';
import type {
  ADASEnvironmentTheme,
  ADASHudVisualState,
  ADASRibbonTone,
  ADASRibbonTrigger,
  ADASWorldVisualPacket,
} from './ADASVisualizationTypes';

export interface ADASVisualizationInput {
  readonly dt: number;
  readonly visible: boolean;
  readonly enabled: boolean;
  readonly status: Readonly<ADASStatusSnapshot>;
  readonly plan: Readonly<ADASPlanSnapshot>;
  readonly obstacle: Readonly<ADASObstacleAssessment>;
  readonly rules: Readonly<ADASTrafficRuleDecision>;
  readonly vehicle: Readonly<ADASVehicleState>;
  readonly samplesApproachLane: number;
  readonly theme: ADASEnvironmentTheme;
  readonly ground?: DrivingGround | null;
  readonly camera?: PerspectiveCamera | null;
  readonly viewportWidth?: number;
  readonly viewportHeight?: number;
  readonly colliders?: readonly StaticCollider[];
  readonly actors?: readonly TrafficActorSnapshot[];
  readonly actorCount?: number;
  readonly capabilities?: {
    readonly acc?: boolean;
    readonly cruiseControl?: boolean;
    readonly lka?: boolean;
    readonly lcc?: boolean;
  };
  readonly legacyCruiseActive?: boolean;
  readonly legacyLkaActive?: boolean;
  readonly legacyLccActive?: boolean;
}

const EMPTY_F32 = new Float32Array(0);

/**
 * Extracts minimalist ADAS V1 world-space ribbon packets and screen-space HUD state
 * directly from existing ADASController outputs without modifying ADAS decision logic.
 */
export class ADASVisualizationExtractor {
  private readonly config: ADASVisualizationConfig;
  private readonly maxSamples: number;
  private readonly pointsScratch: Float32Array;
  private readonly normalsScratch: Float32Array;
  private readonly distancesScratch: Float32Array;
  private readonly dir2 = { x: 0, y: -1 };
  private readonly projVec = new Vector3();
  private readonly camPos = new Vector3();

  private lastRouteVersion = -1;
  private replanTimer = 0;

  public readonly hudState: ADASHudVisualState = {
    visible: false,
    enabled: false,
    state: 'OFF',
    theme: 'DAY',
    subFeatures: '',
    maneuverPhrase: '',
    maneuverDirection: null,
    maneuverTone: 'normal',
    hazardText: '',
    hazardTone: 'caution',
    targetTag: {
      visible: false,
      x: 0,
      y: 0,
      label: '',
      tone: 'normal',
    },
  };

  public constructor(config: Partial<ADASVisualizationConfig> = {}) {
    this.config = {
      ...DEFAULT_ADAS_VISUALIZATION_CONFIG,
      ...config,
      ribbon: { ...DEFAULT_ADAS_VISUALIZATION_CONFIG.ribbon, ...config.ribbon },
      targetMarker: { ...DEFAULT_ADAS_VISUALIZATION_CONFIG.targetMarker, ...config.targetMarker },
      themes: { ...DEFAULT_ADAS_VISUALIZATION_CONFIG.themes, ...config.themes },
    };
    this.maxSamples = Math.max(8, this.config.ribbon.maxSamples);
    this.pointsScratch = new Float32Array(this.maxSamples * 3);
    this.normalsScratch = new Float32Array(this.maxSamples * 3);
    this.distancesScratch = new Float32Array(this.maxSamples);
  }

  public reset(): void {
    this.lastRouteVersion = -1;
    this.replanTimer = 0;
  }

  /** Updates screen-space HUD presentation state. Allocates nothing per call. */
  public updateHudState(input: ADASVisualizationInput): ADASHudVisualState {
    const dt = Number.isFinite(input.dt) && input.dt > 0 ? Math.min(input.dt, 0.2) : 0;
    const hud = this.hudState;
    hud.visible = input.visible;
    hud.enabled = input.enabled;
    hud.state = input.status.state;
    hud.theme = input.theme;

    this.trackReplanTimer(dt, input.enabled, input.plan);

    if (!input.visible) {
      hud.maneuverPhrase = '';
      hud.maneuverDirection = null;
      hud.hazardText = '';
      hud.targetTag.visible = false;
      return hud;
    }

    hud.subFeatures = this.buildSubFeaturesLabel(input);
    hud.modeLabel = this.resolveModeLabel(input);
    hud.authorityLabel = this.resolveAuthorityLabel(input);
    hud.intentLabel = this.resolveIntentLabel(input);
    const persistHandoverAlert =
      input.status.state === 'COLLISION_HANDOVER' || input.status.state === 'BLOCKED_RECOVERY_FAILED';
    if (!input.enabled && !persistHandoverAlert) {
      hud.maneuverPhrase = '';
      hud.maneuverDirection = null;
      hud.maneuverTone = 'normal';
      hud.hazardText = '';
      hud.targetTag.visible = false;
      return hud;
    }

    this.resolveHudManeuverAndHazard(input, hud);
    if (input.enabled) {
      this.resolveScreenTargetTag(input, hud);
    } else {
      hud.targetTag.visible = false;
    }
    return hud;
  }

  /**
   * Builds a compact world-space visualization packet for RendererRuntime.
   * Only samples spline elevation/normals when the event-triggered path ribbon is active.
   */
  public buildWorldPacket(input: ADASVisualizationInput): ADASWorldVisualPacket {
    const ribbonCfg = this.config.ribbon;
    const enabledVisible = input.visible && input.enabled && input.plan.valid;
    const { trigger, tone, urgent } = enabledVisible
      ? this.resolveRibbonTrigger(input)
      : { trigger: 'none' as ADASRibbonTrigger, tone: 'normal' as ADASRibbonTone, urgent: false };

    const ribbonActive = enabledVisible && trigger !== 'none';
    const sampleCount = ribbonActive ? this.sampleRibbonTrajectory(input) : 0;
    const widthM = clampADAS(
      input.vehicle.vehicleWidth * ribbonCfg.widthVehicleScale,
      ribbonCfg.minWidthM,
      ribbonCfg.maxWidthM,
    );
    const halfLen = input.vehicle.vehicleLength * 0.5;
    const nearFadeStartM = Math.max(1.2, halfLen + ribbonCfg.nearStartOffsetFromBumperM);
    const nearFadeEndM = nearFadeStartM + ribbonCfg.nearFadeSpanM;

    const target = this.buildWorldTargetMarker(input);

    return {
      visible: input.visible && input.enabled,
      ribbonActive: ribbonActive && sampleCount >= 2,
      urgent,
      trigger,
      tone,
      theme: input.theme,
      sampleCount: sampleCount >= 2 ? sampleCount : 0,
      points: sampleCount >= 2 ? this.pointsScratch.slice(0, sampleCount * 3) : EMPTY_F32,
      normals: sampleCount >= 2 ? this.normalsScratch.slice(0, sampleCount * 3) : EMPTY_F32,
      distances: sampleCount >= 2 ? this.distancesScratch.slice(0, sampleCount) : EMPTY_F32,
      widthM,
      nearFadeStartM,
      nearFadeEndM,
      egoX: input.vehicle.x,
      egoZ: input.vehicle.z,
      egoYaw: input.vehicle.yaw,
      target,
    };
  }

  private trackReplanTimer(dt: number, enabled: boolean, plan: Readonly<ADASPlanSnapshot>): void {
    if (!enabled) {
      this.lastRouteVersion = -1;
      this.replanTimer = 0;
      return;
    }
    if (plan.valid) {
      if (this.lastRouteVersion >= 0 && plan.routeVersion !== this.lastRouteVersion) {
        this.replanTimer = this.config.ribbon.replanDisplaySeconds;
      }
      this.lastRouteVersion = plan.routeVersion;
    }
    if (this.replanTimer > 0) {
      this.replanTimer = Math.max(0, this.replanTimer - dt);
    }
  }

  private resolveRibbonTrigger(input: ADASVisualizationInput): {
    trigger: ADASRibbonTrigger;
    tone: ADASRibbonTone;
    urgent: boolean;
  } {
    const state = input.status.state;
    const plan = input.plan;
    const obs = input.obstacle;

    if (
      state === 'OFF' ||
      state === 'INITIALIZING' ||
      state === 'UNAVAILABLE' ||
      state === 'DRIVER_STEERING_OVERRIDE' ||
      state === 'COLLISION_STOPPING' ||
      state === 'COLLISION_HOLD' ||
      state === 'COLLISION_HANDOVER' ||
      state === 'BLOCKED_RECOVERY_CHECK' ||
      state === 'BLOCKED_REVERSE' ||
      state === 'BLOCKED_REVERSE_STOP' ||
      state === 'BLOCKED_RECOVERY_FAILED'
    ) {
      return { trigger: 'none', tone: 'normal', urgent: false };
    }

    // 1. Immediate emergency avoidance / road blockage
    if (
      state === 'EMERGENCY_BRAKING' ||
      state === 'ROAD_BLOCKED' ||
      state === 'SAFE_STOP' ||
      (obs.cutInDetected && (obs.emergencyBraking || obs.avoidanceRequest !== 'none'))
    ) {
      return { trigger: 'hazard', tone: 'hazard', urgent: true };
    }

    // 2. Obstacle bypass / avoidance (including continuous in-lane & partial encroachment bypass)
    const lt = plan.localTrajectory;
    const localBypassActive = Boolean(
      lt &&
      lt.active &&
      (lt.mode === 'in_lane_offset' || lt.mode === 'partial_encroach') &&
      (Math.abs(lt.targetOffsetM) > 0.22 || Math.abs(lt.currentOffsetM) > 0.22),
    );
    if (
      state === 'AVOIDANCE' ||
      state === 'BLOCKED_FORWARD_AVOIDANCE' ||
      obs.allowSolidBypass ||
      localBypassActive ||
      (plan.laneChange.active && plan.laneChange.reason === 'obstacle' && !plan.overtaking.active)
    ) {
      return {
        trigger: 'avoidance',
        tone: obs.allowSolidBypass || obs.leadIsStatic || lt?.mode === 'partial_encroach' ? 'caution' : 'normal',
        urgent: obs.cutInDetected || obs.ttcSeconds < 2.6,
      };
    }

    // 3. Active overtaking sequence
    if (plan.overtaking.active || obs.overtakeRecommended) {
      return { trigger: 'overtaking', tone: 'normal', urgent: false };
    }

    // 4. Intentional lane change
    if (
      plan.laneChange.active ||
      state === 'PREPARING_LANE_CHANGE' ||
      state === 'LANE_CHANGING' ||
      state === 'LANE_CHANGE'
    ) {
      return { trigger: 'lane-change', tone: 'normal', urgent: false };
    }

    // 5. Highway ramp entry / exit
    if (
      plan.maneuver === 'EXIT_RAMP' ||
      plan.maneuver === 'MERGE' ||
      state === 'RAMP_ENTRY' ||
      state === 'RAMP_EXIT'
    ) {
      return { trigger: 'ramp', tone: 'normal', urgent: false };
    }

    // 6. Intersection left / right / U-turn (never straight cruise through green light)
    if (
      plan.maneuver === 'TURN_LEFT' ||
      plan.maneuver === 'TURN_RIGHT' ||
      plan.maneuver === 'UTURN' ||
      (state === 'INTERSECTION' && plan.upcomingJunction.turnDirection !== 'straight')
    ) {
      return { trigger: 'turn', tone: 'normal', urgent: false };
    }

    // 7. Route replan confirmation pulse
    if (this.replanTimer > 0) {
      return { trigger: 'replan', tone: 'normal', urgent: false };
    }

    // Default: ordinary cruise, normal car-following, normal road curves -> stay clean!
    return { trigger: 'none', tone: 'normal', urgent: false };
  }

  private sampleRibbonTrajectory(input: ADASVisualizationInput): number {
    const plan = input.plan;
    const samples = plan.samples;
    if (!plan.valid || plan.sampleCount < 2) return 0;

    const lc = plan.laneChange;
    const samplesInToLane = input.samplesApproachLane === lc.toLaneIndex;
    const egoSpeed = Math.max(5.5, input.vehicle.speed);
    const lcDist = Math.max(14, egoSpeed * Math.max(0.8, lc.durationSeconds));
    const remSigS =
      lc.active && lc.phase === 'signaling'
        ? Math.max(0, lc.signalLeadSeconds - lc.elapsedSeconds)
        : 0;
    const sigDist = remSigS * egoSpeed;
    const tauNow =
      lc.active && lc.phase === 'executing'
        ? clampADAS(lc.elapsedSeconds / Math.max(0.5, lc.durationSeconds), 0, 1)
        : 0;

    const startIdx = Math.max(0, plan.egoSampleIndex - 2);
    const maxLen = this.config.ribbon.maxLengthM;
    const minStep = this.config.ribbon.minStepM;

    let count = 0;
    let arcM = 0;
    let prevX = 0;
    let prevZ = 0;
    let refHeight = input.vehicle.y;

    for (let i = startIdx; i < plan.sampleCount && count < this.maxSamples; i++) {
      const sp = samples[i]!;
      const ds = sp.s - plan.egoS;
      if (ds > maxLen + 4) break;

      let latShift = 0;
      if (lc.active) {
        if (lc.phase === 'signaling') {
          if (ds > sigDist) {
            const tau = clampADAS((ds - sigDist) / lcDist, 0, 1);
            const sCurve = tau * tau * tau * (10 + tau * (-15 + 6 * tau));
            latShift = sCurve * lc.lateralDeltaM;
          }
        } else if (lc.phase === 'executing') {
          const tau = clampADAS(tauNow + Math.max(0, ds) / lcDist, 0, 1);
          const sCurve = tau * tau * tau * (10 + tau * (-15 + 6 * tau));
          latShift = samplesInToLane ? (sCurve - 1.0) * lc.lateralDeltaM : sCurve * lc.lateralDeltaM;
        } else if (lc.phase === 'settling') {
          latShift = samplesInToLane ? 0 : lc.lateralDeltaM;
        }
      } else if (plan.localTrajectory?.active && plan.localTrajectory.mode !== 'lane_change') {
        latShift = evaluateLocalTrajectoryOffsetAtDs(plan.localTrajectory, ds);
      }

      const rx = Math.cos(sp.yaw);
      const rz = -Math.sin(sp.yaw);
      const wx = sp.x + rx * latShift;
      const wz = sp.z + rz * latShift;

      if (count > 0) {
        const step = Math.hypot(wx - prevX, wz - prevZ);
        if (step < minStep) continue;
        arcM += step;
      }

      let wy = sp.y;
      let nx = 0;
      let ny = 1;
      let nz = 0;
      if (input.ground) {
        this.dir2.x = -Math.sin(sp.yaw);
        this.dir2.y = -Math.cos(sp.yaw);
        const sampleFn = input.ground.sampleRoadSurface as (
          x: number,
          z: number,
          dir?: { x: number; y: number },
          refH?: number,
        ) => ReturnType<DrivingGround['sampleRoadSurface']>;
        const surf = sampleFn.call(input.ground, wx, wz, this.dir2, refHeight);
        if (Number.isFinite(surf.height)) {
          wy = surf.height;
          nx = surf.normal.x;
          ny = surf.normal.y;
          nz = surf.normal.z;
          refHeight = wy;
        }
      }

      const base = count * 3;
      this.pointsScratch[base] = wx;
      this.pointsScratch[base + 1] = wy;
      this.pointsScratch[base + 2] = wz;
      this.normalsScratch[base] = nx;
      this.normalsScratch[base + 1] = ny;
      this.normalsScratch[base + 2] = nz;
      this.distancesScratch[count] = arcM;
      prevX = wx;
      prevZ = wz;
      count++;
      if (arcM >= maxLen) break;
    }

    return count;
  }

  private resolveModeLabel(input: ADASVisualizationInput): '导航驾驶' | '自由驾驶' | '降级驾驶' {
    const mode = input.status.drivingMode ?? input.plan.drivingMode;
    if (
      mode === 'MAP_DEGRADED' ||
      input.status.degraded ||
      input.status.state === 'DEGRADED' ||
      input.status.state === 'UNMARKED_ROAD'
    ) {
      return '降级驾驶';
    }
    if (mode === 'FREE_DRIVING') return '自由驾驶';
    return '导航驾驶';
  }

  private resolveAuthorityLabel(input: ADASVisualizationInput): '系统控制' | '驾驶员介入' | '等待恢复' {
    const auth = input.status.controlAuthority;
    if (
      auth === 'DRIVER_INTERVENING' ||
      input.status.driverSteeringOverride ||
      input.status.driverAccelerationOverride ||
      input.status.driverBrakeOverride ||
      input.status.state === 'DRIVER_STEERING_OVERRIDE' ||
      input.status.state === 'DRIVER_ACCELERATION_OVERRIDE'
    ) {
      return '驾驶员介入';
    }
    if (auth === 'RECOVERING') return '等待恢复';
    return '系统控制';
  }

  private resolveIntentLabel(input: ADASVisualizationInput): string {
    const plan = input.plan;
    const intent = input.status.driverIntent ?? plan.activeIntent;
    if (intent === 'EXIT_RAMP' || plan.maneuver === 'EXIT_RAMP') return '匝道驶出';
    if (plan.maneuver === 'MERGE') return '匝道合流';
    if (intent === 'TURN_LEFT' || plan.maneuver === 'TURN_LEFT') return '左转';
    if (intent === 'TURN_RIGHT' || plan.maneuver === 'TURN_RIGHT') return '右转';
    if (plan.maneuver === 'UTURN') return '掉头';
    if (
      intent === 'LANE_CHANGE_LEFT' ||
      intent === 'LANE_CHANGE_RIGHT' ||
      plan.laneChange.active ||
      plan.maneuver === 'LANE_CHANGE_LEFT' ||
      plan.maneuver === 'LANE_CHANGE_RIGHT'
    ) {
      return '变道';
    }
    return '直行';
  }

  private buildSubFeaturesLabel(input: ADASVisualizationInput): string {
    if (input.enabled) {
      const caps = input.capabilities;
      const hasAcc = caps ? caps.acc || caps.cruiseControl : true;
      const hasLka = caps ? caps.lka || caps.lcc : true;
      if (hasAcc && hasLka) return 'ACC · LKA';
      if (hasAcc) return 'ACC';
      if (hasLka) return 'LKA';
      return 'PILOT';
    }
    const parts: string[] = [];
    if (input.legacyCruiseActive) parts.push('CC');
    if (input.legacyLccActive) parts.push('LCC');
    else if (input.legacyLkaActive) parts.push('LKA');
    return parts.join(' · ');
  }

  private resolveHudManeuverAndHazard(input: ADASVisualizationInput, hud: ADASHudVisualState): void {
    const state = input.status.state;
    const plan = input.plan;
    const obs = input.obstacle;

    hud.maneuverPhrase = '';
    hud.maneuverDirection = null;
    hud.maneuverTone = 'normal';
    hud.hazardText = '';
    hud.hazardTone = 'caution';

    // Exception handling & recovery alerts (V3.4)
    const hitLabel = input.status.collisionTargetLabel;
    if (state === 'COLLISION_STOPPING' || state === 'COLLISION_HOLD') {
      hud.hazardText = hitLabel ? `碰撞停车（${hitLabel}）· 双闪开启` : '碰撞停车 · 双闪开启';
      hud.hazardTone = 'hazard';
      return;
    }
    if (state === 'COLLISION_HANDOVER') {
      hud.hazardText = hitLabel
        ? `碰撞停车（${hitLabel}）· 双闪开启 · ADAS 已解除，请接管`
        : '碰撞停车 · 双闪开启 · ADAS 已解除，请接管';
      hud.hazardTone = 'hazard';
      return;
    }
    if (state === 'BLOCKED_RECOVERY_FAILED') {
      hud.hazardText = input.status.reason.includes('后方存在危险')
        ? '后方存在危险，倒车已停止 · 脱困失败，请人工接管'
        : '脱困失败，请人工接管';
      hud.hazardTone = 'hazard';
      return;
    }
    if (state === 'BLOCKED_REVERSE_STOP') {
      if (input.status.reason.includes('危险')) {
        hud.hazardText = '后方存在危险，倒车已停止';
        hud.hazardTone = 'hazard';
      } else {
        hud.maneuverPhrase = '正在重新规划前进路径';
        hud.maneuverTone = 'caution';
      }
      return;
    }
    if (state === 'BLOCKED_RECOVERY_CHECK') {
      hud.maneuverPhrase = '前方受阻，正在检查倒车空间';
      hud.maneuverTone = 'caution';
      return;
    }
    if (state === 'BLOCKED_REVERSE') {
      hud.maneuverPhrase = '正在低速倒车脱困';
      hud.maneuverTone = 'caution';
      return;
    }
    if (state === 'BLOCKED_FORWARD_AVOIDANCE') {
      hud.maneuverPhrase = '正在重新规划前进路径';
      hud.maneuverTone = 'caution';
      return;
    }

    // Hazard / driver-attention alerts (never shown during calm operation)
    if (state === 'EMERGENCY_BRAKING') {
      hud.hazardText = '请注意 · 紧急制动';
      hud.hazardTone = 'hazard';
      return;
    }
    if (state === 'ROAD_BLOCKED' || state === 'SAFE_STOP') {
      hud.hazardText = state === 'ROAD_BLOCKED'
        ? '道路受阻 · 请接管'
        : input.status.reason || '无法通行 · 安全停车请接管';
      hud.hazardTone = 'hazard';
      return;
    }
    if (state === 'UNAVAILABLE') {
      hud.hazardText = input.status.reason || 'ADAS 暂不可用';
      hud.hazardTone = 'caution';
      return;
    }
    if (input.status.stopOrigin === 'DRIVER_STOP') {
      hud.maneuverPhrase = '主动停车保持';
      hud.maneuverTone = 'caution';
      return;
    }
    if (plan.awaitingJunctionIntent && !input.status.driverSteeringOverride) {
      hud.maneuverPhrase = '请打灯选择方向';
      hud.maneuverTone = 'caution';
      return;
    }
    if (state === 'DRIVER_STEERING_OVERRIDE') {
      hud.maneuverPhrase = '人工转向介入';
      hud.maneuverTone = 'caution';
      return;
    }
    if (state === 'DRIVER_ACCELERATION_OVERRIDE' || input.status.driverBrakeOverride) {
      hud.maneuverPhrase = input.status.driverBrakeOverride ? '人工制动介入' : '人工加速介入';
      hud.maneuverTone = 'caution';
      return;
    }
    if (plan.drivingMode === 'MAP_DEGRADED') {
      hud.hazardText = '地图数据降级 · 谨慎减速保持';
      hud.hazardTone = 'caution';
    } else if (input.status.controlAuthority === 'RECOVERING') {
      hud.maneuverPhrase = '等待恢复控制';
      hud.maneuverTone = 'caution';
      return;
    }

    // Active overtaking & lane changes
    if (plan.overtaking.active) {
      const dir = plan.laneChange.direction;
      if (plan.overtaking.phase === 'returning') {
        hud.maneuverPhrase = '返回原车道';
        hud.maneuverDirection = dir;
      } else if (plan.overtaking.phase === 'preparing') {
        hud.maneuverPhrase = dir === 'left' ? '准备左超车' : '准备右超车';
        hud.maneuverDirection = dir;
      } else {
        hud.maneuverPhrase = '正在超车';
        hud.maneuverDirection = dir ?? (plan.overtaking.passingLaneIndex < plan.overtaking.originalLaneIndex ? 'left' : 'right');
      }
      return;
    }

    if (
      plan.laneChange.active ||
      state === 'PREPARING_LANE_CHANGE' ||
      state === 'LANE_CHANGING' ||
      state === 'LANE_CHANGE'
    ) {
      const dir = plan.laneChange.direction;
      if (plan.laneChange.reason === 'obstacle' || obs.allowSolidBypass) {
        hud.maneuverPhrase = '绕行障碍物';
        hud.maneuverDirection = dir;
        hud.maneuverTone = obs.allowSolidBypass ? 'caution' : 'normal';
      } else if (state === 'PREPARING_LANE_CHANGE' || plan.laneChange.phase === 'signaling') {
        hud.maneuverPhrase = dir === 'left' ? '准备左变道' : '准备右变道';
        hud.maneuverDirection = dir;
      } else {
        hud.maneuverPhrase = dir === 'left' ? '正在左变道' : '正在右变道';
        hud.maneuverDirection = dir;
      }
      return;
    }

    const ltPhrase = plan.localTrajectory;
    const localDodgeDir: 'left' | 'right' | null =
      ltPhrase?.active && Math.abs(ltPhrase.targetOffsetM) > 0.22
        ? (ltPhrase.targetOffsetM < 0 ? 'left' : 'right')
        : null;
    if (
      state === 'AVOIDANCE' ||
      obs.allowSolidBypass ||
      (ltPhrase?.active && (ltPhrase.mode === 'in_lane_offset' || ltPhrase.mode === 'partial_encroach'))
    ) {
      hud.maneuverPhrase = ltPhrase?.boundaryEncroachment === 'left_solid' || ltPhrase?.boundaryEncroachment === 'right_solid'
        ? '借道绕行障碍物'
        : '绕行障碍物';
      hud.maneuverDirection = obs.avoidanceRequest !== 'none' ? obs.avoidanceRequest : localDodgeDir;
      hud.maneuverTone = obs.allowSolidBypass || obs.leadIsStatic ? 'caution' : 'normal';
      return;
    }

    if (plan.maneuver === 'EXIT_RAMP' || state === 'RAMP_EXIT') {
      hud.maneuverPhrase = '驶出匝道';
      hud.maneuverDirection = 'right';
      return;
    }
    if (plan.maneuver === 'MERGE' || state === 'RAMP_ENTRY') {
      hud.maneuverPhrase = '驶入匝道';
      hud.maneuverDirection = plan.desiredTurnSignal ?? 'left';
      return;
    }

    if (plan.maneuver === 'TURN_LEFT') {
      hud.maneuverPhrase = '即将左转';
      hud.maneuverDirection = 'left';
      return;
    }
    if (plan.maneuver === 'TURN_RIGHT') {
      hud.maneuverPhrase = '即将右转';
      hud.maneuverDirection = 'right';
      return;
    }
    if (plan.maneuver === 'UTURN') {
      hud.maneuverPhrase = '前方掉头';
      hud.maneuverDirection = 'uturn';
      return;
    }

    if (this.replanTimer > 0) {
      hud.maneuverPhrase = '已重规划路径';
      return;
    }
  }

  private buildWorldTargetMarker(input: ADASVisualizationInput): ADASWorldVisualPacket['target'] {
    const empty: ADASWorldVisualPacket['target'] = {
      active: false,
      kind: 'follow',
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      width: 1.9,
      length: 4.5,
      height: 1.5,
      distanceM: 0,
      tone: 'normal',
    };

    if (!input.visible || !input.enabled || !input.plan.valid) return empty;
    const obs = input.obstacle;
    const plan = input.plan;
    const state = input.status.state;
    const maxRange = this.config.targetMarker.maxRangeM;

    if (state === 'EMERGENCY_BRAKING' || state === 'ROAD_BLOCKED' || state === 'AVOIDANCE' || obs.allowSolidBypass) {
      if (obs.hasLeadActor && Number.isFinite(obs.leadGapM) && obs.leadGapM <= maxRange) {
        return {
          active: true,
          kind: state === 'EMERGENCY_BRAKING' ? 'hazard' : 'obstacle',
          x: obs.leadX,
          y: obs.leadY,
          z: obs.leadZ,
          yaw: obs.leadYaw,
          width: Math.max(0.6, obs.leadWidth || 1.9),
          length: Math.max(0.6, obs.leadLength || 4.4),
          height: Math.max(0.6, obs.leadHeight || 1.5),
          distanceM: Math.max(0, obs.leadGapM),
          tone: state === 'EMERGENCY_BRAKING' ? 'hazard' : 'caution',
        };
      }
    }

    if (plan.overtaking.active && plan.overtaking.phase !== 'returning') {
      if (obs.overtakenActorFound && obs.overtakenActorBehindGapM < 10) {
        const dist = Math.hypot(obs.overtakenActorX - input.vehicle.x, obs.overtakenActorZ - input.vehicle.z);
        if (dist <= maxRange) {
          return {
            active: true,
            kind: 'overtake',
            x: obs.overtakenActorX,
            y: obs.overtakenActorY,
            z: obs.overtakenActorZ,
            yaw: obs.overtakenActorYaw,
            width: Math.max(0.8, obs.overtakenActorWidth || 1.9),
            length: Math.max(1.2, obs.overtakenActorLength || 4.5),
            height: Math.max(0.8, obs.overtakenActorHeight || 1.5),
            distanceM: obs.hasLeadActor && obs.leadActorId === plan.overtaking.targetActorId ? Math.max(0, obs.leadGapM) : dist,
            tone: 'normal',
          };
        }
      }
    }

    if (
      obs.hasLeadActor &&
      Number.isFinite(obs.leadGapM) &&
      obs.leadGapM <= maxRange &&
      (state === 'FOLLOW' || obs.cutInDetected || obs.overtakeRecommended)
    ) {
      const tone: ADASRibbonTone =
        obs.emergencyBraking ? 'hazard' : obs.cutInDetected || obs.ttcSeconds < 3.0 ? 'caution' : 'normal';
      return {
        active: true,
        kind: obs.overtakeRecommended ? 'overtake' : obs.cutInDetected ? 'obstacle' : 'follow',
        x: obs.leadX,
        y: obs.leadY,
        z: obs.leadZ,
        yaw: obs.leadYaw,
        width: Math.max(0.6, obs.leadWidth || 1.9),
        length: Math.max(0.6, obs.leadLength || 4.5),
        height: Math.max(0.6, obs.leadHeight || 1.5),
        distanceM: Math.max(0, obs.leadGapM),
        tone,
      };
    }

    return empty;
  }

  private resolveScreenTargetTag(input: ADASVisualizationInput, hud: ADASHudVisualState): void {
    const tag = hud.targetTag;
    tag.visible = false;

    const camera = input.camera;
    if (!camera || !input.plan.valid) return;

    const marker = this.buildWorldTargetMarker(input);
    if (!marker.active) return;

    const vw = input.viewportWidth ?? 1280;
    const vh = input.viewportHeight ?? 720;
    const anchorY = marker.y + clampADAS(marker.height + 0.42, 1.35, 2.45);

    this.projVec.set(marker.x, anchorY, marker.z);
    this.projVec.project(camera);

    // Must be in front of camera and well inside viewport margins
    if (
      !Number.isFinite(this.projVec.x) ||
      !Number.isFinite(this.projVec.y) ||
      !Number.isFinite(this.projVec.z) ||
      this.projVec.z < -1 ||
      this.projVec.z > 1 ||
      Math.abs(this.projVec.x) > 0.88 ||
      Math.abs(this.projVec.y) > 0.84
    ) {
      return;
    }

    camera.getWorldPosition(this.camPos);
    if (this.isTargetOccluded(this.camPos, marker.x, anchorY, marker.z, marker.distanceM, input)) {
      return;
    }

    tag.x = (this.projVec.x * 0.5 + 0.5) * vw;
    tag.y = (-this.projVec.y * 0.5 + 0.5) * vh;
    tag.tone = marker.tone;

    const distStr = `${Math.max(1, Math.round(marker.distanceM))} m`;
    if (marker.kind === 'overtake') {
      const dirGlyph = input.plan.overtaking.passingLaneIndex < input.plan.overtaking.originalLaneIndex || input.obstacle.avoidanceRequest === 'left'
        ? '‹ '
        : ' ›';
      tag.label = dirGlyph === '‹ ' ? `‹ 超车 ${distStr}` : `超车 ${distStr} ›`;
    } else if (marker.kind === 'obstacle' || marker.kind === 'hazard') {
      tag.label = `障碍 ${distStr}`;
    } else {
      tag.label = distStr;
    }
    tag.visible = true;
  }

  private isTargetOccluded(
    camPos: Vector3,
    tx: number,
    ty: number,
    tz: number,
    targetGapM: number,
    input: ADASVisualizationInput,
  ): boolean {
    const dx = tx - camPos.x;
    const dy = ty - camPos.y;
    const dz = tz - camPos.z;
    const rayLen = Math.hypot(dx, dy, dz);
    if (rayLen < 2.5) return false;

    // 1. Check terrain crests along line of sight
    if (input.ground) {
      const steps = 4;
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const rx = camPos.x + dx * t;
        const ry = camPos.y + dy * t;
        const rz = camPos.z + dz * t;
        const groundY = input.ground.getRoadHeightAt(rx, rz);
        if (Number.isFinite(groundY) && groundY > ry + 0.35) {
          return true;
        }
      }
    }

    // 2. Check closer vehicles/actors blocking line of sight
    const actors = input.actors;
    if (actors) {
      const nActors = input.actorCount !== undefined ? Math.min(actors.length, input.actorCount) : actors.length;
      for (let i = 0; i < nActors; i++) {
        const a = actors[i]!;
        if (Math.abs(a.x - tx) < 0.25 && Math.abs(a.z - tz) < 0.25) continue;
        const adx = a.x - camPos.x;
        const adz = a.z - camPos.z;
        const projT = (adx * dx + adz * dz) / (dx * dx + dz * dz + 1e-4);
        if (projT <= 0.08 || projT >= 0.92) continue;
        const aDist = Math.hypot(adx, adz);
        if (aDist >= targetGapM + 1.0) continue;
        const lineX = camPos.x + dx * projT;
        const lineY = camPos.y + dy * projT;
        const lineZ = camPos.z + dz * projT;
        const perp = Math.hypot(a.x - lineX, a.z - lineZ);
        if (perp < Math.max(0.6, a.width * 0.48) && a.y + a.height > lineY) {
          return true;
        }
      }
    }

    // 3. Check static colliders blocking sightline (buildings, walls, piers)
    const colliders = input.colliders;
    if (colliders) {
      for (let i = 0; i < colliders.length; i++) {
        const c = colliders[i]!;
        if (c.maxHeight - c.minHeight < 0.9) continue;
        const cx = c.center.x;
        const cz = c.center.z;
        const cosC = Math.cos(c.yaw);
        const sinC = Math.sin(c.yaw);
        // Skip collider at target location itself
        const tdx = tx - cx;
        const tdz = tz - cz;
        const tLocalX = tdx * cosC - tdz * sinC;
        const tLocalZ = tdx * sinC + tdz * cosC;
        if (Math.abs(tLocalX) <= c.halfWidth + 0.3 && Math.abs(tLocalZ) <= c.halfLength + 0.3) continue;

        const tMid = ((cx - camPos.x) * dx + (cz - camPos.z) * dz) / (dx * dx + dz * dz + 1e-4);
        if (tMid <= 0.08 || tMid >= 0.92) continue;
        const lx = camPos.x + dx * tMid;
        const ly = camPos.y + dy * tMid;
        const lz = camPos.z + dz * tMid;
        const rdx = lx - cx;
        const rdz = lz - cz;
        const localX = rdx * cosC - rdz * sinC;
        const localZ = rdx * sinC + rdz * cosC;
        if (Math.abs(localX) <= c.halfWidth && Math.abs(localZ) <= c.halfLength) {
          if (c.maxHeight > ly + 0.15) return true;
        }
      }
    }

    return false;
  }
}
