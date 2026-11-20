import { Group, type Object3D, type Scene } from 'three';
import { createStaticOBBCollider, type CollisionPoint2, type StaticCollider } from '../../physics/CollisionSystem';
import { resolveRoadSpeedLimit } from '../ADASDataAdapters';
import type { TrafficActorProvider, TrafficActorSnapshot, ADASVehicleState } from '../ADASTypes';
import type { DrivingGround } from '../../../world/DrivingGround';
import type {
  DebugActorRuntime,
  DebugSpeedPolicy,
  DebugTravelDirection,
  ScenarioDebuggerStatus,
  SpawnActorConfig,
} from './ScenarioDebuggerTypes';
import { findScenarioPresetById } from './ScenarioDebuggerPresets';
import { ScenarioDebuggerMeshFactory } from './ScenarioDebuggerMeshFactory';
import { ScenarioDebuggerHUD } from './ScenarioDebuggerHUD';

const DEBUGGER_SPEED_DEFAULTS = {
  highway: 100,
  urban: 50,
  ramp: 50,
  circuit: 80,
  unknown: 50,
} as const;

/** Simple deterministic mulberry32 pseudo-random number generator. */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function directionYawOffset(direction: DebugTravelDirection): number {
  switch (direction) {
    case 'oncoming':
      return Math.PI;
    case 'cross-left':
      return Math.PI * 0.5;
    case 'cross-right':
      return -Math.PI * 0.5;
    case 'forward':
    default:
      return 0;
  }
}

export class ScenarioDebugger implements TrafficActorProvider {
  private readonly root = new Group();
  private readonly actors = new Map<string, DebugActorRuntime>();
  private readonly hud: ScenarioDebuggerHUD;
  private idCounter = 1;
  private paused = false;
  private lastScenarioConfigs: SpawnActorConfig[] = [];
  private lastScenarioName: string | null = null;

  public autoCleanupDistanceM = 160;
  public maxSimultaneousActors = 24;

  public constructor(
    private readonly scene: Scene,
    private readonly getEgoState: () => ADASVehicleState,
    private readonly getGround: () => DrivingGround,
    hudHost?: HTMLElement,
    private readonly getSimTime?: () => number,
  ) {
    this.root.name = 'scenario_debugger_actors';
    this.scene.add(this.root);
    this.hud = new ScenarioDebuggerHUD(this, hudHost);
  }

  public get isHUDOpen(): boolean {
    return this.hud.isOpen;
  }

  public get isPaused(): boolean {
    return this.paused;
  }

  public get activeCount(): number {
    return this.actors.size;
  }

  public toggleHUD(): void {
    this.hud.toggle();
  }

  public setHUDOpen(open: boolean): void {
    if (open) this.hud.show();
    else this.hud.hide();
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
  }

  public pause(): void {
    this.paused = true;
  }

  public resume(): void {
    this.paused = false;
  }

  /**
   * Computes current ego speed, road speed limit, and suggested dynamic traffic speed (km/h).
   */
  public getDynamicSpeedContext(roadIdHint?: string): {
    egoKmh: number;
    roadLimitKmh: number;
    roadLimitEstimated: boolean;
    cruiseBaseKmh: number;
  } {
    const ego = this.getEgoState();
    const ground = this.getGround();
    const egoKmh = Math.max(0, Math.abs(ego.speed) * 3.6);

    let seg:
      | {
          readonly id: string;
          readonly speedLimit?: number;
          readonly roadType?: 'highway' | 'urban' | 'ramp' | 'circuit';
          readonly roadFunction?: string;
        }
      | undefined;

    const segments = ground.roadNetwork?.segments;
    if (roadIdHint && segments?.length) {
      seg = segments.find((s) => s.id === roadIdHint);
    }
    if (!seg && ground.laneGraph) {
      const egoLane = ground.laneGraph.findNearestLane(ego.x, ego.z, ego.y, 12.0);
      if (egoLane?.lane?.roadId && segments?.length) {
        seg = segments.find((s) => s.id === egoLane.lane.roadId);
      }
    }
    if (!seg && segments?.length) {
      seg = segments[0];
    }

    const resolved = resolveRoadSpeedLimit(
      seg?.speedLimit,
      seg?.roadType,
      seg?.roadFunction,
      DEBUGGER_SPEED_DEFAULTS,
    );
    const roadLimitKmh = Math.max(20, resolved.speedMps * 3.6);
    const cruiseBaseKmh = egoKmh >= 15
      ? Math.min(roadLimitKmh * 1.05, Math.max(roadLimitKmh * 0.72, egoKmh))
      : roadLimitKmh * 0.82;

    return {
      egoKmh,
      roadLimitKmh,
      roadLimitEstimated: resolved.estimated,
      cruiseBaseKmh,
    };
  }

