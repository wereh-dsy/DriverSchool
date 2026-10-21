import fs from 'node:fs';import {EditorSpatialIndex,bounds,project} from '../../src/editor/EditorGeometry';import {roadPoints} from '../../src/world/city/geometry';
const dir='artifacts/map-elevation-seam-audit',before=JSON.parse(fs.readFileSync(dir+'/continuation-before-map.json','utf8')),after=JSON.parse(fs.readFileSync(process.argv[2]??'src/world/regional/regional-main.json','utf8'));
const originals=new Map<string,any>(before.roads.map((r:any)=>[r.id,r])),paths=new Map<string,any[]>(after.roads.map((r:any)=>[r.id,roadPoints(r)])),oldPaths=new Map<string,any[]>(before.roads.map((r:any)=>[r.id,roadPoints(r)])),segments:any[]=[],index=new EditorSpatialIndex(64),rows:any[]=[];
for(const r of after.roads){const p=paths.get(r.id)!;for(let i=1;i<p.length;i++){const a=p[i-1],b=p[i];index.set(String(segments.length),bounds([a,b],.001));segments.push({r,a,b});}}
const seen=new Set<string>();
for(const s of segments){if(JSON.stringify(s.r)===JSON.stringify(originals.get(s.r.id)))continue;
 for(const id of index.query(bounds([s.a,s.b],.001))){const t=segments[Number(id)];if(s.r.id===t.r.id)continue;const ux=s.b.x-s.a.x,uz=s.b.z-s.a.z,vx=t.b.x-t.a.x,vz=t.b.z-t.a.z,den=ux*vz-uz*vx;if(Math.abs(den)<1e-9)continue;const qx=t.a.x-s.a.x,qz=t.a.z-s.a.z,u=(qx*vz-qz*vx)/den,v=(qx*uz-qz*ux)/den;if(u<0||u>1||v<0||v>1)continue;
 const p={x:s.a.x+u*ux,z:s.a.z+u*uz},key=[s.r.id,t.r.id].sort().join('|')+':'+p.x.toFixed(2)+':'+p.z.toFixed(2);if(seen.has(key))continue;seen.add(key);
 const y=(s.a.y??0)+u*((s.b.y??0)-(s.a.y??0)),other=(t.a.y??0)+v*((t.b.y??0)-(t.a.y??0)),old=project(oldPaths.get(s.r.id)!,p).point.y??0,oldOther=project(oldPaths.get(t.r.id)!,p).point.y??0,a=Math.abs(y-other),b=Math.abs(old-oldOther);if(Math.abs(a-b)<.05)continue;
 const owned=after.intersections.some((j:any)=>j.connections.some((c:any)=>c.roadId===s.r.id)&&j.connections.some((c:any)=>c.roadId===t.r.id));
 rows.push({roadIds:[s.r.id,t.r.id],point:p,beforeGap:b,afterGap:a,owned,regression:!owned&&(b>=5.5&&a<5.5-.01||b>=2&&a<1.75||((old-oldOther)*(y-other)<-.01))});
 }}
fs.writeFileSync(dir+'/changed-crossing-audit.json',JSON.stringify({rows,regressions:rows.filter(r=>r.regression)},null,2));console.log(JSON.stringify(rows.filter(r=>r.regression),null,2));
