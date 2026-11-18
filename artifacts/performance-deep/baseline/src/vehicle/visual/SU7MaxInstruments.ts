import * as T from 'three';
import type {InstrumentTelemetry} from './InstrumentCluster';
import {surfaceRounded,surfaceQuad,surfaceLoft} from './SurfaceVehicleGeometry';
import {prepareSU7Typography,SU7_FONT_FAMILY} from './SU7Typography';
import {drawSU7PrimaryReadout,drawSU7SportTheme} from './SU7InstrumentGraphics';
import {drawSU7TellTales} from './SU7InstrumentTellTales';

/** 2026 SU7 cluster: parked summary / driving layout; enlarged for game-camera readability. */
export class SU7MaxInstruments extends T.Group {
  private readonly canvas=document.createElement('canvas');
  private readonly texture:T.CanvasTexture;
  private readonly displayMaterial:T.MeshBasicMaterial;
  private elapsed=Infinity;
  private backlight=.9;
  private sportProgress=0;
  public constructor(){
    super();this.name='SU7 game-adapted driver instrument';
    void prepareSU7Typography().catch(error=>console.error('SU7 instrument font failed to load',error));
    this.canvas.width=960;this.canvas.height=280;
    this.texture=new T.CanvasTexture(this.canvas);this.texture.colorSpace=T.SRGBColorSpace;
    const shell=new T.MeshStandardMaterial({color:0x111516,roughness:.58});
    const wing=new T.MeshPhysicalMaterial({color:0x101417,roughness:.18,metalness:.08,clearcoat:.65,side:T.DoubleSide});
    const upholstery=new T.MeshPhysicalMaterial({color:0x423e39,roughness:.72,sheen:.2,side:T.DoubleSide});
    this.add(surfaceRounded('SU7 instrument satin edge',[.378,.118,.012],[0,0,-.003],shell,.007));
    this.add(surfaceRounded('SU7 instrument surround',[.374,.114,.010],[0,0,0],shell,.006));
    const visor=surfaceLoft('SU7 wrapped instrument sun hood',[-.24,-.22,-.15,0,.15,.22,.24].map(x=>({at:x,
      ring:[[.054,.018],[.068-.008*(x/.24)**4,.012],[.070-.008*(x/.24)**4,-.015],
        [.045,-.130],[-.095,-.135],[-.095,-.105],[.031,-.104],[.050,-.016]] as const})),upholstery,'x');
    visor.castShadow=false;this.add(visor);
    for(const side of [-1,1])this.add(surfaceQuad('SU7 angled instrument glass wing',[
      [side*.187,-.053,.006],[side*.232,-.050,-.034],[side*.232,.050,-.034],[side*.187,.053,.006]],wing));
    this.add(surfaceRounded('SU7 instrument integrated mount',[.13,.037,.055],[0,-.076,-.034],shell,.016));
    this.displayMaterial=new T.MeshBasicMaterial({map:this.texture,toneMapped:false,alphaTest:.5});
    const face=new T.Mesh(new T.PlaneGeometry(.366,.10675),this.displayMaterial);face.name='SU7 driver display';face.position.z=.008;this.add(face);
    const opticalCover=new T.Mesh(face.geometry,new T.MeshPhysicalMaterial({color:0x9daeb9,roughness:.15,clearcoat:.7,
      transparent:true,opacity:.025,depthWrite:false}));opticalCover.name='SU7 instrument optical cover';opticalCover.position.z=.009;this.add(opticalCover);
    this.update({speedKmh:0,rpm:0,gear:'P',ignitionOn:false},1);
  }
  public update(t:InstrumentTelemetry,dt:number):void {
    const on=t.ignitionOn??true,day=T.MathUtils.clamp(t.ambientDaylight??1,0,1);
    const sport=t.driveMode==='SPORT',target=sport?1:0;
    // Presentation time only: retain progress on a mid-transition reversal.
    this.sportProgress=on?T.MathUtils.clamp(this.sportProgress+Math.sign(target-this.sportProgress)*dt/.65,0,1):0;
    const blend=this.sportProgress*this.sportProgress*(3-2*this.sportProgress);
    this.backlight=T.MathUtils.damp(this.backlight,on ? .28+.62*Math.sqrt(day) : 0,7,dt);
    this.displayMaterial.color.setScalar(this.backlight);
    this.elapsed+=dt;
    if(this.elapsed<(this.sportProgress>0&&this.sportProgress<1?1/30:1/15))return;this.elapsed=0;
    const c=this.canvas.getContext('2d');if(!c)return;
    c.clearRect(0,0,960,280);c.fillStyle='#03080c';c.beginPath();c.roundRect(0,0,960,280,10);c.fill();
    if(on){
      const gear=String(t.gear).charAt(0),parked=gear==='P',ev=t.ev;
      const text=(value:string,x:number,y:number,size:number,color='#e4eaed',align:CanvasTextAlign='left')=>{
        c.font=`400 ${size}px ${SU7_FONT_FAMILY}`;c.fillStyle=color;c.textAlign=align;c.textBaseline='middle';c.fillText(value,x,y);
      };
      const line=(x:number,y:number,width:number,color:string)=>{c.fillStyle=color;c.fillRect(x,y,width,3);};
      drawSU7SportTheme(c,t.speedKmh,blend,parked);
      if(t.driveAvailable&&(gear==='D'||gear==='R'))text('READY',42,28,24,'#35c77a');
      if(t.outsideTemperatureC!==undefined)text(`${Math.round(t.outsideTemperatureC)}°C`,148,28,24,'#929da3');
      text(sport?'运动':'舒适',906,28,26,sport?'#da635c':'#b5c0c8','right');
      if(parked){
        if(blend<1){
          c.save();c.globalAlpha=1-blend;
          const gradient=c.createRadialGradient(480,300,0,480,300,260);
          gradient.addColorStop(0,'#0a2030');gradient.addColorStop(1,'#03080c');c.fillStyle=gradient;c.fillRect(0,47,960,233);
          c.strokeStyle='#9caab2';c.lineWidth=3;c.beginPath();c.moveTo(365,48);c.quadraticCurveTo(316,140,365,232);
          c.moveTo(595,48);c.quadraticCurveTo(644,140,595,232);c.stroke();c.restore();
        }
        text('行驶总里程',52,88,32,'#a3b0b8');line(52,112,205,'#435058');
        text(t.trip?t.trip.totalDistanceKm.toFixed(0):'—',52,159,56);text('km',231,161,25,'#a3b0b8');
        text('行驶总能耗',729,88,32,'#a3b0b8');line(729,112,177,'#435058');
        text(ev?.averageConsumptionKWhPer100km!=null?ev.averageConsumptionKWhPer100km.toFixed(1):'计算中',729,157,ev?.averageConsumptionKWhPer100km!=null?54:38);
        text('kWh/100km',904,199,21,'#93a1aa','right');
        drawSU7PrimaryReadout(c,'P',480,140);
        if(ev)text(`电量 ${(ev.stateOfCharge*100).toFixed(0)}%`,52,238,24,'#93a1aa');
      }else{
        text('剩余电量',52,83,32,'#a3b0b8');line(52,110,205,'#425058');
        if(ev){line(52,110,205*T.MathUtils.clamp(ev.stateOfCharge,0,1),'#52b8ca');text((ev.stateOfCharge*100).toFixed(0),52,160,60);text('%',163,166,28,'#a3b0b8');}
        else text('—',52,160,54);
        if(ev)text(`续航 ${Math.round(ev.estimatedRangeKm)} km`,52,218,23,'#93a1aa');
        text('瞬时功率',729,83,32,'#a3b0b8');line(729,110,177,'#425058');
        const availableKW=(ev ? ev.batteryPowerKw<0 ? ev.availableRegenPower??0 : ev.availableDischargePower??0 : 0)/1000;
        if(ev&&availableKW>0)line(729,110,177*T.MathUtils.clamp(Math.abs(ev.batteryPowerKw)/availableKW,0,1),ev.batteryPowerKw<0?'#52b8ca':'#c4cdd2');
        text(ev?ev.batteryPowerKw.toFixed(0):'—',852,160,56,'#e4eaed','right');text('kW',865,168,25,'#a3b0b8');
        drawSU7PrimaryReadout(c,Math.abs(t.speedKmh).toFixed(0),480,139);text('km/h',480,225,24,'#8d9ea8','center');
        // Reference-photo gear ring sits beside the speed, outside the three-digit cell.
        c.strokeStyle='#596770';c.lineWidth=2;c.beginPath();c.arc(711,139,14,0,Math.PI*2);c.stroke();
        text(gear,711,139,24,'#e5eaed','center');
        const limit=t.sharedVehicle?.navigation.speedLimit;
        if(limit!=null){
          c.fillStyle='#f0eeea';c.strokeStyle='#d34f55';c.lineWidth=3;c.beginPath();c.arc(283,82,22,0,Math.PI*2);c.fill();c.stroke();
          text(String(Math.round(limit)),283,83,23,'#24282a','center');
        }
      }
      drawSU7TellTales(c,t);
    }
    this.texture.needsUpdate=true;
  }
}
