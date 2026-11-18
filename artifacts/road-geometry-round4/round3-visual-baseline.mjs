// src/loading/Loading.ts
function drain(steps) {
  for (; ; ) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

// src/world/city/RoadBuilder.ts
import { BoxGeometry as BoxGeometry4, BufferGeometry as BufferGeometry10, CylinderGeometry as CylinderGeometry3, Float32BufferAttribute as Float32BufferAttribute8, Group as Group6, InstancedMesh as InstancedMesh3, Matrix4 as Matrix43, Mesh as Mesh6 } from "three";

// src/world/subject3/geometry.ts
import * as THREE from "three";
var SUBJECT3_ROAD_SURFACE_OFFSET = 0.024;
var sampleRibbonPolyline = (points, maximumSpacing) => {
  const samples = [];
  const direction = (a, b) => {
    const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
  };
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    const incoming = direction(points[Math.max(0, i - 1)], point);
    const outgoing = direction(point, points[Math.min(points.length - 1, i + 1)]);
    const divisor = Math.max(0.25, 1 + incoming.x * outgoing.x + incoming.z * outgoing.z);
    const tangent = i === 0 ? outgoing : i === points.length - 1 ? incoming : { x: (incoming.x + outgoing.x) / divisor, z: (incoming.z + outgoing.z) / divisor };
    samples.push({ point, tangent });
    if (i === points.length - 1) continue;
    const next = points[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(next.x - point.x, next.z - point.z) / maximumSpacing));
    for (let step = 1; step < steps; step += 1) {
      const t = step / steps;
      samples.push({
        point: {
          x: point.x + (next.x - point.x) * t,
          z: point.z + (next.z - point.z) * t,
          y: point.y === void 0 && next.y === void 0 ? void 0 : (point.y ?? 0) + ((next.y ?? 0) - (point.y ?? 0)) * t
        },
        tangent: outgoing
      });
    }
  }
  return samples;
};
var createStripGeometry = (points, heightAt, options) => {
  if (points.length < 2) return null;
  const positions = [];
  const uvs = [];
  const indices = [];
  const fine = sampleRibbonPolyline(points, options.maximumSpacing ?? 1.4);
  for (let index = 0; index < fine.length; index += 1) {
    const sample = fine[index];
    const rightX = -sample.tangent.z;
    const rightZ = sample.tangent.x;
    const point = sample.point;
    for (const offset of [options.innerOffset, options.outerOffset]) {
      const x = point.x + rightX * offset;
      const z = point.z + rightZ * offset;
      positions.push(x, (point.y ?? heightAt(x, z)) + options.yOffset, z);
      uvs.push(offset === options.innerOffset ? 0 : 1, index / (fine.length - 1 || 1));
    }
  }
  for (let index = 0; index < fine.length - 1; index += 1) {
    const base = index * 2;
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }
  const geometry2 = new THREE.BufferGeometry();
  geometry2.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry2.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry2.setIndex(indices);
  geometry2.computeVertexNormals();
  geometry2.computeBoundingSphere();
  return geometry2;
};
var makeMarkingRibbon = (name, points, width, material, heightAt, clearance, lateralOffset = 0, maximumSpacing = 1.6) => {
  const geometry2 = createStripGeometry(points, heightAt, {
    innerOffset: lateralOffset - width * 0.5,
    outerOffset: lateralOffset + width * 0.5,
    yOffset: SUBJECT3_ROAD_SURFACE_OFFSET + clearance,
    maximumSpacing
  });
  if (geometry2 === null) return null;
  const mesh = new THREE.Mesh(geometry2, material);
  mesh.name = name;
  mesh.userData.subject3RoadMarking = true;
  return mesh;
};
var makeBox = (name, size, position, material, shadows) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
  mesh.name = name;
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  return mesh;
};
var transformMarkingPoint = (center, yawRadians, localX, localZ) => {
  const cos = Math.cos(yawRadians);
  const sin = Math.sin(yawRadians);
  return {
    x: center.x + localX * cos + localZ * sin,
    z: center.z - localX * sin + localZ * cos
  };
};
var makeFlatMarkingPolygon = (name, center, yawRadians, outline, material, heightAt, clearance) => {
  if (outline.length < 3) return null;
  const contour = outline.map(([x, z]) => new THREE.Vector2(x, z));
  if (THREE.ShapeUtils.isClockWise(contour)) contour.reverse();
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  if (faces.length === 0) return null;
  const positions = [];
  for (const point of contour) {
    const world = transformMarkingPoint(center, yawRadians, point.x, point.y);
    positions.push(world.x, heightAt(world.x, world.z) + SUBJECT3_ROAD_SURFACE_OFFSET + clearance, world.z);
  }
  const indices = [];
  for (const face of faces) indices.push(face[0], face[2], face[1]);
  const geometry2 = new THREE.BufferGeometry();
  geometry2.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry2.setIndex(indices);
  geometry2.computeVertexNormals();
  geometry2.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry2, material);
  mesh.name = name;
  mesh.userData.subject3RoadMarking = true;
  return mesh;
};
var makeMarkingRectangle = (name, center, yawRadians, width, depth, material, heightAt, clearance) => makeFlatMarkingPolygon(
  name,
  center,
  yawRadians,
  [
    [-width * 0.5, -depth * 0.5],
    [width * 0.5, -depth * 0.5],
    [width * 0.5, depth * 0.5],
    [-width * 0.5, depth * 0.5]
  ],
  material,
  heightAt,
  clearance
);
var ARROW_OUTLINES = Object.freeze({
  "left-right": [
    [-0.18, 1.9],
    [-0.18, 0.65],
    [-0.62, 0.65],
    [-0.62, 0.95],
    [-1.35, 0.25],
    [-0.62, -0.45],
    [-0.62, -0.15],
    [0.62, -0.15],
    [0.62, -0.45],
    [1.35, 0.25],
    [0.62, 0.95],
    [0.62, 0.65],
    [0.18, 0.65],
    [0.18, 1.9]
  ],
  straight: [
    [-0.18, 1.9],
    [-0.18, -0.35],
    [-0.58, -0.35],
    [0, -1.7],
    [0.58, -0.35],
    [0.18, -0.35],
    [0.18, 1.9]
  ],
  left: [
    [-0.18, 1.9],
    [-0.18, 0.65],
    [-0.62, 0.65],
    [-0.62, 0.95],
    [-1.35, 0.25],
    [-0.62, -0.45],
    [-0.62, -0.15],
    [0.18, -0.15],
    [0.18, 1.9]
  ],
  right: [
    [0.18, 1.9],
    [0.18, 0.65],
    [0.62, 0.65],
    [0.62, 0.95],
    [1.35, 0.25],
    [0.62, -0.45],
    [0.62, -0.15],
    [-0.18, -0.15],
    [-0.18, 1.9]
  ],
  "straight-left": [
    [-0.18, 1.9],
    [-0.18, 0.35],
    [-0.62, 0.35],
    [-0.62, 0.6],
    [-1.4, 0.05],
    [-0.62, -0.5],
    [-0.62, -0.2],
    [-0.18, -0.2],
    [-0.18, -0.35],
    [-0.55, -0.35],
    [0, -1.6],
    [0.55, -0.35],
    [0.18, -0.35],
    [0.18, 1.9]
  ],
  "straight-right": [
    [0.18, 1.9],
    [0.18, 0.35],
    [0.62, 0.35],
    [0.62, 0.6],
    [1.4, 0.05],
    [0.62, -0.5],
    [0.62, -0.2],
    [0.18, -0.2],
    [0.18, -0.35],
    [0.55, -0.35],
    [0, -1.6],
    [-0.55, -0.35],
    [-0.18, -0.35],
    [-0.18, 1.9]
  ]
});
var makeDirectionArrow = (name, center, yawRadians, kind, length, width, material, heightAt, clearance) => {
  const outline = ARROW_OUTLINES[kind].map(([localX, localZ]) => [
    localX * width * 0.5,
    localZ * length / 3.6
  ]);
  return makeFlatMarkingPolygon(name, center, yawRadians, outline, material, heightAt, clearance);
};

// src/world/city/geometry.ts
import { CatmullRomCurve3, Vector3 } from "three";

// src/world/city/CityMapData.ts
var INTERSECTION_LANES = { t_2lane: 2, t_4lane: 4, cross_4lane: 4, cross_6lane: 6, irregular: 6, divided_cross: 6 };

// src/world/city/geometry.ts
var portDirections = {
  north: { x: 0, z: -1 },
  east: { x: 1, z: 0 },
  south: { x: 0, z: 1 },
  west: { x: -1, z: 0 },
  extra: { x: Math.SQRT1_2, z: -Math.SQRT1_2 },
  extra2: { x: -Math.SQRT1_2, z: Math.SQRT1_2 }
};
function portDirection(j, port) {
  const angle = j.portAngles?.[port];
  return angle === void 0 ? portDirections[port] : { x: Math.sin(angle), z: -Math.cos(angle) };
}
function portsFor(j) {
  return j.type === "divided_cross" ? ["north", "east", "south", "west", "extra", "extra2"] : j.type === "irregular" ? ["north", "east", "south", "west", "extra"] : j.type.startsWith("t_") ? ["north", "east", "west"] : ["north", "east", "south", "west"];
}
function rotatePoint(p, radians) {
  const c = Math.cos(radians), s = Math.sin(radians);
  return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
}
function junctionExtent(j, map) {
  let width = INTERSECTION_LANES[j.type] * 3.5;
  for (const connection of j.connections) {
    const road = map.roads.find((r) => r.id === connection.roadId);
    if (road) width = Math.max(width, road.laneCount * road.laneWidth);
  }
  return Math.max(width / 2 + 7, ...Object.values(j.approachOffsets ?? {}).map((p) => Math.max(Math.abs(p.x), Math.abs(p.z))));
}
function roadEdges(road) {
  const half = road.laneCount * road.laneWidth / 2;
  const left = -half - (road.shoulders?.left ?? 0), right = half + (road.shoulders?.right ?? 0);
  return { left, right, width: right - left };
}
function roadPoints(road) {
  const points = road.centerline.map((p) => ({ ...p, y: road.elevationMode === "ground" ? road.elevation ?? 0 : road.elevationMode === "elevated" ? road.elevation ?? 6 : p.y ?? 0 }));
  if (road.curve !== "smooth" || points.length < 3) return points;
  const curve = new CatmullRomCurve3(points.map((p) => new Vector3(p.x, 0, p.z)), false, "centripetal");
  const count = Math.max(8, Math.ceil(polylineLength(points) / 3));
  return curve.getPoints(count).map((p, index) => {
    const node = index / count * (points.length - 1), a = Math.min(points.length - 2, Math.floor(node)), t = node - a;
    return { x: p.x, y: points[a].y + (points[a + 1].y - points[a].y) * t, z: p.z };
  });
}
function polylineLength(points) {
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  return sum;
}
function sampleAt(points, distance) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 1e-8) continue;
    if (distance <= length || i === points.length - 1) {
      const t = Math.min(1, distance / length);
      return { point: { x: a.x + (b.x - a.x) * t, y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t, z: a.z + (b.z - a.z) * t }, tangent: { x: (b.x - a.x) / length, y: ((b.y ?? 0) - (a.y ?? 0)) / length, z: (b.z - a.z) / length } };
    }
    distance -= length;
  }
  return { point: points[0], tangent: { x: 0, z: -1 } };
}

// src/world/city/RoadCompileSampling.ts
function roadCompileSampler(points) {
  if (points.length < 16) return (distance) => sampleAt(points, distance);
  const lengths = new Float64Array(points.length);
  for (let i = 1; i < points.length; i++) lengths[i] = Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  return (distance) => {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], length = lengths[i];
      if (length < 1e-8) continue;
      if (distance <= length || i === points.length - 1) {
        const t = Math.min(1, distance / length);
        return { point: { x: a.x + (b.x - a.x) * t, y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t, z: a.z + (b.z - a.z) * t }, tangent: { x: (b.x - a.x) / length, y: ((b.y ?? 0) - (a.y ?? 0)) / length, z: (b.z - a.z) / length } };
      }
      distance -= length;
    }
    return { point: points[0], tangent: { x: 0, z: -1 } };
  };
}

// src/world/city/JunctionSurface.ts
import { BufferGeometry as BufferGeometry3, Float32BufferAttribute as Float32BufferAttribute3 } from "three";

// src/world/city/RoadEdgeChain.ts
import { BufferGeometry as BufferGeometry2, Float32BufferAttribute as Float32BufferAttribute2 } from "three";
var RoadEdgeChains = class {
  corridors = [];
  frames = /* @__PURE__ */ new Map();
  starts = /* @__PURE__ */ new Map();
  neighbours = /* @__PURE__ */ new Map();
  roads;
  continuationIds = /* @__PURE__ */ new Map();
  constructor(map) {
    const roads = new Map(map.roads.map((r) => [r.id, r])), paths = new Map(map.roads.map((r) => [r.id, roadPoints(r)]));
    this.roads = roads;
    const key = (e) => e.roadId + ":" + e.end;
    const groups = [];
    const endpointGroups = /* @__PURE__ */ new Map();
    for (const link of map.roadLinks ?? []) {
      const a = endpointGroups.get(key(link.from)), b = endpointGroups.get(key(link.to));
      if (a && b && a !== b) {
        a.push(...b);
        for (const end of b) endpointGroups.set(key(end), a);
        groups.splice(groups.indexOf(b), 1);
      } else if (a && !b) {
        a.push(link.to);
        endpointGroups.set(key(link.to), a);
      } else if (b && !a) {
        b.push(link.from);
        endpointGroups.set(key(link.from), b);
      } else if (!a && !b) {
        const group = [link.from, link.to];
        groups.push(group);
        endpointGroups.set(key(link.from), group);
        endpointGroups.set(key(link.to), group);
      }
    }
    const neighbour = /* @__PURE__ */ new Map();
    const out = (e) => {
      const p = paths.get(e.roadId), a = e.end === "start" ? p[0] : p.at(-1), b = e.end === "start" ? p[1] : p.at(-2), l = Math.hypot(b.x - a.x, b.z - a.z);
      return { x: (b.x - a.x) / l, z: (b.z - a.z) / l };
    };
    for (const g of groups) for (const a of g) {
      const r = roads.get(a.roadId), p = paths.get(r.id)[a.end === "start" ? 0 : paths.get(r.id).length - 1], u = out(a);
      const matches = g.filter((b) => b.roadId !== r.id).filter((b) => {
        const s = roads.get(b.roadId), v = out(b), q = paths.get(s.id)[b.end === "start" ? 0 : paths.get(s.id).length - 1];
        return r.laneCount === s.laneCount && r.laneWidth === s.laneWidth && JSON.stringify(r.shoulders) === JSON.stringify(s.shoulders) && r.structure?.barrierEnabled === s.structure?.barrierEnabled && Math.hypot(p.x - q.x, p.z - q.z) < 0.06 && Math.abs((p.y ?? 0) - (q.y ?? 0)) < 0.02 && u.x * v.x + u.z * v.z < -0.95;
      });
      if (matches.length === 1) neighbour.set(key(a), matches[0]);
    }
    for (const [id, end] of neighbour) {
      const back = neighbour.get(key(end));
      if (!back || key(back) !== id) neighbour.delete(id);
    }
    for (const [id, end] of neighbour) this.neighbours.set(id, end);
    const seen = /* @__PURE__ */ new Set();
    for (const seed of map.roads) {
      if (seen.has(seed.id)) continue;
      let begin = { roadId: seed.id, end: "start" };
      const searched = /* @__PURE__ */ new Set();
      while (neighbour.has(key(begin)) && !searched.has(begin.roadId)) {
        searched.add(begin.roadId);
        const a = neighbour.get(key(begin));
        begin = { roadId: a.roadId, end: a.end === "start" ? "end" : "start" };
      }
      const parts = [], points = [];
      let current = begin, distance = 0;
      while (!seen.has(current.roadId)) {
        const r = roads.get(current.roadId), reverse = current.end === "end", p = reverse ? [...paths.get(r.id)].reverse() : paths.get(r.id);
        const start = points.length ? points.length - 1 : 0;
        points.push(...points.length ? p.slice(1) : p);
        parts.push({ r, reverse, start, end: points.length - 1 });
        this.starts.set(r.id, { distance, reverse });
        distance += polylineLength(p);
        seen.add(r.id);
        const next = neighbour.get(key({ roadId: r.id, end: reverse ? "start" : "end" }));
        if (!next) break;
        current = next;
      }
      const frames = sampleRibbonPolyline(points, Infinity);
      if (points.length > 3 && Math.hypot(points[0].x - points.at(-1).x, points[0].z - points.at(-1).z) < 0.06) {
        const p = points[0], a = points.at(-2), b = points[1], al = Math.hypot(p.x - a.x, p.z - a.z), bl = Math.hypot(b.x - p.x, b.z - p.z), u = { x: (p.x - a.x) / al, z: (p.z - a.z) / al }, v = { x: (b.x - p.x) / bl, z: (b.z - p.z) / bl }, divisor = Math.max(0.25, 1 + u.x * v.x + u.z * v.z), t = { x: (u.x + v.x) / divisor, z: (u.z + v.z) / divisor };
        frames[0].tangent = t;
        frames.at(-1).tangent = t;
      }
      for (const part of parts) {
        const f = frames.slice(part.start, part.end + 1);
        this.frames.set(part.r.id, part.reverse ? f.reverse().map((a) => ({ point: a.point, tangent: { x: -a.tangent.x, z: -a.tangent.z } })) : f);
      }
      this.corridors.push({ id: "edge:" + parts[0].r.id, roadIds: parts.map((p) => p.r.id), points, length: distance });
      const ids = new Set(parts.map((p) => p.r.id));
      for (const id of ids) this.continuationIds.set(id, ids);
    }
    for (const group of groups) for (const end of group) {
      const road = roads.get(end.roadId);
      if (!road.gore && !road.highwayTransition) continue;
      const own = this.frames.get(road.id), frame = own[end.end === "start" ? 0 : own.length - 1];
      const hosts = group.filter((e) => e.roadId !== road.id).map((e) => ({ end: e, road: roads.get(e.roadId) })).filter((q) => q.road.laneCount > road.laneCount || q.road.laneCount === road.laneCount && q.road.laneWidth > road.laneWidth + 0.01).sort((a, b) => b.road.laneCount * b.road.laneWidth - a.road.laneCount * a.road.laneWidth || a.road.id.localeCompare(b.road.id));
      const host = hosts[0];
      if (!host) continue;
      const frames = this.frames.get(host.road.id), other = frames[host.end.end === "start" ? 0 : frames.length - 1], sign = frame.tangent.x * other.tangent.x + frame.tangent.z * other.tangent.z >= 0 ? 1 : -1;
      if (Math.hypot(frame.point.x - other.point.x, frame.point.z - other.point.z) > 0.06 || Math.abs((frame.point.y ?? 0) - (other.point.y ?? 0)) > 0.02 || (frame.tangent.x * other.tangent.x + frame.tangent.z * other.tangent.z) * sign < 0.7) continue;
      frame.tangent = { x: other.tangent.x * sign, z: other.tangent.z * sign };
    }
  }
  continuations(roadId) {
    return this.continuationIds.get(roadId) ?? /* @__PURE__ */ new Set([roadId]);
  }
  edge(road, offset, yOffset = 0) {
    return (this.frames.get(road.id) ?? sampleRibbonPolyline(roadPoints(road), Infinity)).map((f) => ({ x: f.point.x - f.tangent.z * offset, y: (f.point.y ?? 0) + yOffset, z: f.point.z + f.tangent.x * offset }));
  }
  /** Structure offsets may differ at a tunnel portal. Blend both sections to a
   * common wall/rail endpoint while keeping the drivable pavement edge fixed. */
  barrierEdge(road, side) {
    const frames = this.frames.get(road.id), own = road.structure?.barrierOffset ?? 0, edges = roadEdges(road), length = polylineLength(frames.map((f) => f.point));
    const joined = (end2) => {
      const e = this.neighbours.get(road.id + ":" + end2);
      return e ? (own + (this.roads.get(e.roadId).structure?.barrierOffset ?? 0)) / 2 : own;
    };
    const start = joined("start"), end = joined("end");
    let d = 0;
    return frames.map((f, i) => {
      if (i) d += Math.hypot(f.point.x - frames[i - 1].point.x, f.point.z - frames[i - 1].point.z);
      const span = Math.min(30, length / 2), extra = own + (start - own) * Math.max(0, 1 - d / span) + (end - own) * Math.max(0, 1 - (length - d) / span), offset = (side < 0 ? edges.left : edges.right) + side * extra;
      return { x: f.point.x - f.tangent.z * offset, y: f.point.y ?? 0, z: f.point.z + f.tangent.x * offset };
    });
  }
  /** Sampling phase shared across continued road IDs, avoiding paired lamps at seams. */
  firstStation(road, spacing, phase = spacing / 2) {
    const start = this.starts.get(road.id);
    if (!start) return phase;
    const d = ((phase - start.distance) % spacing + spacing) % spacing;
    return start.reverse ? ((start.distance + polylineLength(roadPoints(road)) - phase) % spacing + spacing) % spacing : d;
  }
};
var cache = /* @__PURE__ */ new WeakMap();
function invalidateRoadEdgeChains(map) {
  cache.delete(map);
}
function roadEdgeChains(map) {
  let c = cache.get(map);
  if (!c) {
    c = new RoadEdgeChains(map);
    cache.set(map, c);
  }
  return c;
}
function roadEdgeStrip(road, map, left, right, yOffset) {
  const chain = roadEdgeChains(map), a = chain.edge(road, left, yOffset), b = chain.edge(road, right, yOffset), positions = [], uv = [], indices = [];
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    if (i) d += Math.hypot(a[i].x - a[i - 1].x, a[i].z - a[i - 1].z);
    positions.push(a[i].x, a[i].y ?? 0, a[i].z, b[i].x, b[i].y ?? 0, b[i].z);
    uv.push(0, d, 1, d);
    if (i < a.length - 1) {
      const k = i * 2;
      indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const geometry2 = new BufferGeometry2();
  geometry2.setAttribute("position", new Float32BufferAttribute2(positions, 3));
  geometry2.setAttribute("uv", new Float32BufferAttribute2(uv, 2));
  geometry2.setIndex(indices);
  geometry2.computeVertexNormals();
  return geometry2;
}

// src/world/city/JunctionSurface.ts
function junctionApproachExtent(j, map, port) {
  const offset = j.approachOffsets?.[port];
  if (offset) {
    const d2 = portDirection(j, port);
    return offset.x * d2.x + offset.z * d2.z;
  }
  if (!j.pavementFootprint) return junctionExtent(j, map);
  const d = portDirection(j, port);
  let distance = 0;
  const polygon = j.pavementFootprint;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length], ex = b.x - a.x, ez = b.z - a.z, den = d.x * ez - d.z * ex;
    if (Math.abs(den) < 1e-8) continue;
    const t = (a.x * ez - a.z * ex) / den, u = (a.x * d.z - a.z * d.x) / den;
    if (t >= 0 && u >= -1e-6 && u <= 1 + 1e-6) distance = Math.max(distance, t);
  }
  return distance || junctionExtent(j, map);
}
function compileJunctionSurface(j) {
  const outline = j.pavementFootprint.map((p) => {
    const q = rotatePoint(p, j.rotation);
    return { x: j.position.x + q.x, y: (j.position.y ?? 0) + (q.y ?? 0), z: j.position.z + q.z };
  });
  const minX = Math.min(...outline.map((p) => p.x)), maxX = Math.max(...outline.map((p) => p.x)), minZ = Math.min(...outline.map((p) => p.z)), maxZ = Math.max(...outline.map((p) => p.z));
  const base = j.position.y ?? 0;
  const planes = outline.map((a, i) => {
    const b = outline[(i + 1) % outline.length], ax = a.x - j.position.x, az = a.z - j.position.z, bx = b.x - j.position.x, bz = b.z - j.position.z, den = ax * bz - az * bx;
    return { ax, az, bx, bz, den, gx: ((a.y - base) * bz - (b.y - base) * az) / den, gz: (ax * (b.y - base) - bx * (a.y - base)) / den };
  }).filter((p) => Math.abs(p.den) > 1e-8);
  return { contains(x, z) {
    if (x < minX || x > maxX || z < minZ || z > maxZ) return false;
    let inside = false;
    for (let i = 0, k = outline.length - 1; i < outline.length; k = i++) {
      const a = outline[i], b = outline[k];
      if (a.z > z !== b.z > z && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
    }
    return inside;
  }, heightAt(x, z) {
    const qx = x - j.position.x, qz = z - j.position.z;
    for (const p of planes) {
      const u = (qx * p.bz - qz * p.bx) / p.den, v = (p.ax * qz - p.az * qx) / p.den;
      if (u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6) return base + p.gx * qx + p.gz * qz;
    }
    return base;
  } };
}
function junctionSurfaceContains(j, map, p, margin = 0) {
  const q = rotatePoint({ x: p.x - j.position.x, z: p.z - j.position.z }, -j.rotation), outline = j.pavementFootprint;
  if (!outline) {
    const h = junctionExtent(j, map) + margin;
    return Math.abs(q.x) <= h && Math.abs(q.z) <= h;
  }
  let inside = false;
  for (let i = 0, k = outline.length - 1; i < outline.length; k = i++) {
    const a = outline[i], b = outline[k];
    if (a.z > q.z !== b.z > q.z && q.x < (b.x - a.x) * (q.z - a.z) / (b.z - a.z) + a.x)
      inside = !inside;
    const dx = b.x - a.x, dz = b.z - a.z, l = dx * dx + dz * dz, t = l ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.z - a.z) * dz) / l)) : 0;
    const distance = Math.hypot(q.x - a.x - t * dx, q.z - a.z - t * dz);
    if (margin < 0 && distance <= -margin) return false;
    if (distance <= margin + 1e-6)
      return true;
  }
  return inside;
}
function junctionSurfaceHeight(j, p) {
  const outline = j.pavementFootprint, base = j.position.y ?? 0;
  if (!outline)
    return base;
  const q = rotatePoint({ x: p.x - j.position.x, z: p.z - j.position.z }, -j.rotation);
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length], den = a.x * b.z - a.z * b.x;
    if (Math.abs(den) < 1e-8)
      continue;
    const u = (q.x * b.z - q.z * b.x) / den, v = (a.x * q.z - a.z * q.x) / den;
    if (u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6)
      return base + u * (a.y ?? 0) + v * (b.y ?? 0);
  }
  return base;
}
function clipRoadJunctionPavement(geometry2, road, map, surfaceOffset = 0.024, sidewalk = false) {
  const junctions = map.intersections.filter((j) => j.pavementFootprint && j.connections.some((c) => c.roadId === road.id));
  const attribute = geometry2.getAttribute("position"), uv = geometry2.getAttribute("uv"), index = geometry2.index;
  const triangles = [];
  for (let i = 0; i < (index?.count ?? attribute.count); i += 3)
    triangles.push(Array.from({ length: 3 }, (_, k) => {
      const n = index ? index.getX(i + k) : i + k;
      return { x: attribute.getX(n), y: attribute.getY(n), z: attribute.getZ(n), u: uv?.getX(n) ?? 0, v: uv?.getY(n) ?? 0 };
    }));
  let pieces = triangles;
  const masks = junctions.map((j) => ({ outline: j.pavementFootprint.map((p) => {
    const q = rotatePoint(p, j.rotation);
    return { x: j.position.x + q.x, z: j.position.z + q.z };
  }), heightAt: (x, z) => junctionSurfaceHeight(j, { x, z }), tolerance: 0.5 }));
  if (!sidewalk) {
    const chains = roadEdgeChains(map), ids = /* @__PURE__ */ new Set();
    for (const link of map.roadLinks ?? []) for (const [a, b] of [[link.from, link.to], [link.to, link.from]]) if (a.roadId === road.id) {
      const other = map.roads.find((r) => r.id === b.roadId);
      if (road.gore || road.highwayTransition || other.gore || other.highwayTransition) {
        ids.add(other.id);
        if (other.highwayTransition) ids.add(other.highwayTransition.mainRoadId);
      }
    }
    if (road.highwayTransition) ids.add(road.highwayTransition.mainRoadId);
    for (const id of [...ids]) for (const continuation of chains.continuations(id)) ids.add(continuation);
    const bounds = { minX: Math.min(...triangles.flatMap((t) => t.map((p) => p.x))), maxX: Math.max(...triangles.flatMap((t) => t.map((p) => p.x))), minZ: Math.min(...triangles.flatMap((t) => t.map((p) => p.z))), maxZ: Math.max(...triangles.flatMap((t) => t.map((p) => p.z))) };
    for (const other of map.roads.filter((r) => ids.has(r.id) && r.id !== road.id && (r.laneCount > road.laneCount || r.laneCount === road.laneCount && r.id < road.id))) {
      const e = roadEdges(other), left = chains.edge(other, e.left), right = chains.edge(other, e.right);
      for (let i = 1; i < left.length; i++) {
        const outline = [left[i - 1], left[i], right[i], right[i - 1]];
        if (Math.max(...outline.map((p) => p.x)) < bounds.minX || Math.min(...outline.map((p) => p.x)) > bounds.maxX || Math.max(...outline.map((p) => p.z)) < bounds.minZ || Math.min(...outline.map((p) => p.z)) > bounds.maxZ) continue;
        for (const corners of [[outline[0], outline[1], outline[2]], [outline[0], outline[2], outline[3]]]) {
          const [a, b, c] = corners, den = (b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z);
          if (Math.abs(den) < 1e-8) continue;
          const gx = (((b.y ?? 0) - (a.y ?? 0)) * (c.z - a.z) - ((c.y ?? 0) - (a.y ?? 0)) * (b.z - a.z)) / den, gz = ((b.x - a.x) * ((c.y ?? 0) - (a.y ?? 0)) - (c.x - a.x) * ((b.y ?? 0) - (a.y ?? 0))) / den;
          masks.push({ outline: den > 0 ? corners : [...corners].reverse(), heightAt: (x, z) => (a.y ?? 0) + gx * (x - a.x) + gz * (z - a.z), tolerance: 0.035 });
        }
      }
    }
  }
  if (!masks.length && !sidewalk) return geometry2;
  if (sidewalk) {
    const neighbours = new Set(junctions.flatMap((j) => j.connections.map((c) => c.roadId)));
    for (const link of map.roadLinks ?? []) if (link.from.roadId === road.id) neighbours.add(link.to.roadId);
    else if (link.to.roadId === road.id) neighbours.add(link.from.roadId);
    for (const other of map.roads.filter((r) => r.id !== road.id && neighbours.has(r.id))) {
      const samples = sampleRibbonPolyline(roadPoints(other), 6), edges = roadEdges(other);
      const vertex = (i, offset) => {
        const s = samples[i];
        return { x: s.point.x - s.tangent.z * offset, z: s.point.z + s.tangent.x * offset };
      };
      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1].point, b = samples[i].point, dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
        if (l2 < 1e-8) continue;
        masks.push({ outline: [vertex(i - 1, edges.left), vertex(i, edges.left), vertex(i, edges.right), vertex(i - 1, edges.right)], heightAt: (x, z) => (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2)), tolerance: 0.5 });
      }
    }
  }
  for (const mask of masks) {
    const outline = mask.outline, next = [];
    const minX = Math.min(...outline.map((p) => p.x)), maxX = Math.max(...outline.map((p) => p.x)), minZ = Math.min(...outline.map((p) => p.z)), maxZ = Math.max(...outline.map((p) => p.z));
    for (const triangle of pieces) {
      if (triangle.every((p) => p.x < minX) || triangle.every((p) => p.x > maxX) || triangle.every((p) => p.z < minZ) || triangle.every((p) => p.z > maxZ)) {
        next.push(triangle);
        continue;
      }
      const center = { x: (triangle[0].x + triangle[1].x + triangle[2].x) / 3, z: (triangle[0].z + triangle[1].z + triangle[2].z) / 3 };
      const height = (triangle[0].y + triangle[1].y + triangle[2].y) / 3 - surfaceOffset;
      if (Math.abs(height - mask.heightAt(center.x, center.z)) > mask.tolerance || mask.tolerance < 0.1 && triangle.some((p) => Math.abs(p.y - surfaceOffset - mask.heightAt(p.x, p.z)) > mask.tolerance)) {
        next.push(triangle);
        continue;
      }
      let remaining = triangle;
      for (let edge = 0; edge < outline.length && remaining.length >= 3; edge++) {
        const a = outline[edge], b = outline[(edge + 1) % outline.length], side = (p) => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
        const cut = (inside) => {
          const polygon = [];
          for (let i = 0; i < remaining.length; i++) {
            const p = remaining[i], q = remaining[(i + 1) % remaining.length], sp = side(p), sq = side(q), pin = inside ? sp >= 0 : sp <= 0, qin = inside ? sq >= 0 : sq <= 0;
            if (pin)
              polygon.push(p);
            if (pin !== qin) {
              const t = sp / (sp - sq);
              polygon.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, z: p.z + (q.z - p.z) * t, u: p.u + (q.u - p.u) * t, v: p.v + (q.v - p.v) * t });
            }
          }
          return polygon;
        };
        const outside = cut(false);
        for (let k = 1; k + 1 < outside.length; k++) {
          const a2 = outside[0], b2 = outside[k], c = outside[k + 1];
          if (Math.abs((b2.x - a2.x) * (c.z - a2.z) - (b2.z - a2.z) * (c.x - a2.x)) > 1e-7)
            next.push([a2, b2, c]);
        }
        remaining = cut(true);
      }
    }
    pieces = next;
  }
  const clipped = new BufferGeometry3();
  clipped.setAttribute("position", new Float32BufferAttribute3(pieces.flatMap((t) => t.flatMap((p) => [p.x, p.y, p.z])), 3));
  clipped.setAttribute("uv", new Float32BufferAttribute3(pieces.flatMap((t) => t.flatMap((p) => [p.u, p.v])), 2));
  clipped.computeVertexNormals();
  clipped.computeBoundingSphere();
  geometry2.dispose();
  return clipped;
}

