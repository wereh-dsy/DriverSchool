import { BoxGeometry,CanvasTexture,Group,InstancedMesh,Matrix4,MeshBasicMaterial,PlaneGeometry,Quaternion,SRGBColorSpace,Vector3,type BufferGeometry } from 'three';
import { resolveSignContent,type RoadNameRegistry,type RoadSignDefinition } from './RoadSignData';
import { signDimensions } from './RoadSignTemplates';
type Content=ReturnType<typeof resolveSignContent>;
export type SignCanvasFactory=()=>HTMLCanvasElement|null;
interface Part { geometry:BufferGeometry;matrix:Matrix4;face:boolean }
/** Shared templates and content caches live for the map, independent of sector load/unload. */
export class RoadSignRenderer {
  private readonly templates=new Map<string,Part[]>();
  private readonly materials=new Map<string,MeshBasicMaterial>();
  private readonly metal=new MeshBasicMaterial({color:0xa4acaf});
  private readonly backs=new MeshBasicMaterial({color:0x627477});
  private texturesCreated=0;
  constructor(readonly names:RoadNameRegistry,private readonly canvasFactory:SignCanvasFactory=()=>typeof document==='undefined'?null:document.createElement('canvas')){}
  get cacheStats(){return {templates:this.templates.size,materials:this.materials.size,textures:this.texturesCreated};}
  contentKey(sign:RoadSignDefinition){return JSON.stringify(resolveSignContent(sign,this.names));}
  private parts(sign:RoadSignDefinition):Part[] {
    const key=sign.template+':'+sign.size,existing=this.templates.get(key);if(existing)return existing;
    const t=signDimensions(sign.template,sign.size),parts:Part[]=[];
    const box=(w:number,h:number,d:number,x:number,y:number,z:number)=>parts.push({geometry:new BoxGeometry(w,h,d),matrix:new Matrix4().makeTranslation(x,y,z),face:false});
    for(const x of t.posts)box(0.24,t.poleTop,0.24,x,t.poleTop/2,0);
    if(sign.template==='gantry')box(24,0.35,0.35,0,10.15,0);
    box(t.width,t.height,0.18,0,t.bottom+t.height/2,0);
    parts.push({geometry:new PlaneGeometry(t.width-0.08,t.height-0.08),matrix:new Matrix4().makeTranslation(0,t.bottom+t.height/2,0.101),face:true});
    this.templates.set(key,parts);return parts;
  }
  materialFor(sign:RoadSignDefinition):MeshBasicMaterial {
    const key=this.contentKey(sign),old=this.materials.get(key);if(old)return old;
    const content=resolveSignContent(sign,this.names),canvas=this.canvasFactory();
    let texture:CanvasTexture|undefined;
    if(canvas) {
      canvas.width=sign.size==='large'?1536:sign.size==='medium'?1024:768;canvas.height=sign.size==='large'?640:sign.size==='medium'?400:216;
      const ctx=canvas.getContext('2d');if(ctx){this.paint(ctx,canvas.width,canvas.height,content);texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;this.texturesCreated++;}
    }
    const material=new MeshBasicMaterial({color:texture?0xffffff:content.color,map:texture??null,toneMapped:false});this.materials.set(key,material);return material;
  }
  private paint(ctx:CanvasRenderingContext2D,w:number,h:number,c:Content):void {
    ctx.fillStyle=c.color;ctx.fillRect(0,0,w,h);ctx.strokeStyle='#ffffff';ctx.lineWidth=5;ctx.strokeRect(14,14,w-28,h-28);ctx.fillStyle='#ffffff';
    const title=c.interchange,top=title?70:25;if(title){ctx.font='bold 40px "Microsoft YaHei",sans-serif';ctx.fillText(title,42,55,w-84);}
    const row=(h-top-25)/Math.max(1,c.destinations.length);
    for(let i=0;i<c.destinations.length;i++) {
      const d=c.destinations[i]!,y=top+row*i+row*0.5,x=65,arrowSize=Math.min(45,row*0.33);
      let dx=0,dy=-1;if(d.arrow==='left'){dx=-1;dy=0;}if(d.arrow==='right'){dx=1;dy=0;}if(d.arrow==='exit-right'){dx=0.7;dy=-0.7;}
      ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(x-dx*arrowSize,y-dy*arrowSize);ctx.lineTo(x+dx*arrowSize,y+dy*arrowSize);ctx.moveTo(x+dx*arrowSize-dx*24-dy*20,y+dy*arrowSize-dy*24+dx*20);ctx.lineTo(x+dx*arrowSize,y+dy*arrowSize);ctx.lineTo(x+dx*arrowSize-dx*24+dy*20,y+dy*arrowSize-dy*24-dx*20);ctx.stroke();
      ctx.font=`bold ${Math.min(68,row*(d.direction?0.35:0.5))}px "Microsoft YaHei",sans-serif`;
      ctx.fillText(d.name,140,y+(d.direction?-8:20),w-180);
      if(d.direction){ctx.font=`${Math.min(48,row*0.27)}px "Microsoft YaHei",sans-serif`;ctx.fillText(d.direction+(d.distanceMetres===undefined?'':'  '+d.distanceMetres+' m'),140,y+48,w-180);}
      else if(d.distanceMetres!==undefined){ctx.font='32px sans-serif';ctx.fillText(d.distanceMetres+' m',w-200,y+50,160);}
    }
  }
  buildInstances(signs:RoadSignDefinition[]):Group {
    const root=new Group(),batches=new Map<string,{part:Part;material:MeshBasicMaterial;matrices:Matrix4[];ids:string[]}>();
    for(const sign of signs) {
      const pose=new Matrix4().compose(new Vector3(sign.position.x,sign.position.y??0,sign.position.z),new Quaternion().setFromAxisAngle(new Vector3(0,1,0),sign.heading),new Vector3(1,1,1));
      this.parts(sign).forEach((part,i)=>{const key=sign.template+':'+sign.size+':'+i+(part.face?':'+this.contentKey(sign):''),material=part.face?this.materialFor(sign):i===this.parts(sign).length-2?this.backs:this.metal;let batch=batches.get(key);if(!batch){batch={part,material,matrices:[],ids:[]};batches.set(key,batch);}batch.matrices.push(new Matrix4().multiplyMatrices(pose,part.matrix));batch.ids.push(sign.id);});
    }
    for(const batch of batches.values()){const mesh=new InstancedMesh(batch.part.geometry,batch.material,batch.matrices.length);batch.matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.name='Road sign instances';mesh.userData.signIds=batch.ids;mesh.castShadow=!batch.part.face;mesh.computeBoundingSphere();root.add(mesh);}return root;
  }
  dispose(){for(const parts of this.templates.values())for(const p of parts)p.geometry.dispose();for(const material of this.materials.values()){material.map?.dispose();material.dispose();}this.metal.dispose();this.backs.dispose();this.templates.clear();this.materials.clear();}
}
