import * as THREE from 'three';
import type { Subject3AreaModule, Subject3BuildContext } from './BuildContext';
import {
  makeDirectionArrow,
  makeFlatMarkingPolygon,
  makeMarkingRectangle,
  makeMarkingRibbon,
  type Subject3ArrowKind,
} from './geometry';
import { pointAlong, pointAlongLateral, type Subject3Point2 } from './math';
import { createModuleRoot } from './roads';
import { Subject3TrafficSignals } from './trafficSignals';
import type { Subject3JunctionArm, Subject3JunctionTopology } from './topology';
import { addLabelBoard } from './signs';
import { yawFacing } from './math';

interface ApproachLane {
  readonly lateralOffset: number;
  readonly arrow: Subject3ArrowKind;
}

const crosswalkStripeOutline = (
  halfDepth: number,
  halfWidth: number,
): readonly (readonly [number, number])[] => [
  [-halfWidth, -halfDepth],
  [halfWidth, -halfDepth],
  [halfWidth, halfDepth],
  [-halfWidth, halfDepth],
];

/** Right-turn arrow without the straight shaft, for a dedicated turn lane. */
const laneArrowsFor = (arm: Subject3JunctionArm, junction: Subject3JunctionTopology): readonly ApproachLane[] => {
  const laneWidth = arm.approachLaneWidth;
  const exits = junction.arms.filter((other) => other !== arm);
  const straight = exits.some((exit) => exit.outward.x * -arm.outward.x + exit.outward.z * -arm.outward.z > 0.8);
  const left = exits.some((exit) => exit.outward.x * arm.right.x + exit.outward.z * arm.right.z < -0.6);
  const right = exits.some((exit) => exit.outward.x * arm.right.x + exit.outward.z * arm.right.z > 0.6);
  if (arm.approachLaneCount > 1) {
    return [
      { lateralOffset: laneWidth * 0.5, arrow: left ? (straight ? 'straight-left' : 'left') : 'straight' },
      { lateralOffset: laneWidth * 1.5, arrow: right ? (straight ? 'straight-right' : 'right') : 'straight' },
    ];
  }
  const arrow: Subject3ArrowKind = !straight ? (left && right ? 'left-right' : left ? 'left' : 'right')
    : left ? 'straight-left' : right ? 'straight-right' : 'straight';
  return [{ lateralOffset: laneWidth * 0.5, arrow }];
};

/**
 * Intersection geometry: the asphalt box, stop lines, pedestrian crossings,
 * guide arrows and, for signalised junctions, the traffic signal heads.
 */
export class Subject3Junctions implements Subject3AreaModule {
  public readonly root = createModuleRoot('Subject 3 junctions');
  public readonly signals: Subject3TrafficSignals;

  public constructor(context: Subject3BuildContext) {
    this.signals = new Subject3TrafficSignals(
      context.config.junctions.length,
      context.config.junctions.map((junction) => junction.signalOffsetSeconds ?? 0),
      context.config.trafficSignals,
    );
    this.root.add(this.signals.root);
    for (const junction of context.topology.junctions) {
      this.buildBox(context, junction);
      const index = Math.max(
        0,
        context.config.junctions.findIndex((item) => item.id === junction.id),
      );
      for (const arm of junction.arms) this.buildApproach(context, junction, arm, index);
    }
  }

