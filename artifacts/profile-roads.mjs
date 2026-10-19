import { readFileSync, writeFileSync } from 'node:fs';

const map = JSON.parse(readFileSync(process.env.MAP_FILE ?? 'src/world/regional/regional-main.json', 'utf8').replace(/^\uFEFF/, ''));
const ids = readFileSync(process.env.IDS_FILE, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
const byId = new Map(map.roads.map(r => [r.id, r]));
const byJ = new Map(map.intersections.map(j => [j.id, j]));
const dist = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
const r3 = n => Math.round(n * 1000) / 1000;
const r2 = n => Math.round(n * 100) / 100;

function analyze(r) {
  const pts = r.centerline ?? [];
  const st = [0];
  for (let i = 1; i < pts.length; i++) st.push(st[i - 1] + dist(pts[i - 1], pts[i]));
  const length = st.at(-1) ?? 0;
  const heights = pts.map(p => p.y ?? 0);
  const minY = Math.min(...heights), maxY = Math.max(...heights);
  let variation = 0, maxGrade = 0;
  const grades = [];
  for (let i = 1; i < pts.length; i++) {
    const d = st[i] - st[i - 1];
    const g = d > 1e-6 ? (heights[i] - heights[i - 1]) / d : 0;
    grades.push(g);
    variation += Math.abs(heights[i] - heights[i - 1]);
    maxGrade = Math.max(maxGrade, Math.abs(g));
  }
  const extrema = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = heights[i - 1], b = heights[i], c = heights[i + 1];
    if ((b >= a && b > c) || (b <= a && b < c)) {
      extrema.push({ i, s: r2(st[i]), y: r3(b), amp: r3(Math.abs(b - (a + c) / 2)) });
    }
  }
  const reversals = [];
  let prev = 0;
  for (let i = 1; i < pts.length; i++) {
    const g = grades[i - 1];
    if (Math.abs(g) < 0.006) continue;
    const sign = Math.sign(g);
    if (prev && sign !== prev) reversals.push({ s: r2(st[i]), y: r3(heights[i]), g: r2(g * 100) });
    prev = sign;
  }
  // sharp bends
  const bends = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const h1 = Math.atan2(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    const h2 = Math.atan2(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
    const turn = Math.abs(Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1))) * 180 / Math.PI;
    const a = dist(pts[i - 1], pts[i]), b = dist(pts[i], pts[i + 1]);
    if (turn >= 38) bends.push({ i, s: r2(st[i]), turn: r2(turn), a: r2(a), b: r2(b) });
  }
  const short = [];
  for (let i = 1; i < pts.length; i++) { const d = dist(pts[i - 1], pts[i]); if (d < 1.5) short.push({ i, d: r2(d), s: r2(st[i]) }); }
  const junctions = map.intersections.filter(j => j.connections.some(c => c.roadId === r.id)).map(j => ({ id: j.id, conns: j.connections.map(c => `${c.roadId.slice(0, 30)}:${c.end}`), pos: j.position }));
  const links = (map.roadLinks ?? []).filter(l => l.from.roadId === r.id || l.to.roadId === r.id).map(l => `${l.from.roadId}:${l.from.end} -> ${l.to.roadId}:${l.to.end}`);
  return {
    id: r.id, class: r.roadClass, type: r.type, name: r.roadNameId, group: r.groupId, preset: r.presetSource,
    laneCount: r.laneCount, length: r2(length), points: pts.length, startY: r3(heights[0]), endY: r3(heights.at(-1)),
    minY: r3(minY), maxY: r3(maxY), net: r3(heights.at(-1) - heights[0]), variation: r3(variation), maxGradePct: r2(maxGrade * 100),
    extrema, reversals, bends, shortSegments: short, junctions, links,
    pointsDetail: pts.map((p, i) => ({ i, s: r2(st[i]), x: r2(p.x), z: r2(p.z), y: r3(p.y ?? 0), g: r2((grades[i - 1] ?? 0) * 100) })),
  };
}

const rows = ids.map(id => { const r = byId.get(id); return r ? analyze(r) : { id, missing: true }; });
writeFileSync(process.env.OUT_FILE ?? 'artifacts/profiles.json', JSON.stringify(rows, null, 2));
for (const a of rows) {
  if (a.missing) { console.log(`${a.id}: MISSING`); continue; }
  console.log(`\n=== ${a.id} | ${a.class} ${a.type ?? ''} lanes=${a.laneCount} len=${a.length} group=${a.group ?? ''} preset=${a.preset ?? ''} name=${a.name ?? ''}`);
  console.log(`y ${a.startY}->${a.endY} min ${a.minY} max ${a.maxY} net ${a.net} var ${a.variation} maxG ${a.maxGradePct}%`);
  console.log(`extrema ${a.extrema.map(e => `${e.s}m:${e.y}(${e.amp})`).join(' ')}`);
  console.log(`reversals ${a.reversals.map(e => `${e.s}m:${e.y}`).join(' ')}`);
  if (a.bends.length) console.log(`bends ${a.bends.map(e => `${e.s}m:${e.turn}deg(${e.a}/${e.b})`).join(' ')}`);
  if (a.shortSegments.length) console.log(`short ${a.shortSegments.map(s => `${s.s}m:${s.d}`).join(' ')}`);
  console.log(`junctions ${a.junctions.map(j => j.id + '[' + j.conns.join(',') + ']').join(' ')}`);
}
