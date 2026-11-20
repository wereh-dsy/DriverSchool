import { ADASVisualizationExtractor, type ADASVisualizationInput } from '../adas/visualization/ADASVisualizationExtractor';
import type { ADASRibbonTone, ADASWorldVisualPacket } from '../adas/visualization/ADASVisualizationTypes';
import type {
  VehicleHUDFrameInput,
  VehicleHUDPedestrianTrajectory,
  VehicleHUDTargetAnnotation,
} from './VehicleHUDTypes';

/**
 * Coordinates the existing ADAS road-space path projection (V1 ribbon)
 * alongside V1.1 world-space multi-target brackets and pedestrian prediction paths.
 * Guarantees a single authoritative world trajectory—never duplicates path meshes.
 */
export class RoadProjectionBridge {
  private readonly extractor = new ADASVisualizationExtractor();
  private readonly extractorInput: { -readonly [K in keyof ADASVisualizationInput]: ADASVisualizationInput[K] } = {
    dt: 0,
    visible: false,
    enabled: false,
    status: undefined as unknown as ADASVisualizationInput['status'],
    plan: undefined as unknown as ADASVisualizationInput['plan'],
    obstacle: undefined as unknown as ADASVisualizationInput['obstacle'],
    rules: undefined as unknown as ADASVisualizationInput['rules'],
    vehicle: undefined as unknown as ADASVisualizationInput['vehicle'],
    samplesApproachLane: 0,
    theme: 'DAY',
    ground: null,
    camera: null,
    viewportWidth: 1280,
    viewportHeight: 720,
    colliders: undefined,
    actors: [],
    actorCount: 0,
    capabilities: undefined,
    legacyCruiseActive: false,
    legacyLkaActive: false,
    legacyLccActive: false,
  };

  public reset(): void {
    this.extractor.reset();
  }

  public evaluateManeuverCue(input: VehicleHUDFrameInput): {
    phrase: string;
    direction: 'left' | 'right' | 'uturn' | null;
    tone: ADASRibbonTone;
  } {
    this.syncInput(input, input.visible);
    const hud = this.extractor.updateHudState(this.extractorInput);
    return {
      phrase: hud.maneuverPhrase,
      direction: hud.maneuverDirection,
      tone: hud.maneuverTone,
    };
  }

  public buildWorldPacket(
    input: VehicleHUDFrameInput,
    annotations: readonly VehicleHUDTargetAnnotation[],
    pedestrianTrajectories: readonly VehicleHUDPedestrianTrajectory[],
  ): ADASWorldVisualPacket {
    // Pass ADAS path projection when visible; extractor handles significant-maneuver ribbon gating cleanly
    this.syncInput(input, input.visible);
    const packet = this.extractor.buildWorldPacket(this.extractorInput);

    if (!input.visible) {
      packet.extraTargets = undefined;
      packet.pedestrianPaths = undefined;
      return packet;
    }

    // Even when ADAS is OFF, show ground marker for active urgent front/static/VRU hazard if present
    const extraTargets: NonNullable<ADASWorldVisualPacket['extraTargets']> = [];
    const leadShownInMain = packet.target.active;

    for (let i = 0; i < annotations.length; i++) {
      const a = annotations[i]!;
      if (a.category === 'lead' && leadShownInMain) {
        packet.target.category = 'lead';
        packet.target.speedKmh = a.speedKmh;
        packet.target.closingKmh = a.relSpeedKmh;
        packet.target.distanceM = a.distanceM;
        continue;
      }
      if (!packet.target.active && a.category === 'lead') {
        packet.target.active = true;
        packet.target.kind = 'follow';
        packet.target.category = 'lead';
        packet.target.x = a.worldX;
        packet.target.y = a.worldY;
        packet.target.z = a.worldZ;
        packet.target.yaw = a.yaw;
        packet.target.width = a.width;
        packet.target.length = a.length;
        packet.target.height = a.height;
        packet.target.distanceM = a.distanceM;
        packet.target.speedKmh = a.speedKmh;
        packet.target.closingKmh = a.relSpeedKmh;
        packet.target.tone = a.tone;
        continue;
      }
      if (extraTargets.length >= 6) break;
      extraTargets.push({
        category: a.category,
        x: a.worldX,
        y: a.worldY,
        z: a.worldZ,
        yaw: a.yaw,
        width: a.width,
        length: a.length,
        height: a.height,
        distanceM: a.distanceM,
        speedKmh: a.speedKmh,
        closingKmh: a.relSpeedKmh,
        tone: a.tone,
      });
    }

    packet.extraTargets = extraTargets.length > 0 ? extraTargets : undefined;

    if (pedestrianTrajectories.length > 0) {
      packet.pedestrianPaths = pedestrianTrajectories.map((traj) => ({
        tone: traj.tone,
        hasConflict: traj.hasConflict,
        points: traj.points,
        conflictPoint: traj.conflictPoint,
      }));
    } else {
      packet.pedestrianPaths = undefined;
    }

    return packet;
  }

  private syncInput(input: VehicleHUDFrameInput, visible: boolean): void {
    const o = this.extractorInput;
    o.dt = input.dt;
    o.visible = visible;
    o.enabled = input.adasEnabled;
    o.status = input.adasStatus;
    o.plan = input.adasPlan;
    o.obstacle = input.adasObstacle;
    o.rules = input.adasRules;
    o.vehicle = input.adasVehicle;
    o.samplesApproachLane = input.samplesApproachLane;
    o.theme = input.theme;
    o.ground = input.ground;
    o.camera = input.camera;
    o.viewportWidth = input.viewportWidth;
    o.viewportHeight = input.viewportHeight;
    o.colliders = input.colliders;
    o.actors = input.actors;
    o.actorCount = input.actorCount;
    o.capabilities = input.capabilities;
  }
}
