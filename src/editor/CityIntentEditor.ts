import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CITY_EDITOR_STORAGE_KEY, loadCityMap } from '../world/city/CityMapLoader';
import { newCityMap, PREFAB_IDS, type CityMapData, type CityPoint, type CityRoad, type CityIntersection } from '../world/city/CityMapData';
import { saveMap, validateMap } from '../world/city/MapAPI';
import { PRESET_CATALOG } from '../world/city/presets/InfrastructurePresets';
import { CityEditingKernel } from './CityEditingKernel';
import { EDITOR_ROAD_PRESETS, type RoadPresetId, type EditorCommand, type EditSummary, type CrossingMode, type EditorIssue } from './EditorCommands';
import { bounds, project, maxGrade, roadPoints, polylineLength, sampleAt } from './EditorGeometry';
import { snapCandidates, type SnapCandidate } from './EditorSnap';
import { CityEditorScene } from './CityEditorScene';
import cityAlpha from '../world/city/maps/city-alpha.json';
import testMap from './maps/editor-test.json';
import { prepareCityMain, cityMainRuntime } from '../world/city/CityMainResource';
import { ROAD_SIGN_TEMPLATES } from '../world/city/RoadSignTemplates';
import { portsFor } from '../world/city/geometry';
import type { RoadSignDefinition } from '../world/city/RoadSignData';
import './city-editor.css';

type Tool = 'select' | 'road' | 'corridor' | 'intersection' | 'ramp' | 'elevation' | 'object' | 'interchange' | 'sign';
interface Drag { id:string; index?:number; point:CityPoint; screenY:number; moved:boolean; command?:EditorCommand }

