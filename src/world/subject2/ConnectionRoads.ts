import type { Subject2AreaModule, Subject2BuildContext } from './BuildContext';
import { addDirectionArrow, addRoadEdgeMarkings, createModuleRoot } from './areaHelpers';
import { makeRoadRibbon, sampleCurvePoints } from './geometry';
import type { Subject2Point2 } from './Subject2GroundConfig';

interface ConnectionDefinition {
  readonly id: string;
  readonly points: readonly Subject2Point2[];
  readonly arrow?: boolean;
}

const headingFromPoints = (from: Subject2Point2, to: Subject2Point2): number =>
  Math.atan2(-(to.x - from.x), -(to.z - from.z));

export class ConnectionRoads implements Subject2AreaModule {
  public readonly root = createModuleRoot('Subject 2 connection roads');

  public constructor(context: Subject2BuildContext) {
    const connections: readonly ConnectionDefinition[] = [
      { id: 'waiting-to-reverse', points: context.layout.waitingToReverse, arrow: true },
      { id: 'reverse-to-side', points: context.layout.reverseToSide },
      { id: 'side-to-right-angle', points: context.layout.sideToRightAngle },
      { id: 'right-angle-to-curve', points: context.layout.rightAngleToCurve },
      { id: 'curve-to-hill', points: context.layout.curveToHill, arrow: true },
    ];

    for (const connection of connections) {
      const { mesh, curve } = makeRoadRibbon(
        `Connection ${connection.id} asphalt`,
        connection.points,
        context.config.connectionRoads.defaultWidth,
        context.materials.asphalt,
        context.heightAt,
        context.shadows,
        true,
      );
      this.root.add(mesh);
      context.surfaces.addCorridor(
        sampleCurvePoints(curve, 0.35),
        context.config.connectionRoads.defaultWidth,
      );
      addRoadEdgeMarkings(
        this.root,
        context,
        `Connection ${connection.id}`,
        curve,
        context.config.connectionRoads.defaultWidth,
      );

      if (connection.arrow && connection.points.length >= 2) {
        const midpoint = curve.getPointAt(0.55);
        const tangent = curve.getTangentAt(0.55);
        addDirectionArrow(
          this.root,
          context,
          `Connection ${connection.id} direction arrow`,
          { x: midpoint.x, z: midpoint.z },
          headingFromPoints(
            { x: midpoint.x, z: midpoint.z },
            { x: midpoint.x + tangent.x, z: midpoint.z + tangent.z },
          ),
        );
      }
    }

    this.root.userData.routeRole = 'connections';
    this.root.userData.gameplayLogic = false;
  }
}
