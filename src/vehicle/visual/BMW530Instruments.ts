import { drawLaneAssistSelection } from './LaneAssistSelectionDisplay';
import * as T from 'three';
import { lateralBoundaryColor } from './LateralAssistDisplay';
import type { InstrumentClusterConfig, InstrumentTelemetry } from './InstrumentCluster';
import { mesh, rounded } from './BMW530Geometry';
import { PROXIMITY_COLORS } from '../control/RearParkingProximity';
import { VehicleAssetRegistry } from './VehicleAssetRegistry';

export const BMW_INSTRUMENT_LAYOUT = { width:1440,height:540,speed:[400,278],gear:[1040,257],mode:[720,54] } as const;
export const BMW_INSTRUMENT_MODE_STYLES = {
  COMFORT: {speedSize:104,gearSize:76,gearY:257,rpmSize:34,rpmY:355,rpmLabelY:389,modeSize:24,accent:'#8aafc9'},
  SPORT: {speedSize:88,gearSize:62,gearY:185,rpmSize:68,rpmY:292,rpmLabelY:352,modeSize:24,accent:'#ed9365'},
} as const;
const FONT = '"Segoe UI", "Microsoft YaHei", Arial, sans-serif';
const NUMERAL_FONT = '"Segoe UI Light", "Segoe UI", Arial, sans-serif';
const CONTOUR = [[470,425],[300,425],[174,260],[323,92],[470,92]] as const;
const SEGMENT_LENGTHS = CONTOUR.slice(1).map((p,i)=>Math.hypot(p[0]-CONTOUR[i]![0],p[1]-CONTOUR[i]![1]));
const CONTOUR_LENGTH = SEGMENT_LENGTHS.reduce((a,b)=>a+b,0);