// src/world/city/RoadClearance.ts
var runtimeCache = /* @__PURE__ */ new WeakMap();
function invalidateRoadClearance(map) {
  runtimeCache.delete(map);
}
function runtimeRoadClearance(map) {
  let index = runtimeCache.get(map);
  if (!index) {
    index = new RoadClearance(map);
    runtimeCache.set(map, index);
  }
  return index;
}
var RoadClearance = class {
  constructor(map) {
    this.map = map;
    if (map.regional) for (const junction of map.intersections) {
      const radius = (junction.pavementFootprint ? Math.max(...junction.pavementFootprint.map((p) => Math.hypot(p.x, p.z))) : Math.SQRT2 * junctionExtent(junction, map)) + 1e-5;
      for (let x = Math.floor((junction.position.x - radius) / 50); x <= Math.floor((junction.position.x + radius) / 50); x++) for (let z = Math.floor((junction.position.z - radius) / 50); z <= Math.floor((junction.position.z + radius) / 50); z++) {
        const key = x + "," + z, list = this.junctionBuckets.get(key) ?? [];
        list.push(junction);
        this.junctionBuckets.set(key, list);
      }
    }
    for (const road of map.roads) {
      const points = roadPoints(road), edges = roadEdges(road), margin = Math.max(-edges.left, edges.right) + 6;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i], segment = { roadId: road.id, a, b, ...edges, laneHalf: road.laneCount * road.laneWidth / 2 };
        for (let x = Math.floor((Math.min(a.x, b.x) - margin) / 50); x <= Math.floor((Math.max(a.x, b.x) + margin) / 50); x++)
          for (let z = Math.floor((Math.min(a.z, b.z) - margin) / 50); z <= Math.floor((Math.max(a.z, b.z) + margin) / 50); z++) {
            const key = `${x},${z}`, bucket = this.buckets.get(key) ?? [];
            bucket.push(segment);
            this.buckets.set(key, bucket);
          }
      }
    }
  }
  map;
  buckets = /* @__PURE__ */ new Map();
  junctionBuckets = /* @__PURE__ */ new Map();
  roadAt(p, margin = 0, minY = -Infinity, maxY = Infinity, exclude, match, carriagewayOnly = false) {
    for (let bx = Math.floor((p.x - margin) / 50); bx <= Math.floor((p.x + margin) / 50); bx++) for (let bz = Math.floor((p.z - margin) / 50); bz <= Math.floor((p.z + margin) / 50); bz++) for (const s of this.buckets.get(`${bx},${bz}`) ?? []) {
      if (s.roadId === exclude || match && !match(s.roadId)) continue;
      const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z, length = Math.hypot(dx, dz);
      if (length < 0.01) continue;
      const along = ((p.x - s.a.x) * dx + (p.z - s.a.z) * dz) / length;
      if (along < -margin || along > length + margin) continue;
      const t = Math.max(0, Math.min(1, along / length));
      const y = (s.a.y ?? 0) + ((s.b.y ?? 0) - (s.a.y ?? 0)) * t;
      const offset = (-(p.x - s.a.x) * dz + (p.z - s.a.z) * dx) / length;
      if (y >= minY && y <= maxY && offset >= (carriagewayOnly ? -s.laneHalf : s.left) - margin && offset <= (carriagewayOnly ? s.laneHalf : s.right) + margin) return true;
    }
    return false;
  }
  /** Lowest overlying support plane, used to terminate retaining walls below decks. */
  lowestDeckHeight(p, minY, maxY, exclude, margin = 3) {
    let result = Infinity;
    for (const s of this.buckets.get(`${Math.floor(p.x / 50)},${Math.floor(p.z / 50)}`) ?? []) {
      if (s.roadId === exclude) continue;
      const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z, l = Math.hypot(dx, dz);
      if (l < 0.01) continue;
      const along = ((p.x - s.a.x) * dx + (p.z - s.a.z) * dz) / l;
      if (along < -margin || along > l + margin) continue;
      const t = Math.max(0, Math.min(1, along / l)), y = (s.a.y ?? 0) + ((s.b.y ?? 0) - (s.a.y ?? 0)) * t, offset = (-(p.x - s.a.x) * dz + (p.z - s.a.z) * dx) / l;
      if (y >= minY && y <= maxY && offset >= s.left - margin && offset <= s.right + margin) result = Math.min(result, y);
    }
    return Number.isFinite(result) ? result : void 0;
  }
  junctionAt(p, margin = 0, minY = -Infinity, maxY = Infinity) {
    const candidates = this.map.regional ? /* @__PURE__ */ new Set() : void 0;
    if (candidates) {
      const pad = Math.max(0, margin);
      for (let x = Math.floor((p.x - pad) / 50); x <= Math.floor((p.x + pad) / 50); x++) for (let z = Math.floor((p.z - pad) / 50); z <= Math.floor((p.z + pad) / 50); z++) for (const j of this.junctionBuckets.get(x + "," + z) ?? []) candidates.add(j);
    }
    for (const j of candidates ?? this.map.intersections) {
      const y = junctionSurfaceHeight(j, p);
      if (y < minY || y > maxY) continue;
      if (junctionSurfaceContains(j, this.map, p, margin)) return true;
    }
    return false;
  }
  /** Includes shoulders, junction crossings and signal sight space. */
  permitsProp(p, radius = 1, height = 2) {
    const y = p.y ?? 0;
    return !this.roadAt(p, radius, y - 2, y + height + 0.65) && !this.junctionAt(p, radius + 8, y - 2, y + height + 0.65);
  }
};
function barrierOffset(road, side) {
  const edges = roadEdges(road);
  return (side < 0 ? edges.left : edges.right) + side * (road.structure?.barrierOffset ?? 0);
}

// src/world/regional/RegionalTerrain.ts
import { BufferGeometry as BufferGeometry5, DataTexture, Float32BufferAttribute as Float32BufferAttribute4, Group, Mesh as Mesh2, MeshLambertMaterial, NearestFilter, Vector2 as Vector22 } from "three";

// src/world/regional/RegionalTerrainClearance.ts
var RegionalTerrainClearance = class {
  cells = /* @__PURE__ */ new Map();
  constructor(map) {
    const roads = new Map(map.roads.map((r) => [r.id, r])), portals = /* @__PURE__ */ new Map();
    for (const link of map.roadLinks ?? []) {
      const a = roads.get(link.from.roadId), b = roads.get(link.to.roadId);
      if (a.structure?.enclosure?.kind === "tunnel" === (b.structure?.enclosure?.kind === "tunnel")) continue;
      for (const end of [link.from, link.to]) {
        const list = portals.get(end.roadId) ?? /* @__PURE__ */ new Set();
        list.add(end.end);
        portals.set(end.roadId, list);
      }
    }
    const chains = roadEdgeChains(map);
    for (const [id, ends] of portals) {
      const road = roads.get(id), path = roadPoints(road), length = polylineLength(path), edges = roadEdges(road), left = chains.edge(road, edges.left - 0.6), right = chains.edge(road, edges.right + 0.6);
      let station = 0;
      for (let i = 1; i < path.length; i++) {
        const before = station;
        station += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
        if (!(ends.has("start") && before < 200 || ends.has("end") && length - station < 200)) continue;
        const outline = [left[i - 1], right[i - 1], right[i], left[i]];
        const area = outline.reduce((s, p, k) => {
          const q = outline[(k + 1) % outline.length];
          return s + p.x * q.z - q.x * p.z;
        }, 0);
        if (area < 0) outline.reverse();
        const cut = { outline, a: path[i - 1], b: path[i], roof: road.structure?.enclosure?.kind === "tunnel" ? road.structure.enclosure.clearance + 0.65 : void 0, minX: Math.min(...outline.map((p) => p.x)), maxX: Math.max(...outline.map((p) => p.x)), minZ: Math.min(...outline.map((p) => p.z)), maxZ: Math.max(...outline.map((p) => p.z)) };
        for (let x = Math.floor(cut.minX / 100); x <= Math.floor(cut.maxX / 100); x++) for (let z = Math.floor(cut.minZ / 100); z <= Math.floor(cut.maxZ / 100); z++) {
          const key = x + "," + z, list = this.cells.get(key) ?? [];
          list.push(cut);
          this.cells.set(key, list);
        }
      }
    }
  }
  clip(triangle) {
    const minX = Math.min(...triangle.map((p) => p.x)), maxX = Math.max(...triangle.map((p) => p.x)), minZ = Math.min(...triangle.map((p) => p.z)), maxZ = Math.max(...triangle.map((p) => p.z)), cuts = /* @__PURE__ */ new Set();
    for (let x = Math.floor(minX / 100); x <= Math.floor(maxX / 100); x++) for (let z = Math.floor(minZ / 100); z <= Math.floor(maxZ / 100); z++) for (const cut of this.cells.get(x + "," + z) ?? []) if (cut.maxX >= minX && cut.minX <= maxX && cut.maxZ >= minZ && cut.minZ <= maxZ) cuts.add(cut);
    let pieces = [triangle];
    const clip = (polygon, side, inside) => {
      const result = [];
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i], b = polygon[(i + 1) % polygon.length], sa = side(a), sb = side(b), ia = inside ? sa >= 0 : sa <= 0, ib = inside ? sb >= 0 : sb <= 0;
        if (ia) result.push(a);
        if (ia !== ib) {
          const t = sa / (sa - sb);
          result.push({ x: a.x + (b.x - a.x) * t, y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t, z: a.z + (b.z - a.z) * t });
        }
      }
      return result;
    };
    for (const cut of cuts) {
      const dx = cut.b.x - cut.a.x, dz = cut.b.z - cut.a.z, squared = dx * dx + dz * dz;
      if (squared < 1e-8) continue;
      const roadY = (p) => (cut.a.y ?? 0) + ((cut.b.y ?? 0) - (cut.a.y ?? 0)) * ((p.x - cut.a.x) * dx + (p.z - cut.a.z) * dz) / squared;
      const next = [];
      for (const piece of pieces) {
        let inside = piece;
        if (piece.every((p) => (p.y ?? 0) <= roadY(p) - 0.04) || cut.roof !== void 0 && piece.every((p) => (p.y ?? 0) >= roadY(p) + cut.roof)) {
          next.push(piece);
          continue;
        }
        for (let i = 0; i < cut.outline.length && inside.length >= 3; i++) {
          const a = cut.outline[i], b = cut.outline[(i + 1) % cut.outline.length], side = (p) => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x), outside = clip(inside, side, false);
          if (outside.length >= 3) next.push(outside);
          inside = clip(inside, side, true);
        }
        if (inside.length >= 3) {
          const below = clip(inside, (p) => roadY(p) - 0.04 - (p.y ?? 0), true);
          if (below.length >= 3) next.push(below);
          if (cut.roof !== void 0) {
            const above = clip(inside, (p) => (p.y ?? 0) - roadY(p) - cut.roof, true);
            if (above.length >= 3) next.push(above);
          }
        }
      }
      pieces = next;
    }
    return pieces;
  }
};

// src/world/city/VisualStreamingData.ts
import { Box3, BufferAttribute, BufferGeometry as BufferGeometry4, Sphere, Vector3 as Vector32 } from "three";
function exportVisualGeometry(g, copyBuffers = true) {
  g.computeBoundingBox();
  g.computeBoundingSphere();
  const copy = (name) => {
    const a = g.getAttribute(name)?.array;
    return a ? !copyBuffers && a instanceof Float32Array ? a : new Float32Array(a) : void 0;
  };
  const box = g.boundingBox, sphere = g.boundingSphere;
  return {
    position: copy("position"),
    normal: copy("normal"),
    uv: copy("uv"),
    color: copy("color"),
    index: g.index ? new Uint32Array(g.index.array) : void 0,
    bounds: [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z],
    sphere: [sphere.center.x, sphere.center.y, sphere.center.z, sphere.radius]
  };
}
function importVisualGeometry(d) {
  const g = new BufferGeometry4();
  g.setAttribute("position", new BufferAttribute(d.position, 3));
  g.setAttribute("normal", new BufferAttribute(d.normal, 3));
  if (d.uv) g.setAttribute("uv", new BufferAttribute(d.uv, 2));
  if (d.color) g.setAttribute("color", new BufferAttribute(d.color, 3));
  if (d.index) g.setIndex(new BufferAttribute(d.index, 1));
  g.boundingBox = new Box3(new Vector32(d.bounds[0], d.bounds[1], d.bounds[2]), new Vector32(d.bounds[3], d.bounds[4], d.bounds[5]));
  g.boundingSphere = new Sphere(new Vector32(d.sphere[0], d.sphere[1], d.sphere[2]), d.sphere[3]);
  return g;
}

// src/world/city/CityTerrain.ts
function cityTerrainOffsetAt(forms, x, z) {
  let y = 0;
  for (const f of forms ?? []) {
    const dx = (x - f.center.x) / f.radiusX, dz = (z - f.center.z) / f.radiusZ, q = dx * dx + dz * dz;
    if (q < 1) y += f.height * (1 - q) ** 2;
  }
  return y;
}

