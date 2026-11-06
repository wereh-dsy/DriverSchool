import * as T from 'three';
import type { InstrumentClusterConfig, InstrumentTelemetry } from './InstrumentCluster';
import { mesh, rounded } from './MercedesE300LGeometry';
import { drawNavigationBanner } from '../../ui/NavigationDisplay';
import { drawLaneAssistSelection } from './LaneAssistSelectionDisplay';
import { pressureText, tyrePressureReading, tyrePressureWarning } from './LuxuryVehicleStatusPage';
import { PROXIMITY_COLORS } from '../control/RearParkingProximity';
import { MaybachAmbientSettings, MAYBACH_AMBIENT_PALETTE, MAYBACH_AMBIENT_ZONES, MAYBACH_AMBIENT_ZONE_NAMES } from './MaybachS680AmbientLighting';
import { MaybachS680InstrumentCar } from './MaybachS680InstrumentCar';
import { drawMaybachTellTales } from './MaybachS680TellTales';

const GOLD = '#d9c39a', PALE = '#f1e9dc', MUTED = '#9e98a4';
const FONT = '"Segoe UI", "Microsoft YaHei", sans-serif';
export const maybachModeName = (mode: InstrumentTelemetry['driveMode']) => mode === 'MAYBACH' ? 'MAYBACH' : mode === 'SPORT' ? 'SPORT' : 'COMFORT';
const text = (c: CanvasRenderingContext2D, value: string, x: number, y: number, size: number,
  color = PALE, align: CanvasTextAlign = 'left') => {
  c.fillStyle = color; c.font = `300 ${size}px ${FONT}`; c.textAlign = align; c.textBaseline = 'middle'; c.fillText(value, x, y);
};
function background(c: CanvasRenderingContext2D, w: number, h: number) {
  const gradient = c.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, '#191725'); gradient.addColorStop(.5, '#080a11'); gradient.addColorStop(1, '#211b24');
  c.fillStyle = gradient; c.fillRect(0, 0, w, h);
}
function doubleM(c: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  c.save(); c.translate(x,y); c.scale(scale,scale); c.strokeStyle=GOLD;c.lineWidth=2;
  for(const offset of [-5,5]) { c.beginPath(); c.moveTo(-24,18+offset);c.lineTo(-24,-18+offset);
    c.lineTo(0,8+offset);c.lineTo(24,-18+offset);c.lineTo(24,18+offset);c.stroke(); } c.restore();
}
function parking(c:CanvasRenderingContext2D,t:InstrumentTelemetry,x:number,y:number,scale:number,drawCar=true){
  const proximity=t.drivingScene?.proximity;if(!proximity?.active)return;
  c.save();c.translate(x,y);c.scale(scale,scale);c.strokeStyle=GOLD;c.lineWidth=1.5;
  if(drawCar){c.beginPath();c.roundRect(-25,-45,50,90,12);c.stroke();}
  proximity.zones.forEach((zone,n)=>{if(zone.distanceM===null)return;const angle=-Math.PI/2+n*Math.PI/4;
    c.strokeStyle=PROXIMITY_COLORS[zone.severity];c.lineWidth=5;c.beginPath();
    c.arc(Math.cos(angle)*52,Math.sin(angle)*70,12,0,Math.PI*2);c.stroke();});
  if(proximity.nearestDistanceM!==null)text(c,`${proximity.nearestDistanceM.toFixed(1)} m`,0,100,22,GOLD,'center');c.restore();
}

/** Maybach Classic: graduated champagne rings, satin faces, precise luminous
 * scales and physically driven needles. The welcome adds light behind live data. */
