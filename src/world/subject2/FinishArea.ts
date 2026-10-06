import type { Subject2AreaModule, Subject2BuildContext } from './BuildContext';
import {
  addDirectionArrow,
  addLineMarking,
  addRectangleOutline,
  createModuleRoot,
} from './areaHelpers';
import { makeSurfacePatch } from './geometry';

export class FinishArea implements Subject2AreaModule {
  public readonly root = createModuleRoot('Subject 2 finish area');

  public constructor(context: Subject2BuildContext) {
    const center = context.config.layout.endCenter;
    const config = context.config.endArea;
    this.root.add(makeSurfacePatch(
      'Finish area asphalt',
      center.x,
      center.z,
      config.length,
      config.width,
      context.materials.asphaltPractice,
      context.heightAt,
      context.shadows,
    ));
    context.surfaces.addRectangle(center.x, center.z, config.length, config.width);
    addRectangleOutline(this.root, context, 'Finish area boundary', center, config.length, config.width);

    const parkingWidth = 2.7;
    const parkingLength = 5.8;
    const rowWidth = config.parkingSpaceCount * parkingWidth;
    const firstX = center.x - rowWidth * 0.5 + parkingWidth * 0.5;
    const parkingZ = center.z - config.width * 0.5 + parkingLength * 0.5;
    for (let index = 0; index < config.parkingSpaceCount; index += 1) {
      addRectangleOutline(
        this.root,
        context,
        `Finish parking space ${index + 1}`,
        { x: firstX + index * parkingWidth, z: parkingZ },
        parkingWidth,
        parkingLength,
        context.config.markings.referenceLineWidth * 0.62,
      );
    }

    addLineMarking(
      this.root,
      context,
      'Finish reference line',
      [
        { x: center.x - 3.5, z: center.z + 1 },
        { x: center.x + 3.5, z: center.z + 1 },
      ],
      context.config.markings.referenceLineWidth,
      context.materials.yellowMarking,
    );
    addDirectionArrow(
      this.root,
      context,
      'Finish area direction arrow',
      { x: center.x - 9, z: center.z + 1 },
      -Math.PI * 0.5,
    );
    this.root.userData.projectId = 'finish-area';
    this.root.userData.gameplayLogic = false;
  }
}