// src/world/regional/RegionalTerrain.ts
var samplerCache = /* @__PURE__ */ new WeakMap();
function regionalTerrainSampler(map) {
  let sampler = samplerCache.get(map);
  if (!sampler) {
    sampler = new RegionalTerrainSampler(map);
    samplerCache.set(map, sampler);
  }
  return sampler;
}
var blend = (v) => {
  v = Math.max(0, Math.min(1, v));
  return v * v * (3 - 2 * v);
};
var RegionalTerrainSampler = class {
  constructor(map) {
    this.map = map;
    this.cityAreas = [map.regional.cityBounds, ...map.regional.cityExtensions ?? []];
    this.westCrossings = map.regional.structures.filter((s) => s.kind === "bridge" && s.routes.includes("S37")).map((s) => s.center).sort((a, b) => a.z - b.z);
    for (const road of map.roads) {
      if (!road.id.startsWith("regional:")) continue;
      for (let i = 1; i < road.centerline.length; i++) {
        const a = road.centerline[i - 1], b = road.centerline[i], s = { a, b, halfWidth: road.laneCount * road.laneWidth / 2 + 4, tunnel: road.corridorSection === "TUNNEL", bridge: road.corridorSection === "BRIDGE", ramp: road.corridorSection === "RAMP" };
        for (let x = Math.floor((Math.min(a.x, b.x) - 90) / 100); x <= Math.floor((Math.max(a.x, b.x) + 90) / 100); x++) for (let z = Math.floor((Math.min(a.z, b.z) - 90) / 100); z <= Math.floor((Math.max(a.z, b.z) + 90) / 100); z++) {
          const key = `${x},${z}`, bucket = this.buckets.get(key) ?? [];
          bucket.push(s);
          this.buckets.set(key, bucket);
        }
      }
    }
  }
  map;
  cityAreas;
  buckets = /* @__PURE__ */ new Map();
  westCrossings;
  /** Smooth, low-frequency shoreline shared by terrain, water tiles and diagnostics. */
  shoreAt(x) {
    const coast = this.map.regional?.coast;
    if (!coast || x < coast.minX || x > coast.maxX) return void 0;
    for (let i = 1; i < coast.shoreline.length; i++) {
      const a = coast.shoreline[i - 1], b = coast.shoreline[i];
      if (x <= b.x) {
        const t = blend((x - a.x) / (b.x - a.x));
        return a.z + (b.z - a.z) * t;
      }
    }
    return coast.shoreline.at(-1)?.z;
  }
  waterAt(x, z) {
    const shore = this.shoreAt(x);
    if (shore !== void 0) return z > shore;
    const east = 6250 + z * 0.08 + 80 * Math.sin(z / 1300);
    const a = this.westCrossings[0], b = this.westCrossings[1], t = a && b ? (z - a.z) / (b.z - a.z) : 0;
    const west = a && b ? a.x + (b.x - a.x) * t + 220 * Math.sin(t * Math.PI * 2) : -3450 - 500 * Math.sin(z / 850);
    return x > 4e3 && Math.abs(x - east) < 260 || x < -2600 && Math.abs(x - west) < 42 || x > 6800 && Math.abs((z + 50) % 900) < 12;
  }
  macroHeight(x, z) {
    if (this.cityAreas.some((city) => x >= city.minX && x <= city.maxX && z >= city.minZ && z <= city.maxZ)) return -0.04 + cityTerrainOffsetAt(this.map.environment.landforms, x, z);
    const north = blend((-z - 2100) / 2200);
    const ridge = 55 * Math.exp(-(((z + 3250) / 380) ** 2)) + 65 * Math.exp(-(((z + 5050) / 540) ** 2));
    const valley = 12 + 10 * Math.sin(x / 1600) ** 2;
    let height = north * (ridge + valley) + blend((-x - 2500) / 1600) * 10 * (0.6 + 0.4 * Math.sin(z / 780));
    if (this.map.regional?.highways && x > 4500 && z < -5300) height += 55 * Math.exp(-(((x - 5350) / 1500) ** 2) - ((z + 6500) / 650) ** 2);
    if (this.waterAt(x, z)) height = -7;
    const coast = this.map.regional?.coast, shore = this.shoreAt(x);
    if (coast && shore !== void 0) {
      const distance = z - shore, width = coast.transitionWidth / 2;
      const coastal = coast.seaLevel + (distance < 0 ? coast.landHeight - coast.seaLevel : 8) * Math.tanh(-distance / width);
      height += (coastal - height) * blend((x - coast.minX) / 1e3);
    }
    return height - 0.04;
  }
  projection(x, z, s) {
    const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z, t = Math.max(0, Math.min(1, ((x - s.a.x) * dx + (z - s.a.z) * dz) / (dx * dx + dz * dz)));
    return { distance: Math.hypot(x - s.a.x - dx * t, z - s.a.z - dz * t), height: (s.a.y ?? 0) + ((s.b.y ?? 0) - (s.a.y ?? 0)) * t };
  }
  nearRoad(x, z, margin) {
    return (this.buckets.get(`${Math.floor(x / 100)},${Math.floor(z / 100)}`) ?? []).some((s) => this.projection(x, z, s).distance < s.halfWidth + margin);
  }
  heightAt(x, z) {
    let result = this.macroHeight(x, z), best = Infinity, selected, height = 0;
    for (const s of this.buckets.get(`${Math.floor(x / 100)},${Math.floor(z / 100)}`) ?? []) {
      const q = this.projection(x, z, s), distance = q.distance - s.halfWidth;
      if (distance < best) {
        best = distance;
        selected = s;
        height = q.height;
      }
    }
    if (selected && best < 65) {
      if (selected.tunnel) return Math.max(result, height + 10);
      if (selected.ramp) result = Math.min(result, height - 0.65) * (1 - blend((best - 25) / 40)) + result * blend((best - 25) / 40);
      else if (selected.bridge) result = Math.min(result, height - 12) * (1 - blend(best / 65)) + result * blend(best / 65);
      else {
        const u = blend((best - 25) / 65);
        result = (height - 0.04) * (1 - u) + result * u;
      }
    }
    for (const s of this.buckets.get(`${Math.floor(x / 100)},${Math.floor(z / 100)}`) ?? []) {
      if (s.tunnel) continue;
      const q = this.projection(x, z, s), d = q.distance - s.halfWidth;
      if (d < 65) {
        const u = blend((d - 25) / 40), cap = q.height - (s.ramp || s.bridge ? 0.65 : 0.04);
        result = Math.min(result, cap * (1 - u) + result * u);
      }
    }
    return result;
  }
};
var RegionalTerrain = class {
  constructor(map) {
    this.map = map;
    this.sampler = regionalTerrainSampler(map);
    this.clearance = new RegionalTerrainClearance(map);
    const b = map.regional.terrainBounds, size = map.sectorSize;
    this.origin = new Vector22(Math.floor(b.minX / size), Math.floor(b.minZ / size));
    this.maskSize = new Vector22(Math.ceil(b.maxX / size) - this.origin.x, Math.ceil(b.maxZ / size) - this.origin.y);
    this.maskData = new Uint8Array(this.maskSize.x * this.maskSize.y * 4);
    this.mask = new DataTexture(this.maskData, this.maskSize.x, this.maskSize.y);
    this.mask.magFilter = this.mask.minFilter = NearestFilter;
    this.mask.needsUpdate = true;
    this.farLand = this.land.clone();
    this.farWater = this.water.clone();
    this.farOcean = this.ocean.clone();
    for (const material of [this.farLand, this.farWater, this.farOcean]) {
      material.customProgramCacheKey = () => "regional-sector-mask-v1";
      material.onBeforeCompile = (shader) => {
        shader.uniforms.regionalMask = { value: this.mask };
        shader.uniforms.regionalOrigin = { value: this.origin };
        shader.uniforms.regionalMaskSize = { value: this.maskSize };
        shader.uniforms.regionalSectorSize = { value: size };
        shader.vertexShader = "varying vec2 regionalXZ;\n" + shader.vertexShader.replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nregionalXZ=(modelMatrix*vec4(transformed,1.0)).xz;");
        shader.fragmentShader = "varying vec2 regionalXZ;uniform sampler2D regionalMask;uniform vec2 regionalOrigin;uniform vec2 regionalMaskSize;uniform float regionalSectorSize;\n" + shader.fragmentShader.replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\nvec2 regionalUV=(floor(regionalXZ/regionalSectorSize)-regionalOrigin+0.5)/regionalMaskSize;if(texture2D(regionalMask,regionalUV).r>0.5)discard;");
      };
    }
    this.farRoad = this.farLand.clone();
    this.farRoad.onBeforeCompile = this.farLand.onBeforeCompile;
    this.farRoad.customProgramCacheKey = this.farLand.customProgramCacheKey;
    this.farRoad.polygonOffset = true;
    this.farRoad.polygonOffsetFactor = -1;
    this.farRoad.polygonOffsetUnits = -1;
    this.farRoad.userData.regionalTerrain = true;
  }
  map;
  land = new MeshLambertMaterial({ vertexColors: true });
  water = new MeshLambertMaterial({ color: 5275015, transparent: true, opacity: 0.92 });
  ocean = new MeshLambertMaterial({ color: 3563385 });
  farLand;
  farRoad;
  farWater;
  farOcean;
  mask;
  maskData;
  origin;
  maskSize;
  sampler;
  clearance;
  setActive(key, active) {
    const [x, z] = key.split(",").map(Number), index = ((z - this.origin.y) * this.maskSize.x + x - this.origin.x) * 4;
    if (index < 0 || index >= this.maskData.length) return;
    this.maskData[index] = active ? 255 : 0;
    this.mask.needsUpdate = true;
  }
  /** Coarse road ribbons follow their tier's rendered ground, retaining higher bridge decks. */
  drapeSilhouette(geometry2, tier) {
    const positions = geometry2.getAttribute("position"), size = this.map.sectorSize, step = size / (tier === "mid" ? 8 : 3), bounds = this.map.regional.terrainBounds;
    const heights = /* @__PURE__ */ new Map(), height = (x, z) => {
      const key = x + "," + z;
      let h = heights.get(key);
      if (h === void 0) {
        h = this.sampler.heightAt(x, z);
        heights.set(key, h);
      }
      return h;
    };
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), z = positions.getZ(i), sx = Math.floor(x / size) * size, sz = Math.floor(z / size) * size;
      const gx = sx + Math.floor((x - sx) / step) * step, gz = sz + Math.floor((z - sz) / step) * step;
      const a = Math.max(bounds.minX, gx), b = Math.max(bounds.minZ, gz), c = Math.min(bounds.maxX, gx + step), d = Math.min(bounds.maxZ, gz + step);
      const u = (x - a) / (c - a), v = (z - b) / (d - b), h00 = height(a, b), h01 = height(a, d), h11 = height(c, d), h10 = height(c, b);
      const h = u <= v ? h00 * (1 - v) + h01 * (v - u) + h11 * u : h00 * (1 - u) + h11 * v + h10 * (u - v);
      positions.setY(i, Math.max(positions.getY(i), h + 0.04));
    }
    positions.needsUpdate = true;
    geometry2.computeVertexNormals();
    geometry2.computeBoundingSphere();
  }
  build(key, tier) {
    const [sx, sz] = key.split(",").map(Number), size = this.map.sectorSize, x = sx * size, z = sz * size;
    const coast = this.map.regional?.coast, shoreA = this.sampler.shoreAt(x), shoreB = this.sampler.shoreAt(x + size);
    const oceanOnly = shoreA !== void 0 && shoreB !== void 0 && z > Math.max(shoreA, shoreB) + coast.transitionWidth;
    const steps = oceanOnly ? 1 : tier === "near" ? 40 : tier === "mid" ? 8 : 3, step = size / steps, positions = [], colors = [], water = [];
    const heights = new Float64Array((steps + 1) ** 2);
    heights.fill(NaN);
    const gridHeight = (px, pz) => {
      const index = Math.round((px - x) / step) * (steps + 1) + Math.round((pz - z) / step);
      let h = heights[index];
      if (Number.isNaN(h)) {
        h = this.sampler.heightAt(px, pz);
        heights[index] = h;
      }
      return h;
    };
    const vertex = (px, pz, h) => {
      positions.push(px, h, pz);
      const field = (Math.floor(px / 210) + Math.floor(pz / 170)) % 3;
      const color = pz < -2400 ? [0.29, 0.39, 0.24] : pz > 2500 ? [0.43, 0.44, 0.33] : px > 3900 ? field === 0 ? [0.58, 0.59, 0.34] : field === 1 ? [0.46, 0.55, 0.29] : [0.62, 0.56, 0.35] : [0.37, 0.46, 0.29];
      colors.push(...color);
    };
    for (let i = 0; i < steps; i++) for (let j = 0; j < steps; j++) {
      const bounds = this.map.regional.terrainBounds, a = Math.max(bounds.minX, x + i * step), b = Math.max(bounds.minZ, z + j * step), a1 = Math.min(bounds.maxX, x + (i + 1) * step), b1 = Math.min(bounds.maxZ, z + (j + 1) * step);
      if (a1 <= a || b1 <= b) continue;
      if (this.sampler.cityAreas.some((city) => a >= city.minX && a1 <= city.maxX && b >= city.minZ && b1 <= city.maxZ)) continue;
      const triangle = (ax, az, bx, bz, cx, cz) => {
        const original = [{ x: ax, y: gridHeight(ax, az), z: az }, { x: bx, y: gridHeight(bx, bz), z: bz }, { x: cx, y: gridHeight(cx, cz), z: cz }];
        for (const polygon of this.clearance.clip(original)) for (let k = 1; k + 1 < polygon.length; k++) for (const p of [polygon[0], polygon[k], polygon[k + 1]]) vertex(p.x, p.z, p.y ?? 0);
      };
      triangle(a, b, a, b1, a1, b1);
      triangle(a, b, a1, b1, a1, b);
      if (this.sampler.shoreAt((a + a1) / 2) === void 0 && this.sampler.waterAt((a + a1) / 2, (b + b1) / 2)) water.push(a, -1, b, a, -1, b1, a1, -1, b1, a, -1, b, a1, -1, b1, a1, -1, b);
    }
    if (coast && x + size > coast.minX && x < coast.maxX) {
      const bounds = this.map.regional.terrainBounds, sea = coast.seaLevel;
      const minX = Math.max(x, coast.minX), maxX = Math.min(x + size, coast.maxX), minZ = Math.max(z, bounds.minZ), maxZ = Math.min(z + size, bounds.maxZ);
      const strips = oceanOnly ? 1 : 4;
      for (let i = 0; i < strips; i++) {
        const a = minX + (maxX - minX) * i / strips, b = minX + (maxX - minX) * (i + 1) / strips;
        const sa = this.sampler.shoreAt(a), sb = this.sampler.shoreAt(b);
        const polygon = [{ x: a, z: minZ, d: minZ - sa }, { x: a, z: maxZ, d: maxZ - sa }, { x: b, z: maxZ, d: maxZ - sb }, { x: b, z: minZ, d: minZ - sb }], clipped = [];
        for (let j = 0; j < polygon.length; j++) {
          const p = polygon[j], q = polygon[(j + 1) % polygon.length];
          if (p.d >= 0) clipped.push(p);
          if (p.d >= 0 !== q.d >= 0) {
            const t = p.d / (p.d - q.d);
            clipped.push({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t });
          }
        }
        for (let k = 1; k + 1 < clipped.length; k++) for (const p of [clipped[0], clipped[k], clipped[k + 1]]) water.push(p.x, sea, p.z);
      }
    }
    const root = new Group();
    root.name = `Regional terrain ${key} ${tier}`;
    const geometry2 = new BufferGeometry5();
    geometry2.setAttribute("position", new Float32BufferAttribute4(positions, 3));
    geometry2.setAttribute("color", new Float32BufferAttribute4(colors, 3));
    geometry2.computeVertexNormals();
    const mesh = new Mesh2(geometry2, tier === "far" ? this.farLand : this.land);
    mesh.receiveShadow = true;
    root.add(mesh);
    if (water.length) {
      const g = new BufferGeometry5();
      g.setAttribute("position", new Float32BufferAttribute4(water, 3));
      g.computeVertexNormals();
      root.add(new Mesh2(g, this.materialFor(tier, 1, key)));
    }
    return root;
  }
  materialFor(tier, index, key) {
    const x = key ? Number(key.split(",")[0]) * this.map.sectorSize + this.map.sectorSize / 2 : void 0;
    const ocean = x !== void 0 && this.sampler.shoreAt(x) !== void 0;
    return index === 0 ? tier === "far" ? this.farLand : this.land : ocean ? tier === "far" ? this.farOcean : this.ocean : tier === "far" ? this.farWater : this.water;
  }
  fromCompiled(data) {
    const root = new Group();
    root.name = `Regional terrain ${data.key} ${data.tier}`;
    data.geometries.forEach((g, i) => {
      const mesh = new Mesh2(importVisualGeometry(g), this.materialFor(data.tier, i, data.key));
      mesh.receiveShadow = i === 0;
      root.add(mesh);
    });
    return root;
  }
  dispose() {
    this.land.dispose();
    this.water.dispose();
    this.ocean.dispose();
    this.farLand.dispose();
    this.farRoad.dispose();
    this.farWater.dispose();
    this.farOcean.dispose();
    this.mask.dispose();
  }
};

// src/world/city/RoadClassification.ts
function roadFunction(road) {
  switch (road.roadClass) {
    case "avenue":
      return "arterial";
    case "alley":
      return "local";
    case "industrial":
      return "collector";
    case void 0:
      if (road.styleId === "urban_auxiliary_2") return "frontage";
      if (road.styleId === "collector_distributor_2") return "connector";
      if (road.type === "highway" && road.styleId === "urban_local_2" && road.speedLimit <= 30) return "collector";
      if (road.type === "ramp_1" || road.gore && road.laneCount <= 2) return "ramp";
      if (road.type === "highway" || road.styleId === "urban_expressway_6") return "expressway";
      return road.type === "urban_6lane" ? "arterial" : road.type === "urban_4lane" ? "collector" : "local";
    default:
      return road.roadClass;
  }
}

// src/world/city/RoadPavementSurface.ts
function roadPavementTriangle(a, b, c, length, masks = []) {
  const ux = b.x - a.x, uz = b.z - a.z, vx = c.x - a.x, vz = c.z - a.z, den = ux * vz - uz * vx;
  const gx = (((b.y ?? 0) - (a.y ?? 0)) * vz - ((c.y ?? 0) - (a.y ?? 0)) * uz) / den, gz = (ux * ((c.y ?? 0) - (a.y ?? 0)) - vx * ((b.y ?? 0) - (a.y ?? 0))) / den;
  const heightAt = (x, z) => (a.y ?? 0) + gx * (x - a.x) + gz * (z - a.z);
  return { gx, gz, length, heightAt, extensionAt: (_x, _z) => 0, contains: (extra) => (x, z) => {
    const u = ((x - a.x) * vz - (z - a.z) * vx) / den, v = (ux * (z - a.z) - uz * (x - a.x)) / den;
    const tolerance = extra / Math.max(0.1, Math.min(Math.hypot(ux, uz), Math.hypot(vx, vz)));
    if (u < -tolerance - 1e-7 || v < -tolerance - 1e-7 || u + v > 1 + tolerance + 1e-7) return false;
    for (const mask of masks) if (mask.contains(x, z) && Math.abs(mask.heightAt(x, z) - heightAt(x, z)) <= 0.5) return false;
    return true;
  } };
}

// src/world/city/RoadCarriageway.ts
var innerRoadSide = (road) => road.travelDirection === "reverse" ? 1 : -1;
var hasCentralBarrier = (road) => road.travelDirection === "two-way" && road.structure?.medianBarrierStyle === "concrete" && road.structure.barrierEnabled !== false;
var cache2 = /* @__PURE__ */ new WeakMap();
function invalidateRoadCarriageways(map) {
  cache2.delete(map);
}
function roadCarriageways(map) {
  let index = cache2.get(map);
  if (!index) {
    index = new RoadCarriageways(map);
    cache2.set(map, index);
  }
  return index;
}
var RoadCarriageways = class {
  constructor(map, deferred = false) {
    this.map = map;
    this.initialization = this.initialize();
    if (!deferred) drain(this.initialization);
  }
  map;
  buckets = /* @__PURE__ */ new Map();
  paving = /* @__PURE__ */ new Map();
  initialization;
  prepareSteps() {
    return this.initialization;
  }
  *initialize() {
    const map = this.map;
    let work = 0;
    for (const road of map.roads) {
      yield;
      if (road.travelDirection === "two-way" || road.laneCount < 2 || road.highwayTransition) continue;
      const kind = roadFunction(road);
      if (kind !== "expressway" && kind !== "arterial" && road.designProfile !== "motorway") continue;
      const points = roadPoints(road), margin = road.laneCount * road.laneWidth / 2 + 36;
      for (let i = 1; i < points.length; i++) {
        if (++work % 32 === 0) yield;
        const a = points[i - 1], b = points[i], length = Math.hypot(b.x - a.x, b.z - a.z);
        if (length < 1e-6) continue;
        const entry = { road, a, b, length, tx: (b.x - a.x) / length, tz: (b.z - a.z) / length };
        for (let x = Math.floor((Math.min(a.x, b.x) - margin) / 64); x <= Math.floor((Math.max(a.x, b.x) + margin) / 64); x++) for (let z = Math.floor((Math.min(a.z, b.z) - margin) / 64); z <= Math.floor((Math.max(a.z, b.z) + margin) / 64); z++) {
          const key = x + "," + z, list = this.buckets.get(key) ?? [];
          list.push(entry);
          this.buckets.set(key, list);
        }
      }
    }
  }
  /** Exact load-time footing plane. Nominal shoulder overlap alone is not
   * sufficient at a mitered road-ID seam or a masked junction mouth. */
  pavedHeight(roadId, p) {
    let paving = this.paving.get(roadId);
    if (!paving) {
      const road = this.map.roads.find((r) => r.id === roadId);
      const edges = roadEdges(road), chains = roadEdgeChains(this.map), left = chains.edge(road, edges.left), right = chains.edge(road, edges.right), masks = this.map.intersections.filter((j) => j.pavementFootprint && j.connections.some((c) => c.roadId === roadId)).map(compileJunctionSurface);
      const planes = [], cells = /* @__PURE__ */ new Map();
      for (let i = 1; i < left.length; i++) for (const [a, b, c] of [[left[i - 1], right[i - 1], left[i]], [right[i - 1], right[i], left[i]]]) if (Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) > 1e-8) {
        const id = planes.length, minX = Math.min(a.x, b.x, c.x), maxX = Math.max(a.x, b.x, c.x), minZ = Math.min(a.z, b.z, c.z), maxZ = Math.max(a.z, b.z, c.z);
        const epsilon = 1e-6 + (maxX - minX + maxZ - minZ) * 3e-7;
        planes.push(roadPavementTriangle(a, b, c, 1, masks));
        for (let x = Math.floor((minX - epsilon) / 32); x <= Math.floor((maxX + epsilon) / 32); x++) for (let z = Math.floor((minZ - epsilon) / 32); z <= Math.floor((maxZ + epsilon) / 32); z++) {
          const key = x + "," + z, list = cells.get(key) ?? [];
          list.push(id);
          cells.set(key, list);
        }
      }
      paving = { planes, cells };
      this.paving.set(roadId, paving);
    }
    let height, error = Infinity;
    for (const id of paving.cells.get(Math.floor(p.x / 32) + "," + Math.floor(p.z / 32)) ?? []) {
      const plane = paving.planes[id];
      if (plane.contains(0)(p.x, p.z)) {
        const y = plane.heightAt(p.x, p.z), e = Math.abs(y - (p.y ?? 0));
        if (e < error) {
          height = y;
          error = e;
        }
      }
    }
    return error <= 0.2 ? height : void 0;
  }
  opposing(road, p, tangent) {
    if (road.travelDirection === "two-way" || road.laneCount < 2 || road.highwayTransition) return void 0;
    const sign = road.travelDirection === "reverse" ? -1 : 1, side = innerRoadSide(road), half = road.laneCount * road.laneWidth / 2, ownEdges = roadEdges(road), ownPaved = side < 0 ? -ownEdges.left : ownEdges.right;
    let result, best = Infinity;
    for (const s of this.buckets.get(Math.floor(p.x / 64) + "," + Math.floor(p.z / 64)) ?? []) {
      if (s.road.id === road.id) continue;
      const otherSign = s.road.travelDirection === "reverse" ? -1 : 1, dot = tangent.x * s.tx + tangent.z * s.tz;
      if (dot * sign * otherSign > -0.97) continue;
      const t = ((p.x - s.a.x) * s.tx + (p.z - s.a.z) * s.tz) / s.length;
      if (t < 0 || t > 1) continue;
      const q = { x: s.a.x + (s.b.x - s.a.x) * t, y: (s.a.y ?? 0) + ((s.b.y ?? 0) - (s.a.y ?? 0)) * t, z: s.a.z + (s.b.z - s.a.z) * t };
      if (Math.abs((p.y ?? 0) - (q.y ?? 0)) > 0.2) continue;
      const lateral = (-(q.x - p.x) * tangent.z + (q.z - p.z) * tangent.x) * side, otherHalf = s.road.laneCount * s.road.laneWidth / 2;
      if (lateral < Math.max(half, otherHalf) + 0.2 || lateral > half + otherHalf + 16 || lateral >= best) continue;
      const facing = (-(p.x - q.x) * s.tz + (p.z - q.z) * s.tx) * innerRoadSide(s.road);
      if (facing < otherHalf) continue;
      const edges = roadEdges(s.road), otherPaved = innerRoadSide(s.road) < 0 ? -edges.left : edges.right;
      const axis = (half + lateral - otherHalf) / 2, midpoint = { x: p.x - tangent.z * side * axis, y: Math.min(p.y ?? 0, q.y ?? 0), z: p.z + tangent.x * side * axis };
      const pavementGap = lateral - ownPaved - otherPaved;
      result = { road: s.road, laneGap: lateral - half - otherHalf, pavementGap, distance: lateral, midpoint, sharedPavement: pavementGap <= 0.05 };
      best = lateral;
    }
    return result;
  }
};

// src/world/city/RoadInfrastructure.ts
function roadLampAnchors(road, map, clearance = new RoadClearance(map), permits) {
  if (!road.streetlights) return [];
  const path = roadPoints(road), length = polylineLength(path), edges = roadEdges(road), half = road.laneCount * road.laneWidth / 2, result = [];
  for (let d = roadEdgeChains(map).firstStation(road, 50); d < length - 20; d += 50) {
    const frame = sampleAt(path, d), base = map.regional && road.id.startsWith("regional:") ? regionalTerrainSampler(map).heightAt(frame.point.x, frame.point.z) : 0, raised = (frame.point.y ?? 0) > base + 2, walk = road.sidewalk?.enabled ? road.sidewalk.width : 0;
    if (raised && walk < 1 && (road.shoulders?.right ?? 0) < 1.2) continue;
    const onWalk = raised && walk >= 1, offset = raised ? onWalk ? half + walk / 2 : edges.right - 0.45 : edges.right + walk + 0.8, p = { x: frame.point.x - frame.tangent.z * offset, y: (frame.point.y ?? 0) + (onWalk ? 0.15 : 0), z: frame.point.z + frame.tangent.x * offset };
    if (clearance.roadAt(p, 0.4, (p.y ?? 0) - 2, (p.y ?? 0) + 8.15, road.id) || clearance.roadAt(p, 0.4, (p.y ?? 0) - 2, (p.y ?? 0) + 8.15, void 0, void 0, true) || clearance.junctionAt(p, 0.4, (p.y ?? 0) - 2, (p.y ?? 0) + 8.15)) continue;
    if (permits && !permits(p, 0.4, 7.5, road.id)) continue;
    if (map.objects.some((o) => Math.hypot(o.position.x - p.x, o.position.z - p.z) < 2)) continue;
    result.push(p);
  }
  return result;
}
function retainingWallHeight(road, p, clearance) {
  const y = p.y ?? 0, top = Math.max(0.3, y + (road.designProfile === "motorway" && road.structure?.enclosure?.kind === "cutting" ? road.structure.enclosure.clearance : 1.1)), deck = clearance?.lowestDeckHeight(p, y + 4.5, top + 0.65, road.id);
  return (deck === void 0 ? top : Math.min(top, deck - 0.65)) - y;
}
function barrierPoints(road, _map) {
  const points = roadPoints(road), length = polylineLength(points);
  const start = 0, end = length;
  const result = [];
  for (let d = start; d < end; d += 3) result.push(sampleAt(points, d).point);
  result.push(sampleAt(points, end).point);
  return result;
}
function roadPiers(road, map, clearance = map ? new RoadClearance(map) : void 0) {
  return drain(roadPierSteps(road, map, clearance));
}
function* roadPierSteps(road, map, clearance = map ? new RoadClearance(map) : void 0) {
  if (road.structure?.piersEnabled === false) return [];
  let work = 0;
  const points = roadPoints(road), length = polylineLength(points), spacing = road.structure?.pierSpacing ?? 30, piers = [];
  for (let d = spacing / 2; d < length - 8; d += spacing) {
    if (++work % 16 === 0) yield;
    const { point: p } = sampleAt(points, d), baseY = map?.regional && road.id.startsWith("regional:") ? regionalTerrainSampler(map).heightAt(p.x, p.z) : 0, height = (p.y ?? 0) - 0.65 - baseY;
    if (height < 2) continue;
    if (clearance?.junctionAt(p, 10, baseY, (p.y ?? 0) - 0.65) || clearance?.roadAt(p, 2, baseY, (p.y ?? 0) - 0.65, road.id)) continue;
    piers.push({ position: p, height, baseY });
  }
  return piers;
}
function* barrierSectionSteps(road, map, clearance = map ? new RoadClearance(map) : void 0, retainingWall = false) {
  let work = 0;
  const sections = [];
  const continuation = map ? roadEdgeChains(map).continuations(road.id) : /* @__PURE__ */ new Set([road.id]);
  const carriageways = map ? roadCarriageways(map) : void 0;
  const branchOpenings = retainingWall && road.structure?.enclosure?.kind !== "cutting" ? road.structure?.enclosure?.branchOpenings : void 0;
  const blocked = (p) => {
    const y = p.y ?? 0, top = retainingWall ? y + (branchOpenings ? road.structure.enclosure.clearance : retainingWallHeight(road, p, clearance)) + 0.3 : y + 1.3;
    return !!(clearance?.roadAt(p, retainingWall ? 0.9 : 0.5, y - 2.1, top, road.id, (id) => branchOpenings ? branchOpenings.includes(id) : !continuation.has(id)) || !branchOpenings && clearance?.junctionAt(p, retainingWall ? 0.9 : 0.5, y - 2.1, top));
  };
  const boundary = (a, b) => {
    let lo = 0, hi = 1;
    const state = blocked(a);
    for (let n = 0; n < 15; n++) {
      const t2 = (lo + hi) / 2, p = { x: a.x + (b.x - a.x) * t2, y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t2, z: a.z + (b.z - a.z) * t2 };
      if (blocked(p) === state) lo = t2;
      else hi = t2;
    }
    const t = state ? hi : lo;
    return { x: a.x + (b.x - a.x) * t, y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t, z: a.z + (b.z - a.z) * t };
  };
  for (const side of [-1, 1]) {
    const edge = map ? roadEdgeChains(map).barrierEdge(road, side) : barrierPoints(road).map((p, i, a) => {
      const b = a[Math.min(i + 1, a.length - 1)], c = a[Math.max(0, i - 1)], l = Math.hypot(b.x - c.x, b.z - c.z) || 1, offset = barrierOffset(road, side);
      return { x: p.x - (b.z - c.z) / l * offset, y: p.y, z: p.z + (b.x - c.x) / l * offset };
    });
    const path = [];
    for (let i = 1; i < edge.length; i++) {
      const a = edge[i - 1], b = edge[i], steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 3));
      if (!path.length) path.push(a);
      for (let n = 1; n <= steps; n++) {
        if (++work % 64 === 0) yield;
        const t = n / steps;
        path.push(n === steps ? b : { x: a.x + (b.x - a.x) * t, y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t, z: a.z + (b.z - a.z) * t });
      }
    }
    if (!retainingWall && carriageways && road.travelDirection !== "two-way" && side === innerRoadSide(road)) {
      const centre = roadPoints(road), total = polylineLength(centre), sample = roadCompileSampler(centre);
      let run = [];
      const flushMedian = () => {
        if (run.length > 1) sections.push({ side, points: run, kind: "shared-median" });
        run = [];
      };
      for (let d = 0; d <= total; d = Math.min(total, d + 3)) {
        if (++work % 16 === 0) yield;
        const f = sample(d), pair = carriageways.opposing(road, f.point, f.tangent);
        if (pair?.sharedPavement && pair.laneGap >= 0.6) {
          const p = pair.midpoint, own = carriageways.pavedHeight(road.id, p), opposite = carriageways.pavedHeight(pair.road.id, p), floor = own === void 0 ? opposite : opposite === void 0 ? own : Math.max(own, opposite), y = floor ?? p.y ?? 0;
          if (floor !== void 0 && road.id.localeCompare(pair.road.id) < 0 && !clearance?.roadAt(p, 0.2, y - 2.1, y + 1.3, road.id, (id) => id !== pair.road.id && !continuation.has(id), true) && !clearance?.junctionAt(p, 0.5, y - 2.1, y + 1.3)) run.push({ ...p, y });
          else flushMedian();
        } else flushMedian();
        if (d === total) break;
      }
      flushMedian();
    }
    let current = [];
    const flush = () => {
      if (current.length > 1) sections.push({ side, points: current });
      current = [];
    };
    for (let i = 1; i < path.length; i++) {
      if (++work % 16 === 0) yield;
      const a = path[i - 1], b = path[i], length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length < 0.01) continue;
      const p = {
        x: (a.x + b.x) / 2,
        y: ((a.y ?? 0) + (b.y ?? 0)) / 2,
        z: (a.z + b.z) / 2
      };
      const ba = blocked(a), bb = blocked(b), bm = blocked(p);
      if (ba && bb) {
        flush();
        continue;
      }
      if (!ba && !bb && !bm) {
        if (!current.length) current.push(a);
        current.push(b);
        continue;
      }
      if (!ba) {
        if (!current.length) current.push(a);
        current.push(boundary(a, bm ? p : b));
        flush();
      } else flush();
      if (!bb) {
        current.push(boundary(bm ? p : a, b), b);
      }
    }
    flush();
  }
  return sections;
}
function* centralBarrierSectionSteps(road, map, clearance = map ? new RoadClearance(map) : void 0) {
  if (!hasCentralBarrier(road)) return [];
  const linked = /* @__PURE__ */ new Set();
  for (const link of map?.roadLinks ?? []) {
    if (link.from.roadId === road.id) linked.add(link.to.roadId);
    if (link.to.roadId === road.id) linked.add(link.from.roadId);
  }
  let work = 0;
  const points = roadPoints(road), length = polylineLength(points), sections = [];
  let run = [];
  const sample = roadCompileSampler(points);
  const flush = () => {
    if (run.length > 1) sections.push(run);
    run = [];
  };
  for (let d = 0; d <= length; d = Math.min(length, d + 1.5)) {
    if (++work % 16 === 0) yield;
    const p = sample(d).point, y = p.y ?? 0;
    if (clearance?.junctionAt(p, 1, y - 0.2, y + 0.2) || clearance?.roadAt(p, 0.2, y - 0.2, y + 1.3, road.id, (id) => !linked.has(id), true)) flush();
    else run.push(p);
    if (d === length) break;
  }
  flush();
  return sections;
}
function* enclosureWallSectionSteps(road, map, clearance = map ? new RoadClearance(map) : void 0) {
  if (road.structure?.enclosure?.kind === "cutting" || road.structure?.enclosure?.branchOpenings?.length) return yield* barrierSectionSteps(road, map, clearance, true);
  return [-1, 1].map((side) => ({ side, points: map ? roadEdgeChains(map).barrierEdge(road, side) : roadPoints(road) }));
}

