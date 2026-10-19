import { readFileSync, writeFileSync } from 'node:fs';
const mapFile = process.env.MAP_FILE ?? 'src/world/regional/regional-main.json';
const map = JSON.parse(readFileSync(mapFile, 'utf8').replace(/^\uFEFF/, ''));
const crossings = JSON.parse(readFileSync('artifacts/vert-crossings.json', 'utf8'));
const ranges = JSON.parse(readFileSync('artifacts/vert-ranges.json', 'utf8'));
const roads = new Map(map.roads.map(r => [r.id, r]));
const selected = process.env.ROADS ? process.env.ROADS.split(',') : Object.keys(ranges);
const guard = Number(process.env.GUARD ?? 6);
const operations = [];
const summary = [];
const lerp = (a, b, t) => a + (b - a) * t;
const interpAt = (st, ys, s) => {
  if (s <= st[0]) return ys[0];
  if (s >= st.at(-1)) return ys.at(-1);
  for (let i = 1; i < st.length; i++) if (st[i] >= s) return lerp(ys[i - 1], ys[i], (s - st[i - 1]) / (st[i] - st[i - 1]));
  return ys.at(-1);
};
for (const id of selected) {
  const r = roads.get(id); if (!r) continue;
  const pts = (r.centerline ?? []).map(p => ({ ...p }));
  if (pts.length < 3) continue;
  const st = [0];
  for (let i = 1; i < pts.length; i++) st.push(st[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  const length = st.at(-1);
  const ys = pts.map(p => p.y ?? 0);
  const target = ys.slice();
  const hits = (crossings[id] ?? []).filter(h => h.sa > 1 && h.sa < length - 1 && h.gap < 8);
  for (const range of ranges[id] ?? []) {
    const a0 = Math.max(0, range.start), b0 = Math.min(length, range.end);
    if (process.env.PINS === '1') {
      const pins = [a0, b0];
      for (const h of hits) if (h.sa > a0 + 0.2 && h.sa < b0 - 0.2) pins.push(h.sa);
      const unique = [...new Set(pins.map(v => Math.round(v * 100) / 100))].sort((a, b) => a - b);
      for (let k = 1; k < unique.length; k++) {
        const a = unique[k - 1], b = unique[k];
        if (b - a < 0.2) continue;
        const ya = interpAt(st, ys, a), yb = interpAt(st, ys, b);
        for (let i = 0; i < pts.length; i++) {
          if (st[i] <= a || st[i] >= b) continue;
          target[i] = lerp(ya, yb, (st[i] - a) / (b - a));
        }
      }
      continue;
    }
    // protected crossing zones inside the range
    const zones = [];
    for (const h of hits) {
      const a = Math.max(a0, h.sa - guard), b = Math.min(b0, h.sa + guard);
      if (b - a > 0.1) zones.push([a, b]);
    }
    zones.sort((p, q) => p[0] - q[0]);
    const merged = [];
    for (const z of zones) { const last = merged.at(-1); if (last && z[0] <= last[1] + 0.1) last[1] = Math.max(last[1], z[1]); else merged.push([...z]); }
    // editable gaps: from range start to first zone, between zones, last zone to range end
    const gaps = [];
    let cursor = a0;
    for (const z of merged) { if (z[0] - cursor > 0.1) gaps.push([cursor, z[0]]); cursor = Math.max(cursor, z[1]); }
    if (b0 - cursor > 0.1) gaps.push([cursor, b0]);
    for (const [a, b] of gaps) {
      if (b - a < 3) continue;
      const ya = interpAt(st, ys, a), yb = interpAt(st, ys, b);
      for (let i = 0; i < pts.length; i++) {
        if (st[i] <= a + 0.01 || st[i] >= b - 0.01) continue;
        target[i] = lerp(ya, yb, (st[i] - a) / (b - a));
      }
    }
  }
  let edits = 0, maxDelta = 0, maxDeltaStation = 0, maxGrade = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const delta = target[i] - ys[i];
    if (Math.abs(delta) > maxDelta) { maxDelta = Math.abs(delta); maxDeltaStation = st[i]; }
    if (Math.abs(delta) < 0.01) continue;
    operations.push({ op: 'editControlPoint', roadId: id, index: i, point: { x: pts[i].x, y: Math.round(target[i] * 1000) / 1000, z: pts[i].z } });
    edits++;
  }
  for (let k = 1; k < pts.length; k++) {
    const ds = st[k] - st[k - 1];
    if (ds < 0.05) continue;
    maxGrade = Math.max(maxGrade, Math.abs((target[k] - target[k - 1]) / ds));
  }
  summary.push({ id, points: pts.length, edits, maxDelta: Math.round(maxDelta * 1000) / 1000, maxDeltaStation: Math.round(maxDeltaStation * 10) / 10, resultingMaxGradePct: Math.round(maxGrade * 1000) / 10, guard });
}
writeFileSync(process.env.OUT ?? 'artifacts/ops-linear-profile.json', JSON.stringify({ label: process.env.LABEL ?? 'local linear vertical profile repair', operations }, null, 2));
for (const s of summary) console.log(JSON.stringify(s));
console.log(operations.length, 'operations');
