import * as THREE from 'three';
import type { Subject2AreaModule, Subject2BuildContext } from './BuildContext';
import {
  addDirectionArrow,
  addLineMarking,
  addRectangleOutline,
  createModuleRoot,
} from './areaHelpers';
import { makeSurfacePatch } from './geometry';

export class WaitingArea implements Subject2AreaModule {
  public readonly root = createModuleRoot('Subject 2 waiting area');

  public constructor(context: Subject2BuildContext) {
    const { waitingCenter: center } = context.config.layout;
    const config = context.config.waitingArea;
    this.root.add(makeSurfacePatch(
      'Waiting area asphalt',
      center.x,
      center.z,
      config.length,
      config.width,
      context.materials.asphaltPractice,
      context.heightAt,
      context.shadows,
    ));
    context.surfaces.addRectangle(center.x, center.z, config.length, config.width);

    addRectangleOutline(
      this.root,
      context,
      'Waiting area boundary',
      center,
      config.length,
      config.width,
    );

    const parkingRowWidth = config.parkingSpaceCount * config.parkingSpaceWidth;
    const firstX = center.x - parkingRowWidth * 0.5 + config.parkingSpaceWidth * 0.5;
    const parkingCenterZ = center.z + config.width * 0.5 - config.parkingSpaceLength * 0.5;
    for (let index = 0; index < config.parkingSpaceCount; index += 1) {
      addRectangleOutline(
        this.root,
        context,
        `Waiting parking space ${index + 1}`,
        { x: firstX + index * config.parkingSpaceWidth, z: parkingCenterZ },
        config.parkingSpaceWidth,
        config.parkingSpaceLength,
        context.config.markings.referenceLineWidth * 0.62,
      );
    }

    const startX = center.x - 7.8;
    addLineMarking(
      this.root,
      context,
      'Waiting start reference line',
      [
        { x: startX, z: center.z - 2.1 },
        { x: startX, z: center.z + 2.1 },
      ],
      context.config.markings.referenceLineWidth,
      context.materials.yellowMarking,
    );
    addDirectionArrow(
      this.root,
      context,
      'Waiting area exit arrow',
      { x: center.x + 5.5, z: center.z },
      -Math.PI * 0.5,
    );

    const exitX = center.x + config.length * 0.5;
    addLineMarking(
      this.root,
      context,
      'Waiting area exit throat left',
      [{ x: exitX - 7, z: center.z - 2.1 }, { x: exitX, z: center.z - 2.1 }],
    );
    addLineMarking(
      this.root,
      context,
      'Waiting area exit throat right',
      [{ x: exitX - 7, z: center.z + 2.1 }, { x: exitX, z: center.z + 2.1 }],
    );

    this.root.userData.projectId = 'waiting-area';
    this.root.userData.gameplayLogic = false;
    this.root.userData.spawnReference = new THREE.Vector3(startX + 1.8, 0, center.z);
  }
}
