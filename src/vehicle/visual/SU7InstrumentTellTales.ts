import type {InstrumentIndicatorState,InstrumentTelemetry} from './InstrumentCluster';
import {LaneAssistMode,LANE_ASSIST_LABELS} from '../control/LaneAssistState';
import {SU7_FONT_FAMILY} from './SU7Typography';

// Symbols follow SU7 owner's manual pp.191–194; fixed slots are a readable
// game adaptation of the status area, not a reproduction of a particular OTA.
export const SU7_TELLTALE_LAYOUT={
  primary:[237,27],frontFog:[277,27],rearFog:[317,27],leftTurn:[369,27],rightTurn:[591,27],
  hold:[283,243],parking:[332,251],abs:[377,251],skid:[422,251],skidOff:[467,251],
  battery:[512,251],tpms:[557,251],limited:[602,251],door:[647,251],cruise:[692,251],
} as const;
const GREEN='#35c77a',BLUE='#369aff',AMBER='#ffb24a',RED='#ff595c';

export function su7PrimaryLight(i:InstrumentIndicatorState):'high'|'low'|'position'|null {
  return i.highBeam?'high':i.headlights?'low':i.positionLights?'position':null;
}

/** Only supplied runtime states light a symbol. No bulb test, fake faults or
 * an adaptive-highbeam/seatbelt indicator without a corresponding subsystem. */
