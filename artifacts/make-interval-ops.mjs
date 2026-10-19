import { readFileSync, writeFileSync } from 'node:fs';
const mapFile = process.env.MAP_FILE ?? 'src/world/regional/regional-main.json';
const map = JSON.parse(readFileSync(mapFile, 'utf8').replace(/^\uFEFF/, ''));
const crossings = JSON.parse(readFileSync('artifacts/vert-crossings.json', 'utf8'));
const roads = new Map(map.roads.map(r => [r.id, r]));
const selected = process.env.ROADS ? process.env.ROADS.split(',') : Object.keys(crossings);
const operations = [];
for (const id of selected) {
  const r = roads.get(id); if (!r) continue;
  const pts = r.centerline, st = [0];
  for (let i = 1; i < pts.length; i++) st.push(st[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  const length = st.at(-1);
  const pins = [0, length];
  for (const h of crossings[id] ?? []) if (h.sa > 1 && h.sa < length - 1 && h.gap < 8) pins.push(h.sa);
  const unique = [...new Set(pins.map(v => Math.round(v * 10) / 10))].sort((a, b) => a - b);
  for (let i = 1; i < unique.length; i++) {
    const a = unique[i - 1] + 0.1, b = unique[i] - 0.1;
    if (b - a < 3) continue;
    operations.push({ op: 'repairElevation', id, start: Math.round(a * 10) / 10, end: Math.round(b * 10) / 10, strength: 1, maxGrade: 0.08, preserveEndpoints: true });
  }
}
const request = { label: process.env.LABEL ?? 'interval elevation repair', operations };
writeFileSync(process.env.OUT ?? 'artifacts/ops-interval.json', JSON.stringify(request, null, 2));
console.log(operations.length, 'operations');