/** Faceted opposed gauges, independent BMW artwork over shared display data. */
export class BMW530Instruments extends T.Group {
  public readonly canvas = document.createElement('canvas');
  public readonly texture: T.CanvasTexture;
  private lastKey = '';
  private immediateKey = '';
  private elapsed = Infinity;
  private readonly faceMaterial: T.MeshPhysicalMaterial;
  public constructor(private readonly config: InstrumentClusterConfig, private readonly assets = new VehicleAssetRegistry()) {
    super(); this.name = 'BMW Live Cockpit digital face';
    this.canvas.width = BMW_INSTRUMENT_LAYOUT.width; this.canvas.height = BMW_INSTRUMENT_LAYOUT.height;
    this.texture = new T.CanvasTexture(this.canvas); this.texture.colorSpace = T.SRGBColorSpace; this.texture.anisotropy = 4;
    const black = new T.MeshPhysicalMaterial({color:0x0b1018,roughness:.34,metalness:.12,clearcoat:.25,clearcoatRoughness:.3});
    this.add(rounded('BMW instrument bezel',[.535,.208,.019],[0,0,0],black,.008));
    this.faceMaterial = new T.MeshPhysicalMaterial({color:0x101820,map:this.texture,emissive:0xffffff,emissiveMap:this.texture,
      emissiveIntensity:1,roughness:.24,metalness:0,specularIntensity:.25,clearcoat:.16,clearcoatRoughness:.25,envMapIntensity:.08,toneMapped:false});
    const face = mesh('BMW opposed-arc digital display',new T.PlaneGeometry(.516,.1935),this.faceMaterial);
    face.position.z = .010; this.add(face);
    this.update({speedKmh:0,rpm:750,gear:'P',driveMode:'NORMAL',fuelLevel:.7,coolantTemperatureC:90});
  }
  public update(t: InstrumentTelemetry,dt=1/60): void {
    this.faceMaterial.emissiveIntensity = t.ignitionOn===false ? 0 : .68 + .32*T.MathUtils.clamp(t.ambientDaylight ?? 1,0,1);
    this.faceMaterial.color.setScalar(t.ignitionOn===false ? 0 : .045);
    this.faceMaterial.envMapIntensity = t.ignitionOn===false ? 0 : .08;
    this.elapsed += Math.max(0,dt);
    const i = t.indicators ?? {};
    const immediate = [t.laneAssist?.version,t.ignitionOn,t.gear,t.driveMode,i.positionLights,i.headlights,i.highBeam,i.frontFogLights,i.rearFogLights,i.fogLights,
      i.leftTurn,i.rightTurn,i.parkingBrake,i.autoHold,i.absWarning,i.tcsActive,i.escActive,i.tcsOff,i.escOff,i.engineWarning,i.cruise].join('|');
    const key = [Math.round(t.speedKmh),Math.round(t.rpm/25),t.driveMode,Math.round((t.fuelLevel??.7)*100),
      Math.round(t.coolantTemperatureC??90),t.engineRunning,t.startStopState?.state,t.cruiseTargetSpeedKmh,t.drivingScene?.version,immediate].join('|');
    if (key === this.lastKey || this.elapsed < .05 && immediate === this.immediateKey) return;
    this.elapsed = 0; this.lastKey = key; this.immediateKey = immediate;
    let c = this.canvas.getContext('2d')!;
    c.imageSmoothingEnabled = true; c.fillStyle = '#030609'; c.fillRect(0,0,1440,540);
    if (t.ignitionOn === false) { this.texture.needsUpdate = true; return; }
    const text = (value:string,x:number,y:number,size:number,color='#dfe7ed',weight=500,align:CanvasTextAlign='center',font=FONT) => {
      c.font = `${weight} ${size}px ${font}`; c.fillStyle = color; c.textAlign = align; c.textBaseline = 'middle'; c.fillText(value,x,y);
    };
    const mode = t.driveMode === 'NORMAL' || !t.driveMode ? 'COMFORT' : t.driveMode;
    const sport = mode==='SPORT', style = BMW_INSTRUMENT_MODE_STYLES[sport?'SPORT':'COMFORT'];
    const accent = mode==='ECO'?'#94baca':style.accent;
    const staticLayer = (key: string, draw: () => void) => {
      const live = c;
      const artwork = this.assets.canvas(`bmw-instrument/${this.config.maximumSpeedKmh}/${this.config.maximumRPM}/${this.config.redlineRPM}/${sport}/${key}`,1440,540,context => {
        c = context; draw(); c = live;
      });
      c = live; c.drawImage(artwork,0,0);
    };
    staticLayer('background', () => {
    const background = c.createLinearGradient(0,0,0,540);
    background.addColorStop(0,sport?'#130e14':'#08111e'); background.addColorStop(.48,sport?'#10121b':'#0a1827'); background.addColorStop(1,'#02050b');
    c.fillStyle = background; c.fillRect(0,0,1440,540);
    const glow = c.createRadialGradient(720,303,12,720,303,280);
    glow.addColorStop(0,sport?'#334051':'#164569'); glow.addColorStop(.42,sport?'#202c3e':'#103651');
    glow.addColorStop(1,'rgba(4,9,16,0)'); c.fillStyle = glow; c.fillRect(475,97,490,353);
    });
    const point = (fraction:number,right:boolean):[number,number] => {
      let distance = T.MathUtils.clamp(fraction,0,1)*CONTOUR_LENGTH, index = 0;
      while(index<3&&distance>SEGMENT_LENGTHS[index]!) { distance-=SEGMENT_LENGTHS[index]!; index++; }
      const f = distance/SEGMENT_LENGTHS[index]!, a = CONTOUR[index]!, b = CONTOUR[index+1]!;
      const x = T.MathUtils.lerp(a[0],b[0],f), y = T.MathUtils.lerp(a[1],b[1],f); return [right?1440-x:x,y];
    };
    const strokeContour = (right:boolean,start:number,end:number,color:string,width:number) => {
      c.strokeStyle = color; c.lineWidth = width; c.lineJoin = 'round'; c.lineCap = 'round'; c.beginPath();
      c.moveTo(...point(start,right)); for (let n=1;n<=56;n++) c.lineTo(...point(T.MathUtils.lerp(start,end,n/56),right)); c.stroke();
    };
    const dial = (right:boolean,maximum:number,value:number) => {
      const mirror = (x:number) => right?1440-x:x;
      staticLayer(`dial/${right}`, () => {
      const polygon = (points:readonly (readonly [number,number])[]) => {
        c.beginPath(); points.forEach(([x,y],index)=>index?c.lineTo(mirror(x),y):c.moveTo(mirror(x),y)); c.closePath();
      };
      const band = c.createLinearGradient(mirror(190),110,mirror(375),425);
      band.addColorStop(0,sport&&right?'#634b50':'#254362'); band.addColorStop(.52,'#13263b'); band.addColorStop(1,'#527184');
      c.fillStyle=band;
      polygon([...CONTOUR,[478,104],[348,104],[209,260],[323,414],[478,414]]);
      // A continuous ribbon has depth without becoming a bright enclosing border.
      c.fill();
      const facet = c.createLinearGradient(mirror(300),105,mirror(458),432);
      facet.addColorStop(0,'#172b46'); facet.addColorStop(.52,sport&&right?'#422938':'#253458');
      facet.addColorStop(.82,sport&&right?'#74413c':'#42415b'); facet.addColorStop(1,sport&&right?'#c18a65':'#77808c');
      c.fillStyle=facet; polygon([[351,115],[414,146],[535,371],[495,417],[329,417],[235,259]]); c.fill();
      const reflection = c.createRadialGradient(mirror(349),389,5,mirror(349),389,116);
      reflection.addColorStop(0,sport&&right?'rgba(241,190,145,.48)':'rgba(177,204,234,.35)');
      reflection.addColorStop(.48,sport&&right?'rgba(177,80,65,.24)':'rgba(135,98,160,.23)'); reflection.addColorStop(1,'rgba(42,37,65,0)');
      c.fillStyle=reflection; polygon([[351,115],[414,146],[535,371],[495,417],[329,417],[235,259]]); c.fill();
      const inset = c.createLinearGradient(mirror(385),160,mirror(477),425);
      inset.addColorStop(0,'rgba(3,9,19,.7)'); inset.addColorStop(.75,'rgba(9,20,33,.7)'); inset.addColorStop(1,'rgba(51,69,91,.35)');
      c.fillStyle=inset; polygon([[415,148],[536,371],[496,417],[413,417],[330,287]]); c.fill();
      c.strokeStyle='rgba(152,188,217,.12)'; c.lineWidth=.8;
      for(let n=1;n<24;n++) {
        const a=point((n-1)/24,right),b=point(n/24,right), d=point((n+1)/24,right), sign=right?-1:1;
        c.beginPath(); c.moveTo(...a); c.lineTo(b[0]+sign*18,b[1]); c.lineTo(...d); c.stroke();
      }
      c.save(); c.shadowColor= sport&&right?'#9e6157':'#86b1d2'; c.shadowBlur=6;
      strokeContour(right,0,1,'#bbcfde',2.3); c.restore();
      });
      strokeContour(right,0,T.MathUtils.clamp(value/maximum,0,1),accent,sport&&right?5:3.5);
      staticLayer(`ticks/${right}`, () => {
      if (right) strokeContour(true,this.config.redlineRPM/this.config.maximumRPM,1,sport?'#d6775c':'#926979',2.5);
      const step = right?1:40, labels:number[] = [];
      for (let number=0;number<=maximum;number+=step) labels.push(number);
      if (labels[labels.length-1] !== maximum) labels.push(maximum);
      for (const number of labels) {
        const [x,y] = point(number/maximum,right), sign = right?-1:1;
        c.strokeStyle = '#bacad7'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x,y); c.lineTo(x+sign*14,y); c.stroke();
        text(String(number),x+sign*37,y<110?y+24:y>414?y-20:y+2,22,'#a5b8c9',400,right?'right':'left');
      }
      });
      const [x,y] = point(T.MathUtils.clamp(value/maximum,0,1),right), sign = right?-1:1;
      c.strokeStyle = '#e9eff3'; c.lineWidth = 3; c.beginPath(); c.moveTo(x+sign*3,y); c.lineTo(x+sign*22,y); c.stroke();
    };
    dial(false,this.config.maximumSpeedKmh,Math.abs(t.speedKmh)); dial(true,this.config.maximumRPM/1000,Math.max(0,t.rpm)/1000);
    text(String(Math.round(Math.abs(t.speedKmh))),400,278,style.speedSize,'#e6edf3',300,'center',NUMERAL_FONT);
    text('km/h',400,343,24,'#9aaebc',400);
    const gear = typeof t.gear === 'number' ? t.gear>0?'D'+t.gear:t.gear<0?'R':'N' : t.gear;
    text(String(gear),1040,style.gearY,style.gearSize,sport?'#deb296':'#e6edf3',300,'center',NUMERAL_FONT);
    text(String(Math.round(t.rpm/50)*50),1040,style.rpmY,style.rpmSize,sport?'#e4e8ed':'#b9c9d4',300,'center',NUMERAL_FONT);
    text('rpm',1040,style.rpmLabelY,20,sport?'#ca987f':'#7e929f',400);
    text(mode,720,54,style.modeSize,accent,500);
    // Actual current-lane data only; absent data leaves the status illustration alone.
    const scene = t.drivingScene;
    const drivingView = bmwDrivingView(gear);
    if (drivingView) drawBMWDrivingScene(c,scene);
    else drawBMWVehicleSilhouette(c,720,300,1.10);
    if (scene?.proximity.active) {
      const anchors = drivingView ? [[-1,2.65],[0,2.8],[1,2.65],[1.2,0],[1,-2.65],[0,-2.8],[-1,-2.65],[-1.2,0]]
        .map(([x,z])=>projectBMWDrivingPoint(x!,z!,.05))
        : [[664,210],[720,202],[776,210],[780,300],[776,397],[720,405],[664,397],[660,300]];
      scene.proximity.zones.forEach((zone,index)=>{
        if(zone.distanceM===null) return; const [x,y]=anchors[index]!;
        c.strokeStyle = PROXIMITY_COLORS[zone.severity]; c.lineWidth = 4; c.beginPath();
        c.ellipse(x!,y!,index===3||index===7?4:16,index===3||index===7?24:4,0,0,Math.PI*2); c.stroke();
      });
    }
    c.strokeStyle = '#24323e'; c.lineWidth = 1; c.beginPath(); c.moveTo(170,462); c.lineTo(493,462); c.moveTo(947,462); c.lineTo(1270,462); c.stroke();
    const fuel = T.MathUtils.clamp(t.fuelLevel??.7,0,1);
    drawBMWStatusSymbol(c,'fuel',183,498,fuel<.1?'#d1ad68':'#94a7b4');
    text(Math.round(fuel*100)+' %',209,498,23,'#94a7b4',400,'left');
    c.fillStyle = '#243441'; c.fillRect(326,494,153,4); c.fillStyle = fuel<.1?'#d1ad68':accent; c.fillRect(326,494,153*fuel,4);
    drawBMWStatusSymbol(c,'temperature',1168,498,'#94a7b4');
    text(Math.round(t.coolantTemperatureC??90)+' °C',1269,498,23,'#94a7b4',400,'right');
    const arrow = (active:boolean|undefined,x:number,direction:number) => {
      if(!active) return; c.save(); c.translate(x,55); c.scale(direction,1); c.fillStyle = '#70d69f';
      c.beginPath(); c.moveTo(-20,0); c.lineTo(-3,-12); c.lineTo(-3,-5); c.lineTo(17,-5);
      c.lineTo(17,5); c.lineTo(-3,5); c.lineTo(-3,12); c.closePath(); c.fill(); c.restore();
    };
    arrow(i.leftTurn,528,1); arrow(i.rightTurn,912,-1); drawBMWLightingSymbols(c,i);
    drawBMWWarningSymbols(c,i,t.engineRunning===false&&t.startStopState?.state!=='AUTO_STOPPED');
    if(i.autoHold) text('HOLD',720,498,22,'#70d69f');
    if(i.cruise) {
      drawBMWStatusSymbol(c,'cruise',685,104,'#70d69f');
      text(String(Math.round(t.cruiseTargetSpeedKmh??0)),713,104,24,'#70d69f',400,'left',NUMERAL_FONT);
      text('km/h',763,104,17,'#94a7b4',400,'left');
    }
    if(t.startStopState?.state==='AUTO_STOPPED') text('AUTO STOP',1040,432,21,'#9cbfac');
    drawLaneAssistSelection(c,t.laneAssist,'bmw',720,441);
    this.texture.needsUpdate = true;
  }
}