export class MaybachS680Instruments extends T.Group {
  public readonly canvas=document.createElement('canvas');
  public readonly texture:T.CanvasTexture;
  private readonly material:T.MeshPhysicalMaterial;
  private elapsed=Infinity;
  private lastOn=false;
  private welcomeAge=Infinity;
  private speed=0;
  private rpm=0;
  private lastTellTales='';
  private readonly vehicleIcon=new MaybachS680InstrumentCar();
  constructor(private readonly config:InstrumentClusterConfig){
    super();this.name='Maybach exclusive digital instrument panel';
    this.canvas.width=1600;this.canvas.height=750;this.texture=new T.CanvasTexture(this.canvas);this.texture.colorSpace=T.SRGBColorSpace;
    const bezel=new T.MeshStandardMaterial({color:0x0b0d11,roughness:.42,metalness:.20});
    this.add(rounded('Maybach instrument glass surround',[.350,.174,.020],[0,0,0],bezel,.008));
    this.material=new T.MeshPhysicalMaterial({color:0x030303,map:this.texture,emissive:0xffffff,
      emissiveMap:this.texture,emissiveIntensity:1,roughness:.40,clearcoat:0,specularIntensity:.04,envMapIntensity:.015,toneMapped:false});
    this.material.name='Maybach instrument exclusive material';
    const panel=mesh('Maybach live instrument face',new T.PlaneGeometry(.334,.1565),this.material);panel.position.z=.011;this.add(panel);
  }
  update(t:InstrumentTelemetry,dt=1/60){
    const on=t.ignitionOn??t.engineRunning??true;this.elapsed+=dt;
    if(on&&!this.lastOn)this.welcomeAge=0;
    this.welcomeAge=on?this.welcomeAge+dt:Infinity;
    this.speed=T.MathUtils.damp(this.speed,Math.abs(t.speedKmh),this.config.needleResponse,dt);
    this.rpm=T.MathUtils.damp(this.rpm,t.rpm,this.config.needleResponse,dt);
    this.material.emissiveIntensity=on?.86+.14*(t.ambientDaylight??1):0;
    this.material.color.setScalar(on?.018:0);
    const i=t.indicators??{};
    const tellTales=[i.positionLights,i.headlights,i.highBeam,i.frontFogLights,i.rearFogLights,i.fogLights,
      i.leftTurn,i.rightTurn,i.parkingBrake,i.autoHold,i.absWarning,i.tcsActive,i.escActive,i.tcsOff,i.escOff,
      i.engineWarning,i.batteryWarning,t.tpmsState?.warning].join('|');
    if(this.elapsed<.04&&on===this.lastOn&&tellTales===this.lastTellTales)return;
    this.elapsed=0;this.lastOn=on;this.lastTellTales=tellTales;
    const c=this.canvas.getContext('2d')!;c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,1600,750);
    c.fillStyle='#030509';c.fillRect(0,0,1600,750);
    if(!on){this.texture.needsUpdate=true;return;}
    // Logical design space stays 1280×600; the higher canvas resolves fine type.
    c.scale(1.25,1.25);
    const halo=c.createRadialGradient(640,315,40,640,315,660);
    halo.addColorStop(0,'#171722');halo.addColorStop(.55,'#090b12');halo.addColorStop(1,'#020407');
    c.fillStyle=halo;c.fillRect(0,0,1280,600);
    const sport=t.driveMode==='SPORT',accent=sport?'#d9b1a0':'#cbb78e';
    if(this.welcomeAge<2){
      const progress=this.welcomeAge/2;c.save();c.globalAlpha=Math.sin(progress*Math.PI)*.35;
      const g=c.createLinearGradient(640-progress*700,0,640+progress*700,0);g.addColorStop(0,'rgba(202,177,131,0)');g.addColorStop(.5,'#c7ac76');g.addColorStop(1,'rgba(202,177,131,0)');
      c.fillStyle=g;c.fillRect(0,94,1280,1.5);c.restore();
    }
    text(c,'MERCEDES-MAYBACH',640,26,18,'#b7b1a8','center');
    const dial=(x:number,max:number,value:number,majorStep:number,minorStep:number,divisor:number,unit:string)=>{
      const y=293,r=199,start=.75*Math.PI,sweep=1.5*Math.PI;
      const face=c.createRadialGradient(x-52,y-66,18,x,y,r);
      face.addColorStop(0,'#1a1c22');face.addColorStop(.52,'#0d1017');face.addColorStop(.83,'#080b12');face.addColorStop(1,'#18191f');
      c.fillStyle=face;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();
      const rim=c.createLinearGradient(x-r,y-r,x+r,y+r);rim.addColorStop(0,'#d8c7a4');rim.addColorStop(.25,'#6b614f');rim.addColorStop(.53,'#a99572');rim.addColorStop(.78,'#403e38');rim.addColorStop(1,'#bead8b');
      c.strokeStyle=rim;c.lineWidth=2;c.beginPath();c.arc(x,y,r,start,start+sweep);c.stroke();
      c.strokeStyle='#302d29';c.lineWidth=.8;c.beginPath();c.arc(x,y,r-6,start,start+sweep);c.stroke();
      c.strokeStyle='rgba(194,178,150,.11)';c.lineWidth=12;c.beginPath();c.arc(x,y,r-13,start,start+sweep);c.stroke();
      for(let v=0;v<=max+.001;v+=minorStep){
        const a=start+v/max*sweep,major=Math.abs(v/majorStep-Math.round(v/majorStep))<.001;
        const red=divisor===1000&&v>=this.config.redlineRPM;
        c.strokeStyle=red?'#b96f68':major?'#e7dfd0':'#8f887d';c.lineWidth=major?2:1;
        c.beginPath();c.moveTo(x+Math.cos(a)*(r-9),y+Math.sin(a)*(r-9));
        c.lineTo(x+Math.cos(a)*(r-(major?28:19)),y+Math.sin(a)*(r-(major?28:19)));c.stroke();
        if(major){
          c.save();c.shadowColor='rgba(0,0,0,.7)';c.shadowBlur=2;c.shadowOffsetY=1;
          text(c,String(v/divisor),x+Math.cos(a)*(r-48),y+Math.sin(a)*(r-48),23,red?'#c78c83':'#e2ded4','center');c.restore();
        }
      }
      const a=start+T.MathUtils.clamp(value/max,0,1)*sweep;
      c.save();c.translate(x,y);c.rotate(a);c.shadowColor='rgba(0,0,0,.85)';c.shadowBlur=4;c.shadowOffsetY=2;
      const needle=c.createLinearGradient(-25,0,160,0);needle.addColorStop(0,'#63594a');needle.addColorStop(.25,'#c9b28a');needle.addColorStop(1,'#f1e8d4');
      c.fillStyle=needle;c.beginPath();c.moveTo(-24,-2.4);c.lineTo(151,-.75);c.lineTo(162,0);c.lineTo(151,.75);c.lineTo(-24,2.4);c.closePath();c.fill();c.restore();
      const hub=c.createRadialGradient(x-3,y-4,1,x,y,13);hub.addColorStop(0,'#5b5c5d');hub.addColorStop(.6,'#24282e');hub.addColorStop(1,'#090c11');
      c.fillStyle=hub;c.beginPath();c.arc(x,y,12,0,Math.PI*2);c.fill();c.strokeStyle='#8f826a';c.lineWidth=.8;c.stroke();
      text(c,unit,x,407,17,'#a6a6a4','center');
    };
    dial(275,this.config.maximumSpeedKmh,this.speed,20,5,1,'km/h');
    dial(1005,this.config.maximumRPM,this.rpm,1000,250,1000,'1/min × 1000');
    text(c,String(Math.round(Math.abs(t.speedKmh))),275,365,34,'#f0ece3','center');
    text(c,(t.rpm/1000).toFixed(1),1005,365,34,'#f0ece3','center');
    // Central rear-view silhouette, matching the long, broad Maybach body.
    doubleM(c,640,130,.60);text(c,'V12',640,171,17,accent,'center');
    text(c,String(t.gear),640,232,43,'#e9e6df','center');
    if((t.driverAccess?.doorOpen??0)>.015){
      text(c,'驾驶员车门未关',640,392,18,'#df9d91','center');
    }
    const scene=t.drivingScene;
    if(scene?.lanes.length){
      c.save();c.beginPath();c.rect(530,276,220,135);c.clip();
      this.vehicleIcon.drawLanes(c,640,328,128,scene.lanes);c.restore();
    }
    this.vehicleIcon.draw(c,640,328,128,128,(t.driverAccess?.doorOpen??0)>.015);
    parking(c,t,640,324,.65,false);
    text(c,maybachModeName(t.driveMode),640,437,23,accent,'center');
    if(t.indicators?.cruise&&t.cruiseTargetSpeedKmh!==undefined)text(c,`CRUISE ${Math.round(t.cruiseTargetSpeedKmh)}`,640,470,18,'#a5c7b1','center');
    drawLaneAssistSelection(c,t.laneAssist,'mercedes',640,500,.63);
    // Quiet lower status rail; missing readings remain absent.
    c.strokeStyle='#34332f';c.lineWidth=.7;c.beginPath();c.moveTo(80,527);c.lineTo(1200,527);c.stroke();
    text(c,t.fuelLevel===undefined?'FUEL —':`FUEL  ${Math.round(t.fuelLevel*100)} %`,83,554,21,'#c5c1b7');
    if(t.fuelLevel!==undefined){c.fillStyle='#373834';c.fillRect(83,576,180,2);c.fillStyle=accent;c.fillRect(83,576,180*T.MathUtils.clamp(t.fuelLevel,0,1),2);}
    text(c,t.coolantTemperatureC===undefined?'— °C':`${Math.round(t.coolantTemperatureC)} °C`,1190,554,21,'#c5c1b7','right');
    if(t.trip)text(c,`${t.trip.totalDistanceKm.toFixed(1)} km`,640,583,17,'#969994','center');
    drawMaybachTellTales(c,t);
    drawNavigationBanner(c,t.sharedVehicle?.navigation.guidance,{x:501,y:191,width:278,height:70});
    if(this.welcomeAge<2){c.save();c.globalAlpha=Math.sin(this.welcomeAge/2*Math.PI)*.7;
      text(c,'V12  ·  WELCOME',640,94,13,accent,'center');c.restore();}
    this.texture.needsUpdate=true;
  }
}