  private resolveSpawnSpeedsKmh(
    config: SpawnActorConfig,
    ego: ADASVehicleState,
    _ground: DrivingGround,
    roadId?: string,
  ): { initialKmh: number; targetKmh: number } {
    const policy: DebugSpeedPolicy | undefined = config.speedPolicy;
    if (!policy || policy.mode === 'fixed') {
      const init = Math.max(0, config.speedKmh || 0);
      const targ = config.targetSpeedKmh !== undefined ? Math.max(0, config.targetSpeedKmh) : init;
      return { initialKmh: init, targetKmh: targ };
    }

    const ctx = this.getDynamicSpeedContext(roadId);
    const egoKmh = ctx.egoKmh > 0.5 ? ctx.egoKmh : Math.max(0, Math.abs(ego.speed) * 3.6);
    const limitKmh = ctx.roadLimitKmh;
    const cruiseKmh = ctx.cruiseBaseKmh;

    let init = config.speedKmh;
    let target = config.targetSpeedKmh;

    switch (policy.mode) {
      case 'lead-slow': {
        const ref = egoKmh >= 18 ? Math.min(egoKmh * 0.65, limitKmh * 0.62) : limitKmh * 0.52;
        init = Math.min(Math.max(16, ref), Math.max(22, limitKmh * 0.72));
        target = init;
        break;
      }
      case 'traffic-cruise': {
        init = egoKmh >= 18
          ? Math.min(limitKmh * 1.05, Math.max(limitKmh * 0.78, egoKmh * 0.96))
          : limitKmh * 0.85;
        target = init;
        break;
      }
      case 'traffic-fast': {
        init = Math.min(limitKmh * 1.15, Math.max(limitKmh * 0.92, egoKmh + 14));
        target = init;
        break;
      }
      case 'lead-sudden-brake': {
        init = egoKmh >= 18
          ? Math.min(limitKmh * 1.05, Math.max(limitKmh * 0.75, egoKmh * 0.95))
          : limitKmh * 0.82;
        target = 0;
        break;
      }
      case 'lead-sudden-accel': {
        init = Math.max(15, Math.min(limitKmh * 0.44, egoKmh >= 15 ? egoKmh * 0.45 : limitKmh * 0.42));
        target = Math.min(limitKmh * 1.08, Math.max(limitKmh * 0.9, egoKmh + 18));
        break;
      }
      case 'rear-fast-approach': {
        init = Math.min(Math.max(limitKmh * 1.38, 135), Math.max(limitKmh * 1.12, egoKmh + 28, cruiseKmh + 22));
        target = init;
        break;
      }
      case 'green-launch': {
        init = 0;
        target = Math.max(25, limitKmh * 0.82);
        break;
      }
    }

    if (policy.initialScale !== undefined) init *= policy.initialScale;
    if (policy.initialOffsetKmh !== undefined) init += policy.initialOffsetKmh;
    if (policy.targetScale !== undefined) target *= policy.targetScale;

    if (policy.minKmh !== undefined) {
      if (policy.mode !== 'green-launch') init = Math.max(policy.minKmh, init);
      if (target > 0 && policy.mode !== 'lead-sudden-brake') target = Math.max(policy.minKmh * 0.5, target);
    }
    if (policy.maxKmh !== undefined) {
      init = Math.min(policy.maxKmh, init);
      target = Math.min(policy.maxKmh, target);
    }

    return {
      initialKmh: Math.round(Math.max(0, init)),
      targetKmh: Math.round(Math.max(0, target)),
    };
  }