  private buildBox(context: Subject3BuildContext, junction: Subject3JunctionTopology): void {
    const { materials, heightAt, shadows, surfaces } = context;
    const width = junction.halfExtentX * 2;
    const depth = junction.halfExtentZ * 2;
    const box = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), materials.asphalt);
    box.name = `路口铺装 ${junction.id}`;
    box.rotation.x = -Math.PI * 0.5;
    box.position.set(
      junction.center.x,
      heightAt(junction.center.x, junction.center.z) + 0.0225,
      junction.center.z,
    );
    box.receiveShadow = shadows;
    this.root.add(box);
    surfaces.addRoadRectangle(junction.center.x, junction.center.z, width, depth);
  }

  private buildApproach(
    context: Subject3BuildContext,
    junction: Subject3JunctionTopology,
    arm: Subject3JunctionArm,
    junctionIndex: number,
  ): void {
    const { config } = context;
    // Placement travels OUT from the junction; the arrow's heading travels IN.
    const forward = arm.outward;
    const right = arm.right;
    const crosswalkCentreDistance = arm.axialDistance + config.junction.crosswalkWidth * 0.5 + 0.6;
    const stopDistance = crosswalkCentreDistance + config.junction.crosswalkWidth * 0.5 + 1.2;

    this.addCrosswalk(context, junction, arm, forward, right, crosswalkCentreDistance);
    this.addStopLine(context, junction, arm, forward, right, stopDistance);
    this.addApproachArrows(
      context,
      junction,
      arm,
      forward,
      right,
      crosswalkCentreDistance,
    );
    if (arm.approachLaneCount > 1) {
      this.addApproachLaneDivider(context, junction, arm, forward, right, crosswalkCentreDistance);
    }
    if (junction.hasTrafficSignals) {
      this.addSignalHead(
        context,
        junctionIndex,
        arm,
        forward,
        right,
        crosswalkCentreDistance,
        arm.roadWidth * 0.5,
      );
    } else {
      this.addKerbsideSignPost(
        context,
        junction,
        arm,
        forward,
        right,
        stopDistance,
        arm.roadWidth * 0.5,
      );
    }
  }

  private addCrosswalk(
    context: Subject3BuildContext,
    junction: Subject3JunctionTopology,
    arm: Subject3JunctionArm,
    forward: Subject3Point2,
    right: Subject3Point2,
    distance: number,
  ): void {
    const { config, materials, heightAt } = context;
    const stripeWidth = config.junction.crosswalkStripeWidth;
    const gap = config.junction.crosswalkStripeGap;
    const count = Math.max(3, Math.floor(arm.roadWidth / (stripeWidth + gap)));
    const pitch = arm.roadWidth / count;
    const halfDepth = config.junction.crosswalkWidth * 0.5;
    const centre = pointAlong(junction.center, forward, distance);
    for (let index = 0; index < count; index += 1) {
      const lateral = -arm.roadWidth * 0.5 + pitch * (index + 0.5);
      const stripeCentre = pointAlongLateral(centre, right, lateral);
      const mesh = makeFlatMarkingPolygon(
        `人行横道 ${junction.id} ${arm.segmentId}`,
        stripeCentre,
        arm.approachYawRadians,
        crosswalkStripeOutline(halfDepth, stripeWidth * 0.5),
        materials.whitePaint,
        heightAt,
        config.markings.surfaceClearance,
      );
      if (mesh !== null) this.root.add(mesh);
    }
  }

  private addStopLine(
    context: Subject3BuildContext,
    junction: Subject3JunctionTopology,
    arm: Subject3JunctionArm,
    forward: Subject3Point2,
    right: Subject3Point2,
    distance: number,
  ): void {
    const { config, materials, heightAt } = context;
    const halfWidth = arm.roadWidth * 0.5;
    // The stop line covers the whole approach half of the carriageway.
    const spanFrom = 0.05;
    const spanTo = halfWidth - 0.25;
    const width = spanTo - spanFrom;
    // The line runs along the lateral axis, so its local +X follows `right`.
    const yaw = Math.atan2(-right.z, right.x);
    const centre = pointAlongLateral(
      pointAlong(junction.center, forward, distance),
      right,
      (spanFrom + spanTo) * 0.5,
    );
    const mesh = makeMarkingRectangle(
      `停止线 ${junction.id} ${arm.segmentId}`,
      centre,
      yaw,
      width,
      0.4,
      materials.whitePaint,
      heightAt,
      config.markings.surfaceClearance,
    );
    if (mesh !== null) this.root.add(mesh);
  }

  private addApproachArrows(
    context: Subject3BuildContext,
    junction: Subject3JunctionTopology,
    arm: Subject3JunctionArm,
    forward: Subject3Point2,
    right: Subject3Point2,
    crosswalkCentreDistance: number,
  ): void {
    const { config, materials, heightAt } = context;
    const yaw = arm.approachYawRadians;
    const offsets = arm.approachLaneCount > 1
      ? [
        crosswalkCentreDistance + config.junction.arrowOffset,
        crosswalkCentreDistance + config.junction.secondArrowOffset,
      ]
      : [crosswalkCentreDistance + config.junction.arrowOffset];
    for (const lane of laneArrowsFor(arm, junction)) {
      for (const offset of offsets) {
        const centre = pointAlongLateral(
          pointAlong(junction.center, forward, offset),
          right,
          lane.lateralOffset,
        );
        const mesh = makeDirectionArrow(
          `导向箭头 ${arm.segmentId} ${lane.arrow}`,
          centre,
          yaw,
          lane.arrow,
          config.junction.arrowLength,
          config.junction.arrowWidth,
          materials.whitePaint,
          heightAt,
          config.markings.surfaceClearance,
        );
        if (mesh !== null) this.root.add(mesh);
      }
    }
  }

  private addApproachLaneDivider(
    context: Subject3BuildContext,
    junction: Subject3JunctionTopology,
    arm: Subject3JunctionArm,
    forward: Subject3Point2,
    right: Subject3Point2,
    crosswalkCentreDistance: number,
  ): void {
    const { config, materials, heightAt } = context;
    const lateral = arm.approachLaneWidth;
    const from = crosswalkCentreDistance + config.junction.arrowOffset - 4;
    const to = crosswalkCentreDistance + config.junction.secondArrowOffset + 7;
    const points: Subject3Point2[] = [
      pointAlongLateral(pointAlong(junction.center, forward, from), right, lateral),
      pointAlongLateral(pointAlong(junction.center, forward, to), right, lateral),
    ];
    const mesh = makeMarkingRibbon(
      '路口导向车道线',
      points,
      config.markings.thinLineWidth,
      materials.whitePaint,
      heightAt,
      config.markings.surfaceClearance,
      0,
    );
    if (mesh !== null) this.root.add(mesh);
  }

  private addKerbsideSignPost(
    context: Subject3BuildContext, junction: Subject3JunctionTopology, arm: Subject3JunctionArm,
    outward: Subject3Point2, right: Subject3Point2, stopDistance: number, halfWidth: number,
  ): void {
    const lateral = halfWidth + context.config.environment.sidewalkWidth * 0.55;
    const position = pointAlongLateral(pointAlong(junction.center, outward, stopDistance + 2.2), right, lateral);
    const hasOpposite = junction.arms.some((other) =>
      other.outward.x * arm.outward.x + other.outward.z * arm.outward.z < -0.8);
    const mustStop = junction.arms.length === 3 && !hasOpposite;
    addLabelBoard(this.root, context, `路口标志 ${junction.id} ${arm.segmentId}`,
      mustStop ? '停\nSTOP' : '注意交叉路口',
      mustStop ? '#b8342c' : '#e6b439',
      mustStop ? context.materials.signRed : context.materials.signYellow,
      position, arm.approachYawRadians,
      mustStop ? [0.9, 0.9] : [1.55, 0.7], 2.35, mustStop ? 'stop' : 'board');
  }

  private addSignalHead(
    context: Subject3BuildContext,
    junctionIndex: number,
    arm: Subject3JunctionArm,
    forward: Subject3Point2,
    right: Subject3Point2,
    crosswalkCentreDistance: number,
    halfWidth: number,
  ): void {
    const { config, materials, shadows } = context;
    const lateral = halfWidth + config.environment.sidewalkWidth * 0.55;
    // Far-side pole, past the opposite crossing. The head still faces this
    // approach and keeps its original control group and signal cycle.
    const position = pointAlongLateral(
      pointAlong(arm.junctionCentre, forward, -(crosswalkCentreDistance + config.junction.crosswalkWidth * 0.5 + 1.4)),
      right,
      lateral,
    );
    this.signals.addHead(
      junctionIndex,
      arm,
      position,
      yawFacing(arm.outward.x, arm.outward.z),
      materials,
      shadows,
      config.trafficSignals.headHeight,
    );
  }
}
