import type { Subject2AreaModule, Subject2BuildContext } from './BuildContext';
import { addDirectionArrow, addRoadEdgeMarkings, createModuleRoot } from './areaHelpers';
import { makeRoadRibbon, sampleCurvePoints } from './geometry';

export class CurveDrivingArea implements Subject2AreaModule {
  public readonly root = createModuleRoot('Subject 2 curve driving area');

  public constructor(context: Subject2BuildContext) {
    const { mesh, curve } = makeRoadRibbon(
      'S-curve asphalt',
      context.layout.curveRoute,
      context.config.curveDriving.laneWidth,
      context.materials.asphaltPractice,
      context.heightAt,
      context.shadows,
      true,
    );
    this.root.add(mesh);
    context.surfaces.addCorridor(
      sampleCurvePoints(curve, 0.3),
      context.config.curveDriving.laneWidth,
    );
    addRoadEdgeMarkings(
      this.root,
      context,
      'S-curve',
      curve,
      context.config.curveDriving.laneWidth,
    );
    addDirectionArrow(
      this.root,
      context,
      'S-curve entry arrow',
      context.layout.curveRoute[0] ?? context.config.layout.curveStart,
      Math.PI * 0.5,
    );
    this.root.userData.projectId = 'curve-driving';
    this.root.userData.gameplayLogic = false;
  }
}
