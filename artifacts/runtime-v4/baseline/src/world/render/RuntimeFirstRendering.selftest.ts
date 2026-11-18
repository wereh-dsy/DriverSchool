import { BoxGeometry, Group, InterleavedBufferAttribute, Matrix4, Mesh, MeshStandardMaterial, PerspectiveCamera } from 'three';
import { drain } from '../../loading/Loading';
import { WorldRenderResources } from './WorldRenderResources';
import { WorldRenderClusters } from './WorldRenderClusters';
import { WorldLODProxies } from './WorldLODProxies';
import { geometryBufferBytes, packStaticGeometrySteps } from './StaticGeometryPacking';
import { PrefabRegistry } from '../city/PrefabRegistry';
import { createSubject3Materials } from '../subject3/materials';

export function runRuntimeFirstRenderingSelfTest() {
  let assertions=0;
  const check=(ok:boolean,message:string)=>{assertions++;if(!ok)throw Error('Runtime first rendering: '+message);};
  const source=new BoxGeometry(2,2,2).toNonIndexed();
  const packed=drain(packStaticGeometrySteps([{geometry:source,transform:new Matrix4()}]));
  check(packed.getAttribute('position').count<source.getAttribute('position').count,'exact duplicate vertices are indexed');
  check(geometryBufferBytes(packed)<geometryBufferBytes(source),'actual backing arrays shrink');
  const p=packed.getAttribute('position');
  check(!('isInterleavedBufferAttribute'in p)&&(packed.getAttribute('normal') as InterleavedBufferAttribute).data===(packed.getAttribute('uv') as InterleavedBufferAttribute).data,'shadow position stays compact; auxiliary attributes share one buffer');
  for(let i=0;i<source.getAttribute('position').count;i++)for(const name of ['position','normal','uv']){
    const before=source.getAttribute(name),after=packed.getAttribute(name),index=packed.index?.getX(i)??i;
    for(let c=0;c<before.itemSize;c++)check(before.getComponent(i,c)===after.getComponent(index,c),'triangle attributes retain exact values and draw order');
  }
  const pool=new WorldRenderResources(1);
  const acquired=drain(pool.acquireSteps(packed));let disposed=0;acquired.addEventListener('dispose',()=>disposed++);
  check(drain(pool.acquireSteps(acquired))===acquired&&disposed===0,'acquiring an owned geometry never disposes its active GPU buffer');
  const clone=packed.clone();check(drain(pool.acquireSteps(clone))===acquired,'interleaved clones share whole immutable geometry');
  check(pool.state.bytes===geometryBufferBytes(packed)&&pool.state.buffers===3,'registry counts position, shared auxiliary data and index once');
  const different=packed.clone();(different.getAttribute('normal') as InterleavedBufferAttribute).offset++;
  check(drain(pool.acquireSteps(different))!==acquired,'different attribute layouts cannot share an entry');
  pool.release(acquired);pool.release(acquired);pool.release(acquired);
  pool.releaseExpired(Infinity);
  check(disposed===1&&pool.state.entries===1,'only idle entries are evicted, without scanning active entries');
  pool.release(different);pool.releaseExpired(Infinity);check(pool.state.entries===0&&pool.state.bytes===0,'idle queue drains and releases buffers');pool.dispose();
  const concurrent=new WorldRenderResources(0), shared=drain(concurrent.acquireSteps(packed.clone()));let sharedDisposed=0;
  shared.addEventListener('dispose',()=>sharedDisposed++);concurrent.release(shared);
  const pending=concurrent.acquireSteps(packed.clone());
  for(let i=0;concurrent.state.idleBytes>0&&i<100;i++)pending.next();
  check(concurrent.state.idleBytes===0,'cross-frame comparison borrows its idle candidate');
  concurrent.releaseExpired(Infinity);check(sharedDisposed===0,'maintenance cannot evict a comparison candidate');
  check(drain(pending)===shared,'comparison transfers its borrow to the returned lease');concurrent.release(shared);
  const cancelled=concurrent.acquireSteps(packed.clone());
  for(let i=0;concurrent.state.idleBytes>0&&i<100;i++)cancelled.next();cancelled.return(undefined as never);
  check(concurrent.state.idleBytes>0,'cancellation returns the temporary comparison borrow');
  concurrent.releaseExpired(Infinity);check(sharedDisposed===1&&concurrent.state.entries===0,'cancelled comparison leaves no retained resource');concurrent.dispose();
  const proxies=new WorldLODProxies(),box=new BoxGeometry(2.13,3.17,2.29);let sourceDisposed=0;box.addEventListener('dispose',()=>sourceDisposed++);
  check(drain(proxies.geometrySteps(box))===box,'a proxy with no triangle saving reuses the exact source');
  proxies.dispose();check(sourceDisposed===0,'proxy shutdown does not dispose borrowed source geometry');box.dispose();
  const materials=createSubject3Materials(),models=new PrefabRegistry(materials);
  const objects=[{id:'regional:prewarm-a',prefabId:'office' as const,facade:'office' as const,buildingShape:'chamfered' as const,position:{x:0,z:0},rotation:0},
    {id:'regional:prewarm-b',prefabId:'office' as const,facade:'office' as const,buildingShape:'chamfered' as const,position:{x:500,z:0},rotation:1,color:'#ffffff'}];
  drain(models.prepareModelsSteps(objects));const stats=models.renderStatistics;
  check(stats.preparation.ready&&stats.preparation.completed===1&&stats.preparation.total===1,'loading prepares each shared model recipe exactly once');
  const instances=models.buildInstances(objects);
  check(models.renderStatistics.templates===stats.templates,'later sector instances reuse the prepared template');
  const world=new WorldRenderClusters(),material=new MeshStandardMaterial();
  const camera=new PerspectiveCamera(60,1,.1,2000);camera.lookAt(0,0,-1);camera.updateMatrixWorld();world.configure(camera.position,1500,[camera]);
  const unknown=new Group(),unknownMesh=new Mesh(new BoxGeometry(),material);unknown.add(unknownMesh);
  unknown.updateWorldMatrix=()=>{throw Error('Synchronous subtree generation in visibility');};world.update(unknown);
  check(unknown.visible,'an unprepared debug root stays conservative without synchronous generation');
  const cells=new Group();for(const y of [0,18,35]){const mesh=new Mesh(new BoxGeometry(),material);mesh.position.set(10,y,10);cells.add(mesh);}drain(world.prepareSteps(cells));
  check(cells.userData.worldClusters.length===1,'building parts share one spatial management node across height');
  const dynamicCopies:Mesh[]=[];instances.traverse(o=>{if(o instanceof Mesh)dynamicCopies.push(o);});
  for(const mesh of dynamicCopies)if('dispose' in mesh)(mesh as Mesh&{dispose():void}).dispose();
  models.dispose();Object.values(materials).forEach(m=>m.dispose());unknownMesh.geometry.dispose();world.dispose();material.dispose();source.dispose();
  return{passed:true,assertions};
}