export type MaybachPage='navigation'|'vehicle'|'lounge';
/** Portrait OLED-inspired centre screen, landscape rear screens, a shared data
 * boundary and distinct instance textures. No extra map/sensor ownership. */
export class MaybachS680CenterDisplay {
  public readonly canvas=document.createElement('canvas');
  public readonly rearCanvas=document.createElement('canvas');
  public readonly texture:T.CanvasTexture;
  public readonly rearTexture:T.CanvasTexture;
  public page:MaybachPage='navigation';
  private elapsed=Infinity;
  private on=false;
  private welcomeAge=Infinity;
  constructor(public readonly ambientSettings=new MaybachAmbientSettings()){
    this.canvas.width=768;this.canvas.height=1024;this.rearCanvas.width=960;this.rearCanvas.height=540;
    this.texture=new T.CanvasTexture(this.canvas);this.rearTexture=new T.CanvasTexture(this.rearCanvas);
    this.texture.colorSpace=this.rearTexture.colorSpace=T.SRGBColorSpace;
  }
  cyclePage(){const pages:MaybachPage[]=['navigation','vehicle','lounge'];this.page=pages[(pages.indexOf(this.page)+1)%3]!;this.elapsed=Infinity;}
  click(uv:T.Vector2):boolean {
    if(!this.on)return false;
    if(uv.y>=.08&&uv.y<=.17){
      this.page=(['navigation','vehicle','lounge'] as const)[Math.min(2,Math.floor(uv.x*3))]!;this.elapsed=Infinity;return true;
    }
    if(this.page!=='lounge')return false;
    const x=uv.x*768,y=(1-uv.y)*1024,s=this.ambientSettings;
    if(y>=218&&y<=288&&x>=40&&x<=728)s.selectTheme(x<384?'rose-gold':'amethyst');
    else if(y>=315&&y<587&&x>=54&&x<714){
      const col=Math.floor((x-54)/84),row=Math.floor((y-315)/34);
      if(x-54-col*84>62||y-315-row*34>25)return false;
      s.selectedColor=row*8+col;
    }else if(y>=620&&y<=722&&x>=40&&x<=728){
      const row=y>=678?1:0;if(y-(row?678:620)>44)return false;
      const zone=MAYBACH_AMBIENT_ZONES[row*2+(x>=405?1:0)]!;s.zones[zone]=!s.zones[zone];
    }else if(y>=745&&y<=790&&x>=58&&x<=710)s.brightness=T.MathUtils.clamp((x-58)/652,0,1);
    else return false;
    this.elapsed=Infinity;return true;
  }
  update(t:InstrumentTelemetry,dt:number){
    this.elapsed+=dt;const on=t.ignitionOn??t.engineRunning??true;
    if(on&&!this.on)this.welcomeAge=0;
    this.welcomeAge=on?this.welcomeAge+dt:Infinity;
    if(this.elapsed<.1&&on===this.on)return;this.elapsed=0;this.on=on;
    const c=this.canvas.getContext('2d')!,r=this.rearCanvas.getContext('2d')!;
    c.clearRect(0,0,768,1024);r.clearRect(0,0,960,540);background(c,768,1024);background(r,960,540);
    if(!on){c.fillStyle=r.fillStyle='#000';c.fillRect(0,0,768,1024);r.fillRect(0,0,960,540);
      this.texture.needsUpdate=this.rearTexture.needsUpdate=true;return;}
    const now=new Date(),clock=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    text(c,'MBUX',40,42,21,'#bbc0c7');
    text(c,clock,384,42,24,'#d6d7db','center');
    text(c,'MAYBACH',728,42,18,GOLD,'right');
    text(c,maybachModeName(t.driveMode),40,105,22,GOLD);
    text(c,t.outsideTemperatureC===undefined?'— °C':`${t.outsideTemperatureC.toFixed(1)} °C`,728,105,21,MUTED,'right');
    if(this.page==='navigation'){
      this.map(c,t,0,145,768,635);
      drawNavigationBanner(c,t.sharedVehicle?.navigation.guidance,{x:26,y:164,width:570,height:120});
    }else if(this.page==='vehicle'){
      text(c,'S 680  4MATIC',42,180,35);text(c,'V12  /  AIRMATIC',42,226,23,GOLD);
      const status={vehicleName:'Maybach S 680',tyres:t.tyres,tpmsState:t.tpmsState,...t.vehicleStatus};
      for(let n=0;n<4;n++){
        const x=n%2===0?180:580,y=n<2?350:480;
        text(c,`${['FL','FR','RL','RR'][n]}  ${pressureText(tyrePressureReading(status,n))} kPa`,x,y,27,
          tyrePressureWarning(status,n)?'#e6a876':PALE,'center');
      }
      text(c,t.fuelLevel===undefined?'FUEL —':`FUEL  ${Math.round(t.fuelLevel*100)} %`,42,595,26,GOLD);
      text(c,t.coolantTemperatureC===undefined?'COOLANT —':`COOLANT  ${Math.round(t.coolantTemperatureC)} °C`,42,650,26,GOLD);
      if(t.transmissionTemperatureC!==undefined)text(c,`ATF  ${Math.round(t.transmissionTemperatureC)} °C`,728,650,25,GOLD,'right');
      if(t.chassisStatus)text(c,`AIRMATIC  ${Math.round(t.chassisStatus.rideHeight*1000)} mm`,42,707,25,GOLD);
      parking(c,t,384,409,1.1);
      if(t.driverAccess){
        text(c,t.driverAccess.doorOpen>.015?'驾驶员车门 · 开启':'驾驶员车门 · 已关闭',42,755,20,t.driverAccess.doorOpen>.015?'#df9d91':MUTED);
        text(c,`车窗 ${Math.round((1-t.driverAccess.windowOpen)*100)} %`,728,755,20,MUTED,'right');
      }
    }else{
      const s=this.ambientSettings;
      text(c,'氛围照明',42,178,32);text(c,'64 色 · 分区照明',728,180,20,MUTED,'right');
      for(const [n,title]of ['玫瑰金白','紫晶流光'].entries()){
        const x=n===0?40:405,selected=s.selectedColor===null&&s.theme===(n===0?'rose-gold':'amethyst');
        c.fillStyle=selected?'#3b3038':'#171a23';c.beginPath();c.roundRect(x,218,323,70,12);c.fill();
        c.strokeStyle=selected?GOLD:'#44404c';c.lineWidth=1;c.stroke();text(c,title,x+161,253,25,selected?PALE:MUTED,'center');
      }
      MAYBACH_AMBIENT_PALETTE.forEach((color,n)=>{
        const x=54+n%8*84,y=315+Math.floor(n/8)*34;
        c.fillStyle='#'+color.toString(16).padStart(6,'0');c.beginPath();c.roundRect(x,y,62,25,5);c.fill();
        if(s.selectedColor===n){c.strokeStyle=PALE;c.lineWidth=2;c.stroke();}
      });
      for(const [n,zone]of MAYBACH_AMBIENT_ZONES.entries()){
        const x=n%2===0?40:405,y=n<2?620:678;
        c.fillStyle=s.zones[zone]?'#2d2932':'#11141b';c.beginPath();c.roundRect(x,y,323,44,9);c.fill();
        text(c,MAYBACH_AMBIENT_ZONE_NAMES[n]!,x+18,y+22,21,s.zones[zone]?PALE:MUTED);
        text(c,s.zones[zone]?'开':'关',x+300,y+22,18,s.zones[zone]?GOLD:MUTED,'right');
      }
      text(c,'亮度',42,745,19,MUTED);text(c,`${Math.round(s.brightness*100)} %`,728,745,19,GOLD,'right');
      c.fillStyle='#38323e';c.fillRect(58,769,652,3);c.fillStyle=GOLD;c.fillRect(58,769,652*s.brightness,3);
      c.beginPath();c.arc(58+652*s.brightness,770,6,0,Math.PI*2);c.fill();
    }
    c.fillStyle='rgba(15,17,25,.94)';c.beginPath();c.roundRect(25,808,718,105,18);c.fill();
    c.strokeStyle='#393640';c.lineWidth=1;c.beginPath();c.roundRect(25,808,718,105,18);c.stroke();
    for(const [n,title]of ['导航','车辆','氛围'].entries())text(c,title,128+n*256,864,29,
      this.page===['navigation','vehicle','lounge'][n]?GOLD:MUTED,'center');
    text(c,'Mercedes-Maybach S 680',384,967,19,'#8c8d96','center');
    if(this.welcomeAge<2.4){
      const p=this.welcomeAge/2.4;c.save();c.globalAlpha=Math.sin(Math.PI*p);
      c.strokeStyle=GOLD;c.lineWidth=2;c.beginPath();c.moveTo(384-340*p,134);c.lineTo(384+340*p,134);c.stroke();
      doubleM(c,384,962,.7);c.restore();
    }
    text(r,'M E R C E D E S – M A Y B A C H',480,39,23,GOLD,'center');
    this.map(r,t,25,75,910,365);text(r,'FIRST CLASS',35,491,23,GOLD);
    text(r,maybachModeName(t.driveMode),925,491,23,GOLD,'right');
    this.texture.needsUpdate=this.rearTexture.needsUpdate=true;
  }
  private map(c:CanvasRenderingContext2D,t:InstrumentTelemetry,x:number,y:number,width:number,height:number){
    const scene=t.drivingScene;
    if(!scene?.map.available){text(c,'导航地图不可用',x+width/2,y+height/2,25,MUTED,'center');return;}
    const p=scene.mapPose,metres=300+Math.abs(t.speedKmh)*2;
    c.save();c.beginPath();c.rect(x,y,width,height);c.clip();
    scene.map.draw(c,{x,y,width,height},p.x,p.z,p.yaw,metres,'#111822');
    scene.map.drawNavigation(c,{x,y,width,height},p.x,p.z,metres,p.yaw);c.restore();
  }
}