export function drawSU7TellTales(c:CanvasRenderingContext2D,t:InstrumentTelemetry):void {
  const i=t.indicators??{},p=SU7_TELLTALE_LAYOUT;
  const at=(position:readonly[number,number],color:string,draw:()=>void)=>{
    c.save();c.translate(...position);c.strokeStyle=c.fillStyle=color;c.lineWidth=2.3;
    c.lineCap='round';c.lineJoin='round';draw();c.restore();
  };
  const lamp=(position:readonly[number,number],kind:'high'|'low'|'front-fog'|'rear-fog')=>
    at(position,kind==='high'?BLUE:kind==='rear-fog'?AMBER:GREEN,()=>{
      if(kind==='rear-fog')c.scale(-1,1);
      c.beginPath();c.moveTo(2,-10);c.bezierCurveTo(22,-10,22,10,2,10);c.closePath();c.stroke();
      c.beginPath();for(let n=0;n<4;n++){
        const y=-9+n*6;c.moveTo(-3,y);c.lineTo(-18,y+(kind==='low'||kind==='front-fog'?5:0));
      }c.stroke();
      if(kind.endsWith('fog')){c.beginPath();c.moveTo(-10,-14);c.bezierCurveTo(-17,-7,-4,-3,-10,3);
        c.bezierCurveTo(-17,9,-4,13,-10,17);c.stroke();}
    });
  const primary=su7PrimaryLight(i);
  if(primary==='position')at(p.primary,GREEN,()=>{
    for(const side of [-1,1]){
      c.beginPath();c.roundRect(side<0?-11:3,-10,8,20,2);c.stroke();
      c.beginPath();for(let n=-1;n<=1;n++){c.moveTo(side*15,n*7);c.lineTo(side*21,n*10);}c.stroke();
    }
  });else if(primary)lamp(p.primary,primary);
  if(i.frontFogLights)lamp(p.frontFog,'front-fog');
  if(i.rearFogLights??i.fogLights)lamp(p.rearFog,'rear-fog');
  const arrow=(position:readonly[number,number],right:boolean)=>at(position,GREEN,()=>{
    if(right)c.scale(-1,1);c.beginPath();c.moveTo(-15,0);c.lineTo(-1,-12);c.lineTo(-1,-6);
    c.lineTo(15,-6);c.lineTo(15,6);c.lineTo(-1,6);c.lineTo(-1,12);c.closePath();c.fill();
  });
  // leftBlinkOn/rightBlinkOn already contain the shared flasher phase.
  if(i.leftTurn)arrow(p.leftTurn,false);if(i.rightTurn)arrow(p.rightTurn,true);
  const round=(position:readonly[number,number],label:string,color:string)=>at(position,color,()=>{
    c.beginPath();c.arc(0,0,12,0,Math.PI*2);c.stroke();
    c.beginPath();for(const side of [-1,1]){c.moveTo(side*16,-10);c.quadraticCurveTo(side*23,0,side*16,10);}c.stroke();
    c.font=`500 ${label==='ABS'?10:18}px ${SU7_FONT_FAMILY}`;
    c.textAlign='center';c.textBaseline='middle';c.fillText(label,0,1);
  });
  if(i.autoHold)round(p.hold,'H',GREEN);
  if(i.parkingBrake)round(p.parking,'P',RED);
  if(i.absWarning)round(p.abs,'ABS',AMBER);
  const skid=(position:readonly[number,number],off:boolean)=>at(position,AMBER,()=>{
    c.beginPath();c.moveTo(-11,-1);c.lineTo(-9,-9);c.lineTo(-6,-13);c.lineTo(6,-13);
    c.lineTo(9,-9);c.lineTo(11,-1);c.closePath();c.moveTo(-8,-7);c.lineTo(8,-7);c.stroke();
    c.beginPath();for(const side of [-1,1]){c.moveTo(side*7,3);c.bezierCurveTo(side*15,7,side*1,10,side*8,14);}c.stroke();
    if(off){c.font=`500 10px ${SU7_FONT_FAMILY}`;c.textAlign='center';c.fillText(i.escOff?'OFF':'TC OFF',0,23);}
  });
  if(i.tcsActive||i.escActive)skid(p.skid,false);
  if(i.tcsOff||i.escOff)skid(p.skidOff,true);
  // The game's EV batteryWarning means low traction SOC, not a 12 V failure.
  if(i.batteryWarning)at(p.battery,AMBER,()=>{
    c.strokeRect(-14,-8,25,17);c.strokeRect(-3,-12,7,4);
    c.beginPath();c.moveTo(15,-3);c.lineTo(15,13);c.lineTo(-9,13);c.moveTo(19,1);c.lineTo(19,17);c.lineTo(-5,17);
    c.moveTo(-9,0);c.lineTo(-3,0);c.moveTo(2,0);c.lineTo(8,0);c.moveTo(5,-3);c.lineTo(5,3);c.stroke();
  });
  if(t.tpmsState?.warning)at(p.tpms,AMBER,()=>{
    c.beginPath();c.moveTo(-11,-12);c.bezierCurveTo(-22,13,-10,15,0,15);
    c.bezierCurveTo(10,15,22,13,11,-12);c.stroke();
    c.beginPath();for(let x=-9;x<=9;x+=6){c.moveTo(x,15);c.lineTo(x,18);}c.moveTo(0,-8);c.lineTo(0,3);c.stroke();
    c.beginPath();c.arc(0,9,1.3,0,Math.PI*2);c.fill();
  });
  if((t.ev?.thermalDerateFraction??0)>.05)at(p.limited,AMBER,()=>{
    c.beginPath();c.arc(0,0,16,0,Math.PI*2);c.moveTo(-9,5);c.bezierCurveTo(-9,-6,7,-7,8,4);
    c.moveTo(-12,5);c.lineTo(12,5);c.moveTo(-6,5);c.lineTo(-6,9);c.moveTo(5,5);c.lineTo(5,9);c.stroke();
  });
  if((t.driverAccess?.doorOpen??0)>.05)at(p.door,RED,()=>{
    c.beginPath();c.roundRect(-7,-15,14,29,4);c.moveTo(-7,-7);c.lineTo(-18,-1);
    c.moveTo(-7,5);c.lineTo(-18,-1);c.stroke();
  });
  if(i.cruise)at(p.cruise,GREEN,()=>{
    c.beginPath();c.arc(0,3,13,Math.PI,Math.PI*2);c.moveTo(0,3);c.lineTo(7,-5);c.stroke();
    c.font=`500 10px ${SU7_FONT_FAMILY}`;c.textAlign='center';c.fillText('SET',0,18);
  });
  const lane=t.laneAssist,active=t.sharedVehicle?.lateralAssist??t.drivingScene?.lateralAssist;
  if(lane&&(lane.mode!==LaneAssistMode.OFF||lane.notificationVisible))at([824,247],
    active?.lccActive||active?.lkaActive?GREEN:'#8d9ca5',()=>{
      c.beginPath();c.moveTo(-39,11);c.lineTo(-34,-12);c.moveTo(-12,11);c.lineTo(-17,-12);c.stroke();
      c.font=`500 20px ${SU7_FONT_FAMILY}`;c.textAlign='left';c.textBaseline='middle';
      c.fillText(LANE_ASSIST_LABELS[lane.mode],0,0);
    });
}