  public getStatus(): ScenarioDebuggerStatus {
    const ego = this.getEgoState();
    const list: ScenarioDebuggerStatus['actors'] = [];
    for (const a of this.actors.values()) {
      const dist = Math.hypot(a.x - ego.x, a.z - ego.z);
      list.push({
        id: a.id,
        label: a.label,
        type: a.type,
        kind: a.kind,
        motionMode: a.motionMode,
        direction: a.direction,
        laneOffset: a.laneOffset,
        lateralOffsetM: a.lateralOffsetM,
        distanceToEgoM: dist,
        speedKmh: a.speed * 3.6,
        targetSpeedKmh: a.targetSpeed * 3.6,
        behavior: a.behavior,
        behaviorDelayS: a.behaviorDelayS,
        behaviorTriggered: a.behaviorTriggered,
        targetLaneChange: a.targetLaneChange,
        randomSeed: a.randomSeed,
        width: a.width,
        length: a.length,
        height: a.height,
        x: a.x,
        z: a.z,
      });
    }
    return {
      activeActorCount: this.actors.size,
      hudOpen: this.isHUDOpen,
      paused: this.paused,
      lastScenarioName: this.lastScenarioName,
      actors: list,
    };
  }

  /**
   * Implements TrafficActorProvider contract: feeds active debug actors + predictedTrajectory
   * into the real ADAS perception pipeline with zero per-call heap allocations.
   */
  public queryNearbyActors(
    x: number,
    y: number,
    z: number,
    radiusM: number,
    out: TrafficActorSnapshot[],
  ): number {
    if (this.actors.size === 0) return 0;
    let count = 0;
    const rSq = radiusM * radiusM;
    const simTime = this.getSimTime ? this.getSimTime() : 0;

    for (const a of this.actors.values()) {
      if (!a.active || count >= out.length) break;
      const dx = a.x - x;
      const dz = a.z - z;
      if (dx * dx + dz * dz > rSq) continue;
      if (Math.abs(a.y - y) > 4.5) continue;

      const dst = out[count]!;
      dst.id = a.id;
      dst.kind = a.kind;
      dst.x = a.x;
      dst.y = a.y;
      dst.z = a.z;
      dst.yaw = a.yaw;
      dst.speed = a.speed;
      dst.vx = a.vx;
      dst.vz = a.vz;
      dst.length = a.length;
      dst.width = a.width;
      dst.height = a.height;
      dst.minHeight = a.y;
      dst.maxHeight = a.y + a.height;
      dst.laneId = a.laneId;
      dst.roadId = a.roadId;
      dst.confidence = 1.0;
      dst.timestamp = simTime;
      dst.accel = a.accelMps2;
      dst.isStatic = a.motionMode === 'static' || Math.abs(a.speed) < 0.25;
      dst.isDynamic = a.motionMode === 'dynamic' && Math.abs(a.speed) >= 0.25;
      dst.motionDirection = a.motionMode === 'static'
        ? 'static'
        : a.direction === 'oncoming'
          ? 'oncoming'
          : a.direction === 'cross-left' || a.direction === 'cross-right'
            ? 'crossing'
            : 'same';

      if (dst.isDynamic) {
        this.refreshPredictedTrajectory(a, simTime);
        dst.predictedTrajectory = a.predictedTrajectory;
      } else {
        dst.predictedTrajectory = undefined;
      }
      count++;
    }

    return count;
  }

