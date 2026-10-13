import type { Subject2AreaModule, Subject2BuildContext } from './BuildContext';
import {
  addDirectionArrow,
  addLineMarking,
  addProjectGates,
  createModuleRoot,
} from './areaHelpers';

export class ReverseParkingArea implements Subject2AreaModule {
  public readonly root = createModuleRoot('Subject 2 reverse parking area');

  public constructor(context: Subject2BuildContext) {
    const { reverseCenter: center } = context.config.layout;
    const config = context.config.reverseParking;
    const halfLength = config.areaLength * 0.5;
    const laneHalfWidth = config.approachWidth * 0.5;
    const bayCenter = {
      x: center.x + 2,
      z: center.z + laneHalfWidth + config.bayLength * 0.5,
    };
    const bayLeft = bayCenter.x - config.bayWidth * 0.5;
    const bayRight = bayCenter.x + config.bayWidth * 0.5;
    const bayMouthZ = center.z + laneHalfWidth;
    addLineMarking(
      this.root,
      context,
      'Reverse approach south edge',
      [
        { x: center.x - halfLength, z: center.z - laneHalfWidth },
        { x: center.x + halfLength, z: center.z - laneHalfWidth },
      ],
    );
    // The T-shaped boundary follows the bay, leaving its mouth open.
    const boundary = [
      { x: center.x - halfLength, z: bayMouthZ },
      { x: bayLeft, z: bayMouthZ },
      { x: bayLeft, z: bayMouthZ + config.bayLength },
      { x: bayRight, z: bayMouthZ + config.bayLength },
      { x: bayRight, z: bayMouthZ },
      { x: center.x + halfLength, z: bayMouthZ },
    ];
    for (let i = 1; i < boundary.length; i += 1) {
      addLineMarking(this.root, context, `Reverse bay boundary ${i}`,
        [boundary[i - 1]!, boundary[i]!], context.config.markings.referenceLineWidth);
    }
    addProjectGates(this.root, context, 'Reverse parking',
      context.layout.reverseRoute, config.approachWidth);

    const bayHalfWidth = config.bayWidth * 0.5;
    const bayBackZ = bayCenter.z + config.bayLength * 0.5;
    const cornerSize = 0.42;
    for (const x of [bayCenter.x - bayHalfWidth, bayCenter.x + bayHalfWidth]) {
      addLineMarking(
        this.root,
        context,
        `Reverse bay corner ${x < bayCenter.x ? 'left' : 'right'}`,
        [{ x: x - cornerSize * 0.5, z: bayBackZ }, { x: x + cornerSize * 0.5, z: bayBackZ }],
        context.config.markings.referenceLineWidth * 1.35,
        context.materials.yellowMarking,
      );
    }

    addDirectionArrow(
      this.root,
      context,
      'Reverse parking approach arrow',
      { x: center.x - halfLength + 5, z: center.z },
      -Math.PI * 0.5,
    );
    this.root.userData.projectId = 'reverse-parking';
    this.root.userData.gameplayLogic = false;
    this.root.userData.referenceBayCenter = bayCenter;
  }
}