export const bmwDrivingView = (gear: InstrumentTelemetry['gear']): boolean =>
  typeof gear === 'number' ? gear >= 0 : /^[ND]/i.test(gear.trim());

/** Metre-based perspective shared by lanes, obstacle footprints and the ego car. */
export function projectBMWDrivingPoint(x: number, forward: number, height = 0): [number,number] {
  const f = Math.max(-4,forward), scale = 46/(1+f/12);
  return [720+x*scale,390-210*f/(f+12)-height*scale];
}

function drawBMWDrivingScene(c: CanvasRenderingContext2D, scene: InstrumentTelemetry['drivingScene']): void {
  // Like the executive/SUV faces, keep a dim unmarked surface when lane data is absent.
  const surface = c.createLinearGradient(0,150,0,449);
  surface.addColorStop(0,'rgba(90,117,143,0)'); surface.addColorStop(1,'rgba(90,117,143,.12)');
  c.fillStyle=surface; c.beginPath();
  [[-2.5,-2.8],[-2.5,55],[2.5,55],[2.5,-2.8]].forEach(([x,f],index)=>{
    const p=projectBMWDrivingPoint(x!,f!); if(index) c.lineTo(...p); else c.moveTo(...p);
  }); c.closePath(); c.fill();
  if (scene && (scene.lanes.length || scene.obstacles.length)) {
    c.save(); c.beginPath(); c.rect(558,112,324,337); c.clip();
    scene.lanes.forEach((line,index)=>{
      const dashed = scene.laneMarkings?.[index]==='dashed';
      for(let j=1;j<line.length;j++) {
        const a=line[j-1]!,b=line[j]!;
        if(a.forward<0&&b.forward<0) continue;
        const length=Math.hypot(b.x-a.x,b.forward-a.forward), parts=dashed?Math.min(128,Math.max(1,Math.ceil(length/.75))):1;
        for(let n=0;n<parts;n++) {
          const t0=n/parts,t1=(n+1)/parts, f=T.MathUtils.lerp(a.forward,b.forward,(t0+t1)/2);
          // Cut dashed markings in metres, so their spacing recedes with the road.
          const d=T.MathUtils.lerp(a.distanceAlong??a.forward,b.distanceAlong??b.forward,(t0+t1)/2);
          if(f<0 || dashed&&((d%9+9)%9)>=3.5) continue;
          const near=1/(1+Math.max(0,f)/13);
          c.strokeStyle=lateralBoundaryColor(scene.lateralAssist,index,`rgba(159,185,206,${.18+near*.5})`); c.lineWidth=.7+near*1.7;
          c.beginPath(); c.moveTo(...projectBMWDrivingPoint(T.MathUtils.lerp(a.x,b.x,t0),T.MathUtils.lerp(a.forward,b.forward,t0)));
          c.lineTo(...projectBMWDrivingPoint(T.MathUtils.lerp(a.x,b.x,t1),T.MathUtils.lerp(a.forward,b.forward,t1))); c.stroke();
        }
      }
    });
    for(const object of scene.obstacles) {
      if(object.forward<0) continue;
      c.strokeStyle='#91a1ab'; c.lineWidth=1.2; c.beginPath();
      [[-1,-1],[-1,1],[1,1],[1,-1]].forEach(([x,z],index)=>{
        const p=projectBMWDrivingPoint(object.x+x!*object.width/2,object.forward+z!*object.length/2);
        if(index) c.lineTo(...p); else c.moveTo(...p);
      }); c.closePath(); c.stroke();
    }
    c.restore();
  }
  drawBMWDrivingVehicle(c);
}