/** Human tools and window.cityEditor use the same command kernel as mapctl. */
export class CityMapEditor {
  private readonly ui=document.createElement('main');
  private readonly scene=new THREE.Scene();
  private readonly renderer=new THREE.WebGLRenderer({antialias:true});
  private readonly topCamera=new THREE.OrthographicCamera(-300,300,300,-300,0.1,100000);
  private readonly camera3D=new THREE.PerspectiveCamera(50,1,0.1,100000);
  private readonly topControls:OrbitControls;
  private readonly orbit:OrbitControls;
  private readonly raycaster=new THREE.Raycaster();
  private readonly viewport:HTMLElement;
  private readonly inspector:HTMLElement;
  private readonly observer:ResizeObserver;
  private readonly file=document.createElement('input');
  private readonly grid=new THREE.Group();
  private kernel:CityEditingKernel;
  private view:CityEditorScene;
  private tool:Tool='select';
  private top=false;
  private selectedId:string|null=null;
  private multi=new Set<string>();
  private draft:CityPoint[]=[];
  private extension:string|null=null;
  private drag:Drag|null=null;
  private pending:EditSummary|null=null;
  private snap:SnapCandidate|null=null;
  private hoverId:string|null=null;
  private snapOptions:SnapCandidate[]=[];
  private snapChoice=0;
  private snapPoint:CityPoint|null=null;
  private rampStart:{id:string;distance:number}|null=null;
  private dirty=false;
  private frame=0;
  private lastFrame=0;
  private lastPopulate=0;
  private lastPointerPreview=0;
  private persistTimer=0;
  private readonly keyHandler=(e:KeyboardEvent)=>this.key(e);
  private readonly unloadHandler=(e:BeforeUnloadEvent)=>{if(this.dirty){e.preventDefault();e.returnValue='';}};
  constructor(host:HTMLElement){
    let data=loadCityMap(cityAlpha);try{const saved=localStorage.getItem(CITY_EDITOR_STORAGE_KEY);if(saved)data=loadCityMap(JSON.parse(saved));}catch{/* Export remains available when browser storage is unavailable. */}
    this.kernel=new CityEditingKernel(data);this.view=new CityEditorScene(this.kernel);
    this.ui.className='city-editor';
    this.ui.innerHTML=`<header><strong>City Intent Editor</strong>${[['new','New'],['main','清江市 City Main'],['alpha','City Alpha'],['test','Test Map'],['import','Open'],['export','Save'],['undo','Undo'],['redo','Redo'],['view','Top / 3D'],['fit','Fit'],['focus','Focus'],['validate','Validate selection'],['nearby','Validate area'],['validate-full','Validate full map'],['play','Play']].map(([a,l])=>`<button data-action="${a}">${l}</button>`).join('')}</header>
      <aside class="ce-tools"><h3>Tools</h3>${(['select','road','corridor','intersection','ramp','elevation','object','interchange','sign'] as Tool[]).map(t=>`<button data-tool="${t}">${t[0]!.toUpperCase()+t.slice(1)}</button>`).join('')}
      <label>Road preset<select data-preset>${Object.entries(EDITOR_ROAD_PRESETS).map(([id,p])=>`<option value="${id}">${p.label}</option>`).join('')}</select></label>
      <label>Curve<select data-curve><option value="smooth">Smooth</option><option value="polyline">Polyline</option></select></label>
      <label>Draw height m<input data-height type="number" value="0" step="1"></label>
      <label>Crossing<select data-crossing><option value="intersection">Intersection</option><option value="overpass">Overpass +8m</option><option value="underpass">Underpass −6m</option><option value="none">No connection</option></select></label><button data-action="finish">Preview road (Enter)</button>
      <label>Ramp kind<select data-ramp-kind><option value="off">Off-ramp</option><option value="on">On-ramp</option></select></label><label>Ramp lanes<select data-ramp-lanes><option>1</option><option>2</option></select></label>
      <label>Interchange<select data-template><option value="compact-diamond">Compact Urban Diamond</option><option value="diamond">Basic Diamond</option><option value="directional-t">Directional T / Y</option><option value="ramp-pair">Expressway On/Off Pair</option><optgroup label="Existing recipes">${PRESET_CATALOG.filter(p=>p.category==='INTERCHANGE').map(p=>`<option value="${p.id}">${p.id}</option>`).join('')}</optgroup></select></label>
      <label>Rotation °<input data-rotation type="number" value="0" step="15"></label><label>Object<select data-object>${PREFAB_IDS.map(id=>`<option>${id}</option>`).join('')}</select></label>
      <hr><label>Snap<input data-snap type="checkbox" checked></label><label>Grid m<input data-grid-step type="number" value="5" min="1" max="100"></label><label>Sector grid<input data-grid type="checkbox" checked></label>
      <label>Overlay<select data-overlay><option value="none">None</option><option value="semantic">Road semantic</option><option value="elevation">Elevation</option><option value="corridor">Corridor</option><option value="intersection">Intersections</option></select></label>
      <p class="ce-hint">Left: select / draw / drag.<br>3D: right drag orbit; middle / Shift+right pan; wheel zoom.<br>Shift+drag: elevation.<br>Ctrl+click: multi-select.<br>Tab: snap choice; C: crossing.<br>Enter: Preview / Confirm. Esc: cancel.</p>
      <h3>Roads / Corridors / Groups / Signs</h3><input data-search placeholder="Search name / ID / district"><select data-list size="7"></select></aside><div class="ce-viewport"><div class="ce-view-label"></div><section class="ce-preview" hidden><strong data-preview-title></strong><p data-preview-report></p><button data-action="commit">Confirm / Commit (Enter)</button><button data-action="cancel">Cancel (Esc)</button><details><summary>Local validation</summary><div data-issues></div></details></section></div><aside class="ce-inspector"></aside><footer></footer>`;
    host.replaceChildren(this.ui);this.viewport=this.require('.ce-viewport');this.inspector=this.require('.ce-inspector');this.viewport.prepend(this.renderer.domElement);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.setClearColor(0x8ea8b2);this.scene.add(this.view.root,this.grid,new THREE.HemisphereLight(0xe4f5ff,0x66725b,2.5));
    const sun=new THREE.DirectionalLight(0xfff2d8,3);sun.position.set(200,400,100);this.scene.add(sun);
    const terrain=new THREE.Mesh(new THREE.PlaneGeometry(200000,200000),new THREE.MeshStandardMaterial({color:0x677c64,transparent:true,opacity:0.4,depthWrite:false}));terrain.rotation.x=-Math.PI/2;terrain.position.y=-0.12;terrain.userData.editorTerrain=true;this.scene.add(terrain);
    this.topCamera.up.set(0,0,-1);this.topControls=new OrbitControls(this.topCamera,this.renderer.domElement);this.orbit=new OrbitControls(this.camera3D,this.renderer.domElement);this.configureControls();
    this.ui.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(b=>b.addEventListener('click',()=>this.action(b.dataset.action!)));
    this.ui.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(b=>b.addEventListener('click',()=>{this.cancel();this.tool=b.dataset.tool as Tool;this.rampStart=null;this.updateUI();this.drawOverlay();}));
    for(const name of ['preset','curve','height','crossing'])this.require(`[data-${name}]`).addEventListener('change',()=>{if(this.draft.length>1)this.finishRoad();});
    this.require('[data-search]').addEventListener('input',()=>this.updateList());
    this.require('[data-grid]').addEventListener('change',()=>this.grid.visible=this.checked('grid'));this.require('[data-overlay]').addEventListener('change',()=>this.drawOverlay());
    this.require<HTMLSelectElement>('[data-list]').addEventListener('change',e=>{this.selectedId=(e.target as HTMLSelectElement).value;this.multi.clear();this.updateUI();this.drawOverlay();this.focus();});
    this.file.type='file';this.file.accept='.json,application/json';this.file.hidden=true;this.ui.append(this.file);
    this.file.addEventListener('change',()=>{const file=this.file.files?.[0];if(file)void file.text().then(text=>this.open(loadCityMap(JSON.parse(text)))).catch(error=>this.status(String(error)));this.file.value='';});
    const canvas=this.renderer.domElement;canvas.addEventListener('pointerdown',e=>this.pointerDown(e));canvas.addEventListener('pointermove',e=>this.pointerMove(e));canvas.addEventListener('pointerup',e=>this.pointerUp(e));canvas.addEventListener('pointercancel',()=>{this.drag=null;this.cancel();});canvas.addEventListener('dblclick',e=>{if(e.button===0&&this.tool==='road')this.finishRoad();});
    window.addEventListener('keydown',this.keyHandler);window.addEventListener('beforeunload',this.unloadHandler);this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(this.viewport);
    this.resize();this.fit();this.drawGrid();this.updateUI();this.populate();this.expose();this.animate(0);if(new URLSearchParams(location.search).get('map')==='regional-main')void this.openMain();
  }
  private require<T extends HTMLElement=HTMLElement>(s:string):T{return this.ui.querySelector<T>(s)!;}
  private value(name:string):string{return this.require<HTMLInputElement>(`[data-${name}]`).value;}
  private checked(name:string):boolean{return this.require<HTMLInputElement>(`[data-${name}]`).checked;}
  private get camera():THREE.Camera{return this.top?this.topCamera:this.camera3D;}
  private get controls():OrbitControls{return this.top?this.topControls:this.orbit;}
  private get data():CityMapData{return this.kernel.data;}
  private status(message?:string):void {this.require('footer').textContent=message??`${this.data.name}${this.dirty?' *':''} · ${this.data.roads.length} roads · ${this.data.intersections.length} intersections · ${this.draft.length} control points · ${this.snap?`Snap: ${this.snap.kind}`:'Ready'}`;}
  private configureControls():void {
    this.topControls.enabled=this.top;this.orbit.enabled=!this.top;this.topControls.enableRotate=false;
    for(const c of [this.topControls,this.orbit]){c.mouseButtons.LEFT=null;c.mouseButtons.MIDDLE=THREE.MOUSE.PAN;c.minDistance=5;c.maxDistance=40000;}
    this.topControls.mouseButtons.RIGHT=THREE.MOUSE.PAN;this.topControls.minZoom=0.002;this.topControls.maxZoom=100;this.orbit.mouseButtons.RIGHT=THREE.MOUSE.ROTATE;this.orbit.maxPolarAngle=Math.PI*0.88;
  }
  private resize():void {const w=Math.max(1,this.viewport.clientWidth),h=Math.max(1,this.viewport.clientHeight),ratio=w/h;this.renderer.setSize(w,h);this.camera3D.aspect=ratio;this.camera3D.updateProjectionMatrix();this.topCamera.left=-300*ratio;this.topCamera.right=300*ratio;this.topCamera.updateProjectionMatrix();}
  private fit():void {const b=this.data.bounds,c=new THREE.Vector3((b.minX+b.maxX)/2,0,(b.minZ+b.maxZ)/2),span=Math.max(b.maxX-b.minX,b.maxZ-b.minZ,100);this.topControls.target.copy(c);this.orbit.target.copy(c);this.topCamera.position.set(c.x,20000,c.z);this.topCamera.zoom=600/span*0.9;this.topCamera.lookAt(c);this.topCamera.updateProjectionMatrix();this.camera3D.position.set(c.x+span*0.55,span*0.55,c.z+span*0.55);this.controls.update();this.populate();}
  private focus():void {const points=this.selectedRoads().flatMap(r=>roadPoints(r)),e=this.data.intersections.find(j=>j.id===this.selectedId)??this.data.objects.find(o=>o.id===this.selectedId);if(e)points.push(e.position);if(!points.length)return;const b=bounds(points),x=(b.minX+b.maxX)/2,z=(b.minZ+b.maxZ)/2,y=points[0]?.y??0,span=Math.max(100,b.maxX-b.minX,b.maxZ-b.minZ);this.controls.target.set(x,y,z);if(this.top){this.topCamera.position.set(x,20000,z);this.topCamera.zoom=600/span*0.7;this.topCamera.updateProjectionMatrix();}else this.camera3D.position.set(x+span*0.6,y+span*0.7,z+span*0.6);this.controls.update();this.populate();}
  private populate():void {const c=this.controls.target,d=this.top?600/this.topCamera.zoom:this.camera3D.position.distanceTo(c);this.view.populate(c,Math.min(1500,Math.max(150,d*0.8)));}
  private drawGrid():void {CityEditorScene.clear(this.grid);const grid=new THREE.GridHelper(20000,Math.min(200,Math.ceil(20000/this.data.sectorSize)),0x71b5c6,0x8a9e93);grid.position.y=0.025;this.grid.add(grid);this.grid.visible=this.checked('grid');}
  private selectedRoads():CityRoad[]{const c=this.data.editing?.corridors.find(c=>c.id===this.selectedId),g=this.data.editing?.groups.find(g=>g.id===this.selectedId);return this.data.roads.filter(r=>r.id===this.selectedId||c?.roadIds.includes(r.id)||g?.memberIds.includes(r.id)||this.multi.has(r.id));}
  private updateList():void {
    const list=this.require<HTMLSelectElement>('[data-list]'),query=this.value('search').toLowerCase();list.replaceChildren();
    const entries=[...(this.data.editing?.corridors??[]).map(c=>({id:c.id,label:`Corridor · ${c.name}`})),...(this.data.editing?.groups??[]).map(g=>({id:g.id,label:`${g.locked?'Locked ':''}Group · ${g.name}`})),...this.data.roads.map(r=>({id:r.id,label:`${r.displayName??this.data.roadNames?.[r.roadNameId??'']?.primaryText??'Road'} · ${r.id}`,district:r.district})),...this.data.intersections.map(j=>({id:j.id,label:`Junction · ${j.id}`})),...(this.data.signs??[]).map(s=>({id:s.id,label:`Sign · ${s.type} · ${s.id}`}))];
    for(const e of entries)if(!query||`${e.label} ${e.id} ${'district'in e?e.district:''}`.toLowerCase().includes(query))list.add(new Option(e.label,e.id,false,e.id===this.selectedId));
    if(!this.selectedId)list.selectedIndex=-1;
  }
  private controlIndices(r:CityRoad):number[]{const controls=this.kernel.getControlPoints(r.id);return controls.length<=8?controls.map((_,i)=>i):[0,Math.round((controls.length-1)/3),Math.round((controls.length-1)*2/3),controls.length-1];}
  private drawOverlay():void {
    CityEditorScene.clear(this.view.overlay);const g=this.view.overlay,mode=this.value('overlay'),visible=this.kernel.findRoads({center:{x:this.controls.target.x,z:this.controls.target.z},radius:1500,limit:500});
    const colors:Record<string,number>={expressway:0xf3ac51,arterial:0xffd874,collector:0x7dbcee,local:0xc7dedb,frontage:0x6de5bc,ramp:0xf087d0,connector:0xb299e7};
    if(mode!=='none')for(const brief of visible){const r=this.kernel.getRoad(brief.id)!;let color=colors[brief.roadClass]??0xffffff;if(mode==='elevation')color=new THREE.Color().setHSL(Math.max(0,Math.min(0.65,0.4-(brief.elevation[1]??0)/50)),0.8,0.6).getHex();if(mode==='corridor'){const id=brief.corridors[0];if(!id)continue;color=new THREE.Color().setHSL([...id].reduce((n,c)=>n+c.charCodeAt(0),0)%360/360,0.8,0.65).getHex();}if(mode!=='intersection')g.add(this.view.line(roadPoints(r),color));}
    if(mode==='intersection')for(const j of this.data.intersections)g.add(this.view.marker(j.position,0xffd36e,5));
    for(const r of this.selectedRoads()){g.add(this.view.line(roadPoints(r),0x46d7ff,0.8));if(r.id===this.selectedId){const controls=this.kernel.getControlPoints(r.id);if(this.data.editing?.curves?.[r.id])g.add(this.view.line(controls,0xe8c586));for(const i of this.controlIndices(r)){const marker=this.view.marker(controls[i]!,0xffd370);marker.userData.controlIndex=i;marker.userData.roadId=r.id;g.add(marker);}}}
    const j=this.data.intersections.find(j=>j.id===this.selectedId);if(j)g.add(this.view.marker(j.position,0xffd370,5));
    const sign=this.kernel.getSign(this.selectedId??'');if(sign)g.add(this.view.marker(sign.position,0xffd370,4));
    if(this.hoverId&&!this.selectedRoads().some(r=>r.id===this.hoverId)){const r=this.kernel.getRoad(this.hoverId);if(r)g.add(this.view.line(roadPoints(r),0xe4f7ff,0.8));}
    if(this.draft.length){g.add(this.view.line(this.draft,0x8ff5ba));for(const p of this.draft)g.add(this.view.marker(p,0x8ff5ba));}if(this.snap)g.add(this.view.marker(this.snap.point,0xf9a667,2.5));
  }
  private setRay(e:PointerEvent):void {const r=this.renderer.domElement.getBoundingClientRect();this.raycaster.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),this.camera);}
  private planePoint(e:PointerEvent,height=Number(this.value('height'))):CityPoint|null {this.setRay(e);const p=this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-height),new THREE.Vector3());return p?{x:p.x,y:p.y,z:p.z}:null;}
  private pick(e:PointerEvent):{id:string;point:CityPoint}|null {
    this.setRay(e);for(const hit of this.raycaster.intersectObjects(this.view.pickTargets,true)){let node:THREE.Object3D|null=hit.object;if(this.view.ghost===node.parent||this.view.overlay===node.parent)continue;const ids=(hit.object.userData.cityObjectIds??hit.object.userData.signIds) as string[]|undefined;const instance=ids&&hit.instanceId!==undefined?ids[hit.instanceId]:undefined;if(instance)return{id:instance,point:{x:hit.point.x,y:hit.point.y,z:hit.point.z}};while(node&&!node.userData.editorId)node=node.parent;if(node?.userData.editorId)return{id:node.userData.editorId as string,point:{x:hit.point.x,y:hit.point.y,z:hit.point.z}};}
    const point=this.planePoint(e);if(point)for(const brief of this.kernel.getNearbyRoads(point,20)){const r=this.kernel.getRoad(brief.id)!,p=project(roadPoints(r),point);if(p.distance<r.laneCount*r.laneWidth/2+2)return{id:r.id,point:p.point};}return null;
  }
  private snapped(point:CityPoint):CityPoint {if(!this.checked('snap')){this.snap=null;return point;}if(!this.snapPoint||Math.hypot(point.x-this.snapPoint.x,point.z-this.snapPoint.z)>0.5){this.snapPoint=point;this.snapChoice=0;this.snapOptions=snapCandidates(this.kernel,point,{anchor:this.draft.at(-1),excludeRoadId:this.drag?.id,tolerance:10,grid:Number(this.value('grid-step')),elevation:Number(this.value('height'))});}this.snap=this.snapOptions[this.snapChoice]??null;return this.snap?.point??point;}
  private pointerDown(e:PointerEvent):void {
    if(e.button!==0||this.pending)return;const p=this.planePoint(e);if(!p)return;
    try{
      if(this.tool==='road'){const point=this.snapped(p);if(!this.draft.length||Math.hypot(point.x-this.draft.at(-1)!.x,point.z-this.draft.at(-1)!.z)>0.2)this.draft.push({...point});this.drawOverlay();this.status();if(this.draft.length>1&&this.snap?.roadId)this.finishRoad();return;}
      if(this.tool==='intersection'){this.preview({op:'createIntersection',position:this.snapped(p)},'Create intersection');return;}
      if(this.tool==='object'){this.preview({op:'placeObject',properties:{prefabId:this.value('object') as typeof PREFAB_IDS[number],position:this.snapped(p),rotation:Number(this.value('rotation'))*Math.PI/180}},'Place object');return;}
      if(this.tool==='interchange'){const template=this.value('template'),parameters={position:this.snapped(p),rotation:Number(this.value('rotation'))*Math.PI/180,mainElevation:8,rampRadius:100};this.preview(['compact-diamond','diamond','directional-t','ramp-pair'].includes(template)?{op:'createInterchange',template:template as Extract<EditorCommand,{op:'createInterchange'}>['template'],parameters}:{op:'placePreset',presetId:template,parameters},'Create interchange');return;}
      const hit=this.pick(e);
      if(this.tool==='sign'){if(!hit)return;const sign=this.kernel.getSign(hit.id);if(sign){this.selectedId=sign.id;this.updateUI();this.drawOverlay();return;}const road=this.kernel.getRoad(hit.id);if(road){const p=project(roadPoints(road),hit.point);this.preview({op:'createSign',roadId:road.id,station:p.along,properties:road.roadNameId?{type:'ROAD_NAME',template:'urban-name'}:{type:'SPEED_LIMIT',template:'speed-limit',speedLimitKmh:road.speedLimit}},'Place road sign');}return;}
      if(this.tool==='ramp'){if(!hit||!this.kernel.getRoad(hit.id))return;const along=project(roadPoints(this.kernel.getRoad(hit.id)!),hit.point).along;if(!this.rampStart){this.rampStart={id:hit.id,distance:along};this.selectedId=hit.id;this.drawOverlay();this.status('Ramp: choose target road and merge location');}else{this.preview({op:'createRamp',fromRoadId:this.rampStart.id,toRoadId:hit.id,fromDistance:this.rampStart.distance,toDistance:along,kind:this.value('ramp-kind') as 'on'|'off',lanes:Number(this.value('ramp-lanes')) as 1|2},'Create ramp');this.rampStart=null;}return;}
      this.setRay(e);const handle=this.raycaster.intersectObject(this.view.overlay,true).find(h=>h.object.userData.controlIndex!==undefined);
      if(handle){const id=handle.object.userData.roadId as string,index=handle.object.userData.controlIndex as number;this.drag={id,index,point:this.kernel.getControlPoints(id)[index]!,screenY:e.clientY,moved:false};}
      else{if(e.ctrlKey&&hit&&this.kernel.getRoad(hit.id)){this.multi.has(hit.id)?this.multi.delete(hit.id):this.multi.add(hit.id);this.selectedId=hit.id;this.updateUI();this.drawOverlay();return;}
        const previous=this.kernel.getCorridor(this.selectedId??'');this.selectedId=hit?.id??null;if(this.tool==='corridor'&&hit){const corridor=this.data.editing?.corridors.find(c=>c.roadIds.includes(hit.id));if(corridor)this.selectedId=corridor.id;}if(previous&&hit&&previous.roadIds.includes(hit.id))this.selectedId=previous.id;this.multi.clear();if(this.selectedId)this.drag={id:this.selectedId,point:this.planePoint(e,hit?.point.y??0)??p,screenY:e.clientY,moved:false};}
      if(this.drag)this.renderer.domElement.setPointerCapture(e.pointerId);this.updateUI();this.drawOverlay();
    }catch(error){this.status(String(error));}
  }
  private pointerMove(e:PointerEvent):void {
    if(this.pending)return;
    if(this.drag){const drag=this.drag,p=this.planePoint(e,drag.point.y??0);if(!p)return;const elevation=e.shiftKey||this.tool==='elevation',dy=(drag.screenY-e.clientY)*0.1;if(!drag.moved&&Math.hypot(p.x-drag.point.x,p.z-drag.point.z)<0.5&&Math.abs(dy)<0.2)return;drag.moved=true;
      if(drag.index!==undefined)drag.command={op:'editControlPoint',roadId:drag.id,index:drag.index,point:elevation?{...drag.point,y:(drag.point.y??0)+dy}:p};
      else if(this.kernel.getRoad(drag.id)||this.kernel.getCorridor(drag.id))drag.command=elevation?{op:'setElevationProfile',id:drag.id,height:(this.selectedRoads()[0]?.centerline[0]?.y??0)+dy}:{op:this.kernel.getCorridor(drag.id)?'moveCorridor':'moveRoad',id:drag.id,delta:{x:p.x-drag.point.x,y:0,z:p.z-drag.point.z}};
      else if(this.kernel.getIntersection(drag.id))drag.command={op:'modifyIntersection',id:drag.id,properties:{position:{...p,y:elevation?(drag.point.y??0)+dy:this.kernel.getIntersection(drag.id)!.position.y}}};else if(this.kernel.getSign(drag.id))drag.command={op:'modifySign',id:drag.id,properties:{position:{...p,y:elevation?(drag.point.y??0)+dy:this.kernel.getSign(drag.id)!.position.y}}};else drag.command={op:'modifyObject',id:drag.id,properties:{position:{...p,y:elevation?(drag.point.y??0)+dy:drag.point.y}}};
      if(performance.now()-this.lastPointerPreview>65&&drag.command){this.lastPointerPreview=performance.now();this.preview(drag.command,'Move / edit selection',false);}return;}
    const hit=this.pick(e),id=hit?.id??null,p=this.planePoint(e),changed=id!==this.hoverId;this.hoverId=id;if(this.tool==='road'&&p){const point=this.snapped(p);if(this.draft.length&&performance.now()-this.lastPointerPreview>80){this.lastPointerPreview=performance.now();this.preview(this.roadCommand([...this.draft,point]),'Create road',false);}this.drawOverlay();this.status();}else if(changed){this.drawOverlay();this.status(hit?`Hover ${hit.id} · Y ${(hit.point.y??0).toFixed(1)}m`:undefined);}
  }
  private pointerUp(e:PointerEvent):void {const drag=this.drag;this.drag=null;if(this.renderer.domElement.hasPointerCapture(e.pointerId))this.renderer.domElement.releasePointerCapture(e.pointerId);if(drag?.moved&&drag.command)this.preview(drag.command,'Move / edit selection');}
  private roadCommand(points:CityPoint[]):EditorCommand{return this.extension?{op:'extendRoad',roadId:this.extension,end:'end',points:points.slice(1),crossing:this.value('crossing') as CrossingMode}:{op:'createRoad',preset:this.value('preset') as RoadPresetId,points,properties:{curve:this.value('curve') as 'smooth'|'polyline'},crossing:this.value('crossing') as CrossingMode};}
  private finishRoad():void {if(this.draft.length<2){this.status('Click at least two road control points');return;}this.preview(this.roadCommand(this.draft),'Create road');}
  private preview(command:EditorCommand|EditorCommand[],label:string,panel=true,propagate=false):EditSummary|null {
    try{const summary=this.kernel.preview(command,label);this.view.showGhost(this.kernel.previewData(summary.id),summary.valid);if(panel){this.pending=summary;this.require<HTMLElement>('.ce-preview').hidden=false;this.require('[data-preview-title]').textContent=label;this.require('[data-preview-report]').textContent=`+${summary.created.length} created · ${summary.modified.length} modified · −${summary.deleted.length} deleted · ${summary.warnings.length} issues`;this.require<HTMLButtonElement>('[data-action=commit]').disabled=!summary.valid;this.showIssues(summary.warnings,this.require('[data-issues]'));}this.status(summary.warnings.find(w=>w.severity==='error')?.message??`${label} · ghost preview${panel?' · Confirm to commit':''}`);;return summary;}catch(error){CityEditorScene.clear(this.view.ghost);if(panel){this.pending=null;this.require<HTMLElement>('.ce-preview').hidden=true;this.status(String(error));}if(propagate)throw error;return null;}
  }
  private commit(propagate=false):EditSummary|null {if(!this.pending){if(propagate)throw new Error('No pending preview');return null;}try{const summary=this.kernel.commit(this.pending.id);this.pending=null;this.require<HTMLElement>('.ce-preview').hidden=true;this.draft=[];this.extension=null;this.snap=null;this.dirty=true;if(this.selectedId&&!this.data.roads.some(r=>r.id===this.selectedId)&&!this.data.editing?.corridors.some(c=>c.id===this.selectedId)&&!this.data.intersections.some(j=>j.id===this.selectedId)&&!this.data.editing?.groups.some(g=>g.id===this.selectedId))this.selectedId=null;this.selectedId??=summary.created.find(id=>!!this.kernel.getRoad(id))??null;this.view.update(summary);this.populate();this.drawOverlay();this.updateUI();this.persist();return summary;}catch(error){this.status(String(error));if(propagate)throw error;return null;}}
  private cancel():void {this.pending=null;this.draft=[];this.extension=null;this.snap=null;this.drag=null;this.kernel.cancelPreview();CityEditorScene.clear(this.view.ghost);this.require<HTMLElement>('.ce-preview').hidden=true;this.drawOverlay();this.status();}
  private persist():void {window.clearTimeout(this.persistTimer);this.persistTimer=window.setTimeout(()=>{try{localStorage.setItem(CITY_EDITOR_STORAGE_KEY,JSON.stringify(this.data));}catch{this.status('Browser draft storage unavailable; use Save JSON.');}},400);}
  private showIssues(issues:EditorIssue[],target=this.inspector):void {target.replaceChildren();if(!issues.length){target.textContent='No local issues.';return;}for(const issue of issues){const b=document.createElement('button');b.className=`ce-issue ${issue.severity}`;b.textContent=`${issue.severity}: ${issue.code} · ${issue.message}`;b.addEventListener('click',()=>{this.selectedId=issue.ids[0]??null;this.drawOverlay();this.focus();});target.append(b);}}
  private updateUI():void {
    this.ui.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===this.tool));this.require<HTMLButtonElement>('[data-action=undo]').disabled=!this.kernel.history.canUndo;this.require<HTMLButtonElement>('[data-action=redo]').disabled=!this.kernel.history.canRedo;this.require('.ce-view-label').textContent=`${this.top?'TOP':'3D'} · ${this.tool.toUpperCase()}${this.multi.size?` · ${this.multi.size} selected`:''}`;
    this.updateList();
    this.inspector.replaceChildren();const title=document.createElement('h3');title.textContent=this.selectedId??'Map';this.inspector.append(title);
    const field=(label:string,value:string|number,choices?:string[]):HTMLInputElement|HTMLSelectElement=>{const row=document.createElement('label');row.append(label);const input=choices?document.createElement('select'):document.createElement('input');if(input instanceof HTMLSelectElement)for(const c of choices!)input.add(new Option(c,c));else{input.type=typeof value==='number'?'number':'text';input.step='any';}input.value=String(value);row.append(input);this.inspector.append(row);return input;};
    const button=(label:string,action:()=>void)=>{const b=document.createElement('button');b.textContent=label;b.addEventListener('click',action);this.inspector.append(b);};
    const hint=(text:string)=>{const p=document.createElement('p');p.className='ce-hint';p.textContent=text;this.inspector.append(p);};
    const roads=this.selectedRoads(),r=this.kernel.getRoad(this.selectedId??''),corridor=this.kernel.getCorridor(this.selectedId??''),j=this.kernel.getIntersection(this.selectedId??''),group=this.data.editing?.groups.find(g=>g.id===this.selectedId);
    if(roads.length){
      if(r){button('Extend road from end',()=>{this.cancel();this.tool='road';this.extension=r.id;this.draft=[{...roadPoints(r).at(-1)!}];this.require<HTMLInputElement>('[data-height]').value=String(this.draft[0]!.y??0);this.updateUI();this.drawOverlay();this.status('Extend road: click continuation points, then Enter to preview');});const splitDistance=field('Split distance m',Math.round(polylineLength(roadPoints(r))/2));button('Split road here',()=>this.preview({op:'splitRoad',roadId:r.id,point:sampleAt(roadPoints(r),Number(splitDistance.value)).point},'Split road'));}
      if(roads.length===2)button('Merge selected end → start',()=>this.preview({op:'mergeRoads',roadIds:[roads[0]!.id,roads[1]!.id]},'Merge roads'));
      const name=field('Corridor name',corridor?.name??'New Corridor');button('Create corridor from selection',()=>this.preview({op:'createCorridor',name:name.value,roadIds:roads.map(r=>r.id)},'Create corridor'));
      const dx=field('Move X m',0),dz=field('Move Z m',0);button('Preview move',()=>this.preview({op:corridor?'moveCorridor':'moveRoad',id:this.selectedId!,delta:{x:Number(dx.value),y:0,z:Number(dz.value)}},'Move road / corridor'));
      const profile=field('Cross section',this.value('preset'),Object.keys(EDITOR_ROAD_PRESETS));button('Apply road preset',()=>this.preview({op:'changeCrossSection',id:this.selectedId!,preset:profile.value as RoadPresetId},'Change cross section'));
      const semantic=field('Road function',r?.roadClass??roads[0]?.roadClass??'local',['expressway','arterial','collector','local','frontage','ramp','connector']);button('Apply semantic',()=>this.preview({op:'changeRoadClass',id:this.selectedId!,roadClass:semantic.value as Extract<EditorCommand,{op:'changeRoadClass'}>['roadClass']},'Change road semantic'));
      if(r){const lanes=field('Lanes',r.laneCount),width=field('Lane width m',r.laneWidth),speed=field('Speed km/h',r.speedLimit),curve=field('Curve',r.curve??'polyline',['polyline','smooth']);button('Preview road properties',()=>this.preview({op:'modifyRoad',id:r.id,properties:{type:undefined,crossSection:r.crossSection??'street',laneCount:Number(lanes.value),laneWidth:Number(width.value),speedLimit:Number(speed.value),curve:curve.value as 'smooth'|'polyline'}},'Edit road properties'));hint(`${polylineLength(roadPoints(r)).toFixed(0)}m · max grade ${(maxGrade(r)*100).toFixed(1)}%. Yellow handles edit path; Shift+drag changes height.`);}
      const roadName=field('Road name',r?.displayName??this.data.roadNames?.[r?.roadNameId??roads[0]?.roadNameId??'']?.primaryText??''),nameId=field('Name ID',r?.roadNameId??`name:${this.selectedId}`);
      button('Set name / sign registry',()=>this.preview({op:'setRoadName',id:this.selectedId!,nameId:nameId.value,entry:{primaryText:roadName.value,kind:roads[0]?.roadClass==='expressway'?'expressway':'urban'}},'Set road name'));
      const height=field('Height m',r?.centerline[0]?.y??0);button('Set whole road height',()=>this.preview({op:'setElevationProfile',id:this.selectedId!,height:Number(height.value)},'Set elevation'));
      const start=field('Section start m',r?Math.round(polylineLength(roadPoints(r))*0.35):50),end=field('Section end m',r?Math.round(polylineLength(roadPoints(r))*0.65):150),transition=field('Transition m',100),section=(h:number)=>this.preview({op:'setElevationProfile',id:this.selectedId!,height:h,start:Number(start.value),end:Number(end.value),transition:Number(transition.value)},'Set elevation section');button('Section elevated +8m',()=>section(8));button('Section depressed −6m',()=>section(-6));button('Set section height',()=>section(Number(height.value)));
      const vertical=document.createElement('textarea');vertical.placeholder='Profile distance:height, e.g. 0:0,100:8,200:8,300:0';this.inspector.append(vertical);button('Preview vertical profile',()=>{const points=vertical.value.split(',').map(pair=>{const[d,h]=pair.trim().split(':');return{distance:Number(d),height:Number(h)};});this.preview({op:'setElevationProfile',id:this.selectedId!,height:0,profile:points},'Set vertical profile');});
      const offset=field('Parallel offset m',35),parallelY=field('Parallel height m',0),side=field('Side','both',['both','left','right']),parallelPreset=field('Parallel preset','frontage2',Object.keys(EDITOR_ROAD_PRESETS));button('Generate frontage roads',()=>this.preview({op:'generateFrontageRoads',id:this.selectedId!,side:side.value as 'both'|'left'|'right',offset:Number(offset.value),elevation:Number(parallelY.value),preset:parallelPreset.value as RoadPresetId},'Generate frontage roads'));button('Create parallel road',()=>this.preview({op:'createParallelRoad',id:this.selectedId!,side:side.value==='left'?'left':'right',offset:Number(offset.value),elevation:Number(parallelY.value),preset:parallelPreset.value as RoadPresetId},'Create parallel road'));button('Detach generated roads',()=>this.preview({op:'detach',id:this.selectedId!},'Detach generated relationship'));
      button('Group selection',()=>this.preview({op:'createGroup',name:name.value,kind:'corridor',memberIds:roads.map(r=>r.id)},'Group roads'));button('Delete road / corridor',()=>this.preview(roads.map(r=>({op:'deleteRoad',id:r.id})),'Delete roads'));
    }
    if(j)this.intersectionInspector(j,field,button);
    const sign=this.kernel.getSign(this.selectedId??'');if(sign)this.signInspector(sign,field,button);
    if(group){hint(`${group.kind} · ${group.memberIds.length} objects · ${group.locked?'LOCKED':'editable'}`);button(group.locked?'Unlock group':'Lock group',()=>this.preview({op:'setLocked',id:group.id,locked:!group.locked},'Set group lock'));}
    const ramp=this.data.editing?.ramps.find(a=>a.roadId===this.selectedId);if(ramp){const kind=field('Ramp kind',ramp.kind,['on','off']);button('Apply ramp kind',()=>this.preview({op:'modifyRamp',id:ramp.id,kind:kind.value as 'on'|'off'},'Modify ramp'));}
    if(!this.selectedId){const mapId=field('Map ID',this.data.id),mapName=field('Map name',this.data.name),sector=field('Sector size m',this.data.sectorSize),spawn=this.data.environment.spawnPoints[0]!,x=field('Spawn X',spawn.position.x),y=field('Spawn Y',spawn.position.y??0),z=field('Spawn Z',spawn.position.z),yaw=field('Spawn heading °',spawn.rotation*180/Math.PI);button('Preview map properties',()=>this.preview({op:'modifyMap',properties:{id:mapId.value,name:mapName.value,sectorSize:Number(sector.value)},spawn:{position:{x:Number(x.value),y:Number(y.value),z:Number(z.value)},rotation:Number(yaw.value)*Math.PI/180}},'Edit map properties'));}
    const object=this.data.objects.find(o=>o.id===this.selectedId);if(object){const x=field('Object X',object.position.x),y=field('Object Y',object.position.y??0),z=field('Object Z',object.position.z),yaw=field('Object rotation °',object.rotation*180/Math.PI),sx=field('Scale X',object.scale?.x??1),sy=field('Scale Y',object.scale?.y??1),sz=field('Scale Z',object.scale?.z??1);button('Preview object properties',()=>this.preview({op:'modifyObject',id:object.id,properties:{position:{x:Number(x.value),y:Number(y.value),z:Number(z.value)},rotation:Number(yaw.value)*Math.PI/180,scale:{x:Number(sx.value),y:Number(sy.value),z:Number(sz.value)}}},'Edit object'));}
    if(!roads.length&&!j&&!group){hint('Choose a preset and click a path in Top or 3D. Enter previews the road. Every edit uses Preview → Confirm → Commit.');hint('Ramp: click source then target location. Corridor: Ctrl+click roads then create corridor. Save exports JSON; Open restores it.');const o=this.data.objects.find(o=>o.id===this.selectedId);if(o)button('Delete object',()=>this.preview({op:'deleteObject',id:o.id},'Delete object'));}
    this.status();
  }
  private intersectionInspector(j:CityIntersection,field:(label:string,value:string|number,choices?:string[])=>HTMLInputElement|HTMLSelectElement,button:(label:string,action:()=>void)=>void):void {
    const signals=field('Signals',j.signalized?'signalized':'unsignalized',['signalized','unsignalized']),y=field('Elevation m',j.position.y??0);button('Preview intersection',()=>this.preview({op:'modifyIntersection',id:j.id,properties:{signalized:signals.value==='signalized',position:{...j.position,y:Number(y.value)}}},'Modify intersection'));
    const capacity=field('Junction type',j.type,['t_2lane','t_4lane','cross_4lane','cross_6lane','irregular','divided_cross']);button('Preview arm capacity',()=>this.preview({op:'modifyIntersection',id:j.id,properties:{type:capacity.value as CityIntersection['type']}},'Change junction type'));
    for(const port of portsFor(j)){const c=j.connections.find(c=>c.port===port),control=field(`Arm ${port}`,c?`${c.roadId}:${c.end}`:'disconnected',['disconnected',...this.data.roads.flatMap(r=>['start','end'].map(end=>`${r.id}:${end}`))]);button(`Apply arm ${port}`,()=>{const value=control.value,connections=j.connections.filter(e=>e.port!==port);if(value!=='disconnected'){const index=value.lastIndexOf(':');connections.push({roadId:value.slice(0,index),end:value.slice(index+1) as 'start'|'end',port});}this.preview({op:'modifyIntersection',id:j.id,properties:{connections}},'Modify intersection arm');});}
    button('Group intersection',()=>this.preview({op:'createGroup',name:j.id,kind:'intersection',memberIds:[j.id,...j.connections.map(c=>c.roadId)]},'Group intersection'));button('Delete intersection',()=>this.preview({op:'deleteObject',id:j.id},'Delete intersection'));
  }
  private signInspector(sign:RoadSignDefinition,field:(label:string,value:string|number,choices?:string[])=>HTMLInputElement|HTMLSelectElement,button:(label:string,action:()=>void)=>void):void {
    const template=field('Sign template',sign.template,Object.keys(ROAD_SIGN_TEMPLATES)),size=field('Size',sign.size,['small','medium','large']),heading=field('Heading °',sign.heading*180/Math.PI),speed=field('Speed km/h',sign.speedLimitKmh??50),station=field('Station m',sign.stationMetres??0);
    const destinations=document.createElement('textarea');destinations.value=JSON.stringify(sign.destinations);destinations.title='Destinations: roadNameId, directionId, arrow, distanceMetres';this.inspector.append(destinations);
    button('Preview sign properties',()=>{try{this.preview({op:'modifySign',id:sign.id,properties:{template:template.value as RoadSignDefinition['template'],size:size.value as RoadSignDefinition['size'],heading:Number(heading.value)*Math.PI/180,speedLimitKmh:Number(speed.value),destinations:JSON.parse(destinations.value)}},'Edit road sign');}catch(error){this.status(String(error));}});
    button('Move sign along road',()=>this.preview({op:'modifySign',id:sign.id,properties:{stationMetres:Number(station.value)}},'Move sign station'));
    button('Select sign road',()=>{this.selectedId=sign.roadId;this.updateUI();this.drawOverlay();this.focus();});button('Delete sign',()=>this.preview({op:'deleteSign',id:sign.id},'Delete road sign'));
  }
  private action(action:string):void {
    try{
      if(action==='commit'){this.commit();return;}if(action==='cancel'){this.cancel();return;}if(action==='finish'){this.finishRoad();return;}
      if(action==='undo'||action==='redo'){this.cancel();if(action==='undo'?this.kernel.undo():this.kernel.redo()){this.view.reconcile();this.populate();this.updateUI();this.drawOverlay();this.dirty=true;this.persist();}return;}
      if(action==='view'){const target=this.controls.target.clone(),span=this.top?600/this.topCamera.zoom:this.camera3D.position.distanceTo(target);this.top=!this.top;this.controls.target.copy(target);if(this.top){this.topCamera.position.set(target.x,20000,target.z);this.topCamera.zoom=600/Math.max(10,span);this.topCamera.updateProjectionMatrix();this.topCamera.lookAt(target);}else this.camera3D.position.set(target.x+span*.6,target.y+span*.6,target.z+span*.6);this.configureControls();this.controls.update();this.drawOverlay();this.updateUI();this.populate();return;}
      if(action==='fit'){this.fit();return;}if(action==='focus'){this.focus();return;}if(action==='import'){this.file.click();return;}
      if(action==='main'){void this.openMain();return;}if(action==='test'){this.open(loadCityMap(testMap));return;}
      if(action==='new'){this.open(newCityMap());return;}if(action==='alpha'){this.open(loadCityMap(cityAlpha));return;}
      if(action==='export'){const text=saveMap(this.data),url=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=`${this.data.id}.json`;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);this.dirty=false;this.persist();this.status('Map exported with corridors, ramps and groups.');return;}
      if(action==='play'){localStorage.setItem(CITY_EDITOR_STORAGE_KEY,saveMap(this.data));this.dirty=false;const url=new URL(location.href);url.search='?city=editor';location.assign(url.href);return;}
      if(action==='validate-full'){const report=validateMap(this.data);this.showIssues([...report.errors,...report.warnings].map(e=>({severity:e.severity,code:e.code,ids:[],message:`${e.path}: ${e.message}`})));this.status(`Full map: ${report.errorCount} errors / ${report.warningCount} warnings`);return;}
      if(action==='validate'||action==='nearby'){const issues=action==='nearby'?this.kernel.validateArea(bounds([{x:this.controls.target.x,z:this.controls.target.z}],200)):this.selectedId?this.kernel.validateSelection(this.selectedId):this.kernel.validateArea(bounds([{x:this.controls.target.x,z:this.controls.target.z}],100));this.showIssues(issues);this.status(`Local validation: ${issues.filter(e=>e.severity==='error').length} errors / ${issues.filter(e=>e.severity==='warning').length} warnings`);}
    }catch(error){this.status(String(error));}
  }
  private async openMain():Promise<void> {this.status('Loading 清江市 City Main…');try{await prepareCityMain();this.open(structuredClone(cityMainRuntime().map));this.controls.target.set(0,0,0);this.camera3D.position.set(650,650,650);this.topCamera.position.set(0,20000,0);this.topCamera.zoom=0.5;this.topCamera.updateProjectionMatrix();this.controls.update();this.populate();this.status('清江市 City Main loaded · named corridors, stamp groups and signs available. Save exports JSON; CLI applies to the explicit regional-main source.');}catch(error){this.status(String(error));}}
  private open(data:CityMapData):void {this.cancel();this.scene.remove(this.view.root);this.view.dispose();this.kernel=new CityEditingKernel(data);this.view=new CityEditorScene(this.kernel);this.scene.add(this.view.root);this.selectedId=null;this.multi.clear();this.dirty=false;this.drawGrid();this.fit();this.updateUI();this.drawOverlay();this.expose();}
  private expose():void {
    const api={getRoad:(id:string)=>this.kernel.getRoad(id),getCorridor:(id:string)=>this.kernel.getCorridor(id),getIntersection:(id:string)=>this.kernel.getIntersection(id),listCorridors:(name?:string)=>this.kernel.listCorridors(name),getGroup:(id:string)=>this.kernel.getGroup(id),getSign:(id:string)=>this.kernel.getSign(id),findSigns:(q:Parameters<CityEditingKernel['findSigns']>[0])=>this.kernel.findSigns(q),findRoads:(q:Parameters<CityEditingKernel['findRoads']>[0])=>this.kernel.findRoads(q),getConnectedRoads:(id:string)=>this.kernel.getConnectedRoads(id),getNearbyRoads:(p:CityPoint,r:number)=>this.kernel.getNearbyRoads(p,r),inspectArea:(q:Parameters<CityEditingKernel['inspectArea']>[0])=>this.kernel.inspectArea(q),snapCandidates:(p:CityPoint)=>snapCandidates(this.kernel,p),preview:(commands:EditorCommand|EditorCommand[])=>this.preview(commands,'Agent edit',true,true),dryRun:(commands:EditorCommand|EditorCommand[])=>this.preview(commands,'Agent dry run',true,true),commit:(id?:string)=>{if(id&&id!==this.pending?.id)throw new Error('Preview expired');return this.commit(true);},cancel:()=>this.cancel(),validateRoad:(id:string)=>this.kernel.validateRoad(id),validateCorridor:(id:string)=>this.kernel.validateCorridor(id),validateIntersection:(id:string)=>this.kernel.validateIntersection(id),validateArea:(a:Parameters<CityEditingKernel['validateArea']>[0])=>this.kernel.validateArea(a),save:()=>saveMap(this.data)};
    (window as unknown as {cityEditor:typeof api}).cityEditor=api;
  }
  private key(e:KeyboardEvent):void {
    if((e.target as HTMLElement)?.matches('input,select,textarea'))return;
    if((e.ctrlKey||e.metaKey)&&e.code==='KeyZ'){e.preventDefault();this.action(e.shiftKey?'redo':'undo');}else if((e.ctrlKey||e.metaKey)&&e.code==='KeyY'){e.preventDefault();this.action('redo');}else if((e.ctrlKey||e.metaKey)&&e.code==='KeyS'){e.preventDefault();this.action('export');}else if(e.code==='Enter'){e.preventDefault();this.pending?this.commit():this.finishRoad();}else if(e.code==='Escape'){this.cancel();this.rampStart=null;}
    else if(e.code==='Delete'||e.code==='Backspace'){e.preventDefault();if(this.selectedId)this.preview(this.selectedRoads().length?this.selectedRoads().map(r=>({op:'deleteRoad',id:r.id})):{op:this.kernel.getSign(this.selectedId)?'deleteSign':'deleteObject',id:this.selectedId},'Delete selection');}
    else if(e.code==='KeyC'){const c=this.require<HTMLSelectElement>('[data-crossing]');c.selectedIndex=(c.selectedIndex+1)%c.options.length;if(this.draft.length>1)this.finishRoad();}
    else if(e.code==='Tab'&&this.snapOptions.length){e.preventDefault();this.snapChoice=(this.snapChoice+1)%this.snapOptions.length;this.snap=this.snapOptions[this.snapChoice]!;this.drawOverlay();this.status();}
  }
  private animate=(time:number):void=>{this.frame=requestAnimationFrame(this.animate);const dt=this.lastFrame?Math.min(0.1,(time-this.lastFrame)/1000):0;this.lastFrame=time;this.controls.update();if(time-this.lastPopulate>600&&!this.drag){this.lastPopulate=time;this.populate();}this.view.updateSignals(dt);this.renderer.render(this.scene,this.camera);};
  dispose():void {cancelAnimationFrame(this.frame);window.clearTimeout(this.persistTimer);this.observer.disconnect();window.removeEventListener('keydown',this.keyHandler);window.removeEventListener('beforeunload',this.unloadHandler);this.topControls.dispose();this.orbit.dispose();this.view.dispose();CityEditorScene.clear(this.grid);this.scene.traverse(o=>{if(o instanceof THREE.Mesh&&o.userData.editorTerrain){o.geometry.dispose();(o.material as THREE.Material).dispose();}});this.renderer.dispose();delete(window as unknown as {cityEditor?:unknown}).cityEditor;this.ui.remove();}
}
