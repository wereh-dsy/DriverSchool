import * as T from 'three';

type P = readonly [number, number, number];
interface Face { points: P[]; color: string; edge?: string; finish: 'paint' | 'glass' | 'plain'; detail: boolean }
const iconCamera = new T.PerspectiveCamera(29, 1, .1, 80);
iconCamera.position.set(.14, 1.95, 8.7); iconCamera.lookAt(0, .65, 0); iconCamera.updateMatrixWorld(true);
const anchors: P[]=[[-1.05,0,2.735],[1.05,0,2.735],[-.72,1.51,-.4],[.72,1.51,-.4],[-.85,1,-2.735],[.85,1,-2.735]];
const bounds=anchors.map(p=>new T.Vector3(...p).project(iconCamera));
const minX=Math.min(...bounds.map(p=>p.x)),maxX=Math.max(...bounds.map(p=>p.x));
const minY=Math.min(...bounds.map(p=>p.y)),maxY=Math.max(...bounds.map(p=>p.y));
const scale=Math.min(235/(maxX-minX),250/(maxY-minY));
const px=(p:T.Vector3)=>160+(p.x-(minX+maxX)/2)*scale;
const py=(p:T.Vector3)=>158-(p.y-(minY+maxY)/2)*scale;

/** Two immutable canvas sprites, projected from one Z223-sized envelope.
 * The rear-facing camera, body, glass, tyres and open door all share the same
 * perspective instead of mixing a top-view roof with a flat rear silhouette. */
export class MaybachS680InstrumentCar {
  private readonly closed = this.render(false);
  private readonly open = this.render(true);
  private readonly lanePoint = new T.Vector3();

  public drawLanes(c: CanvasRenderingContext2D, x: number, y: number, size: number,
    lanes: readonly (readonly {x: number; forward: number}[])[]): void {
    c.strokeStyle='#665f51';c.lineWidth=1.3;
    for(const lane of lanes){c.beginPath();lane.forEach((point,n)=>{
      this.lanePoint.set(point.x,.02,-point.forward).project(iconCamera);
      const sx=x+(px(this.lanePoint)-160)*size/320,sy=y+(py(this.lanePoint)-160)*size/320;
      if(n)c.lineTo(sx,sy);else c.moveTo(sx,sy);
    });c.stroke();}
  }

  public draw(c: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, doorOpen: boolean): void {
    c.drawImage(doorOpen ? this.open : this.closed, x - width / 2, y - height / 2, width, height);
  }

