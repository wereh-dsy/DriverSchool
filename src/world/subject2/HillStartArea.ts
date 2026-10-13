import type { Subject2AreaModule, Subject2BuildContext } from './BuildContext';
import {
  addDirectionArrow,
  addLineMarking,
  addProjectGates,
  addRoadEdgeMarkings,
  createModuleRoot,
} from './areaHelpers';
import { createPathCurve } from './geometry';

export class HillStartArea implements Subject2AreaModule {
  public readonly root = createModuleRoot('Subject 2 hill-start area');

  public constructor(context: Subject2BuildContext) {
    const config = context.config.hillStart;
    const entry = context.config.layout.hillEntry;
    const curve = createPathCurve(context.layout.hillRoute);
    addRoadEdgeMarkings(this.root, context, 'Hill-start', curve, config.laneWidth);
    addProjectGates(this.root, context, 'Hill-start', context.layout.hillRoute, config.laneWidth);

    const stopZoneCenterDistance = Math.min(
      config.uphillLength - config.stopZoneLength * 0.55,
      config.uphillLength * 0.72,
    );
    const firstStopZ = entry.z - stopZoneCenterDistance + config.stopZoneLength * 0.5;
    const secondStopZ = firstStopZ - config.stopZoneLength;
    for (const [index, z] of [firstStopZ, secondStopZ].entries()) {
      addLineMarking(
        this.root,
        context,
        `Hill stop-zone reference ${index + 1}`,
        [
          { x: entry.x - config.laneWidth * 0.5, z },
          { x: entry.x + config.laneWidth * 0.5, z },
        ],
        context.config.markings.referenceLineWidth,
        index === 0 ? context.materials.whiteMarking : context.materials.yellowMarking,
      );
    }
    addDirectionArrow(
      this.root,
      context,
      'Hill-start approach arrow',
      { x: entry.x, z: entry.z - 2.8 },
      0,
      context.materials.yellowMarking,
    );

    this.root.userData.projectId = 'hill-start';
    this.root.userData.gameplayLogic = false;
    this.root.userData.stopZone = Object.freeze({ firstStopZ, secondStopZ });
  }
}
