import {build}from'esbuild';
await build({stdin:{loader:'ts',resolveDir:process.cwd(),contents:`import {StreamingShaderWarmup} from './src/game/StreamingShaderWarmup';import{BoxGeometry,Mesh,MeshStandardMaterial,Group,Scene,PerspectiveCamera,DirectionalLight,DataTexture,PCFSoftShadowMap}from'three';
let depthCompiles=0,draws=0;const program={isReady:()=>true};let target=null;
const renderer:any={localClippingEnabled:true,clippingPlanes:[],shadowMap:{enabled:true,type:PCFSoftShadowMap,autoUpdate:true,needsUpdate:true},xr:{enabled:false},autoClear:true,outputColorSpace:'srgb',toneMapping:4,properties:{get:()=>({programs:new Map([[0,program]])})},getContext:()=>({}),getRenderTarget:()=>target,setRenderTarget:t=>target=t,getActiveCubeFace:()=>0,getActiveMipmapLevel:()=>0,getViewport:v=>v.set(0,0,100,100),getScissor:v=>v.set(0,0,100,100),getScissorTest:()=>false,setViewport:()=>{},setScissor:()=>{},setScissorTest:()=>{},initTexture:()=>{},render:()=>draws++,compile:root=>{const mats=new Set();root.traverse(o=>{if(o instanceof Mesh){mats.add(o.material);if(o.material.type==='MeshDepthMaterial')depthCompiles++;}});return mats;}};
const runtime:any={driving:false,atomic:async(_l,_p,alive,_r,work)=>{if(alive())work();}};
const warmup=new StreamingShaderWarmup(renderer,runtime),scene=new Scene(),light=new DirectionalLight();light.castShadow=true;scene.add(light);
const materials=[0,1].map(i=>{const texture=new DataTexture(new Uint8Array([i*255,255,255,255]),1,1);texture.needsUpdate=true;return new MeshStandardMaterial({map:texture,alphaTest:.5});});
const make=()=>{const root=new Group();for(const material of materials){const m=new Mesh(new BoxGeometry(),material);m.castShadow=true;root.add(m);}return root;};
const camera=new PerspectiveCamera(),first=make();scene.add(first);await warmup.prepare(first,scene,first,[{camera,target:null}],()=>true);if(depthCompiles!==2)throw Error('Unclipped shadow variants skipped while global clipping is enabled');
for(let i=0;i<2;i++){const m=first.children[i]as Mesh;if(m.customDepthMaterial?.map!==materials[i].map)throw Error('Shadow alpha texture aliases another material');}
const count=depthCompiles,second=make();scene.remove(first);scene.add(second);await warmup.prepare(second,scene,second,[{camera,target:null}],()=>true);if(depthCompiles!==count)throw Error('Identical shadow programs compiled again');
warmup.dispose();console.log({passed:true,unclippedShadowsPrepared:true,distinctAlphaTextures:true,programReuse:true,depthCompiles,draws});`},bundle:true,platform:'node',format:'esm',outfile:'artifacts/runtime-v3/shadow-warmup-check.bundle.mjs',define:{'import.meta.env.DEV':'false'},logLevel:'silent'});
await import('./shadow-warmup-check.bundle.mjs');

