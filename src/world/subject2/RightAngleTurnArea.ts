import type { Subject2AreaModule, Subject2BuildContext } from './BuildContext';
import { addDirectionArrow, addLineMarking, addProjectGates, createModuleRoot } from './areaHelpers';

export class RightAngleTurnArea implements Subject2AreaModule {
  public readonly root = createModuleRoot('Subject 2 right-angle turn area');

  public constructor(context: Subject2BuildContext) {
    const entry = context.config.layout.rightAngleEntry;
    const { laneWidth, entryLength, exitLength } = context.config.rightAngleTurn;
    const half = laneWidth * 0.5;
    const cornerZ = entry.z - entryLength;
    // The L is defined by square marking corners on the continuous pavement.
    const edges = [
      [{ x: entry.x - half, z: entry.z }, { x: entry.x - half, z: cornerZ + half }],
      [{ x: entry.x - half, z: cornerZ + half }, { x: entry.x - exitLength, z: cornerZ + half }],
      [{ x: entry.x + half, z: entry.z }, { x: entry.x + half, z: cornerZ - half }],
      [{ x: entry.x + half, z: cornerZ - half }, { x: entry.x - exitLength, z: cornerZ - half }],
    ];
    edges.forEach((points, index) => addLineMarking(
      this.root, context, `Right-angle boundary ${index + 1}`, points));
    addProjectGates(this.root, context, 'Right-angle', context.layout.rightAngleRoute, laneWidth);
    addDirectionArrow(
      this.root,
      context,
      'Right-angle entry arrow',
      { x: entry.x, z: entry.z - 3 },
      0,
    );
    this.root.userData.projectId = 'right-angle-turn';
    this.root.userData.gameplayLogic = false;
  }
}
