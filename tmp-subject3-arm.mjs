// src/world/subject3/Subject3GroundConfig.ts
var segment = (id, name, roadClass, start, end, width, via, speedLimitKmh) => ({
  id,
  name,
  roadClass,
  start,
  end,
  width,
  via,
  speedLimitKmh
});
var SUBJECT3_ROAD_SEGMENTS = Object.freeze([
  // North-south main roads.
  segment("main-west", "\u897F\u4FA7\u5357\u5317\u4E3B\u8DEF", "arterial", { x: -378, z: -460 }, { x: -378, z: 460 }, 15, void 0, 50),
  segment("main-east", "\u4E1C\u4FA7\u5357\u5317\u4E3B\u8DEF", "standard", { x: 318, z: -400 }, { x: 318, z: 460 }, 11, void 0, 50),
  // East-west streets.
  segment("north-road", "\u5317\u4FA7\u6A2A\u5411\u9053\u8DEF", "standard", { x: -390, z: -400 }, { x: 310, z: -400 }, 11, void 0, 40),
  segment(
    "middle-road",
    "\u4E2D\u90E8\u6A2A\u5411\u9053\u8DEF",
    "arterial",
    { x: -430, z: -30 },
    { x: 420, z: -30 },
    14,
    [{ x: 318, z: -30 }],
    50
  ),
  segment(
    "south-road",
    "\u5357\u4FA7\u6A2A\u5411\u9053\u8DEF",
    "standard",
    { x: -430, z: 300 },
    { x: 430, z: 300 },
    12,
    [{ x: -30, z: 300 }],
    40
  ),
  // Inner streets.
  segment("block-street", "\u4E2D\u90E8\u4E1C\u897F\u5411\u8857\u533A\u9053\u8DEF", "narrow", { x: -378, z: 60 }, { x: 420, z: 60 }, 9, void 0, 30),
  segment("north-north", "\u4E2D\u592E\u5357\u5317\u8857\u5317\u6BB5", "narrow", { x: 40, z: -400 }, { x: 40, z: -30 }, 9, void 0, 30),
  segment("north-south", "\u4E2D\u592E\u5357\u5317\u8857\u5357\u6BB5", "narrow", { x: 52, z: -30 }, { x: 52, z: 300 }, 9, void 0, 30),
  segment("south-south", "\u5357\u4E1C\u5411\u5357\u5EF6\u8857\u9053", "narrow", { x: 300, z: 300 }, { x: 300, z: 420 }, 9, void 0, 30),
  segment("west-inner", "\u897F\u4FA7\u5185\u8857", "narrow", { x: -320, z: -400 }, { x: -320, z: -30 }, 9, void 0, 30),
  segment("school-street", "\u5B66\u6821\u524D\u8857\u9053", "narrow", { x: -378, z: 150 }, { x: -150, z: 150 }, 9, void 0, 30),
  segment("east-tee", "\u4E1C\u4FA7\u4E01\u5B57\u652F\u8DEF", "narrow", { x: 318, z: 150 }, { x: 430, z: 150 }, 9, void 0, 30),
  segment("south-inner", "\u5357\u4FA7\u5185\u8857", "narrow", { x: -378, z: 380 }, { x: 318, z: 380 }, 9, void 0, 30),
  segment("south-south-east", "\u5357\u4E1C\u8857\u4E1C\u5411\u652F\u8DEF", "narrow", { x: 300, z: 420 }, { x: 420, z: 420 }, 9, void 0, 30)
]);
var SUBJECT3_JUNCTIONS = Object.freeze([
  // Signalised main crossings.
  { id: "junction-west-middle", center: { x: -378, z: -30 }, kind: "signalised", signalQuadrant: "north-south", signalOffsetSeconds: 0 },
  { id: "junction-east-south", center: { x: 318, z: 300 }, kind: "signalised", signalQuadrant: "north-south", signalOffsetSeconds: 4.5 },
  { id: "junction-west-south", center: { x: -378, z: 300 }, kind: "signalised", signalQuadrant: "north-south", signalOffsetSeconds: 9 },
  { id: "junction-east-middle", center: { x: 318, z: -30 }, kind: "signalised", signalQuadrant: "east-west", signalOffsetSeconds: 13.5 },
  // Plain crossings.
  { id: "junction-west-north", center: { x: -378, z: -400 }, kind: "plain" },
  { id: "junction-east-north", center: { x: 318, z: -400 }, kind: "plain" },
  { id: "junction-north-street", center: { x: 40, z: -30 }, kind: "plain" },
  { id: "junction-north-inner", center: { x: -320, z: -30 }, kind: "plain" },
  { id: "junction-south-central", center: { x: 52, z: 300 }, kind: "plain" },
  { id: "junction-south-east", center: { x: 300, z: 300 }, kind: "plain" },
  { id: "junction-south-inner", center: { x: -30, z: 380 }, kind: "plain" },
  { id: "junction-south-east-tee", center: { x: 300, z: 420 }, kind: "plain" },
  // T junctions.
  { id: "junction-block-tee", center: { x: 40, z: 60 }, kind: "plain" },
  { id: "junction-east-tee", center: { x: 318, z: 150 }, kind: "plain" }
]);
var SUBJECT3_ZONES = Object.freeze([
  {
    id: "start-area",
    kind: "start-area",
    label: "\u9ED8\u8BA4\u8D77\u6B65\u8DEF\u6BB5",
    bounds: { minimumX: -386, maximumX: -371, minimumZ: 300, maximumZ: 460 },
    headingRadians: 0
  },
  {
    id: "west-main-straight",
    kind: "straight-driving",
    label: "\u897F\u4FA7\u957F\u76F4\u8DEF\u6BB5",
    bounds: { minimumX: -386, maximumX: -371, minimumZ: -255, maximumZ: -42 },
    headingRadians: 0
  },
  {
    id: "west-main-gear-change",
    kind: "gear-change",
    label: "\u897F\u4FA7\u52A0\u51CF\u6321\u8DEF\u6BB5",
    bounds: { minimumX: -386, maximumX: -371, minimumZ: -400, maximumZ: -260 },
    headingRadians: 0
  },
  {
    id: "west-main-lane-change",
    kind: "lane-change",
    label: "\u897F\u4FA7\u53D8\u9053\u8DEF\u6BB5",
    bounds: { minimumX: -386, maximumX: -371, minimumZ: 40, maximumZ: 160 },
    headingRadians: 0
  },
  {
    id: "main-lane-change",
    kind: "lane-change",
    label: "\u4E2D\u90E8\u4E3B\u8DEF\u53D8\u9053\u8DEF\u6BB5",
    bounds: { minimumX: -300, maximumX: -160, minimumZ: -38, maximumZ: -22 },
    headingRadians: Math.PI * 0.5
  },
  {
    id: "main-overtaking",
    kind: "overtaking",
    label: "\u4E2D\u90E8\u4E3B\u8DEF\u8D85\u8F66\u8DEF\u6BB5",
    bounds: { minimumX: 120, maximumX: 290, minimumZ: -38, maximumZ: -22 },
    headingRadians: Math.PI * 0.5
  },
  {
    id: "east-main-straight",
    kind: "straight-driving",
    label: "\u4E1C\u4FA7\u957F\u76F4\u8DEF\u6BB5",
    bounds: { minimumX: 311, maximumX: 325, minimumZ: -42, maximumZ: 240 },
    headingRadians: Math.PI
  },
  {
    id: "east-main-gear-change",
    kind: "gear-change",
    label: "\u4E1C\u4FA7\u52A0\u51CF\u6321\u8DEF\u6BB5",
    bounds: { minimumX: 311, maximumX: 325, minimumZ: -390, maximumZ: -50 },
    headingRadians: Math.PI
  },
  {
    id: "school-zone",
    kind: "school-zone",
    label: "\u5B66\u6821\u533A\u57DF",
    bounds: { minimumX: -230, maximumX: -120, minimumZ: 142, maximumZ: 158 },
    headingRadians: Math.PI * 0.5
  },
  {
    id: "bus-stop-zone",
    kind: "bus-stop",
    label: "\u516C\u4EA4\u7AD9\u533A\u57DF",
    bounds: { minimumX: -378, maximumX: -360, minimumZ: 205, maximumZ: 245 },
    headingRadians: 0
  },
  {
    id: "meeting-zone",
    kind: "meeting",
    label: "\u7A84\u8DEF\u4F1A\u8F66\u8DEF\u6BB5",
    bounds: { minimumX: -240, maximumX: -150, minimumZ: 144, maximumZ: 156 },
    headingRadians: Math.PI * 0.5
  },
  {
    id: "u-turn-zone",
    kind: "u-turn",
    label: "\u6389\u5934\u8DEF\u6BB5",
    bounds: { minimumX: -350, maximumX: 350, minimumZ: -42, maximumZ: -18 },
    headingRadians: Math.PI * 0.5
  },
  {
    id: "pull-over-zone",
    kind: "pull-over-parking",
    label: "\u9760\u8FB9\u505C\u8F66\u8DEF\u6BB5",
    bounds: { minimumX: -388, maximumX: -364, minimumZ: 250, maximumZ: 296 },
    headingRadians: 0
  }
]);
var DEFAULT_SUBJECT3_GROUND_CONFIG = {
  site: {
    length: 940,
    width: 960
  },
  spawn: {
    position: { x: -370.5, z: 430 },
    yawRadians: 0
  },
  roads: SUBJECT3_ROAD_SEGMENTS,
  junctions: SUBJECT3_JUNCTIONS,
  zones: SUBJECT3_ZONES,
  lanes: {
    arterialLaneWidth: 3.75,
    standardLaneWidth: 3.5,
    narrowLaneWidth: 3.2
  },
  markings: {
    lineWidth: 0.15,
    thinLineWidth: 0.1,
    surfaceClearance: 0.012,
    dashLength: 4,
    dashGap: 6,
    junctionMargin: 2.5
  },
  junction: {
    crosswalkWidth: 3.2,
    crosswalkStripeWidth: 0.45,
    crosswalkStripeGap: 0.6,
    arrowOffset: 9.5,
    secondArrowOffset: 15.5,
    arrowLength: 4.2,
    arrowWidth: 1.6
  },
  trafficSignals: {
    greenSeconds: 20,
    amberSeconds: 3,
    allRedSeconds: 1.5,
    headHeight: 6
  },
  environment: {
    sidewalkWidth: 3.2,
    sidewalkHeight: 0.14,
    lampSpacing: 45,
    treeSpacing: 28
  },
  surface: {
    asphaltGrip: 1,
    asphaltRollingResistance: 1,
    sidewalkGrip: 0.9,
    sidewalkRollingResistance: 1.35,
    grassGrip: 0.55,
    grassRollingResistance: 3,
    shoulderBlendDepth: 1.1
  }
};

