import {BufferGeometry,InstancedMesh,Texture,type Mesh,type WebGLRenderTarget,type WebGLRenderer} from 'three';
import {renderResourceHandle} from './RenderResourceHandles';
type Kind='geometry'|'instances'|'texture'|'target';
interface Resource {addEventListener(type:'dispose',listener:()=>void):void;removeEventListener(type:'dispose',listener:()=>void):void}
interface Entry {resource:Resource;kind:Kind;cpuBytes:number;prepared:boolean;release:()=>void}
const registries=new WeakMap<WebGLRenderer,GPUResourceResidency>();
/** Backend-wide residency ledger, borrowing existing asset/sector ownership.
 * It never disposes borrowed resources or equates CPU arrays with driver VRAM. */
export class GPUResourceResidency {
  private ids=new WeakMap<object,number>();
  private readonly entries=new Map<number,Entry>();
  private released=0;
  private readonly counts={geometry:0,instances:0,texture:0,target:0};
  private cpuBytes=0;
  private preparedCount=0;
  static forRenderer(renderer:WebGLRenderer):GPUResourceResidency {let registry=registries.get(renderer);if(!registry){registry=new GPUResourceResidency();registries.set(renderer,registry);}return registry;}
  private register(resource:Resource,kind:Kind,cpuBytes:number):number {
    const known=this.ids.get(resource);if(known!==undefined)return known;
    const id=renderResourceHandle(resource),release=()=>{const entry=this.entries.get(id);if(!entry)return;resource.removeEventListener('dispose',release);this.entries.delete(id);this.ids.delete(resource);this.released++;this.counts[kind]--;this.cpuBytes-=cpuBytes;if(entry.prepared)this.preparedCount--;};
    this.ids.set(resource,id);this.entries.set(id,{resource,kind,cpuBytes,prepared:false,release});this.counts[kind]++;this.cpuBytes+=cpuBytes;resource.addEventListener('dispose',release);return id;
  }
  geometry(geometry:BufferGeometry):number {
    const known=this.ids.get(geometry);if(known!==undefined)return known;
    const seen=new Set<unknown>();let bytes=0;
    for(const attribute of [...Object.values(geometry.attributes),...geometry.index?[geometry.index]:[]])if(!seen.has(attribute.array)){seen.add(attribute.array);bytes+=attribute.array.byteLength;}
    return this.register(geometry,'geometry',bytes);
  }
  object(mesh:Mesh):void {this.geometry(mesh.geometry);if(mesh instanceof InstancedMesh)this.register(mesh,'instances',mesh.instanceMatrix.array.byteLength+(mesh.instanceColor?.array.byteLength??0));}
  texture(texture:Texture):void {const data=(texture.image as {data?:{byteLength?:number}}|undefined)?.data;this.register(texture,'texture',data?.byteLength??0);}
  target(target:WebGLRenderTarget):void {
    if(this.ids.has(target))return;
    const id=this.register(target,'target',0),entry=this.entries.get(id)!;
    target.removeEventListener('dispose',entry.release);
    const texture=target.texture,depth=target.depthTexture,release=entry.release;
    entry.release=()=>{target.removeEventListener('dispose',entry.release);release();for(const resource of [texture,depth]){if(!resource)continue;const resourceId=this.ids.get(resource);if(resourceId!==undefined)this.entries.get(resourceId)?.release();}};
    target.addEventListener('dispose',entry.release);this.texture(texture);if(depth)this.texture(depth);
  }
  prepared(resource:BufferGeometry|Texture|InstancedMesh):void {const id=this.ids.get(resource),entry=id===undefined?undefined:this.entries.get(id);if(entry&&!entry.prepared){entry.prepared=true;this.preparedCount++;}}
  get state(){return{...this.counts,registered:this.entries.size,prepared:this.preparedCount,released:this.released,cpuBackingBytes:this.cpuBytes,gpuBytes:null,gpuBytesLimitation:'WebGL does not expose driver residency; use allocation instrumentation for GL buffers'};}
  dispose():void {for(const entry of this.entries.values())entry.resource.removeEventListener('dispose',entry.release);this.entries.clear();this.ids=new WeakMap();this.counts.geometry=this.counts.instances=this.counts.texture=this.counts.target=this.cpuBytes=this.preparedCount=0;}
}
