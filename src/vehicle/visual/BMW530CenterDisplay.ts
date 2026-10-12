import * as T from 'three';
import { AdaptiveMapZoom } from '../../ui/LocalRoadMap';
import type { InstrumentTelemetry } from './InstrumentCluster';
import type { LuxuryVehicleStatusData } from './LuxuryVehicleStatusPage';
import { luxuryVehicleStatusKey, tyrePressureReading, tyrePressureWarning, pressureText } from './LuxuryVehicleStatusPage';
import { drawBMWVehicleSilhouette } from './BMW530Instruments';

const FONT = '"Segoe UI", "Microsoft YaHei", Arial, sans-serif';
export type BMWCenterPage = 'map' | 'status';

/** BMW artwork over the existing cached map and small status-data contract.
 * No routing, map ownership or simulation logic belongs to this display. */
export class BMW530CenterDisplay {
  public readonly canvas = document.createElement('canvas');
  public readonly texture: T.CanvasTexture;
  public page: BMWCenterPage = 'map';
  private readonly mapCanvas = document.createElement('canvas');
  private readonly zoom = new AdaptiveMapZoom();
  private elapsed = Infinity;
  private key = '';
  private on = false;
  public constructor(private readonly vehicleName: string) {
    this.canvas.width = this.mapCanvas.width = 1024;
    this.canvas.height = this.mapCanvas.height = 416;
    this.texture = new T.CanvasTexture(this.canvas);
    this.texture.colorSpace = T.SRGBColorSpace; this.texture.anisotropy = 4;
  }
  public selectPage(page: BMWCenterPage): boolean {
    if (this.page === page) return false;
    this.page = page; this.key = ''; this.elapsed = Infinity; return true;
  }
  /** Plane UVs, with the canvas origin at its top left. Only the two tabs consume clicks. */
  public click(uv: T.Vector2): boolean {
    if (!this.on || uv.y < .865 || uv.y > .985) return false;
    const x = uv.x * 1024;
    if (x >= 95 && x <= 245) { this.selectPage('map'); return true; }
    if (x >= 255 && x <= 490) { this.selectPage('status'); return true; }
    return false;
  }
  public update(t: InstrumentTelemetry, dt: number, readings?: LuxuryVehicleStatusData): void {
    this.elapsed += Math.max(0,dt);
    const on = t.ignitionOn ?? t.engineRunning ?? true, scene = t.drivingScene;
    const status = {vehicleName:this.vehicleName,fuelLevel:t.fuelLevel,engineTemperatureC:t.coolantTemperatureC,tyres:t.tyres,
      ...readings, tpmsState:t.tpmsState ?? readings?.tpmsState ?? t.sharedVehicle?.tpmsState};
    const clock = new Date(), time = clock.getHours().toString().padStart(2,'0') + ':' + clock.getMinutes().toString().padStart(2,'0');
    const mode = !t.driveMode || t.driveMode === 'NORMAL' ? 'COMFORT' : t.driveMode;
    const temperature = t.outsideTemperatureC === undefined ? '— °C' : t.outsideTemperatureC.toFixed(1) + ' °C';
    const mapKey = scene ? [scene.version,scene.map.version] : ['unavailable'];
    const key = [on,this.page,mode,temperature,time,this.page === 'status' ? luxuryVehicleStatusKey(status,on) : mapKey.join(':')].join('|');
    if (key === this.key || on === this.on && this.key !== '' && this.elapsed < .1) return;
    const elapsed = this.elapsed; this.elapsed = 0; this.key = key; this.on = on;
    const c = this.canvas.getContext('2d')!;
    c.fillStyle = '#04080d'; c.fillRect(0,0,1024,416);
    if (!on) { this.texture.needsUpdate = true; return; }
    const text = (value:string,x:number,y:number,size:number,color='#d8e3ed',align:CanvasTextAlign='left') => {
      c.font = `400 ${size}px ${FONT}`; c.fillStyle=color; c.textAlign=align; c.textBaseline='middle'; c.fillText(value,x,y);
    };
    if (this.page === 'map') {
      if (scene?.map.available) {
        const pose = scene.mapPose, complexity = scene.mapComplexity;
        // The wide centre screen needs more context than the small HUD minimap.
        const metres = Math.max(240,this.zoom.update(Number.isFinite(elapsed)?elapsed:.1,Math.abs(t.speedKmh)/3.6,complexity,String(t.gear).charAt(0))*2);
        const m = this.mapCanvas.getContext('2d')!;
        scene.map.draw(m,{x:0,y:0,width:1024,height:416},pose.x,pose.z,pose.yaw,metres);
        // Reuse the rasterized road tiles; a display-only filter gives BMW a dark, cool map skin.
        c.save(); c.filter = 'invert(1) hue-rotate(180deg)'; c.drawImage(this.mapCanvas,0,0); c.restore();
        const shade = c.createLinearGradient(0,60,0,416);
        shade.addColorStop(0,'rgba(16,32,50,.38)'); shade.addColorStop(.5,'rgba(17,30,48,.12)'); shade.addColorStop(1,'rgba(5,12,22,.72)');
        c.fillStyle=shade; c.fillRect(0,60,1024,356);
        const scale = 50 / metres * 1024;
        c.strokeStyle='#8aabba'; c.lineWidth=2; c.beginPath(); c.moveTo(978-scale,353); c.lineTo(978,353); c.stroke();
        text('50 m',978,334,17,'#9baebb','right'); text('N',980,89,20,'#9baebb','right');
      } else {
        const glow = c.createRadialGradient(512,215,0,512,215,360);
        glow.addColorStop(0,'#152c42'); glow.addColorStop(1,'#050b12'); c.fillStyle=glow; c.fillRect(0,60,1024,356);
        text('Map unavailable',512,220,27,'#b1c1ce','center');
      }
      text('NAVIGATION',35,91,18,'#8ca6bd');
    } else {
      const bg = c.createLinearGradient(0,70,1024,416);
      bg.addColorStop(0,'#142434'); bg.addColorStop(.52,'#091422'); bg.addColorStop(1,'#050a12'); c.fillStyle=bg; c.fillRect(0,60,1024,356);
      const halo = c.createRadialGradient(710,230,10,710,230,190);
      halo.addColorStop(0,'#203e55'); halo.addColorStop(1,'rgba(12,23,35,0)'); c.fillStyle=halo; c.fillRect(467,100,520,264);
      text(status.vehicleName,36,93,32,'#e9eef5');
      c.fillStyle='#314253'; c.fillRect(36,125,951,1); c.fillRect(417,149,1,195);
      const value = (n:number|undefined,fallback:number) => (n!==undefined&&Number.isFinite(n)?'':'~ ') + Math.round(n!==undefined&&Number.isFinite(n)?n:fallback);
      const fuel = T.MathUtils.clamp(status.fuelLevel??.7,0,1);
      text('Fuel',36,158,20,'#90a6b9'); text(value(status.fuelLevel===undefined?undefined:fuel*100,70)+' %',36,202,48,'#edf1f5');
      c.fillStyle='#29394b'; c.fillRect(36,237,318,3); c.fillStyle='#89b9da'; c.fillRect(36,237,318*fuel,3);
      text('Engine Temperature',36,280,19,'#91a7ba'); text(value(status.engineTemperatureC,90)+' °C',352,280,28,'#dfe8f0','right');
      text('Transmission Temperature',36,328,18,'#91a7ba'); text(value(status.transmissionTemperatureC,80)+' °C',352,328,25,'#dfe8f0','right');
      text('Tyre Pressure',710,151,20,'#a0b4c6','center');
      drawBMWVehicleSilhouette(c,710,257,.92);
      const wheels = ['FL','FR','RL','RR'] as const;
      wheels.forEach((wheel,index)=>{
        const x = index%2===0?516:897, y = index<2?214:303;
        text(wheel+':',x,y-23,17,'#8da5b6','center');
        text(pressureText(tyrePressureReading(status,index)),x,y+2,30,tyrePressureWarning(status,index)?'#d1ad68':'#e0eaf3','center');
        text('kPa',x,y+28,16,'#819bad','center');
      });
      const reference = status.transmissionTemperatureC===undefined || wheels.some((_,index)=>tyrePressureReading(status,index)===undefined);
      text(reference?'~ Reference values':'Vehicle readings',36,353,16,'#728d9f');
    }
    // Persistent chrome, with two real touch targets rather than a menu tree.
    c.fillStyle='#0a1422'; c.fillRect(0,0,1024,60); c.fillStyle='#203147'; c.fillRect(0,59,1024,1);
    text('BMW',32,30,19,'#a2bbcf');
    text('MAP',122,30,22,this.page==='map'?'#eef5fc':'#738c9e');
    text('VEHICLE STATUS',273,30,21,this.page==='status'?'#eef5fc':'#738c9e');
    c.fillStyle='#7daed6'; c.fillRect(this.page==='map'?118:270,55,this.page==='map'?55:178,2);
    text(time,987,30,21,'#c7d5e2','right');
    c.fillStyle='rgba(6,13,22,.94)'; c.fillRect(0,374,1024,42);
    text(this.page==='map'?'Map · North up':'Vehicle',35,395,17,'#8aa1b6');
    text(mode,512,395,17,mode==='SPORT'?'#e4a17e':'#9bbdd8','center');
    text(temperature,987,395,18,'#b0c3d3','right');
    this.texture.needsUpdate=true;
  }
}
