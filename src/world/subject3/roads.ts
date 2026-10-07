import * as THREE from 'three';
import type { Subject3AreaModule, Subject3BuildContext } from './BuildContext';
import { makeMarkingRibbon, makeRoadRibbon } from './geometry';
import { clipPolylineRange, dashRangesAlong, polylineLength, type Subject3Point2 } from './math';
import type { Subject3SegmentTopology } from './topology';
import { SUBJECT3_PLACES } from './Subject3GroundConfig';

export const createModuleRoot = (name: string): THREE.Group => {
  const root = new THREE.Group();
  root.name = name;
  root.userData.renderCategory = 'WORLD';
  root.userData.gameplayLogic = false;
  return root;
};

const resample = (
  points: readonly Subject3Point2[],
  maximumSpacing: number,
): { readonly point: Subject3Point2; readonly tangent: Subject3Point2 }[] => {
  const fine: { point: Subject3Point2; tangent: Subject3Point2 }[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[Math.max(0, index - 1)]!;
    const next = points[Math.min(points.length - 1, index + 1)]!;
    const dx = next.x - previous.x;
    const dz = next.z - previous.z;
    const length = Math.hypot(dx, dz);
    const tangent = length < 1e-9 ? { x: 0, z: -1 } : { x: dx / length, z: dz / length };
    fine.push({ point: points[index]!, tangent });
    if (index === points.length - 1) break;
    const segmentLength = Math.hypot(
      points[index + 1]!.x - points[index]!.x,
      points[index + 1]!.z - points[index]!.z,
    );
    const steps = Math.max(1, Math.ceil(segmentLength / maximumSpacing));
    for (let step = 1; step < steps; step += 1) {
      const t = step / steps;
      fine.push({
        point: {
          x: points[index]!.x + (points[index + 1]!.x - points[index]!.x) * t,
          z: points[index]!.z + (points[index + 1]!.z - points[index]!.z) * t,
        },
        tangent,
      });
    }
  }
  return fine;
};

