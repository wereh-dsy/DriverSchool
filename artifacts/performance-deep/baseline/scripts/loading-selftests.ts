import assert from 'node:assert/strict';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { createHash } from 'node:crypto';
import { VehicleAssetRegistry } from '../src/vehicle/visual/VehicleAssetRegistry';
import { runBatched, drain } from '../src/loading/Loading';
import { CityGround } from '../src/world/city/CityGround';
import { cityGroundGeometrySteps, cityGroundGeometry } from '../src/world/city/CityGroundGeometry';
import { loadCityMap } from '../src/world/city/CityMapLoader';
import { GameUIController, type GameUICommands } from '../src/ui/controller/GameUIController';
import { runVehiclePoseConsistencySelfTest } from '../src/vehicle/visual/VehicleVisualDimensions.selftest';
import { prepareCityMain, cityMainRuntime, takePreparedCityWorker } from '../src/world/city/CityMainResource';
import { runNavigationDisplaysSelfTest } from '../src/vehicle/visual/NavigationDisplays.selftest';
import { readFileSync } from 'node:fs';

const source = JSON.parse(readFileSync('src/world/city/maps/city-alpha.json','utf8'));
const map = loadCityMap(source);
const sync = new CityGround(map), asyncGround = new CityGround(map, {deferred:true});
let heartbeats = 0; const pulse = setInterval(() => heartbeats++, 0);
await asyncGround.prepare(); clearInterval(pulse);
assert.ok(heartbeats > 0, 'world preparation yields for UI/timer work');
assert.deepEqual(asyncGround.colliders, sync.colliders, 'batched path preserves every collider and order');
assert.deepEqual(asyncGround.spawnPose, sync.spawnPose);
let samples = 0;
for (const road of sync.roadNetwork.segments) for (const point of road.centerline.slice(0,3)) {
  assert.deepEqual(asyncGround.sampleRoadSurface(point.x,point.z),sync.sampleRoadSurface(point.x,point.z)); samples++;
}
const geometry = cityGroundGeometry(map), batchedGeometry = await runBatched(cityGroundGeometrySteps(map));
const hash = (a: ArrayLike<number>) => createHash('sha256').update(JSON.stringify(Array.from(a))).digest('hex');
assert.equal(hash(geometry.attributes.position!.array),hash(batchedGeometry.attributes.position!.array));
geometry.dispose(); batchedGeometry.dispose(); asyncGround.dispose(); sync.dispose();
const sequence:number[]=[]; const generator = function*(){for(let i=0;i<10;i++){sequence.push(i);yield;}return 10;};
assert.equal(drain(generator()),10); assert.deepEqual(sequence,[0,1,2,3,4,5,6,7,8,9]);
console.log('Batched world geometry/colliders/surfaces:', {samples,heartbeats});

const assets = new VehicleAssetRegistry(), owners = [{},{},{},{},{}];
const build = (root:Group) => root.add(new Mesh(new BoxGeometry(1,1,1),new MeshStandardMaterial({color:0x123456})));
assets.prepareSection(owners[0]!, 'body', build); assets.retain(owners[0]);
const a = assets.section(owners[0]!, 'body',build), b = assets.section(owners[0]!, 'body',build);
const ma = a.children[0] as Mesh<BoxGeometry,MeshStandardMaterial>, mb = b.children[0] as typeof ma;
ma.material.color.set(0xff0000);
assert.equal(mb.material.color.getHex(),0x123456); assert.equal(ma.geometry,mb.geometry);
for(const owner of owners.slice(1)) assets.prepareSection(owner,'body',build);
assets.prune(3); assert.equal(assets.owns(ma.geometry),true,'live borrowed geometry survives eviction');
ma.material.dispose();mb.material.dispose();assets.release(owners[0]);assets.dispose();
console.log('Immutable geometry / private materials / bounded eviction: PASS');
console.log('Existing wheel/physics pose consistency:',runVehiclePoseConsistencySelfTest());
console.log('Existing private navigation/display resources:',runNavigationDisplaysSelfTest());

let finish!:()=>void;
const backend:GameUICommands={startDrive:()=>new Promise<void>(resolve=>finish=resolve),selectMap:()=>{},selectVehicle:()=>{},openSettings:()=>{},screenChanged:()=>{},hudChanged:()=>{}};
const ui=new GameUIController(backend,{loadText:async()=>null,saveText:async()=>{}},'vehicle','world');
ui.setBusy(false); ui.startDrive();assert.equal(ui.state.screen,'loading');assert.equal(ui.state.hasSession,false);assert.equal(ui.state.busy,true);
finish();await Promise.resolve();assert.equal(ui.state.screen,'driving');assert.equal(ui.state.busy,false);
ui.pause();ui.resume();assert.equal(ui.state.screen,'driving');
backend.startDrive=()=>Promise.reject(new Error('fixture'));ui.navigate('main');ui.startDrive();await Promise.resolve();
assert.equal(ui.state.loading.phase,'error');assert.equal(ui.state.busy,false);
console.log('Async loading / ready / recoverable error UI: PASS');

let workerCount=0;
class WorkerFixture {
 onmessage: ((event:{data:unknown})=>void)|null=null; onerror:unknown=null;
 constructor(){workerCount++;}
 postMessage(message:{kind:string}){if(message.kind==='loadRuntime')queueMicrotask(()=>this.onmessage?.({data:{kind:'runtime',data:{map,roadNetwork:{}},loadMs:2,parseMs:3}}));}
 terminate(){}
}
Object.defineProperty(globalThis,'document',{configurable:true,value:{baseURI:'http://127.0.0.1/'}});
Object.defineProperty(globalThis,'Worker',{configurable:true,value:WorkerFixture});
const first=await prepareCityMain();const second=await prepareCityMain();assert.equal(first.mapParseMs,3);assert.equal(second.cached,true);assert.equal(workerCount,1);
assert.ok(takePreparedCityWorker(cityMainRuntime().map));assert.equal(takePreparedCityWorker(cityMainRuntime().map),undefined);
delete (globalThis as {document?:unknown}).document;delete (globalThis as {Worker?:unknown}).Worker;
console.log('One runtime request / parse and one-time Worker handoff: PASS');
