import { buildNavigationDisplaySnapshot } from './NavigationDisplay';
import { evaluateObjectAnnotations } from './ObjectAnnotations';
import { evaluatePedestrianPredictions } from './PedestrianPrediction';
import { RoadProjectionBridge } from './RoadProjection';
import { evaluateTrafficAwareness } from './TrafficAwareness';
import { computeHUDOpticalStabilization, clampHUDHeightLevel, resolveVehicleHUDProfile } from './VehicleHUDProfile';
import { resolveVehicleHUDTheme } from './VehicleHUDTheme';
import type {
  ADASWorldVisualPacket,
  WindshieldHUDRenderData,
} from '../adas/visualization/ADASVisualizationTypes';
import type {
  VehicleHUDFrameInput,
  VehicleHUDState,
  VehicleHUDTargetAnnotation,
} from './VehicleHUDTypes';
import { buildVehicleInformationSnapshot } from './VehicleInformation';
import { buildVehicleWarnings } from './VehicleWarnings';

/**
 * Vehicle-owned native HUD coordinator (V1.1).
 * Independent of Game UI & Immersive Mode: drives both windshield HUD info
 * and world-space path/target/pedestrian projections in 3D view.
 */
export class VehicleHUDSystem {
  private readonly roadProjection = new RoadProjectionBridge();
  private lastAnnotations: VehicleHUDTargetAnnotation[] = [];
  private lastPedestrianPaths: VehicleHUDState['pedestrianTrajectories'] = [];

  public reset(): void {
    this.roadProjection.reset();
    this.lastAnnotations = [];
    this.lastPedestrianPaths = [];
  }

  public updateHUDState(input: VehicleHUDFrameInput): VehicleHUDState {
    const profile = resolveVehicleHUDProfile(input.vehicleId);
    const palette = resolveVehicleHUDTheme(input.theme, input.rainIntensity, input.fogIntensity);
    const camFov = input.camera?.fov ?? profile.baseFovDeg;
    const optical = computeHUDOpticalStabilization(
      profile,
      camFov,
      input.bodyPitchRad,
      input.bodyRollRad,
      input.headLookPitchRad,
    );

    const activeVisible = input.visible && input.ignitionOn;

    const info = buildVehicleInformationSnapshot(
      activeVisible,
      input.snapshot,
      input.sharedSpeedLimitKmh,
      input.adasRules.speedLimitMps,
      input.adasPlan.speedLimitEstimated,
    );

    const navigation = buildNavigationDisplaySnapshot(
      activeVisible,
      input.navigationState,
      input.adasPlan,
    );

    const vehicleAnns = evaluateTrafficAwareness(
      activeVisible,
      input.adasVehicle,
      input.adasPlan,
      input.adasObstacle,
      input.actors,
      input.actorCount,
      input.camera,
      input.viewportWidth,
      input.viewportHeight,
      input.colliders,
    );

    const staticAnns = evaluateObjectAnnotations(
      activeVisible,
      input.adasVehicle,
      input.adasPlan,
      input.actors,
      input.actorCount,
      input.camera,
      input.viewportWidth,
      input.viewportHeight,
      input.colliders,
    );

    const vruResult = evaluatePedestrianPredictions(
      activeVisible,
      input.adasVehicle,
      input.actors,
      input.actorCount,
      input.ground,
      input.camera,
      input.viewportWidth,
      input.viewportHeight,
      input.colliders,
    );

    // Combine annotations with lead/vru/static priority and cap total count cleanly
    const combined: VehicleHUDTargetAnnotation[] = [];
    for (let i = 0; i < vruResult.annotations.length && combined.length < 8; i++) {
      combined.push(vruResult.annotations[i]!);
    }
    for (let i = 0; i < vehicleAnns.length && combined.length < 8; i++) {
      combined.push(vehicleAnns[i]!);
    }
    for (let i = 0; i < staticAnns.length && combined.length < 8; i++) {
      combined.push(staticAnns[i]!);
    }
    this.lastAnnotations = combined;
    this.lastPedestrianPaths = vruResult.trajectories;

    const maneuverCue = this.roadProjection.evaluateManeuverCue(input);
    const { warning, maneuver } = buildVehicleWarnings(
      activeVisible,
      input.adasEnabled,
      input.adasStatus,
      input.adasPlan,
      input.adasObstacle,
      maneuverCue.phrase,
      maneuverCue.direction,
      maneuverCue.tone,
    );

    return {
      visible: activeVisible,
      profile,
      palette,
      opticalScale: optical.opticalScale,
      pitchShiftPx: optical.pitchShiftPx,
      rollDeg: optical.rollDeg,
      info,
      navigation,
      annotations: combined,
      pedestrianTrajectories: vruResult.trajectories,
      maneuver,
      warning,
    };
  }