  /**
   * Spawns a new controlled scenario actor after road bounds and overlap validation.
   */
  public spawn(
    config: SpawnActorConfig,
    recordAsCurrentScenario = true,
  ): { success: boolean; actor?: DebugActorRuntime; error?: string } {
    if (this.actors.size >= this.maxSimultaneousActors) {
      return { success: false, error: `已达最大生成数量上限 (${this.maxSimultaneousActors})` };
    }

    const ego = this.getEgoState();
    const ground = this.getGround();
    const id = config.id || `debug_${config.type}_${this.idCounter++}`;
    const direction: DebugTravelDirection = config.direction ?? 'forward';

    let posX = 0;
    let posY = ego.y;
    let posZ = 0;
    let heading = ego.yaw + directionYawOffset(direction);
    let roadId: string | undefined;
    let laneId: string | undefined;

    const dims = config.dimensions || (
      config.type === 'vehicle'
        ? { length: 4.8, width: 1.9, height: 1.5 }
        : config.type === 'pedestrian'
          ? config.kindOverride === 'cyclist'
            ? { length: 1.85, width: 0.68, height: 1.48 }
            : { length: 0.5, width: 0.5, height: 1.75 }
          : { length: 0.6, width: 0.6, height: 0.85 }
    );

    let laneWidth = 3.5;
    if (ground.laneGraph) {
      const egoLane = ground.laneGraph.findNearestLane(ego.x, ego.z, ego.y, 12.0);
      if (egoLane?.lane?.width && Number.isFinite(egoLane.lane.width)) {
        laneWidth = egoLane.lane.width;
      }
    } else if (ground.roadNetwork?.segments?.length) {
      const firstSeg = ground.roadNetwork.segments[0]!;
      if (firstSeg.laneWidth && Number.isFinite(firstSeg.laneWidth)) {
        laneWidth = firstSeg.laneWidth;
      }
    }

    if (config.positionMode === 'world' && config.worldPosition) {
      posX = config.worldPosition.x;
      posY = config.worldPosition.y;
      posZ = config.worldPosition.z;
      heading = config.worldPosition.yaw ?? (ego.yaw + directionYawOffset(direction));
    } else {
      const egoHeading = ego.yaw;
      const sign = config.forwardDistanceM >= 0 ? 1 : -1;
      const fwdDist = config.forwardDistanceM + sign * (ego.vehicleLength * 0.5 + dims.length * 0.5);
      const totalLatOffset = config.laneOffset * laneWidth + config.lateralOffsetM;

      const fwdX = -Math.sin(egoHeading);
      const fwdZ = -Math.cos(egoHeading);
      const rightX = Math.cos(egoHeading);
      const rightZ = -Math.sin(egoHeading);

      posX = ego.x + fwdX * fwdDist + rightX * totalLatOffset;
      posZ = ego.z + fwdZ * fwdDist + rightZ * totalLatOffset;

      const elevation = typeof ground.getRoadHeightAt === 'function' ? ground.getRoadHeightAt(posX, posZ) : undefined;
      posY = elevation !== undefined && Number.isFinite(elevation) ? elevation : ego.y;
      heading = egoHeading + directionYawOffset(direction);
    }

    // Road & Collision Overlap Check against ego and existing actors
    const distToEgo = Math.hypot(posX - ego.x, posZ - ego.z);
    if (distToEgo < (ego.vehicleLength + dims.length) * 0.5 + 0.3) {
      return { success: false, error: '生成位置与玩家自车发生空间重叠' };
    }

    for (const existing of this.actors.values()) {
      const d = Math.hypot(posX - existing.x, posZ - existing.z);
      if (d < Math.max(0.85, (dims.length + existing.length) * 0.45)) {
        return { success: false, error: `生成位置与已有调试对象 [${existing.id}] 空间重叠` };
      }
    }

    if (ground.laneGraph) {
      const nearestLane = ground.laneGraph.findNearestLane(posX, posZ, posY, 12.0);
      if (nearestLane?.lane) {
        laneId = nearestLane.lane.id;
        roadId = nearestLane.lane.roadId;
      }
    }

    const resolvedKind = config.kindOverride ?? (
      config.type === 'vehicle'
        ? 'vehicle'
        : config.type === 'pedestrian'
          ? 'pedestrian'
          : 'static-obstacle'
    );

    const mesh = ScenarioDebuggerMeshFactory.createActorMesh(config.type, dims.length, dims.width, dims.height);
    mesh.position.set(posX, posY, posZ);
    mesh.rotation.y = heading;
    mesh.updateMatrixWorld(true);
    this.root.add(mesh);

    const resolvedSpeeds = this.resolveSpawnSpeedsKmh(config, ego, ground, roadId);
    const speedMps = config.motionMode === 'static' ? 0 : Math.max(0, resolvedSpeeds.initialKmh / 3.6);
    const targetSpeedMps = config.motionMode === 'static' ? 0 : Math.max(0, resolvedSpeeds.targetKmh / 3.6);

    const predictedTrajectory = Array.from({ length: 6 }, () => ({ x: posX, y: posY, z: posZ, timestamp: 0 }));

    const runtime: DebugActorRuntime = {
      id,
      label: config.label,
      type: config.type,
      kind: resolvedKind,
      motionMode: config.motionMode,
      direction,
      laneOffset: config.laneOffset,
      lateralOffsetM: config.lateralOffsetM,
      x: posX,
      y: posY,
      z: posZ,
      yaw: heading,
      speed: speedMps,
      vx: -Math.sin(heading) * speedMps,
      vz: -Math.cos(heading) * speedMps,
      accelMps2: 0,
      targetSpeed: targetSpeedMps,
      length: dims.length,
      width: dims.width,
      height: dims.height,
      laneId,
      roadId,
      mesh,
      collider: createStaticOBBCollider({
        id,
        x: posX,
        z: posZ,
        yaw: heading,
        width: dims.width,
        length: dims.length,
        minHeight: posY,
        maxHeight: posY + dims.height,
        type: 'obstacle',
      }),
      behavior: config.behavior,
      behaviorDelayS: Math.max(0, config.behaviorDelayS || 0),
      behaviorElapsedS: 0,
      behaviorTriggered: false,
      targetLaneChange: config.targetLaneChange || 'none',
      cutInShiftedM: 0,
      cutInLaneWidthM: laneWidth,
      randomSeed: config.randomSeed || 42,
      prngState: config.randomSeed || 42,
      active: true,
      spawnTime: this.getSimTime ? this.getSimTime() : performance.now() * 0.001,
      initialSpeed: speedMps,
      predictedTrajectory,
      sourceConfig: { ...config, direction, dimensions: { ...dims } },
    };

    this.actors.set(id, runtime);
    if (recordAsCurrentScenario) {
      this.lastScenarioConfigs = [{ ...config, direction, dimensions: { ...dims } }];
      this.lastScenarioName = config.label || id;
    }
    return { success: true, actor: runtime };
  }

