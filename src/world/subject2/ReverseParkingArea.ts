import type { Subject2AreaModule, Subject2BuildContext } from './BuildContext';
import {
  addDirectionArrow,
  addLineMarking,
  addRectangleOutline,
  createModuleRoot,
} from './areaHelpers';
import { makeSurfacePatch } from './geometry';

export class ReverseParkingArea implements Subject2AreaModule {
  public readonly root = createModuleRoot('Subject 2 reverse parking area');

  public constructor(context: Subject2BuildContext) {
    const { reverseCenter: center } = context.config.layout;
    const config = context.config.reverseParking;
    this.root.add(makeSurfacePatch(
      'Reverse parking practice asphalt',
      center.x,
      center.z,
      config.areaLength,
      config.areaWidth,
      context.materials.asphaltPractice,
      context.heightAt,
      context.shadows,
    ));
    context.surfaces.addRectangle(center.x, center.z, config.areaLength, config.areaWidth);

    const halfLength = config.areaLength * 0.5;
    const laneHalfWidth = config.approachWidth * 0.5;
    addLineMarking(
      this.root,
      context,
      'Reverse approach south edge',
      [
        { x: center.x - halfLength, z: center.z - laneHalfWidth },
        { x: center.x + halfLength, z: center.z - laneHalfWidth },
      ],
    );
    addLineMarking(
      this.root,
      context,
      'Reverse approach north edge',
      [
        { x: center.x - halfLength, z: center.z + laneHalfWidth },
        { x: center.x + halfLength, z: center.z + laneHalfWidth },
      ],
    );

    // The bay overlaps the generous approach apron slightly, matching a real
    // training site and keeping every line visible in both mirrors.
    const bayCenter = {
      x: center.x + 2,
      z: center.z + config.areaWidth * 0.5 - config.bayLength * 0.5,
    };
    addRectangleOutline(
      this.root,
      context,
      'Reverse parking bay',
      bayCenter,
      config.bayWidth,
      config.bayLength,
      context.config.markings.referenceLineWidth,
    );

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
