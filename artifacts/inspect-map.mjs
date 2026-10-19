import { readFileSync } from 'node:fs';

const map = JSON.parse(readFileSync(process.env.MAP_FILE ?? 'src/world/regional/regional-main.json', 'utf8').replace(/^\uFEFF/, ''));
const args = process.argv.slice(2);
const cmd = args[0];
const ids = new Set();
const idFile = process.env.IDS_FILE;
if (idFile) for (const line of readFileSync(idFile, 'utf8').split(/\r?\n/)) if (line.trim()) ids.add(line.trim());
for (const id of args.slice(1)) ids.add(id);

const byRoad = new Map(map.roads.map(r => [r.id, r]));
const byJ = new Map(map.intersections.map(j => [j.id, j]));
const fmt = n => Math.round(n * 1000) / 1000;
const dist = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);

function roadInfo(r, showPoints = false) {
  const pts = r.centerline ?? [];
  const st = [0];
  for (let i = 1; i < pts.length; i++) st.push(st[i - 1] + dist(pts[i - 1], pts[i]));
  const out = {
    id: r.id, class: r.roadClass, fn: r.roadFunction, curve: r.curve, elevMode: r.elevationMode,
    groupId: r.groupId, presetSource: r.presetSource, roadNameId: r.roadNameId,
    lanes: r.laneCount, length: fmt(st.at(-1) ?? 0), pts: pts.length,
    start: pts[0], end: pts.at(-1),
    links: (map.roadLinks ?? []).filter(l => l.from.roadId === r.id || l.to.roadId === r.id).map(l => `${l.from.roadId}:${l.from.end}->${l.to.roadId}:${l.to.end}`),
    junctions: map.intersections.filter(j => j.connections.some(c => c.roadId === r.id)).map(j => j.id),
  };
  if (showPoints) {
    out.points = pts.map((p, i) => {
      const grade = i ? ((p.y - pts[i - 1].y) / Math.max(1e-6, st[i] - st[i - 1])) : 0;
      return { i, s: fmt(st[i]), x: fmt(p.x), y: fmt(p.y), z: fmt(p.z), gradePct: fmt(grade * 100) };
    });
    // extrema of y
    const ext = [];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1].y, b = pts[i].y, c = pts[i + 1].y;
      if ((b >= a && b > c) || (b <= a && b < c)) ext.push({ i, s: fmt(st[i]), y: fmt(b), amp: fmt(Math.abs(b - (a + c) / 2)) });
    }
    out.extrema = ext;
    // grade reversals
    const rev = [];
    let prev = 0;
    for (let i = 1; i < pts.length; i++) {
      const g = (pts[i].y - pts[i - 1].y) / Math.max(1e-6, st[i] - st[i - 1]);
      if (Math.abs(g) < 0.006) continue;
      const sign = Math.sign(g);
      if (prev && sign !== prev) rev.push({ i, s: fmt(st[i]), y: fmt(pts[i].y), gradePct: fmt(g * 100) });
      prev = sign;
    }
    out.gradeReversals = rev;
  }
  return out;
}

if (cmd === 'roads') {
  const result = map.roads.filter(r => ids.size === 0 || ids.has(r.id)).map(r => roadInfo(r, process.env.POINTS === '1'));
  console.log(JSON.stringify(result, null, 2));
} else if (cmd === 'area') {
  const [minX, maxX, minZ, maxZ] = args.slice(1).map(Number);
  const inArea = p => p.x >= minX && p.x <= maxX && p.z >= minZ && p.z <= maxZ;
  const roads = map.roads.filter(r => r.centerline.some(inArea)).map(r => roadInfo(r));
  const junctions = map.intersections.filter(j => inArea(j.position)).map(j => ({
    id: j.id, position: j.position, signalized: j.signalized, kind: j.kind,
    connections: j.connections.map(c => `${c.roadId}:${c.end}`),
    ports: (j.connectionPorts ?? []).map(p => `${p.port}:${p.roadId}:${p.end}`),
  }));
  const links = (map.roadLinks ?? []).filter(l => ids.size === 0 || ids.has(l.from.roadId) || ids.has(l.to.roadId));
  console.log(JSON.stringify({ roads, junctions, links }, null, 2));
} else if (cmd === 'junction') {
  const js = map.intersections.filter(j => ids.size === 0 || ids.has(j.id));
  console.log(JSON.stringify(js, null, 2));
} else if (cmd === 'links') {
  console.log(JSON.stringify((map.roadLinks ?? []).filter(l => ids.size === 0 || ids.has(l.from.roadId) || ids.has(l.to.roadId)), null, 2));
} else if (cmd === 'search') {
  const q = (args[1] ?? '').toLowerCase();
  const rows = map.roads.filter(r => r.id.toLowerCase().includes(q) || (r.roadNameId ?? '').toLowerCase().includes(q))
    .map(r => ({ id: r.id, class: r.roadClass, group: r.groupId, preset: r.presetSource, length: roadInfo(r).length, start: r.centerline[0], end: r.centerline.at(-1) }));
  console.log(JSON.stringify(rows, null, 2));
} else {
  console.log('usage: node inspect-map.mjs roads|area|junction|links|search [args] (POINTS=1, IDS_FILE=path)');
}