  /**
   * Spawns a batch of actors sharing one unified SpawnActorConfig interface.
   */
  public spawnScenarioBatch(
    configs: readonly SpawnActorConfig[],
    scenarioName?: string,
    clearExisting = false,
  ): { successCount: number; errors: string[]; spawnedIds: string[] } {
    if (clearExisting) {
      this.clearAll();
    }
    const errors: string[] = [];
    const spawnedIds: string[] = [];
    for (const cfg of configs) {
      const res = this.spawn(cfg, false);
      if (res.success && res.actor) {
        spawnedIds.push(res.actor.id);
      } else if (res.error) {
        errors.push(res.error);
      }
    }
    if (configs.length > 0) {
      this.lastScenarioConfigs = configs.map((c) => ({
        ...c,
        dimensions: c.dimensions ? { ...c.dimensions } : undefined,
      }));
      this.lastScenarioName = scenarioName ?? null;
    }
    return { successCount: spawnedIds.length, errors, spawnedIds };
  }

  public spawnPresetById(
    presetId: string,
    clearExisting = false,
  ): { successCount: number; errors: string[]; spawnedIds: string[]; presetName?: string } {
    const preset = findScenarioPresetById(presetId);
    if (!preset) {
      return { successCount: 0, errors: [`未知预设场景: ${presetId}`], spawnedIds: [] };
    }
    const res = this.spawnScenarioBatch(preset.actors, preset.name, clearExisting);
    return { ...res, presetName: preset.name };
  }

  public resetCurrentScenario(): { success: boolean; count: number; error?: string } {
    if (this.lastScenarioConfigs.length === 0) {
      return { success: false, count: 0, error: '当前没有可重置的预设或自定义场景记录' };
    }
    const saved = this.lastScenarioConfigs.map((c) => ({
      ...c,
      dimensions: c.dimensions ? { ...c.dimensions } : undefined,
    }));
    const savedName = this.lastScenarioName ?? undefined;
    const res = this.spawnScenarioBatch(saved, savedName, true);
    return {
      success: res.successCount > 0,
      count: res.successCount,
      error: res.errors[0],
    };
  }

