import type { NavigationController } from '../world/navigation/NavigationController';
import { navigationSummary } from '../world/navigation/NavigationController';
import { navigationDistance, roadLabel, type RouteLocation } from '../world/navigation/RoutePlanner';
import type { RoadPoint } from '../world/navigation/RoadNetwork';
import { activeNavigation } from './NavigationDisplay';
import { drawLogicalRoadLayer } from './LogicalRoadMapGeometry';

/** Expanded local map. View state is independent of the driving/map-tile caches. */
export class NavigationMapPanel {
  private readonly root=document.createElement('section');
  private readonly canvas=document.createElement('canvas');
  private readonly hint=document.createElement('p');
  private readonly startValue=document.createElement('button');
  private readonly destinationValue=document.createElement('button');
  private readonly waypointList=document.createElement('div');
  private readonly summary=document.createElement('p');
  private readonly go=document.createElement('button');
  private readonly candidates=document.createElement('div');
  private readonly hud=document.createElement('button');
  private origin:RouteLocation|null=null;
  private destination:RouteLocation|null=null;
  private waypoints:RouteLocation[]=[];
  private selecting:'start'|'destination'|number='destination';
  private center={x:0,z:0};
  private scale=1;
  private width=1;private height=1;
  private drag:{x:number;y:number;lastX:number;lastY:number;moved:boolean;id:number}|undefined;
  private elapsed=0;
  private previousFocus:HTMLElement|null=null;
  private lastVersion=-1;
  private readonly resize=new ResizeObserver(()=>{if(this.open)this.draw();});
  public onVisibilityChange?:(open:boolean)=>void;
  public get open():boolean{return !this.root.hidden;}
  public constructor(private readonly host:HTMLElement,private readonly navigation:NavigationController) {
    this.root.className='navigation-map';this.root.hidden=true;this.root.setAttribute('role','dialog');this.root.setAttribute('aria-modal','true');this.root.setAttribute('aria-label','区域地图与路线规划');
    this.root.innerHTML=`<header><strong>区域地图</strong><span>拖动平移 · 滚轮缩放 · Esc 关闭</span><button type="button" data-close>返回驾驶 ×</button></header><div class="navigation-map-body"><aside><label>起点</label><div data-origin></div><label>途经点 · 按顺序经过</label><div data-waypoints></div><button type="button" data-add-waypoint>＋ 添加途经点</button><label>终点</label><div data-destination></div><div class="navigation-map-actions"><button type="button" data-current>起点改为当前位置</button><button type="button" data-stop>结束导航 / 清除</button></div><div data-summary></div><div data-go></div><div data-hint></div><div data-candidates></div></aside><div class="navigation-map-view"><div class="navigation-map-tools"><button type="button" data-locate>定位车辆</button><button type="button" data-fit>全图</button><button type="button" data-plus aria-label="放大">＋</button><button type="button" data-minus aria-label="缩小">－</button></div><span class="navigation-map-north">N ↑</span></div></div>`;
    this.startValue.type=this.destinationValue.type=this.go.type='button';this.startValue.textContent='当前位置 · 点击选取';this.destinationValue.textContent='点击地图选择目的地';
    this.hint.setAttribute('aria-live','polite');this.summary.className='navigation-map-summary';
    this.root.querySelector('[data-origin]')!.append(this.startValue);this.root.querySelector('[data-destination]')!.append(this.destinationValue);
    this.root.querySelector('[data-waypoints]')!.append(this.waypointList);
    this.root.querySelector('[data-add-waypoint]')!.addEventListener('click',()=>this.select(this.waypoints.length));
    this.root.querySelector('[data-summary]')!.append(this.summary);this.root.querySelector('[data-go]')!.append(this.go);
    this.root.querySelector('[data-hint]')!.append(this.hint);this.root.querySelector('[data-candidates]')!.append(this.candidates);
    this.go.textContent='开始导航';this.go.disabled=true;
    this.canvas.setAttribute('aria-label','可平移缩放的道路地图，选择起点、途经点或终点');this.root.querySelector('.navigation-map-view')!.prepend(this.canvas);
    this.hud.type='button';this.hud.className='navigation-hud';this.hud.hidden=true;this.hud.setAttribute('aria-label','导航提示，点击打开地图');
    host.append(this.root);host.querySelector('.game-ui')!.append(this.hud);
    this.hud.addEventListener('click',()=>this.show());
    this.root.querySelector('[data-close]')!.addEventListener('click',()=>this.close());
    this.startValue.onclick=()=>this.select('start');this.destinationValue.onclick=()=>this.select('destination');
    this.root.querySelector('[data-current]')!.addEventListener('click',()=>{this.origin=null;this.preview();});
    this.root.querySelector('[data-stop]')!.addEventListener('click',()=>{this.origin=this.destination=null;this.waypoints=[];this.selecting='destination';this.candidates.replaceChildren();this.navigation.clear();this.refresh();this.draw();});
    this.go.onclick=()=>{if(this.destination&&this.navigation.start(this.destination,this.waypoints)){this.origin=null;this.close();}else this.refresh();};
    this.root.querySelector('[data-locate]')!.addEventListener('click',()=>{this.center={x:navigation.pose.x,z:navigation.pose.z};this.scale=Math.max(this.scale,.3);this.draw();});
    this.root.querySelector('[data-fit]')!.addEventListener('click',()=>this.fit());
    this.root.querySelector('[data-plus]')!.addEventListener('click',()=>this.zoom(1.35,this.width/2,this.height/2));
    this.root.querySelector('[data-minus]')!.addEventListener('click',()=>this.zoom(1/1.35,this.width/2,this.height/2));
    this.canvas.addEventListener('wheel',this.wheel,{passive:false});this.canvas.addEventListener('pointerdown',this.down);this.canvas.addEventListener('pointermove',this.move);this.canvas.addEventListener('pointerup',this.up);this.canvas.addEventListener('pointercancel',this.cancel);
    window.addEventListener('keydown',this.key,true);this.resize.observe(this.canvas);
  }
  public show():void {
    if(!this.navigation.planner||this.open)return;
    this.previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
    this.root.hidden=false;this.host.querySelector<HTMLElement>('.game-ui')!.inert=true;
    this.destination=this.navigation.state.route?.destination??this.destination;
    if(this.navigation.state.route)this.waypoints=this.navigation.state.route.waypoints.slice(this.navigation.state.waypointIndex).map(s=>s.location);
    this.center={x:this.navigation.pose.x,z:this.navigation.pose.z};this.scale=.5;
    this.onVisibilityChange?.(true);this.refresh();this.draw();
    if(this.navigation.state.route)this.fit(this.navigation.state.route.points);
    this.root.querySelector<HTMLButtonElement>('[data-close]')!.focus();
  }
  public close():void {
    if(!this.open)return;this.root.hidden=true;this.drag=undefined;
    this.host.querySelector<HTMLElement>('.game-ui')!.inert=this.host.classList.contains('driving-immersive');
    this.onVisibilityChange?.(false);this.previousFocus?.focus();
  }
  public reset():void {this.close();this.origin=this.destination=null;this.waypoints=[];this.waypointList.replaceChildren();this.selecting='destination';this.candidates.replaceChildren();this.hud.hidden=true;this.lastVersion=-1;}
  private select(value:'start'|'destination'|number):void {this.selecting=value;this.candidates.replaceChildren();this.hint.textContent=value==='start'?'点击道路选取起点':value==='destination'?'点击道路选取终点':`点击道路选取途经点 ${value+1}`;}
  private preview():void {
    const start=this.origin??this.navigation.currentLocation();
    if(start&&this.destination)this.navigation.preview(start,this.destination,this.waypoints);
    this.refresh();this.draw();
    if(this.navigation.state.route)this.fit(this.navigation.state.route.points);
  }
  private refresh():void {
    this.startValue.textContent=this.origin?.label??'当前位置 · 点击选取';
    this.destinationValue.textContent=this.destination?.label??'点击地图选择目的地';
    this.waypointList.replaceChildren();
    for(const [index,waypoint]of this.waypoints.entries()){
      const row=document.createElement('div');row.className='navigation-waypoint';
      const edit=document.createElement('button');edit.type='button';edit.className='navigation-waypoint-name';edit.textContent=`${index+1}. ${waypoint.label}`;edit.title='点击地图更换此途经点';edit.onclick=()=>this.select(index);row.append(edit);
      const controls=document.createElement('div');controls.className='navigation-waypoint-controls';
      for(const [text,label,offset]of [['↑','上移',-1],['↓','下移',1],['×','删除',0]] as const){const button=document.createElement('button');button.type='button';button.textContent=text;button.setAttribute('aria-label',`${label}途经点 ${index+1}`);button.disabled=offset!==0&&(index+offset<0||index+offset>=this.waypoints.length);button.onclick=()=>{if(offset===0)this.waypoints.splice(index,1);else [this.waypoints[index],this.waypoints[index+offset]]=[this.waypoints[index+offset]!,this.waypoints[index]!];this.selecting='destination';this.candidates.replaceChildren();this.preview();};controls.append(button);}row.append(controls);this.waypointList.append(row);
    }
    const state=this.navigation.state;
    this.summary.textContent=state.route?navigationSummary(state):state.status==='unreachable'?state.instruction:'选择目的地后自动规划路线';
    this.go.disabled=!this.destination;this.go.textContent=this.origin?'从当前位置重新规划并导航':'开始导航';
    this.hint.textContent=typeof this.selecting==='number'?`点击道路选取途经点 ${this.selecting+1}`:this.origin?'自选起点用于路线预览；开始导航将改从当前位置出发。':state.status==='unreachable'?state.instruction:'点击道路选择终点；添加途经点后按列表顺序规划。';
  }
  private pick(x:number,z:number):void {
    const planner=this.navigation.planner!;
    const place=planner.network.routing?.places.find(p=>Math.hypot(p.position.x-x,p.position.z-z)*this.scale<15);
    let matches=planner.matches(x,z,Math.min(1200,Math.max(12,14/this.scale)));
    if(place){const owned=planner.matches(place.position.x,place.position.z,500).filter(m=>place.roadIds.includes(m.location.roadId)&&planner.road(m.location.roadId)?.roadType!=='ramp');if(owned.length)matches=owned;}
    this.candidates.replaceChildren();
    if(!matches.length){this.hint.textContent='附近没有可行驶道路，请放大后重新选择。';return;}
    // Keep distinct layers, carriageways and ramps visible instead of silently choosing the nearest.
    const nearest=matches[0]!.distance;
    const options=matches.filter(m=>m.distance<=nearest+Math.max(8,8/this.scale)).slice(0,6);
    for(const m of options) {
      const road=planner.road(m.location.roadId)!,button=document.createElement('button');button.type='button';
      const layer=(m.location.point.y??0)>3?`高架 ${Math.round(m.location.point.y!)} m`:(m.location.point.y??0)<-2?'下穿 / 隧道':'地面';
      const a=road.centerline[0]!,b=road.centerline.at(-1)!,reverse=road.travelDirection==='reverse',dx=(b.x-a.x)*(reverse?-1:1),dz=(b.z-a.z)*(reverse?-1:1);
      const direction=road.travelDirection==='two-way'?'双向':Math.abs(dx)>Math.abs(dz)?dx>0?'向东':'向西':dz>0?'向南':'向北';
      button.textContent=`${place?.name??roadLabel(road)} · ${layer} · ${direction}`;
      button.onclick=()=>{const location=place?{...m.location,label:place.name}:m.location;if(this.selecting==='start')this.origin=location;else if(typeof this.selecting==='number')this.waypoints[this.selecting]=location;else this.destination=location;this.selecting='destination';this.candidates.replaceChildren();this.preview();};
      this.candidates.append(button);
    }
    this.hint.textContent=options.length>1?'此处有多条道路，请确认层级和行驶方向。':`设为${this.selecting==='start'?'起点':this.selecting==='destination'?'终点':`途经点 ${this.selecting+1}`}：`;
  }
  private world(px:number,py:number):{x:number;z:number} {return {x:this.center.x+(px-this.width/2)/this.scale,z:this.center.z+(py-this.height/2)/this.scale};}
  private zoom(factor:number,px:number,py:number):void {const before=this.world(px,py);this.scale=Math.max(.007,Math.min(8,this.scale*factor));const after=this.world(px,py);this.center.x+=before.x-after.x;this.center.z+=before.z-after.z;this.draw();}
  private fit(points?:readonly RoadPoint[]):void {
    const bounds=this.navigation.planner!.network.bounds;
    let minX=bounds.minimumX,maxX=bounds.maximumX,minZ=bounds.minimumZ,maxZ=bounds.maximumZ;
    if(points?.length){minX=Infinity;maxX=-Infinity;minZ=Infinity;maxZ=-Infinity;for(const p of points){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);}}
    this.center={x:(minX+maxX)/2,z:(minZ+maxZ)/2};this.scale=Math.max(.007,Math.min(3,(this.width-100)/Math.max(100,maxX-minX),(this.height-100)/Math.max(100,maxZ-minZ)));this.draw();
  }
  public update(dt:number,visible:boolean):void {
    this.elapsed+=dt;if(this.elapsed<.2)return;this.elapsed=0;
    const s=this.navigation.state;this.hud.hidden=!visible||!activeNavigation(s)||this.open;
    if(this.lastVersion!==s.version){this.lastVersion=s.version;this.hud.textContent=`${s.symbol} ${s.status==='arrived'?s.instruction:`${navigationDistance(s.maneuverDistance)} ${s.instruction} ${s.nextRoad}`}\n${navigationSummary(s)}`;if(this.open)this.refresh();}
    if(this.open)this.draw();
  }
  private draw():void {
    if(!this.open||!this.navigation.planner)return;
    const bounds=this.canvas.getBoundingClientRect();this.width=Math.max(1,bounds.width);this.height=Math.max(1,bounds.height);
    const dpr=Math.min(2,window.devicePixelRatio||1),w=Math.round(this.width*dpr),h=Math.round(this.height*dpr);
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
    const c=this.canvas.getContext('2d')!;c.setTransform(dpr,0,0,dpr,0,0);c.fillStyle='#e7ece8';c.fillRect(0,0,this.width,this.height);
    const point=(p:RoadPoint)=>({x:this.width/2+(p.x-this.center.x)*this.scale,y:this.height/2+(p.z-this.center.z)*this.scale});
    const path=(points:readonly RoadPoint[])=>{c.beginPath();points.forEach((p,i)=>{const q=point(p);i?c.lineTo(q.x,q.y):c.moveTo(q.x,q.y);});};
    const network=this.navigation.planner.network;
    c.lineCap='round';c.lineJoin='round';
    const occupied:{x:number;y:number;width:number}[]=[];
    const label=(text:string,x:number,y:number)=>{const width=c.measureText(text).width;if(x<width/2||x>this.width-width/2||y<20||y>this.height-20||occupied.some(p=>Math.abs(p.x-x)<(p.width+width)/2+12&&Math.abs(p.y-y)<23))return;c.strokeStyle='#f5f7f3';c.lineWidth=4;c.strokeText(text,x,y);c.fillStyle='#354c59';c.fillText(text,x,y);occupied.push({x,y,width});};
    const roads=network.segments.filter(r=>r.centerline.some(p=>{const q=point(p);return q.x>-200&&q.x<this.width+200&&q.y>-200&&q.y<this.height+200;})||r.centerline.some((p,i)=>{if(!i)return false;const a=point(r.centerline[i-1]!),b=point(p);return Math.max(a.x,b.x)>=0&&Math.min(a.x,b.x)<=this.width&&Math.max(a.y,b.y)>=0&&Math.min(a.y,b.y)<=this.height;}));
    const visibleRoads=this.scale<.035?roads.filter(r=>r.roadType!=='ramp'):roads;
    const junctions=network.intersections.filter(j=>{const p=point(j.center);return p.x+j.halfExtentX*this.scale>=0&&p.x-j.halfExtentX*this.scale<=this.width&&p.y+j.halfExtentZ*this.scale>=0&&p.y-j.halfExtentZ*this.scale<=this.height;});
    drawLogicalRoadLayer(c,visibleRoads,junctions,(x,z)=>point({x,z}),this.scale,1,
      r=>r.roadType==='highway'?'#f4dc9b':r.roadType==='ramp'?'#f7e8bf':'#fcfdf9',
      (_j,attached)=>attached.some(r=>r.roadType==='highway')?'#f4dc9b':'#fcfdf9',
      {outlineColor:'#a7b8bf',outlineWidth:1,minimumRoadWidth:r=>r.roadType==='highway'?2:1});
    const route=this.navigation.state.route;
    if(route){path(route.points);c.strokeStyle='#f6fbff';c.lineWidth=8;c.stroke();c.strokeStyle='#147fca';c.lineWidth=4.5;c.stroke();}
    c.font='12px "Segoe UI", "Microsoft YaHei", sans-serif';c.textAlign='center';c.textBaseline='middle';
    const names=new Set<string>();
    for(const r of roads.sort((a,b)=>(b.roadType==='highway'?1:0)-(a.roadType==='highway'?1:0))) {
      if(!r.name||this.scale<.12&&r.roadType!=='highway')continue;
      const name=roadLabel(r),p=point(r.centerline[Math.floor(r.centerline.length/2)]!);
      if(!names.has(name)){const before=occupied.length;label(name,p.x,p.y-10);if(occupied.length>before)names.add(name);}
    }
    for(const place of network.routing?.places??[]){const p=point(place.position);label(`${place.kind==='interchange'?'◇':'▣'} ${place.name}`,p.x,p.y);}
    const pin=(p:RoadPoint,text:string,color:string)=>{const q=point(p);c.fillStyle=color;c.beginPath();c.arc(q.x,q.y,10,0,Math.PI*2);c.fill();c.fillStyle='#fff';c.fillText(text,q.x,q.y);};
    if(this.origin??route?.start)pin((this.origin??route!.start).point,'起','#16765b');if(this.destination)pin(this.destination.point,'终','#b84540');
    this.waypoints.forEach((s,i)=>pin(s.point,String(i+1),'#a96c13'));
    const pose=this.navigation.pose,p=point(pose);c.save();c.translate(p.x,p.y);c.rotate(-pose.yaw);c.beginPath();c.moveTo(0,-11);c.lineTo(8,8);c.lineTo(0,4);c.lineTo(-8,8);c.closePath();c.fillStyle='#146caa';c.strokeStyle='#fff';c.lineWidth=2;c.fill();c.stroke();c.restore();
    const raw=100/this.scale,power=10**Math.floor(Math.log10(raw)),metres=Math.max(1,Math.floor(raw/power)*power),pixels=metres*this.scale;
    c.fillStyle='#233d49';c.fillRect(22,this.height-24,pixels,3);c.textAlign='left';c.fillText(navigationDistance(metres),22,this.height-36);
  }
  private readonly wheel=(e:WheelEvent)=>{e.preventDefault();const r=this.canvas.getBoundingClientRect();this.zoom(Math.exp(-Math.max(-100,Math.min(100,e.deltaY))*.003),e.clientX-r.left,e.clientY-r.top);};
  private readonly down=(e:PointerEvent)=>{if(e.button!==0)return;this.drag={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false,id:e.pointerId};this.canvas.setPointerCapture(e.pointerId);};
  private readonly move=(e:PointerEvent)=>{const d=this.drag;if(!d||d.id!==e.pointerId)return;if(Math.hypot(e.clientX-d.x,e.clientY-d.y)>5)d.moved=true;if(d.moved){this.center.x-=(e.clientX-d.lastX)/this.scale;this.center.z-=(e.clientY-d.lastY)/this.scale;this.draw();}d.lastX=e.clientX;d.lastY=e.clientY;};
  private readonly up=(e:PointerEvent)=>{const d=this.drag;if(!d||d.id!==e.pointerId)return;this.drag=undefined;this.canvas.releasePointerCapture(e.pointerId);if(!d.moved){const r=this.canvas.getBoundingClientRect(),p=this.world(e.clientX-r.left,e.clientY-r.top);this.pick(p.x,p.z);}};
  private readonly cancel=()=>{this.drag=undefined;};
  private readonly key=(e:KeyboardEvent)=>{
    if(!this.open)return;
    if(e.code==='Escape'||e.code==='F10'){e.preventDefault();e.stopImmediatePropagation();this.close();return;}
    if(e.code==='Tab'){const buttons=[...this.root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];const first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}return;}
    if(!(e.target instanceof HTMLButtonElement)){e.preventDefault();}e.stopPropagation();
  };
  public dispose():void {this.close();this.resize.disconnect();window.removeEventListener('keydown',this.key,true);this.root.remove();this.hud.remove();}
}
