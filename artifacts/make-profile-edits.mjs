import { readFileSync, writeFileSync } from 'node:fs';
const mapFile = process.env.MAP_FILE ?? 'src/world/regional/regional-main.json';
const map = JSON.parse(readFileSync(mapFile, 'utf8').replace(/^\uFEFF/, ''));
const crossings = JSON.parse(readFileSync('artifacts/vert-crossings.json', 'utf8'));
const ranges = JSON.parse(readFileSync('artifacts/vert-ranges.json', 'utf8'));
const roads = new Map(map.roads.map(r => [r.id, r]));
const selected = process.env.ROADS ? process.env.ROADS.split(',') : Object.keys(ranges);
const radius = Number(process.env.RADIUS ?? 15);
const maxGradeTarget = Number(process.env.MAXGRADE ?? 0.08);
const operations = [];
const summary = [];
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
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
  const pinStations = [0, length];
  for (const h of crossings[id] ?? []) if (h.sa > 1 && h.sa < length - 1 && h.gap < 8) pinStations.push(h.sa);
  const pins = [...new Set(pinStations.map(v => Math.round(v * 100) / 100))].sort((a, b) => a - b);
  // 1 m sampled profile for a robust grade limit
  const samples = [];
  for (let d = 0; d <= length + 1e-6; d += 1) samples.push(Math.min(d, length));
  if (samples.at(-1) < length) samples.push(length);
  for (const p of pins) if (!samples.some(s => Math.abs(s - p) < 1e-6)) samples.push(p);
  samples.sort((a, b) => a - b);
  const origS = samples.map(s => interpAt(st, ys, s));
  // moving average on the 1 m samples (window radius)
  const smoothS = samples.map((s, i) => {
    let sum = 0, count = 0;
    for (let k = 0; k < samples.length; k++) if (Math.abs(samples[k] - s) <= radius) { sum += origS[k]; count++; }
    return sum / count;
  });
  const target = smoothS.slice();
  for (let k = 1; k < pins.length; k++) {
    const a = pins[k - 1], b = pins[k];
    if (b - a < 0.2) continue;
    const ya = interpAt(st, ys, a), yb = interpAt(st, ys, b);
    const sa = interpAt(samples, smoothS, a), sb = interpAt(samples, smoothS, b);
    for (let i = 0; i < samples.length; i++) {
      if (samples[i] < a || samples[i] > b) continue;
      const t = (samples[i] - a) / (b - a);
      target[i] = smoothS[i] - lerp(sa - ya, sb - yb, t);
    }
  }
  // grade limit per pin interval, pin heights exact
  for (let k = 1; k < pins.length; k++) {
    const a = pins[k - 1], b = pins[k];
    if (b - a < 0.2) continue;
    const ya = interpAt(st, ys, a), yb = interpAt(st, ys, b);
    const allowed = Math.max(maxGradeTarget, Math.abs(yb - ya) / (b - a) * 1.02, 0.012);
    const idx = samples.map((s, i) => i).filter(i => samples[i] >= a - 1e-9 && samples[i] <= b + 1e-9);
    if (!idx.length) continue;
    target[idx[0]] = ya;
    target[idx.at(-1)] = yb;
    // forward/backward clamp inside the interval
    for (let pass = 0; pass < 6; pass++) {
      for (let j = 1; j < idx.length; j++) {
        const i = idx[j], p = idx[j - 1], ds = Math.max(1e-6, samples[i] - samples[p]);
        target[i] = clamp(target[i], target[p] - allowed * ds, target[p] + allowed * ds);
      }
      target[idx.at(-1)] = yb;
      for (let j = idx.length - 2; j >= 0; j--) {
        const i = idx[j], n = idx[j + 1], ds = Math.max(1e-6, samples[n] - samples[i]);
        target[i] = clamp(target[i], target[n] - allowed * ds, target[n] + allowed * ds);
      }
      target[idx[0]] = ya;
    }
    target[idx[0]] = ya; target[idx.at(-1)] = yb;
  }
  // sample back to authored points
  let edits = 0, maxDelta = 0, maxDeltaStation = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const y = interpAt(samples, target, st[i]);
    const delta = y - ys[i];
    if (Math.abs(delta) > maxDelta) { maxDelta = Math.abs(delta); maxDeltaStation = st[i]; }
    if (Math.abs(delta) < 0.01) continue;
    operations.push({ op: 'editControlPoint', roadId: id, index: i, point: { x: pts[i].x, y: Math.round(y * 1000) / 1000, z: pts[i].z } });
    edits++;
  }
  summary.push({ id, points: pts.length, edits, maxDelta: Math.round(maxDelta * 1000) / 1000, maxDeltaStation: Math.round(maxDeltaStation * 10) / 10, radius, maxGradeTarget });
}
writeFileSync(process.env.OUT ?? 'artifacts/ops-profile-edit.json', JSON.stringify({ label: process.env.LABEL ?? 'local vertical profile smoothing', operations }, null, 2));
for (const s of summary) console.log(JSON.stringify(s));
console.log(operations.length, 'operations');
