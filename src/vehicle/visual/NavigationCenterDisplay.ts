import * as T from 'three';
import type { InstrumentTelemetry } from './InstrumentCluster';
import { AdaptiveMapZoom } from '../../ui/LocalRoadMap';
import { drawNavigationBanner } from '../../ui/NavigationDisplay';

/** Canvas adapter for an existing equipped centre screen; owns no map/sensors. */
export class NavigationCenterDisplay {
  private readonly canvas=document.createElement('canvas');
  public readonly texture:T.CanvasTexture;
  private readonly zoom=new AdaptiveMapZoom();
  private elapsed=Infinity;
  private key='';
  public constructor() {
    this.canvas.width=1024;this.canvas.height=370;this.texture=new T.CanvasTexture(this.canvas);this.texture.colorSpace=T.SRGBColorSpace;this.texture.anisotropy=4;
    this.canvas.getContext('2d')?.fillRect(0,0,1024,370);
  }
  public update(t:InstrumentTelemetry,dt:number):void {
    this.elapsed+=dt;const n=t.sharedVehicle?.navigation,on=t.ignitionOn??true;
    const key=`${on}|${t.sharedVehicle?.version}|${n?.guidance?.version}`;
    if(key===this.key||this.elapsed<.1)return;const elapsed=Number.isFinite(this.elapsed)?this.elapsed:.1;this.elapsed=0;this.key=key;
    const c=this.canvas.getContext('2d');if(!c)return;
    c.fillStyle='#0d1820';c.fillRect(0,0,1024,370);
    if(on){
      if(n?.map.available){const metres=Math.max(300,this.zoom.update(elapsed,t.speedKmh/3.6,n.complexity,String(t.gear).charAt(0))*2);n.map.draw(c,{x:0,y:0,width:1024,height:370},n.pose.x,n.pose.z,n.pose.yaw,metres);}
      c.fillStyle='#102332';c.fillRect(0,0,1024,52);c.fillStyle='#e3edf5';c.font='24px "Segoe UI", "Microsoft YaHei", sans-serif';c.textBaseline='middle';c.textAlign='left';c.fillText(n?.roadName??'Navigation · F10 地图',20,26,980);
      drawNavigationBanner(c,n?.guidance,{x:20,y:68,width:510,height:136});
    }
    this.texture.needsUpdate=true;
  }
}