  private render(doorOpen: boolean): HTMLCanvasElement {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 320;
    const c = canvas.getContext('2d')!;
    const camera = iconCamera;
    const project = (p: P) => new T.Vector3(...p).project(camera);
    const faces: Face[] = [];
    const add = (points: readonly P[], color: string, edge?: string, finish: Face['finish']='paint', detail=false) => faces.push({points: [...points], color, edge, finish, detail});
    const stations: readonly P[] = [[-2.7345,.82,.92],[-2.3,.935,.97],[-1.698,.9605,1.00],
      [-1.04,.957,1.005],[.26,.956,1.006],[1.698,.958,1.014],[2.15,.93,.99],[2.7345,.81,.907]];
    const bottom = (z: number) => {
      const distance = Math.min(Math.abs(z + 1.698), Math.abs(z - 1.698));
      return distance < .414 ? Math.max(.245, .369 + Math.sqrt(.414 ** 2 - distance ** 2)) : .245;
    };
    const turnDoor = ([x,y,z]: P): P => {
      const angle = -66 * Math.PI / 180, dx=x+.861, dz=z+1.04;
      return [-.861+dx*Math.cos(angle)+dz*Math.sin(angle),y,-1.04-dx*Math.sin(angle)+dz*Math.cos(angle)];
    };
    for (const side of [-1,1]) {
      for (const axle of [-1.698,1.698]) {
        const ring = (radius: number): P[] => Array.from({length: 40}, (_, n) => {
          const a=n/40*Math.PI*2; return [side*.975,.369+Math.sin(a)*radius,axle+Math.cos(a)*radius];
        });
        add(ring(.369),'#0a0d12','#272c33','plain'); add(ring(.245),'#737b82','#b7b9b7'); add(ring(.07),'#30373e');
      }
      for (let n=0;n<stations.length-1;n++) {
        const a=stations[n]!,b=stations[n+1]!,moving=side<0&&a[0]===-1.04&&doorOpen;
        for (let step=0;step<8;step++) {
          const q=step/8,r=(step+1)/8,z0=T.MathUtils.lerp(a[0],b[0],q),z1=T.MathUtils.lerp(a[0],b[0],r);
          const w0=T.MathUtils.lerp(a[1],b[1],q),w1=T.MathUtils.lerp(a[1],b[1],r);
          const y0=T.MathUtils.lerp(a[2],b[2],q),y1=T.MathUtils.lerp(a[2],b[2],r);
          const lower:P[]=[[side*w0,bottom(z0),z0],[side*w1,bottom(z1),z1],[side*w1,.862,z1],[side*w0,.862,z0]];
          const upper:P[]=[[side*w0,.862,z0],[side*w1,.862,z1],[side*(w1-.095),y1,z1],[side*(w0-.095),y0,z0]];
          add(moving?lower.map(turnDoor):lower,side<0?'#171d26':'#262d37');
          add(moving?upper.map(turnDoor):upper,side<0?'#8f949b':'#b4b6b8');
        }
      }
      for (const rear of [false,true]) {
        const pane:P[]=rear?[[side*.857,1.005,.34],[side*.84,1.005,1.49],[side*.724,1.448,1.23],[side*.729,1.476,.34]]:
          [[side*.856,.995,-1.04],[side*.857,.995,.26],[side*.729,1.476,.26],[side*.725,1.458,-.39]];
        const moved=doorOpen&&side<0&&!rear;
        add(moved?pane.map(turnDoor):pane,'#182632','#7f858a','glass');
      }
    }
    add([[-.725,1.458,-.39],[.725,1.458,-.39],[.720,1.466,1.35],[-.720,1.466,1.35]],'#b1b3b4','#d0cfca');
    add([[-.720,1.448,1.35],[.720,1.448,1.35],[.813,1.01,2.01],[-.813,1.01,2.01]],'#263542','#879098','glass');
    add([[-.813,1.01,2.01],[.813,1.01,2.01],[.81,.907,2.7345],[-.81,.907,2.7345]],'#a2a6ab','#bbbdbb');
    const rearPoint=(q:number,y:number):P=>[q*(.80+.065*Math.sin((y-.265)/.642*Math.PI)),y,2.7345-.16*Math.abs(q)**4];
    for(let n=0;n<32;n++)for(const [y0,y1]of [[.265,.31],[.31,.405],[.405,.66],[.66,.862],[.862,.907]] as const){
      const q=n/16-1,r=(n+1)/16-1;
      add([rearPoint(q,y0),rearPoint(r,y0),rearPoint(r,y1),rearPoint(q,y1)],y0>=.862?'#979da3':'#242c36');
    }
    for (const side of [-1,1]) {
      const z=(x:number)=>2.747-.16*(Math.abs(x)/.845)**4;
      add([[side*.17,.884,z(.17)],[side*.56,.924,z(.56)],[side*.80,.922,z(.80)],[side*.77,.833,z(.77)],[side*.55,.861,z(.55)]],'#8d343b','#d68c83','paint',true);
      add([[side*.47,.318,2.746],[side*.73,.318,2.746],[side*.73,.283,2.746],[side*.47,.283,2.746]],'#8c949c',undefined,'paint',true);
    }
    add([[-.16,.575,2.75],[.16,.575,2.75],[.16,.465,2.75],[-.16,.465,2.75]],'#111923','#636b73','plain',true);
    add([[-.72,.405,2.75],[.72,.405,2.75],[.72,.393,2.75],[-.72,.393,2.75]],'#99a1a8',undefined,'paint',true);
    c.fillStyle='rgba(0,0,0,.30)';c.beginPath();
    for(let n=0;n<=40;n++){
      const a=n/40*Math.PI*2,p=project([Math.cos(a)*1.02,.005,Math.sin(a)*2.55]);
      if(n)c.lineTo(px(p),py(p));else c.moveTo(px(p),py(p));
    }c.closePath();c.fill();
    faces.sort((a,b)=>{
      if(a.detail!==b.detail)return a.detail?1:-1;
      const depth=(f:Face)=>f.points.reduce((sum,p)=>sum+new T.Vector3(...p).applyMatrix4(camera.matrixWorldInverse).z,0)/f.points.length;
      return depth(a)-depth(b);
    });
    for(const face of faces){
      c.beginPath();face.points.forEach((p,n)=>{const v=project(p);if(n)c.lineTo(px(v),py(v));else c.moveTo(px(v),py(v));});c.closePath();
      if(face.finish==='plain')c.fillStyle=face.color;
      else{
        const gradient=c.createLinearGradient(100,50,190,290),base=new T.Color(face.color);
        const shade=(amount:number)=>'#'+base.clone().lerp(new T.Color(amount>0?0xffffff:0x000000),Math.abs(amount)).getHexString();
        gradient.addColorStop(0,shade(face.finish==='glass'?.25:.20));gradient.addColorStop(.34,shade(.06));
        gradient.addColorStop(.57,face.color);gradient.addColorStop(1,shade(face.finish==='glass'?-.50:-.35));c.fillStyle=gradient;
      }
      c.fill();
      // Matching edge colour closes Canvas antialias cracks between adjacent
      // patches; the rounded bumper must not acquire a barcode of seams.
      c.strokeStyle=face.edge??c.fillStyle;c.lineWidth=face.edge ? .8 : .55;c.stroke();
    }
    // Subtle bonnet/roof highlight and rear badge use that same projection.
    const badge=project([0,.735,2.755]);c.strokeStyle='#c0c3c3';c.lineWidth=1;c.beginPath();c.arc(px(badge),py(badge),3,0,Math.PI*2);c.stroke();
    if(doorOpen){
      c.strokeStyle='#d3927e';c.lineWidth=1.8;c.beginPath();
      const edge: readonly P[]=[[-.86,.99,.26],[-.96,.27,.26],[-.96,.27,-1.04],[-.86,.99,-1.04]];
      edge.forEach((p,n)=>{
        const v=project(turnDoor(p));if(n)c.lineTo(px(v),py(v));else c.moveTo(px(v),py(v));
      });c.stroke();
    }
    return canvas;
  }
}