const buildRibbonGeometry = (
  points: readonly Subject3Point2[],
  innerOffset: number,
  outerOffset: number,
  side: number,
  heightAt: (x: number, z: number) => number,
  height: number,
): THREE.BufferGeometry => {
  const positions: number[] = [];
  const indices: number[] = [];
  const samples = resample(points, 2);
  for (const sample of samples) {
    const rightX = -sample.tangent.z * side;
    const rightZ = sample.tangent.x * side;
    for (const offset of [innerOffset, outerOffset]) {
      const x = sample.point.x + rightX * offset;
      const z = sample.point.z + rightZ * offset;
      positions.push(x, heightAt(x, z) + height, z);
    }
  }
  for (let index = 0; index < samples.length - 1; index += 1) {
    const base = index * 2;
    // Mirroring the offsets also reverses winding. Both pavements face upwards.
    if (side > 0) indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    else indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
};

const buildKerbFaceGeometry = (
  points: readonly Subject3Point2[],
  edgeOffset: number,
  side: number,
  heightAt: (x: number, z: number) => number,
  height: number,
): THREE.BufferGeometry => {
  const positions: number[] = [];
  const indices: number[] = [];
  const samples = resample(points, 2);
  for (const sample of samples) {
    const rightX = -sample.tangent.z * side;
    const rightZ = sample.tangent.x * side;
    const x = sample.point.x + rightX * edgeOffset;
    const z = sample.point.z + rightZ * edgeOffset;
    const base = heightAt(x, z);
    positions.push(x, base + 0.015, z, x, base + height, z);
  }
  for (let index = 0; index < samples.length - 1; index += 1) {
    const base = index * 2;
    if (side > 0) {
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    } else {
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
};

/** Offset copy of a polyline, used to register a sidewalk corridor. */
const offsetPolyline = (
  points: readonly Subject3Point2[],
  side: number,
  offset: number,
): Subject3Point2[] => points.map((point, index) => {
  const previous = points[Math.max(0, index - 1)]!;
  const next = points[Math.min(points.length - 1, index + 1)]!;
  const dx = next.x - previous.x;
  const dz = next.z - previous.z;
  const length = Math.hypot(dx, dz) || 1;
  return {
    x: point.x - (dz / length) * offset * side,
    z: point.z + (dx / length) * offset * side,
  };
});

/**
 * Draws every carriageway, kerb, sidewalk and longitudinal road marking. Lane
 * markings are clipped inside junction footprints so intersections read as open
 * boxes with their own stop lines, crossings and guide arrows.
 */
export class Subject3Roads implements Subject3AreaModule {
  public readonly root = createModuleRoot('Subject 3 roads');

  public constructor(private readonly context: Subject3BuildContext) {
    for (const segment of context.topology.segments) {
      this.buildAsphalt(segment);
      this.buildSidewalks(segment);
      this.buildLongitudinalMarkings(segment);
    }
  }

  private buildAsphalt(segment: Subject3SegmentTopology): void {
    const { materials, heightAt, shadows, surfaces } = this.context;
    const mesh = makeRoadRibbon(
      `${segment.name} 沥青路面`,
      segment.centerline,
      segment.width,
      materials.asphalt,
      heightAt,
      shadows,
    );
    if (mesh !== null) this.root.add(mesh);
    surfaces.addRoadCorridor(segment.centerline, segment.width);

    // Corner pads keep the polyline kinks filled where a road changes heading.
    for (let index = 1; index < segment.centerline.length - 1; index += 1) {
      const point = segment.centerline[index]!;
      const previous = segment.centerline[index - 1]!;
      const next = segment.centerline[index + 1]!;
      const incoming = Math.atan2(point.z - previous.z, point.x - previous.x);
      const outgoing = Math.atan2(next.z - point.z, next.x - point.x);
      const turn = Math.abs(Math.atan2(Math.sin(outgoing - incoming), Math.cos(outgoing - incoming)));
      if (turn < 0.04) continue;
      const pad = new THREE.Mesh(
        new THREE.CircleGeometry(segment.width * 0.52, 18),
        materials.asphalt,
      );
      pad.name = `${segment.name} 转角补面`;
      pad.rotation.x = -Math.PI * 0.5;
      pad.position.set(point.x, heightAt(point.x, point.z) + 0.021, point.z);
      pad.receiveShadow = shadows;
      this.root.add(pad);
      surfaces.addRoadRectangle(point.x, point.z, segment.width, segment.width);
    }
  }

  private buildSidewalks(segment: Subject3SegmentTopology): void {
    const { config, materials, heightAt, shadows, surfaces } = this.context;
    const gaps = this.context.topology.gapRangesBySegment.get(segment.id) ?? [];
    const sidewalkWidth = config.environment.sidewalkWidth;
    const outerOffset = segment.width * 0.5 + sidewalkWidth * 0.5;
    const height = config.environment.sidewalkHeight;
    for (const side of [-1, 1] as const) {
      const openings = [...gaps];
      if (segment.id === 'south-road' && side === 1) {
        const shop = SUBJECT3_PLACES.supermarket;
        const distance = shop.drivewayX - segment.start.x;
        openings.push({ startDistance: distance - shop.drivewayWidth / 2,
          endDistance: distance + shop.drivewayWidth / 2 });
      }
      for (const part of this.keepOutsideGaps(segment.centerline, openings, 0)) {
        if (polylineLength(part) < 1.5) continue;
        const inner = segment.width * 0.5;
        const strip = new THREE.Mesh(
          buildRibbonGeometry(part, inner, inner + sidewalkWidth, side, heightAt, height),
          materials.sidewalk,
        );
        strip.name = `${segment.name} 人行道`;
        strip.receiveShadow = shadows;
        this.root.add(strip);
        surfaces.addSidewalkCorridor(offsetPolyline(part, side, outerOffset), sidewalkWidth);

        const kerbTop = new THREE.Mesh(
          buildRibbonGeometry(part, inner - 0.02, inner + 0.32, side, heightAt, height + 0.012),
          materials.curb,
        );
        kerbTop.name = `${segment.name} 路缘石`;
        kerbTop.receiveShadow = shadows;
        kerbTop.castShadow = shadows;
        this.root.add(kerbTop);

        const kerbFace = new THREE.Mesh(
          buildKerbFaceGeometry(part, inner, side, heightAt, height),
          materials.curb,
        );
        kerbFace.name = `${segment.name} 路缘石立面`;
        kerbFace.castShadow = shadows;
        this.root.add(kerbFace);
      }
    }
  }

  private buildLongitudinalMarkings(segment: Subject3SegmentTopology): void {
    const { config, materials, heightAt } = this.context;
    const clearance = config.markings.surfaceClearance;
    const lineWidth = config.markings.lineWidth;
    const gaps = this.context.topology.gapRangesBySegment.get(segment.id) ?? [];
    // The approach paint begins upstream of the pedestrian crossing.
    const parts = this.keepOutsideGaps(segment.centerline, gaps, config.junction.crosswalkWidth + 1);
    const edgeOffset = segment.width * 0.5 - 0.35;
    const isArterial = segment.roadClass === 'arterial';

    for (const part of parts) {
      if (polylineLength(part) < 1) continue;
      for (const offset of isArterial ? [-0.22, 0.22] : [0]) {
        const mesh = makeMarkingRibbon(
          `${segment.name} 中心线`,
          part,
          isArterial ? config.markings.thinLineWidth : lineWidth,
          materials.yellowPaint,
          heightAt,
          clearance,
          offset,
          1.2,
        );
        if (mesh !== null) this.root.add(mesh);
      }
      if (isArterial) {
        for (const side of [-1, 1] as const) {
          this.addDashedLine(
            `${segment.name} 车道虚线`,
            part,
            side * (segment.width / 4),
            config.markings.thinLineWidth,
            materials.whitePaint,
          );
        }
      }
      for (const side of [-1, 1] as const) {
        const mesh = makeMarkingRibbon(
          `${segment.name} 车行道边缘线`,
          part,
          lineWidth,
          materials.whitePaint,
          heightAt,
          clearance,
          side * edgeOffset,
          1.2,
        );
        if (mesh !== null) this.root.add(mesh);
      }
    }
  }

  private addDashedLine(
    name: string,
    points: readonly Subject3Point2[],
    lateralOffset: number,
    width: number,
    material: THREE.Material,
  ): void {
    const { config, heightAt } = this.context;
    for (const dash of dashRangesAlong(points, config.markings.dashLength, config.markings.dashGap)) {
      const clipped = clipPolylineRange(points, dash.startDistance, dash.endDistance);
      if (clipped === null) continue;
      const mesh = makeMarkingRibbon(
        name,
        clipped,
        width,
        material,
        heightAt,
        config.markings.surfaceClearance,
        lateralOffset,
        1.4,
      );
      if (mesh !== null) this.root.add(mesh);
    }
  }

  private keepOutsideGaps(
    points: readonly Subject3Point2[],
    gaps: readonly { readonly startDistance: number; readonly endDistance: number }[],
    extra: number,
  ): Subject3Point2[][] {
    if (gaps.length === 0) return [points.map((point) => ({ ...point }))];
    const merged: { start: number; end: number }[] = [];
    const expanded = gaps
      .map((gap) => ({ start: gap.startDistance - extra, end: gap.endDistance + extra }))
      .sort((a, b) => a.start - b.start);
    for (const gap of expanded) {
      const last = merged[merged.length - 1];
      if (last && gap.start <= last.end + 1e-6) {
        merged[merged.length - 1] = { start: last.start, end: Math.max(last.end, gap.end) };
        continue;
      }
      merged.push({ ...gap });
    }
    const total = polylineLength(points);
    const kept: Subject3Point2[][] = [];
    let cursor = 0;
    for (const gap of merged) {
      if (gap.start > cursor) {
        const part = clipPolylineRange(points, cursor, Math.min(gap.start, total));
        if (part !== null) kept.push(part);
      }
      cursor = Math.max(cursor, gap.end);
    }
    if (cursor < total) {
      const part = clipPolylineRange(points, cursor, total);
      if (part !== null) kept.push(part);
    }
    return kept;
  }
}
