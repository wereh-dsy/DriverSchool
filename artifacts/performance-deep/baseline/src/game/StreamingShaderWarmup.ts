import { Group, InstancedMesh, Mesh, Scene, type Camera, type Object3D, type WebGLRenderer, type WebGLRenderTarget } from 'three';
import { nextPaint } from '../loading/Loading';

/** Shader preparation is synchronous before compileAsync starts polling the GPU.
 * Submit bounded sets of real objects, sharing static material/attribute variants.
 * No reparenting, geometry copies, or render-time scene-wide light traversal. */
export class StreamingShaderWarmup {
  private tail:Promise<void>=Promise.resolve();
  private readonly prepared=new Set<string>();
  readonly statistics={roots:0,objects:0,representatives:0,submissions:0,maxSubmitMs:0,cacheHits:0};
  constructor(private readonly renderer:WebGLRenderer){}
  prepare(root:Object3D,scene:Scene,world:Object3D,views:readonly {camera:Camera;target:WebGLRenderTarget|null}[],alive:()=>boolean):Promise<void>{
    const run=async()=>{
      if(!alive())return;
      const targetScene=new Scene(),lights:Object3D[]=[];
      // Borrow environment resources; Scene.clone would clone textures for every
      // publication and retain extra environment-map cache entries.
      targetScene.environment=scene.environment;targetScene.background=scene.background;targetScene.fog=scene.fog;
      targetScene.environmentIntensity=scene.environmentIntensity;targetScene.environmentRotation.copy(scene.environmentRotation);
      const gather=(object:Object3D)=>{if(object===world||!object.visible)return;if((object as Object3D&{isLight?:boolean}).isLight)lights.push(object);for(const child of object.children)gather(child);};
      gather(scene);targetScene.children.push(...lights);
      const objects:Object3D[]=[],seen=new Set<string>();
      root.traverse(object=>{
        if(!(object instanceof Mesh)||(object as Mesh&{isSkinnedMesh?:boolean;isBatchedMesh?:boolean}).isSkinnedMesh||(object as Mesh&{isBatchedMesh?:boolean}).isBatchedMesh||Object.keys(object.geometry.morphAttributes).length){if((object as Object3D&{material?:unknown}).material)objects.push(object);return;}
        this.statistics.objects++;
        const materials=Array.isArray(object.material)?object.material:[object.material],attributes=Object.entries(object.geometry.attributes).map(([name,a])=>name+':'+(a as {itemSize:number}).itemSize).sort().join(','),instance=object instanceof InstancedMesh?':instance:'+!!object.instanceColor+':'+!!object.morphTexture:':mesh';
        const key=materials.map(m=>m.uuid).join('|')+instance+':'+object.receiveShadow+':'+attributes;
        if(!seen.has(key)){seen.add(key);objects.push(object);}
      });
      this.statistics.roots++;this.statistics.representatives+=objects.length;
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
        await nextPaint();if(!alive())return;
        const batch=new Group(),chunk=needed.slice(i,i+12);
        // compile only reads object geometry/material/type; keep original parents
        // and matrices intact while omitting descendants already in the flat list.
        batch.traverse=callback=>{callback(batch);for(const object of chunk)callback(object);};
        const previous=this.renderer.getRenderTarget(),cube=this.renderer.getActiveCubeFace(),mip=this.renderer.getActiveMipmapLevel();let pending:Promise<unknown>;
        const started=performance.now();
        try{
          this.renderer.setRenderTarget(view.target);
          const materials=this.renderer.compile(batch,view.camera,targetScene),programs=new Set<{isReady():boolean}>();
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
    };
    const task=this.tail.then(run);this.tail=task.catch(()=>{});return task;
  }
}
