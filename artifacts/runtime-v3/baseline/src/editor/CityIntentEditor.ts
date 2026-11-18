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
import { PlacementBrushPanel } from './PlacementBrushPanel';
import type { BrushCandidate, PlacementBrushRequest } from './PlacementBrush';

type Tool = 'select' | 'road' | 'corridor' | 'intersection' | 'ramp' | 'elevation' | 'object' | 'interchange' | 'sign' | 'brush';
interface Drag { id:string; index?:number; point:CityPoint; screenY:number; moved:boolean; command?:EditorCommand }
interface GizmoDrag { axis:'x'|'y'|'z'|'n'; origin:CityPoint; direction:CityPoint; startX:number; startY:number; screenX:number; screenY:number; screenLength:number; moved:boolean; command?:EditorCommand }
interface PreviewGhost { roads:CityRoad[]; intersections:CityIntersection[]; objects:CityMapData['objects']; signs:RoadSignDefinition[]; beforeRoads:CityRoad[]; beforeIntersections:CityIntersection[] }

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
  private readonly brushPanel:PlacementBrushPanel;
  private brushScope:{roadId?:string;intersectionId?:string;start?:number;end?:number;first?:CityPoint;last?:CityPoint}|null=null;
  private brushDragging=false;
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
  private gizmoDrag:GizmoDrag|null=null;
  private gizmoKey='';
  private showBefore=true;
  private previewGhost:PreviewGhost|null=null;
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
    this.ui.innerHTML=`<header><strong>城市意图编辑器</strong>${[['new','新建'],['main','清江市 City Main'],['alpha','City Alpha'],['test','测试地图'],['import','打开'],['export','保存'],['undo','撤销'],['redo','重做'],['view','顶视图 / 3D'],['fit','全图'],['focus','聚焦'],['diagnose','诊断'],['validate','验证选择'],['nearby','验证区域'],['validate-full','验证全图'],['play','试玩']].map(([a,l])=>`<button data-action="${a}">${l}</button>`).join('')}</header>
      <aside class="ce-tools"><h3>工具</h3>${(['select','road','corridor','intersection','ramp','elevation','object','interchange','sign','brush'] as Tool[]).map(t=>`<button data-tool="${t}">${this.toolName(t)}</button>`).join('')}
      <label>道路预设<select data-preset>${Object.entries(EDITOR_ROAD_PRESETS).map(([id,p])=>`<option value="${id}">${p.label}</option>`).join('')}</select></label>
      <label>曲线<select data-curve><option value="smooth">平滑</option><option value="polyline">折线</option></select></label>
      <label>绘制高程 m<input data-height type="number" value="0" step="1"></label>
      <label>相交方式<select data-crossing><option value="intersection">路口</option><option value="overpass">上跨 +8m</option><option value="underpass">下穿 −6m</option><option value="none">不连接</option></select></label><button data-action="finish">预览道路 (Enter)</button>
      <label>匝道类型<select data-ramp-kind><option value="off">出口匝道</option><option value="on">入口匝道</option></select></label><label>匝道车道<select data-ramp-lanes><option>1</option><option>2</option></select></label>
      <label>立交<select data-template><option value="compact-diamond">紧凑城市菱形</option><option value="diamond">基本菱形</option><option value="directional-t">定向 T / Y</option><option value="ramp-pair">快速路出入口对</option><optgroup label="现有配式">${PRESET_CATALOG.filter(p=>p.category==='INTERCHANGE').map(p=>`<option value="${p.id}">${p.id}</option>`).join('')}</optgroup></select></label>
      <label>旋转 °<input data-rotation type="number" value="0" step="15"></label><label>物体<select data-object>${PREFAB_IDS.map(id=>`<option>${id}</option>`).join('')}</select></label>
      <hr><label>吸附<input data-snap type="checkbox" checked></label><label>网格 m<input data-grid-step type="number" value="5" min="1" max="100"></label><label>分区网格<input data-grid type="checkbox" checked></label>
      <label>叠加<select data-overlay><option value="none">无</option><option value="semantic">道路语义</option><option value="elevation">高程</option><option value="corridor">走廊</option><option value="intersection">路口</option></select></label>
      <p class="ce-hint">左键：选择 / 画路 / 拖动。<br>3D：右键旋转；中键 / Shift+右键平移；滚轮缩放。<br>Shift+拖动：高程。<br>Ctrl+点击：多选。<br>Tab：切换吸附；C：相交方式。<br>Enter：预览 / 确认；Esc：取消。<br>选中后使用红/绿/蓝/品红轴向手柄移动。</p>
      <h3>道路 / 走廊 / 组 / 标牌</h3><input data-search placeholder="搜索道路名 / ID / 区域"><select data-list size="7"></select></aside><div class="ce-viewport"><div class="ce-view-label"></div><section class="ce-preview" hidden><strong data-preview-title></strong><p data-preview-report></p><p data-preview-metrics class="ce-hint"></p><button data-action="before">修复前 ghost: 开</button><button data-action="commit">确认 / 提交 (Enter)</button><button data-action="cancel">取消 (Esc)</button><details><summary>局部验证</summary><div data-issues></div></details></section></div><aside class="ce-inspector"></aside><footer></footer>`;
    host.replaceChildren(this.ui);this.viewport=this.require('.ce-viewport');this.inspector=this.require('.ce-inspector');this.viewport.prepend(this.renderer.domElement);
    this.brushPanel=new PlacementBrushPanel(this.require('.ce-tools'),()=>{if(this.tool==='brush')this.previewBrush();});
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
    this.file.addEventListener('change',()=>{const file=this.file.files?.[0];if(file)void file.text().then(text=>{const parsed=JSON.parse(text);if(parsed?.operations&&!parsed.roads)this.openAgentReceipt(parsed);else this.open(loadCityMap(parsed));}).catch(error=>this.status(String(error)));this.file.value='';});
    const canvas=this.renderer.domElement;canvas.addEventListener('pointerdown',e=>this.pointerDown(e));canvas.addEventListener('pointermove',e=>this.pointerMove(e));canvas.addEventListener('pointerup',e=>this.pointerUp(e));canvas.addEventListener('pointercancel',()=>{this.drag=null;this.gizmoDrag=null;this.cancel();});canvas.addEventListener('dblclick',e=>{if(e.button===0&&this.tool==='road')this.finishRoad();});
    canvas.addEventListener('wheel',e=>{if(this.tool!=='brush'||!e.altKey&&!e.shiftKey)return;e.preventDefault();e.stopImmediatePropagation();this.brushPanel.nudge(e.altKey?'height':'lateral',Math.sign(-e.deltaY)*(e.altKey?.05:.25));this.previewBrush();},{passive:false,capture:true});
    window.addEventListener('keydown',this.keyHandler);window.addEventListener('beforeunload',this.unloadHandler);this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(this.viewport);
    this.resize();this.fit();this.drawGrid();this.updateUI();this.populate();this.expose();this.animate(0);if(new URLSearchParams(location.search).get('map')==='regional-main')void this.openMain();
  }
  private toolName(t:Tool):string{return ({select:'选择',road:'道路',corridor:'走廊',intersection:'路口',ramp:'匝道',elevation:'高程',object:'物体',interchange:'立交',sign:'标牌',brush:'物件刷子'} as Record<Tool,string>)[t];}
  private previewBrush(panel=true):void {
    const request=this.brushPanel.request(),scope=this.brushScope;
    if(!scope){const road=this.kernel.getRoad(this.selectedId??''),junction=this.kernel.getIntersection(this.selectedId??'');if(road)this.brushScope={roadId:road.id,start:0,end:polylineLength(roadPoints(road))};else if(junction)this.brushScope={intersectionId:junction.id};else{this.status('刷子：请选择道路或路口，或拖出范围');return;}}
    const selected=this.brushScope!;
    const brush:PlacementBrushRequest={...request,roadId:selected.roadId,intersectionId:selected.intersectionId,stationStart:Math.min(selected.start??0,selected.end??0),stationEnd:Math.max(selected.start??0,selected.end??0),...(selected.first&&selected.last?{bbox:bounds([selected.first,selected.last])}:{})};
    if(request.mode==='LINE'&&selected.roadId){brush.stationStart=0;brush.stationEnd=polylineLength(roadPoints(this.kernel.getRoad(selected.roadId)!));}
    const summary=this.preview({op:'brushObjects',brush},'Placement Brush',panel);
    const metrics=summary?.metrics?.brush as {stats:Record<string,number>;candidates:BrushCandidate[]}|undefined;
    if(metrics){this.view.showBrush(metrics.candidates);this.brushPanel.report(JSON.stringify(metrics.stats));if(panel)this.require('[data-preview-metrics]').textContent=JSON.stringify({stats:metrics.stats,candidates:metrics.candidates.slice(0,5).map(c=>({state:c.state,height:c.position.y,anchor:c.anchor,issues:c.issues.map(i=>i.code),adjustment:c.adjustmentReasons}))});}
  }
  private require<T extends HTMLElement=HTMLElement>(s:string):T{return this.ui.querySelector<T>(s)!;}
  private value(name:string):string{return this.require<HTMLInputElement>(`[data-${name}]`).value;}
  private checked(name:string):boolean{return this.require<HTMLInputElement>(`[data-${name}]`).checked;}
  private get camera():THREE.Camera{return this.top?this.topCamera:this.camera3D;}
  private get controls():OrbitControls{return this.top?this.topControls:this.orbit;}
  private get data():CityMapData{return this.kernel.data;}
  private status(message?:string):void {this.require('footer').textContent=message??`${this.data.name}${this.dirty?' *':''} · ${this.data.roads.length} 条道路 · ${this.data.intersections.length} 个路口 · ${this.draft.length} 个控制点 · ${this.snap?`吸附：${this.snap.kind}`:'就绪'}`;}
  private configureControls():void {
    this.topControls.enabled=this.top;this.orbit.enabled=!this.top;this.topControls.enableRotate=false;
    for(const c of [this.topControls,this.orbit]){c.mouseButtons.LEFT=null;c.mouseButtons.MIDDLE=THREE.MOUSE.PAN;c.minDistance=5;c.maxDistance=40000;}
    this.topControls.mouseButtons.RIGHT=THREE.MOUSE.PAN;this.topControls.minZoom=0.002;this.topControls.maxZoom=100;this.orbit.mouseButtons.RIGHT=THREE.MOUSE.ROTATE;this.orbit.maxPolarAngle=Math.PI*0.88;
  }
  private resize():void {const w=Math.max(1,this.viewport.clientWidth),h=Math.max(1,this.viewport.clientHeight),ratio=w/h;this.renderer.setSize(w,h);this.camera3D.aspect=ratio;this.camera3D.updateProjectionMatrix();this.topCamera.left=-300*ratio;this.topCamera.right=300*ratio;this.topCamera.updateProjectionMatrix();}
  private fit():void {const b=this.data.bounds,c=new THREE.Vector3((b.minX+b.maxX)/2,0,(b.minZ+b.maxZ)/2),span=Math.max(b.maxX-b.minX,b.maxZ-b.minZ,100);this.topControls.target.copy(c);this.orbit.target.copy(c);this.topCamera.position.set(c.x,20000,c.z);this.topCamera.zoom=600/span*0.9;this.topCamera.lookAt(c);this.topCamera.updateProjectionMatrix();this.camera3D.position.set(c.x+span*0.55,span*0.55,c.z+span*0.55);this.controls.update();this.populate();}
  private focus():void {const points=this.selectedRoads().flatMap(r=>roadPoints(r)),e=this.data.intersections.find(j=>j.id===this.selectedId)??this.data.objects.find(o=>o.id===this.selectedId),sign=this.kernel.getSign(this.selectedId??'');if(e)points.push(e.position);if(sign)points.push(sign.position);if(!points.length)return;const b=bounds(points),x=(b.minX+b.maxX)/2,z=(b.minZ+b.maxZ)/2,y=points[0]?.y??0,span=Math.max(100,b.maxX-b.minX,b.maxZ-b.minZ);this.controls.target.set(x,y,z);if(this.top){this.topCamera.position.set(x,20000,z);this.topCamera.zoom=600/span*0.7;this.topCamera.updateProjectionMatrix();}else this.camera3D.position.set(x+span*0.6,y+span*0.7,z+span*0.6);this.controls.update();this.populate();}
  private populate():void {const c=this.controls.target,d=this.top?600/this.topCamera.zoom:this.camera3D.position.distanceTo(c);this.view.populate(c,Math.min(1500,Math.max(150,d*0.8)));}
  private drawGrid():void {CityEditorScene.clear(this.grid);const grid=new THREE.GridHelper(20000,Math.min(200,Math.ceil(20000/this.data.sectorSize)),0x71b5c6,0x8a9e93);grid.position.y=0.025;this.grid.add(grid);this.grid.visible=this.checked('grid');}
  private selectedRoads():CityRoad[]{const c=this.data.editing?.corridors.find(c=>c.id===this.selectedId),g=this.data.editing?.groups.find(g=>g.id===this.selectedId);return this.data.roads.filter(r=>r.id===this.selectedId||c?.roadIds.includes(r.id)||g?.memberIds.includes(r.id)||this.multi.has(r.id));}
  private updateList():void {
    const list=this.require<HTMLSelectElement>('[data-list]'),query=this.value('search').toLowerCase();list.replaceChildren();
    const entries=[...(this.data.editing?.corridors??[]).map(c=>({id:c.id,label:`走廊 · ${c.name}`})),...(this.data.editing?.groups??[]).map(g=>({id:g.id,label:`${g.locked?'Locked ':''}组 · ${g.name}`})),...this.data.roads.map(r=>({id:r.id,label:`${r.displayName??this.data.roadNames?.[r.roadNameId??'']?.primaryText??'道路'} · ${r.id}`,district:r.district})),...this.data.intersections.map(j=>({id:j.id,label:`路口 · ${j.id}`})),...(this.data.signs??[]).map(s=>({id:s.id,label:`标牌 · ${s.type} · ${s.id}`}))];
    for(const e of entries)if(!query||`${e.label} ${e.id} ${'district'in e?e.district:''}`.toLowerCase().includes(query))list.add(new Option(e.label,e.id,false,e.id===this.selectedId));
    if(!this.selectedId)list.selectedIndex=-1;
  }
  private controlIndices(r:CityRoad):number[]{const controls=this.kernel.getControlPoints(r.id);return controls.length<=8?controls.map((_,i)=>i):[0,Math.round((controls.length-1)/3),Math.round((controls.length-1)*2/3),controls.length-1];}
  private drawOverlay():void {
    CityEditorScene.clear(this.view.overlay);const g=this.view.overlay,mode=this.value('overlay'),visible=this.kernel.findRoads({center:{x:this.controls.target.x,z:this.controls.target.z},radius:1500,limit:500});
    const colors:Record<string,number>={expressway:0xf3ac51,arterial:0xffd874,collector:0x7dbcee,local:0xc7dedb,frontage:0x6de5bc,ramp:0xf087d0,connector:0xb299e7};
    if(mode!=='none')for(const brief of visible){const r=this.kernel.getRoad(brief.id)!;let color=colors[brief.roadClass]??0xffffff;if(mode==='elevation')color=new THREE.Color().setHSL(Math.max(0,Math.min(0.65,0.4-(brief.elevation[1]??0)/50)),0.8,0.6).getHex();if(mode==='corridor'){const id=brief.corridors[0];if(!id)continue;color=new THREE.Color().setHSL([...id].reduce((n,c)=>n+c.charCodeAt(0),0)%360/360,0.8,0.65).getHex();}if(mode!=='intersection')g.add(this.view.line(roadPoints(r),color));}
    if(mode==='intersection')for(const j of this.data.intersections)g.add(this.view.marker(j.position,0xffd36e,5));
    for(const r of this.selectedRoads()){const points=roadPoints(r);g.add(this.view.ribbon(points,r.laneCount*r.laneWidth,0x46d7ff,.16,.42));g.add(this.view.line(points,0x46d7ff,0.8));if(r.id===this.selectedId){const controls=this.kernel.getControlPoints(r.id),last=controls.length-1;if(this.data.editing?.curves?.[r.id])g.add(this.view.line(controls,0xe8c586));for(const i of this.controlIndices(r)){const endpoint=i===0||i===last,tangent=this.data.editing?.curves?.[r.id]&&!endpoint;const marker=this.view.marker(controls[i]!,endpoint?0x7df7ff:tangent?0xe8c586:0xffd370,2.3);marker.userData.controlIndex=i;marker.userData.roadId=r.id;g.add(marker);}}}
    const j=this.data.intersections.find(j=>j.id===this.selectedId);if(j)g.add(this.view.marker(j.position,0xffd370,5));
    const sign=this.kernel.getSign(this.selectedId??'');if(sign)g.add(this.view.marker(sign.position,0xffd370,4));
    if(this.hoverId&&!this.selectedRoads().some(r=>r.id===this.hoverId)){const r=this.kernel.getRoad(this.hoverId);if(r){const points=roadPoints(r);g.add(this.view.ribbon(points,r.laneCount*r.laneWidth,0xe4f7ff,.1,.4));g.add(this.view.line(points,0xe4f7ff,0.8));}}
    if(this.draft.length){g.add(this.view.line(this.draft,0x8ff5ba));for(const p of this.draft)g.add(this.view.marker(p,0x8ff5ba));}if(this.snap)g.add(this.view.marker(this.snap.point,0xf9a667,2.5));
    this.syncGizmo();
  }
  private setRay(e:PointerEvent):void {const r=this.renderer.domElement.getBoundingClientRect();this.raycaster.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),this.camera);}
  private planePoint(e:PointerEvent,height=Number(this.value('height'))):CityPoint|null {this.setRay(e);const p=this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-height),new THREE.Vector3());return p?{x:p.x,y:p.y,z:p.z}:null;}
  private screenPoint(p:CityPoint):{x:number;y:number} {const canvas=this.renderer.domElement,rect=canvas.getBoundingClientRect(),v=new THREE.Vector3(p.x,p.y??0,p.z).project(this.camera);return{x:rect.left+(v.x*.5+.5)*rect.width,y:rect.top+(-v.y*.5+.5)*rect.height};}
  private selectionGizmo():{center:CityPoint;normal:CityPoint}|null {
    const roads=this.selectedRoads();
    if(roads.length){const points=roads.flatMap(r=>roadPoints(r)),b=bounds(points);let tx=0,tz=0;
      for(const r of roads){const pts=roadPoints(r),a=pts[0]!,c=pts.at(-1)!;const l=Math.hypot(c.x-a.x,c.z-a.z)||1;tx+=(c.x-a.x)/l;tz+=(c.z-a.z)/l;}
      const l=Math.hypot(tx,tz)||1;return{center:{x:(b.minX+b.maxX)/2,y:points.reduce((sum,p)=>sum+(p.y??0),0)/points.length,z:(b.minZ+b.maxZ)/2},normal:{x:-tz/l,z:tx/l}};}
    const j=this.kernel.getIntersection(this.selectedId??''),sign=this.kernel.getSign(this.selectedId??''),object=this.data.objects.find(o=>o.id===this.selectedId);
    const position=j?.position??sign?.position??object?.position;if(!position)return null;
    return{center:{...position},normal:{x:0,z:1}};
  }
  private gizmoLength():number {return Math.max(14,Math.min(140,this.camera.position.distanceTo(this.controls.target)*.06));}
  private beginGizmoDrag(e:PointerEvent,axis:GizmoDrag['axis']):void {
    const selection=this.selectionGizmo();if(!selection)return;
    const direction=axis==='x'?{x:1,y:0,z:0}:axis==='y'?{x:0,y:1,z:0}:axis==='z'?{x:0,y:0,z:1}:{x:selection.normal.x,y:0,z:selection.normal.z};
    const origin=selection.center,p0=this.screenPoint(origin),p1=this.screenPoint({x:origin.x+direction.x*20,y:(origin.y??0)+direction.y*20,z:origin.z+direction.z*20});
    this.gizmoDrag={axis,origin,direction,startX:e.clientX,startY:e.clientY,screenX:p1.x-p0.x,screenY:p1.y-p0.y,screenLength:Math.max(1,Math.hypot(p1.x-p0.x,p1.y-p0.y)),moved:false};
    this.gizmoKey='';this.renderer.domElement.setPointerCapture(e.pointerId);
  }
  private dragGizmo(e:PointerEvent):void {
    const gizmo=this.gizmoDrag;if(!gizmo)return;
    const dx=e.clientX-gizmo.startX,dy=e.clientY-gizmo.startY;
    let amount=((dx*gizmo.screenX+dy*gizmo.screenY)/Math.max(1,gizmo.screenLength*gizmo.screenLength))*20;
    const step=gizmo.axis==='y'?.5:Math.max(1,Number(this.value('grid-step'))||5);
    if(this.checked('snap'))amount=Math.round(amount/step)*step;
    if(!gizmo.moved&&Math.abs(amount)<.05)return;
    gizmo.moved=true;
    const delta={x:gizmo.direction.x*amount,y:(gizmo.direction.y??0)*amount,z:gizmo.direction.z*amount};
    gizmo.command=this.moveSelectionCommand(delta)??undefined;
    if(gizmo.command&&performance.now()-this.lastPointerPreview>65){this.lastPointerPreview=performance.now();this.preview(gizmo.command,'移动选择',false);}
    this.status(`Move ${gizmo.axis.toUpperCase()} ${amount>=0?'+':''}${amount.toFixed(1)} m${this.checked('snap')?' · snapped':''}`);
  }
  private moveSelectionCommand(delta:CityPoint):EditorCommand|null {
    const id=this.selectedId;if(!id)return null;
    if(this.kernel.getRoad(id)||this.kernel.getCorridor(id)||this.kernel.getGroup(id))return{op:this.kernel.getCorridor(id)||this.kernel.getGroup(id)?'moveCorridor':'moveRoad',id,delta};
    const j=this.kernel.getIntersection(id);if(j)return{op:'modifyIntersection',id,properties:{position:{x:j.position.x+delta.x,y:(j.position.y??0)+(delta.y??0),z:j.position.z+delta.z}}};
    const sign=this.kernel.getSign(id);if(sign)return{op:'modifySign',id,properties:{position:{x:sign.position.x+delta.x,y:(sign.position.y??0)+(delta.y??0),z:sign.position.z+delta.z}}};
    const object=this.data.objects.find(o=>o.id===id);if(object)return{op:'modifyObject',id,properties:{position:{x:object.position.x+delta.x,y:(object.position.y??0)+(delta.y??0),z:object.position.z+delta.z}}};
    return null;
  }
  private syncGizmo():void {
    const selection=this.tool==='select'&&this.selectedId?this.selectionGizmo():null;
    if(!selection){if(this.gizmoKey){this.view.clearGizmo();this.gizmoKey='';}return;}
    const length=this.gizmoLength(),active=this.gizmoDrag?.axis??'';
    const key=`${selection.center.x.toFixed(1)},${selection.center.y?.toFixed(1)},${selection.center.z.toFixed(1)},${selection.normal.x.toFixed(2)},${selection.normal.z.toFixed(2)},${length.toFixed(0)},${active}`;
    if(key===this.gizmoKey)return;this.gizmoKey=key;this.view.showGizmo(selection.center,selection.normal,active,length);
  }
  private renderPreviewGhosts(valid=true):void {
    if(!this.previewGhost)return;
    this.view.showGhost(this.previewGhost,valid);
    if(this.showBefore)this.view.showBefore({roads:this.previewGhost.beforeRoads,intersections:this.previewGhost.beforeIntersections});else this.view.clearCompare();
  }
  private openAgentReceipt(receipt:{operations:EditorCommand|EditorCommand[];label?:string}):void {
    if(!receipt?.operations)throw new Error('Preview receipt has no operations');
    this.preview(receipt.operations,receipt.label??'Agent 修复预览',true);
    this.status('已载入 Agent 修复预览 · 橙色为修复前，绿色为修复后 · 确认提交，取消放弃');
  }
  private diagnoseSelection():void {
    const id=this.selectedId;
    const sign=this.kernel.getSign(id??''),object=this.data.objects.find(o=>o.id===id);
    const scope=id?(this.kernel.getCorridor(id)?{corridorId:id}:this.kernel.getIntersection(id)?{intersectionId:id}:this.kernel.getGroup(id)?{bbox:this.inspectBBox(id)}:sign?{roadId:sign.roadId}:object?{center:object.position,radius:80}:{roadId:id}):{center:{x:this.controls.target.x,z:this.controls.target.z},radius:250};
    try{const report=this.kernel.diagnose(scope);
      this.showIssues(report.issues.map(issue=>({severity:issue.severity==='info'?'warning':issue.severity,code:issue.code,ids:[issue.roadId??issue.intersectionId??''].filter(Boolean),message:issue.message})));
      this.status(`诊断 · ${report.counts.error} 错误 · ${report.counts.warning} 警告 · ${report.counts.info} 提示${report.truncated?' · 已截断':''}`);
    }catch(error){this.status(String(error));}
  }
  private inspectBBox(id:string):{minX:number;maxX:number;minZ:number;maxZ:number} {
    const group=this.kernel.getGroup(id),corridor=this.kernel.getCorridor(id),ids=new Set([...(group?.memberIds??[]),...(corridor?.roadIds??[])]);
    return bounds(this.data.roads.filter(r=>ids.has(r.id)).flatMap(r=>roadPoints(r)));
  }
  private pick(e:PointerEvent):{id:string;point:CityPoint}|null {
    this.setRay(e);for(const hit of this.raycaster.intersectObjects(this.view.pickTargets,true)){let node:THREE.Object3D|null=hit.object;if(this.view.ghost===node.parent||this.view.overlay===node.parent)continue;const ids=(hit.object.userData.cityObjectIds??hit.object.userData.signIds) as string[]|undefined;const instance=ids&&hit.instanceId!==undefined?ids[hit.instanceId]:undefined;if(instance)return{id:instance,point:{x:hit.point.x,y:hit.point.y,z:hit.point.z}};while(node&&!node.userData.editorId)node=node.parent;if(node?.userData.editorId)return{id:node.userData.editorId as string,point:{x:hit.point.x,y:hit.point.y,z:hit.point.z}};}
    const point=this.planePoint(e);if(point)for(const brief of this.kernel.getNearbyRoads(point,20)){const r=this.kernel.getRoad(brief.id)!,p=project(roadPoints(r),point);if(p.distance<r.laneCount*r.laneWidth/2+2)return{id:r.id,point:p.point};}return null;
  }
  private snapped(point:CityPoint):CityPoint {if(!this.checked('snap')){this.snap=null;return point;}if(!this.snapPoint||Math.hypot(point.x-this.snapPoint.x,point.z-this.snapPoint.z)>0.5){this.snapPoint=point;this.snapChoice=0;this.snapOptions=snapCandidates(this.kernel,point,{anchor:this.draft.at(-1),excludeRoadId:this.drag?.id,tolerance:10,grid:Number(this.value('grid-step')),elevation:Number(this.value('height'))});}this.snap=this.snapOptions[this.snapChoice]??null;return this.snap?.point??point;}
  private pointerDown(e:PointerEvent):void {
    if(e.button!==0||this.pending)return;const p=this.planePoint(e);if(!p)return;
    try{
      if(this.tool==='brush'){
        const hit=this.pick(e),request=this.brushPanel.request();
        if(request.type==='trafficLight'){const j=hit&&this.kernel.getIntersection(hit.id);if(!j){this.status('交通灯刷：请选择路口');return;}this.brushScope={intersectionId:j.id};this.previewBrush();return;}
        if(request.mode==='AREA')this.brushScope={first:p,last:p};
        else {const road=hit&&this.kernel.getRoad(hit.id);if(!road){this.status('道路刷：请点选道路');return;}const station=project(roadPoints(road),hit!.point).along;this.selectedId=road.id;this.brushScope={roadId:road.id,start:station,end:station};}
        this.brushDragging=true;this.renderer.domElement.setPointerCapture(e.pointerId);this.previewBrush(false);return;
      }
      if(this.tool==='select'&&this.selectedId){
        this.setRay(e);
        const gizmo=this.raycaster.intersectObjects(this.view.gizmoTargets,true).find(hit=>hit.object.userData.gizmoAxis);
        if(gizmo){this.beginGizmoDrag(e,gizmo.object.userData.gizmoAxis as GizmoDrag['axis']);return;}
      }
      if(this.tool==='road'){const point=this.snapped(p);if(!this.draft.length||Math.hypot(point.x-this.draft.at(-1)!.x,point.z-this.draft.at(-1)!.z)>0.2)this.draft.push({...point});this.drawOverlay();this.status();if(this.draft.length>1&&this.snap?.roadId)this.finishRoad();return;}
      if(this.tool==='intersection'){this.preview({op:'createIntersection',position:this.snapped(p)},'创建路口');return;}
      if(this.tool==='object'){this.preview({op:'placeObject',properties:{prefabId:this.value('object') as typeof PREFAB_IDS[number],position:this.snapped(p),rotation:Number(this.value('rotation'))*Math.PI/180}},'放置物体');return;}
      if(this.tool==='interchange'){const template=this.value('template'),parameters={position:this.snapped(p),rotation:Number(this.value('rotation'))*Math.PI/180,mainElevation:8,rampRadius:100};this.preview(['compact-diamond','diamond','directional-t','ramp-pair'].includes(template)?{op:'createInterchange',template:template as Extract<EditorCommand,{op:'createInterchange'}>['template'],parameters}:{op:'placePreset',presetId:template,parameters},'创建立交');return;}
      const hit=this.pick(e);
      if(this.tool==='sign'){if(!hit)return;const sign=this.kernel.getSign(hit.id);if(sign){this.selectedId=sign.id;this.updateUI();this.drawOverlay();return;}const road=this.kernel.getRoad(hit.id);if(road){const p=project(roadPoints(road),hit.point);this.preview({op:'createSign',roadId:road.id,station:p.along,properties:road.roadNameId?{type:'ROAD_NAME',template:'urban-name'}:{type:'SPEED_LIMIT',template:'speed-limit',speedLimitKmh:road.speedLimit}},'Place road sign');}return;}
      if(this.tool==='ramp'){if(!hit||!this.kernel.getRoad(hit.id))return;const along=project(roadPoints(this.kernel.getRoad(hit.id)!),hit.point).along;if(!this.rampStart){this.rampStart={id:hit.id,distance:along};this.selectedId=hit.id;this.drawOverlay();this.status('匝道：选择目标道路和汇入位置');}else{this.preview({op:'createRamp',fromRoadId:this.rampStart.id,toRoadId:hit.id,fromDistance:this.rampStart.distance,toDistance:along,kind:this.value('ramp-kind') as 'on'|'off',lanes:Number(this.value('ramp-lanes')) as 1|2},'Create ramp');this.rampStart=null;}return;}
      this.setRay(e);const handle=this.raycaster.intersectObject(this.view.overlay,true).find(h=>h.object.userData.controlIndex!==undefined);
      if(handle){const id=handle.object.userData.roadId as string,index=handle.object.userData.controlIndex as number;this.drag={id,index,point:this.kernel.getControlPoints(id)[index]!,screenY:e.clientY,moved:false};}
      else{if(e.ctrlKey&&hit&&this.kernel.getRoad(hit.id)){this.multi.has(hit.id)?this.multi.delete(hit.id):this.multi.add(hit.id);this.selectedId=hit.id;this.updateUI();this.drawOverlay();return;}
        const previous=this.kernel.getCorridor(this.selectedId??'');this.selectedId=hit?.id??null;if(this.tool==='corridor'&&hit){const corridor=this.data.editing?.corridors.find(c=>c.roadIds.includes(hit.id));if(corridor)this.selectedId=corridor.id;}if(previous&&hit&&previous.roadIds.includes(hit.id))this.selectedId=previous.id;this.multi.clear();if(this.selectedId)this.drag={id:this.selectedId,point:this.planePoint(e,hit?.point.y??0)??p,screenY:e.clientY,moved:false};}
      if(this.drag)this.renderer.domElement.setPointerCapture(e.pointerId);this.updateUI();this.drawOverlay();
    }catch(error){this.status(String(error));}
  }
  private pointerMove(e:PointerEvent):void {
    if(this.pending)return;
    if(this.brushDragging&&this.brushScope){const point=this.planePoint(e);if(!point)return;if(this.brushScope.roadId)this.brushScope.end=project(roadPoints(this.kernel.getRoad(this.brushScope.roadId)!),point).along;else this.brushScope.last=point;if(performance.now()-this.lastPointerPreview>120){this.lastPointerPreview=performance.now();this.previewBrush(false);}return;}
    if(this.gizmoDrag){this.dragGizmo(e);return;}
    if(this.drag){const drag=this.drag,p=this.planePoint(e,drag.point.y??0);if(!p)return;const elevation=e.shiftKey||this.tool==='elevation',dy=(drag.screenY-e.clientY)*0.1;if(!drag.moved&&Math.hypot(p.x-drag.point.x,p.z-drag.point.z)<0.5&&Math.abs(dy)<0.2)return;drag.moved=true;
      if(drag.index!==undefined)drag.command={op:'editControlPoint',roadId:drag.id,index:drag.index,point:elevation?{...drag.point,y:(drag.point.y??0)+dy}:p};
      else if(this.kernel.getRoad(drag.id)||this.kernel.getCorridor(drag.id))drag.command=elevation?{op:'setElevationProfile',id:drag.id,height:(this.selectedRoads()[0]?.centerline[0]?.y??0)+dy}:{op:this.kernel.getCorridor(drag.id)?'moveCorridor':'moveRoad',id:drag.id,delta:{x:p.x-drag.point.x,y:0,z:p.z-drag.point.z}};
      else if(this.kernel.getIntersection(drag.id))drag.command={op:'modifyIntersection',id:drag.id,properties:{position:{...p,y:elevation?(drag.point.y??0)+dy:this.kernel.getIntersection(drag.id)!.position.y}}};else if(this.kernel.getSign(drag.id))drag.command={op:'modifySign',id:drag.id,properties:{position:{...p,y:elevation?(drag.point.y??0)+dy:this.kernel.getSign(drag.id)!.position.y}}};else drag.command={op:'modifyObject',id:drag.id,properties:{position:{...p,y:elevation?(drag.point.y??0)+dy:drag.point.y}}};
      if(performance.now()-this.lastPointerPreview>65&&drag.command){this.lastPointerPreview=performance.now();this.preview(drag.command,'移动 / 编辑选择',false);}return;}
    const hit=this.pick(e),id=hit?.id??null,p=this.planePoint(e),changed=id!==this.hoverId;this.hoverId=id;if(this.tool==='road'&&p){const point=this.snapped(p);if(this.draft.length&&performance.now()-this.lastPointerPreview>80){this.lastPointerPreview=performance.now();this.preview(this.roadCommand([...this.draft,point]),'创建道路',false);}this.drawOverlay();this.status();}else if(changed){this.drawOverlay();this.status(hit?`Hover ${hit.id} · Y ${(hit.point.y??0).toFixed(1)}m`:undefined);}
  }
  private pointerUp(e:PointerEvent):void {
    if(this.brushDragging){this.brushDragging=false;if(this.renderer.domElement.hasPointerCapture(e.pointerId))this.renderer.domElement.releasePointerCapture(e.pointerId);this.previewBrush();return;}
    if(this.gizmoDrag){const gizmo=this.gizmoDrag;this.gizmoDrag=null;this.gizmoKey='';if(this.renderer.domElement.hasPointerCapture(e.pointerId))this.renderer.domElement.releasePointerCapture(e.pointerId);if(gizmo.moved&&gizmo.command)this.preview(gizmo.command,'移动选择');return;}
    const drag=this.drag;this.drag=null;if(this.renderer.domElement.hasPointerCapture(e.pointerId))this.renderer.domElement.releasePointerCapture(e.pointerId);if(drag?.moved&&drag.command)this.preview(drag.command,'移动 / 编辑选择');
  }
  private roadCommand(points:CityPoint[]):EditorCommand{return this.extension?{op:'extendRoad',roadId:this.extension,end:'end',points:points.slice(1),crossing:this.value('crossing') as CrossingMode}:{op:'createRoad',preset:this.value('preset') as RoadPresetId,points,properties:{curve:this.value('curve') as 'smooth'|'polyline'},crossing:this.value('crossing') as CrossingMode};}
  private finishRoad():void {if(this.draft.length<2){this.status('请至少点击两个道路控制点');return;}this.preview(this.roadCommand(this.draft),'创建道路');}
  private preview(command:EditorCommand|EditorCommand[],label:string,panel=true,propagate=false):EditSummary|null {
    try{const summary=this.kernel.preview(command,label);this.previewGhost=this.kernel.previewData(summary.id);this.renderPreviewGhosts(summary.valid);if(panel){this.pending=summary;this.require<HTMLElement>('.ce-preview').hidden=false;this.require('[data-preview-title]').textContent=label;this.require('[data-preview-report]').textContent=`+${summary.created.length} 新建 · ${summary.modified.length} 修改 · −${summary.deleted.length} 删除 · ${summary.warnings.length} 个问题`;const metrics=summary.metrics?Object.entries(summary.metrics).map(([id,value])=>`${id}: ${JSON.stringify(value)}`).join(' · '):'';this.require('[data-preview-metrics]').textContent=metrics;this.require<HTMLButtonElement>('[data-action=before]').textContent=`修复前 ghost: ${this.showBefore?'开':'关'}`;this.require<HTMLButtonElement>('[data-action=commit]').disabled=!summary.valid;this.showIssues(summary.warnings,this.require('[data-issues]'));}this.status(summary.warnings.find(w=>w.severity==='error')?.message??`${label} · ghost 预览${panel?' · 确认后提交':''}`);return summary;}catch(error){CityEditorScene.clear(this.view.ghost);this.view.clearCompare();this.previewGhost=null;if(panel){this.pending=null;this.require<HTMLElement>('.ce-preview').hidden=true;this.status(String(error));}if(propagate)throw error;return null;}
  }
  private commit(propagate=false):EditSummary|null {if(!this.pending){if(propagate)throw new Error('No pending preview');return null;}try{const summary=this.kernel.commit(this.pending.id);this.pending=null;this.previewGhost=null;this.gizmoKey='';this.view.clearCompare();this.require<HTMLElement>('.ce-preview').hidden=true;this.draft=[];this.extension=null;this.snap=null;this.dirty=true;if(this.selectedId&&!this.data.roads.some(r=>r.id===this.selectedId)&&!this.data.editing?.corridors.some(c=>c.id===this.selectedId)&&!this.data.intersections.some(j=>j.id===this.selectedId)&&!this.data.editing?.groups.some(g=>g.id===this.selectedId))this.selectedId=null;this.selectedId??=summary.created.find(id=>!!this.kernel.getRoad(id))??null;this.view.update(summary);this.populate();this.drawOverlay();this.updateUI();this.persist();return summary;}catch(error){this.status(String(error));if(propagate)throw error;return null;}}
  private cancel():void {this.brushDragging=false;this.brushScope=null;CityEditorScene.clear(this.view.brushGhost);this.pending=null;this.previewGhost=null;this.gizmoKey='';this.gizmoDrag=null;this.draft=[];this.extension=null;this.snap=null;this.drag=null;this.kernel.cancelPreview();CityEditorScene.clear(this.view.ghost);this.view.clearCompare();this.require<HTMLElement>('.ce-preview').hidden=true;this.drawOverlay();this.status();}
  private persist():void {window.clearTimeout(this.persistTimer);this.persistTimer=window.setTimeout(()=>{try{localStorage.setItem(CITY_EDITOR_STORAGE_KEY,JSON.stringify(this.data));}catch{this.status('浏览器草稿存储不可用；请使用“保存”导出 JSON。');}},400);}
  private showIssues(issues:EditorIssue[],target=this.inspector):void {target.replaceChildren();if(!issues.length){target.textContent='无局部问题。';return;}for(const issue of issues){const b=document.createElement('button');b.className=`ce-issue ${issue.severity}`;b.textContent=`${issue.severity==='error'?'错误':issue.severity==='warning'?'警告':'提示'}：${issue.code} · ${issue.message}`;b.addEventListener('click',()=>{this.selectedId=issue.ids[0]??null;this.drawOverlay();this.focus();});target.append(b);}}
  private updateUI():void {
    this.ui.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===this.tool));this.require<HTMLButtonElement>('[data-action=undo]').disabled=!this.kernel.history.canUndo;this.require<HTMLButtonElement>('[data-action=redo]').disabled=!this.kernel.history.canRedo;this.require('.ce-view-label').textContent=`${this.top?'顶视图':'3D'} · ${this.toolName(this.tool)}${this.multi.size?` · 已选 ${this.multi.size}`:''}`;
    this.updateList();
    this.inspector.replaceChildren();const title=document.createElement('h3');title.textContent=this.selectedId??'地图';this.inspector.append(title);
    const field=(label:string,value:string|number,choices?:string[]):HTMLInputElement|HTMLSelectElement=>{const row=document.createElement('label');row.append(label);const input=choices?document.createElement('select'):document.createElement('input');if(input instanceof HTMLSelectElement)for(const c of choices!)input.add(new Option(c,c));else{input.type=typeof value==='number'?'number':'text';input.step='any';}input.value=String(value);row.append(input);this.inspector.append(row);return input;};
    const button=(label:string,action:()=>void)=>{const b=document.createElement('button');b.textContent=label;b.addEventListener('click',action);this.inspector.append(b);};
    const hint=(text:string)=>{const p=document.createElement('p');p.className='ce-hint';p.textContent=text;this.inspector.append(p);};
    const roads=this.selectedRoads(),r=this.kernel.getRoad(this.selectedId??''),corridor=this.kernel.getCorridor(this.selectedId??''),j=this.kernel.getIntersection(this.selectedId??''),group=this.data.editing?.groups.find(g=>g.id===this.selectedId);
    if(roads.length){
      if(r){button('从终点延伸道路',()=>{this.cancel();this.tool='road';this.extension=r.id;this.draft=[{...roadPoints(r).at(-1)!}];this.require<HTMLInputElement>('[data-height]').value=String(this.draft[0]!.y??0);this.updateUI();this.drawOverlay();this.status('延伸道路：点击后续点，然后按 Enter 预览');});const splitDistance=field('分割距离 m',Math.round(polylineLength(roadPoints(r))/2));button('在此分割道路',()=>this.preview({op:'splitRoad',roadId:r.id,point:sampleAt(roadPoints(r),Number(splitDistance.value)).point},'分割道路'));}
      if(roads.length===2)button('合并所选（终点 → 起点）',()=>this.preview({op:'mergeRoads',roadIds:[roads[0]!.id,roads[1]!.id]},'合并道路'));
      const name=field('走廊名',corridor?.name??'New Corridor');button('用所选创建走廊',()=>this.preview({op:'createCorridor',name:name.value,roadIds:roads.map(r=>r.id)},'创建走廊'));
      const dx=field('移动 X 米',0),dy=field('移动 Y 米',0),dz=field('移动 Z 米',0);button('预览移动',()=>this.preview({op:corridor?'moveCorridor':'moveRoad',id:this.selectedId!,delta:{x:Number(dx.value),y:Number(dy.value),z:Number(dz.value)}},'移动道路 / 走廊'));
      const profile=field('横断面',this.value('preset'),Object.keys(EDITOR_ROAD_PRESETS));button('应用道路预设',()=>this.preview({op:'changeCrossSection',id:this.selectedId!,preset:profile.value as RoadPresetId},'修改横断面'));
      const semantic=field('道路功能',r?.roadClass??roads[0]?.roadClass??'local',['expressway','arterial','collector','local','frontage','ramp','connector']);button('应用道路功能',()=>this.preview({op:'changeRoadClass',id:this.selectedId!,roadClass:semantic.value as Extract<EditorCommand,{op:'changeRoadClass'}>['roadClass']},'修改道路功能'));
      if(r){const lanes=field('车道数',r.laneCount),width=field('车道宽 m',r.laneWidth),speed=field('限速 km/h',r.speedLimit),curve=field('曲线',r.curve??'polyline',['polyline','smooth']);button('预览道路属性',()=>this.preview({op:'modifyRoad',id:r.id,properties:{type:undefined,crossSection:r.crossSection??'street',laneCount:Number(lanes.value),laneWidth:Number(width.value),speedLimit:Number(speed.value),curve:curve.value as 'smooth'|'polyline'}},'编辑道路属性'));hint(`${polylineLength(roadPoints(r)).toFixed(0)}m · 最大坡度 ${(maxGrade(r)*100).toFixed(1)}%。轴向手柄：红 X、绿 Y、蓝 Z、品红 道路法向。黄色控制点编辑路径；Shift+拖动调整高程。`);}
      button('诊断选择',()=>this.diagnoseSelection());
      button('预览平滑线形',()=>this.preview({op:'smoothRoad',id:this.selectedId!,strength:1},'平滑线形'));
      button('预览纵坡修复',()=>this.preview({op:'repairElevation',id:this.selectedId!,strength:1.5,maxGrade:0.08},'修复纵坡'));
      button('预览简化中心线',()=>this.preview({op:'simplifyRoad',id:this.selectedId!,tolerance:0.2},'简化中心线'));
      const roadName=field('道路名',r?.displayName??this.data.roadNames?.[r?.roadNameId??roads[0]?.roadNameId??'']?.primaryText??''),nameId=field('名称 ID',r?.roadNameId??roads[0]?.roadNameId??`name:${this.selectedId}`);
      const nameKind:( 'expressway'|'urban')=roads[0]?.roadClass==='expressway'?'expressway':'urban';
      if(corridor){const corridorName=field('走廊名',corridor.name);button('设置走廊名',()=>this.preview({op:'setCorridorName',id:corridor.id,name:corridorName.value},'设置走廊名'));button('重命名注册表条目',()=>this.preview({op:'setCorridorName',id:corridor.id,name:roadName.value,nameId:nameId.value,kind:nameKind},'重命名走廊注册表'));}
      else button('设置道路名',()=>this.preview({op:'setRoadName',id:this.selectedId!,nameId:nameId.value,entry:{primaryText:roadName.value,kind:nameKind}},'设置道路名'));
      if(roads.length>1)button('应用到所选道路',()=>this.preview(roads.map(road=>({op:'setRoadName' as const,id:road.id,nameId:nameId.value,entry:{primaryText:roadName.value,kind:nameKind}})),'命名所选道路'));
      hint('道路名统一来自 RoadNameRegistry / roadNameId；编辑器、导航、小地图和路牌读取同一条目。分割道路继承名称；平行路/辅路和匝道默认不继承主路名。');
      const height=field('高程 m',r?.centerline[0]?.y??0);button('设置整条道路高程',()=>this.preview({op:'setElevationProfile',id:this.selectedId!,height:Number(height.value)},'设置高程'));
      const start=field('区段起点 m',r?Math.round(polylineLength(roadPoints(r))*0.35):50),end=field('区段终点 m',r?Math.round(polylineLength(roadPoints(r))*0.65):150),transition=field('过渡段 m',100),section=(h:number)=>this.preview({op:'setElevationProfile',id:this.selectedId!,height:h,start:Number(start.value),end:Number(end.value),transition:Number(transition.value)},'设置区段高程');button('区段抬高 +8m',()=>section(8));button('区段下压 −6m',()=>section(-6));button('设置区段高程',()=>section(Number(height.value)));
      const vertical=document.createElement('textarea');vertical.placeholder='Profile distance:height, e.g. 0:0,100:8,200:8,300:0';this.inspector.append(vertical);button('预览纵坡剖面',()=>{const points=vertical.value.split(',').map(pair=>{const[d,h]=pair.trim().split(':');return{distance:Number(d),height:Number(h)};});this.preview({op:'setElevationProfile',id:this.selectedId!,height:0,profile:points},'设置纵坡剖面');});
      const offset=field('平行偏移 m',35),parallelY=field('平行道路高程 m',0),side=field('方向','both',['both','left','right']),parallelPreset=field('平行道路预设','frontage2',Object.keys(EDITOR_ROAD_PRESETS));button('生成辅路',()=>this.preview({op:'generateFrontageRoads',id:this.selectedId!,side:side.value as 'both'|'left'|'right',offset:Number(offset.value),elevation:Number(parallelY.value),preset:parallelPreset.value as RoadPresetId},'生成辅路'));button('创建平行道路',()=>this.preview({op:'createParallelRoad',id:this.selectedId!,side:side.value==='left'?'left':'right',offset:Number(offset.value),elevation:Number(parallelY.value),preset:parallelPreset.value as RoadPresetId},'创建平行道路'));button('解除生成关系',()=>this.preview({op:'detach',id:this.selectedId!},'解除生成关系'));
      button('编组所选',()=>this.preview({op:'createGroup',name:name.value,kind:'corridor',memberIds:roads.map(r=>r.id)},'编组道路'));button('删除道路 / 走廊',()=>this.preview(roads.map(r=>({op:'deleteRoad',id:r.id})),'删除道路'));
    }
    if(j)this.intersectionInspector(j,field,button);
    const sign=this.kernel.getSign(this.selectedId??'');if(sign)this.signInspector(sign,field,button);
    if(group){hint(`${group.kind} · ${group.memberIds.length} 个对象 · ${group.locked?'已锁定':'可编辑'}`);button(group.locked?'解锁组':'锁定组',()=>this.preview({op:'setLocked',id:group.id,locked:!group.locked},'设置组锁定'));}
    const ramp=this.data.editing?.ramps.find(a=>a.roadId===this.selectedId);if(ramp){const kind=field('匝道类型',ramp.kind,['on','off']);button('应用匝道类型',()=>this.preview({op:'modifyRamp',id:ramp.id,kind:kind.value as 'on'|'off'},'修改匝道'));button('修复匝道（平面 + 纵坡）',()=>this.preview({op:'repairRamp',id:ramp.id},'修复匝道'));}
    if(!this.selectedId){const mapId=field('地图 ID',this.data.id),mapName=field('地图名',this.data.name),sector=field('分区尺寸 m',this.data.sectorSize),spawn=this.data.environment.spawnPoints[0]!,x=field('出生点 X',spawn.position.x),y=field('出生点 Y',spawn.position.y??0),z=field('出生点 Z',spawn.position.z),yaw=field('出生朝向 °',spawn.rotation*180/Math.PI);button('预览地图属性',()=>this.preview({op:'modifyMap',properties:{id:mapId.value,name:mapName.value,sectorSize:Number(sector.value)},spawn:{position:{x:Number(x.value),y:Number(y.value),z:Number(z.value)},rotation:Number(yaw.value)*Math.PI/180}},'编辑地图属性'));}
    const object=this.data.objects.find(o=>o.id===this.selectedId);if(object){const x=field('物体 X',object.position.x),y=field('物体 Y',object.position.y??0),z=field('物体 Z',object.position.z),yaw=field('物体旋转 °',object.rotation*180/Math.PI),sx=field('缩放 X',object.scale?.x??1),sy=field('缩放 Y',object.scale?.y??1),sz=field('缩放 Z',object.scale?.z??1);button('预览物体属性',()=>this.preview({op:'modifyObject',id:object.id,properties:{position:{x:Number(x.value),y:Number(y.value),z:Number(z.value)},rotation:Number(yaw.value)*Math.PI/180,scale:{x:Number(sx.value),y:Number(sy.value),z:Number(sz.value)}}},'编辑物体'));}
    if(!roads.length&&!j&&!group){hint('选择预设后在顶视图或 3D 中点击路径；Enter 预览道路。所有修改都走 预览 → 确认 → 提交。');hint('匝道：先点源道路再点目标位置。走廊：Ctrl+点击多条道路后创建走廊。保存导出 JSON；打开可恢复。');const o=this.data.objects.find(o=>o.id===this.selectedId);if(o)button('删除物体',()=>this.preview({op:'deleteObject',id:o.id},'删除物体'));}
    this.status();
  }
  private intersectionInspector(j:CityIntersection,field:(label:string,value:string|number,choices?:string[])=>HTMLInputElement|HTMLSelectElement,button:(label:string,action:()=>void)=>void):void {
    button('诊断路口',()=>this.diagnoseSelection());
    button('重建路口几何',()=>this.preview({op:'repairIntersection',id:j.id},'重建路口'));
    const signals=field('信号控制',j.signalized?'signalized':'unsignalized',['signalized','unsignalized']),y=field('高程 m',j.position.y??0);button('预览路口',()=>this.preview({op:'modifyIntersection',id:j.id,properties:{signalized:signals.value==='signalized',position:{...j.position,y:Number(y.value)}}},'修改路口'));
    const capacity=field('路口类型',j.type,['t_2lane','t_4lane','cross_4lane','cross_6lane','irregular','divided_cross']);button('预览进口道容量',()=>this.preview({op:'modifyIntersection',id:j.id,properties:{type:capacity.value as CityIntersection['type']}},'修改路口类型'));
    for(const port of portsFor(j)){const c=j.connections.find(c=>c.port===port),control=field(`Arm ${port}`,c?`${c.roadId}:${c.end}`:'disconnected',['disconnected',...this.data.roads.flatMap(r=>['start','end'].map(end=>`${r.id}:${end}`))]);button(`Apply arm ${port}`,()=>{const value=control.value,connections=j.connections.filter(e=>e.port!==port);if(value!=='disconnected'){const index=value.lastIndexOf(':');connections.push({roadId:value.slice(0,index),end:value.slice(index+1) as 'start'|'end',port});}this.preview({op:'modifyIntersection',id:j.id,properties:{connections}},'修改路口进口道');});}
    button('编组路口',()=>this.preview({op:'createGroup',name:j.id,kind:'intersection',memberIds:[j.id,...j.connections.map(c=>c.roadId)]},'编组路口'));button('删除路口',()=>this.preview({op:'deleteObject',id:j.id},'删除路口'));
  }
  private signInspector(sign:RoadSignDefinition,field:(label:string,value:string|number,choices?:string[])=>HTMLInputElement|HTMLSelectElement,button:(label:string,action:()=>void)=>void):void {
    const template=field('标牌模板',sign.template,Object.keys(ROAD_SIGN_TEMPLATES)),size=field('尺寸',sign.size,['small','medium','large']),heading=field('朝向 °',sign.heading*180/Math.PI),speed=field('限速 km/h',sign.speedLimitKmh??50),station=field('桩号 m',sign.stationMetres??0);
    const destinations=document.createElement('textarea');destinations.value=JSON.stringify(sign.destinations);destinations.title='Destinations: roadNameId, directionId, arrow, distanceMetres';this.inspector.append(destinations);
    button('预览标牌属性',()=>{try{this.preview({op:'modifySign',id:sign.id,properties:{template:template.value as RoadSignDefinition['template'],size:size.value as RoadSignDefinition['size'],heading:Number(heading.value)*Math.PI/180,speedLimitKmh:Number(speed.value),destinations:JSON.parse(destinations.value)}},'编辑路牌');}catch(error){this.status(String(error));}});
    button('沿道路移动标牌',()=>this.preview({op:'modifySign',id:sign.id,properties:{stationMetres:Number(station.value)}},'移动路牌桩号'));
    button('选择标牌道路',()=>{this.selectedId=sign.roadId;this.updateUI();this.drawOverlay();this.focus();});button('删除标牌',()=>this.preview({op:'deleteSign',id:sign.id},'删除路牌'));
  }
  private action(action:string):void {
    try{
      if(action==='commit'){this.commit();return;}if(action==='cancel'){this.cancel();return;}if(action==='finish'){this.finishRoad();return;}
      if(action==='before'){this.showBefore=!this.showBefore;this.require<HTMLButtonElement>('[data-action=before]').textContent=`修复前 ghost: ${this.showBefore?'开':'关'}`;this.renderPreviewGhosts(this.pending?.valid??true);return;}
      if(action==='diagnose'){this.diagnoseSelection();return;}
      if(action==='undo'||action==='redo'){this.cancel();if(action==='undo'?this.kernel.undo():this.kernel.redo()){this.view.reconcile();this.populate();this.updateUI();this.drawOverlay();this.dirty=true;this.persist();}return;}
      if(action==='view'){const target=this.controls.target.clone(),span=this.top?600/this.topCamera.zoom:this.camera3D.position.distanceTo(target);this.top=!this.top;this.controls.target.copy(target);if(this.top){this.topCamera.position.set(target.x,20000,target.z);this.topCamera.zoom=600/Math.max(10,span);this.topCamera.updateProjectionMatrix();this.topCamera.lookAt(target);}else this.camera3D.position.set(target.x+span*.6,target.y+span*.6,target.z+span*.6);this.configureControls();this.controls.update();this.drawOverlay();this.updateUI();this.populate();return;}
      if(action==='fit'){this.fit();return;}if(action==='focus'){this.focus();return;}if(action==='import'){this.file.click();return;}
      if(action==='main'){void this.openMain();return;}if(action==='test'){this.open(loadCityMap(testMap));return;}
      if(action==='new'){this.open(newCityMap());return;}if(action==='alpha'){this.open(loadCityMap(cityAlpha));return;}
      if(action==='export'){const text=saveMap(this.data),url=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=`${this.data.id}.json`;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);this.dirty=false;this.persist();this.status('已导出地图（含走廊、匝道和组）。');return;}
      if(action==='play'){localStorage.setItem(CITY_EDITOR_STORAGE_KEY,saveMap(this.data));this.dirty=false;const url=new URL(location.href);url.search='?city=editor';location.assign(url.href);return;}
      if(action==='validate-full'){const report=validateMap(this.data);this.showIssues([...report.errors,...report.warnings].map(e=>({severity:e.severity,code:e.code,ids:[],message:`${e.path}: ${e.message}`})));this.status(`全图：${report.errorCount} 个错误 / ${report.warningCount} 个警告`);return;}
      if(action==='validate'||action==='nearby'){const issues=action==='nearby'?this.kernel.validateArea(bounds([{x:this.controls.target.x,z:this.controls.target.z}],200)):this.selectedId?this.kernel.validateSelection(this.selectedId):this.kernel.validateArea(bounds([{x:this.controls.target.x,z:this.controls.target.z}],100));this.showIssues(issues);this.status(`局部验证：${issues.filter(e=>e.severity==='error').length} 个错误 / ${issues.filter(e=>e.severity==='warning').length} 个警告`);}
    }catch(error){this.status(String(error));}
  }
  private async openMain():Promise<void> {this.status('正在加载 清江市 City Main…');try{await prepareCityMain();this.open(structuredClone(cityMainRuntime().map));this.controls.target.set(0,0,0);this.camera3D.position.set(650,650,650);this.topCamera.position.set(0,20000,0);this.topCamera.zoom=0.5;this.topCamera.updateProjectionMatrix();this.controls.update();this.populate();this.status('清江市 City Main loaded · named corridors, stamp groups and signs available. Save exports JSON; CLI applies to the explicit regional-main source.');}catch(error){this.status(String(error));}}
  private open(data:CityMapData):void {this.cancel();this.scene.remove(this.view.root);this.view.dispose();this.kernel=new CityEditingKernel(data);this.view=new CityEditorScene(this.kernel);this.scene.add(this.view.root);this.selectedId=null;this.multi.clear();this.dirty=false;this.previewGhost=null;this.showBefore=true;this.gizmoKey='';this.drawGrid();this.fit();this.updateUI();this.drawOverlay();this.expose();}
  private expose():void {
    const api={getRoad:(id:string)=>this.kernel.getRoad(id),getCorridor:(id:string)=>this.kernel.getCorridor(id),getIntersection:(id:string)=>this.kernel.getIntersection(id),listCorridors:(name?:string)=>this.kernel.listCorridors(name),getGroup:(id:string)=>this.kernel.getGroup(id),getSign:(id:string)=>this.kernel.getSign(id),findSigns:(q:Parameters<CityEditingKernel['findSigns']>[0])=>this.kernel.findSigns(q),findRoads:(q:Parameters<CityEditingKernel['findRoads']>[0])=>this.kernel.findRoads(q),getConnectedRoads:(id:string)=>this.kernel.getConnectedRoads(id),getNearbyRoads:(p:CityPoint,r:number)=>this.kernel.getNearbyRoads(p,r),inspectArea:(q:Parameters<CityEditingKernel['inspectArea']>[0])=>this.kernel.inspectArea(q),snapCandidates:(p:CityPoint)=>snapCandidates(this.kernel,p),diagnose:(q:Parameters<CityEditingKernel['diagnose']>[0])=>this.kernel.diagnose(q),preview:(commands:EditorCommand|EditorCommand[])=>this.preview(commands,'Agent 编辑',true,true),previewReceipt:(receipt:{operations:EditorCommand|EditorCommand[];label?:string})=>this.openAgentReceipt(receipt),dryRun:(commands:EditorCommand|EditorCommand[])=>this.preview(commands,'Agent 试运行',true,true),commit:(id?:string)=>{if(id&&id!==this.pending?.id)throw new Error('Preview expired');return this.commit(true);},cancel:()=>this.cancel(),validateRoad:(id:string)=>this.kernel.validateRoad(id),validateCorridor:(id:string)=>this.kernel.validateCorridor(id),validateIntersection:(id:string)=>this.kernel.validateIntersection(id),validateArea:(a:Parameters<CityEditingKernel['validateArea']>[0])=>this.kernel.validateArea(a),validateFull:()=>this.kernel.validateFull(),previewData:(id:string)=>this.kernel.previewData(id),save:()=>saveMap(this.data)};
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
  dispose():void {cancelAnimationFrame(this.frame);this.brushPanel.dispose();window.clearTimeout(this.persistTimer);this.observer.disconnect();window.removeEventListener('keydown',this.keyHandler);window.removeEventListener('beforeunload',this.unloadHandler);this.topControls.dispose();this.orbit.dispose();this.view.dispose();CityEditorScene.clear(this.grid);this.scene.traverse(o=>{if(o instanceof THREE.Mesh&&o.userData.editorTerrain){o.geometry.dispose();(o.material as THREE.Material).dispose();}});this.renderer.dispose();delete(window as unknown as {cityEditor?:unknown}).cityEditor;this.ui.remove();}
}