// src/world/subject3/geometry.ts
var ARROW_OUTLINES = Object.freeze({
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
    [-0.18, -0.15],
    [-0.62, -0.15],
    [-0.62, -0.45],
    [-1.35, 0.25],
    [-0.62, 0.95],
    [-0.62, 0.65],
    [0.18, 0.65],
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
    [-0.18, -0.35],
    [-0.55, -0.35],
    [0, -1.6],
    [0.55, -0.35],
    [0.18, -0.35],
    [0.18, 0.35],
    [-0.62, 0.35],
    [-0.62, 0.6],
    [-1.4, 0.05],
    [-0.62, -0.5],
    [-0.62, -0.2],
    [-0.18, -0.2]
  ],
  "straight-right": [
    [0.18, 1.9],
    [0.18, -0.2],
    [0.62, -0.2],
    [0.62, -0.5],
    [1.4, 0.05],
    [0.62, 0.6],
    [0.62, 0.35],
    [-0.18, 0.35],
    [-0.18, -0.35],
    [-0.55, -0.35],
    [0, -1.6],
    [0.55, -0.35]
  ]
});

// src/world/subject3/math.ts
var normalize2 = (direction) => {
  const length = Math.hypot(direction.x, direction.z);
  if (length < 1e-9) return { x: 0, z: -1 };
  return { x: direction.x / length, z: direction.z / length };
};

