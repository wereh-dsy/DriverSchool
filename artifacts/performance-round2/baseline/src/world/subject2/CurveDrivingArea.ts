import type { Subject2AreaModule, Subject2BuildContext } from './BuildContext';
import { addDirectionArrow, addProjectGates, addRoadEdgeMarkings, createModuleRoot } from './areaHelpers';
import { createPathCurve } from './geometry';

export class CurveDrivingArea implements Subject2AreaModule {
  public readonly root = createModuleRoot('Subject 2 curve driving area');

  public constructor(context: Subject2BuildContext) {
    const curve = createPathCurve(context.layout.curveRoute);
    addRoadEdgeMarkings(
      this.root,
      context,
      'S-curve',
      curve,
      context.config.curveDriving.laneWidth,
    );
    addProjectGates(this.root, context, 'S-curve',
      context.layout.curveRoute, context.config.curveDriving.laneWidth);
    addDirectionArrow(
      this.root,
      context,
      'S-curve entry arrow',
      { x: context.config.layout.curveStart.x - 3, z: context.config.layout.curveStart.z },
      Math.PI * 0.5,
    );
    this.root.userData.projectId = 'curve-driving';
    this.root.userData.gameplayLogic = false;
  }
}