/** Elevated rear view: roof, rear glass, trunk and rear fascia share the road projection. */
function drawBMWDrivingVehicle(c: CanvasRenderingContext2D): void {
  type Point = readonly [number,number,number];
  const face = (points:readonly Point[],color:string|CanvasGradient,outline=false) => {
    c.fillStyle=color; c.beginPath(); points.forEach(([x,f,h],index)=>{
      const p=projectBMWDrivingPoint(x,f,h); if(index) c.lineTo(...p); else c.moveTo(...p);
    }); c.closePath(); c.fill(); if(outline) c.stroke();
  };
  c.save(); c.lineJoin='round'; c.lineWidth=1; c.strokeStyle='#6c8394';
  face([[-1.08,-2.65,0],[-.98,2.55,0],[.98,2.55,0],[1.08,-2.65,0]],'rgba(2,7,12,.45)');
  for(const side of [-1,1]) for(const f of [-1.6,1.55])
    face([[side*.94,f-.36,.05],[side*.94,f+.36,.05],[side*.94,f+.36,.57],[side*.94,f-.36,.57]],'#081018');
  const paint=c.createLinearGradient(665,330,775,420);
  paint.addColorStop(0,'#3e566a'); paint.addColorStop(.45,'#7b8e9e'); paint.addColorStop(1,'#293e4e');
  for(const side of [-1,1]) face([[side*.89,2.35,.85],[side*.95,-2.4,.84],
    [side*.95,-2.4,.28],[side*.89,2.35,.25]],side<0?'#243948':'#3a5060',true);
  face([[-.89,2.35,.85],[.89,2.35,.85],[.95,-2.4,.84],[-.95,-2.4,.84]],paint,true);
  for(const side of [-1,1]) face([[side*.89,1.3,.88],[side*.67,.65,1.43],
    [side*.73,-.5,1.46],[side*.8,-1.35,1.04],[side*.93,-1.6,.88]],'#344c5f',true);
  face([[-.67,.65,1.43],[.67,.65,1.43],[.73,-.5,1.46],[-.73,-.5,1.46]],paint,true);
  const glass=c.createLinearGradient(0,335,0,380);
  glass.addColorStop(0,'#344e64'); glass.addColorStop(.45,'#142a3b'); glass.addColorStop(1,'#0b1c2a');
  face([[-.68,-.55,1.42],[.68,-.55,1.42],[.75,-1.32,1.06],[-.75,-1.32,1.06]],glass,true);
  const rear=c.createLinearGradient(0,390,0,429);
  rear.addColorStop(0,'#637b8d'); rear.addColorStop(.35,'#425e73'); rear.addColorStop(1,'#172d3d');
  face([[-.95,-2.4,.84],[.95,-2.4,.84],[.92,-2.47,.28],[-.92,-2.47,.28]],rear,true);
  face([[-.88,-2.48,.3],[.88,-2.48,.3],[.85,-2.5,.19],[-.85,-2.5,.19]],'#0c1b25');
  face([[-.24,-2.49,.53],[.24,-2.49,.53],[.24,-2.5,.38],[-.24,-2.5,.38]],'#152431');
  for(const side of [-1,1]) {
    c.strokeStyle='#a06b70'; c.lineWidth=2;
    c.beginPath(); c.moveTo(...projectBMWDrivingPoint(side*.84,-2.44,.77));
    c.lineTo(...projectBMWDrivingPoint(side*.48,-2.46,.75)); c.stroke();
  }
  c.restore();
}
/** Standard lamp pictograms: green position/dipped/front fog, blue main,
 * amber rear fog. Line direction and the fog separator carry the meaning. */
