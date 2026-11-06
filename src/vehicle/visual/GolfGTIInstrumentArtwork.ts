import type { InstrumentClusterConfig } from './InstrumentCluster';

export const GTI_DIAL_FONT='"Arial Narrow", "Segoe UI", "Microsoft YaHei", sans-serif';
export const GTI_SPEED_MARKS=[0,20,40,60,80,100,130,160,200,240,280] as const;
/** The classic VW dial expands the useful road-speed range. Needle and printed scale share it. */
export function gtiSpeedFraction(speed:number,maximum:number):number {
  const value=Math.max(0,Math.min(280,speed/maximum*280));
  const i=GTI_SPEED_MARKS.findIndex(v=>v>=value);
  if(i<=0)return i===0?0:1;
  return (i-1+(value-GTI_SPEED_MARKS[i-1]!)/(GTI_SPEED_MARKS[i]!-GTI_SPEED_MARKS[i-1]!))/10;
}
export function gtiDialText(c:CanvasRenderingContext2D,s:string,x:number,y:number,size:number,color='#f1f1f2'):void {
  c.font=`500 ${size}px ${GTI_DIAL_FONT}`;c.textAlign='center';c.textBaseline='middle';c.fillStyle=color;c.fillText(s,x,y);
}
/** Cached luminous scale artwork; no 3D ticks or per-frame re-render of the engraved bands. */
export function drawGTIDialArtwork(c:CanvasRenderingContext2D,config:InstrumentClusterConfig):void {
  const bg=c.createLinearGradient(0,0,0,480);bg.addColorStop(0,'#0c0b13');bg.addColorStop(.55,'#030408');bg.addColorStop(1,'#050509');
  c.fillStyle=bg;c.fillRect(0,0,1280,480);
  for(const [x,rpm] of [[248,true],[1032,false]] as const) {
    const maximum=rpm?config.maximumRPM/1000:config.maximumSpeedKmh;
    const labels=rpm?Array.from({length:Math.round(maximum)+1},(_,i)=>i):GTI_SPEED_MARKS.map(v=>v/280*maximum);
    const fraction=(v:number)=>rpm?v/maximum:gtiSpeedFraction(v,maximum);
    const a=(f:number)=>Math.PI*(.77+1.46*f);
    const band=c.createRadialGradient(x,239,147,x,239,183);
    band.addColorStop(0,'#080910');band.addColorStop(.13,'#5c5868');band.addColorStop(.34,'#8a8695');band.addColorStop(.73,'#bbb8c3');band.addColorStop(1,'#d8dae2');
    c.strokeStyle=band;c.lineWidth=25;c.beginPath();c.arc(x,239,169,a(0),a(1));c.stroke();
    // Light separated radial segments reproduce the soft lit LCD scale without a chrome bezel.
    const count=(labels.length-1)*5;
    for(let i=0;i<=count;i++) {
      const angle=a(i/count),major=i%5===0,red=rpm&&i/count*maximum>=config.redlineRPM/1000;
      const ray=(inner:number,outer:number)=>{c.beginPath();c.moveTo(x+Math.cos(angle)*inner,239+Math.sin(angle)*inner);c.lineTo(x+Math.cos(angle)*outer,239+Math.sin(angle)*outer);c.stroke();};
      c.strokeStyle='rgba(20,16,29,.55)';c.lineWidth=1;ray(158,181);
      c.strokeStyle=red?'#ed4a56':major?'#ffffff':'#d6d4dc';c.lineWidth=major?2.4:1;ray(major?152:174,181);
    }
    for(const [radius,color,width] of [[183,'#93aabf',1.1],[181,'#f1f0f5',1.4],[155,'#ddd8e6',1],[114,'#302f3b',3]] as const) {
      c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.arc(x,239,radius,radius===114?0:a(0),radius===114?Math.PI*2:a(1));c.stroke();
    }
    labels.forEach(v=>gtiDialText(c,String(Math.round(v)),x+Math.cos(a(fraction(v)))*136,239+Math.sin(a(fraction(v)))*136,rpm?27:24));
    if(rpm) {c.strokeStyle='#df3547';c.lineWidth=4;c.beginPath();c.arc(x,239,158,a(config.redlineRPM/config.maximumRPM),a(1));c.stroke();}
    gtiDialText(c,rpm?'rpm':'km/h',x-136,346,14,'#d1d1d8');if(rpm)gtiDialText(c,'×1000',x-136,362,13,'#b7b8c1');
  }
}

export function drawGTINeedle(c:CanvasRenderingContext2D,x:number,fraction:number):void {
  const a=Math.PI*(.77+1.46*Math.max(0,Math.min(1,fraction)));
  c.save();c.translate(x,239);c.rotate(a);
  c.strokeStyle='rgba(224,242,255,.22)';c.lineWidth=8;c.beginPath();c.moveTo(113,0);c.lineTo(178,0);c.stroke();
  c.fillStyle='#f5f7fa';c.beginPath();c.moveTo(110,-2.3);c.lineTo(181,-1);c.lineTo(181,1);c.lineTo(110,2.3);c.closePath();c.fill();
  c.strokeStyle='#e94c59';c.lineWidth=1;c.beginPath();c.moveTo(122,2.3);c.lineTo(178,1);c.stroke();c.restore();
}

export function drawGTIFuel(c:CanvasRenderingContext2D,x:number,y:number,color='#e0d5b2'):void {
  c.save();c.translate(x,y);c.strokeStyle=color;c.lineWidth=2;c.lineJoin='round';c.beginPath();
  c.rect(-8,-10,12,21);c.rect(-6,-8,8,8);c.moveTo(-10,12);c.lineTo(7,12);c.moveTo(4,-4);c.bezierCurveTo(13,-6,8,11,14,9);c.lineTo(14,-6);c.lineTo(10,-11);c.stroke();c.restore();
}
