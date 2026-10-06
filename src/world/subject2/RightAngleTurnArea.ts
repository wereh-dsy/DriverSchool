import type { Subject2AreaModule, Subject2BuildContext } from './BuildContext';
import { addDirectionArrow, addRoadEdgeMarkings, createModuleRoot } from './areaHelpers';
import { makeRoadRibbon, sampleCurvePoints } from './geometry';

export class RightAngleTurnArea implements Subject2AreaModule {
  public readonly root = createModuleRoot('Subject 2 right-angle turn area');

  public constructor(context: Subject2BuildContext) {
    const { mesh, curve } = makeRoadRibbon(
      'Right-angle turn asphalt',
      context.layout.rightAngleRoute,
      context.config.rightAngleTurn.laneWidth,
      context.materials.asphaltPractice,
      context.heightAt,
      context.shadows,
    );
    this.root.add(mesh);
    const sampledCenterline = sampleCurvePoints(curve, 0.35);
    context.surfaces.addCorridor(sampledCenterline, context.config.rightAngleTurn.laneWidth);
    addRoadEdgeMarkings(
      this.root,
      context,
      'Right-angle turn',
      curve,
      context.config.rightAngleTurn.laneWidth,
    );
    addDirectionArrow(
      this.root,
      context,
      'Right-angle entry arrow',
      context.layout.rightAngleRoute[0] ?? context.config.layout.rightAngleEntry,
      0,
    );
    this.root.userData.projectId = 'right-angle-turn';
    this.root.userData.gameplayLogic = false;
  }
}