export function drawBMWLightingSymbols(c: CanvasRenderingContext2D, i: NonNullable<InstrumentTelemetry['indicators']>): void {
  const headlamp = (y: number, color: string, dipped: boolean, fog = false, rear = false) => {
    c.save(); c.translate(88, y); c.scale(.75,.75); if (rear) c.scale(-1, 1);
    c.strokeStyle = color; c.lineWidth = 3.5; c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath(); c.moveTo(3, -13); c.lineTo(3, 13);
    c.bezierCurveTo(31, 14, 31, -14, 3, -13); c.stroke();
    for (let ray = 0; ray < 4; ray++) {
      const py = -12 + ray * 8;
      c.beginPath(); c.moveTo(-7, py); c.lineTo(-33, py + (dipped ? 8 : 0)); c.stroke();
    }
    if (fog) {
      c.lineWidth = 3; c.beginPath(); c.moveTo(-19, -21);
      c.bezierCurveTo(-28, -13, -10, -7, -19, 0); c.bezierCurveTo(-28, 7, -10, 13, -19, 21); c.stroke();
    }
    c.restore();
  };
  if (i.positionLights) {
    c.save(); c.translate(88, 185); c.scale(.75,.75); c.strokeStyle = '#70d69f';
    c.lineWidth = 2.7; c.lineCap = 'round'; c.lineJoin = 'round';
    for (const sign of [-1, 1]) {
      // Two opposed lenses with clear gaps before the short outward light rays.
      c.beginPath(); c.moveTo(sign * 7, -11); c.lineTo(sign * 7, 11);
      c.bezierCurveTo(sign * 22, 11, sign * 22, -11, sign * 7, -11); c.stroke();
      for (let ray = 0; ray < 3; ray++) {
        const py = (ray - 1) * 9; c.beginPath(); c.moveTo(sign * 24, py); c.lineTo(sign * 34, py); c.stroke();
      }
    }
    c.restore();
  }
  if (i.headlights) headlamp(234, '#70d69f', true);
  if (i.highBeam) headlamp(281, '#58aaff', false);
  if (i.frontFogLights ?? i.fogLights) headlamp(328, '#70d69f', true, true);
  if (i.rearFogLights ?? i.fogLights) headlamp(375, '#e1b05f', false, true, true);
}

