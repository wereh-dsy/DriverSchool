import type { InstrumentIndicatorState, InstrumentTelemetry } from './InstrumentCluster';

const GREEN='#59d47d', BLUE='#549cff', AMBER='#e2ae55', RED='#df7775';
/** Z223 standard-display arrangement, adapted to the 1280×600 face. */
export const MAYBACH_TELLTALE_LAYOUT = {
  leftTurn: [275,62], rightTurn: [1005,62], primaryLight: [43,491],
  rearFog: [43,450], frontFog: [43,409], parkingBrake: [640,551], hold: [275,466],
} as const;

/** The display replaces the standing-lamp symbol with dipped beam, then main
 * beam. This does not remove the physical dipped foreground on main beam. */
export function maybachPrimaryLight(i: InstrumentIndicatorState): 'position' | 'low' | 'high' | null {
  return i.highBeam ? 'high' : i.headlights ? 'low' : i.positionLights ? 'position' : null;
}

export function drawMaybachTellTales(c: CanvasRenderingContext2D, t: InstrumentTelemetry): void {
  const i=t.indicators??{},layout=MAYBACH_TELLTALE_LAYOUT;
  const at=(position:readonly [number,number],color:string,draw:()=>void)=>{
    c.save();c.translate(...position);c.strokeStyle=c.fillStyle=color;
    c.lineWidth=2.6;c.lineCap='round';c.lineJoin='round';draw();c.restore();
  };
  const lamp=(position:readonly [number,number],kind:'low'|'high'|'front-fog'|'rear-fog')=>at(position,kind==='high'?BLUE:kind==='rear-fog'?AMBER:GREEN,()=>{
    if(kind==='rear-fog')c.scale(-1,1);
    // A closed D-shaped optical housing, with light rays to its left.
    c.beginPath();c.moveTo(4,-11);c.bezierCurveTo(22,-11,22,11,4,11);c.closePath();c.stroke();
    for(let n=0;n<4;n++){
      const y=-10+n*6.7;c.beginPath();c.moveTo(-3,y);c.lineTo(-23,y+(kind==='low'||kind==='front-fog'?6:0));c.stroke();
    }
    if(kind==='front-fog'||kind==='rear-fog'){
      c.beginPath();c.moveTo(-12,-17);c.bezierCurveTo(-20,-9,-7,-4,-13,3);
      c.bezierCurveTo(-20,10,-7,15,-13,19);c.stroke();
    }
  });
  const primary=maybachPrimaryLight(i);
  if(primary==='position')at(layout.primaryLight,GREEN,()=>{
    for(const side of [-1,1]){
      c.beginPath();c.moveTo(side*6,-9);c.lineTo(side*6,9);c.bezierCurveTo(side*20,9,side*20,-9,side*6,-9);c.stroke();
      for(let n=-1;n<=1;n++){c.beginPath();c.moveTo(side*21,n*8);c.lineTo(side*29,n*10);c.stroke();}
    }
  });
  else if(primary)lamp(layout.primaryLight,primary);
  if(i.rearFogLights??i.fogLights)lamp(layout.rearFog,'rear-fog');
  // The shared game also supports a separate front-fog command. Reserve a
  // fixed slot for that real state; do not invent an adaptive-highbeam lamp.
  if(i.frontFogLights??i.fogLights)lamp(layout.frontFog,'front-fog');
  const arrow=(position:readonly[number,number],right:boolean)=>at(position,GREEN,()=>{
    if(right)c.scale(-1,1);c.beginPath();c.moveTo(-17,0);c.lineTo(-3,-12);c.lineTo(-3,-6);
    c.lineTo(17,-6);c.lineTo(17,6);c.lineTo(-3,6);c.lineTo(-3,12);c.closePath();c.fill();
  });
  if(i.leftTurn)arrow(layout.leftTurn,false);if(i.rightTurn)arrow(layout.rightTurn,true);
  const round=(position:readonly[number,number],label:string,color:string)=>at(position,color,()=>{
    c.beginPath();c.arc(0,0,12,0,Math.PI*2);c.stroke();
    for(const sign of [-1,1]){c.beginPath();c.moveTo(sign*17,-12);c.quadraticCurveTo(sign*25,0,sign*17,12);c.stroke();}
    c.font=`500 ${label==='ABS'?10:17}px "Segoe UI",sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillText(label,0,1);
  });
  if(i.parkingBrake)round(layout.parkingBrake,'P',RED);
  if(i.autoHold)at(layout.hold,'#e4e6df',()=>{
    c.font='500 18px "Segoe UI",sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('HOLD',0,0);
  });
  // Fixed warning positions: a changing population never shifts the lighting,
  // direction arrows or other warnings around the panel.
  if(i.batteryWarning)at([474,62],RED,()=>{
    c.strokeRect(-17,-9,34,20);c.beginPath();c.moveTo(-11,-12);c.lineTo(-6,-12);c.moveTo(6,-12);c.lineTo(11,-12);
    c.moveTo(-12,1);c.lineTo(-6,1);c.moveTo(6,1);c.lineTo(12,1);c.moveTo(9,-2);c.lineTo(9,4);c.stroke();
  });
  if(i.engineWarning)at([530,62],AMBER,()=>{
    c.beginPath();c.moveTo(-17,-4);c.lineTo(-10,-4);c.lineTo(-6,-10);c.lineTo(9,-10);c.lineTo(14,-4);
    c.lineTo(19,-4);c.lineTo(19,10);c.lineTo(12,10);c.lineTo(8,14);c.lineTo(-13,14);c.lineTo(-17,7);c.closePath();c.stroke();
    c.beginPath();c.moveTo(-4,-16);c.lineTo(6,-16);c.moveTo(1,-16);c.lineTo(1,-10);c.stroke();
  });
  if(i.absWarning)round([586,62],'ABS',AMBER);
  if(t.tpmsState?.warning)at([642,62],AMBER,()=>{
    c.beginPath();c.moveTo(-14,-10);c.bezierCurveTo(-24,14,-9,18,0,18);c.bezierCurveTo(9,18,24,14,14,-10);c.stroke();
    c.beginPath();c.moveTo(0,-8);c.lineTo(0,4);c.stroke();c.beginPath();c.arc(0,11,1.4,0,Math.PI*2);c.fill();
  });
  const skid=(position:readonly[number,number],off:boolean)=>at(position,AMBER,()=>{
    c.beginPath();c.moveTo(-13,3);c.lineTo(-10,-9);c.lineTo(-6,-14);c.lineTo(6,-14);c.lineTo(10,-9);c.lineTo(13,3);c.closePath();c.stroke();
    c.beginPath();c.moveTo(-10,-4);c.lineTo(10,-4);c.stroke();
    for(const sign of [-1,1]){c.beginPath();c.moveTo(sign*7,7);c.bezierCurveTo(sign*16,11,sign*2,14,sign*9,18);c.stroke();}
    if(off){c.font='500 9px "Segoe UI",sans-serif';c.textAlign='center';c.fillText(i.escOff?'OFF':'TCS OFF',0,29);}
  });
  if(i.tcsActive||i.escActive)skid([698,62],false);
  if(i.tcsOff||i.escOff)skid([754,62],true);
}
