import { readFileSync, writeFileSync } from 'node:fs';
const map = JSON.parse(readFileSync(process.env.MAP_FILE ?? 'src/world/regional/regional-main.json', 'utf8').replace(/^\uFEFF/, ''));
const diag = JSON.parse(readFileSync(process.env.DIAG ?? 'artifacts/diag-BCP.json', 'utf8'));
const issues = diag.issues.filter(i => i.code === 'vertical.abruptGradeChange');
const roadById = new Map(map.roads.map(r => [r.id, r]));
const stationsOf = r => { const st = [0]; for (let i = 1; i < r.centerline.length; i++) st.push(st[i - 1] + Math.hypot(r.centerline[i].x - r.centerline[i - 1].x, r.centerline[i].z - r.centerline[i - 1].z)); return st; };
const bbox = r => { const xs = r.centerline.map(p => p.x), zs = r.centerline.map(p => p.z); return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) }; };
const boxes = new Map(map.roads.map(r => [r.id, bbox(r)]));
function crossings(a, b) {
  const out = [], A = a.centerline, B = b.centerline, sa = stationsOf(a), sb = stationsOf(b);
  for (let i = 1; i < A.length; i++) for (let k = 1; k < B.length; k++) {
    const p = A[i - 1], q = A[i], r = B[k - 1], s = B[k];
    const ax = q.x - p.x, az = q.z - p.z, bx = s.x - r.x, bz = s.z - r.z, den = ax * bz - az * bx;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((r.x - p.x) * bz - (r.z - p.z) * bx) / den, u = ((r.x - p.x) * az - (r.z - p.z) * ax) / den;
    if (t < 0 || t > 1 || u < 0 || u > 1) continue;
    const ya = p.y + t * (q.y - p.y), yb = r.y + u * (s.y - r.y);
    out.push({ other: b.id, sa: sa[i - 1] + t * Math.hypot(ax, az), sb: sb[k - 1] + u * Math.hypot(bx, bz), ya, yb, gap: Math.abs(ya - yb) });
  }
  return out;
}
const rows = [];
for (const issue of issues) {
  const a = roadById.get(issue.roadId); if (!a) continue;
  const ba = boxes.get(a.id);
  let nearest = null;
  for (const b of map.roads) {
    if (b.id === a.id) continue;
    const bb = boxes.get(b.id);
    if (ba.maxX < bb.minX || bb.maxX < ba.minX || ba.maxZ < bb.minZ || bb.maxZ < ba.minZ) continue;
    for (const c of crossings(a, b)) {
      if (c.gap > 8) continue;
      const d = Math.abs(c.sa - issue.station);
      if (!nearest || d < nearest.d) nearest = { ...c, d };
    }
  }
  rows.push({ road: issue.roadId, station: issue.station, pct: issue.metrics.gradeChangePercent, nearest: nearest ? { other: nearest.other, cs: Math.round(nearest.sa * 10) / 10, d: Math.round(nearest.d * 10) / 10, gap: Math.round(nearest.gap * 100) / 100 } : null });
}
writeFileSync('artifacts/abrupt-crossing-dist.json', JSON.stringify(rows, null, 2));
for (const r of rows.sort((a, b) => (a.nearest?.d ?? 999) - (b.nearest?.d ?? 999))) console.log(`${r.road} st=${r.station} pct=${r.pct} nearest=${r.nearest ? r.nearest.cs + '@' + r.nearest.d + 'm gap' + r.nearest.gap : 'none'}`);
