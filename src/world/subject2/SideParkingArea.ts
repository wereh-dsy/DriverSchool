import type { Subject2AreaModule, Subject2BuildContext } from './BuildContext';
import {
  addDirectionArrow,
  addLineMarking,
  addProjectGates,
  createModuleRoot,
} from './areaHelpers';

export class SideParkingArea implements Subject2AreaModule {
  public readonly root = createModuleRoot('Subject 2 side parking area');

  public constructor(context: Subject2BuildContext) {
    const { sideCenter: center } = context.config.layout;
    const config = context.config.sideParking;
    const halfLength = config.areaLength * 0.5;
    const laneHalfWidth = config.approachWidth * 0.5;
    addLineMarking(
      this.root,
      context,
      'Side parking traffic lane edge',
      [
        { x: center.x - halfLength, z: center.z - laneHalfWidth },
        { x: center.x + halfLength, z: center.z - laneHalfWidth },
      ],
    );
    const bayCenter = {
      x: center.x + 0.5,
      z: center.z + laneHalfWidth + config.bayWidth * 0.5,
    };
    const mouthZ = center.z + laneHalfWidth;
    const bayLeft = bayCenter.x - config.bayLength * 0.5;
    const bayRight = bayCenter.x + config.bayLength * 0.5;
    const boundary = [
      { x: center.x - halfLength, z: mouthZ },
      { x: bayLeft, z: mouthZ },
      { x: bayLeft, z: mouthZ + config.bayWidth },
      { x: bayRight, z: mouthZ + config.bayWidth },
      { x: bayRight, z: mouthZ },
      { x: center.x + halfLength, z: mouthZ },
    ];
    for (let i = 1; i < boundary.length; i += 1) {
      addLineMarking(this.root, context, `Side bay boundary ${i}`,
        [boundary[i - 1]!, boundary[i]!], context.config.markings.referenceLineWidth);
    }
    // A dashed reference separates the bay from the lane without closing it.
    for (let x = bayLeft + 0.3; x < bayRight - 0.1; x += 1.2) {
      addLineMarking(this.root, context, 'Side bay mouth dash', [
        { x, z: mouthZ }, { x: Math.min(x + 0.6, bayRight - 0.1), z: mouthZ },
      ]);
    }
    addProjectGates(this.root, context, 'Side parking',
      context.layout.sideRoute, config.approachWidth);

    addDirectionArrow(
      this.root,
      context,
      'Side parking travel arrow',
      { x: center.x - halfLength + 5, z: center.z },
      -Math.PI * 0.5,
    );
    this.root.userData.projectId = 'side-parking';
    this.root.userData.gameplayLogic = false;
    this.root.userData.referenceBayCenter = bayCenter;
  }
}