  /**
   * Edits an already-spawned actor in place, synchronizing visual mesh and OBB collider immediately.
   */
  public updateActor(id: string, patch: Partial<SpawnActorConfig>): { success: boolean; error?: string } {
    const actor = this.actors.get(id);
    if (!actor) return { success: false, error: `目标 [${id}] 不存在` };

    const ego = this.getEgoState();
    const ground = this.getGround();
    const merged: SpawnActorConfig = {
      ...actor.sourceConfig,
      ...patch,
      dimensions: patch.dimensions ?? actor.sourceConfig.dimensions,
    };

    const nextType = merged.type;
    const nextMotion = merged.motionMode;
    const nextDir: DebugTravelDirection = merged.direction ?? actor.direction;
    const nextDims = merged.dimensions || (
      nextType === 'vehicle'
        ? { length: 4.8, width: 1.9, height: 1.5 }
        : nextType === 'pedestrian'
          ? merged.kindOverride === 'cyclist'
            ? { length: 1.85, width: 0.68, height: 1.48 }
            : { length: 0.5, width: 0.5, height: 1.75 }
          : { length: 0.6, width: 0.6, height: 0.85 }
    );

    const dimsChanged =
      nextType !== actor.type ||
      Math.abs(nextDims.length - actor.length) > 0.02 ||
      Math.abs(nextDims.width - actor.width) > 0.02 ||
      Math.abs(nextDims.height - actor.height) > 0.02;

    actor.type = nextType;
    actor.kind = merged.kindOverride ?? (
      nextType === 'vehicle'
        ? 'vehicle'
        : nextType === 'pedestrian'
          ? 'pedestrian'
          : 'static-obstacle'
    );
    actor.motionMode = nextMotion;
    actor.direction = nextDir;
    actor.length = nextDims.length;
    actor.width = nextDims.width;
    actor.height = nextDims.height;

    const repositionRequested =
      patch.forwardDistanceM !== undefined ||
      patch.laneOffset !== undefined ||
      patch.lateralOffsetM !== undefined;
    if (repositionRequested) {
      const laneW = actor.cutInLaneWidthM ?? 3.5;
      const sign = merged.forwardDistanceM >= 0 ? 1 : -1;
      const fwdDist = merged.forwardDistanceM + sign * (ego.vehicleLength * 0.5 + actor.length * 0.5);
      const totalLatOffset = merged.laneOffset * laneW + merged.lateralOffsetM;
      const fwdX = -Math.sin(ego.yaw);
      const fwdZ = -Math.cos(ego.yaw);
      const rightX = Math.cos(ego.yaw);
      const rightZ = -Math.sin(ego.yaw);
      actor.x = ego.x + fwdX * fwdDist + rightX * totalLatOffset;
      actor.z = ego.z + fwdZ * fwdDist + rightZ * totalLatOffset;
      const ele = typeof ground.getRoadHeightAt === 'function' ? ground.getRoadHeightAt(actor.x, actor.z) : undefined;
      if (ele !== undefined && Number.isFinite(ele)) actor.y = ele;
      actor.laneOffset = merged.laneOffset;
      actor.lateralOffsetM = merged.lateralOffsetM;
      actor.cutInShiftedM = 0;
    }

    if (patch.direction !== undefined || repositionRequested) {
      actor.yaw = ego.yaw + directionYawOffset(nextDir);
    }

    if (nextMotion === 'static') {
      actor.speed = 0;
      actor.targetSpeed = 0;
      actor.accelMps2 = 0;
    } else {
      if (patch.speedKmh !== undefined) {
        actor.speed = Math.max(0, patch.speedKmh / 3.6);
      }
      if (patch.targetSpeedKmh !== undefined) {
        actor.targetSpeed = Math.max(0, patch.targetSpeedKmh / 3.6);
      } else if (patch.speedKmh !== undefined && merged.behavior === 'constant') {
        actor.targetSpeed = actor.speed;
      }
    }

    actor.vx = -Math.sin(actor.yaw) * actor.speed;
    actor.vz = -Math.cos(actor.yaw) * actor.speed;
    actor.behavior = merged.behavior;
    actor.behaviorDelayS = Math.max(0, merged.behaviorDelayS || 0);
    if (patch.behavior !== undefined || patch.behaviorDelayS !== undefined) {
      actor.behaviorElapsedS = 0;
      actor.behaviorTriggered = false;
    }
    actor.targetLaneChange = merged.targetLaneChange;
    actor.randomSeed = merged.randomSeed;
    actor.prngState = merged.randomSeed;
    actor.sourceConfig = { ...merged, direction: nextDir, dimensions: { ...nextDims } };

    if (dimsChanged) {
      this.root.remove(actor.mesh);
      this.disposeObject(actor.mesh);
      actor.mesh = ScenarioDebuggerMeshFactory.createActorMesh(actor.type, actor.length, actor.width, actor.height);
      this.root.add(actor.mesh);
    }
    actor.mesh.position.set(actor.x, actor.y, actor.z);
    actor.mesh.rotation.y = actor.yaw;
    actor.mesh.updateMatrixWorld(true);

    actor.collider = createStaticOBBCollider({
      id: actor.id,
      x: actor.x,
      z: actor.z,
      yaw: actor.yaw,
      width: actor.width,
      length: actor.length,
      minHeight: actor.y,
      maxHeight: actor.y + actor.height,
      type: 'obstacle',
    });

    return { success: true };
  }

