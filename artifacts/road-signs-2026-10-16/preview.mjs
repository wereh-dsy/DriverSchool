import fs from 'node:fs';
import http from 'node:http';
import { build } from 'esbuild';
const source = `
import { Scene, PerspectiveCamera, WebGLRenderer, Color, Fog, HemisphereLight, DirectionalLight, Mesh, PlaneGeometry, MeshStandardMaterial, Vector3 } from 'three';
import { RoadBuilder } from './src/world/city/RoadBuilder';
import { RoadSignRenderer } from './src/world/city/RoadSignRenderer';
import { createSubject3Materials } from './src/world/subject3/materials';
import { roadPoints, sampleAt } from './src/world/city/geometry';
import map from './src/world/regional/regional-main.json';
import before from './artifacts/road-signs-2026-10-16/regional-before.json';
const params=new URLSearchParams(location.search), mode=params.get('version')??'after', chosen=params.get('case')??'cluster';
const main=document.createElement('main');main.innerHTML='<nav><strong>高速标牌位置核验</strong><a href="?case=cluster&version=before">密集区 · 调整前</a><a href="?case=cluster&version=after">密集区 · 调整后</a><a href="?case=speed&version=after">限速牌</a><a href="?case=guide&version=after">导流牌</a><span id="status">正在准备</span></nav>';document.body.append(main);
const candidates=map.signs;
const target=chosen==='speed'?candidates.find(s=>s.type==='SPEED_LIMIT'&&s.roadId.startsWith('regional:')&&s.speedLimitKmh===120&&s.stationMetres>50):chosen==='guide'?candidates.find(s=>s.type==='CHEVRON'&&s.roadId.startsWith('regional:')&&s.stationMetres>50):before.find(s=>s.id==='regional:v3:airport-south:E-to-S-star:sign:35');
const road=map.roads.find(r=>r.id===target.roadId), path=roadPoints(road), at=target.stationMetres, reverse=target.laneDirection==='reverse', distance=chosen==='cluster'?110:24;
const frame=sampleAt(path,Math.max(0,at+(reverse?distance:-distance))), sign=reverse?-1:1, right={x:-frame.tangent.z*sign,z:frame.tangent.x*sign}, forward={x:frame.tangent.x*sign,z:frame.tangent.z*sign};
const eye=new Vector3(frame.point.x+right.x*(road.laneCount>1?road.laneWidth:0),(frame.point.y??0)+1.55,frame.point.z+right.z*(road.laneCount>1?road.laneWidth:0));
const scene=new Scene();scene.background=new Color('#b6c9cc');scene.fog=new Fog('#b6c9cc',350,800);scene.add(new HemisphereLight(0xe6f2ff,0x7d8764,2));const sun=new DirectionalLight(0xffffff,2);sun.position.set(60,120,40);scene.add(sun);
const renderer=new WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));document.body.append(renderer.domElement);
const camera=new PerspectiveCamera(65,innerWidth/(innerHeight-54),.1,1200);camera.position.copy(eye);camera.lookAt(eye.x+forward.x*200,eye.y,eye.z+forward.z*200);
const material=createSubject3Materials(), builder=new RoadBuilder(material,map), signs=mode==='before'?before:candidates;
const near=p=>Math.hypot(p.x-frame.point.x,p.z-frame.point.z)<420;
for(const r of map.roads.filter(r=>r.centerline.some(near)))scene.add(builder.build(r));
const signRenderer=new RoadSignRenderer(map.roadNames);const local=signs.filter(s=>near(s.position));scene.add(signRenderer.buildInstances(local));
const ground=new Mesh(new PlaneGeometry(3000,3000).rotateX(-Math.PI/2),new MeshStandardMaterial({color:0x748765}));ground.position.set(frame.point.x,-.06,frame.point.z);scene.add(ground);
const resize=()=>{camera.aspect=innerWidth/(innerHeight-54);camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight-54);renderer.render(scene,camera);};resize();
await renderer.compileAsync(scene,camera);resize();document.querySelector('#status').textContent='READY · '+chosen+' · '+mode+' · 视点距目标 '+distance+' m · 本地标牌 '+local.length;
window.addEventListener('resize',resize);
`;
const bundle = await build({ stdin: { contents: source, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'browser', format: 'esm', target: 'es2022', write: false, logLevel: 'silent' });
http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.url.startsWith('/preview.js')) { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].contents); }
  else { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><meta charset="utf-8"><title>高速标牌位置核验</title><style>body{margin:0;overflow:hidden;background:#101719;color:#eee;font:14px sans-serif}nav{height:54px;display:flex;align-items:center;gap:18px;padding:0 18px}a{color:#bfe0ee}#status{font-size:12px;color:#b7c9b8}canvas{display:block}</style><script type="module" src="/preview.js"></script>'); }
}).listen(5193, '127.0.0.1', () => console.log('SIGN_PREVIEW_READY http://127.0.0.1:5193/'));