// src/world/city/MarkingOwnership.ts
function insideIntersectionMarkingFootprint(j, map, p, margin = 0, compiledExtent) {
  if (j.pavementFootprint) return Math.abs(junctionSurfaceHeight(j, p) - (p.y ?? 0)) <= 0.2 && junctionSurfaceContains(j, map, p, margin);
  if (Math.abs((j.position.y ?? 0) - (p.y ?? 0)) > 0.2) return false;
  const q = rotatePoint({ x: p.x - j.position.x, z: p.z - j.position.z }, -j.rotation), f = j.markingFootprint;
  if (f?.kind === "polygon") {
    let inside = false;
    for (let i = 0, k = f.points.length - 1; i < f.points.length; k = i++) {
      const a = f.points[i], b = f.points[k];
      if (a.z > q.z !== b.z > q.z && q.x < (b.x - a.x) * (q.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
      const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.z - a.z) * dz) / (dx * dx + dz * dz)));
      if (Math.hypot(q.x - a.x - t * dx, q.z - a.z - t * dz) <= margin) return true;
    }
    return inside;
  }
  const h = compiledExtent ?? junctionExtent(j, map), w = f?.kind === "rectangle" ? f.halfWidth : h + (f?.margin ?? 0.4), d = f?.kind === "rectangle" ? f.halfDepth : w;
  return Math.abs(q.x) <= w + margin && Math.abs(q.z) <= d + margin;
}
var MarkingOwnership = class {
  constructor(map) {
    this.map = map;
    this.roads = new Map(map.roads.map((r) => [r.id, r]));
    for (const road of map.roads) {
      const points = roadPoints(road), edges = roadEdges(road), margin = Math.max(-edges.left, edges.right) + 1;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i], entry = { roadId: road.id, a, b, ...edges };
        for (let x = Math.floor((Math.min(a.x, b.x) - margin) / 50); x <= Math.floor((Math.max(a.x, b.x) + margin) / 50); x++) for (let z = Math.floor((Math.min(a.z, b.z) - margin) / 50); z <= Math.floor((Math.max(a.z, b.z) + margin) / 50); z++) {
          const key = `${x},${z}`, bucket = this.pavementBuckets.get(key) ?? [];
          bucket.push(entry);
          this.pavementBuckets.set(key, bucket);
        }
      }
    }
    for (const junction of map.intersections) {
      const extent = junctionExtent(junction, map), f = junction.markingFootprint;
      const radius = f?.kind === "polygon" ? Math.max(...f.points.map((p2) => Math.hypot(p2.x, p2.z))) : f?.kind === "rectangle" ? Math.hypot(f.halfWidth, f.halfDepth) : Math.SQRT2 * (extent + (f?.margin ?? 0.4));
      const p = junction.position, entry = { junction, extent };
      for (let x = Math.floor((p.x - radius - 1) / 50); x <= Math.floor((p.x + radius + 1) / 50); x++) for (let z = Math.floor((p.z - radius - 1) / 50); z <= Math.floor((p.z + radius + 1) / 50); z++) {
        const key = `${x},${z}`, bucket = this.intersectionBuckets.get(key) ?? [];
        bucket.push(entry);
        this.intersectionBuckets.set(key, bucket);
      }
    }
    for (const r of map.roads.filter((r2) => r2.gore).sort((a, b) => a.id.localeCompare(b.id))) {
      const pts = roadPoints(r), len = polylineLength(pts), span = Math.min(r.gore.length, len / 2), edges = roadEdges(r);
      for (const start of [true, false]) {
        if (!(start ? r.gore.start : r.gore.end)) continue;
        for (let d = 0; d < span; d += 3) {
          const a = sampleAt(pts, start ? d : len - d).point, b = sampleAt(pts, start ? Math.min(d + 3, span) : len - Math.min(d + 3, span)).point;
          const s = { roadId: r.id, a: start ? a : b, b: start ? b : a, ...edges }, margin = Math.max(-edges.left, edges.right) + 1;
          for (let x = Math.floor((Math.min(a.x, b.x) - margin) / 50); x <= Math.floor((Math.max(a.x, b.x) + margin) / 50); x++) for (let z = Math.floor((Math.min(a.z, b.z) - margin) / 50); z <= Math.floor((Math.max(a.z, b.z) + margin) / 50); z++) {
            const key = `${x},${z}`, bucket = this.mergeBuckets.get(key) ?? [];
            bucket.push(s);
            this.mergeBuckets.set(key, bucket);
          }
        }
      }
    }
  }
  map;
  mergeBuckets = /* @__PURE__ */ new Map();
  intersectionBuckets = /* @__PURE__ */ new Map();
  pavementBuckets = /* @__PURE__ */ new Map();
  roads;
  ownerAt(p, margin = 0.15, mergeMargin = margin) {
    const j = this.intersectionBuckets.get(`${Math.floor(p.x / 50)},${Math.floor(p.z / 50)}`)?.find((e) => insideIntersectionMarkingFootprint(e.junction, this.map, p, margin, e.extent))?.junction;
    if (j) return { kind: "intersection", id: j.id };
    for (const s of this.mergeBuckets.get(`${Math.floor(p.x / 50)},${Math.floor(p.z / 50)}`) ?? []) {
      const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z, l = Math.hypot(dx, dz), t = ((p.x - s.a.x) * dx + (p.z - s.a.z) * dz) / (l * l);
      if (t < -mergeMargin / l || t > 1 + mergeMargin / l) continue;
      const clamped = Math.max(0, Math.min(1, t)), y = (s.a.y ?? 0) + clamped * ((s.b.y ?? 0) - (s.a.y ?? 0)), offset = (-(p.x - s.a.x) * dz + (p.z - s.a.z) * dx) / l;
      if (Math.abs((p.y ?? 0) - y) < 0.2 && offset >= s.left - mergeMargin && offset <= s.right + mergeMargin) return { kind: "merge", id: s.roadId };
    }
    return void 0;
  }
  /** A joined paved area has no internal road edge; coincident paint has one owner. */
  permitsLongitudinal(p, tangent, road, boundary, centre) {
    const continuations = roadEdgeChains(this.map).continuations(road.id);
    for (const s of this.pavementBuckets.get(`${Math.floor(p.x / 50)},${Math.floor(p.z / 50)}`) ?? []) {
      if (continuations.has(s.roadId)) continue;
      const other = this.roads.get(s.roadId), dx = s.b.x - s.a.x, dz = s.b.z - s.a.z, l = Math.hypot(dx, dz);
      if (l < 1e-6) continue;
      const t = ((p.x - s.a.x) * dx + (p.z - s.a.z) * dz) / (l * l);
      if (t < 0 || t > 1) continue;
      if (Math.abs((p.y ?? 0) - (s.a.y ?? 0) - t * ((s.b.y ?? 0) - (s.a.y ?? 0))) > 0.2) continue;
      const offset = (-(p.x - s.a.x) * dz + (p.z - s.a.z) * dx) / l;
      const left = other.highwayTransition ? -other.laneWidth / 2 : s.left, right = other.highwayTransition ? other.laneWidth / 2 : s.right;
      if (!centre && other.travelDirection === "two-way" && !hasCentralBarrier(other) && Math.abs(Math.abs(offset) - 0.13) < 0.16) return false;
      if (boundary && offset > left + 0.25 && offset < right - 0.25) return false;
      if (other.markings === false || other.highwayTransition || Math.abs((dx * tangent.x + dz * tangent.z) / l) < 0.98) continue;
      const priority = other.laneCount - road.laneCount || road.id.localeCompare(other.id);
      if (centre && other.travelDirection !== "two-way") continue;
      if (priority <= 0) continue;
      const half = other.laneCount * other.laneWidth / 2;
      if (Math.abs(Math.abs(offset) - (half - 0.15)) < 0.16) return false;
      if (other.travelDirection === "two-way" && !hasCentralBarrier(other) && Math.abs(Math.abs(offset) - 0.13) < 0.16) return false;
      for (let lane = 1; lane < other.laneCount; lane++) if (!(other.travelDirection === "two-way" && lane === other.laneCount / 2) && Math.abs(offset - (-half + lane * other.laneWidth)) < 0.16) return false;
    }
    return true;
  }
  sections(path, offset, road, owner, boundary = false, centre = false) {
    return drain(this.sectionSteps(path, offset, road, owner, boundary, centre));
  }
  *sectionSteps(path, offset, road, owner, boundary = false, centre = false) {
    const len = polylineLength(path), count = Math.max(1, Math.ceil(len / 0.75)), sections = [];
    let section = [];
    const sample = roadCompileSampler(path);
    const flush = () => {
      if (section.length > 1) sections.push(section);
      section = [];
    };
    const permitted = (d) => {
      const s = sample(d), p = { x: s.point.x - s.tangent.z * offset, y: s.point.y ?? 0, z: s.point.z + s.tangent.x * offset }, mask = this.ownerAt(p, 5.5, centre ? 0.15 : 5.5);
      const owned = owner === "road" ? !mask : mask?.kind === "merge" && mask.id === road.id;
      return owned && this.permitsLongitudinal(p, s.tangent, road, boundary, centre);
    };
    for (let i = 0; i < count; i++) {
      if (i % 64 === 0) yield;
      const a = len * i / count, b = len * (i + 1) / count;
      if (!permitted(a) || !permitted((a + b) / 2) || !permitted(b)) {
        flush();
        continue;
      }
      if (!section.length) section.push(sample(a).point);
      section.push(sample(b).point);
    }
    flush();
    return sections;
  }
};

// src/world/city/RoadSignTemplates.ts
var ROAD_SIGN_SIZES = { small: { width: 3.2, height: 0.95 }, medium: { width: 6, height: 2.3 }, large: { width: 10, height: 3.8 } };
var ROAD_SIGN_POST_Z = -0.2;
var ROAD_SIGN_TEMPLATES = {
  "single-post": { bottom: 3.3, posts: [0], poleTop: 4.8 },
  "dual-post": { bottom: 3.3, posts: [-2.3, 2.3], poleTop: 5.7 },
  // A roadside cantilever keeps supports outside both opposing carriageways.
  "gantry": { bottom: 6.5, posts: [12], poleTop: 10.5 },
  "highway-gantry": { bottom: 6.5, posts: [-7, 9], poleTop: 12.8 },
  "ramp-confirmation": { bottom: 3.1, posts: [0], poleTop: 4.7 },
  "urban-name": { bottom: 2.8, posts: [0], poleTop: 3.8 },
  "ceiling": { bottom: 4.5, posts: [], poleTop: 6 },
  "speed-limit": { bottom: 2.1, posts: [0], poleTop: 3.35 },
  "chevron": { bottom: 1.35, posts: [0], poleTop: 2.3 }
};
function signDimensions(template, size, postOffset, gantryPosts, mountHeight = 6) {
  return { ...ROAD_SIGN_SIZES[size], ...ROAD_SIGN_TEMPLATES[template], ...template === "gantry" && postOffset !== void 0 ? { posts: [postOffset] } : {}, ...template === "highway-gantry" ? { posts: gantryPosts ?? [-7, 9], width: Math.min(18, (gantryPosts?.[1] ?? 9) - (gantryPosts?.[0] ?? -7) - 0.5), height: 5.4 } : {}, ...template === "ceiling" ? { bottom: Math.min(5.5, mountHeight - 1.15), poleTop: mountHeight, height: 1, width: Math.min(8, ROAD_SIGN_SIZES[size].width) } : {}, ...template === "speed-limit" ? { width: 1.2, height: 1.2 } : {}, ...template === "chevron" ? { width: 1.8, height: 0.9 } : {} };
}

// src/world/city/PrefabRegistry.ts
import { BufferGeometry as BufferGeometry6, CanvasTexture, Color, CylinderGeometry as CylinderGeometry2, DataTexture as DataTexture2, Float32BufferAttribute as Float32BufferAttribute5, Group as Group3, InstancedMesh, LinearFilter, LinearMipmapLinearFilter, Matrix4, Mesh as Mesh4, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Quaternion, RepeatWrapping, RingGeometry as RingGeometry2, SRGBColorSpace, Vector3 as Vector33 } from "three";
import { mergeGeometries as mergeGeometries2 } from "three/addons/utils/BufferGeometryUtils.js";

// src/world/city/CityBuildingGeometry.ts
import { BoxGeometry as BoxGeometry2, ExtrudeGeometry, Shape } from "three";

// src/world/city/CityLandmarkGeometry.ts
import { BoxGeometry as BoxGeometry3, CircleGeometry, CylinderGeometry, ExtrudeGeometry as ExtrudeGeometry2, Group as Group2, Mesh as Mesh3, RingGeometry, Shape as Shape2, SphereGeometry } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// src/world/subject3/materials.ts
import * as THREE2 from "three";

// src/world/environment/RoadSurfaceDetail.ts
import { DataTexture as DataTexture3, LinearFilter as LinearFilter2, LinearMipmapLinearFilter as LinearMipmapLinearFilter2, RepeatWrapping as RepeatWrapping2 } from "three";

// src/world/environment/VisualEnvironmentConfig.ts
var VISUAL_ENVIRONMENT = Object.freeze({
  exposure: 1,
  sunIntensity: 2.8,
  ambientIntensity: 1.45,
  environmentIntensity: 0.45,
  fogColor: 12043724,
  fogNear: 180,
  fogFar: 1100,
  skyTop: 8494767,
  skyHorizon: 12043724,
  skyGround: 7830901,
  sunColor: 16774111,
  ambientSky: 13360101,
  ambientGround: 7500651,
  shadowHalfExtent: 48,
  shadowMapSize: 2048,
  roadRoughness: 0.94,
  roadBumpScale: 6e-3,
  markingRoughness: 0.76
});

// src/world/subject3/materials.ts
var markingOptions = {
  roughness: VISUAL_ENVIRONMENT.markingRoughness,
  polygonOffset: true,
  polygonOffsetFactor: -3,
  polygonOffsetUnits: -3
};

// src/world/city/RoadsidePlacement.ts
var RoadsidePlacement = class {
  constructor(map, clearance = new RoadClearance(map)) {
    this.map = map;
    this.clearance = clearance;
    this.piers = map.roads.flatMap((r) => roadPiers(r, map, clearance).map((p) => p.position));
  }
  map;
  clearance;
  piers;
  permits(p, radius, height, ownRoadId) {
    const y = p.y ?? 0;
    if (ownRoadId) {
      if (this.clearance.roadAt(p, radius, y - 2, y + height + 0.65, ownRoadId) || this.clearance.roadAt(p, radius, y - 2, y + height + 0.65, void 0, void 0, true) || this.clearance.junctionAt(p, radius, y - 2, y + height + 0.65)) return false;
    } else if (!this.clearance.permitsProp(p, radius, height)) return false;
    if (this.piers.some((q) => (q.y ?? 0) > 0.5 && Math.hypot(p.x - q.x, p.z - q.z) < radius + 0.9 && y < (q.y ?? 0))) return false;
    return !(this.map.signs ?? []).some((s) => {
      const dims = signDimensions(s.template, s.size, s.postOffset, s.gantryPosts), base = s.position.y ?? 0;
      if ((s.postBaseY ?? base) > y + height || base + dims.poleTop < y) return false;
      return dims.posts.some((x) => {
        const q = rotatePoint({ x, z: ROAD_SIGN_POST_Z }, s.heading);
        return Math.hypot(p.x - s.position.x - q.x, p.z - s.position.z - q.z) < radius + 1;
      }) || Math.hypot(p.x - s.position.x, p.z - s.position.z) < radius + dims.width / 2 + 1 && y + height > base + dims.bottom;
    });
  }
};

// src/world/regional/HighwayLaneRenderer.ts
import { Group as Group4 } from "three";
var pathBetween = (at, start, end) => {
  const points = [];
  for (let d = start; d < end; d += 1.5) points.push(at(d));
  points.push(at(end));
  return points;
};
function clipGoreMesh(mesh, map, roadIds) {
  const pavement = roadCarriageways(map), ids = [...roadIds], position = mesh.geometry.getAttribute("position"), source = mesh.geometry.index, kept = [];
  const supported = (p) => ids.some((id) => pavement.pavedHeight(id, p) !== void 0);
  for (let i = 0; i < (source?.count ?? position.count); i += 3) {
    const indices = [0, 1, 2].map((k) => source ? source.getX(i + k) : i + k), vertices = indices.map((k) => ({ x: position.getX(k), y: position.getY(k), z: position.getZ(k) }));
    const center = { x: vertices.reduce((v, p) => v + p.x, 0) / 3, y: vertices.reduce((v, p) => v + p.y, 0) / 3, z: vertices.reduce((v, p) => v + p.z, 0) / 3 };
    if (vertices.every(supported) && supported(center)) kept.push(...indices);
  }
  if (!kept.length) {
    mesh.geometry.dispose();
    return false;
  }
  mesh.geometry.setIndex(kept);
  return true;
}
function buildHighwayLaneMarkings(road, map, materials) {
  const root = new Group4(), transition = road.highwayTransition;
  const points = roadPoints(road), length = polylineLength(points), off = transition.kind === "deceleration", half = road.laneWidth / 2;
  const main = map.roads.find((r) => r.id === transition.mainRoadId), chains = roadEdgeChains(map), mainIds = chains.continuations(main.id), clearance = runtimeRoadClearance(map);
  const mainPaths = map.roads.filter((r) => mainIds.has(r.id)).map((r) => ({ road: r, points: roadPoints(r) }));
  const at = (distance, offset = 0) => {
    const s = sampleAt(points, distance);
    return { x: s.point.x - s.tangent.z * offset, y: s.point.y, z: s.point.z + s.tangent.x * offset };
  };
  const decision = map.roads.find((r) => r.id === transition.decisionId);
  const paint = (name, points2, width = 0.15) => {
    const mesh = makeMarkingRibbon(name, points2, width, materials.whitePaint, () => 0, 8e-3);
    if (mesh) {
      if (name.startsWith("gore triangle") && decision.gore?.clipToPavement && !clipGoreMesh(mesh, map, /* @__PURE__ */ new Set([decision.id, road.id, ...mainIds]))) return;
      mesh.userData.markingSource = road.id;
      mesh.userData.markingOwner = "merge";
      root.add(mesh);
    }
  };
  const inner = (distance) => {
    const p = at(distance, -half + 0.15);
    let best = Infinity, result = p;
    for (const { road: r, points: points2 } of mainPaths) for (let i = 1; i < points2.length; i++) {
      const a = points2[i - 1], b = points2[i], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz);
      if (l < 1e-6) continue;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (l * l))), x = a.x + dx * t, z = a.z + dz * t, gap = Math.hypot(p.x - x, p.z - z), edge = r.laneCount * r.laneWidth / 2 - 0.15, y = (a.y ?? 0) + t * ((b.y ?? 0) - (a.y ?? 0));
      if (gap >= best || Math.abs(y - (p.y ?? 0)) > 0.2) continue;
      best = gap;
      if ((-(p.x - x) * dz + (p.z - z) * dx) / l < edge) result = { x: x - dz / l * edge, y, z: z + dx / l * edge };
      else result = p;
    }
    return result;
  };
  const opens = (distance) => {
    const p = at(distance, half - 0.15);
    return !clearance.roadAt(p, 0.2, (p.y ?? 0) - 0.2, (p.y ?? 0) + 0.2, road.id, (id) => mainIds.has(id), true);
  };
  const separator = (name, start, end, width) => {
    let run = [];
    const flush2 = () => {
      if (run.length > 1) paint(name, run, width);
      run = [];
    };
    const steps = Math.max(1, Math.ceil((end - start) / 1.5));
    for (let i = 0; i <= steps; i++) {
      const d = start + (end - start) * i / steps;
      if (opens(d)) run.push(inner(d));
      else flush2();
    }
    flush2();
  };
  const taper = Math.min(length, transition.taperMetres), solidStart = Math.max(taper * 0.55, length - 80), solidEnd = off ? 0 : Math.min(80, length - taper * 0.55);
  for (let d = off ? 0 : solidEnd; d < (off ? solidStart : length); d += 6) separator(off ? "deceleration dashed entry" : "acceleration dashed merge", d, Math.min(off ? solidStart : length, d + 3), 0.45);
  if (off) separator("deceleration solid taper", solidStart, length, 0.2);
  else separator("acceleration solid nose", 0, solidEnd, 0.2);
  let outer = [];
  const flush = () => {
    if (outer.length > 1) paint("auxiliary edge", outer);
    outer = [];
  };
  for (const p of pathBetween((d) => at(d, half - 0.15), 0, length)) {
    if (clearance.roadAt(p, 0.2, (p.y ?? 0) - 0.2, (p.y ?? 0) + 0.2, road.id, void 0, true) || clearance.junctionAt(p, 0.2, (p.y ?? 0) - 0.2, (p.y ?? 0) + 0.2)) flush();
    else outer.push(p);
  }
  flush();
  paintGore(decision, map, main, off, paint);
  const mainPoints = roadPoints(main), mainLength = polylineLength(mainPoints);
  const arrowFrame = sampleAt(mainPoints, mainLength - Math.min(85, mainLength * 0.65));
  const ownsArrows = off && !map.roads.some((r) => {
    const other = r.highwayTransition;
    if (r.id.localeCompare(road.id) >= 0 || other?.kind !== "deceleration" || !mainIds.has(other.mainRoadId)) return false;
    const path = roadPoints(map.roads.find((m) => m.id === other.mainRoadId)), length2 = polylineLength(path), q = sampleAt(path, length2 - Math.min(85, length2 * 0.65)).point;
    return Math.hypot(q.x - arrowFrame.point.x, q.z - arrowFrame.point.z) < 12 && Math.abs((q.y ?? 0) - (arrowFrame.point.y ?? 0)) < 0.2;
  });
  if (ownsArrows) for (let lane = 0; lane < main.laneCount; lane++) {
    const s = arrowFrame, offset = (lane + 0.5 - main.laneCount / 2) * main.laneWidth;
    const center = { x: s.point.x - s.tangent.z * offset, z: s.point.z + s.tangent.x * offset };
    if (clearance.junctionAt({ ...center, y: s.point.y }, 5, (s.point.y ?? 0) - 0.2, (s.point.y ?? 0) + 0.2)) continue;
    const turn = off && lane === main.laneCount - 1;
    const arrow = makeDirectionArrow("lane arrow head", center, Math.atan2(-s.tangent.x, -s.tangent.z), turn ? "straight-right" : "straight", 8, 2.4, materials.whitePaint, (x, z) => (s.point.y ?? 0) + (s.tangent.y ?? 0) * ((x - s.point.x) * s.tangent.x + (z - s.point.z) * s.tangent.z), 8e-3);
    if (arrow) {
      arrow.userData.markingSource = road.id;
      arrow.userData.markingOwner = "merge";
      arrow.userData.markingRole = "arrow";
      root.add(arrow);
    }
  }
  if (off) for (const distance of [Math.max(taper + 20, length - 125), length - 35]) {
    if (distance < 12 || distance > length - 12) continue;
    const s = sampleAt(points, distance), e = at(distance, -half + 0.2);
    if (clearance.roadAt(e, 0.1, (e.y ?? 0) - 0.2, (e.y ?? 0) + 0.2, road.id, (id) => mainIds.has(id), true) || clearance.junctionAt(s.point, 5, (s.point.y ?? 0) - 0.2, (s.point.y ?? 0) + 0.2)) continue;
    const arrow = makeDirectionArrow("auxiliary exit arrow", { x: s.point.x, z: s.point.z }, Math.atan2(-s.tangent.x, -s.tangent.z), "straight", 7, 2.2, materials.whitePaint, (x, z) => (s.point.y ?? 0) + (s.tangent.y ?? 0) * ((x - s.point.x) * s.tangent.x + (z - s.point.z) * s.tangent.z), 8e-3);
    if (arrow) {
      arrow.userData.markingSource = road.id;
      arrow.userData.markingOwner = "merge";
      arrow.userData.markingRole = "arrow";
      root.add(arrow);
    }
  }
  return root;
}
function paintGore(decision, map, owner, off, paint) {
  const decisionPoints = roadPoints(decision), rampLength = polylineLength(decisionPoints), ids = roadEdgeChains(map).continuations(owner.id), clearance = runtimeRoadClearance(map);
  const mainlines = map.roads.filter((r) => ids.has(r.id) || owner.roadNameId !== void 0 && roadFunction(r) === "expressway" && r.roadNameId === owner.roadNameId).map((r) => ({ ...r, centerline: roadPoints(r) }));
  const wedge = [];
  for (let station = 6; station <= Math.min(125, rampLength * 0.4); station += 6) {
    const frame = sampleAt(decisionPoints, off ? station : rampLength - station), rampEdge = { x: frame.point.x + frame.tangent.z * (decision.laneCount * decision.laneWidth / 2 + 0.3), y: frame.point.y, z: frame.point.z - frame.tangent.x * (decision.laneCount * decision.laneWidth / 2 + 0.3) };
    let best = Infinity, mainEdge;
    for (const main of mainlines) for (let i = 1; i < main.centerline.length; i++) {
      const a = main.centerline[i - 1], b = main.centerline[i], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz);
      if ((dx * frame.tangent.x + dz * frame.tangent.z) / l < 0.65) continue;
      const t = Math.max(0, Math.min(1, ((rampEdge.x - a.x) * dx + (rampEdge.z - a.z) * dz) / (l * l))), half = main.laneCount * main.laneWidth / 2;
      const q = { x: a.x + dx * t - dz / l * (half + 0.3), y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t, z: a.z + dz * t + dx / l * (half + 0.3) }, distance = Math.hypot(q.x - rampEdge.x, q.z - rampEdge.z);
      if (distance < best) {
        best = distance;
        mainEdge = q;
      }
    }
    if (mainEdge && best > 0.6 && best < (owner.shoulders?.right ?? 3) + (decision.shoulders?.left ?? 1) && Math.abs((mainEdge.y ?? 0) - (rampEdge.y ?? 0)) < 0.6) wedge.push({ a: mainEdge, b: rampEdge });
  }
  if (wedge.length > 1) {
    const pavement = decision.gore?.clipToPavement ? roadCarriageways(map) : void 0;
    const paved = (p) => !pavement || [decision, ...mainlines].some((road) => pavement.pavedHeight(road.id, p) !== void 0);
    const safePaint = (name, path, width) => {
      let run = [];
      const flush = () => {
        if (run.length > 1) paint(name, run, width);
        run = [];
      };
      const length = polylineLength(path);
      if (!pavement) {
        for (const p of pathBetween((d) => sampleAt(path, d).point, 0, length)) {
          if (clearance.roadAt(p, width / 2 + 0.05, (p.y ?? 0) - 0.2, (p.y ?? 0) + 0.2, void 0, void 0, true) || clearance.junctionAt(p, width / 2 + 0.05, (p.y ?? 0) - 0.2, (p.y ?? 0) + 0.2)) flush();
          else run.push(p);
        }
        flush();
        return;
      }
      const steps = Math.max(1, Math.ceil(length / 0.5));
      for (let i = 0; i <= steps; i++) {
        const frame = sampleAt(path, length * i / steps), p = frame.point;
        const supported = paved(p) && [-1, 1].every((side) => paved({ x: p.x - frame.tangent.z * side * (width / 2 + 0.03), y: p.y, z: p.z + frame.tangent.x * side * (width / 2 + 0.03) }));
        if (!supported || clearance.roadAt(p, width / 2 + 0.05, (p.y ?? 0) - 0.2, (p.y ?? 0) + 0.2, void 0, void 0, true) || clearance.junctionAt(p, width / 2 + 0.05, (p.y ?? 0) - 0.2, (p.y ?? 0) + 0.2)) flush();
        else run.push(p);
      }
      flush();
    };
    safePaint("gore triangle outline", [...wedge.map((v) => v.a), ...wedge.map((v) => v.b).reverse(), wedge[0].a], 0.2);
    for (let i = 0; i < wedge.length - 1; i++) safePaint("gore triangle hatch", [wedge[i].a, wedge[i + 1].b], 0.45);
  }
}
function buildHighwayGoreMarkings(decision, map, materials) {
  const root = new Group4();
  const clipRoadIds = /* @__PURE__ */ new Set([decision.id]), pavement = decision.gore?.clipToPavement ? roadCarriageways(map) : void 0;
  const paint = (name, points, width = 0.2) => {
    const mesh = makeMarkingRibbon(name, points, width, materials.whitePaint, () => 0, 8e-3);
    if (!mesh) return;
    if (pavement && !clipGoreMesh(mesh, map, clipRoadIds)) return;
    mesh.userData.markingSource = decision.id;
    mesh.userData.markingOwner = "merge";
    root.add(mesh);
  };
  for (const off of [true, false]) {
    if (!(off ? decision.gore?.start : decision.gore?.end)) continue;
    if (map.roads.some((r) => r.highwayTransition?.decisionId === decision.id && r.highwayTransition.kind === (off ? "deceleration" : "acceleration"))) continue;
    const link = map.roadLinks.find((l) => off ? l.to.roadId === decision.id && l.to.end === "start" : l.from.roadId === decision.id && l.from.end === "end");
    const owner = link && map.roads.find((r) => r.id === (off ? link.from : link.to).roadId);
    if (owner && roadFunction(owner) === "expressway") {
      if (pavement) {
        for (const road of map.roads) if (road.id === owner.id || owner.roadNameId !== void 0 && road.roadNameId === owner.roadNameId && roadFunction(road) === "expressway") clipRoadIds.add(road.id);
      }
      paintGore(decision, map, owner, off, paint);
    }
  }
  return root;
}

