import * as THREE from 'three';
import type { Subject2BuildContext } from './BuildContext';
import {
  createPathCurve,
  makeBox,
  makeDirectionArrow,
  makeMarkingRibbon,
} from './geometry';
import type { Subject2Point2 } from './Subject2GroundConfig';

export const addLineMarking = (
  parent: THREE.Group,
  context: Subject2BuildContext,
  name: string,
  points: readonly Subject2Point2[],
  width = context.config.markings.mainLineWidth,
  material: THREE.Material = context.materials.whiteMarking,
  smooth = false,
): THREE.Mesh => {
  const marking = makeMarkingRibbon(
    name,
    createPathCurve(points, smooth),
    0,
    width,
    material,
    context.heightAt,
    context.config.markings.surfaceClearance,
  );
  parent.add(marking);
  return marking;
};

export const addRectangleOutline = (
  parent: THREE.Group,
  context: Subject2BuildContext,
  name: string,
  center: Subject2Point2,
  lengthX: number,
  widthZ: number,
  lineWidth = context.config.markings.mainLineWidth,
  material: THREE.Material = context.materials.whiteMarking,
): void => {
  const halfX = lengthX * 0.5;
  const halfZ = widthZ * 0.5;
  const points = [
    { x: center.x - halfX, z: center.z - halfZ },
    { x: center.x + halfX, z: center.z - halfZ },
    { x: center.x + halfX, z: center.z + halfZ },
    { x: center.x - halfX, z: center.z + halfZ },
    { x: center.x - halfX, z: center.z - halfZ },
  ];
  addLineMarking(parent, context, `${name} outline`, points, lineWidth, material);
};

export const addRoadEdgeMarkings = (
  parent: THREE.Group,
  context: Subject2BuildContext,
  name: string,
  curve: THREE.Curve<THREE.Vector3>,
  roadWidth: number,
): void => {
  const edgeOffset = roadWidth * 0.5 - context.config.markings.mainLineWidth * 0.5;
  parent.add(
    makeMarkingRibbon(
      `${name} left edge`,
      curve,
      -edgeOffset,
      context.config.markings.mainLineWidth,
      context.materials.whiteMarking,
      context.heightAt,
      context.config.markings.surfaceClearance,
    ),
    makeMarkingRibbon(
      `${name} right edge`,
      curve,
      edgeOffset,
      context.config.markings.mainLineWidth,
      context.materials.whiteMarking,
      context.heightAt,
      context.config.markings.surfaceClearance,
    ),
  );
};

export const addDirectionArrow = (
  parent: THREE.Group,
  context: Subject2BuildContext,
  name: string,
  center: Subject2Point2,
  yawRadians: number,
  material: THREE.Material = context.materials.whiteMarking,
): void => {
  parent.add(makeDirectionArrow(
    name,
    center,
    yawRadians,
    material,
    context.heightAt,
    context.config.markings.surfaceClearance,
  ));
};

export const addLowCurb = (
  parent: THREE.Group,
  context: Subject2BuildContext,
  name: string,
  size: readonly [number, number, number],
  position: readonly [number, number, number],
): THREE.Mesh => {
  const curb = makeBox(name, size, position, context.materials.curb, context.shadows);
  parent.add(curb);
  return curb;
};

export const createModuleRoot = (name: string): THREE.Group => {
  const root = new THREE.Group();
  root.name = name;
  root.userData.renderCategory = 'WORLD';
  return root;
};