/** Small instrument pictograms; numeric readings remain live telemetry. */
function drawBMWStatusSymbol(c: CanvasRenderingContext2D, kind:'fuel'|'temperature'|'cruise', x:number, y:number, color:string): void {
  c.save(); c.translate(x,y); c.strokeStyle=color; c.fillStyle=color;
  c.lineWidth=2; c.lineCap='round'; c.lineJoin='round';
  if(kind==='fuel') {
    c.beginPath(); c.roundRect(-10,-14,17,27,2); c.stroke();
    c.beginPath(); c.rect(-7,-10,11,8); c.stroke();
    c.beginPath(); c.moveTo(-13,14); c.lineTo(10,14); c.moveTo(7,-3); c.lineTo(10,-3);
    c.quadraticCurveTo(13,-3,13,1); c.lineTo(13,7); c.quadraticCurveTo(13,12,17,12);
    c.quadraticCurveTo(21,12,21,7); c.lineTo(21,-7); c.lineTo(15,-13);
    c.moveTo(17,-11); c.lineTo(17,-6); c.lineTo(21,-4); c.stroke();
  } else if(kind==='temperature') {
    c.beginPath(); c.moveTo(-4,2); c.lineTo(-4,-12); c.quadraticCurveTo(0,-18,4,-12);
    c.lineTo(4,2); c.arc(0,6,5.7,-Math.PI/4,Math.PI*1.25); c.closePath(); c.stroke();
    c.beginPath(); c.moveTo(0,-8); c.lineTo(0,6); c.moveTo(5,-9); c.lineTo(10,-9);
    c.moveTo(5,-4); c.lineTo(9,-4); c.stroke();
    c.beginPath(); c.arc(0,6,2.5,0,Math.PI*2); c.fill();
    for(const row of [15,21]) {
      c.beginPath(); c.moveTo(-16,row);
      for(let n=0;n<4;n++) c.quadraticCurveTo(-12+n*8,row+(n%2===0?-3:3),-8+n*8,row);
      c.stroke();
    }
  } else {
    c.beginPath(); c.arc(0,3,15,Math.PI*.82,Math.PI*2.18); c.stroke();
    for(const angle of [Math.PI*1.05,Math.PI*1.35,Math.PI*1.65,Math.PI*1.95]) {
      c.beginPath(); c.moveTo(Math.cos(angle)*11,3+Math.sin(angle)*11);
      c.lineTo(Math.cos(angle)*14,3+Math.sin(angle)*14); c.stroke();
    }
    c.beginPath(); c.moveTo(-2,6); c.lineTo(8,-5); c.stroke();
    c.beginPath(); c.arc(-2,6,2,0,Math.PI*2); c.fill();
    // Cruise's speed-hold arrow distinguishes this from a generic speedometer.
    c.beginPath(); c.moveTo(-9,17); c.lineTo(9,17); c.moveTo(5,13); c.lineTo(9,17); c.lineTo(5,21); c.stroke();
  }
  c.restore();
}

