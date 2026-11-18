import {type Camera,type Light,type Scene,type WebGLRenderer} from 'three';
import {VEHICLE_RENDER_LAYERS} from '../../vehicle/visual/VehicleRenderLayers';
import type {DrivingGround} from '../../world/DrivingGround';
import {GPUResourceResidency} from '../../world/render/GPUResourceResidency';

export interface RenderBackend {readonly kind:'webgl2';render(scene:Scene,camera:Camera):void;dispose():void}
interface FramePass {name:string;after:readonly string[];run:()=>void}
/** Explicit frame DAG plus one WebGL backend for EVERY renderer invocation,
 * including parking/additional cameras. Three's opaque/transparency/sky/cabin
 * stages stay fused, preserving depth, fog, sorting and tone mapping. */
export class WorldRenderGraph implements RenderBackend {
  readonly kind='webgl2' as const;
  readonly residency:GPUResourceResidency;
  private readonly originalRender:WebGLRenderer['render'];
  private readonly originalDirect:WebGLRenderer['renderBufferDirect'];
  private readonly originalShadow:WebGLRenderer['shadowMap']['render'];
  private readonly passes:FramePass[]=[];
  private readonly names=new Set<string>();
  private currentCamera?:Camera;
  private currentScene?:Scene;
  private shadow=false;
  private inFrame=false;
  private readonly timings:Record<string,number>={};
  private readonly draws={main:0,additional:0,shadow:0,skyWeather:0,transparent:0,cockpit:0,overlay:0};
  private frameCount=0;
  private readonly multiDraw:boolean;
  constructor(private readonly renderer:WebGLRenderer,private readonly scene:Scene,private readonly ground:()=>DrivingGround){
    this.residency=GPUResourceResidency.forRenderer(renderer);
    this.multiDraw=!!renderer.getContext?.()?.getExtension('WEBGL_multi_draw');
    this.originalRender=renderer.render;this.originalDirect=renderer.renderBufferDirect;this.originalShadow=renderer.shadowMap.render;
    renderer.render=(scene,camera)=>this.render(scene as Scene,camera);
    renderer.setOpaqueSort((a,b)=>{
      const order=a.groupOrder-b.groupOrder||a.renderOrder-b.renderOrder||a.material.id-b.material.id;if(order)return order;
      const x=a.object.userData.renderWorldRank as number|undefined,y=b.object.userData.renderWorldRank as number|undefined;
      return x!==undefined&&y!==undefined&&a.material.depthWrite&&b.material.depthWrite?x-y:a.z-b.z||a.id-b.id;
    });
    renderer.renderBufferDirect=(camera,scene,geometry,material,object,group)=>{
      if(this.inFrame){
        if(this.shadow)this.draws.shadow++;
        else if(this.currentScene!==this.scene)this.draws.overlay++;
        else if(this.currentCamera?.userData.isMirrorCamera)this.draws.additional++;
        else this.draws.main++;
        if(!this.shadow){if(material.transparent)this.draws.transparent++;if(object.name==='Camera-local rainfall'||object.name.includes('Sky'))this.draws.skyWeather++;if(object.layers.mask&(1<<VEHICLE_RENDER_LAYERS.INTERIOR))this.draws.cockpit++;}
      }
      return this.originalDirect.call(renderer,camera,scene,geometry,material,object,group);
    };
    renderer.shadowMap.render=(lights,scene,camera)=>{
      const execute=renderer.shadowMap.enabled&&(renderer.shadowMap.autoUpdate||renderer.shadowMap.needsUpdate),before=this.shadow,start=performance.now();
      if(execute&&scene===this.scene){this.shadow=true;this.ground().prepareRenderView?.(camera,true);}
      try{return this.originalShadow.call(renderer.shadowMap,lights,scene,camera);}
      finally {
        if(execute&&scene===this.scene){this.timings.shadow=(this.timings.shadow??0)+performance.now()-start;this.shadow=before;this.ground().prepareRenderView?.(camera,false);for(const light of lights){const map=(light as Light&{shadow?:{map?:import('three').WebGLRenderTarget}}).shadow?.map;if(map)this.residency.target(map);}}
      }
    };
  }
  add(name:string,after:readonly string[],run:()=>void):void {
    if(this.names.has(name)||after.some(dependency=>!this.names.has(dependency)))throw Error('Invalid Render Graph dependency: '+name);
    this.passes.push({name,after,run});this.names.add(name);
  }
  execute():void {
    this.inFrame=true;this.frameCount++;this.draws.main=this.draws.additional=this.draws.shadow=this.draws.skyWeather=this.draws.transparent=this.draws.cockpit=this.draws.overlay=0;this.timings.shadow=0;
    try{for(const pass of this.passes){const started=performance.now();pass.run();this.timings[pass.name]=performance.now()-started;}}
    finally {this.inFrame=false;}
  }
  render(scene:Scene,camera:Camera):void {
    const previousCamera=this.currentCamera,previousScene=this.currentScene;this.currentCamera=camera;this.currentScene=scene;
    if(scene===this.scene)this.ground().prepareRenderView?.(camera,false);
    const target=this.renderer.getRenderTarget();if(target)this.residency.target(target);
    try{this.originalRender.call(this.renderer,scene,camera);}
    finally{this.currentCamera=previousCamera;this.currentScene=previousScene;}
  }
  get state(){return{backend:this.kind,frames:this.frameCount,passes:this.passes.map(pass=>({name:pass.name,after:pass.after,cpuMs:this.timings[pass.name]??0})),fusedStages:['sky/weather','opaque world','transparent','3D cockpit'],shadowCpuMs:this.timings.shadow??0,draws:{...this.draws},residency:this.residency.state,multiDrawAvailable:this.multiDraw,multiDrawUsed:false,offscreenAvailable:typeof OffscreenCanvas!=='undefined',offscreen:(globalThis as unknown as {__driverSchoolRendererOwner?:boolean}).__driverSchoolRendererOwner===true};}
  dispose():void {this.renderer.render=this.originalRender;this.renderer.renderBufferDirect=this.originalDirect;this.renderer.shadowMap.render=this.originalShadow;this.renderer.setOpaqueSort(null);this.residency.dispose();}
}
