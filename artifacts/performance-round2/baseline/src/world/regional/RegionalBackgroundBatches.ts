import { Box3, BufferAttribute, BufferGeometry, Group, Mesh, Sphere, Vector3, type Material } from 'three';
import type { VisualGeometryData } from '../city/VisualStreamingData';
interface Batch { mesh: Mesh; used: number; capacity: number; bounds: Box3 }
interface Addition {key:string;role:number;data:VisualGeometryData;material:Material;batchKey:string;bytes:number}
/** Spatially bounded append buffers, rather than a new permanent Mesh every update frame. */
export class RegionalBackgroundBatches {
  public readonly root = new Group();
  private readonly batches = new Map<string, Batch>();
  private readonly queued:Addition[]=[];
  private prepare?: (root:Group)=>Promise<unknown>;
  private preparingRoot?:Group;
  private preparation?:Promise<unknown>;
  private allowed?:ReadonlySet<string>;
  private cancelled=false;
  private queuedBytes=0;
  private peakStagingBytes=0;
  public error:Error|undefined;
  public setPreparation(prepare:(root:Group)=>Promise<unknown>):void {this.prepare=prepare;}
  get pendingPreparation(){return this.preparation;}
  get ready(){return !this.queued.length&&!this.preparation;}
  get canAccept(){return this.queuedBytes<8*1024*1024;}
  get statistics(){return{queued:this.queued.length,queuedBytes:this.queuedBytes,queueBudgetBytes:8*1024*1024,stagingBatches:this.preparation?1:0,peakStagingBytes:this.peakStagingBytes};}
  public get count(): number { return this.batches.size; }
  public retainGroups(groups:ReadonlySet<string>):void {
    this.allowed=new Set(groups);
    for(let i=this.queued.length-1;i>=0;i--)if(!groups.has(this.queued[i]!.batchKey.split(':')[0]!)){this.queuedBytes-=this.queued[i]!.bytes;this.queued.splice(i,1);}
    for(const [key,batch]of this.batches)if(!groups.has(key.slice(0,key.indexOf(':')))){
      batch.mesh.geometry.dispose();batch.mesh.removeFromParent();this.batches.delete(key);
    }
  }
  public append(key: string, role: number, data: VisualGeometryData, material: Material): void {
    if(this.cancelled||!data.position.length)return;
    if(this.prepare){const bytes=data.position.byteLength+data.normal.byteLength+(data.color?.byteLength??0)+(data.index?.byteLength??0);this.queued.push({key,role,data,material,bytes,batchKey:this.batchKey(key,role,material)});this.queuedBytes+=bytes;return;}
    this.appendTo(this.batches,this.root,key,role,data,material);
  }
  private batchKey(key:string,role:number,material:Material):string {const coordinates=key.split(',').map(Number);return `${Math.floor(coordinates[0]!/8)},${Math.floor(coordinates[1]!/8)}:${role}:${material.uuid}`;}
  /** A single unpublished replacement batch borrows its material. The live
   * geometry remains visible and immutable until GPU preparation completes. */
  public advance():void {
    if(!this.prepare||this.preparation||!this.queued.length||this.cancelled||this.error)return;
    const key=this.queued[0]!.batchKey,staged=new Map<string,Batch>(),root=new Group();root.name='远景资源';root.userData.streamingPriority=10000;
    const previous=this.batches.get(key);
    if(previous){const mesh=new Mesh(previous.mesh.geometry.clone(),previous.mesh.material);staged.set(key,{mesh,used:previous.used,capacity:previous.capacity,bounds:previous.bounds.clone()});root.add(mesh);}
    for(let i=0;i<this.queued.length;) {const addition=this.queued[i]!;if(addition.batchKey!==key){i++;continue;}this.queued.splice(i,1);this.queuedBytes-=addition.bytes;this.appendTo(staged,root,addition.key,addition.role,addition.data,addition.material);}
    const batch=staged.get(key)!;let bytes=0;for(const a of Object.values(batch.mesh.geometry.attributes))bytes+=a.array.byteLength;this.peakStagingBytes=Math.max(this.peakStagingBytes,bytes);
    root.updateMatrixWorld(true);this.preparingRoot=root;
    this.preparation=this.prepare(root).then(()=>{
      if(this.cancelled||this.allowed&&!this.allowed.has(key.split(':')[0]!)){batch.mesh.geometry.dispose();return;}
      if(previous){previous.mesh.removeFromParent();previous.mesh.geometry.dispose();}
      this.batches.set(key,batch);this.root.add(batch.mesh);
    },error=>{batch.mesh.geometry.dispose();this.error=error instanceof Error?error:new Error(String(error));}).finally(()=>{root.clear();this.preparation=undefined;this.preparingRoot=undefined;});
  }
  public cancel():void {this.cancelled=true;this.queued.length=0;this.queuedBytes=0;if(this.preparingRoot)this.preparingRoot.userData.streamingWarmupCancelled=true;}
  private appendTo(batches:Map<string,Batch>,root:Group,key:string,role:number,data:VisualGeometryData,material:Material):void {
    if (!data.position.length) return;
    const batchKey=this.batchKey(key,role,material);
    let b = batches.get(batchKey);
    if (!b) {
      const mesh = new Mesh(new BufferGeometry(), material); mesh.name = `Regional background batch ${batchKey}`;
      b = { mesh, used: 0, capacity: 0, bounds: new Box3() }; batches.set(batchKey, b); root.add(mesh);
    }
    const count = data.index?.length??data.position.length / 3, required = b.used + count;
    if (required > b.capacity) {
      b.capacity = Math.max(2048, 2 ** Math.ceil(Math.log2(required)));
      // Dispose while the old attributes are still installed, so their GPU buffers are freed.
      b.mesh.geometry.dispose();
      for (const name of data.color ? ['position', 'normal', 'color'] : ['position', 'normal']) {
        const old = b.mesh.geometry.getAttribute(name), a = new Float32Array(b.capacity * 3);
        if (old) a.set(old.array);
        b.mesh.geometry.setAttribute(name, new BufferAttribute(a, 3));
      }
    }
    for (const [name, source] of [['position', data.position], ['normal', data.normal], ['color', data.color]] as const) {
      if (!source) continue;
      const attribute = b.mesh.geometry.getAttribute(name) as BufferAttribute;
      const destination=attribute.array as Float32Array;
      if(data.index){for(let i=0;i<count;i++){const sourceAt=data.index[i]!*3,at=(b.used+i)*3;destination[at]=source[sourceAt]!;destination[at+1]=source[sourceAt+1]!;destination[at+2]=source[sourceAt+2]!;}}
      else destination.set(source,b.used*3);
      attribute.addUpdateRange(b.used * 3,count*3); attribute.needsUpdate = true;
    }
    b.used = required; b.mesh.geometry.setDrawRange(0, b.used);
    b.bounds.union(new Box3(new Vector3(data.bounds[0], data.bounds[1], data.bounds[2]), new Vector3(data.bounds[3], data.bounds[4], data.bounds[5])));
    b.mesh.geometry.boundingBox = b.bounds;
    b.mesh.geometry.boundingSphere = b.bounds.getBoundingSphere(b.mesh.geometry.boundingSphere ?? new Sphere());
  }
  public dispose(): void {this.cancel(); for (const b of this.batches.values()) b.mesh.geometry.dispose(); this.batches.clear(); this.root.clear(); }
}