// src/world/city/RoadBuilder.ts
import { mergeGeometries as mergeGeometries3 } from "three/addons/utils/BufferGeometryUtils.js";

// src/world/city/RoadGeometryTrial.ts
import { BufferGeometry as BufferGeometry9, Float32BufferAttribute as Float32BufferAttribute7, InstancedMesh as InstancedMesh2, Matrix4 as Matrix42, Mesh as Mesh5, Vector3 as Vector35 } from "three";

// src/world/city/ContinuousRoadGeometry.ts
import { BufferAttribute as BufferAttribute3, BufferGeometry as BufferGeometry8, Float32BufferAttribute as Float32BufferAttribute6, ShapeUtils as ShapeUtils2, Vector2 as Vector23, Vector3 as Vector34 } from "three";

// src/world/city/PavementProjection.ts
import { BufferAttribute as BufferAttribute2, BufferGeometry as BufferGeometry7 } from "three";
var PavementTriangleIndex = class {
  planes;
  cells = /* @__PURE__ */ new Map();
  seen;
  candidates;
  clippedIds;
  stamp = 0;
  statistics = { inputTriangles: 0, candidateTests: 0, contained: 0, coplanarUnions: 0, outputTriangles: 0 };
  get byteLength() {
    let bytes = this.planes.byteLength + this.seen.byteLength + this.candidates.byteLength + this.clippedIds.byteLength;
    for (const column of this.cells.values()) for (const ids of column.values()) bytes += ids.byteLength;
    return bytes;
  }
  constructor(surfaces) {
    const count = surfaces.reduce((n, g) => n + (g.index?.count ?? g.getAttribute("position").count) / 3, 0);
    const planes = new Float64Array(count * 18), cells = /* @__PURE__ */ new Map();
    let used = 0;
    for (const surface of surfaces) {
      const p = surface.getAttribute("position"), indices = surface.index;
      for (let i = 0; i < (indices?.count ?? p.count); i += 3) {
        const a = indices ? indices.getX(i) : i, b = indices ? indices.getX(i + 1) : i + 1, c = indices ? indices.getX(i + 2) : i + 2;
        const ax = p.getX(a), ay = p.getY(a), az = p.getZ(a);
        let bx = p.getX(b), by = p.getY(b), bz = p.getZ(b), cx = p.getX(c), cy = p.getY(c), cz = p.getZ(c);
        let den = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
        if (Math.abs(den) < 1e-8) continue;
        if (den < 0) {
          [bx, cx] = [cx, bx];
          [by, cy] = [cy, by];
          [bz, cz] = [cz, bz];
          den = -den;
        }
        const gx = ((by - ay) * (cz - az) - (cy - ay) * (bz - az)) / den;
        const gz = ((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / den;
        const minX = Math.min(ax, bx, cx), maxX = Math.max(ax, bx, cx), minZ = Math.min(az, bz, cz), maxZ = Math.max(az, bz, cz);
        planes.set([ax, ay, az, bx, by, bz, cx, cy, cz, den, gx, gz, ay - gx * ax - gz * az, minX, maxX, minZ, maxZ, 1 / Math.hypot(gx, 1, gz)], used * 18);
        for (let x = Math.floor(minX / 16); x <= Math.floor(maxX / 16); x++) {
          let column = cells.get(x);
          if (!column) cells.set(x, column = /* @__PURE__ */ new Map());
          for (let z = Math.floor(minZ / 16); z <= Math.floor(maxZ / 16); z++) {
            let ids = column.get(z);
            if (!ids) column.set(z, ids = []);
            ids.push(used);
          }
        }
        used++;
      }
    }
    this.planes = planes.subarray(0, used * 18);
    this.seen = new Uint32Array(used);
    this.candidates = new Uint32Array(used);
    this.clippedIds = new Uint32Array(used);
    for (const [x, column] of cells) this.cells.set(x, new Map([...column].map(([z, ids]) => [z, new Uint32Array(ids)])));
  }
  query(minX, maxX, minZ, maxZ) {
    this.stamp++;
    if (this.stamp === 4294967295) {
      this.seen.fill(0);
      this.stamp = 1;
    }
    let count = 0;
    for (let x = Math.floor(minX / 16); x <= Math.floor(maxX / 16); x++) {
      const column = this.cells.get(x);
      if (!column) continue;
      for (let z = Math.floor(minZ / 16); z <= Math.floor(maxZ / 16); z++) for (const id of column.get(z) ?? []) {
        if (this.seen[id] === this.stamp) continue;
        this.seen[id] = this.stamp;
        this.candidates[count++] = id;
      }
    }
    return count;
  }
  heightAt(x, z, referenceY) {
    const count = this.query(x - 5e-4, x + 5e-4, z - 5e-4, z + 5e-4), p = this.planes;
    for (let i = 0; i < count; i++) {
      const k = this.candidates[i] * 18, ax = p[k], az = p[k + 2], bx = p[k + 3], bz = p[k + 5], cx = p[k + 6], cz = p[k + 8];
      const side = (a, b, c, d) => (c - a) * (z - b) - (d - b) * (x - a) + 5e-4 * Math.hypot(c - a, d - b);
      const y = p[k + 10] * x + p[k + 11] * z + p[k + 12];
      if (side(ax, az, bx, bz) >= 0 && side(bx, bz, cx, cz) >= 0 && side(cx, cz, ax, az) >= 0 && Math.abs(y - referenceY) < 0.5) return y;
    }
    return void 0;
  }
  projectPaint(source) {
    return drain(this.projectPaintSteps(source));
  }
  *projectPaintSteps(source) {
    const p = source.getAttribute("position"), index = source.index, sourceCount = index?.count ?? p.count;
    let positions = new Float32Array(Math.max(36, sourceCount * 3)), normals = new Float32Array(positions.length), uv = new Float32Array(positions.length / 3 * 2), at = 0;
    const plane = this.planes, scratchA = new Float64Array(16), scratchB = new Float64Array(16);
    const disjoint = (count) => {
      for (let a = 0; a < count; a++) for (let b = a + 1; b < count; b++) {
        const ka = this.clippedIds[a], kb = this.clippedIds[b];
        scratchA.set([plane[ka], plane[ka + 2], plane[ka + 3], plane[ka + 5], plane[ka + 6], plane[ka + 8]]);
        let input = scratchA, output = scratchB, vertices = 3;
        for (let edge = 0; edge < 3 && vertices; edge++) {
          const start = kb + edge * 3, end = kb + (edge + 1) % 3 * 3;
          const x = plane[start], z = plane[start + 2], dx = plane[end] - x, dz = plane[end + 2] - z;
          let out = 0;
          for (let v = 0; v < vertices; v++) {
            const next = (v + 1) % vertices, px = input[v * 2], pz = input[v * 2 + 1], qx = input[next * 2], qz = input[next * 2 + 1];
            const sp = dx * (pz - z) - dz * (px - x), sq = dx * (qz - z) - dz * (qx - x);
            if (sp >= 0) {
              output[out++] = px;
              output[out++] = pz;
            }
            if (sp >= 0 !== sq >= 0) {
              const t = sp / (sp - sq);
              output[out++] = px + (qx - px) * t;
              output[out++] = pz + (qz - pz) * t;
            }
          }
          vertices = out / 2;
          [input, output] = [output, input];
        }
        for (let v = 1; v + 1 < vertices; v++) if (Math.abs((input[v * 2] - input[0]) * (input[(v + 1) * 2 + 1] - input[1]) - (input[v * 2 + 1] - input[1]) * (input[(v + 1) * 2] - input[0])) > 1e-8) return false;
      }
      return true;
    };
    const emit = (ax, az, bx, bz, cx, cz, k) => {
      if (at + 9 > positions.length) {
        const capacity = Math.max(at + 9, positions.length * 2), a = new Float32Array(capacity), n = new Float32Array(capacity), u = new Float32Array(capacity / 3 * 2);
        a.set(positions);
        n.set(normals);
        u.set(uv);
        positions = a;
        normals = n;
        uv = u;
      }
      if ((bx - ax) * (cz - az) - (bz - az) * (cx - ax) > 0) {
        [bx, cx] = [cx, bx];
        [bz, cz] = [cz, bz];
      }
      const gx = plane[k + 10], gz = plane[k + 11], constant = plane[k + 12], scale = plane[k + 17];
      for (let j = 0; j < 3; j++) {
        const x = j === 0 ? ax : j === 1 ? bx : cx, z = j === 0 ? az : j === 1 ? bz : cz;
        positions[at] = x;
        positions[at + 1] = gx * x + gz * z + constant + 8e-3;
        positions[at + 2] = z;
        normals[at] = -gx * scale;
        normals[at + 1] = scale;
        normals[at + 2] = -gz * scale;
        uv[at / 3 * 2] = x;
        uv[at / 3 * 2 + 1] = z;
        at += 3;
      }
    };
    for (let i = 0; i < sourceCount; i += 3) {
      if (i % 192 === 0) yield;
      const a = index ? index.getX(i) : i, b = index ? index.getX(i + 1) : i + 1, c = index ? index.getX(i + 2) : i + 2;
      const ax = p.getX(a), ay = p.getY(a), az = p.getZ(a), bx = p.getX(b), by = p.getY(b), bz = p.getZ(b), cx = p.getX(c), cy = p.getY(c), cz = p.getZ(c);
      const originalArea = Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax));
      if (originalArea < 1e-8) continue;
      const minX = Math.min(ax, bx, cx), maxX = Math.max(ax, bx, cx), minZ = Math.min(az, bz, cz), maxZ = Math.max(az, bz, cz);
      const count = this.query(minX, maxX, minZ, maxZ), before = at;
      let area = 0, reference = -1, coplanar = true, contained = false, clippedCount = 0;
      this.statistics.inputTriangles++;
      for (let n = 0; n < count; n++) {
        const k = this.candidates[n] * 18;
        if (plane[k + 13] > maxX || plane[k + 14] < minX || plane[k + 15] > maxZ || plane[k + 16] < minZ) continue;
        const gx = plane[k + 10], gz = plane[k + 11], constant = plane[k + 12];
        if (Math.abs(gx * ax + gz * az + constant - ay) > 0.5 || Math.abs(gx * bx + gz * bz + constant - by) > 0.5 || Math.abs(gx * cx + gz * cz + constant - cy) > 0.5) continue;
        this.statistics.candidateTests++;
        scratchA.set([ax, az, bx, bz, cx, cz]);
        let input = scratchA, output = scratchB, vertices = 3;
        for (let edge = 0; edge < 3 && vertices; edge++) {
          const start = k + edge * 3, end = k + (edge + 1) % 3 * 3;
          const x = plane[start], z = plane[start + 2], dx = plane[end] - x, dz = plane[end + 2] - z;
          let out = 0;
          for (let v = 0; v < vertices; v++) {
            const next = (v + 1) % vertices, px = input[v * 2], pz = input[v * 2 + 1], qx = input[next * 2], qz = input[next * 2 + 1];
            const sp = dx * (pz - z) - dz * (px - x), sq = dx * (qz - z) - dz * (qx - x);
            if (sp >= 0) {
              output[out++] = px;
              output[out++] = pz;
            }
            if (sp >= 0 !== sq >= 0) {
              const t = sp / (sp - sq);
              output[out++] = px + (qx - px) * t;
              output[out++] = pz + (qz - pz) * t;
            }
          }
          vertices = out / 2;
          [input, output] = [output, input];
        }
        if (vertices < 3) continue;
        let clippedArea = 0;
        for (let v = 1; v + 1 < vertices; v++) clippedArea += Math.abs((input[v * 2] - input[0]) * (input[(v + 1) * 2 + 1] - input[1]) - (input[v * 2 + 1] - input[1]) * (input[(v + 1) * 2] - input[0]));
        if (clippedArea < 1e-8) continue;
        this.clippedIds[clippedCount++] = k;
        if (reference < 0) reference = k;
        else if (coplanar) {
          const dx = gx - plane[reference + 10], dz = gz - plane[reference + 11], dc = constant - plane[reference + 12];
          coplanar = Math.max(Math.abs(dx * ax + dz * az + dc), Math.abs(dx * bx + dz * bz + dc), Math.abs(dx * cx + dz * cz + dc)) < 1e-5;
        }
        area += clippedArea;
        for (let v = 1; v + 1 < vertices; v++) emit(input[0], input[1], input[v * 2], input[v * 2 + 1], input[(v + 1) * 2], input[(v + 1) * 2 + 1], k);
        if (Math.abs(clippedArea - originalArea) <= Math.max(1e-9, originalArea * 1e-8)) {
          at = before;
          emit(ax, az, bx, bz, cx, cz, k);
          contained = true;
          this.statistics.contained++;
          break;
        }
      }
      if (!contained && reference >= 0 && coplanar && Math.abs(area - originalArea) <= Math.max(1e-8, originalArea * 1e-7) && disjoint(clippedCount)) {
        at = before;
        emit(ax, az, bx, bz, cx, cz, reference);
        this.statistics.coplanarUnions++;
      }
    }
    const result = new BufferGeometry7();
    result.setAttribute("position", new BufferAttribute2(positions.slice(0, at), 3));
    result.setAttribute("normal", new BufferAttribute2(normals.slice(0, at), 3));
    result.setAttribute("uv", new BufferAttribute2(uv.slice(0, at / 3 * 2), 2));
    result.computeBoundingBox();
    result.computeBoundingSphere();
    this.statistics.outputTriangles += at / 9;
    return result;
  }
};

// src/world/city/ContinuousRoadGeometry.ts
var ROAD_GEOMETRY_BUDGET = {
  maximumStructureSpacing: 4,
  postSpacing: 4,
  markingClearance: 8e-3,
  maxTrianglesRatio: 2.5,
  maxBufferRatio: 2.5,
  maxExtraSectorDraws: 4,
  maxAddedGenerationMs: 150,
  maxGenerationRatio: 2
};
function sweepFrames(points, spacing = ROAD_GEOMETRY_BUDGET.maximumStructureSpacing) {
  if (points.length < 2) throw new Error("A road sweep needs at least two points");
  const samples = sampleRibbonPolyline(points, spacing);
  let station = 0;
  return samples.map((sample, i) => {
    const p = sample.point, a = samples[Math.max(0, i - 1)].point, b = samples[Math.min(samples.length - 1, i + 1)].point;
    const tangent = new Vector34(b.x - a.x, (b.y ?? 0) - (a.y ?? 0), b.z - a.z).normalize();
    const right = new Vector34(-sample.tangent.z, 0, sample.tangent.x);
    const normal = new Vector34().crossVectors(right, tangent).normalize();
    if (i) {
      const previous = samples[i - 1].point;
      station += Math.hypot(p.x - previous.x, (p.y ?? 0) - (previous.y ?? 0), p.z - previous.z);
    }
    return { point: new Vector34(p.x, p.y ?? 0, p.z), right, tangent, normal, station };
  });
}
function geometry(positions, uv, indices) {
  const result = new BufferGeometry8();
  result.setAttribute("position", positions instanceof Float32Array ? new BufferAttribute3(positions, 3) : new Float32BufferAttribute6(positions, 3));
  result.setAttribute("uv", uv instanceof Float32Array ? new BufferAttribute3(uv, 2) : new Float32BufferAttribute6(uv, 2));
  if (indices) result.setIndex(Array.isArray(indices) ? indices : new BufferAttribute3(indices, 1));
  result.computeVertexNormals();
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}
function continuousRibbon(left, right, height = 0.024) {
  if (left.length !== right.length || left.length < 2) throw new Error("Mismatched road boundaries");
  const positions = new Float32Array(left.length * 6), uv = new Float32Array(left.length * 4), indices = left.length * 2 > 65535 ? new Uint32Array((left.length - 1) * 6) : new Uint16Array((left.length - 1) * 6);
  let station = 0;
  for (let i = 0; i < left.length; i++) {
    const a = left[i], b = right[i];
    if (i) {
      const p = left[i - 1];
      station += Math.hypot(a.x - p.x, (a.y ?? 0) - (p.y ?? 0), a.z - p.z);
    }
    positions.set([a.x, (a.y ?? 0) + height, a.z, b.x, (b.y ?? 0) + height, b.z], i * 6);
    uv.set([0, station, Math.hypot(b.x - a.x, (b.y ?? 0) - (a.y ?? 0), b.z - a.z), station], i * 4);
    if (i + 1 < left.length) {
      const k = i * 2;
      indices.set([k, k + 1, k + 2, k + 1, k + 3, k + 2], i * 6);
    }
  }
  return geometry(positions, uv, indices);
}
function sweepSolid(frames, profileAt, options = {}) {
  const positions = [], uv = [], indices = [];
  let profiles = frames.map(profileAt);
  if (!profiles.length) return geometry([], [], []);
  const count = profiles[0].length;
  if (profiles.some((p) => p.length !== count) || count < 3) throw new Error("Inconsistent sweep profile");
  const area = profiles[0].reduce((sum, p, i, a) => {
    const q = a[(i + 1) % a.length];
    return sum + p.offset * q.height - q.offset * p.height;
  }, 0);
  if (area < 0) profiles = profiles.map((p) => [...p].reverse());
  const at = (i, p) => {
    const f = frames[i];
    return [f.point.x + f.right.x * p.offset, f.point.y + p.height, f.point.z + f.right.z * p.offset];
  };
  for (let side = 0; side < count; side++) {
    if (options.omitFaces?.includes(side)) continue;
    const base = positions.length / 3;
    for (let i = 0; i < frames.length; i++) {
      positions.push(...at(i, profiles[i][side]), ...at(i, profiles[i][(side + 1) % count]));
      uv.push(0, frames[i].station, 1, frames[i].station);
      if (i + 1 < frames.length) {
        const k = base + i * 2;
        indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    }
  }
  if (options.caps !== false) for (const end of [0, frames.length - 1]) {
    const profile = profiles[end], base = positions.length / 3;
    for (const p of profile) {
      positions.push(...at(end, p));
      uv.push(p.offset, p.height);
    }
    for (const face of ShapeUtils2.triangulateShape(profile.map((p) => new Vector23(p.offset, p.height)), [])) {
      const [a, b, c] = face;
      indices.push(base + a, base + (end === 0 ? b : c), base + (end === 0 ? c : b));
    }
  }
  return geometry(positions, uv, indices);
}
function solidifySurface(top, thickness) {
  const p = top.getAttribute("position"), tex = top.getAttribute("uv"), index = top.index;
  const positions = [], uv = [];
  const boundaries = /* @__PURE__ */ new Map();
  const key = (v) => v.map((n) => Math.round(n * 1e4)).join(",");
  const emit = (vertices) => {
    for (const v of vertices) {
      positions.push(...v);
      uv.push(v[0], v[2]);
    }
  };
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    const vertices = [];
    for (let k = 0; k < 3; k++) {
      const n = index ? index.getX(i + k) : i + k;
      vertices.push([p.getX(n), p.getY(n), p.getZ(n)]);
      positions.push(p.getX(n), p.getY(n), p.getZ(n));
      uv.push(tex?.getX(n) ?? 0, tex?.getY(n) ?? 0);
    }
    emit([...vertices].reverse().map((v) => [v[0], v[1] - thickness, v[2]]));
    for (let k = 0; k < 3; k++) {
      const a = vertices[k], b = vertices[(k + 1) % 3], ka = key(a), kb = key(b), id = ka < kb ? ka + "|" + kb : kb + "|" + ka;
      const edge = boundaries.get(id);
      if (edge) edge.count++;
      else boundaries.set(id, { a, b, count: 1 });
    }
  }
  for (const { a, b, count } of boundaries.values()) if (count === 1) {
    const c = [a[0], a[1] - thickness, a[2]], d = [b[0], b[1] - thickness, b[2]];
    emit([a, c, b, b, c, d]);
  }
  top.dispose();
  return geometry(positions, uv);
}

