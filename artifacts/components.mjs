import { readFileSync } from 'node:fs';
const file = process.env.MAP_FILE ?? 'src/world/regional/regional-main.json';
const map = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const ids = map.roads.map(r => r.id);
const parent = new Map(ids.map(id => [id, id]));
const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
for (const l of map.roadLinks ?? []) union(l.from.roadId, l.to.roadId);
for (const j of map.intersections) { const rs = j.connections.map(c => c.roadId); for (let i = 1; i < rs.length; i++) union(rs[0], rs[i]); }
const comps = new Map();
for (const id of ids) { const r = find(id); if (!comps.has(r)) comps.set(r, []); comps.get(r).push(id); }
const sorted = [...comps.values()].sort((a, b) => b.length - a.length);
console.log('roads', ids.length, 'components', sorted.length);
for (const c of sorted) {
  console.log(`\nCOMPONENT ${c.length}`);
  if (c.length <= 200) console.log(c.join('\n'));
  else console.log(c.slice(0, 30).join('\n'), '\n...');
}
