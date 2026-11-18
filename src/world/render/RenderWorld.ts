import {Frustum,InstancedMesh,Matrix4,Mesh,Sphere,type BufferGeometry,type Camera,type Object3D,type Vector3} from 'three';
import {RenderWorldCompiler} from './RenderWorldCompiler';
import {renderResourceHandle} from './RenderResourceHandles';
import {MAX_RENDER_VIEWS,RECORD_STRIDE,VIEW_STRIDE,packetTransfers,type RenderPacket,type RenderWorldReply,type RenderWorldQuery} from './RenderWorldProtocol';

interface Adapter {mesh:Mesh;root:Object3D;generation:number;appliedGeneration:number;originalCulling:boolean;matrixAutoUpdate:boolean;matrixWorldAutoUpdate:boolean;geometry:BufferGeometry;variants?:readonly BufferGeometry[];lod:number;material:Mesh['material']}
/** Authoritative static draw database. Object3D is an immutable WebGL adapter,
 * not the spatial index. Only publication/removal touches the ownership tree. */
export class RenderWorld {
  private data=new Float64Array(0);
  private transforms=new Float64Array(0);
  private marks=new Uint32Array(0);
  private adapters:(Adapter|undefined)[]=[];
  private free:number[]=[];
  private readonly slots=new WeakMap<Mesh,number>();
  private readonly owners=new WeakMap<Object3D,Set<number>>();
  private readonly rootIds=new WeakMap<Object3D,number>();
  private nextOwner=1;
  private generation=0;
  private revision=0;
  private readonly dirty=new Set<number>();
  private readonly unacknowledged=new Set<number>();
  private readonly roots=new Map<Object3D,boolean>();
  private readonly visited=new Set<Object3D>();
  private visible:number[]=[];
  private nextVisible:number[]=[];
  private tick=0;
  private readonly frustum=new Frustum();
  private readonly matrix=new Matrix4();
  private readonly sphere=new Sphere();
  private readonly pendingViews=new Float64Array(MAX_RENDER_VIEWS*VIEW_STRIDE);
  private readonly viewBuffers:Float64Array[]=[new Float64Array(MAX_RENDER_VIEWS*VIEW_STRIDE),new Float64Array(MAX_RENDER_VIEWS*VIEW_STRIDE)];
  private cameras:readonly Camera[]=[];
  private shadowStart=MAX_RENDER_VIEWS;
  private sequence=0;
  private sent=0;
  private sentAt=0;
  private inFlight=false;
  private packet?:RenderPacket;
  private packetViews?:Float64Array;
  private recycle?:RenderPacket;
  private receivedAt=0;
  private worker?:Worker;
  private readonly local?:RenderWorldCompiler;
  private disposed=false;
  error?:Error;
  readonly jobs={submitted:0,completed:0,coalesced:0,stale:0,patches:0,cpuMs:0,maxCpuMs:0,roundTripMs:0,maxRoundTripMs:0,queueMessageAndMainWaitMs:0,applyMs:0,maxApplyMs:0,fallbackViews:0};
  constructor(){
    if(typeof window==='undefined'){this.local=new RenderWorldCompiler();return;}
    try{
      this.worker=new Worker(new URL('./RenderWorld.worker.ts',import.meta.url),{type:'module',name:'RenderWorld preparation'});
      this.worker.onmessage=(event:MessageEvent<RenderWorldReply>)=>this.receive(event.data);
      this.worker.onerror=event=>{this.error=new Error('RenderWorld Worker: '+event.message);this.worker?.terminate();this.worker=undefined;this.inFlight=false;};
    }catch(error){this.error=error instanceof Error?error:new Error(String(error));}
  }
  *registerSteps(root:Object3D,nodes:readonly Object3D[]):Generator<void>{
    let set=this.owners.get(root);if(!set){set=new Set();this.owners.set(root,set);this.rootIds.set(root,this.nextOwner++);}
    const stack=[...nodes];let steps=0;
    while(stack.length){const object=stack.pop()!;for(const child of object.children)stack.push(child);
      if(!(object instanceof Mesh))continue;
      let slot=this.slots.get(object);
      if(slot!==undefined){this.adoptMesh(root,object);this.updateTransform(object,object.matrixWorld);continue;}
      slot=this.free.pop()??this.adapters.length;
      if(slot*RECORD_STRIDE>=this.data.length){const capacity=Math.ceil((slot+1)/1024)*1024,data=new Float64Array(capacity*RECORD_STRIDE),transforms=new Float64Array(capacity*16),marks=new Uint32Array(capacity);data.set(this.data);transforms.set(this.transforms);marks.set(this.marks);this.data=data;this.transforms=transforms;this.marks=marks;}
      const generation=++this.generation,variants=object.userData.worldLODGeometries as BufferGeometry[]|undefined;
      this.adapters[slot]={mesh:object,root,generation,appliedGeneration:0,originalCulling:object.frustumCulled,matrixAutoUpdate:object.matrixAutoUpdate,matrixWorldAutoUpdate:object.matrixWorldAutoUpdate,geometry:object.geometry,variants,lod:0,material:object.material};this.slots.set(object,slot);set.add(slot);this.visible.push(slot);
      if(object instanceof InstancedMesh){if(!object.boundingSphere)object.computeBoundingSphere();this.sphere.copy(object.boundingSphere!);}
      else {if(!object.geometry.boundingSphere)object.geometry.computeBoundingSphere();this.sphere.copy(object.geometry.boundingSphere!);}
      this.sphere.applyMatrix4(object.matrixWorld);const p=this.sphere.center,material=Array.isArray(object.material)?object.material[0]!:object.material;
      this.data.set([slot,generation,p.x,p.y,p.z,this.sphere.radius,this.rootIds.get(root)!,renderResourceHandle(object.geometry),renderResourceHandle(material),(object.castShadow?1:0)|(object.receiveShadow?2:0),this.roots.get(root)?1:0,variants?7:1],slot*RECORD_STRIDE);
      this.transforms.set(object.matrixWorld.elements,slot*16);this.unacknowledged.add(slot);this.touch(slot);
      if(++steps%16===0)yield;
    }
  }
  private touch(slot:number):void {this.dirty.add(slot);this.revision++;}
  updateTransform(mesh:Mesh,matrix:Matrix4):{root:Object3D;sphere:Sphere} {
    const slot=this.slots.get(mesh);if(slot===undefined)throw Error('RenderWorld transform update requires a registered draw');
    const adapter=this.adapters[slot]!;this.transforms.set(matrix.elements,slot*16);
    if(mesh instanceof InstancedMesh){if(!mesh.boundingSphere)mesh.computeBoundingSphere();this.sphere.copy(mesh.boundingSphere!);}
    else{if(!adapter.geometry.boundingSphere)adapter.geometry.computeBoundingSphere();this.sphere.copy(adapter.geometry.boundingSphere!);}
    this.sphere.applyMatrix4(matrix);const p=this.sphere.center;this.data.set([p.x,p.y,p.z,this.sphere.radius],slot*RECORD_STRIDE+2);
    this.data[slot*RECORD_STRIDE+1]=adapter.generation=++this.generation;this.unacknowledged.add(slot);this.touch(slot);return{root:adapter.root,sphere:this.sphere};
  }
  adoptMesh(root:Object3D,mesh:Mesh):void {
    const slot=this.slots.get(mesh);if(slot===undefined)return;const adapter=this.adapters[slot]!;
    this.owners.get(adapter.root)?.delete(slot);let set=this.owners.get(root);if(!set){set=new Set();this.owners.set(root,set);this.rootIds.set(root,this.nextOwner++);}set.add(slot);adapter.root=root;
    this.data[slot*RECORD_STRIDE+6]=this.rootIds.get(root)!;this.data[slot*RECORD_STRIDE+10]=this.roots.get(root)?1:0;
    this.data[slot*RECORD_STRIDE+1]=adapter.generation=++this.generation;this.unacknowledged.add(slot);this.touch(slot);
  }
  adopt(root:Object3D,previous:Object3D):void {
    for(const slot of [...this.owners.get(previous)??[]]){const mesh=this.adapters[slot]?.mesh;if(!mesh)continue;let parent: Object3D|null=mesh;while(parent&&parent!==root)parent=parent.parent;if(parent===root)this.adoptMesh(root,mesh);}
  }
  release(object:Object3D):void {
    if(!(object instanceof Mesh))return;const slot=this.slots.get(object);if(slot===undefined)return;
    const adapter=this.adapters[slot]!;object.frustumCulled=adapter.originalCulling;object.geometry=adapter.geometry;object.matrixAutoUpdate=adapter.matrixAutoUpdate;object.matrixWorldAutoUpdate=adapter.matrixWorldAutoUpdate;object.visible=true;delete object.userData.renderWorldRank;
    this.owners.get(adapter.root)?.delete(slot);this.adapters[slot]=undefined;this.slots.delete(object);this.unacknowledged.delete(slot);this.data[slot*RECORD_STRIDE+10]=0;this.data[slot*RECORD_STRIDE+1]=++this.generation;this.free.push(slot);this.touch(slot);
  }
  deactivate(root:Object3D):void {this.setEnabled(root,false);this.roots.delete(root);}
  private setEnabled(root:Object3D,enabled:boolean):void {
    if(this.roots.get(root)===enabled)return;this.roots.set(root,enabled);
    for(const slot of this.owners.get(root)??[]){this.data[slot*RECORD_STRIDE+10]=enabled?1:0;const adapter=this.adapters[slot]!;this.data[slot*RECORD_STRIDE+1]=adapter.generation=++this.generation;this.unacknowledged.add(slot);this.touch(slot);}
  }
  visit(root:Object3D,enabled=true):void {this.visited.add(root);this.setEnabled(root,enabled);}
  finish():void {for(const [root,enabled] of this.roots)if(enabled&&!this.visited.has(root))this.setEnabled(root,false);this.send();}
  configure(eye:Vector3,far:number,cameras:readonly Camera[],shadows:readonly Camera[]=[]):void {
    this.visited.clear();this.cameras=cameras;this.shadowStart=cameras.length;
    const count=Math.min(MAX_RENDER_VIEWS,cameras.length+shadows.length);
    for(let v=0;v<count;v++){
      const camera=v<cameras.length?cameras[v]!:shadows[v-cameras.length]!,at=v*VIEW_STRIDE;
      camera.updateWorldMatrix(true,false);this.frustum.setFromProjectionMatrix(this.matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
      for(let i=0;i<6;i++){const plane=this.frustum.planes[i]!,p=at+i*4;this.pendingViews[p]=plane.normal.x;this.pendingViews[p+1]=plane.normal.y;this.pendingViews[p+2]=plane.normal.z;this.pendingViews[p+3]=plane.constant;}
      const e=camera.matrixWorldInverse.elements;this.pendingViews.set([e[2]!,e[6]!,e[10]!,e[14]!,eye.x,eye.y,eye.z,v<cameras.length?far:Infinity,performance.now(),v<cameras.length?0:1,32],at+24);
    }
    this.pendingCount=count;this.sequence++;if(this.inFlight)this.jobs.coalesced++;
  }
  private pendingCount=0;
  private send():void {
    if(this.disposed||this.inFlight||this.sent===this.sequence||!this.pendingCount||(!this.worker&&!this.local))return;
    if(this.dirty.size){const count=Math.min(this.dirty.size,512),records=new Float64Array(count*RECORD_STRIDE);let i=0;
      for(const slot of this.dirty){records.set(this.data.subarray(slot*RECORD_STRIDE,(slot+1)*RECORD_STRIDE),i++*RECORD_STRIDE);this.dirty.delete(slot);if(i===count)break;}
      const patch={type:'patch' as const,revision:this.revision,records};this.jobs.patches++;
      if(this.local)this.local.patch(patch);else this.worker!.postMessage(patch,[records.buffer]);
    }
    const views=this.viewBuffers.pop()??new Float64Array(MAX_RENDER_VIEWS*VIEW_STRIDE);views.set(this.pendingViews);
    const query:RenderWorldQuery={type:'query',revision:this.revision,sequence:this.sequence,count:this.pendingCount,views,recycle:this.recycle};this.recycle=undefined;this.sent=this.sequence;this.sentAt=performance.now();this.inFlight=true;this.jobs.submitted++;
    if(this.local){this.receive({type:'packet',packet:this.local.compile(query),views});return;}
    this.worker!.postMessage(query,[views.buffer as ArrayBuffer,...query.recycle?packetTransfers(query.recycle):[]]);
  }
  private receive(reply:RenderWorldReply):void {
    if(this.disposed)return;this.inFlight=false;
    if(this.packet&&reply.packet.sequence<=this.packet.sequence){this.jobs.stale++;this.recycle=reply.packet;this.viewBuffers.push(reply.views);return;}
    if(this.packet)this.recycle=this.packet;if(this.packetViews)this.viewBuffers.push(this.packetViews);
    this.packet=reply.packet;this.packetViews=reply.views;this.receivedAt=performance.now();this.jobs.completed++;this.jobs.cpuMs=reply.packet.cpuMs;this.jobs.maxCpuMs=Math.max(this.jobs.maxCpuMs,reply.packet.cpuMs);
    this.jobs.roundTripMs=this.receivedAt-this.sentAt;this.jobs.maxRoundTripMs=Math.max(this.jobs.maxRoundTripMs,this.jobs.roundTripMs);this.jobs.queueMessageAndMainWaitMs=Math.max(0,this.jobs.roundTripMs-reply.packet.cpuMs);
    for(const slot of this.unacknowledged)if(this.packet.generations[slot]===this.adapters[slot]?.generation)this.unacknowledged.delete(slot);
  }
  private viewFresh(view:number):boolean {
    const old=this.packetViews;if(view<0||!old||!this.packet||view>=this.packet.count||performance.now()-this.receivedAt>100)return false;
    const at=view*VIEW_STRIDE,now=this.pendingViews,dx=old[at+28]!-now[at+28]!,dy=old[at+29]!-now[at+29]!,dz=old[at+30]!-now[at+30]!;
    if(dx*dx+dy*dy+dz*dz>100)return false;
    for(let i=0;i<24;i+=4)if(old[at+i]!*now[at+i]!+old[at+i+1]!*now[at+i+1]!+old[at+i+2]!*now[at+i+2]!<.9986)return false;
    return true;
  }
  beforeView(camera:Camera,shadow=false):void {
    const started=performance.now(),packet=this.packet;let view=shadow?this.shadowStart:this.cameras.indexOf(camera),fresh=this.viewFresh(view);
    if(view<0||view>=MAX_RENDER_VIEWS)fresh=false;
    const tick=++this.tick;this.nextVisible.length=0;
    const use=(slot:number)=>{const adapter=this.adapters[slot];if(!adapter||!this.data[slot*RECORD_STRIDE+10])return;this.marks[slot]=tick;adapter.mesh.visible=true;adapter.mesh.frustumCulled=shadow||!fresh?adapter.originalCulling:false;adapter.mesh.userData.renderWorldRank=this.nextVisible.length;
      if(adapter.appliedGeneration!==adapter.generation){adapter.mesh.matrixWorld.fromArray(this.transforms,slot*16);adapter.mesh.matrixAutoUpdate=false;adapter.mesh.matrixWorldAutoUpdate=false;adapter.mesh.castShadow=!!(this.data[slot*RECORD_STRIDE+9]!&1);adapter.mesh.receiveShadow=!!(this.data[slot*RECORD_STRIDE+9]!&2);adapter.appliedGeneration=adapter.generation;}
      if(adapter.material!==adapter.mesh.material){adapter.material=adapter.mesh.material;this.data[slot*RECORD_STRIDE+8]=renderResourceHandle(Array.isArray(adapter.material)?adapter.material[0]!:adapter.material);this.touch(slot);}
      if(adapter.variants&&packet?.generations[slot]===adapter.generation){const lod=(packet.lod[slot]??1)-1;if(lod!==adapter.lod){adapter.mesh.geometry=adapter.variants[lod]??adapter.geometry;adapter.lod=lod;this.data[slot*RECORD_STRIDE+7]=renderResourceHandle(adapter.mesh.geometry);this.touch(slot);}}
      this.nextVisible.push(slot);};
    if(fresh&&packet){
      for(let i=packet.offsets[view]!;i<packet.offsets[view+1]!;i++){const slot=packet.draws[i]!;if(packet.generations[slot]===this.adapters[slot]?.generation)use(slot);}
      // New/reused slots not yet in the snapshot stay conservative until acked.
      for(const slot of this.unacknowledged)use(slot);
    }else {this.jobs.fallbackViews++;for(let i=0;i<this.adapters.length;i++)if(this.adapters[i])use(i);}
    for(const slot of this.visible)if(this.marks[slot]!==tick){const adapter=this.adapters[slot];if(adapter)adapter.mesh.visible=false;}
    const previous=this.visible;this.visible=this.nextVisible;this.nextVisible=previous;
    const elapsed=performance.now()-started;this.jobs.applyMs=elapsed;this.jobs.maxApplyMs=Math.max(this.jobs.maxApplyMs,elapsed);
  }
  get ready():boolean{return !!this.packet&&!this.dirty.size&&!this.unacknowledged.size&&!this.error;}
  get state(){return{backend:this.local?((globalThis as unknown as {__driverSchoolRendererOwner?:boolean}).__driverSchoolRendererOwner?'renderer-worker':'local-test'):'worker',records:this.adapters.length-this.free.length,capacity:this.data.length/RECORD_STRIDE,cpuBytes:this.data.byteLength+this.transforms.byteLength+this.marks.byteLength,revision:this.revision,packetRevision:this.packet?.revision??0,pendingPatches:this.dirty.size,ready:this.ready,error:this.error?.message,jobs:{...this.jobs}};}
  dispose():void {this.disposed=true;this.worker?.terminate();this.worker=undefined;for(const adapter of this.adapters)if(adapter){adapter.mesh.frustumCulled=adapter.originalCulling;adapter.mesh.geometry=adapter.geometry;adapter.mesh.visible=true;delete adapter.mesh.userData.renderWorldRank;}this.adapters.length=0;this.free.length=0;this.visible.length=0;this.nextVisible.length=0;this.roots.clear();this.dirty.clear();this.unacknowledged.clear();this.packet=undefined;this.packetViews=undefined;this.recycle=undefined;this.data=new Float64Array(0);this.transforms=new Float64Array(0);this.marks=new Uint32Array(0);this.viewBuffers.length=0;}
}
