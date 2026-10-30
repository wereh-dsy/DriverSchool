import * as T from 'three';
import type { InstrumentTelemetry } from './InstrumentCluster';
import { drawJeskoWordmark, jeskoRoundedShape } from './JeskoCabinGeometry';

const number=(value:number|undefined,scale=1):string=>value===undefined||!Number.isFinite(value)?'—':String(Math.round(value*scale));

/** Reference SmartCluster: a compact wheel-mounted screen, with the circular
 * core counter-rotating in the physical screen. Every value is real telemetry. */
export class JeskoAttackInstruments extends T.Group {
  private readonly canvas=document.createElement('canvas');
  private readonly context:CanvasRenderingContext2D;
  public readonly texture:T.CanvasTexture;
  public readonly screen:T.Mesh<T.ShapeGeometry,T.MeshPhysicalMaterial>;
  private bootTime=1;private wasPowered=false;
  private lastKey='';private elapsed=1;private illumination=0;private steeringAngle=0;

  public constructor(private readonly portrait=false){
    super();this.name=portrait?'Jesko centre telemetry display':'Jesko SmartCluster';
    this.canvas.width=portrait?600:1000;this.canvas.height=portrait?960:600;
    this.context=this.canvas.getContext('2d')!;this.texture=new T.CanvasTexture(this.canvas);
    this.texture.colorSpace=T.SRGBColorSpace;this.texture.anisotropy=4;
    this.texture.name=portrait?'Jesko centre live texture':'Jesko instruments live texture';
    const width=portrait?.170:.124,height=portrait?.272:.0744;
    const housing=new T.Mesh(new T.ExtrudeGeometry(jeskoRoundedShape(width+.006,height+.006,.004),
      {depth:.009,steps:1,curveSegments:3,bevelEnabled:true,bevelSize:.0007,bevelThickness:.0007,bevelSegments:1}),
      new T.MeshPhysicalMaterial({color:0x171d22,roughness:.29,metalness:.48,clearcoat:.6}));
    housing.name=portrait?'Jesko portrait control screen bezel':'Jesko digital instrument housing';housing.position.z=-.012;this.add(housing);
    const geometry=new T.ShapeGeometry(jeskoRoundedShape(width,height,.002),3);
    const p=geometry.getAttribute('position'),uv=geometry.getAttribute('uv');
    for(let n=0;n<p.count;n++)uv.setXY(n,p.getX(n)/width+.5,p.getY(n)/height+.5);
    this.screen=new T.Mesh(geometry,new T.MeshPhysicalMaterial({color:0x020406,emissive:0xffffff,emissiveMap:this.texture,
      emissiveIntensity:0,roughness:.15,metalness:0,clearcoat:1,clearcoatRoughness:.12,specularIntensity:.23}));
    this.screen.name=portrait?'Jesko portrait control screen':'Jesko digital instrument face';this.add(this.screen);
    this.update({speedKmh:0,rpm:0,gear:'N',ignitionOn:false},1);
  }

  public setSteeringAngle(angle:number):void{this.steeringAngle=Number.isFinite(angle)?angle:0;}

