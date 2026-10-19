import { readFileSync, writeFileSync } from 'node:fs';
const profiles = JSON.parse(readFileSync('artifacts/profiles-vert.json', 'utf8'));
const skip = new Set(['regional:v3:chenjiang-foldback']);
const out = {};
for (const r of profiles) {
  if (skip.has(r.id)) continue;
  const pts = r.pointsDetail;
  // reversals and local extrema on a 3-5 m authored spacing
  const marks = [];
  let prev = 0;
  for (let i = 1; i < pts.length; i++) {
    const g = pts[i].g / 100;
    if (Math.abs(g) < 0.006) continue;
    const s = Math.sign(g);
    if (prev && s !== prev) marks.push(pts[i].s);
    prev = s;
  }
  // cluster marks within 45 m
  const clusters = [];
  for (const m of marks) {
    const last = clusters.at(-1);
    if (last && m - last.at(-1) <= 45) last.push(m);
    else clusters.push([m]);
  }
  const ranges = [];
  for (const c of clusters) {
    if (c.length < 2) continue;
    const a = Math.max(0, c[0] - 15), b = Math.min(r.length, c.at(-1) + 15);
    if (b - a < 3) continue;
    const last = ranges.at(-1);
    if (last && a <= last.end + 8) last.end = Math.max(last.end, b);
    else ranges.push({ start: Math.round(a * 10) / 10, end: Math.round(b * 10) / 10 });
  }
  out[r.id] = ranges;
}
writeFileSync('artifacts/vert-ranges.json', JSON.stringify(out, null, 2));
for (const [id, ranges] of Object.entries(out)) console.log(id, JSON.stringify(ranges));