/** Small conventional warning lamps. Never display a fault that telemetry does not report. */
function drawBMWWarningSymbols(c: CanvasRenderingContext2D, i: NonNullable<InstrumentTelemetry['indicators']>, engineStopped: boolean): void {
  const brake = (x:number,y:number,label:string,color:string) => {
    c.save(); c.translate(x,y); c.strokeStyle=color; c.fillStyle=color; c.lineWidth=2.2;
    c.beginPath(); c.arc(0,0,15,0,Math.PI*2); c.stroke();
    for (const sign of [-1,1]) { c.beginPath(); c.moveTo(sign*21,-17); c.quadraticCurveTo(sign*31,0,sign*21,17); c.stroke(); }
    c.font=`500 ${label==='ABS'?12:21}px ${FONT}`; c.textAlign='center'; c.textBaseline='middle'; c.fillText(label,0,1); c.restore();
  };
  if(i.parkingBrake) brake(88,433,'P','#e2787c');
  if(i.absWarning) brake(1350,205,'ABS','#d5ae67');
  if(i.tcsActive||i.escActive||i.tcsOff||i.escOff) {
    c.save(); c.translate(1350,261); c.strokeStyle='#d5ae67'; c.lineWidth=2.3;
    c.beginPath(); c.moveTo(-19,5); c.lineTo(-16,-9); c.lineTo(-9,-18); c.lineTo(9,-18); c.lineTo(16,-9); c.lineTo(19,5); c.closePath(); c.stroke();
    for(const x of [-12,12]) { c.beginPath(); c.moveTo(x,12); c.bezierCurveTo(x-10,18,x+11,23,x,31); c.stroke(); }
    if(i.tcsOff||i.escOff) { c.fillStyle='#d5ae67'; c.font=`500 14px ${FONT}`; c.textAlign='center'; c.fillText('OFF',0,50); }
    c.restore();
  }
  if(i.engineWarning||engineStopped) {
    c.save(); c.translate(1350,347); c.strokeStyle='#d5ae67'; c.lineWidth=2.3;
    c.beginPath(); c.moveTo(-22,-7); c.lineTo(-12,-7); c.lineTo(-8,-14); c.lineTo(11,-14); c.lineTo(17,-6);
    c.lineTo(24,-6); c.lineTo(24,13); c.lineTo(17,13); c.lineTo(12,18); c.lineTo(-15,18); c.lineTo(-22,9); c.closePath(); c.stroke();
    c.beginPath(); c.moveTo(-5,-21); c.lineTo(8,-21); c.moveTo(1,-21); c.lineTo(1,-14);
    c.moveTo(-28,-4); c.lineTo(-28,9); c.moveTo(-28,2); c.lineTo(-22,2); c.stroke(); c.restore();
  }
}