  public update(t:InstrumentTelemetry,dt=1/60):void{
    this.elapsed+=Math.max(0,dt);
    const on=t.ignitionOn??t.engineRunning??true,day=T.MathUtils.clamp(t.ambientDaylight??1,0,1),i=t.indicators;
    if(on&&!this.wasPowered)this.bootTime=0;
    this.wasPowered=on;this.bootTime+=Math.max(0,dt);
    this.illumination=T.MathUtils.damp(this.illumination,on?.45+day*.73:0,8,Math.max(0,dt));
    this.screen.material.emissiveIntensity=this.illumination;
    const flags=[i?.engineWarning?'ENGINE':'',i?.batteryWarning?'BATTERY':'',i?.absWarning?'ABS':'',
      i?.tcsOff?'TCS OFF':i?.tcsActive?'TCS':'',i?.escOff?'ESC OFF':i?.escActive?'ESC':'',
      i?.parkingBrake||(t.handbrake??0)>.1?'PARK':''].filter(Boolean).join(' ');
    const rpm=Math.round(T.MathUtils.clamp(t.rpm,0,9000)/25)*25,speed=number(Math.abs(t.speedKmh)),fuel=number(t.fuelLevel,100),coolant=number(t.coolantTemperatureC);
    const aero=number(t.activeSpoilerDeployment,100),angle=Math.round(this.steeringAngle*500)/500;
    const lamps=`${!!i?.highBeam}${!!i?.headlights}${!!i?.leftTurn}${!!i?.rightTurn}`;
    const mode=t.driveMode==='NORMAL'?'COMFORT':t.driveMode==='WET'?'WET / SNOW':t.driveMode==='RACE'?'TRACK':t.driveMode??'SPORT';
    const boot=on&&this.bootTime<.70&&Math.abs(t.speedKmh)<.5&&!flags;
    const bootFrame=boot?Math.floor(this.bootTime*30):-1;
    const key=`${on}|${rpm}|${speed}|${t.gear}|${fuel}|${coolant}|${aero}|${flags}|${lamps}|${this.portrait?0:angle}`;
    const urgent=on!==this.userData.powered||flags!==this.userData.indicators||lamps!==this.userData.lamps;
    if(key+mode+bootFrame===this.lastKey||(!urgent&&this.elapsed<1/30))return;
    this.lastKey=key+mode+bootFrame;this.elapsed=0;this.userData.powered=on;this.userData.indicators=flags;this.userData.lamps=lamps;
    const c=this.context,w=this.canvas.width,h=this.canvas.height;
    c.fillStyle='#080c0f';c.fillRect(0,0,w,h);
    if(!on){this.texture.needsUpdate=true;return;}
    if(boot){
      // Original restrained wake-up, inspired by the factory SmartCluster.
      // Decorative arc only; never drives or labels a fictional engine RPM.
      const p=T.MathUtils.clamp(this.bootTime/.70,0,1),cx=w/2,cy=h/2;
      c.strokeStyle='#86946b';c.lineWidth=2;c.beginPath();
      c.arc(cx,cy,Math.min(w,h)*.34,-Math.PI/2,-Math.PI/2+p*Math.PI*2);c.stroke();
      drawJeskoWordmark(c,cx-w*.18,cy-22,w*.36,'#b9c3c5');
      this.texture.needsUpdate=true;return;
    }
    const text=(s:string,x:number,y:number,size:number,color='#c6cdd0',align:CanvasTextAlign='center',maxWidth?:number)=>{
      c.font=`400 ${size}px "Segoe UI",Arial,sans-serif`;c.fillStyle=color;c.textAlign=align;
      if(maxWidth===undefined)c.fillText(s,x,y);else c.fillText(s,x,y,maxWidth);
    };
    if(this.portrait){
      // Reference layout: narrow light text, green rules, measured-status tiles.
      const tabs=['MEDIA','CONTROLS','MODES','SETUP'];tabs.forEach((s,n)=>text(s,74+n*150,44,18,n===1?'#c8d3d4':'#68777e'));
      c.fillStyle='#96b65b';c.fillRect(158,59,133,2);drawJeskoWordmark(c,210,93,180,'#a8b6bc');
      const cards=[['SPEED',speed,'km/h'],['ENGINE',String(rpm),'rpm'],['COOLANT',coolant,'°C'],
        ['FUEL',fuel,'%'],['GEAR',String(t.gear),'LST'],['WING',aero,'%']];
      cards.forEach(([label,value,unit],n)=>{const x=100+(n%3)*200,y=230+Math.floor(n/3)*174;
        c.beginPath();c.arc(x,y,59,0,Math.PI*2);c.strokeStyle='#58696e';c.lineWidth=1.5;c.stroke();
        text(value!,x,y+10,value!.length>4?26:34);text(unit!,x,y+36,14,'#7d929a');text(label!,x,y+89,17,'#899da5');
      });
      c.strokeStyle='#66746d';c.lineWidth=1;c.beginPath();c.ellipse(300,674,197,85,0,0,Math.PI*2);c.stroke();
      c.save();c.translate(300,664);c.strokeStyle='#a5b2b6';c.fillStyle='#202d33';c.lineWidth=2;
      c.beginPath();c.moveTo(-35,-105);c.bezierCurveTo(-69,-97,-78,-53,-72,12);c.lineTo(-87,78);c.lineTo(-70,103);
      c.lineTo(70,103);c.lineTo(87,78);c.lineTo(72,12);c.bezierCurveTo(78,-53,69,-97,35,-105);c.closePath();c.fill();c.stroke();
      c.strokeRect(-80,61,160,15);c.beginPath();c.moveTo(-40,-42);c.lineTo(40,-42);c.lineTo(35,22);c.lineTo(-35,22);c.closePath();c.stroke();
      for(const x of [-76,76])for(const y of [-53,51]){c.fillStyle='#121a20';c.fillRect(x-9,y,18,35);}c.restore();
      text(flags||mode,300,843,21,flags?'#cba17c':'#8caa72','center',540);
      c.strokeStyle='#344249';c.beginPath();c.moveTo(24,880);c.lineTo(576,880);c.stroke();
      ['◧','◁','♧','≋','⌁','◨'].forEach((s,n)=>text(s,55+n*98,931,27,'#9aabb1'));
    }else{
      // User's driving reference: gear above road speed, restrained peripheral
      // tachometer marks. Both main readings remain inside the inscribed circle.
      const cx=500,cy=300,r=244;
      c.save();c.translate(cx,cy);c.rotate(angle);c.translate(-cx,-cy);
      c.strokeStyle='#454d50';c.lineWidth=3;
      for(const side of [-1,1]){
        c.beginPath();c.arc(cx,cy,r,side<0?Math.PI-.77:-1.15,side<0?Math.PI+.77:1.15);c.stroke();
      }
      // Nine fine sectors represent the actual 0–9000 rpm range.
      for(let n=0;n<9;n++){
        const a=-1.15+n/9*2.3,b=a+2.3/9*.80;
        c.beginPath();c.arc(cx,cy,r-9,a,b);
        c.strokeStyle=n<rpm/1000?(rpm>=8500?'#bf746c':'#969e9f'):'#292f32';c.lineWidth=7;c.stroke();
        c.beginPath();c.moveTo(cx+Math.cos(a)*(r+9),cy+Math.sin(a)*(r+9));
        c.lineTo(cx+Math.cos(a)*(r+17),cy+Math.sin(a)*(r+17));c.strokeStyle='#7c8588';c.lineWidth=2;c.stroke();
      }
      const reading=(value:string,y:number,size:number)=>{
        c.font=`300 ${size}px Bahnschrift,"Segoe UI",Arial,sans-serif`;c.fillStyle='#c9cecf';c.textAlign='center';c.fillText(value,cx,y);
      };
      reading(String(t.gear).replace(/^D(?=\d)/,''),267,151);
      reading(speed,411,119);
      text('km/h',cx,451,24,'#7c8588');
      text(mode,cx,554,22,'#8c9a7d');
      if(i?.leftTurn)text('◀',365,105,29,'#80aa87');
      if(i?.rightTurn)text('▶',595,105,29,'#80aa87');
      if(i?.highBeam||i?.headlights)text(i.highBeam?'HIGH':'LIGHTS',cx,106,20,i.highBeam?'#7796b1':'#82a08a');
      text(flags,cx,509,24,'#c6a083','center',300);
      c.restore();
      // Secondary information stays on the screen margins, outside the core.
      text(coolant+'°C',115,450,25,'#7a8589');
      text(fuel+'%',885,450,25,'#7a8589');
      c.strokeStyle='#4b5458';c.lineWidth=2;c.strokeRect(853,380,64,7);
      if(t.fuelLevel!==undefined){c.fillStyle='#8c9e74';c.fillRect(855,382,60*T.MathUtils.clamp(t.fuelLevel,0,1),3);}
    }
    this.texture.needsUpdate=true;
  }
}