// src/world/city/RoadGeometryTrialCache.ts
function roadGeometryRevision(map) {
  let a = 2166136261, b = 2246822519;
  const number = new DataView(new ArrayBuffer(8));
  const byte = (v) => {
    a = Math.imul(a ^ v, 16777619);
    b = Math.imul(b ^ v, 3266489917);
  };
  const value = (v) => {
    if (typeof v === "number") {
      byte(1);
      number.setFloat64(0, v);
      for (let i = 0; i < 8; i++) byte(number.getUint8(i));
    } else if (typeof v === "string") {
      byte(2);
      for (let i = 0; i < v.length; i++) {
        const c = v.charCodeAt(i);
        byte(c & 255);
        byte(c >>> 8);
      }
      byte(0);
    } else if (typeof v === "boolean") byte(v ? 3 : 4);
    else if (Array.isArray(v)) {
      byte(5);
      for (const child of v) value(child);
      byte(6);
    } else if (v && typeof v === "object") {
      byte(7);
      for (const key of Object.keys(v)) {
        value(key);
        value(v[key]);
      }
      byte(8);
    } else byte(9);
  };
  value([map.version, map.sectorSize, map.bounds, map.roads, map.intersections, map.roadLinks, map.objects, map.environment, map.regional]);
  return "continuous-v2:" + (a >>> 0).toString(16) + (b >>> 0).toString(16);
}
var RoadGeometryCompilationCache = class {
  constructor(revision, maxBytes = 8 * 1024 * 1024, maxEntries = 32) {
    this.revision = revision;
    this.maxBytes = maxBytes;
    this.maxEntries = maxEntries;
  }
  revision;
  maxBytes;
  maxEntries;
  entries = /* @__PURE__ */ new Map();
  bytes = 0;
  statistics = { hits: 0, misses: 0, evictions: 0, peakBytes: 0 };
  entry(key) {
    let entry = this.entries.get(key);
    if (entry) {
      this.statistics.hits++;
      this.entries.delete(key);
    } else {
      this.statistics.misses++;
      entry = { bytes: 0 };
    }
    this.entries.set(key, entry);
    return entry;
  }
  account(key) {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.bytes -= entry.bytes;
    const p = entry.pavement;
    entry.bytes = (entry.frames?.length ?? 0) * 160 + (entry.index?.byteLength ?? 0) + (p ? p.position.byteLength + p.normal.byteLength + (p.uv?.byteLength ?? 0) + (p.index?.byteLength ?? 0) : 0);
    this.bytes += entry.bytes;
    while (this.bytes > this.maxBytes || this.entries.size > this.maxEntries) {
      const key2 = this.entries.keys().next().value;
      this.bytes -= this.entries.get(key2).bytes;
      this.entries.delete(key2);
      this.statistics.evictions++;
    }
    this.statistics.peakBytes = Math.max(this.statistics.peakBytes, this.bytes);
  }
  get state() {
    return { ...this.statistics, bytes: this.bytes, entries: this.entries.size, maxBytes: this.maxBytes, maxEntries: this.maxEntries, revision: this.revision };
  }
};
var caches = /* @__PURE__ */ new WeakMap();
var immutableRevisions = /* @__PURE__ */ new WeakMap();
function registerImmutableRoadGeometry(map, contentRevision) {
  if (immutableRevisions.get(map) === contentRevision) return;
  const seen = /* @__PURE__ */ new WeakSet();
  const seal = (value) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const child of value) seal(child);
    } else for (const key of Object.keys(value)) seal(value[key]);
    Object.freeze(value);
  };
  seal(map);
  immutableRevisions.set(map, contentRevision);
}
function roadGeometryCompilationCache(map) {
  const revision = immutableRevisions.get(map) ?? roadGeometryRevision(map), previous = caches.get(map);
  if (previous?.revision === revision) return previous;
  invalidateRoadEdgeChains(map);
  invalidateRoadClearance(map);
  invalidateRoadCarriageways(map);
  const cache3 = new RoadGeometryCompilationCache(revision);
  caches.set(map, cache3);
  return cache3;
}

// src/world/city/RoadGeometryTrial.ts
var RoadGeometryTrial = class {
  constructor(map, materials, selection) {
    this.map = map;
    this.materials = materials;
    this.roads = new Set(selection.roadIds);
    this.intersections = new Set(selection.intersectionIds);
    this.roadById = new Map(map.roads.map((r) => [r.id, r]));
    this.cache = roadGeometryCompilationCache(map);
  }
  map;
  materials;
  roads;
  intersections;
  fallbacks = /* @__PURE__ */ new Map();
  roadById;
  cache;
  enabled(road) {
    if (!this.roads.has(road.id)) return false;
    let reason;
    if (road.gore || road.highwayTransition) reason = "merge paint needs a multi-road final-surface owner";
    else if (road.structure?.enclosure && road.sidewalk?.enabled && road.sidewalk.width > (road.structure.barrierOffset ?? 0) + 0.15) reason = "authored sidewalk extends behind the existing wall/collider";
    else if (road.structure?.barrierEnabled && Math.min(road.shoulders?.left ?? 0, road.shoulders?.right ?? 0) + (road.structure.barrierOffset ?? 0) < 0.14) reason = "no shoulder reserve for the existing barrier collision envelope";
    if (reason) {
      this.fallbacks.set(road.id, reason);
      return false;
    }
    return true;
  }
  enabledIntersection(j) {
    if (!this.intersections.has(j.id)) return false;
    if (j.channelized) {
      this.fallbacks.set(j.id, "traffic-island collision contract requires separate authoring review");
      return false;
    }
    return true;
  }
  legacySidewalks(road) {
    if (!road.sidewalk?.enabled) return false;
    this.fallbacks.set(road.id + ":sidewalk", "physical sidewalk support is flat; raised solid curb needs a separate support/collision change");
    return true;
  }
  roadFrames(road) {
    const entry = this.cache.entry(road.id);
    let frames = entry.frames;
    if (!frames) {
      const chain = roadEdgeChains(this.map), centre = chain.edge(road, 0), right = chain.edge(road, 1);
      frames = sweepFrames(centre, Infinity);
      frames.forEach((f, i) => {
        f.right.set(right[i].x - centre[i].x, 0, right[i].z - centre[i].z);
        f.normal.crossVectors(f.right, f.tangent).normalize();
      });
      entry.frames = frames;
      this.cache.account(road.id);
    }
    return frames;
  }
  strip(road, left, right, height) {
    const chain = roadEdgeChains(this.map);
    return continuousRibbon(chain.edge(road, left), chain.edge(road, right), height);
  }
  pavement(road) {
    const entry = this.cache.entry(road.id);
    if (entry.pavement) {
      const p = entry.pavement;
      return importVisualGeometry({ ...p, position: p.position.slice(), normal: p.normal.slice(), uv: p.uv?.slice(), index: p.index?.slice() });
    }
    const edges = roadEdges(road);
    const geometry2 = clipRoadJunctionPavement(this.strip(road, edges.left, edges.right, 0.024), road, this.map);
    entry.pavement = exportVisualGeometry(geometry2);
    this.cache.account(road.id);
    return geometry2;
  }
  add(root, name, geometry2, material, kind) {
    const mesh = new Mesh5(geometry2, material);
    mesh.name = name;
    mesh.receiveShadow = true;
    mesh.castShadow = kind !== "pavement";
    mesh.userData.roadGeometryTrial = true;
    mesh.userData.roadStructureKind = kind;
    root.add(mesh);
    return mesh;
  }
  sidewalks(root, road) {
    if (!road.sidewalk?.enabled) return;
    const edges = roadEdges(road), width = road.sidewalk.width;
    for (const side of [-1, 1]) {
      const edge = side < 0 ? edges.left : edges.right;
      const strip = (a, b, height, thickness, curb) => {
        if (Math.abs(a - b) < 0.01) return;
        const top = clipRoadJunctionPavement(this.strip(road, Math.min(a, b), Math.max(a, b), height), road, this.map, height, true);
        if (!top.getAttribute("position").count) {
          top.dispose();
          return;
        }
        this.add(root, curb ? "road curb" : "road sidewalk", solidifySurface(top, thickness), curb ? this.materials.curb : this.materials.sidewalk, curb ? "curb" : "sidewalk");
      };
      const curbWidth = road.curb !== false ? Math.min(0.22, width) : 0;
      strip(edge + side * curbWidth, edge + side * width, 0.15, 0.15, false);
      if (curbWidth) strip(edge, edge + side * curbWidth, 0.17, 0.17, true);
    }
  }
  deck(root, road) {
    const edges = roadEdges(road), extra = road.structure?.barrierOffset ?? 0;
    const walk = road.sidewalk?.enabled ? road.sidewalk.width : 0;
    const left = edges.left - Math.max(extra, walk), right = edges.right + Math.max(extra, walk);
    this.add(root, "bridge solid deck", sweepSolid(this.roadFrames(road), () => [
      { offset: left, height: -0.65 },
      { offset: right, height: -0.65 },
      { offset: right, height: 0.024 },
      { offset: left, height: 0.024 }
    ], { omitFaces: [2] }), this.materials.curb, "bridge-deck");
  }
  barrier(root, points, side, concrete, sharedMedian, sharedPost) {
    const frames = sweepFrames(points);
    const profile = (values) => values.map(([offset, height]) => ({ offset: offset * side, height }));
    if (concrete) {
      this.add(root, "road barrier", sweepSolid(frames, () => profile(sharedMedian ? [
        [-0.12, 0.024],
        [0.12, 0.024],
        [0.12, 0.32],
        [0.065, 0.65],
        [0.065, 1.1],
        [-0.065, 1.1],
        [-0.065, 0.65],
        [-0.12, 0.32]
      ] : [[-0.12, 0.024], [0.12, 0.024], [0.12, 1.1], [0.04, 1.1], [0.04, 0.65], [-0.12, 0.32]])), this.materials.curb, "concrete-barrier");
      return;
    }
    this.add(root, "road barrier", sweepSolid(frames, () => profile([
      [-0.115, 0.55],
      [-0.04, 0.6],
      [-0.115, 0.68],
      [-0.04, 0.76],
      [-0.115, 0.84],
      [-0.095, 0.85],
      [-0.015, 0.76],
      [-0.09, 0.68],
      [-0.015, 0.6],
      [-0.095, 0.54]
    ])), this.materials.metal, "metal-rail");
    const length = frames.at(-1).station;
    const count = Math.max(1, Math.floor(length / ROAD_GEOMETRY_BUDGET.postSpacing));
    const posts = new InstancedMesh2(sharedPost(), this.materials.darkMetal, count);
    posts.name = "road guardrail posts";
    posts.castShadow = true;
    posts.userData.roadStructureKind = "guardrail-posts";
    let segment = 0;
    for (let i = 0; i < count; i++) {
      const station = (i + 0.5) * length / count;
      while (segment + 1 < frames.length - 1 && frames[segment + 1].station < station) segment++;
      const a = frames[segment], b = frames[segment + 1];
      const t = (station - a.station) / Math.max(1e-8, b.station - a.station);
      const right = a.right.clone().lerp(b.right, t).normalize(), up = a.normal.clone().lerp(b.normal, t).normalize();
      const back = new Vector35().crossVectors(right, up).normalize();
      up.crossVectors(back, right).normalize();
      const position = a.point.clone().lerp(b.point, t).addScaledVector(up, 0.55);
      posts.setMatrixAt(i, new Matrix42().makeBasis(right, up, back).setPosition(position));
    }
    posts.computeBoundingSphere();
    root.add(posts);
  }
  median(root, points) {
    this.add(root, "road central barrier", sweepSolid(sweepFrames(points), () => [
      { offset: -0.12, height: 0.024 },
      { offset: 0.12, height: 0.024 },
      { offset: 0.12, height: 0.32 },
      { offset: 0.065, height: 0.65 },
      { offset: 0.065, height: 1.1 },
      { offset: -0.065, height: 1.1 },
      { offset: -0.065, height: 0.65 },
      { offset: -0.12, height: 0.32 }
    ]), this.materials.curb, "median");
  }
  enclosureWall(root, road, points, side) {
    const enclosure = road.structure.enclosure, clearance = runtimeRoadClearance(this.map);
    this.add(root, "retaining wall", sweepSolid(sweepFrames(points), (f) => {
      const top = enclosure.kind === "cutting" ? retainingWallHeight(road, { x: f.point.x, y: f.point.y, z: f.point.z }, clearance) : enclosure.clearance;
      return [{ offset: 0, height: 0 }, { offset: side * 0.3, height: 0 }, { offset: side * 0.3, height: top }, { offset: 0, height: top }];
    }), this.materials.wall, enclosure.kind === "cutting" ? "cutting-wall" : "tunnel-wall");
  }
  roof(root, road) {
    const enclosure = road.structure.enclosure, edges = roadEdges(road);
    const chain = roadEdgeChains(this.map), left = chain.barrierEdge(road, -1), right = chain.barrierEdge(road, 1);
    const frames = this.roadFrames(road);
    const top = continuousRibbon(
      left.map((p, i) => ({ x: p.x - frames[i].right.x * 0.3, y: p.y, z: p.z - frames[i].right.z * 0.3 })),
      right.map((p, i) => ({ x: p.x + frames[i].right.x * 0.3, y: p.y, z: p.z + frames[i].right.z * 0.3 })),
      enclosure.clearance + 0.65
    );
    this.add(root, "tunnel ceiling and portals", solidifySurface(top, 0.65), this.materials.wall, "tunnel-roof");
    root.userData.tunnelClearWidth = edges.width;
  }
  *finishRoadSteps(root, road, pavement) {
    const entry = this.cache.entry(road.id);
    const index = entry.index ??= new PavementTriangleIndex([pavement]);
    this.cache.account(road.id);
    const paints = [];
    root.traverse((o) => {
      if (o instanceof Mesh5 && o.userData.markingOwner) paints.push(o);
    });
    for (const mesh of paints) {
      const projected = yield* index.projectPaintSteps(mesh.geometry);
      mesh.geometry.dispose();
      mesh.geometry = projected;
      mesh.userData.roadGeometryTrial = true;
    }
  }
  junctionPavement(j) {
    const outline = j.pavementFootprint;
    if (!outline) return void 0;
    const geometry2 = new BufferGeometry9();
    geometry2.setAttribute("position", new Float32BufferAttribute7([0, 0.024, 0, ...outline.flatMap((p) => [p.x, (p.y ?? 0) + 0.024, p.z])], 3));
    geometry2.setAttribute("uv", new Float32BufferAttribute7([0, 0, ...outline.flatMap((p) => [p.x, p.z])], 2));
    geometry2.setIndex(outline.flatMap((_, i) => [0, (i + 1) % outline.length + 1, i + 1]));
    geometry2.computeVertexNormals();
    return geometry2;
  }
  *finishIntersectionSteps(root, j, pavement) {
    root.updateMatrixWorld(true);
    const worldPavement = pavement.clone().applyMatrix4(root.matrixWorld);
    const paints = [];
    root.traverse((o) => {
      if (o instanceof Mesh5 && o.userData.markingOwner) paints.push(o);
    });
    for (const paint of paints) {
      const port = paint.userData.approachPort;
      const key = "junction:" + j.id + ":" + port, entry = this.cache.entry(key);
      let index = entry.index;
      if (!index) {
        const roadId = j.connections.find((c) => c.port === port)?.roadId, road = roadId ? this.roadById.get(roadId) : void 0;
        const surfaces = [worldPavement];
        if (road) surfaces.push(this.pavement(road));
        index = new PavementTriangleIndex(surfaces);
        entry.index = index;
        this.cache.account(key);
        surfaces.slice(1).forEach((s) => s.dispose());
      }
      const world = paint.geometry.clone().applyMatrix4(root.matrixWorld);
      const projected = (yield* index.projectPaintSteps(world)).applyMatrix4(root.matrixWorld.clone().invert());
      world.dispose();
      paint.geometry.dispose();
      paint.geometry = projected;
      paint.userData.roadGeometryTrial = true;
      yield;
    }
    worldPavement.dispose();
    this.fallbacks.set(j.id + ":curb-return", "no existing raised-rim collision/support contract");
  }
};

// src/world/city/RoadBuilder.ts
var RoadBuilder = class {
  constructor(materials, map, trial) {
    this.materials = materials;
    this.map = map;
    this.trial = map && trial ? new RoadGeometryTrial(map, materials, trial) : void 0;
    this.clearance = map ? runtimeRoadClearance(map) : void 0;
    this.ownership = map ? new MarkingOwnership(map) : void 0;
    this.placement = map ? new RoadsidePlacement(map, this.clearance) : void 0;
  }
  materials;
  map;
  clearance;
  ownership;
  placement;
  sharedGeometry = /* @__PURE__ */ new Map();
  trial;
  get geometryCacheStatistics() {
    return this.trial?.cache.state;
  }
  geometry(key, create) {
    let geometry2 = this.sharedGeometry.get(key);
    if (!geometry2) {
      geometry2 = create();
      this.sharedGeometry.set(key, geometry2);
    }
    return geometry2;
  }
  build(road) {
    return drain(this.buildSteps(road));
  }
  *buildSteps(road, trace) {
    const root = new Group6(), points = roadPoints(road), half = road.laneCount * road.laneWidth / 2;
    const edges = roadEdges(road);
    const continuous = this.trial?.enabled(road) ? this.trial : void 0;
    root.name = road.id;
    if (road.highwayTransition && this.map) root.add(buildHighwayLaneMarkings(road, this.map, this.materials));
    if (road.gore && this.map) root.add(buildHighwayGoreMarkings(road, this.map, this.materials));
    const add = (mesh) => {
      if (mesh) root.add(mesh);
    };
    const pavement = continuous ? continuous.pavement(road) : this.map ? roadEdgeStrip(road, this.map, edges.left, edges.right, 0.024) : createStripGeometry(points, () => 0, { innerOffset: edges.left, outerOffset: edges.right, yOffset: 0.024, maximumSpacing: 3 });
    if (pavement) {
      const mesh = new Mesh6(continuous ? pavement : this.map ? clipRoadJunctionPavement(pavement, road, this.map) : pavement, this.materials.asphalt);
      mesh.name = "road pavement";
      mesh.userData.pavementOwner = road.id;
      mesh.receiveShadow = true;
      add(mesh);
    }
    yield;
    if (trace) {
      trace.phase = "paint";
      yield;
    }
    const mergePaint = !!road.gore || !!this.map?.roads.some((r) => r.groupId === road.groupId && r.gore);
    const owner = this.ownership, materials = this.materials, clearance = this.clearance;
    function* line(path, offset, yellow = false) {
      const paint = (section2, owner2 = "road") => {
        const mesh = makeMarkingRibbon(owner2 === "road" ? "road paint" : "merge divider", section2, 0.12, yellow ? materials.yellowPaint : materials.whitePaint, () => 0, 8e-3, offset);
        if (mesh) {
          mesh.userData.markingOwner = owner2;
          mesh.userData.markingSource = road.id;
          add(mesh);
        }
      };
      if (owner) {
        const boundary = Math.abs(Math.abs(offset) - (half - 0.15)) < 1e-6;
        for (const section2 of yield* owner.sectionSteps(path, offset, road, "road", boundary, yellow)) paint(section2);
        if (road.gore) for (const section2 of yield* owner.sectionSteps(path, offset, road, "merge", boundary)) paint(section2, "merge");
        return;
      }
      if (!mergePaint || !clearance) {
        paint(path);
        return;
      }
      const length2 = polylineLength(path), count = Math.max(1, Math.ceil(length2 / 3));
      let section = [];
      for (let i = 0; i < count; i++) {
        const a = sampleAt(path, length2 * i / count).point, b = sampleAt(path, length2 * (i + 1) / count).point, s = sampleAt(path, length2 * (i + 0.5) / count);
        const p = { x: s.point.x - s.tangent.z * offset, y: s.point.y ?? 0, z: s.point.z + s.tangent.x * offset };
        if (clearance.roadAt(p, 0.2, p.y - 0.15, p.y + 0.15, road.id)) {
          if (section.length > 1) paint(section);
          section = [];
          continue;
        }
        if (!section.length) section.push(a);
        section.push(b);
      }
      if (section.length > 1) paint(section);
    }
    ;
    if (road.markings !== false && !road.highwayTransition) {
      if (road.travelDirection === "two-way") {
        if (hasCentralBarrier(road)) {
          yield* line(points, -0.27);
          yield* line(points, 0.27);
        } else {
          yield* line(points, -0.13, true);
          yield* line(points, 0.13, true);
        }
      }
      yield* line(points, -half + 0.15);
      yield* line(points, half - 0.15);
      const length2 = polylineLength(points);
      const sample = roadCompileSampler(points);
      if (road.gore && road.shoulders && !this.map) {
        for (let d = 6; d < Math.min(road.gore.length, length2 / 2); d += 6) for (const start of [true, false]) {
          if (!(start ? road.gore.start : road.gore.end)) continue;
          const at = start ? d : length2 - d, s = sampleAt(points, at);
          const width = road.shoulders.left * Math.min(1, d / 30);
          const offset = -half - width / 2;
          const p = { x: s.point.x - s.tangent.z * offset, y: s.point.y, z: s.point.z + s.tangent.x * offset };
          if (this.clearance?.roadAt(p, 0, (p.y ?? 0) - 0.1, (p.y ?? 0) + 0.1, road.id)) continue;
          const a = { x: p.x + s.tangent.z * width / 2 - s.tangent.x * 0.5, y: p.y, z: p.z - s.tangent.x * width / 2 - s.tangent.z * 0.5 };
          const b = { x: p.x - s.tangent.z * width / 2 + s.tangent.x * 0.5, y: p.y, z: p.z + s.tangent.x * width / 2 + s.tangent.z * 0.5 };
          if (this.ownership && this.ownership.ownerAt(p)?.id !== road.id) continue;
          const hatch = makeMarkingRibbon("gore hatch", [a, b], 0.18, this.materials.whitePaint, () => 0, 8e-3);
          if (hatch) {
            hatch.userData.markingOwner = "merge";
            hatch.userData.markingSource = road.id;
            add(hatch);
          }
        }
      }
      for (let lane = 1; lane < road.laneCount; lane++) {
        if (road.travelDirection === "two-way" && lane === road.laneCount / 2) continue;
        for (let d = 0; d < length2; d += 9) {
          yield;
          const end = Math.min(d + 3, length2), path = [sample(d).point];
          for (let s = d + 0.75; s < end; s += 0.75) path.push(sample(s).point);
          path.push(sample(end).point);
          yield* line(path, -half + lane * road.laneWidth);
        }
      }
    }
    if (trace) {
      trace.phase = "sidewalk";
      yield;
    }
    if (continuous && !continuous.legacySidewalks(road)) continuous.sidewalks(root, road);
    else if (road.sidewalk?.enabled) for (const side of [-1, 1]) {
      const sections = [];
      let current = [];
      const flush = () => {
        if (current.length > 1) sections.push(current);
        current = [];
      };
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[Math.min(points.length - 1, i + 1)] ?? a, c = i === points.length - 1 ? points[i - 1] : a;
        const dx = b.x - c.x, dz = b.z - c.z, l = Math.hypot(dx, dz) || 1;
        const p = { x: a.x - dz / l * side * (half + 0.1), y: a.y ?? 0, z: a.z + dx / l * side * (half + 0.1) };
        if (mergePaint && this.clearance?.roadAt(p, 0.3, p.y - 0.2, p.y + 0.2, road.id)) {
          flush();
          continue;
        }
        current.push(a);
      }
      flush();
      const strip = (a, b, y, curb) => {
        for (const section of this.map ? [points] : sections) {
          const geometry2 = this.map ? roadEdgeStrip(road, this.map, Math.min(a, b), Math.max(a, b), y) : createStripGeometry(section, () => 0, { innerOffset: Math.min(a, b), outerOffset: Math.max(a, b), yOffset: y, maximumSpacing: 3 });
          if (geometry2) {
            const mesh = new Mesh6(this.map ? clipRoadJunctionPavement(geometry2, road, this.map, y, true) : geometry2, curb ? this.materials.curb : this.materials.sidewalk);
            mesh.name = curb ? "road curb" : "road sidewalk";
            mesh.receiveShadow = true;
            root.add(mesh);
          }
        }
      };
      strip(side * half, side * (half + road.sidewalk.width), 0.15, false);
      if (road.curb !== false) strip(side * half, side * (half + 0.22), 0.17, true);
    }
    const length = polylineLength(points), elevated = points.some((p) => (p.y ?? 0) > 2);
    if (trace) {
      trace.phase = "bridge";
      yield;
    }
    if (elevated) {
      if (continuous) continuous.deck(root, road);
      else {
        const bottom = this.map ? roadEdgeStrip(road, this.map, barrierOffset(road, -1), barrierOffset(road, 1), -0.65) : createStripGeometry(points, () => 0, { innerOffset: barrierOffset(road, -1), outerOffset: barrierOffset(road, 1), yOffset: -0.65, maximumSpacing: 3 });
        if (bottom) {
          const index = bottom.getIndex();
          for (let i = 0; i < index.count; i += 3) {
            const a = index.getX(i);
            index.setX(i, index.getX(i + 2));
            index.setX(i + 2, a);
          }
          bottom.computeVertexNormals();
          root.add(new Mesh6(bottom, this.materials.curb));
        }
        for (const section of yield* barrierSectionSteps(road, this.map, this.clearance)) yield* this.wallSteps(root, section.points, 0, -0.65, 0.024, this.materials.curb);
      }
      const piers = yield* roadPierSteps(road, this.map, this.clearance);
      if (piers.length) {
        const geometry2 = road.structure?.pierStyle === "rectangular" ? this.geometry("pier-rectangular", () => new BoxGeometry4(1.2, 1, 1.2)) : this.geometry("pier-round", () => new CylinderGeometry3(0.6, 0.6, 1, 8));
        const mesh = new InstancedMesh3(geometry2, this.materials.curb, piers.length), matrix = new Matrix43();
        mesh.name = `${road.id}:piers`;
        piers.forEach((pier, i) => {
          matrix.makeScale(1, pier.height, 1);
          matrix.setPosition(pier.position.x, pier.baseY + pier.height / 2, pier.position.z);
          mesh.setMatrixAt(i, matrix);
        });
        mesh.castShadow = true;
        root.add(mesh);
      }
    }
    if (trace) {
      trace.phase = "barrier";
      yield;
    }
    if (road.structure?.barrierEnabled === true || elevated && road.structure?.barrierEnabled !== false) for (const section of yield* barrierSectionSteps(road, this.map, this.clearance)) {
      const concrete = road.structure?.barrierStyle === "concrete" || road.travelDirection !== "two-way" && section.side === innerRoadSide(road) && road.structure?.medianBarrierStyle === "concrete";
      if (continuous) continuous.barrier(root, section.points, section.side, concrete, section.kind === "shared-median", () => this.geometry("continuous-guardrail-post", () => new BoxGeometry4(0.08, 1.05, 0.1)));
      else yield* this.wallSteps(root, section.points, 0, 0.024, 1.1, concrete ? this.materials.curb : this.materials.metal, "road barrier");
    }
    for (const section of yield* centralBarrierSectionSteps(road, this.map, this.clearance)) {
      if (continuous) {
        continuous.median(root, section);
        continue;
      }
      for (const side of [-0.12, 0.12]) yield* this.wallSteps(root, section, side, 0.024, 1.1, this.materials.curb, "road central barrier");
      const top = createStripGeometry(section, () => 0, { innerOffset: -0.12, outerOffset: 0.12, yOffset: 1.1, maximumSpacing: 3 });
      if (top) {
        const mesh = new Mesh6(top, this.materials.curb);
        mesh.name = "road central barrier";
        root.add(mesh);
      }
    }
    if (trace) {
      trace.phase = "enclosure";
      yield;
    }
    const enclosure = road.structure?.enclosure;
    if (enclosure) {
      const walls = yield* enclosureWallSectionSteps(road, this.map, this.clearance);
      for (const { side, points: wallPoints } of walls) {
        if (continuous) continuous.enclosureWall(root, road, wallPoints, side);
        else yield* this.wallSteps(root, wallPoints, enclosure.kind === "cutting" || this.map ? 0 : barrierOffset(road, side), 0, enclosure.kind === "cutting" ? (p) => retainingWallHeight(road, p, this.clearance) : enclosure.clearance, this.materials.wall);
      }
      if (enclosure.kind !== "cutting") {
        if (continuous) continuous.roof(root, road);
        else {
          const shell = [];
          for (const underside of [true, false]) {
            const y = enclosure.clearance + (underside ? 0 : 0.65);
            const roof2 = this.map ? roadEdgeStrip(road, this.map, edges.left - 0.3, edges.right + 0.3, y) : createStripGeometry(points, () => 0, { innerOffset: edges.left - 0.3, outerOffset: edges.right + 0.3, yOffset: y, maximumSpacing: 3 });
            if (roof2) {
              if (underside) {
                const index = roof2.getIndex();
                for (let i = 0; i < index.count; i += 3) {
                  const a = index.getX(i);
                  index.setX(i, index.getX(i + 2));
                  index.setX(i + 2, a);
                }
                roof2.computeVertexNormals();
              }
              shell.push(roof2);
            }
          }
          for (const end of ["start", "end"]) {
            const continued = this.map?.roadLinks?.some((l) => {
              const a = l.from.roadId === road.id && l.from.end === end ? l.to : l.to.roadId === road.id && l.to.end === end ? l.from : void 0;
              return a && this.map.roads.find((r) => r.id === a.roadId)?.structure?.enclosure?.kind === enclosure.kind;
            });
            if (continued) continue;
            const frame = sampleAt(points, end === "start" ? 0 : length), at = (offset, y) => [frame.point.x - frame.tangent.z * offset, (frame.point.y ?? 0) + y, frame.point.z + frame.tangent.x * offset];
            const fascia = new BufferGeometry10();
            fascia.setAttribute("position", new Float32BufferAttribute8([...at(edges.left - 0.3, enclosure.clearance), ...at(edges.right + 0.3, enclosure.clearance), ...at(edges.left - 0.3, enclosure.clearance + 0.65), ...at(edges.right + 0.3, enclosure.clearance + 0.65)], 3));
            fascia.setAttribute("uv", new Float32BufferAttribute8([0, 0, 1, 0, 0, 1, 1, 1], 2));
            fascia.setIndex(end === "start" ? [0, 1, 2, 1, 3, 2] : [0, 2, 1, 1, 2, 3]);
            fascia.computeVertexNormals();
            shell.push(fascia);
          }
          const roof = mergeGeometries3(shell);
          shell.forEach((g) => g.dispose());
          if (roof) {
            const mesh = new Mesh6(roof, this.materials.wall);
            mesh.name = "tunnel ceiling and portals";
            root.add(mesh);
          }
        }
        const count = Math.floor(length / 30), lights = new InstancedMesh3(this.geometry("tunnel-light", () => new BoxGeometry4(0.3, 0.08, 1.8)), this.materials.tunnelLight ?? this.materials.signalAmber, count * 2), matrix = new Matrix43();
        for (let i = 0; i < count; i++) for (let side = 0; side < 2; side++) {
          const s = sampleAt(points, 15 + i * 30), offset = (side ? 1 : -1) * half * 0.6;
          matrix.makeRotationY(Math.atan2(s.tangent.x, s.tangent.z));
          matrix.setPosition(s.point.x - s.tangent.z * offset, (s.point.y ?? 0) + enclosure.clearance - 0.06, s.point.z + s.tangent.x * offset);
          lights.setMatrixAt(i * 2 + side, matrix);
        }
        root.add(lights);
      }
    }
    if (trace) {
      trace.phase = "fixtures";
      yield;
    }
    if (road.streetlights) {
      const positions = [];
      if (this.map) for (const p of roadLampAnchors(road, this.map, this.clearance, (point, radius, height, roadId) => this.placement?.permits(point, radius, height, roadId) ?? true)) positions.push({ ...p, y: (p.y ?? 0) + 3.7 });
      else
        for (let d = 25; d < length - 20; d += 50) {
          const s = sampleAt(points, d), offset = edges.right + (road.sidewalk?.enabled ? road.sidewalk.width : 0) + 0.8;
          const p = { x: s.point.x - s.tangent.z * offset, y: s.point.y ?? 0, z: s.point.z + s.tangent.x * offset };
          if (this.clearance && !this.clearance.permitsProp(p, 0.4, 7.5)) continue;
          if (this.placement && !this.placement.permits(p, 0.4, 7.5)) continue;
          positions.push({ ...p, y: p.y + 3.7 });
        }
      if (positions.length) {
        const poles = new InstancedMesh3(this.geometry("lamp-pole", () => new CylinderGeometry3(0.08, 0.12, 7.4, 8)), this.materials.darkMetal, positions.length);
        const heads = new InstancedMesh3(this.geometry("lamp-head", () => new BoxGeometry4(0.5, 0.16, 0.85)), this.materials.lampHead, positions.length);
        heads.userData.environmentLamp = true;
        positions.forEach((p, i) => {
          const matrix = new Matrix43().makeTranslation(p.x, p.y, p.z);
          poles.setMatrixAt(i, matrix);
          matrix.setPosition(p.x, p.y + 3.5, p.z);
          heads.setMatrixAt(i, matrix);
        });
        root.add(poles, heads);
      }
    }
    if (road.id.startsWith("regional:") && road.laneCount > 1 && !road.structure?.enclosure) {
      const positions = [];
      for (const section of yield* barrierSectionSteps(road, this.map, this.clearance)) {
        const length2 = polylineLength(section.points);
        for (let d = 8; d < length2; d += 50) positions.push(sampleAt(section.points, d).point);
      }
      if (positions.length) {
        const bodies = new InstancedMesh3(this.geometry("reflector-body", () => new BoxGeometry4(0.12, 0.85, 0.12)), this.materials.curb, positions.length);
        const caps = new InstancedMesh3(this.geometry("reflector-cap", () => new BoxGeometry4(0.14, 0.16, 0.14)), this.materials.whitePaint, positions.length);
        positions.forEach((p, i) => {
          const m = new Matrix43().makeTranslation(p.x, (p.y ?? 0) + 0.55, p.z);
          bodies.setMatrixAt(i, m);
          m.setPosition(p.x, (p.y ?? 0) + 1, p.z);
          caps.setMatrixAt(i, m);
        });
        bodies.name = "highway reflector posts";
        caps.name = "highway reflector caps";
        root.add(bodies, caps);
      }
    }
    if (trace) {
      trace.phase = "projection";
      yield;
    }
    if (continuous && pavement) yield* continuous.finishRoadSteps(root, road, pavement);
    return root;
  }
  *wallSteps(root, points, offset, bottom, top, material, name) {
    const positions = [], indices = [];
    const fine = sampleRibbonPolyline(points, 3);
    for (let i = 0; i < fine.length; i++) {
      if (i % 128 === 0) yield;
      const s = fine[i], x = s.point.x - s.tangent.z * offset, z = s.point.z + s.tangent.x * offset;
      positions.push(x, (s.point.y ?? 0) + bottom, z, x, (s.point.y ?? 0) + (typeof top === "number" ? top : top({ x, y: s.point.y, z })), z);
      if (i < fine.length - 1) {
        const b = i * 2;
        indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2, b + 2, b + 1, b, b + 2, b + 3, b + 1);
      }
    }
    const geometry2 = new BufferGeometry10();
    geometry2.setAttribute("position", new Float32BufferAttribute8(positions, 3));
    geometry2.setIndex(indices);
    const faces = geometry2.toNonIndexed();
    geometry2.dispose();
    faces.computeVertexNormals();
    const mesh = new Mesh6(faces, material);
    mesh.name = name ?? (material === this.materials.metal ? "road barrier" : material === this.materials.wall ? "retaining wall" : "bridge skirt");
    root.add(mesh);
  }
};

