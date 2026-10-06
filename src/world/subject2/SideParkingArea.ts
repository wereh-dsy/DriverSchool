import type { Subject2AreaModule, Subject2BuildContext } from './BuildContext';
import {
  addDirectionArrow,
  addLineMarking,
  addLowCurb,
  addRectangleOutline,
  createModuleRoot,
} from './areaHelpers';
import { makeSurfacePatch } from './geometry';

export class SideParkingArea implements Subject2AreaModule {
  public readonly root = createModuleRoot('Subject 2 side parking area');

  public constructor(context: Subject2BuildContext) {
    const { sideCenter: center } = context.config.layout;
    const config = context.config.sideParking;
    this.root.add(makeSurfacePatch(
      'Side parking practice asphalt',
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
      'Side parking traffic lane edge',
      [
        { x: center.x - halfLength, z: center.z - laneHalfWidth },
        { x: center.x + halfLength, z: center.z - laneHalfWidth },
      ],
    );
    addLineMarking(
      this.root,
      context,
      'Side parking kerb-side lane edge',
      [
        { x: center.x - halfLength, z: center.z + laneHalfWidth },
        { x: center.x + halfLength, z: center.z + laneHalfWidth },
      ],
    );

    const bayCenter = {
      x: center.x + 0.5,
      z: center.z + laneHalfWidth + config.bayWidth * 0.5,
    };
    addRectangleOutline(
      this.root,
      context,
      'Side parking bay',
      bayCenter,
      config.bayLength,
      config.bayWidth,
      context.config.markings.referenceLineWidth,
    );

    const kerbZ = bayCenter.z + config.bayWidth * 0.5 + 0.18;
    addLowCurb(
      this.root,
      context,
      'Side parking low kerb',
      [config.areaLength - 2, 0.09, 0.22],
      [center.x, context.heightAt(center.x, kerbZ) + 0.045, kerbZ],
    );
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
