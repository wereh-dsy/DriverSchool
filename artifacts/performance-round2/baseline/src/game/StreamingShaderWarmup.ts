import { BackSide, DoubleSide, FrontSide, Group, InstancedMesh, Line, Mesh, MeshDepthMaterial, Points, RGBADepthPacking, Scene, Texture, Vector4, VSMShadowMap, WebGLRenderTarget, type Camera, type Material, type Object3D, type WebGLRenderer } from 'three';
import { nextPaint } from '../loading/Loading';
type Renderable=Mesh|Line|Points;

/** Shader preparation is synchronous before compileAsync starts polling the GPU.
 * Submit bounded sets of real objects, sharing static material/attribute variants.
 * No reparenting, geometry copies, or render-time scene-wide light traversal. */
export class StreamingShaderWarmup {
  private readonly tasks=new Set<Promise<void>>();
  private readonly waiting:{priority:()=>number;alive:()=>boolean;resolve:()=>void;reject:(error:unknown)=>void}[]=[];
  private failure:unknown;
  private pumping=false;
  private gpuFence:WebGLSync|null=null;
  private readonly prepared=new Set<string>();
  private readonly uploadedTextures=new WeakMap<Texture,number>();
  private readonly depthMaterials=new Map<string,MeshDepthMaterial>();
  private readonly depthTarget=new WebGLRenderTarget(1,1,{depthBuffer:false});
  private disposed=false;
  readonly statistics={roots:0,completedRoots:0,cancelledRoots:0,activity:'等待资源',objects:0,representatives:0,submissions:0,maxSubmitMs:0,cacheHits:0,resourceBatches:0,maxResourceMs:0,textureUploads:0};
  constructor(private readonly renderer:WebGLRenderer){}
  get idle():boolean{return this.tasks.size===0;}
  prepare(root:Object3D,scene:Scene,world:Object3D,views:readonly {camera:Camera;target:WebGLRenderTarget|null}[],alive:()=>boolean,priority:()=>number=()=>0):Promise<void>{
    this.statistics.roots++;
    const run=async()=>{
      if(this.disposed||!alive())return;
      const targetScene=new Scene(),lights:Object3D[]=[];
      // Borrow environment resources; Scene.clone would clone textures for every
      // publication and retain extra environment-map cache entries.
      targetScene.environment=scene.environment;targetScene.background=scene.background;targetScene.fog=scene.fog;
      targetScene.environmentIntensity=scene.environmentIntensity;targetScene.environmentRotation.copy(scene.environmentRotation);
      const gather=(object:Object3D)=>{if(object===world||!object.visible)return;if((object as Object3D&{isLight?:boolean}).isLight)lights.push(object);for(const child of object.children)gather(child);};
      gather(scene);targetScene.children.push(...lights);
      const objects:Object3D[]=[],all:Renderable[]=[],seen=new Set<string>();
      root.traverse(object=>{
        if(object instanceof Line||object instanceof Points){objects.push(object);all.push(object);return;}
        if(!(object instanceof Mesh)||(object as Mesh&{isSkinnedMesh?:boolean;isBatchedMesh?:boolean}).isSkinnedMesh||(object as Mesh&{isBatchedMesh?:boolean}).isBatchedMesh||Object.keys(object.geometry.morphAttributes).length){if((object as Object3D&{material?:unknown}).material)objects.push(object);return;}
        this.statistics.objects++;
        all.push(object);
        const materials=Array.isArray(object.material)?object.material:[object.material],attributes=Object.entries(object.geometry.attributes).map(([name,a])=>name+':'+(a as {itemSize:number}).itemSize).sort().join(','),instance=object instanceof InstancedMesh?':instance:'+!!object.instanceColor+':'+!!object.morphTexture:':mesh';
        const key=materials.map(m=>m.uuid).join('|')+instance+':'+object.receiveShadow+':'+attributes;
        if(!seen.has(key)){seen.add(key);objects.push(object);}
      });
      this.statistics.representatives+=objects.length;
      // Texture upload used to run inside SectorManager's synchronous generator.
      // Keep it outside the physics/render callback and yield between large boards.
      for(const object of all)for(const material of Array.isArray(object.material)?object.material:[object.material])for(const value of Object.values(material)){
        if(!(value instanceof Texture)||value.isRenderTargetTexture||this.uploadedTextures.get(value)===value.version)continue;
        await this.turn(priority,alive);if(this.disposed||!alive())return;
        if(this.uploadedTextures.get(value)===value.version)continue;
        this.statistics.activity=`纹理上传 · ${root.name||'场景资源'}`;
        const started=performance.now();this.renderer.initTexture(value);this.uploadedTextures.set(value,value.version);this.statistics.textureUploads++;
        this.statistics.maxResourceMs=Math.max(this.statistics.maxResourceMs,performance.now()-started);
        this.fence();
      }
      for(const view of views){
        const lighting=lights.filter(l=>l.layers.test(view.camera.layers)).map(l=>{const light=l as Object3D&{castShadow?:boolean;map?:unknown};return l.type+':'+!!light.castShadow+':'+!!light.map;}).sort().join('|');
        const context=[lighting,view.camera.type,view.camera.layers.mask,view.target?.texture.colorSpace??this.renderer.outputColorSpace,view.target?.texture.type??0,this.renderer.toneMapping,this.renderer.shadowMap.enabled,this.renderer.shadowMap.type,scene.fog?.constructor.name,scene.environment?.uuid??'',this.renderer.clippingPlanes.length,this.renderer.localClippingEnabled].join(':');
        const key=(object:Object3D)=>{
          if(!(object instanceof Mesh)||Object.keys(object.geometry.morphAttributes).length||(object as Mesh&{isSkinnedMesh?:boolean;isBatchedMesh?:boolean}).isSkinnedMesh||(object as Mesh&{isBatchedMesh?:boolean}).isBatchedMesh)return undefined;
          const materials=Array.isArray(object.material)?object.material:[object.material];
          return context+'|'+materials.map(m=>m.uuid+':'+m.version).join('|')+'|'+Object.entries(object.geometry.attributes).map(([name,a])=>name+':'+(a as{itemSize:number}).itemSize).sort().join(',')+'|'+object.receiveShadow+'|'+(object instanceof InstancedMesh?'instance:'+!!object.instanceColor+':'+!!object.morphTexture:'mesh');
        };
        const needed=objects.filter(o=>{const k=key(o);if(k&&this.prepared.has(k)){this.statistics.cacheHits++;return false;}return true;});
        for(let i=0;i<needed.length;i+=12){
        await this.turn(priority,alive);if(this.disposed||!alive())return;
        this.statistics.activity=`材质程序 · ${root.name||'场景资源'}`;
        const batch=new Group(),chunk=needed.slice(i,i+12).filter(o=>{const k=key(o);return !k||!this.prepared.has(k);});
        if(!chunk.length)continue;
        // compile only reads object geometry/material/type; keep original parents
        // and matrices intact while omitting descendants already in the flat list.
        batch.traverse=callback=>{callback(batch);for(const object of chunk)callback(object);};
        const previous=this.renderer.getRenderTarget(),cube=this.renderer.getActiveCubeFace(),mip=this.renderer.getActiveMipmapLevel();let pending:Promise<unknown>;
        const started=performance.now();
        try{
          this.renderer.setRenderTarget(view.target);
          const materials=this.renderer.compile(batch,view.camera,targetScene),programs=new Set<{isReady():boolean}>();
          // A shared facade material also serves un-tinted roof/landmark
          // instances. Prepare that real program variant before it is visible.
          const colors=new Map<InstancedMesh,InstancedMesh['instanceColor']>();
          for(const object of chunk)if(object instanceof InstancedMesh&&object.instanceColor)colors.set(object,object.instanceColor);
          if(colors.size){const plain=new Group();plain.traverse=cb=>{cb(plain);for(const object of colors.keys())cb(object);};try{for(const object of colors.keys())object.instanceColor=null;for(const material of this.renderer.compile(plain,view.camera,targetScene))materials.add(material);}finally{for(const[object,color]of colors)object.instanceColor=color;}}
          for(const material of materials){
            const properties=this.renderer.properties.get(material)as{programs?:Map<unknown,{isReady():boolean}>};
            for(const program of properties.programs?.values()??[])if(typeof program.isReady==='function')programs.add(program);
          }
          // Three's compileAsync polls material.currentProgram. Live main/mirror
          // rendering changes that pointer while compilation is pending, so it
          // can report a DIFFERENT program ready and publish too early. Capture
          // exact handles, including both transparent DoubleSide variants.
          pending=programs.size?new Promise<void>(resolve=>{const check=()=>{if(!alive()){resolve();return;}for(const program of programs)if(!program.isReady()){setTimeout(check,4);return;}resolve();};check();}):this.renderer.compileAsync(batch,view.camera,targetScene);
        }
        finally{this.renderer.setRenderTarget(previous,cube,mip);this.statistics.maxSubmitMs=Math.max(this.statistics.maxSubmitMs,performance.now()-started);this.statistics.submissions++;}
        await pending;
        if(!alive())return;
        for(const object of chunk){const k=key(object);if(k)this.prepared.add(k);}
        while(this.prepared.size>512)this.prepared.delete(this.prepared.values().next().value!);
        }
      }
      // compile() never uploads attributes, creates VAOs, or executes a draw.
      // Exercise the actual programs on the actual targets with one triangle,
      // without clearing or writing either the screen or mirror/depth textures.
      // Main uploads all resources; remaining views only need representatives.
      for(let i=0;i<views.length;i++)await this.upload(i===0?all:objects.filter((o):o is Renderable=>o instanceof Mesh||o instanceof Line||o instanceof Points),targetScene,views[i]!,alive,priority);
      if(this.renderer.shadowMap.enabled&&!this.renderer.localClippingEnabled&&!this.renderer.clippingPlanes.length){
        const casters=all.filter((o):o is Mesh=>o instanceof Mesh&&o.castShadow&&!o.customDepthMaterial&&!Array.isArray(o.material));
        const originals=new Map<Mesh,Material>();
        const overrides=new Map<Mesh,Material>();
        for(const object of casters){const depth=this.depthFor(object.material as Material);if(!depth)continue;originals.set(object,object.material as Material);overrides.set(object,depth);object.customDepthMaterial=depth;}
        // Shadow rendering receives an empty scene (no fog/environment) but the
        // live light counts. Reuse the exact custom depth material at runtime.
        const depthScene=new Scene();depthScene.matrixWorldAutoUpdate=false;depthScene.children.push(...lights);
        try{
          const shadowObjects=[...originals.keys()];
          for(let i=0;i<shadowObjects.length;i+=12){await this.turn(priority,alive);if(this.disposed||!alive())return;this.statistics.activity='阴影材质准备';const chunk=shadowObjects.slice(i,i+12),batch=new Group();batch.traverse=cb=>{cb(batch);for(const o of chunk)cb(o);};const previous=this.renderer.getRenderTarget();let pending:Promise<void>;try{for(const o of chunk)o.material=overrides.get(o)!;this.renderer.setRenderTarget(this.depthTarget);pending=this.ready(this.renderer.compile(batch,views[0]!.camera,depthScene),alive);}finally{for(const o of chunk)o.material=originals.get(o)!;this.renderer.setRenderTarget(previous);}await pending;}
          await this.upload(shadowObjects,depthScene,{camera:views[0]!.camera,target:this.depthTarget},alive,priority,overrides);
        }finally{for(const [object,material]of originals)object.material=material;}
      }
      await this.settle(alive);
    };
    const task=Promise.resolve().then(run).then(()=>{if(alive()&&!this.disposed)this.statistics.completedRoots++;else this.statistics.cancelledRoots++;}).finally(()=>this.tasks.delete(task));this.tasks.add(task);return task;
  }
  private turn(priority:()=>number,alive:()=>boolean):Promise<void>{if(this.failure)return Promise.reject(this.failure);return new Promise((resolve,reject)=>{this.waiting.push({priority,alive,resolve,reject});this.pump();});}
  private pump():void {
    if(this.pumping)return;this.pumping=true;
    void nextPaint().then(()=>{
      this.pumping=false;
      for(let i=this.waiting.length-1;i>=0;i--)if(this.disposed||!this.waiting[i]!.alive())this.waiting.splice(i,1)[0]!.resolve();
      if(!this.waiting.length)return;
      if(!this.gpuReady()){this.pump();return;}
      let best=0;for(let i=1;i<this.waiting.length;i++)if(this.waiting[i]!.priority()<this.waiting[best]!.priority())best=i;
      this.waiting.splice(best,1)[0]!.resolve();if(this.waiting.length)this.pump();
    }).catch(error=>{this.pumping=false;this.failure=error;for(const job of this.waiting.splice(0))job.reject(error);});
  }
  private fence():void {const gl=this.renderer.getContext?.() as WebGL2RenderingContext|undefined;if(gl?.fenceSync){if(this.gpuFence)gl.deleteSync(this.gpuFence);this.gpuFence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);if(!this.gpuFence)throw Error('GPU resource completion fence unavailable');gl.flush();}}
  private gpuReady():boolean {
    if(!this.gpuFence)return true;const gl=this.renderer.getContext() as WebGL2RenderingContext;
    if(gl.isContextLost())throw Error('GPU context lost during loading');
    const state=gl.clientWaitSync(this.gpuFence,0,0);if(state===gl.TIMEOUT_EXPIRED)return false;
    gl.deleteSync(this.gpuFence);this.gpuFence=null;if(state===gl.WAIT_FAILED)throw Error('GPU resource preparation failed');return true;
  }
  /** Poll an actual GPU completion fence without synchronously waiting on it. */
  async settle(alive:()=>boolean):Promise<void>{if(this.disposed||!alive())return;this.fence();while(!this.disposed&&alive()&&!this.gpuReady()){this.statistics.activity='等待 GPU 完成资源提交';await nextPaint();}}
  private ready(materials:Set<Material>,alive:()=>boolean):Promise<void>{
    const programs=new Set<{isReady():boolean}>();for(const material of materials){const p=this.renderer.properties.get(material)as{programs?:Map<unknown,{isReady():boolean}>};for(const program of p.programs?.values()??[])programs.add(program);}
    return new Promise(resolve=>{const check=()=>{if(this.disposed||!alive()){resolve();return;}for(const p of programs)if(!p.isReady()){setTimeout(check,4);return;}resolve();};check();});
  }
  private depthFor(material:Material):MeshDepthMaterial|undefined{
    const m=material as MeshDepthMaterial;
    if(m.clippingPlanes?.length||m.displacementMap)return undefined;
    const side=m.shadowSide??(this.renderer.shadowMap.type===VSMShadowMap?m.side:m.side===FrontSide?BackSide:m.side===BackSide?FrontSide:DoubleSide),key=[side,!!m.map,m.map?.channel,!!m.alphaMap,m.alphaMap?.channel,m.alphaToCoverage ? .5 : m.alphaTest,m.wireframe].join(':');
    let depth=this.depthMaterials.get(key);if(depth)return depth;
    if(this.depthMaterials.size>=32)return undefined;
    depth=new MeshDepthMaterial({depthPacking:RGBADepthPacking,map:m.map,alphaMap:m.alphaMap,alphaTest:m.alphaToCoverage ? .5 : m.alphaTest,side,wireframe:m.wireframe});this.depthMaterials.set(key,depth);return depth;
  }
  private async upload(objects:Renderable[],scene:Scene,view:{camera:Camera;target:WebGLRenderTarget|null},alive:()=>boolean,priority:()=>number,overrides?:Map<Mesh,Material>):Promise<void>{
    const batch=new Scene();batch.matrixWorldAutoUpdate=false;batch.environment=scene.environment;batch.fog=scene.fog;batch.environmentIntensity=scene.environmentIntensity;batch.environmentRotation.copy(scene.environmentRotation);
    const lights=scene.children.filter(o=>(o as Object3D&{isLight?:boolean}).isLight);
    const draws:{object:Renderable;start:number;count:number;plain:boolean}[]=[];
    for(const object of objects){
      const geometry=object.geometry,end=Math.min(geometry.drawRange.start+geometry.drawRange.count,geometry.index?.count??geometry.getAttribute('position').count);
      const groups=Array.isArray(object.material)?geometry.groups:[geometry.drawRange];
      for(const group of groups){const start=Math.max(geometry.drawRange.start,group.start),count=Math.min(end,group.start+group.count)-start;if(count>0){const draw={object,start,count:Math.min(object instanceof Line?2:3,count),plain:false};draws.push(draw);if(object instanceof InstancedMesh&&object.instanceColor)draws.push({...draw,plain:true});}}
    }
    let at=0;while(at<draws.length){
      await this.turn(priority,alive);if(this.disposed||!alive())return;
      this.statistics.activity=`几何与绘制资源 · ${at} / ${draws.length}`;
      const started=performance.now(),previous=this.renderer.getRenderTarget(),cube=this.renderer.getActiveCubeFace(),mip=this.renderer.getActiveMipmapLevel(),viewport=this.renderer.getViewport(new Vector4()),scissor=this.renderer.getScissor(new Vector4()),test=this.renderer.getScissorTest(),clear=this.renderer.autoClear,shadows=this.renderer.shadowMap.autoUpdate,needs=this.renderer.shadowMap.needsUpdate,xr=this.renderer.xr.enabled;
      let bytes=0,count=0;
      try{
        this.renderer.setRenderTarget(view.target);this.renderer.setViewport(0,0,1,1);this.renderer.setScissor(0,0,1,1);this.renderer.setScissorTest(true);this.renderer.autoClear=false;this.renderer.shadowMap.autoUpdate=false;this.renderer.shadowMap.needsUpdate=false;this.renderer.xr.enabled=false;
        do{
          const draw=draws[at++]!,object=draw.object,originalMaterial=object.material,instanceColor=object instanceof InstancedMesh?object.instanceColor:null;
          if(object instanceof Mesh&&overrides?.has(object))object.material=overrides.get(object)!;
          const geometry=object.geometry,range={...geometry.drawRange},instances=object instanceof InstancedMesh?object.count:0,culled=object.frustumCulled,visible=object.visible,children=object.children,materials=Array.isArray(object.material)?object.material:[object.material],writes=materials.map(m=>[m.colorWrite,m.depthWrite]);
          try{
            geometry.setDrawRange(draw.start,draw.count);if(object instanceof InstancedMesh){object.count=Math.min(1,instances);if(draw.plain)object.instanceColor=null;}object.frustumCulled=false;object.visible=true;object.children=[];for(const m of materials){m.colorWrite=false;m.depthWrite=false;}
            batch.children=[...lights,object];this.renderer.render(batch,view.camera);
          }finally{geometry.setDrawRange(range.start,range.count);if(object instanceof InstancedMesh){object.count=instances;object.instanceColor=instanceColor;}object.frustumCulled=culled;object.visible=visible;object.children=children;materials.forEach((m,i)=>{m.colorWrite=writes[i]![0]!;m.depthWrite=writes[i]![1]!;});object.material=originalMaterial;}
          for(const a of Object.values(geometry.attributes))bytes+=a.array.byteLength;bytes+=geometry.index?.array.byteLength??0;count++;
        }while(at<draws.length&&count<16&&bytes<2*1024*1024&&performance.now()-started<2);
      }finally{batch.children=[];this.renderer.setRenderTarget(previous,cube,mip);this.renderer.setViewport(viewport);this.renderer.setScissor(scissor);this.renderer.setScissorTest(test);this.renderer.autoClear=clear;this.renderer.shadowMap.autoUpdate=shadows;this.renderer.shadowMap.needsUpdate=needs;this.renderer.xr.enabled=xr;this.statistics.resourceBatches++;this.statistics.maxResourceMs=Math.max(this.statistics.maxResourceMs,performance.now()-started);}
      this.fence();
    }
  }
  dispose():void{this.disposed=true;this.pump();void Promise.allSettled([...this.tasks]).then(()=>{if(this.gpuFence)(this.renderer.getContext() as WebGL2RenderingContext).deleteSync(this.gpuFence);this.gpuFence=null;for(const m of this.depthMaterials.values())m.dispose();this.depthMaterials.clear();this.depthTarget.dispose();this.prepared.clear();});}
}