// src/world/city/IntersectionBuilder.ts
import { Group as Group10, Mesh as Mesh9, PlaneGeometry as PlaneGeometry2, BufferGeometry as BufferGeometry12, Float32BufferAttribute as Float32BufferAttribute9 } from "three";

// src/world/subject3/trafficSignals.ts
import * as THREE4 from "three";

// src/world/subject3/math.ts
import * as THREE3 from "three";

// src/world/subject3/trafficSignals.ts
var disposeMaterial = (material) => {
  for (const value of Object.values(material)) {
    if (value instanceof THREE4.Texture) value.dispose();
  }
  material.dispose();
};
var armControlKind = (outward) => Math.abs(outward.x) >= Math.abs(outward.z) ? "east-west" : "north-south";
var Subject3TrafficSignals = class {
  root = new THREE4.Group();
  heads = [];
  timing;
  cycleSeconds;
  offsets;
  elapsedSeconds = 0;
  constructor(junctionCount, offsets, timing) {
    this.root.name = "Subject 3 traffic signals";
    this.root.userData.renderCategory = "WORLD";
    this.root.userData.gameplayLogic = false;
    this.timing = timing;
    this.cycleSeconds = (timing.greenSeconds + timing.amberSeconds) * 2 + timing.allRedSeconds * 2;
    this.offsets = Array.from({ length: junctionCount }, (_, index) => offsets[index] ?? 0);
    this.update(0);
  }
  addHead(junctionIndex, arm, center, yawRadians, materials, shadows, headHeight) {
    const head = this.buildHead(junctionIndex, arm, center, yawRadians, materials, shadows, headHeight);
    this.heads.push(head);
    this.root.add(head.root);
    this.applyHeadState(head);
  }
  update(deltaSeconds) {
    if (Number.isFinite(deltaSeconds) && deltaSeconds > 0) this.elapsedSeconds += deltaSeconds;
    for (const head of this.heads) this.applyHeadState(head);
  }
  getStateForJunction(junctionIndex) {
    const offset = this.offsets[junctionIndex] ?? 0;
    const local = ((this.elapsedSeconds + offset) % this.cycleSeconds + this.cycleSeconds) % this.cycleSeconds;
    const { greenSeconds, amberSeconds, allRedSeconds } = this.timing;
    const northSouthGreenEnd = greenSeconds;
    const northSouthAmberEnd = northSouthGreenEnd + amberSeconds;
    const firstAllRedEnd = northSouthAmberEnd + allRedSeconds;
    const eastWestGreenEnd = firstAllRedEnd + greenSeconds;
    const eastWestAmberEnd = eastWestGreenEnd + amberSeconds;
    if (local < northSouthGreenEnd) {
      return {
        phase: "north-south-green",
        quadrant: "north-south",
        color: "green",
        secondsInPhase: local,
        secondsRemaining: northSouthGreenEnd - local
      };
    }
    if (local < northSouthAmberEnd) {
      return {
        phase: "north-south-amber",
        quadrant: "north-south",
        color: "amber",
        secondsInPhase: local - northSouthGreenEnd,
        secondsRemaining: northSouthAmberEnd - local
      };
    }
    if (local < firstAllRedEnd) {
      return {
        phase: "all-red",
        quadrant: "none",
        color: "red",
        secondsInPhase: local - northSouthAmberEnd,
        secondsRemaining: firstAllRedEnd - local
      };
    }
    if (local < eastWestGreenEnd) {
      return {
        phase: "east-west-green",
        quadrant: "east-west",
        color: "green",
        secondsInPhase: local - firstAllRedEnd,
        secondsRemaining: eastWestGreenEnd - local
      };
    }
    if (local < eastWestAmberEnd) {
      return {
        phase: "east-west-amber",
        quadrant: "east-west",
        color: "amber",
        secondsInPhase: local - eastWestGreenEnd,
        secondsRemaining: eastWestAmberEnd - local
      };
    }
    return {
      phase: "all-red",
      quadrant: "none",
      color: "red",
      secondsInPhase: local - eastWestAmberEnd,
      secondsRemaining: this.cycleSeconds - local
    };
  }
  /** Colour shown by the head facing the supplied approach direction. */
  getColorForApproach(junctionIndex, controlKind) {
    const state = this.getStateForJunction(junctionIndex);
    if (state.quadrant === "none" || state.quadrant !== controlKind) return "red";
    return state.color;
  }
  getCycleSeconds() {
    return this.cycleSeconds;
  }
  /** Shared simulation clock for specialized map signal presentations. */
  get clockSeconds() {
    return this.elapsedSeconds;
  }
  getHeadCount() {
    return this.heads.length;
  }
  /** Sector unloading: release only this junction's geometry and private lamps. */
  removeHeadsForJunction(junctionIndex, owner) {
    for (let i = this.heads.length - 1; i >= 0; i -= 1) {
      const head = this.heads[i];
      if (head.junctionIndex !== junctionIndex) continue;
      if (owner && head.root.parent !== owner) continue;
      head.root.removeFromParent();
      head.root.traverse((object) => {
        if (object instanceof THREE4.Mesh) object.geometry.dispose();
      });
      for (const lamp of Object.values(head.lamps)) lamp.material.dispose();
      this.heads.splice(i, 1);
    }
  }
  dispose() {
    const geometries = /* @__PURE__ */ new Set();
    const materials = /* @__PURE__ */ new Set();
    this.root.traverse((object) => {
      if (!(object instanceof THREE4.Mesh)) return;
      geometries.add(object.geometry);
      const list = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of list) materials.add(material);
    });
    for (const geometry2 of geometries) geometry2.dispose();
    for (const material of materials) disposeMaterial(material);
    this.root.clear();
    this.heads.length = 0;
  }
  applyHeadState(head) {
    const color = this.getColorForApproach(head.junctionIndex, head.controlKind);
    for (const key of ["red", "amber", "green"]) {
      const material = head.lamps[key].material;
      const bright = key === "red" ? 16726832 : key === "amber" ? 16756768 : 3134057;
      const dark = key === "red" ? 3478293 : key === "amber" ? 3680786 : 1191970;
      material.color.setHex(key === color ? bright : dark);
      material.opacity = 1;
      material.transparent = false;
    }
  }
  buildHead(junctionIndex, arm, center, yawRadians, materials, shadows, headHeight) {
    const root = new THREE4.Group();
    root.name = `Traffic signal ${arm.segmentId}`;
    root.userData.subject3JunctionIndex = junctionIndex;
    root.position.set(center.x, 0, center.z);
    root.rotation.y = yawRadians;
    const pole = new THREE4.Mesh(
      new THREE4.CylinderGeometry(0.075, 0.11, headHeight, 10),
      materials.darkMetal
    );
    pole.position.y = headHeight * 0.5;
    pole.castShadow = shadows;
    root.add(pole);
    root.add(makeBox(
      "Signal cantilever",
      [2.05, 0.12, 0.12],
      [0.95, headHeight - 0.25, 0],
      materials.darkMetal,
      shadows
    ));
    root.add(makeBox(
      "Signal head housing",
      [0.54, 1.5, 0.3],
      [1.8, headHeight - 0.6, -0.2],
      materials.darkMetal,
      shadows
    ));
    const lampY = {
      red: headHeight + 0.02,
      amber: headHeight - 0.5,
      green: headHeight - 1.02
    };
    const lamps = {};
    for (const key of ["red", "amber", "green"]) {
      const base = key === "red" ? materials.signalRed : key === "amber" ? materials.signalAmber : materials.signalGreen;
      const disc = new THREE4.Mesh(
        new THREE4.CylinderGeometry(0.17, 0.17, 0.1, 14),
        base.clone()
      );
      disc.name = `Signal lamp ${key}`;
      disc.rotation.x = Math.PI * 0.5;
      disc.position.set(1.8, lampY[key], -0.36);
      root.add(disc);
      lamps[key] = disc;
      root.add(makeBox(
        `Signal visor ${key}`,
        [0.44, 0.07, 0.34],
        [1.8, lampY[key] + 0.17, -0.22],
        materials.darkMetal,
        shadows
      ));
    }
    return {
      junctionIndex,
      controlKind: arm.controlKind,
      root,
      lamps
    };
  }
};

// src/world/city/CityTrafficSignals.ts
import { CylinderGeometry as CylinderGeometry6, Mesh as Mesh8 } from "three";

// src/world/city/SignalPlacement.ts
function approachPaintOffsets(map, j, mouth, outward) {
  let boundaryOffset = 0.8;
  while (boundaryOffset < 30 && junctionSurfaceContains(j, map, { x: mouth.x + outward.x * boundaryOffset, y: mouth.y, z: mouth.z + outward.z * boundaryOffset }, 0.15)) boundaryOffset += 0.4;
  return { boundaryOffset, crossOffset: boundaryOffset + 2.2, stopOffset: boundaryOffset + 4.4, paintApproach: boundaryOffset < 30 };
}
function findSignalPole(map, j, outward, right, h, width, height, origin = j.position) {
  const clearance = runtimeRoadClearance(map), base = Math.min(0, j.position.y ?? 0);
  for (const side of [-1, 1]) for (const extra of [1, 4, 8, 14]) for (let lateral = width / 2 + 1; lateral <= width / 2 + 24; lateral += 1) {
    const p = { x: origin.x + side * outward.x * (h + extra) + right.x * lateral, y: base, z: origin.z + side * outward.z * (h + extra) + right.z * lateral };
    if (!clearance.roadAt(p, 0.55, base - 0.2, (j.position.y ?? 0) + height + 0.5, void 0, void 0, true) && !clearance.junctionAt(p, 0.55, base - 0.2, (j.position.y ?? 0) + height + 0.5)) return p;
  }
  throw new Error("No signal pole clear of traffic at " + j.id);
}

// src/world/city/CitySignalVisual.ts
import { BoxGeometry as BoxGeometry5, CircleGeometry as CircleGeometry2, Color as Color2, CylinderGeometry as CylinderGeometry5, Group as Group8, InstancedMesh as InstancedMesh4, Matrix4 as Matrix44, MeshBasicMaterial as MeshBasicMaterial3, Shape as Shape3, ShapeGeometry } from "three";
var BITS = [63, 6, 91, 79, 102, 109, 125, 7, 127, 111];
var BRIGHT = { red: 16728117, amber: 16760360, green: 3731320 };
var DARK = { red: 1051403, amber: 1052169, green: 593931 };
var CitySignalVisualResources = class {
  box = new BoxGeometry5(1, 1, 1);
  pole = new CylinderGeometry5(1, 1, 1, 8);
  light = new MeshBasicMaterial3({ color: 16777215, toneMapped: false });
  arrows = /* @__PURE__ */ new Map();
  circle = new CircleGeometry2(0.25, 24).rotateY(Math.PI);
  color = new Color2();
  constructor() {
    const shape = new Shape3();
    shape.moveTo(-0.055, -0.18);
    shape.lineTo(0.055, -0.18);
    shape.lineTo(0.055, 0.035);
    shape.lineTo(0.14, 0.035);
    shape.lineTo(0, 0.2);
    shape.lineTo(-0.14, 0.035);
    shape.lineTo(-0.055, 0.035);
    shape.closePath();
    for (const movement of ["straight", "left", "right"]) {
      const geometry2 = new ShapeGeometry(shape);
      if (movement !== "straight") geometry2.rotateZ(movement === "left" ? Math.PI / 2 : -Math.PI / 2);
      geometry2.rotateY(Math.PI);
      this.arrows.set(movement, geometry2);
    }
  }
  build(index, panels, height, groundDrop, materials) {
    const root = new Group8();
    root.name = "City lane signals";
    root.userData.subject3JunctionIndex = index;
    root.userData.citySignalProfile = "lane-countdown";
    const matrices = [];
    const box = (w, h, d, x, y, z) => matrices.push(new Matrix44().makeScale(w, h, d).setPosition(x, y, z));
    const left = Math.min(0, ...panels.map((p) => p.x - 0.52)), right = Math.max(0, ...panels.map((p) => p.x + 0.52));
    box(right - left, 0.18, 0.2, (right + left) / 2, height + 0.12, 0);
    for (const p of panels) {
      box(0.88, 2.15, 0.36, p.x, height - 1.02, -0.18);
      box(0.88, 0.66, 0.24, p.x, height + 0.61, -0.18);
      for (let n = 0; n < 3; n++) box(0.92, 0.06, 0.5, p.x, height - 0.02 - n * 0.66, -0.25);
    }
    const staticParts = new InstancedMesh4(this.box, materials.darkMetal, matrices.length);
    matrices.forEach((m, i) => staticParts.setMatrixAt(i, m));
    staticParts.castShadow = true;
    root.add(staticParts);
    const poles = new InstancedMesh4(this.pole, materials.darkMetal, 1);
    poles.setMatrixAt(0, new Matrix44().makeScale(0.13, height + groundDrop + 0.3, 0.13).setPosition(0, (height - groundDrop + 0.3) / 2, 0));
    poles.castShadow = true;
    root.add(poles);
    const glyphs = [];
    for (const movement of ["straight", "left", "right", "circle"]) {
      const selected = panels.map((p, i) => ({ p, i })).filter(({ p }) => movement === "circle" ? p.circular : !p.circular && (p.movements ?? [p.movement]).includes(movement));
      if (!selected.length) continue;
      const mesh = new InstancedMesh4(movement === "circle" ? this.circle : this.arrows.get(movement), this.light, selected.length * 3);
      mesh.name = "Signal " + movement + " arrows";
      let serial = 0;
      for (const { p, i } of selected) for (const [n, color] of ["red", "amber", "green"].entries()) {
        const combined = !p.circular && (p.movements?.length ?? 1) > 1, part = p.movements?.indexOf(movement) ?? 0, scale = combined ? 1.08 : p.circular ? 1 : 1.7;
        mesh.setMatrixAt(serial, new Matrix44().makeScale(scale, scale, 1).setPosition(p.x + (combined ? (0.5 - part) * 0.36 : 0), height - 0.38 - n * 0.66, -0.38));
        glyphs.push({ mesh, index: serial++, panel: i, color });
      }
      root.add(mesh);
    }
    const digits = new InstancedMesh4(this.box, this.light, panels.length * 14);
    digits.name = "Signal countdown segments";
    const locations = [[0, 0.23, true], [0.13, 0.115, false], [0.13, -0.115, false], [0, -0.23, true], [-0.13, -0.115, false], [-0.13, 0.115, false], [0, 0, true]];
    panels.forEach((p, i) => {
      for (let digit = 0; digit < 2; digit++) locations.forEach(([x, y, horizontal], segment) => digits.setMatrixAt(i * 14 + digit * 7 + segment, new Matrix44().makeScale(horizontal ? 0.22 : 0.05, horizontal ? 0.05 : 0.19, 0.025).setPosition(p.x - (digit === 0 ? -0.19 : 0.19) - x, height + 0.61 + y, -0.32)));
    });
    root.add(digits);
    root.userData.signalPanels = panels;
    root.userData.signalLowestHeight = height - 2.095;
    root.traverse((o) => {
      if (o instanceof InstancedMesh4) o.computeBoundingSphere();
    });
    return { root, panels, glyphs, digits, lastKey: "" };
  }
  update(visual, states) {
    const key = states.map((s) => s.color + Math.ceil(s.seconds)).join("|");
    if (key === visual.lastKey) return;
    visual.lastKey = key;
    for (const glyph of visual.glyphs) {
      const state = states[glyph.panel];
      this.color.setHex(state.color === glyph.color ? BRIGHT[glyph.color] : DARK[glyph.color]);
      glyph.mesh.setColorAt(glyph.index, this.color);
      if (glyph.mesh.instanceColor) glyph.mesh.instanceColor.needsUpdate = true;
    }
    states.forEach((state, i) => {
      const seconds = Math.max(0, Math.ceil(state.seconds)), masks = seconds > 99 ? [64, 64] : [BITS[Math.floor(seconds / 10)], BITS[seconds % 10]];
      for (let digit = 0; digit < 2; digit++) for (let segment = 0; segment < 7; segment++) {
        this.color.setHex(masks[digit] & 1 << segment ? BRIGHT[state.color] : 725780);
        visual.digits.setColorAt(i * 14 + digit * 7 + segment, this.color);
      }
    });
    if (visual.digits.instanceColor) visual.digits.instanceColor.needsUpdate = true;
  }
  release(visual) {
    visual.root.removeFromParent();
    visual.root.traverse((o) => {
      if (o instanceof InstancedMesh4) o.dispose();
    });
  }
  dispose() {
    this.box.dispose();
    this.pole.dispose();
    this.circle.dispose();
    for (const g of this.arrows.values()) g.dispose();
    this.light.dispose();
  }
};

