import * as THREE from 'three';
import type { Subject2AreaModule, Subject2BuildContext } from './BuildContext';
import {
  addDirectionArrow,
  addLineMarking,
  addRoadEdgeMarkings,
  createModuleRoot,
} from './areaHelpers';
import {
  createSurfacePatchGeometry,
  makeRoadRibbon,
  sampleCurvePoints,
} from './geometry';

const addRailSegment = (
  root: THREE.Group,
  context: Subject2BuildContext,
  name: string,
  start: THREE.Vector3,
  end: THREE.Vector3,
): void => {
  const direction = end.clone().sub(start);
  const length = direction.length();
  if (length < 1e-4) return;
  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(length, 0.08, 0.09),
    context.materials.metal,
  );
  rail.name = name;
  rail.position.copy(start).add(end).multiplyScalar(0.5);
  rail.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction.normalize());
  rail.castShadow = context.shadows;
  rail.receiveShadow = context.shadows;
  root.add(rail);
};

export class HillStartArea implements Subject2AreaModule {
  public readonly root = createModuleRoot('Subject 2 hill-start area');

  public constructor(context: Subject2BuildContext) {
    const config = context.config.hillStart;
    const entry = context.config.layout.hillEntry;
    const totalLength = config.uphillLength + config.crestLength + config.downhillLength;

    const embankment = new THREE.Mesh(
      createSurfacePatchGeometry(
        entry.x,
        entry.z - totalLength * 0.5,
        config.laneWidth + 11,
        totalLength + 5,
        context.heightAt,
        -0.035,
        0.55,
      ),
      context.materials.grass,
    );
    embankment.name = 'Hill earth embankment';
    embankment.receiveShadow = context.shadows;
    this.root.add(embankment);

    const { mesh, curve } = makeRoadRibbon(
      'Hill-start asphalt',
      context.layout.hillRoute,
      config.laneWidth,
      context.materials.asphaltPractice,
      context.heightAt,
      context.shadows,
    );
    this.root.add(mesh);
    context.surfaces.addCorridor(sampleCurvePoints(curve, 0.25), config.laneWidth);
    addRoadEdgeMarkings(this.root, context, 'Hill-start', curve, config.laneWidth);

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

    const roadEdge = config.laneWidth * 0.5 + 0.46;
    const postSpacing = 3;
    const postCount = Math.ceil(totalLength / postSpacing);
    for (const side of [-1, 1]) {
      let previousRailPoint: THREE.Vector3 | undefined;
      for (let index = 0; index <= postCount; index += 1) {
        const distance = Math.min(index * postSpacing, totalLength);
        const x = entry.x + side * roadEdge;
        const z = entry.z - distance;
        const roadHeight = context.heightAt(x, z);
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.045, 0.06, 0.76, 8),
          context.materials.darkMetal,
        );
        post.name = `Hill guardrail post ${side}-${index}`;
        post.position.set(x, roadHeight + 0.38, z);
        post.castShadow = context.shadows;
        this.root.add(post);

        const railPoint = new THREE.Vector3(x, roadHeight + 0.57, z);
        if (previousRailPoint) {
          addRailSegment(
            this.root,
            context,
            `Hill guardrail ${side}-${index}`,
            previousRailPoint,
            railPoint,
          );
        }
        previousRailPoint = railPoint;
      }
    }

    this.root.userData.projectId = 'hill-start';
    this.root.userData.gameplayLogic = false;
    this.root.userData.stopZone = Object.freeze({ firstStopZ, secondStopZ });
  }
}