  public deleteActor(id: string): boolean {
    const actor = this.actors.get(id);
    if (!actor) return false;
    this.root.remove(actor.mesh);
    this.disposeObject(actor.mesh);
    this.actors.delete(id);
    return true;
  }

  public clearAll(): void {
    for (const actor of this.actors.values()) {
      this.root.remove(actor.mesh);
      this.disposeObject(actor.mesh);
    }
    this.actors.clear();
  }

  public update(dt: number): void {
    if (this.actors.size === 0 || this.paused) return;
    const safeDt = Math.max(0, Math.min(dt, 0.1));
    if (safeDt <= 0) return;
    const ego = this.getEgoState();
    const ground = this.getGround();
    const toDelete: string[] = [];

    for (const actor of this.actors.values()) {
      const distToEgo = Math.hypot(actor.x - ego.x, actor.z - ego.z);
      if (distToEgo > this.autoCleanupDistanceM) {
        toDelete.push(actor.id);
        continue;
      }

      if (actor.motionMode === 'static') {
        actor.accelMps2 = 0;
        continue;
      }

      actor.behaviorElapsedS += safeDt;
      if (!actor.behaviorTriggered && actor.behaviorElapsedS >= actor.behaviorDelayS) {
        actor.behaviorTriggered = true;
        this.triggerBehavior(actor);
      }

      const gatedByTrigger =
        actor.behavior === 'sudden-brake' ||
        actor.behavior === 'sudden-accel' ||
        actor.behavior === 'random';
      const activeTargetSpeed = gatedByTrigger && !actor.behaviorTriggered
        ? actor.speed
        : actor.targetSpeed;

      if (Math.abs(actor.speed - activeTargetSpeed) > 0.08) {
        const accelRate = actor.speed < activeTargetSpeed ? 3.0 : -5.5;
        actor.accelMps2 = accelRate;
        const deltaV = accelRate * safeDt;
        if (Math.abs(deltaV) >= Math.abs(activeTargetSpeed - actor.speed)) {
          actor.speed = activeTargetSpeed;
          actor.accelMps2 = 0;
        } else {
          actor.speed += deltaV;
        }
      } else {
        actor.speed = activeTargetSpeed;
        actor.accelMps2 = 0;
      }

      const fwdX = -Math.sin(actor.yaw);
      const fwdZ = -Math.cos(actor.yaw);

      const targetShiftM = actor.cutInLaneWidthM ?? 3.5;
      const shiftedSoFar = actor.cutInShiftedM ?? 0;
      const canShiftLat =
        actor.targetLaneChange !== 'none' &&
        (actor.behavior !== 'cut-in' || actor.behaviorTriggered) &&
        shiftedSoFar < targetShiftM;

      if (canShiftLat) {
        const latSign = actor.targetLaneChange === 'left' ? -1 : 1;
        const rightX = Math.cos(actor.yaw);
        const rightZ = -Math.sin(actor.yaw);
        const latSpeed = actor.type === 'pedestrian' ? 1.8 : 1.6;
        const stepShift = Math.min(latSpeed * safeDt, targetShiftM - shiftedSoFar);
        actor.cutInShiftedM = shiftedSoFar + stepShift;
        actor.vx = fwdX * actor.speed + rightX * latSpeed * latSign;
        actor.vz = fwdZ * actor.speed + rightZ * latSpeed * latSign;
        actor.x += fwdX * actor.speed * safeDt + rightX * stepShift * latSign;
        actor.z += fwdZ * actor.speed * safeDt + rightZ * stepShift * latSign;
      } else {
        actor.vx = fwdX * actor.speed;
        actor.vz = fwdZ * actor.speed;
        actor.x += actor.vx * safeDt;
        actor.z += actor.vz * safeDt;
      }

      const ele = typeof ground.getRoadHeightAt === 'function' ? ground.getRoadHeightAt(actor.x, actor.z) : undefined;
      if (ele !== undefined && Number.isFinite(ele)) {
        actor.y = ele;
      }

      actor.mesh.position.set(actor.x, actor.y, actor.z);
      actor.mesh.rotation.y = actor.yaw;
      actor.mesh.updateMatrixWorld(true);

      // Keep OBB collider strictly aligned with visual pose & dimensions
      actor.collider = createStaticOBBCollider({
        id: actor.id,
        x: actor.x,
        z: actor.z,
        yaw: actor.yaw,
        width: actor.width,
        length: actor.length,
        minHeight: actor.y,
        maxHeight: actor.y + actor.height,
        type: 'obstacle',
      });
    }

    for (const id of toDelete) {
      this.deleteActor(id);
    }
  }