// src/world/subject3/topology.ts
var segmentCenterline = (segment2) => [segment2.start, ...segment2.via ?? [], segment2.end];

// tmp-subject3-arm.ts
var config = DEFAULT_SUBJECT3_GROUND_CONFIG;
var junction = { x: -378, z: -30 };
var road = config.roads.find((item) => item.id === "main-west");
var centerline = segmentCenterline(road);
console.log("centerline", JSON.stringify(centerline));
var contact = { x: 0, z: 0 };
var bestDistance = 0.02;
for (let index = 1; index < centerline.length; index += 1) {
  const start = centerline[index - 1];
  const end = centerline[index];
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  const t = Math.max(0, Math.min(1, ((junction.x - start.x) * dx + (junction.z - start.z) * dz) / lengthSquared));
  const x = start.x + dx * t;
  const z = start.z + dz * t;
  const distance = Math.hypot(junction.x - x, junction.z - z);
  console.log("segment", index, "t=", t, "point=", x, z, "distance=", distance);
  if (distance <= bestDistance) {
    bestDistance = distance;
    contact = { x, z };
  }
}
console.log("contact", JSON.stringify(contact));
var best = { x: 0, z: -1 };
var furthest = 0;
for (const point of centerline) {
  const distance = Math.hypot(point.x - contact.x, point.z - contact.z);
  console.log("  point", JSON.stringify(point), "distance", distance);
  if (distance <= furthest) continue;
  furthest = distance;
  best = normalize2({ x: point.x - contact.x, z: point.z - contact.z });
}
console.log("outward", JSON.stringify(best));
var extent = 15 * 0.5;
for (const point of centerline) {
  const projection = (point.x - contact.x) * best.x + (point.z - contact.z) * best.z;
  console.log("  projection", JSON.stringify(point), projection);
  extent = Math.max(extent, projection);
}
console.log("extent", extent);
