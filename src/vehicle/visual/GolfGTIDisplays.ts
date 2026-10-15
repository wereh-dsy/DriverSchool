import * as T from 'three';
import { drawStatusLamp, type InstrumentTelemetry, type InstrumentClusterConfig } from './InstrumentCluster';
import { lateralBoundaryColor } from './LateralAssistDisplay';
import { PROXIMITY_COLORS } from '../control/RearParkingProximity';
import { AdaptiveMapZoom } from '../../ui/LocalRoadMap';
import { gtiInstrumentRecess } from './GolfGTIDashboard';
import { gtiMaterial } from './GolfGTISurfaces';
import type { VehicleAssetRegistry } from './VehicleAssetRegistry';

const FONT = 'Segoe UI, Microsoft YaHei, sans-serif';
function text(c: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color = '#ebedee') {
  c.font = `500 ${size}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = color; c.fillText(s, x, y);
}
function canvas(width: number, height: number) { const c = document.createElement('canvas'); c.width = width; c.height = height; return c; }
function screenTexture(cv: HTMLCanvasElement) { const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t; }
function panel(c:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,fill:string|CanvasGradient,stroke='#303c46'):void {
  const r=14;c.beginPath();c.moveTo(x+r,y);c.lineTo(x+w-r,y);c.quadraticCurveTo(x+w,y,x+w,y+r);
  c.lineTo(x+w,y+h-r);c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);c.lineTo(x+r,y+h);
  c.quadraticCurveTo(x,y+h,x,y+h-r);c.lineTo(x,y+r);c.quadraticCurveTo(x,y,x+r,y);c.closePath();
  c.fillStyle=fill;c.fill();c.strokeStyle=stroke;c.lineWidth=1.5;c.stroke();
}
/** Original top-view hatch artwork, shared by the display pages, never a sensor. */
function drawGTICar(c:CanvasRenderingContext2D,x:number,y:number,scale:number):void {
  c.save();c.translate(x,y);c.scale(scale,scale);
  for(const side of [-1,1]) {c.fillStyle='#0b1118';c.fillRect(side<0?-69:51,-75,18,45);c.fillRect(side<0?-69:51,57,18,45);}
  const paint=c.createLinearGradient(-58,0,58,0);paint.addColorStop(0,'#798991');paint.addColorStop(.45,'#e0e5e7');paint.addColorStop(1,'#899ba5');
  panel(c,-57,-125,114,250,paint,'#a4afb5');
  c.fillStyle='#1a2834';c.beginPath();c.moveTo(-42,-64);c.lineTo(42,-64);c.lineTo(36,-23);c.lineTo(-36,-23);c.closePath();c.fill();
  c.fillStyle='#243541';c.fillRect(-36,-17,72,84);c.fillStyle='#16232d';c.fillRect(-39,73,78,30);
  c.strokeStyle='#596b78';c.lineWidth=2;c.strokeRect(-36,-17,72,84);
  c.fillStyle='#cc3545';c.fillRect(-48,106,27,5);c.fillRect(21,106,27,5);c.restore();
}
function drawGTIDialArtwork(c:CanvasRenderingContext2D,config:InstrumentClusterConfig):void {
  const background=c.createLinearGradient(0,0,0,480);background.addColorStop(0,'#101114');background.addColorStop(.5,'#050608');background.addColorStop(1,'#090a0c');
  c.fillStyle=background;c.fillRect(0,0,1280,480);
  for(const [x,maximum,step,redline] of [[248,config.maximumRPM/1000,1,config.redlineRPM/1000],[1032,config.maximumSpeedKmh,40,Infinity]] as const) {
    c.fillStyle='#090a0c';c.beginPath();c.arc(x!,239,184,0,Math.PI*2);c.fill();
    // Flat illuminated scale bands, rather than a painted chrome bevel on a digital panel.
    c.strokeStyle='#222428';c.lineWidth=17;c.beginPath();c.arc(x!,239,170,.77*Math.PI,2.23*Math.PI);c.stroke();
    for(const [radius,width,color] of [[180,1.5,'#babcc0'],[159,1,'#64676c'],[114,1,'#202226']] as const) {
      c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.arc(x!,239,radius,.77*Math.PI,2.23*Math.PI);c.stroke();
    }
    const count=Math.round(maximum!/step!)*5;
    for(let i=0;i<=count;i++) {
      const a=.77*Math.PI+i/count*1.46*Math.PI,major=i%5===0,inside=major?157:167;
      c.strokeStyle=i/count*maximum!>=redline!?'#e34046':major?'#f0f0ee':'#929498';c.lineWidth=major?3:1.5;
      c.beginPath();c.moveTo(x!+Math.cos(a)*inside,239+Math.sin(a)*inside);c.lineTo(x!+Math.cos(a)*175,239+Math.sin(a)*175);c.stroke();
      if(major) text(c,String(Math.round(i/count*maximum!)),x!+Math.cos(a)*137,239+Math.sin(a)*137,26);
    }
    if(Number.isFinite(redline)) {c.strokeStyle='#c12c40';c.lineWidth=5;c.beginPath();c.arc(x!,239,181,.77*Math.PI+redline!/maximum!*1.46*Math.PI,2.23*Math.PI);c.stroke();}
  }
  c.strokeStyle='#303236';c.lineWidth=1;c.beginPath();c.moveTo(480,68);c.lineTo(800,68);c.moveTo(492,392);c.lineTo(788,392);c.stroke();
  text(c,'rpm × 1000',248,317,23,'#adafb2');text(c,'km/h',1032,317,23,'#adafb2');
}
export function gtiScreenMaterial(texture: T.Texture): T.MeshPhysicalMaterial {
  // Pixels emit their own color; diffuse lighting must not add a second, washed-out image.
  return new T.MeshPhysicalMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: texture,
    emissiveIntensity: .9, roughness: .14, metalness: 0, clearcoat: .06, clearcoatRoughness: .1,
    specularIntensity: .15, envMapIntensity: .15, toneMapped: false, side: T.DoubleSide });
}
const lampKey = (t: InstrumentTelemetry) => JSON.stringify([t.ignitionOn ?? t.engineRunning ?? true, t.indicators, t.tpmsState?.warning, t.gear]);

/** Twin circular scales and central large speed, following the supplied VW references. */
export class GolfGTIInstruments extends T.Group {
  public readonly canvas = canvas(1280, 480);
  public readonly texture = screenTexture(this.canvas);
  private elapsed = Infinity;
  private immediate = '';
  private rpm = 0;
  private readonly scaleArtwork:HTMLCanvasElement;
  public constructor(private readonly config: InstrumentClusterConfig,assets?:VehicleAssetRegistry) {
    super(); this.name = 'GTI twin circular digital instruments';
    if(assets) this.scaleArtwork=assets.canvas(`gti-dials/${config.maximumRPM}/${config.maximumSpeedKmh}/${config.redlineRPM}`,1280,480,c=>drawGTIDialArtwork(c,config));
    else {this.scaleArtwork=canvas(1280,480);drawGTIDialArtwork(this.scaleArtwork.getContext('2d')!,config);}
    const shell = gtiMaterial('display-trim',assets??config,assets);shell.vertexColors=true;
    this.add(assets ? assets.mesh(config,'gti-instrument-recess',()=>gtiInstrumentRecess(shell),shell) : gtiInstrumentRecess(shell));
    const face = new T.Mesh(new T.PlaneGeometry(.49, .184), gtiScreenMaterial(this.texture));
    face.name = 'GTI live digital face'; face.position.z = .003; face.castShadow = false; face.receiveShadow = false; this.add(face);
  }
  public update(t: InstrumentTelemetry, dt = 1 / 60): void {
    const safeDt = Math.max(0, dt), immediate = lampKey(t); this.elapsed += safeDt;
    this.rpm = T.MathUtils.damp(this.rpm, Math.max(0, t.rpm), this.config.needleResponse, safeDt);
    if (this.elapsed < .05 && immediate === this.immediate) return;
    this.elapsed = 0; this.immediate = immediate;
    const c = this.canvas.getContext('2d')!; c.fillStyle = '#05080c'; c.fillRect(0, 0, 1280, 480);
    if (!(t.ignitionOn ?? t.engineRunning ?? true)) { this.texture.needsUpdate = true; return; }
    c.drawImage(this.scaleArtwork,0,0);
    const needle = (x: number, maximum: number, value: number) => {
      const a = .77 * Math.PI + T.MathUtils.clamp(value / maximum, 0, 1) * 1.46 * Math.PI;
      c.save();c.translate(x,239);c.rotate(a);c.fillStyle='#e32e3e';c.shadowColor='#ac1f39';c.shadowBlur=2;
      c.beginPath();c.moveTo(89,-3);c.lineTo(168,0);c.lineTo(89,3);c.closePath();c.fill();c.shadowBlur=0;
      c.strokeStyle='#ffc8cd';c.lineWidth=1;c.beginPath();c.moveTo(100,0);c.lineTo(163,0);c.stroke();c.restore();
    };
    needle(248, this.config.maximumRPM / 1000, this.rpm / 1000);
    needle(1032, this.config.maximumSpeedKmh, Math.abs(t.speedKmh));
    text(c, 'GTI', 248, 218, 43, '#d93949');
    text(c, t.driveMode ?? 'NORMAL', 640, 35, 24, t.driveMode === 'SPORT' ? '#e25561' : '#bcc2c8');
    const now=new Date();text(c,`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`,495,43,23,'#c8cbce');
    text(c,t.outsideTemperatureC===undefined?'— °C':`${t.outsideTemperatureC.toFixed(1)} °C`,785,43,23,'#c8cbce');
    text(c, String(Math.round(Math.abs(t.speedKmh))), 640, 125, 82); text(c, 'km/h', 640, 177, 23, '#b3bcc3');
    const scene = t.drivingScene;
    c.save(); c.beginPath(); c.rect(465, 220, 350, 154); c.clip();
    scene?.lanes.forEach((lane, i) => {
      c.setLineDash(scene.laneMarkings?.[i] === 'dashed' ? [8,9] : []);
      c.strokeStyle = lateralBoundaryColor(scene.lateralAssist, i, '#bdc4ca'); c.lineWidth = 3; c.beginPath();
      lane.forEach((p, j) => { const depth = 1 + Math.max(0, p.forward) / 8, x = 640 + p.x * 47 / depth, y = 366 - Math.max(0, p.forward) * 4;
        j ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke();
    });
    c.setLineDash([]);drawGTICar(c,640,349,.18);c.restore();
    text(c, String(t.gear), 640, 420, 40);
    const fuel = t.fuelLevel === undefined ? '—' : String(Math.round(t.fuelLevel * 100));
    text(c, fuel + ' %', 1032, 373, 29);
    text(c, t.coolantTemperatureC === undefined ? '— °C' : Math.round(t.coolantTemperatureC) + ' °C', 248, 373, 27);
    if (t.indicators?.cruise) {
      drawStatusLamp(c, 'CRUISE', '#80c8a6', 537, 205, 24);
      text(c, t.cruiseTargetSpeedKmh === undefined ? '—' : String(Math.round(t.cruiseTargetSpeedKmh)), 620, 205, 25, '#80c8a6');
    }
    const i = t.indicators ?? {};
    if (i.leftTurn) drawStatusLamp(c, '◀', '#7ed2a3', 431, 42, 26);
    if (i.rightTurn) drawStatusLamp(c, '▶', '#7ed2a3', 849, 42, 26);
    const warnings: [boolean | undefined, string, string][] = [
      [i.positionLights, 'POS', '#80c8a6'], [i.headlights, 'LO', '#80c8a6'], [i.highBeam, 'HI', '#55a9ee'],
      [i.frontFogLights, 'FRFOG', '#80c8a6'], [i.rearFogLights, 'RRFOG', '#e9b75c'],
      [i.parkingBrake, 'P', '#e45a64'], [i.autoHold, 'HOLD', '#80c8a6'], [i.absWarning, 'ABS', '#e9b75c'],
      [i.tcsActive || i.escActive || i.tcsOff || i.escOff, i.tcsOff || i.escOff ? 'ESC OFF' : 'SKID', '#e9b75c'],
      [i.engineWarning, 'ENG', '#e9b75c'], [i.batteryWarning, 'BAT', '#e45a64'], [t.tpmsState?.warning ?? t.sharedVehicle?.tpmsState.warning, 'TPMS', '#e9b75c'],
    ];
    warnings.forEach(([active, label, color], j) => {
      if (!active) return; const x = 145 + j * 89;
      if (label === 'HOLD') text(c,'HOLD',x,456,19,color);
      else if (label === 'TPMS') {
        c.save(); c.translate(x,456); c.strokeStyle=color; c.lineWidth=2.5;
        c.beginPath(); c.moveTo(-13,-9); c.bezierCurveTo(-17,12,17,12,13,-9); c.stroke();
        text(c,'!',0,-2,22,color); c.restore();
      } else drawStatusLamp(c,label,color,x,456,22);
    });
    const assist = scene?.lateralAssist;
    if (assist?.lccActive || assist?.lkaActive) text(c, assist.lccActive ? 'LCC' : 'LKA', 1032, 216, 27, '#80c8a6');
    const daylight = T.MathUtils.clamp(t.ambientDaylight ?? 1, 0, 1);
    (this.children[1] as T.Mesh<T.PlaneGeometry,T.MeshPhysicalMaterial>).material.emissiveIntensity = .72 + .23 * daylight;
    (this.children[0] as T.Mesh<T.BufferGeometry,T.MeshStandardMaterial>).material.envMapIntensity=.06+.42*daylight;
    this.texture.needsUpdate = true;
  }
}

export type GTICenterPage = 'map' | 'car' | 'tyres' | 'park';
export const GTI_CENTER_PAGES: readonly GTICenterPage[] = ['map', 'car', 'tyres', 'park'];
function pageIcon(c:CanvasRenderingContext2D,page:GTICenterPage,x:number,y:number,color:string):void {
  c.save();c.translate(x,y);c.strokeStyle=color;c.lineWidth=2;c.lineJoin='round';c.lineCap='round';c.beginPath();
  if(page==='map') {c.moveTo(-14,-12);c.lineTo(-5,-16);c.lineTo(5,-12);c.lineTo(14,-16);c.lineTo(14,12);c.lineTo(5,16);c.lineTo(-5,12);c.lineTo(-14,16);c.closePath();c.moveTo(-5,-16);c.lineTo(-5,12);c.moveTo(5,-12);c.lineTo(5,16);}
  else if(page==='car') {c.moveTo(-15,10);c.lineTo(-13,-3);c.lineTo(-8,-12);c.lineTo(8,-12);c.lineTo(13,-3);c.lineTo(15,10);c.closePath();c.moveTo(-11,-2);c.lineTo(11,-2);c.moveTo(-9,10);c.lineTo(-9,14);c.moveTo(9,10);c.lineTo(9,14);}
  else if(page==='tyres') {c.arc(0,0,13,0,Math.PI*2);c.moveTo(7,0);c.arc(0,0,7,0,Math.PI*2);}
  else {c.arc(-6,0,13,Math.PI*.6,Math.PI*1.4);c.moveTo(3,-9);c.lineTo(3,9);c.moveTo(3,-9);c.lineTo(10,-9);c.quadraticCurveTo(17,-1,3,0);}
  c.stroke();c.restore();
}
export class GolfGTICenterDisplay {
  public readonly canvas = canvas(1024, 600);
  public readonly texture = screenTexture(this.canvas);
  public page: GTICenterPage = 'map';
  public effectivePage: GTICenterPage = 'map';
  private readonly mapCanvas = canvas(1024, 600);
  private readonly background = canvas(1024,600);
  private readonly zoom = new AdaptiveMapZoom();
  private elapsed = Infinity;
  private immediate = '';
  private on = false;
  public constructor() {
    const c=this.background.getContext('2d')!,grad=c.createLinearGradient(0,0,1024,600);
    grad.addColorStop(0,'#202c37');grad.addColorStop(.45,'#101b27');grad.addColorStop(1,'#080e17');c.fillStyle=grad;c.fillRect(0,0,1024,600);
    for(let y=1;y<600;y+=4) {c.fillStyle='rgba(172,189,203,.025)';c.fillRect(0,y,1024,1);}
  }
  public cyclePage(): void { this.page = GTI_CENTER_PAGES[(GTI_CENTER_PAGES.indexOf(this.page) + 1) % 4]!; this.elapsed = Infinity; }
  public click(uv: T.Vector2): boolean {
    if (!this.on || uv.y < .87) return false;
    this.page = GTI_CENTER_PAGES[Math.min(3, Math.max(0, Math.floor(uv.x * 4)))]!; this.elapsed = Infinity; return true;
  }
  public update(t: InstrumentTelemetry, dt: number): void {
    this.elapsed += Math.max(0, dt); const immediate = lampKey(t);
    if (this.elapsed < .1 && immediate === this.immediate) return;
    const elapsed = Number.isFinite(this.elapsed) ? this.elapsed : .1; this.elapsed = 0; this.immediate = immediate;
    this.on = t.ignitionOn ?? t.engineRunning ?? true;
    const c = this.canvas.getContext('2d')!; c.fillStyle = '#080d12'; c.fillRect(0, 0, 1024, 600);
    if (!this.on) { this.texture.needsUpdate = true; return; }
    c.drawImage(this.background,0,0);
    this.effectivePage = String(t.gear).startsWith('R') ? 'park' : this.page;
    const scene = t.drivingScene;
    if (this.effectivePage === 'map') {
      if (scene?.map.available) {
        const p = scene.mapPose, m = this.mapCanvas.getContext('2d')!;
        const metres = this.zoom.update(elapsed, Math.abs(t.speedKmh) / 3.6, scene.mapComplexity, String(t.gear).charAt(0));
        scene.map.draw(m, { x: 0, y: 88, width: 1024, height: 454 }, p.x, p.z, p.yaw, metres);
        c.save();c.filter='invert(1) saturate(.35) brightness(.8)';c.drawImage(this.mapCanvas,0,0);c.restore();
        panel(c,875,110,104,64,'#111d29');text(c,'N ↑',927,143,25,'#cfdae1');
      } else {
        panel(c,210,175,604,274,'#14202d');pageIcon(c,'map',512,247,'#a9bdca');
        text(c,'地图不可用',512,320,35,'#d0dce4');text(c,'当前场地暂无路网',512,377,23,'#859aa9');
      }
    } else if (this.effectivePage === 'car') {
      text(c,'Golf GTI',512,135,42);drawGTICar(c,512,350,1.1);
      panel(c,46,205,280,244,'#14212e');panel(c,698,205,280,244,'#14212e');
      text(c, '燃油', 186, 251, 25, '#91a6b6'); text(c, t.fuelLevel === undefined ? '—' : Math.round(t.fuelLevel * 100) + ' %',186,320,46);
      c.fillStyle='#344450';c.fillRect(81,379,210,5);
      if(t.fuelLevel!==undefined) {c.fillStyle=t.fuelLevel<.12?'#e7b963':'#b5c5ce';c.fillRect(81,379,210*T.MathUtils.clamp(t.fuelLevel,0,1),5);}
      text(c,'冷却液',838,251,25,'#91a6b6');text(c,t.coolantTemperatureC===undefined?'—':Math.round(t.coolantTemperatureC)+' °C',838,320,46);
      text(c,String(t.gear)+'  ·  7 DSG  ·  FWD',512,519,27,'#b1c3cf');
    } else if (this.effectivePage === 'tyres') {
      text(c,'轮胎压力',512,132,34);drawGTICar(c,512,350,1.05);
      const tpms = t.tpmsState ?? t.sharedVehicle?.tpmsState;
      (['frontLeft', 'frontRight', 'rearLeft', 'rearRight'] as const).forEach((id, n) => {
        const tyre = tpms?.[id], x = n % 2 ? 793 : 231, y = n < 2 ? 281 : 427;
        const reading = tpms?.available && tyre?.valid && tyre.pressureKPa !== null ? String(tyre.pressureKPa) : '—';
        const warning=tyre?.valid && tyre.pressureState !== 'NORMAL';
        panel(c,x-129,y-64,258,132,'#14212e',warning?'#a77b3c':'#334756');
        text(c,['左前','右前','左后','右后'][n]!,x,y-41,20,'#8fa7b8');
        text(c, reading, x, y+4, 44, warning ? '#e4ae53' : '#e8ecef');
        text(c, 'kPa', x, y + 46, 20, '#a7b0b7');
      });
    } else {
      text(c, '泊车距离', 512, 137, 32);drawGTICar(c,512,350,1);
      const parking = scene?.proximity;
      const positions = [[330,205],[462,180],[632,205],[665,328],[632,460],[462,500],[330,460],[309,328]];
      parking?.zones.forEach((z, n) => {
        const [x, y] = positions[n]!;panel(c,x!,y!,n%2?104:63,20,PROXIMITY_COLORS[z.severity],PROXIMITY_COLORS[z.severity]);
      });
      text(c, parking?.active ? parking.nearestDistanceM === null ? '周围空旷' : parking.nearestDistanceM.toFixed(2) + ' m' : '感知未激活', 512, 570, 26, '#b4c0c8');
    }
    if(this.effectivePage!=='park') {c.fillStyle='#0d1721';c.fillRect(0,551,1024,49);text(c,'GTI',63,576,22,'#ce5866');text(c,t.driveMode??'NORMAL',888,576,21,'#bdcbd4');}
    const header=c.createLinearGradient(0,0,0,78);header.addColorStop(0,'#2c3945');header.addColorStop(1,'#101c28');c.fillStyle=header;c.fillRect(0,0,1024,78);
    GTI_CENTER_PAGES.forEach((p, n) => {
      const color=p===this.effectivePage?'#ffffff':'#9aafbe';pageIcon(c,p,n*256+79,36,color);
      text(c, ['地图', '车辆', '胎压', '泊车'][n]!, n * 256 + 145, 38, 28,color);
      if (p === this.effectivePage) { c.fillStyle = '#c52b3f'; c.fillRect(n * 256 + 32, 72, 192, 4); }
    });
    this.texture.needsUpdate = true;
  }
}