  public buildWorldPacket(input: VehicleHUDFrameInput): ADASWorldVisualPacket {
    const activeVisible = input.visible && input.ignitionOn;
    const windshieldActive = (input.windshieldVisible ?? input.visible) && input.ignitionOn;
    if (activeVisible && this.lastAnnotations.length === 0 && input.actorCount > 0) {
      const vehicleAnns = evaluateTrafficAwareness(
        true,
        input.adasVehicle,
        input.adasPlan,
        input.adasObstacle,
        input.actors,
        input.actorCount,
        input.camera,
        input.viewportWidth,
        input.viewportHeight,
        input.colliders,
      );
      const staticAnns = evaluateObjectAnnotations(
        true,
        input.adasVehicle,
        input.adasPlan,
        input.actors,
        input.actorCount,
        input.camera,
        input.viewportWidth,
        input.viewportHeight,
        input.colliders,
      );
      const vruResult = evaluatePedestrianPredictions(
        true,
        input.adasVehicle,
        input.actors,
        input.actorCount,
        input.ground,
        input.camera,
        input.viewportWidth,
        input.viewportHeight,
        input.colliders,
      );
      this.lastAnnotations = [...vruResult.annotations, ...vehicleAnns, ...staticAnns].slice(0, 8);
      this.lastPedestrianPaths = vruResult.trajectories;
    }

    const packet = this.roadProjection.buildWorldPacket(
      { ...input, visible: activeVisible },
      activeVisible ? this.lastAnnotations : [],
      activeVisible ? this.lastPedestrianPaths : [],
    );
    packet.windshieldHud = this.buildWindshieldRenderData(input, windshieldActive);
    return packet;
  }

  private buildWindshieldRenderData(
    input: VehicleHUDFrameInput,
    windshieldActive: boolean,
  ): WindshieldHUDRenderData {
    const info = buildVehicleInformationSnapshot(
      windshieldActive,
      input.snapshot,
      input.sharedSpeedLimitKmh,
      input.adasRules.speedLimitMps,
      input.adasPlan.speedLimitEstimated,
    );
    const nav = buildNavigationDisplaySnapshot(
      windshieldActive,
      input.navigationState,
      input.adasPlan,
    );
    const maneuverCue = this.roadProjection.evaluateManeuverCue({ ...input, visible: windshieldActive });
    const { warning, maneuver } = buildVehicleWarnings(
      windshieldActive,
      input.adasEnabled,
      input.adasStatus,
      input.adasPlan,
      input.adasObstacle,
      maneuverCue.phrase,
      maneuverCue.direction,
      maneuverCue.tone,
    );

    let navDir: 'straight' | 'left' | 'right' | 'uturn' = 'straight';
    if (nav.active) {
      const sym = nav.symbol;
      const up = input.adasPlan.upcomingJunction;
      if (up.valid) {
        navDir = up.turnDirection;
      } else if (sym.includes('↺') || sym.includes('掉头')) {
        navDir = 'uturn';
      } else if (sym.includes('←') || sym.includes('↰') || sym.includes('↖')) {
        navDir = 'left';
      } else if (sym.includes('→') || sym.includes('↱') || sym.includes('↗')) {
        navDir = 'right';
      }
    }

    return {
      visible: windshieldActive,
      heightLevel: clampHUDHeightLevel(input.hudHeightLevel),
      theme: input.theme,
      rainIntensity: input.rainIntensity,
      fogIntensity: input.fogIntensity,
      speedKmh: info.speedKmh,
      speedLimitKmh: info.speedLimitKmh,
      overspeedSeverity: info.overspeedSeverity,
      gearLabel: info.gearLabel,
      rangeLabel: info.rangeLabel,
      rangeKind: info.rangeKind,
      navActive: nav.active,
      navDirection: navDir,
      navDistanceText: nav.distanceText,
      navRoadName: nav.roadName || nav.maneuverText,
      navShowLanes: nav.showLanes,
      navLanes: nav.lanes.map((l) => ({
        index: l.index,
        active: l.active,
        recommended: l.recommended,
        direction: l.direction,
      })),
      warningSeverity: warning ? warning.severity : null,
      warningTitle: warning ? warning.title : '',
      warningDetail: warning ? warning.detail : '',
      maneuverVisible: maneuver.visible,
      maneuverPhrase: maneuver.phrase,
      maneuverDirection: maneuver.direction,
      maneuverTone: maneuver.tone,
    };
  }
}
