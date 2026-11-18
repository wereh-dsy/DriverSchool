import fs from 'node:fs';
import ts from 'typescript';
const baseline='artifacts/runtime-v4/baseline/src/game/DrivingGame.ts';
let source=fs.readFileSync(baseline,'utf8');
const tree=ts.createSourceFile('DrivingGame.ts',source,ts.ScriptTarget.Latest,true);
const game=tree.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='DrivingGame');
const edits=[];
const member=name=>game.members.find(n=>name==='constructor'?ts.isConstructorDeclaration(n):n.name?.getText(tree)===name);
const rewrite=(name,text)=>{const n=member(name);if(!n)throw Error('Missing '+name);edits.push([n.getStart(tree),n.end,text]);};
const remove=['vehicleLighting','mirrors','mirrorOverlay','vehicleAssets','parkingCamera','sun','hemisphere','environmentVisual','windshieldRain','skyGeometry','skyMaterial','skyDome','environmentMap','worldViewCameras','renderGraph','renderDelta','renderPreparationCpu','showRenderMirrorOverlay','worldShadowCameras','streamingWarmup','createMirrorSystem','renderAdditionalViews','renderMainView','updateSun','addLightingAndSky','prepareRenderMatrices'];
for(const name of remove)rewrite(name,'');
rewrite('create',`static async create(host:HTMLElement,integration?:DrivingGameIntegration):Promise<DrivingGame>{
 const groundId=integration?.groundId??DrivingGame.readStoredGroundId();
 let stored:string|null=null;try{stored=localStorage.getItem('drivergame.vehicle-id.v1');}catch{/* Optional preferences. */}
 const vehicleId=integration?.vehicleId??(stored&&isVehicleId(stored)?stored:DEFAULT_VEHICLE_ID);
 integration?.renderer?.forceContextLoss();integration?.renderer?.dispose();integration?.renderer?.domElement.remove();integration?.assets?.dispose();
 const renderer=new RendererWorkerClient(host,vehicleId,groundId,new URL(__CITY_MAIN_RUNTIME_URL__,document.baseURI).href,integration?.signal);
 renderer.onProgress=(stage,done,total,resource)=>{if(stage==='region'||stage==='gpu'||stage==='screen')integration?.ui.loadingProgress.update(stage,done,total,resource);};
 let ground:DrivingGround|undefined;
 try{
  const task=(async()=>{const timing=await prepareDrivingGround(groundId);ground=await createDrivingGroundAsync(groundId,timing,integration?.signal,'simulation');})();
  const [info]=await Promise.all([renderer.vehicleReady,task]);
  if(integration?.signal?.aborted)throw new DOMException('Loading cancelled','AbortError');
  return new DrivingGame(host,ground!,groundId,renderer,integration,new SimulationVehicleRig(getVehicleDescriptor(vehicleId).visualConfig,info,renderer));
 }catch(error){renderer.dispose();ground?.dispose();throw error;}
}`);
let constructor=member('constructor').getText(tree);
constructor=constructor.replace('renderer: WebGLRenderer, environmentMap: ReturnType<typeof createStaticEnvironmentMap>,','renderer: RendererWorkerClient,').replace('preparedVisual?: VehicleVisual','preparedVisual: SimulationVehicleRig');
constructor=constructor.replace('this.vehicleAssets = integration?.assets ?? new VehicleAssetRegistry();','');
const start=constructor.indexOf('    this.runtime.performance.bindRenderer('),end=constructor.indexOf('    host.prepend(this.renderer.domElement);',start);
constructor=constructor.slice(0,start)+constructor.slice(end);
constructor=constructor.replace('VehicleVisual.prepareAssets(initialVehicle.visualConfig, this.vehicleAssets);','');
constructor=constructor.replace('preparedVisual ?? new VehicleVisual(initialVehicle.visualConfig, this.vehicleAssets)','preparedVisual');
const envStart=constructor.indexOf('    this.scene.background ='),envEnd=constructor.indexOf('    const spawn =',envStart);
constructor=constructor.slice(0,envStart)+'    this.scene.add(this.vehicleVisual.root);\n'+constructor.slice(envEnd);
constructor=constructor.replace(/    this\.vehicleLighting =[^\n]+\n|    this\.windshieldRain =[^\n]+\n|    this\.mirrors =[^\n]+\n|    this\.mirrorOverlay =[^\n]+\n|    this\.mirrorOverlay\.setView[^\n]+\n/g,'');
constructor=constructor.replace('    this.bindEvents();','    this.renderer.setSources(()=>renderTelemetry(this.vehicleVisual.telemetry) as Record<string,unknown>,()=>this.renderContext());\n    this.bindEvents();');
rewrite('constructor',constructor);
rewrite('prepareFirstScreen',`private async prepareFirstScreen(signal?:AbortSignal):Promise<void>{
 const progress=this.gameUI.loadingProgress;
 this.updateVehicleVisual(0);this.publishRender(this.driverCamera.camera,0,0);
 await this.renderer.ready;
 if(!this.running||signal?.aborted)throw new DOMException('Loading cancelled','AbortError');
 (this.host.closest<HTMLElement>('#app')??this.host).dataset.loadingHud='true';
 this.hud.updateMinimap(this.snapshot.x,this.snapshot.z,this.snapshot.yaw,1/20);
 progress.update('screen',1,1,'独立渲染线程首屏已就绪');progress.close('screen');
}`);
rewrite('prepareDriveFromUI',`public async prepareDriveFromUI(vehicleId:string,groundId:string,restart:boolean,signal?:AbortSignal):Promise<void>{
 if(isDrivingGroundId(groundId)&&groundId!==this.activeGroundId&&!await this.switchGround(groundId,signal))throw Error('Map loading failed');
 if(isVehicleId(vehicleId)&&vehicleId!==this.activeVehicleId)this.switchVehicle(vehicleId);
 if(restart)this.resetVehicleToGroundStart();
 await this.whenReady();await this.prepareFirstScreen(signal);
 this.ground.finishVisualPreload?.();this.gameUI.loadingProgress.finish();this.gameStarted=true;this.hud.setStarted();void this.engineAudio.start();loadingMark('driveReady');
}`);
rewrite('isGroundVisualReady',`private isGroundVisualReady():boolean{return this.ground.visualReady!==false&&this.renderer.isReady;}`);
rewrite('prepareGroundVisuals',`private prepareGroundVisuals(ground:DrivingGround):void{ground.setRuntimeCoordinator?.(this.runtime);ground.beginVisualPreload?.();}`);
rewrite('queueVehicleWarmup',`private queueVehicleWarmup():void{
 if(this.integration)this.gameUI.setLoading('warmingRenderer','正在准备独立渲染线程');
 this.vehicleLoading.mark('Visual warmup');this.vehicleLoading.enqueue('Visual warmup',()=>this.renderer.ready);
}`);
rewrite('switchVehicle',`private switchVehicle(vehicleId:VehicleId):void{
 if(vehicleId===this.activeVehicleId||!this.vehicleLoading.ready)return;
 this.accelerationTest?.interrupt('切换车辆');
 this.vehicleLoading.enqueue('Static asset prepare',async()=>{const info=await this.renderer.prepareVehicle(vehicleId);this.pendingVehicleVisual=new SimulationVehicleRig(getVehicleDescriptor(vehicleId).visualConfig,info,this.renderer);});
 this.vehicleLoading.enqueue('Dynamic state init',()=>{this.installVehicle(vehicleId,this.pendingVehicleVisual!);this.pendingVehicleVisual=null;});
}`);
rewrite('updateWorldVisibility',`private updateWorldVisibility():void{this.publishRender(this.driverCamera.camera,0,0);}`);
let menu=member('renderMenuBackground').getText(tree);menu=menu.slice(0,menu.indexOf('    this.environmentVisual.update'))+'    this.publishRender(camera,dt,0);\n  }';rewrite('renderMenuBackground',menu);
for(const [a,b,text]of edits.sort((a,b)=>b[0]-a[0]))source=source.slice(0,a)+text+source.slice(b);
source=source.replace('private readonly renderer: WebGLRenderer;','private readonly renderer: RendererWorkerClient;').replaceAll('private vehicleVisual: VehicleVisual;','private vehicleVisual: SimulationVehicleRig;').replace('private pendingVehicleVisual: VehicleVisual | null','private pendingVehicleVisual: SimulationVehicleRig | null');
source=source.replaceAll('visual: VehicleVisual','visual: SimulationVehicleRig').replaceAll('vehicle: VehicleVisual','vehicle: SimulationVehicleRig').replaceAll('nextVisual: VehicleVisual','nextVisual: SimulationVehicleRig');
// Rendering APIs are removed rather than replaced by a main-thread proxy renderer.
source=source.replace(/^.*this\.(?:environmentVisual|vehicleLighting|windshieldRain|mirrors|mirrorOverlay|vehicleAssets|skyGeometry|skyMaterial|skyDome|environmentMap|streamingWarmup|renderGraph)\..*\r?\n/gm,'');
source=source.replace(/^.*this\.(?:environmentMap|skyGeometry|skyMaterial|skyDome) = null;\r?\n/gm,'');
source=source.replace(/^.*this\.(?:environmentVisual|vehicleLighting|windshieldRain|mirrors|parkingCamera) = (?:new |descriptor\.).*\r?\n/gm,'');
source=source.replaceAll('    this.prepareRenderMatrices();','').replaceAll('    this.updateSun();','');
source=source.replaceAll('    this.vehicleVisual.setWheelWorldPositions(this.renderPose.wheelPositions);','').replace(/    this\.vehicleVisual\.setFrontWheelSteeringAngles\([\s\S]*?\);\r?\n/,'').replaceAll('    this.vehicleVisual.setSteeringWheelAngle(-this.renderPose.steeringWheel);','').replaceAll('    this.vehicleVisual.setWheelRotationAngles(this.renderPose.wheelRotations);','').replaceAll('    this.vehicleVisual.setWheelAlignment(this.snapshot.wheels);','');
source=source.replace('    this.parkingCamera?.update(frameDt, this.snapshot.transmission.selectedMode === \'R\');','').replaceAll('    this.parkingCamera?.dispose();','');
source=source.replaceAll('    this.scene.add(nextGround.root);','');
source=source.replace('      nextGround = await createDrivingGroundAsync(groundId, timing,signal);',`      nextGround = await createDrivingGroundAsync(groundId, timing,signal,'simulation');\n      await this.renderer.command('ground',groundId);`);
source=source.replace("this.environmentVisual.setGround(ground);",'{}');
source=source.replace(/    this\.renderDelta=frameDt;\r?\n/, '    this.publishRender(this.visualDebug.renderCamera??this.driverCamera.camera,frameDt,1);\n');
source=source.replace('    this.runtime.performance.endGpu();','').replace('performance.now()-renderStarted-this.renderPreparationCpu','performance.now()-renderStarted');
source=source.replace("    this.scene.environment = null;",'');
source=source.replace("import { createGameRenderer } from './createGameRenderer';",`import {RendererWorkerClient} from './render/RendererWorkerClient';\nimport {SimulationVehicleRig} from './render/SimulationVehicleRig';\nimport {renderTelemetry} from './render/RenderTelemetry';\nimport {R} from './render/RendererProtocol';`);
// New transport methods inserted below; the original physical and control loop is unchanged.
const transport=fs.readFileSync('artifacts/runtime-v4/main-transport.txt','utf8');
source=source.replace('  private readStoredVehicleId()',transport+'\n  private readStoredVehicleId()');
fs.writeFileSync('src/game/DrivingGame.ts',source);
