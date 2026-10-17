import { BoxGeometry, BufferGeometry, CircleGeometry, Color, CylinderGeometry, Group, InstancedMesh, Matrix4, MeshBasicMaterial, Shape, ShapeGeometry } from 'three';
import type { Subject3Materials } from '../subject3/materials';
import type { TrafficSignalColor, TrafficSignalMovement } from '../navigation/TrafficSignalState';

export interface CitySignalPanel { laneId:string; movement:TrafficSignalMovement; movements?:TrafficSignalMovement[]; circular?:boolean; x:number }
interface Glyph { mesh:InstancedMesh; index:number; panel:number; color:TrafficSignalColor }
export interface CitySignalVisual { root:Group; panels:CitySignalPanel[]; glyphs:Glyph[]; digits:InstancedMesh; lastKey:string }
const BITS=[0x3f,0x06,0x5b,0x4f,0x66,0x6d,0x7d,0x07,0x7f,0x6f];
const BRIGHT={red:0xff4035,amber:0xffbe28,green:0x38ef78},DARK={red:0x100b0b,amber:0x100e09,green:0x09100b};

/** Shared primitives and instanced arrows/seven-segment digits. No CanvasTexture,
 * per-window/per-LED geometry, per-lamp materials, or point lights. */
export class CitySignalVisualResources {
  private readonly box=new BoxGeometry(1,1,1);
  private readonly pole=new CylinderGeometry(1,1,1,8);
  private readonly light=new MeshBasicMaterial({color:0xffffff,toneMapped:false});
  private readonly arrows=new Map<TrafficSignalMovement,BufferGeometry>();
  private readonly circle=new CircleGeometry(.25,24).rotateY(Math.PI);
  private readonly color=new Color();
  constructor() {
    const shape=new Shape();shape.moveTo(-.055,-.18);shape.lineTo(.055,-.18);shape.lineTo(.055,.035);shape.lineTo(.14,.035);shape.lineTo(0,.2);shape.lineTo(-.14,.035);shape.lineTo(-.055,.035);shape.closePath();
    for(const movement of ['straight','left','right'] as const){const geometry=new ShapeGeometry(shape);if(movement!=='straight')geometry.rotateZ(movement==='left'?Math.PI/2:-Math.PI/2);geometry.rotateY(Math.PI);this.arrows.set(movement,geometry);}
  }
  build(index:number,panels:CitySignalPanel[],height:number,groundDrop:number,materials:Subject3Materials):CitySignalVisual {
    const root=new Group();root.name='City lane signals';root.userData.subject3JunctionIndex=index;root.userData.citySignalProfile='lane-countdown';
    const matrices:Matrix4[]=[];
    const box=(w:number,h:number,d:number,x:number,y:number,z:number)=>matrices.push(new Matrix4().makeScale(w,h,d).setPosition(x,y,z));
    const left=Math.min(0,...panels.map(p=>p.x-.52)),right=Math.max(0,...panels.map(p=>p.x+.52));
    box(right-left,.18,.2,(right+left)/2,height+.12,0);
    for(const p of panels) {
      box(.88,2.15,.36,p.x,height-1.02,-.18);box(.88,.66,.24,p.x,height+.61,-.18);
      // The hood belongs ABOVE the complete lens. The previous hood crossed
      // the arrowhead, hiding its direction from normal driver eye height.
      for(let n=0;n<3;n++)box(.92,.06,.5,p.x,height-.02-n*.66,-.25);
    }
    const staticParts=new InstancedMesh(this.box,materials.darkMetal,matrices.length);matrices.forEach((m,i)=>staticParts.setMatrixAt(i,m));staticParts.castShadow=true;root.add(staticParts);
    const poles=new InstancedMesh(this.pole,materials.darkMetal,1);poles.setMatrixAt(0,new Matrix4().makeScale(.13,height+groundDrop+.3,.13).setPosition(0,(height-groundDrop+.3)/2,0));poles.castShadow=true;root.add(poles);
    const glyphs:Glyph[]=[];
    for(const movement of ['straight','left','right','circle'] as const) {
      const selected=panels.map((p,i)=>({p,i})).filter(({p})=>movement==='circle'?p.circular:!p.circular&&(p.movements??[p.movement]).includes(movement));if(!selected.length)continue;
      const mesh=new InstancedMesh(movement==='circle'?this.circle:this.arrows.get(movement)!,this.light,selected.length*3);mesh.name='Signal '+movement+' arrows';let serial=0;
      for(const {p,i} of selected)for(const [n,color] of (['red','amber','green'] as const).entries()) {
        const combined=!p.circular&&(p.movements?.length??1)>1,part=p.movements?.indexOf(movement as TrafficSignalMovement)??0,scale=combined?1.08:p.circular?1:1.7;
        mesh.setMatrixAt(serial,new Matrix4().makeScale(scale,scale,1).setPosition(p.x+(combined?(.5-part)*.36:0),height-.38-n*.66,-.38));glyphs.push({mesh,index:serial++,panel:i,color});
      }
      root.add(mesh);
    }
    const digits=new InstancedMesh(this.box,this.light,panels.length*14);digits.name='Signal countdown segments';
    const locations=[[0,.23,true],[.13,.115,false],[.13,-.115,false],[0,-.23,true],[-.13,-.115,false],[-.13,.115,false],[0,0,true]] as const;
    // The readable face is local -Z: viewer-left is LOCAL +X. Mirror the
    // complete segment layout, including tens/ones, rather than just the text.
    panels.forEach((p,i)=>{for(let digit=0;digit<2;digit++)locations.forEach(([x,y,horizontal],segment)=>digits.setMatrixAt(i*14+digit*7+segment,new Matrix4().makeScale(horizontal?.22:.05,horizontal?.05:.19,.025).setPosition(p.x-(digit===0?-.19:.19)-x,height+.61+y,-.32)));});root.add(digits);
    root.userData.signalPanels=panels;root.userData.signalLowestHeight=height-2.095;
    root.traverse(o=>{if(o instanceof InstancedMesh)o.computeBoundingSphere();});
    return {root,panels,glyphs,digits,lastKey:''};
  }
  update(visual:CitySignalVisual,states:readonly {color:TrafficSignalColor;seconds:number}[]):void {
    const key=states.map(s=>s.color+Math.ceil(s.seconds)).join('|');if(key===visual.lastKey)return;visual.lastKey=key;
    for(const glyph of visual.glyphs){const state=states[glyph.panel]!;this.color.setHex(state.color===glyph.color?BRIGHT[glyph.color]:DARK[glyph.color]);glyph.mesh.setColorAt(glyph.index,this.color);if(glyph.mesh.instanceColor)glyph.mesh.instanceColor.needsUpdate=true;}
    states.forEach((state,i)=>{const seconds=Math.max(0,Math.ceil(state.seconds)),masks=seconds>99?[0x40,0x40]:[BITS[Math.floor(seconds/10)]!,BITS[seconds%10]!];
      for(let digit=0;digit<2;digit++)for(let segment=0;segment<7;segment++){this.color.setHex(masks[digit]!&(1<<segment)?BRIGHT[state.color]:0x0b1314);visual.digits.setColorAt(i*14+digit*7+segment,this.color);}});
    if(visual.digits.instanceColor)visual.digits.instanceColor.needsUpdate=true;
  }
  release(visual:CitySignalVisual):void {visual.root.removeFromParent();visual.root.traverse(o=>{if(o instanceof InstancedMesh)o.dispose();});}
  dispose():void {this.box.dispose();this.pole.dispose();this.circle.dispose();for(const g of this.arrows.values())g.dispose();this.light.dispose();}
}
