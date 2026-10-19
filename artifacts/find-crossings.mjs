import { readFileSync, writeFileSync } from 'node:fs';
const mapFile = process.env.MAP_FILE ?? 'src/world/regional/regional-main.json';
const map = JSON.parse(readFileSync(mapFile, 'utf8').replace(/^\uFEFF/, ''));
const ranges = JSON.parse(readFileSync('artifacts/vert-ranges.json', 'utf8'));
const roads = new Map(map.roads.map(r => [r.id, r]));

function stations(r) {
  const pts = r.centerline, st = [0];
  for (let i = 1; i < pts.length; i++) st.push(st[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  return st;
}
function crossings(a, b) {
  const out = [];
  const A = a.centerline, B = b.centerline, sa = stations(a), sb = stations(b);
  for (let i = 1; i < A.length; i++) for (let k = 1; k < B.length; k++) {
    const p = A[i - 1], q = A[i], r = B[k - 1], s = B[k];
    if (Math.max(p.x, q.x) < Math.min(r.x, s.x) || Math.max(r.x, s.x) < Math.min(p.x, q.x) || Math.max(p.z, q.z) < Math.min(r.z, s.z) || Math.max(r.z, s.z) < Math.min(p.z, q.z)) continue;
    const ax = q.x - p.x, az = q.z - p.z, bx = s.x - r.x, bz = s.z - r.z, den = ax * bz - az * bx;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((r.x - p.x) * bz - (r.z - p.z) * bx) / den, u = ((r.x - p.x) * az - (r.z - p.z) * ax) / den;
    if (t < 0 || t > 1 || u < 0 || u > 1) continue;
    const ya = p.y + t * (q.y - p.y), yb = r.y + u * (s.y - r.y);
    out.push({ other: b.id, sa: sa[i - 1] + t * Math.hypot(ax, az), sb: sb[k - 1] + u * Math.hypot(bx, bz), ya, yb, gap: Math.abs(ya - yb) });
  }
  return out;
}
const result = {};
for (const id of Object.keys(ranges)) {
  const a = roads.get(id); if (!a) continue;
  const hits = [];
  for (const b of map.roads) {
    if (b.id === id) continue;
    // cheap bbox prefilter
    const ax = a.centerline.map(p => p.x), az = a.centerline.map(p => p.z), bx = b.centerline.map(p => p.x), bz = b.centerline.map(p => p.z);
    if (Math.max(...ax) < Math.min(...bx) || Math.max(...bx) < Math.min(...ax) || Math.max(...az) < Math.min(...bz) || Math.max(...bz) < Math.min(...az)) continue;
    for (const c of crossings(a, b)) if (c.gap < 8) hits.push({ ...c, sa: Math.round(c.sa * 10) / 10, gap: Math.round(c.gap * 100) / 100 });
  }
  result[id] = hits.sort((p, q) => p.sa - q.sa);
}
writeFileSync('artifacts/vert-crossings.json', JSON.stringify(result, null, 2));
for (const [id, hits] of Object.entries(result)) console.log(id, hits.map(h => `${h.sa}@${h.gap}m(${h.other})`).join(' '));
