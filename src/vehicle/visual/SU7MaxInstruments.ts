import { activeNavigation, drawNavigationBanner } from '../../ui/NavigationDisplay';
import * as T from 'three';
import type { InstrumentTelemetry } from './InstrumentCluster';
import { drawLaneAssistSelection } from './LaneAssistSelectionDisplay';

/** Slim driver display. Values come only from the shared runtime snapshot. */
export class SU7MaxInstruments extends T.Group {
  private readonly canvas=document.createElement('canvas');
  private readonly texture:T.CanvasTexture;
  private elapsed=Infinity;
  public constructor() {
    super();this.name='SU7 7.1 inch driver instrument';
    this.canvas.width=960;this.canvas.height=280;
    this.texture=new T.CanvasTexture(this.canvas);this.texture.colorSpace=T.SRGBColorSpace;
    const bezel=new T.Mesh(new T.BoxGeometry(.234,.077,.018),new T.MeshStandardMaterial({color:0x10171e,roughness:.5}));
    bezel.name='SU7 instrument surround';this.add(bezel);
    const material=new T.MeshBasicMaterial({map:this.texture,toneMapped:false});
    const face=new T.Mesh(new T.PlaneGeometry(.224,.0653),material);face.name='SU7 driver display';face.position.z=.010;this.add(face);
    this.update({speedKmh:0,rpm:0,gear:'P',ignitionOn:false},1);
  }
  public update(t:InstrumentTelemetry,dt:number):void {
    this.elapsed+=dt;if(this.elapsed<1/15)return;this.elapsed=0;
    const c=this.canvas.getContext('2d');if(!c)return;
    c.fillStyle='#071117';c.fillRect(0,0,960,280);
    if(t.ignitionOn??true) {
      c.textBaseline='middle';c.textAlign='center';c.fillStyle='#f1f8fa';
      c.font='600 100px sans-serif';c.fillText(Math.abs(t.speedKmh).toFixed(0),480,120);
      c.font='24px sans-serif';c.fillStyle='#9aaeb8';c.fillText('km/h',480,192);
      c.font='bold 40px sans-serif';c.fillStyle='#8ee1da';c.fillText(String(t.gear),78,105);
      c.font='22px sans-serif';c.fillStyle='#e4edf2';
      c.fillText(t.ev?`${(t.ev.stateOfCharge*100).toFixed(0)}%`:'—',190,110);
      c.fillText(t.ev?`${t.ev.batteryPowerKw.toFixed(0)} kW`:'—',780,110);
      c.font='18px sans-serif';c.fillStyle='#97b0be';c.fillText(t.driveMode==='SPORT'?'SPORT':'COMFORT',195,175);
      c.fillText(t.ev?.batteryTemperature!==undefined?`${t.ev.batteryTemperature.toFixed(0)}°C`:'—',780,175);
      const guidance=t.sharedVehicle?.navigation.guidance;
      if(activeNavigation(guidance))drawNavigationBanner(c,guidance,{x:610,y:12,width:335,height:64},true);
      drawLaneAssistSelection(c,t.laneAssist,'audi',480,247,.85);
      const lights=t.indicators;
      c.fillStyle='#5ce39b';c.font='30px sans-serif';
      if(lights?.leftTurn)c.fillText('◀',45,238);if(lights?.rightTurn)c.fillText('▶',915,238);
      c.fillStyle='#ffba66';c.font='17px sans-serif';
      const warnings=[lights?.absWarning?'ABS':'',lights?.tcsActive?'TCS':'',lights?.escActive?'ESC':'',
        lights?.tcsOff?'TCS OFF':'',lights?.escOff?'ESC OFF':'',lights?.batteryWarning?'BAT':''].filter(Boolean);
      c.fillText(warnings.join('  '),770,238);
      c.fillStyle=lights?.parkingBrake?'#f86a70':'#71dfab';
      c.fillText(lights?.parkingBrake?'(P)':lights?.autoHold?'HOLD':t.driveAvailable?'READY':'',190,238);
      if(lights?.highBeam){c.fillStyle='#58aaff';c.fillText('HIGH',78,175);}
    }
    this.texture.needsUpdate=true;
  }
}
