/** Independently drawn geometric instrument numerals, not a modified font asset.
 * A broad rounded rectangle zero matches the photographed cluster's display character.
 * Fixed-width cells keep a changing speed centred without text reflow. */
const outlines=[
  'M18 0H54Q72 0 72 18V82Q72 100 54 100H18Q0 100 0 82V18Q0 0 18 0Z',
  'M20 17L37 0V100',
  'M0 20Q0 0 20 0H52Q72 0 72 20V30Q72 42 60 49L11 81Q0 88 0 100H72',
  'M0 0H50Q72 0 72 22V28Q72 50 50 50H20M50 50Q72 50 72 72V78Q72 100 50 100H0',
  'M57 100V0L0 68H72',
  'M72 0H0V48H50Q72 48 72 70V78Q72 100 50 100H0',
  'M69 0H23Q0 0 0 24V78Q0 100 23 100H49Q72 100 72 78V70Q72 48 49 48H0',
  'M0 0H72L23 100',
  'M20 0H52Q72 0 72 20V27Q72 49 51 49H21Q0 49 0 27V20Q0 0 20 0ZM21 49Q0 49 0 72V78Q0 100 21 100H51Q72 100 72 78V72Q72 49 51 49',
  'M3 100H49Q72 100 72 76V22Q72 0 49 0H23Q0 0 0 22V30Q0 52 23 52H72',
  'M0 100V0H48Q72 0 72 24V29Q72 54 48 54H0',
];
let paths:Path2D[]|undefined;
export const SU7_PRIMARY_READOUT_HEIGHT=138;

/** Photographed SPORT speed tapes. Both rulers scroll against actual km/h;
 * they are not a tachometer, power gauge or fabricated attitude indicator. */
export function drawSU7SportTheme(c:CanvasRenderingContext2D,speedKmh:number,blend:number,parked:boolean):void {
  if(blend<=0)return;
  c.save();c.globalAlpha=blend;
  const glow=c.createRadialGradient(480,280,0,480,280,245);
  glow.addColorStop(0,'#641923');glow.addColorStop(1,'#03080c');c.fillStyle=glow;c.fillRect(0,47,960,233);
  const span=parked?114+65*blend:180;
  c.strokeStyle='#bac0c6';c.lineWidth=2.6;c.beginPath();
  c.moveTo(480-span+15,55);c.quadraticCurveTo(480-span-23,139,480-span+15,222);
  c.moveTo(480+span-15,55);c.quadraticCurveTo(480+span+23,139,480+span-15,222);c.stroke();
  if(!parked){
    const speed=Math.abs(speedKmh);
    c.beginPath();c.rect(250,139-77*blend,460,154*blend);c.clip();
    c.font='18px "SU7 MiSans Latin",sans-serif';c.textBaseline='middle';
    for(const side of [-1,1]){
      const x=480+side*(169+(1-blend)*24);
      c.strokeStyle='#82909a';c.lineWidth=1.5;c.beginPath();
      for(let mark=Math.max(0,Math.floor(speed)-13);mark<=speed+13;mark++){
        const y=139-(mark-speed)*6,major=mark%10===0,half=mark%5===0;
        c.moveTo(x,y);c.lineTo(x+side*(major?13:half?10:6),y);
      }c.stroke();
      c.fillStyle='#9ba6ae';c.textAlign=side<0?'right':'left';
      for(let mark=Math.max(0,Math.floor((speed-13)/10)*10);mark<=speed+13;mark+=10)
        c.fillText(String(mark),x+side*17,139-(mark-speed)*6);
      c.strokeStyle='#e85e66';c.lineWidth=3;c.beginPath();c.moveTo(x+side*4,139);c.lineTo(x+side*31,139);c.stroke();
    }
  }
  c.restore();
}

export function drawSU7PrimaryReadout(c:CanvasRenderingContext2D,value:string,x:number,y:number):void {
  paths??=outlines.map(path=>new Path2D(path));
  const scale=SU7_PRIMARY_READOUT_HEIGHT/108,advance=86,width=(value.length-1)*advance+72;
  c.save();c.translate(x-width*scale/2,y-50*scale);c.scale(scale,scale);
  c.strokeStyle='#eff3f4';c.lineWidth=6.5;c.lineJoin='round';c.lineCap='round';
  for(let i=0;i<value.length;i++){
    c.save();c.translate(i*advance,0);c.stroke(paths[value[i]==='P'?10:Number(value[i])]!);c.restore();
  }
  c.restore();
}
