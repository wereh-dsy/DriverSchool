import * as T from 'three';
import type { InstrumentTelemetry } from './InstrumentCluster';
import { AdaptiveMapZoom } from '../../ui/LocalRoadMap';
import { drawNavigationBanner } from '../../ui/NavigationDisplay';
import { prepareSU7Typography, SU7_FONT_FAMILY } from './SU7Typography';

/** Full-aspect landscape screen. Borrows the existing shared map; owns only artwork. */
export class SU7CenterDisplay {
  private readonly canvas=document.createElement('canvas');
  public readonly texture:T.CanvasTexture;
  private elapsed=Infinity;
  private readonly zoom=new AdaptiveMapZoom();
  public constructor(){void prepareSU7Typography().catch(error=>console.error('SU7 centre font failed to load',error));this.canvas.width=1024;this.canvas.height=620;this.texture=new T.CanvasTexture(this.canvas);this.texture.colorSpace=T.SRGBColorSpace;}
  public update(t:InstrumentTelemetry,dt:number):void {
    this.elapsed+=dt;if(this.elapsed<.1)return;const elapsed=this.elapsed;this.elapsed=0;
    const c=this.canvas.getContext('2d');if(!c)return;
    c.fillStyle='#0d161d';c.fillRect(0,0,1024,620);
    if(t.ignitionOn??true){
      const n=t.sharedVehicle?.navigation;
      if(n?.map.available){const metres=Math.max(300,this.zoom.update(Number.isFinite(elapsed)?elapsed:.1,t.speedKmh/3.6,n.complexity,String(t.gear).charAt(0))*2);
        n.map.draw(c,{x:0,y:42,width:1024,height:514},n.pose.x,n.pose.z,n.pose.yaw,metres,(t.ambientDaylight??1)<.2?'#18242e':'#3c4850');}
      else {c.fillStyle='#152735';c.fillRect(0,42,1024,514);c.fillStyle='#8096a4';c.font=`400 24px ${SU7_FONT_FAMILY}`;c.textAlign='center';c.fillText('Navigation · F10',512,300);}
      c.fillStyle='#101c26';c.fillRect(0,0,1024,42);c.fillRect(0,556,1024,64);
      c.fillStyle='#dce8ef';c.font=`400 20px ${SU7_FONT_FAMILY}`;c.textAlign='left';c.textBaseline='middle';
      c.fillText(n?.roadName??'Xiaomi SU7 Max',20,21,760);
      c.textAlign='right';c.fillText(t.ev?`${(t.ev.stateOfCharge*100).toFixed(0)}%`:'—',996,21);
      drawNavigationBanner(c,n?.guidance,{x:18,y:58,width:510,height:136});
      c.textAlign='left';c.fillText('SU7 Max',24,588);c.textAlign='center';c.fillText(t.driveMode==='SPORT'?'SPORT':'COMFORT',512,588);
      c.textAlign='right';c.fillText(t.ev?`${t.ev.batteryPowerKw.toFixed(0)} kW`:'—',996,588);
    }
    this.texture.needsUpdate=true;
  }
}