  public getNearbyColliders(pose: CollisionPoint2, radiusM: number): StaticCollider[] {
    if (this.actors.size === 0) return [];
    const rSq = radiusM * radiusM;
    const res: StaticCollider[] = [];
    for (const a of this.actors.values()) {
      if (!a.active) continue;
      const dx = a.x - pose.x;
      const dz = a.z - pose.z;
      if (dx * dx + dz * dz <= rSq) {
        res.push(a.collider);
      }
    }
    return res;
  }

  private refreshPredictedTrajectory(actor: DebugActorRuntime, simTime: number): void {
    const fwdX = -Math.sin(actor.yaw);
    const fwdZ = -Math.cos(actor.yaw);
    const rightX = Math.cos(actor.yaw);
    const rightZ = -Math.sin(actor.yaw);

    const targetShiftM = actor.cutInLaneWidthM ?? 3.5;
    const shiftedSoFar = actor.cutInShiftedM ?? 0;
    const remShift = actor.targetLaneChange !== 'none' &&
      (actor.behavior !== 'cut-in' || actor.behaviorTriggered) &&
      shiftedSoFar < targetShiftM
      ? targetShiftM - shiftedSoFar
      : 0;
    const latSign = actor.targetLaneChange === 'left' ? -1 : 1;
    const latSpeed = actor.type === 'pedestrian' ? 1.8 : 1.6;

    for (let i = 0; i < actor.predictedTrajectory.length; i++) {
      const dtAhead = (i + 1) * 0.5;
      const pt = actor.predictedTrajectory[i]!;
      const v0 = actor.speed;
      const a = actor.accelMps2;
      let distLong: number;
      if (a < -0.1) {
        const tStop = Math.min(dtAhead, v0 / Math.max(0.1, -a));
        distLong = v0 * tStop + 0.5 * a * tStop * tStop;
      } else if (a > 0.1) {
        const vEnd = Math.min(actor.targetSpeed, v0 + a * dtAhead);
        distLong = 0.5 * (v0 + vEnd) * dtAhead;
      } else {
        distLong = v0 * dtAhead;
      }
      const latDisp = remShift > 0 ? Math.min(remShift, latSpeed * dtAhead) * latSign : 0;
      pt.x = actor.x + fwdX * distLong + rightX * latDisp;
      pt.y = actor.y;
      pt.z = actor.z + fwdZ * distLong + rightZ * latDisp;
      pt.timestamp = simTime + dtAhead;
    }
  }

  private triggerBehavior(actor: DebugActorRuntime): void {
    if (actor.behavior === 'sudden-brake') {
      if (actor.targetSpeed >= actor.speed - 0.5) {
        actor.targetSpeed = 0;
      }
    } else if (actor.behavior === 'sudden-accel') {
      if (actor.targetSpeed <= actor.speed + 0.5) {
        actor.targetSpeed = actor.initialSpeed + 30 / 3.6;
      }
    } else if (actor.behavior === 'cut-in') {
      if (actor.targetLaneChange === 'none') {
        actor.targetLaneChange = 'left';
      }
    } else if (actor.behavior === 'random') {
      const rng = mulberry32(actor.prngState);
      actor.prngState = (actor.prngState + 1337) | 0;
      const roll = rng();
      if (roll < 0.35) {
        actor.targetSpeed = Math.max(0, actor.initialSpeed * 0.2);
      } else if (roll < 0.65) {
        actor.targetSpeed = actor.initialSpeed * 1.5;
      } else {
        actor.targetLaneChange = rng() < 0.5 ? 'left' : 'right';
      }
    }
  }

  private disposeObject(obj: Object3D): void {
    obj.traverse((child: any) => {
      if (child.geometry) child.geometry.dispose?.();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m: any) => m.dispose?.());
        else child.material.dispose?.();
      }
    });
  }

  public dispose(): void {
    this.clearAll();
    this.hud.dispose();
    this.root.removeFromParent();
  }
}