// src/world/city/CityTrafficSignals.ts
var CityTrafficSignals = class extends Subject3TrafficSignals {
  constructor(map) {
    super(map.intersections.length, map.intersections.map((j) => j.signals?.offsetSeconds ?? 0), { greenSeconds: 25, amberSeconds: 3, allRedSeconds: 2 });
    this.map = map;
    for (const [index, j] of map.intersections.entries()) {
      this.indices.set(j.id, index);
      if (!j.signalized) continue;
      const lanes = [];
      for (const c of j.connections) {
        const r = map.roads.find((r2) => r2.id === c.roadId);
        if (r.travelDirection !== "two-way" && r.travelDirection === "forward" !== (c.end === "end")) continue;
        const count = r.travelDirection === "two-way" ? r.laneCount / 2 : r.laneCount;
        for (let lane = 0; lane < count; lane++) {
          const movement = j.approaches?.[c.port]?.lanes[lane] ?? (count === 1 ? "straight" : lane === 0 ? "straight-left" : lane === count - 1 ? "straight-right" : "straight");
          const logical = r.travelDirection === "two-way" ? c.end === "end" ? count + lane : count - 1 - lane : r.travelDirection === "reverse" ? count - 1 - lane : lane;
          const data = { junction: index, roadId: r.id, laneId: `${r.id}:lane:${logical}`, index: lane, axis: armControlKind(portDirection(j, c.port)), movements: movement.split("-") };
          lanes.push(data);
          this.lanes.set(data.laneId, data);
        }
      }
      const stages = [];
      if (j.signals?.profile === "lane-countdown") for (const axis of ["north-south", "east-west"]) for (const group of ["through", "left"]) {
        if (!lanes.some((l) => l.axis === axis && l.movements.some((m) => m !== "right" && m === "left" === (group === "left")))) continue;
        for (const color of ["green", "amber", "red"]) stages.push({ id: `${axis}-${group}-${color === "red" ? "clear" : color}`, axis, group, color, duration: color === "green" ? group === "left" ? j.signals.leftGreenSeconds ?? 8 : j.signals.throughGreenSeconds ?? 22 : color === "amber" ? j.signals.amberSeconds ?? 3 : j.signals.allRedSeconds ?? 2 });
      }
      this.plans.set(index, { junction: j, lanes, stages, cycle: stages.reduce((n, s) => n + s.duration, 0) });
    }
  }
  map;
  plans = /* @__PURE__ */ new Map();
  lanes = /* @__PURE__ */ new Map();
  indices = /* @__PURE__ */ new Map();
  advancedHeads = [];
  resources;
  lastTick = -1;
  phase(plan) {
    let local = ((this.clockSeconds + (plan.junction.signals?.offsetSeconds ?? 0)) % plan.cycle + plan.cycle) % plan.cycle;
    for (let i = 0; i < plan.stages.length; i++) {
      const stage = plan.stages[i];
      if (local < stage.duration) return { stage, elapsed: local, remaining: stage.duration - local, index: i };
      local -= stage.duration;
    }
    throw new Error("Empty City signal plan " + plan.junction.id);
  }
  movementState(lane, movement, phase) {
    if (movement === "right") return { movement, signalControlled: false, color: "green", permitted: true, secondsToGreen: 0, secondsToChange: 0 };
    const plan = this.plans.get(lane.junction);
    if (!plan.stages.length) {
      const state = super.getStateForJunction(lane.junction), color2 = super.getColorForApproach(lane.junction, lane.axis);
      const local = ((this.clockSeconds + (plan.junction.signals?.offsetSeconds ?? 0)) % 60 + 60) % 60, start = lane.axis === "north-south" ? 0 : 30;
      const until2 = color2 === "green" ? 0 : (start - local + 60) % 60;
      return { movement, color: color2, permitted: color2 === "green", secondsToGreen: until2, secondsToChange: color2 === "red" ? until2 : state.secondsRemaining };
    }
    const current = phase ?? this.phase(plan), matches = (stage) => stage.axis === lane.axis && stage.group === "left" === (movement === "left");
    const color = matches(current.stage) ? current.stage.color : "red";
    let until = 0;
    if (color !== "green") {
      until = current.remaining;
      for (let n = 1; n <= plan.stages.length; n++) {
        const stage = plan.stages[(current.index + n) % plan.stages.length];
        if (matches(stage) && stage.color === "green") break;
        until += stage.duration;
      }
    }
    return { movement, color, permitted: color === "green", secondsToGreen: until, secondsToChange: color === "red" ? until : current.remaining };
  }
  getLaneSignal(laneId) {
    const lane = this.lanes.get(laneId);
    if (!lane) return void 0;
    return { junctionId: this.map.intersections[lane.junction].id, roadId: lane.roadId, laneId, approachLaneIndex: lane.index, movements: lane.movements.map((m) => this.movementState(lane, m)) };
  }
  getJunctionSignal(junctionId) {
    const index = this.indices.get(junctionId), plan = index === void 0 ? void 0 : this.plans.get(index);
    if (!plan) return void 0;
    const legacy = super.getStateForJunction(index), advanced = plan.stages.length ? this.phase(plan) : void 0;
    return { junctionId, profile: advanced ? "lane-countdown" : "standard", phaseId: advanced?.stage.id ?? legacy.phase, secondsInPhase: advanced?.elapsed ?? legacy.secondsInPhase, secondsRemaining: advanced?.remaining ?? legacy.secondsRemaining, cycleSeconds: advanced ? plan.cycle : super.getCycleSeconds(), lanes: plan.lanes.map((l) => this.getLaneSignal(l.laneId)) };
  }
  getStateForJunction(index) {
    const plan = this.plans?.get(index);
    if (!plan?.stages.length) return super.getStateForJunction(index);
    const p = this.phase(plan), color = p.stage.color, axis = p.stage.axis;
    return { phase: color === "red" ? "all-red" : `${axis}-${color}`, quadrant: color === "red" ? "none" : axis, color, secondsInPhase: p.elapsed, secondsRemaining: p.remaining };
  }
  /** Ground-founded poles are rejected if they cut ANY carriageway below them. */
  placePole(index, outward, right, h, width, height, origin) {
    return findSignalPole(this.map, this.map.intersections[index], outward, right, h, width, height, origin);
  }
  addHead(index, arm, center, yaw, materials, shadows, height) {
    const plan = this.plans.get(index);
    if (!plan?.junction.signals?.profile) {
      super.addHead(index, arm, center, yaw, materials, shadows, height);
      const drop = plan?.junction.signals?.profile ? Math.max(0, plan.junction.position.y ?? 0) : 0;
      if (drop) {
        const extension = new Mesh8(new CylinderGeometry6(0.11, 0.15, drop, 8), materials.darkMetal);
        extension.position.y = -drop / 2;
        this.root.children.at(-1).add(extension);
      }
      return;
    }
    const c = plan.junction.connections.find((c2) => c2.roadId === arm.segmentId), r = this.map.roads.find((r2) => r2.id === arm.segmentId), mouth = r.centerline[c.end === "start" ? 0 : r.centerline.length - 1];
    const lanes = plan.lanes.filter((l) => l.roadId === arm.segmentId), lateral = (center.x - mouth.x) * arm.right.x + (center.z - mouth.z) * arm.right.z;
    const road = this.map.roads.find((r2) => r2.id === arm.segmentId), twoWay = road.travelDirection === "two-way", panels = [];
    if (!lanes.length) return;
    height = Math.max(7.2, height);
    for (const lane of lanes) {
      const offset = twoWay ? (lane.index + 0.5) * arm.approachLaneWidth : -arm.roadWidth / 2 + (lane.index + 0.5) * arm.approachLaneWidth;
      const controlled = lane.movements.filter((m) => m !== "right");
      const groups = plan.stages.length ? [controlled.filter((m) => m === "left"), controlled.filter((m) => m === "straight")].filter((g) => g.length) : controlled.length ? [controlled] : [];
      groups.forEach((movements, i) => panels.push({ laneId: lane.laneId, movement: movements[0], movements, circular: !plan.stages.length, x: lateral - offset + ((groups.length - 1) / 2 - i) * 1.12 }));
    }
    if (!panels.length) return;
    this.resources ??= new CitySignalVisualResources();
    const visual = this.resources.build(index, panels, height, Math.max(0, plan.junction.position.y ?? 0), materials);
    visual.root.position.set(center.x, 0, center.z);
    visual.root.rotation.y = yaw;
    visual.root.userData.approachRoadId = road.id;
    visual.root.userData.signalFacing = { ...arm.outward };
    this.advancedHeads.push({ index, visual });
    this.root.add(visual.root);
    this.updateVisual(index, visual);
  }
  updateVisual(index, visual) {
    const plan = this.plans.get(index), phase = plan.stages.length ? this.phase(plan) : void 0;
    this.resources.update(visual, visual.panels.map((p) => {
      const state = this.movementState(this.lanes.get(p.laneId), p.movement, phase);
      return { color: state.color, seconds: state.secondsToChange };
    }));
  }
  update(dt) {
    super.update(dt);
    if (!this.advancedHeads) return;
    const tick = Math.floor(this.clockSeconds * 10);
    if (tick === this.lastTick) return;
    this.lastTick = tick;
    for (const head of this.advancedHeads) this.updateVisual(head.index, head.visual);
  }
  getHeadCount() {
    return super.getHeadCount() + (this.advancedHeads?.length ?? 0);
  }
  removeHeadsForJunction(index, owner) {
    super.removeHeadsForJunction(index, owner);
    for (let i = this.advancedHeads.length - 1; i >= 0; i--) {
      const head = this.advancedHeads[i];
      if (head.index === index && (!owner || head.visual.root.parent === owner)) {
        this.resources.release(head.visual);
        this.advancedHeads.splice(i, 1);
      }
    }
  }
  dispose() {
    for (const head of this.advancedHeads) this.resources.release(head.visual);
    this.advancedHeads.length = 0;
    super.dispose();
    this.resources?.dispose();
  }
};

// src/world/city/IntersectionBuilder.ts
var IntersectionBuilder = class {
  constructor(map, materials, trial) {
    this.map = map;
    this.materials = materials;
    this.trial = trial ? new RoadGeometryTrial(map, materials, trial) : void 0;
  }
  map;
  materials;
  trial;
  build(j, signals, index = 0) {
    return drain(this.buildSteps(j, signals, index));
  }
  *buildSteps(j, signals, index = 0) {
    const root = new Group10(), h = junctionExtent(j, this.map);
    root.name = j.id;
    root.position.set(j.position.x, j.position.y ?? 0, j.position.z);
    root.rotation.y = j.rotation;
    const outline = j.pavementFootprint;
    const continuous = this.trial?.enabledIntersection(j) ? this.trial : void 0;
    let pavement = new PlaneGeometry2(h * 2, h * 2);
    if (outline) {
      pavement.dispose();
      pavement = new BufferGeometry12();
      pavement.setAttribute("position", new Float32BufferAttribute9([0, 0, 0, ...outline.flatMap((p) => [p.x, p.y ?? 0, p.z])], 3));
      pavement.setIndex(outline.flatMap((_, i) => [0, (i + 1) % outline.length + 1, i + 1]));
      pavement.computeVertexNormals();
    }
    if (continuous && outline) {
      pavement.dispose();
      pavement = continuous.junctionPavement(j);
    }
    const asphalt = new Mesh9(pavement, this.materials.asphalt);
    asphalt.name = "junction pavement";
    asphalt.userData.pavementOwner = j.id;
    asphalt.rotation.x = outline ? 0 : -Math.PI / 2;
    asphalt.position.y = continuous && outline ? 0 : 0.024;
    asphalt.receiveShadow = true;
    root.add(asphalt);
    if (j.channelized) for (const sign of [-1, 1]) root.add(makeBox("channelization island", [2, 0.18, 2], [sign * (h - 2.5), 0.09, sign * (h - 2.5)], this.materials.curb, true));
    const paint = (x, z, yaw, width, depth, role, port) => {
      const paintHeight = (x2, z2) => {
        const q = rotatePoint({ x: x2, z: z2 }, j.rotation);
        return junctionSurfaceHeight(j, { x: j.position.x + q.x, z: j.position.z + q.z }) - (j.position.y ?? 0);
      };
      const mesh = makeMarkingRectangle(role, { x, z }, yaw, width, depth, this.materials.whitePaint, paintHeight, 8e-3);
      if (mesh) {
        mesh.userData.markingOwner = "intersection";
        mesh.userData.markingSource = j.id;
        mesh.userData.markingRole = role;
        mesh.userData.approachPort = port;
        root.add(mesh);
      }
    };
    const crosswalkBoxes = [];
    const crosswalkOverlaps = (a, b) => {
      const axes = [a.right, { x: -a.right.z, z: a.right.x }, b.right, { x: -b.right.z, z: b.right.x }];
      const dx = b.x - a.x, dz = b.z - a.z;
      for (const axis of axes) {
        const ra = Math.abs(axis.x * a.right.x + axis.z * a.right.z) * a.width / 2 + Math.abs(axis.x * -a.right.z + axis.z * a.right.x) * 1.5;
        const rb = Math.abs(axis.x * b.right.x + axis.z * b.right.z) * b.width / 2 + Math.abs(axis.x * -b.right.z + axis.z * b.right.x) * 1.5;
        if (Math.abs(dx * axis.x + dz * axis.z) > ra + rb) return false;
      }
      return true;
    };
    for (const port of portsFor(j)) {
      yield;
      const c = j.connections.find((c2) => c2.port === port), r = this.map.roads.find((r2) => r2.id === c?.roadId);
      if (!c || !r) continue;
      const path = roadPoints(r), start = c.end === "start", endpoint = start ? path[0] : path.at(-1), neighbour = start ? path[1] ?? path[0] : path.at(-2) ?? path.at(-1);
      const ox = neighbour.x - endpoint.x, oz = neighbour.z - endpoint.z, ol = Math.hypot(ox, oz) || 1;
      const d = rotatePoint({ x: ox / ol, z: oz / ol }, -j.rotation), right = { x: d.z, z: -d.x }, yaw = Math.atan2(d.x, d.z);
      const h2 = junctionApproachExtent(j, this.map, port);
      const localMouth = j.approachOffsets?.[port] ?? rotatePoint({ x: endpoint.x - j.position.x, z: endpoint.z - j.position.z }, -j.rotation);
      const mouthWorld = rotatePoint(localMouth, j.rotation), outwardWorld = rotatePoint(d, j.rotation);
      const { paintApproach, crossOffset, stopOffset } = approachPaintOffsets(this.map, j, { x: j.position.x + mouthWorld.x, y: j.position.y, z: j.position.z + mouthWorld.z }, outwardWorld);
      const width = r ? r.laneCount * r.laneWidth : INTERSECTION_LANES[j.type] * 3.5;
      const laneWidth = r?.laneWidth ?? 3.5;
      const laneCount = r?.laneCount ?? INTERSECTION_LANES[j.type];
      const incoming = !r || r.travelDirection === "two-way" || r.travelDirection === "forward" === (c?.end === "end");
      const crosswalk = { x: localMouth.x + d.x * crossOffset, z: localMouth.z + d.z * crossOffset, right, width };
      const drawCrosswalk = j.signalized && paintApproach && !crosswalkBoxes.some((box) => crosswalkOverlaps(crosswalk, box));
      if (drawCrosswalk) crosswalkBoxes.push(crosswalk);
      if (drawCrosswalk) for (let offset = -width / 2 + 0.6; offset < width / 2; offset += 1.15) paint(crosswalk.x + right.x * offset, crosswalk.z + right.z * offset, yaw, 0.55, 3, "crosswalk", port);
      if (incoming && r && c) {
        const twoWay = !r || r.travelDirection === "two-way", approachWidth = twoWay ? width / 2 : width;
        const lateral = twoWay ? width / 4 : 0;
        if (j.signalized && paintApproach) paint(localMouth.x + d.x * stopOffset + right.x * lateral, localMouth.z + d.z * stopOffset + right.z * lateral, yaw, approachWidth - 0.25, 0.35, "stop line", port);
        const count = twoWay ? laneCount / 2 : laneCount;
        const approach = j.approaches?.[port];
        for (let lane = 0; lane < Math.min(count, approach?.lanes.length ?? 0); lane++) {
          const offset = twoWay ? (lane + 0.5) * laneWidth : -width / 2 + (lane + 0.5) * laneWidth;
          if (polylineLength(roadPoints(r)) < (approach?.arrowDistance ?? 30) + 5) continue;
          const path2 = roadPoints(r);
          if (c.end === "end") path2.reverse();
          const s = sampleAt(path2, (approach?.arrowDistance ?? 30) - 1);
          const local = rotatePoint({ x: s.point.x - j.position.x + s.tangent.z * offset, z: s.point.z - j.position.z - s.tangent.x * offset }, -j.rotation), world = rotatePoint(local, j.rotation);
          const tangent = rotatePoint(s.tangent, -j.rotation), arrowYaw = Math.atan2(tangent.x, tangent.z);
          if (this.map.intersections.some((other) => other.id !== j.id && insideIntersectionMarkingFootprint(other, this.map, { x: j.position.x + world.x, y: j.position.y, z: j.position.z + world.z }, 2))) continue;
          const arrowHeight = (x, z) => {
            if (!outline) return 0;
            const q = rotatePoint({ x, z }, j.rotation), world2 = { x: j.position.x + q.x, z: j.position.z + q.z }, points = roadPoints(r);
            let best = Infinity, y = j.position.y ?? 0;
            for (let i = 1; i < points.length; i++) {
              const a = points[i - 1], b = points[i], dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((world2.x - a.x) * dx + (world2.z - a.z) * dz) / (dx * dx + dz * dz))), gap = Math.hypot(world2.x - a.x - dx * t, world2.z - a.z - dz * t);
              if (gap < best) {
                best = gap;
                y = (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t;
              }
            }
            return y - (j.position.y ?? 0);
          };
          const arrow = makeDirectionArrow("approach arrow", local, arrowYaw, approach.lanes[lane], 4, 1.5, this.materials.whitePaint, arrowHeight, 8e-3);
          if (arrow) {
            arrow.userData.markingOwner = "intersection";
            arrow.userData.markingSource = j.id;
            arrow.userData.markingRole = "arrow";
            arrow.userData.approachPort = port;
            arrow.userData.approachLane = lane;
            root.add(arrow);
          }
        }
      }
      if (!outline) for (const side of [-1, 1]) {
        const curb = makeBox("curb transition", [0.22, 0.17, 3.4], [d.x * (h2 - 2.4) + right.x * side * (width / 2 + 0.11), 0.085, d.z * (h2 - 2.4) + right.z * side * (width / 2 + 0.11)], this.materials.curb, true);
        curb.rotation.y = yaw;
        root.add(curb);
      }
      if (j.signalized && signals && incoming) {
        const outward = rotatePoint(d, j.rotation), worldRight = rotatePoint(right, j.rotation);
        const lateral = width / 2 + 1;
        const headHeight = j.signals?.placements?.[port]?.headHeight ?? (signals instanceof CityTrafficSignals && j.signals?.profile ? Math.max(7.2, j.signals.headHeight ?? 7.2) : j.signals?.headHeight ?? 5.8);
        const reach = Math.max(h2, Math.hypot(localMouth.x, localMouth.z));
        const base = rotatePoint(localMouth, j.rotation), poleOrigin = { x: j.position.x + base.x, z: j.position.z + base.z };
        const placement = j.signals?.placements?.[port];
        const center = placement?.position ?? (signals instanceof CityTrafficSignals && j.signals?.profile ? signals.placePole(index, outward, worldRight, reach, width, headHeight, poleOrigin) : { x: poleOrigin.x - outward.x * (reach + 1) + worldRight.x * lateral, z: poleOrigin.z - outward.z * (reach + 1) + worldRight.z * lateral });
        signals.addHead(
          index,
          {
            segmentId: r?.id ?? `${j.id}:${port}`,
            outward,
            right: worldRight,
            approachYawRadians: yaw + j.rotation,
            approachLaneCount: r?.travelDirection === "two-way" ? laneCount / 2 : laneCount,
            approachLaneWidth: laneWidth,
            roadWidth: width,
            controlKind: armControlKind(d)
          },
          center,
          placement?.heading ?? Math.atan2(-outward.x, -outward.z),
          this.materials,
          true,
          headHeight
        );
        signals.root.children.at(-1).position.y = placement?.position.y ?? j.position.y ?? 0;
      }
    }
    if (!outline && j.type.startsWith("t_") && !j.portAngles) root.add(
      makeBox("T closed curb", [h * 2, 0.17, 0.22], [0, 0.085, h], this.materials.curb, true),
      makeBox("T closed sidewalk", [h * 2, 0.14, 2], [0, 0.07, h + 1], this.materials.sidewalk, true)
    );
    if (continuous && outline) yield* continuous.finishIntersectionSteps(root, j, pavement);
    return root;
  }
};

// src/world/city/CityGroundGeometry.ts
import { BufferGeometry as BufferGeometry13, Float32BufferAttribute as Float32BufferAttribute10 } from "three";
var CITY_GROUND_HEIGHT = -0.04;
var openingCache = /* @__PURE__ */ new WeakMap();
function* cityGroundGeometrySteps(map, bounds = map.bounds, cacheOpenings = false, cellSize = 20) {
  let work = 0;
  const hasArea = (polygon) => polygon.length >= 3 && Math.abs(polygon.reduce((sum, p, i) => {
    const q = polygon[(i + 1) % polygon.length];
    return sum + p.x * q.z - q.x * p.z;
  }, 0)) > 1e-6;
  const open = map.roads.filter((r) => r.structure?.enclosure?.kind === "cutting"), chains = roadEdgeChains(map);
  let cells = cacheOpenings ? openingCache.get(map) : void 0;
  if (!cells) {
    cells = /* @__PURE__ */ new Map();
    for (const road of open) {
      yield;
      const left = chains.barrierEdge(road, -1), right = chains.barrierEdge(road, 1);
      for (let i = 1; i < left.length; i++) {
        if (++work % 32 === 0) yield;
        const a = left[i - 1], c = left[i], d = right[i], e = right[i - 1];
        let polygon = [a, c, d, e];
        const below = [];
        for (let k = 0; k < polygon.length; k++) {
          const p = polygon[k], q = polygon[(k + 1) % polygon.length], pin = (p.y ?? 0) < -0.1, qin = (q.y ?? 0) < -0.1;
          if (pin) below.push(p);
          if (pin !== qin) {
            const t = (-0.1 - (p.y ?? 0)) / ((q.y ?? 0) - (p.y ?? 0));
            below.push({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t });
          }
        }
        polygon = below;
        if (polygon.length < 3) continue;
        const area = polygon.reduce((s, p, k) => {
          const q = polygon[(k + 1) % polygon.length];
          return s + p.x * q.z - q.x * p.z;
        }, 0);
        if (Math.abs(area) < 1e-8) continue;
        if (area < 0) polygon.reverse();
        for (let x = Math.floor(Math.min(...polygon.map((p) => p.x)) / 20); x <= Math.floor(Math.max(...polygon.map((p) => p.x)) / 20); x++) for (let z = Math.floor(Math.min(...polygon.map((p) => p.z)) / 20); z <= Math.floor(Math.max(...polygon.map((p) => p.z)) / 20); z++) {
          const key = x + "," + z, bucket = cells.get(key) ?? [];
          bucket.push(polygon);
          cells.set(key, bucket);
        }
      }
    }
    if (cacheOpenings) openingCache.set(map, cells);
  }
  const positions = [], b = bounds;
  const step = open.length || map.environment.landforms?.length ? cellSize : Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
  for (let x = b.minX; x < b.maxX; x += step) for (let z = b.minZ; z < b.maxZ; z += step) {
    if (++work % 64 === 0) yield;
    const x1 = Math.min(b.maxX, x + step), z1 = Math.min(b.maxZ, z + step);
    let pieces = [[{ x, z }, { x: x1, z }, { x: x1, z: z1 }, { x, z: z1 }]];
    const masks = /* @__PURE__ */ new Set();
    for (let cx = Math.floor(x / 20); cx <= Math.floor(x1 / 20); cx++) for (let cz = Math.floor(z / 20); cz <= Math.floor(z1 / 20); cz++) for (const mask of cells.get(cx + "," + cz) ?? []) masks.add(mask);
    for (const mask of masks) {
      const next = [];
      for (const piece of pieces) {
        let inside = piece;
        for (let k = 0; k < mask.length && inside.length >= 3; k++) {
          const a = mask[k], c = mask[(k + 1) % mask.length], side = (p) => (c.x - a.x) * (p.z - a.z) - (c.z - a.z) * (p.x - a.x);
          const cut = (keepInside) => {
            const result = [];
            for (let n = 0; n < inside.length; n++) {
              const p = inside[n], q = inside[(n + 1) % inside.length], sp = side(p), sq = side(q), pin = keepInside ? sp >= 0 : sp <= 0, qin = keepInside ? sq >= 0 : sq <= 0;
              if (pin) result.push(p);
              if (pin !== qin) {
                const t = sp / (sp - sq);
                result.push({ x: p.x + t * (q.x - p.x), z: p.z + t * (q.z - p.z) });
              }
            }
            return result;
          };
          const outside = cut(false);
          if (hasArea(outside)) next.push(outside);
          inside = cut(true);
          if (!hasArea(inside)) break;
        }
      }
      pieces = next;
    }
    for (const piece of pieces) for (let k = 1; k + 1 < piece.length; k++) for (const p of [piece[0], piece[k + 1], piece[k]]) positions.push(p.x, CITY_GROUND_HEIGHT + cityTerrainOffsetAt(map.environment.landforms, p.x, p.z), p.z);
  }
  const geometry2 = new BufferGeometry13();
  geometry2.setAttribute("position", new Float32BufferAttribute10(positions, 3));
  geometry2.computeVertexNormals();
  return geometry2;
}
function* cityGroundSectorGeometrySteps(map, key, cellSize = 20) {
  const [sx, sz] = key.split(",").map(Number), size = map.sectorSize, result = [];
  const areas = map.regional ? [map.regional.cityBounds, ...map.regional.cityExtensions ?? []] : [map.bounds];
  for (const area of areas) {
    const bounds = {
      minX: Math.max(area.minX, sx * size),
      maxX: Math.min(area.maxX, (sx + 1) * size),
      minZ: Math.max(area.minZ, sz * size),
      maxZ: Math.min(area.maxZ, (sz + 1) * size)
    };
    if (bounds.minX < bounds.maxX && bounds.minZ < bounds.maxZ) result.push(yield* cityGroundGeometrySteps(map, bounds, true, cellSize));
  }
  return result;
}
export {
  IntersectionBuilder,
  RegionalTerrain,
  RoadBuilder,
  cityGroundSectorGeometrySteps,
  registerImmutableRoadGeometry
};