/** One restrained saloon illustration shared by the two BMW screens. */
export function drawBMWVehicleSilhouette(c: CanvasRenderingContext2D, x: number, y: number, scale = 1): void {
  c.save(); c.translate(x,y); c.scale(scale,scale); c.strokeStyle = '#81919c'; c.lineWidth = 1.5;
    for (const side of [-1,1]) for (const y of [-49,45]) {
      c.fillStyle = '#091017'; c.beginPath(); c.roundRect(side<0?-47:38,y-13,9,28,3); c.fill();
    }
    const paint = c.createLinearGradient(-40,0,40,0); paint.addColorStop(0,'#293945'); paint.addColorStop(.45,'#485964'); paint.addColorStop(1,'#233540');
    c.fillStyle = paint; c.beginPath(); c.moveTo(-26,-83); c.bezierCurveTo(-38,-81,-42,-67,-42,-48);
    c.lineTo(-43,53); c.bezierCurveTo(-42,80,-30,88,0,88); c.bezierCurveTo(30,88,42,80,43,53);
    c.lineTo(42,-48); c.bezierCurveTo(42,-67,38,-81,26,-83); c.quadraticCurveTo(0,-88,-26,-83); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#0d1921'; c.beginPath(); c.moveTo(-31,-42); c.quadraticCurveTo(0,-56,31,-42);
    c.lineTo(27,-12); c.lineTo(-27,-12); c.closePath(); c.fill();
    c.fillStyle = '#18262f'; c.beginPath(); c.roundRect(-26,-9,52,57,8); c.fill();
    c.fillStyle = '#0d1921'; c.beginPath(); c.moveTo(-27,50); c.lineTo(27,50); c.lineTo(32,69); c.quadraticCurveTo(0,78,-32,69); c.closePath(); c.fill();
    c.strokeStyle = '#617681'; c.beginPath(); c.moveTo(-31,-60); c.quadraticCurveTo(0,-67,31,-60); c.stroke();
    c.strokeStyle = '#a0afb7'; c.lineWidth = 2; c.beginPath(); c.moveTo(-31,-72); c.lineTo(-19,-76); c.moveTo(31,-72); c.lineTo(19,-76); c.stroke();
    c.strokeStyle = '#903f43'; c.beginPath(); c.moveTo(-30,79); c.lineTo(-16,82); c.moveTo(30,79); c.lineTo(16,82); c.stroke(); c.restore();
}
