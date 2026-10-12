import { BoxGeometry,CanvasTexture,Group,InstancedMesh,Matrix4,MeshBasicMaterial,PlaneGeometry,Quaternion,SRGBColorSpace,Vector3,type BufferGeometry } from 'three';
import { resolveSignContent,type RoadNameRegistry,type RoadSignDefinition } from './RoadSignData';
import { ROAD_SIGN_POST_Z,signDimensions } from './RoadSignTemplates';
type Content=ReturnType<typeof resolveSignContent>;
/** Canvas rotates clockwise: a positive angle turns an upward arrow right. */
export const highwayArrowRotation=(arrow:string)=>arrow==='exit-right'?Math.PI/4:arrow==='exit-left'?-Math.PI/4:arrow==='right'?Math.PI/2:arrow==='left'?-Math.PI/2:0;
export type SignCanvasFactory=()=>HTMLCanvasElement|null;
interface Part { geometry:BufferGeometry;matrix:Matrix4;face:boolean }
/** Shared templates and content caches live for the map, independent of sector load/unload. */
export class RoadSignRenderer {
  private readonly templates=new Map<string,Part[]>();
  private readonly materials=new Map<string,MeshBasicMaterial>();
  private readonly metal=new MeshBasicMaterial({color:0xa4acaf});
  private readonly backs=new MeshBasicMaterial({color:0x627477});
  private texturesCreated=0;
  private readonly unitBox=new BoxGeometry(1,1,1);
  constructor(readonly names:RoadNameRegistry,private readonly canvasFactory:SignCanvasFactory=()=>typeof document==='undefined'?null:document.createElement('canvas')){}
  get cacheStats(){return {templates:this.templates.size,materials:this.materials.size,textures:this.texturesCreated};}
  contentKey(sign:RoadSignDefinition){return JSON.stringify(resolveSignContent(sign,this.names));}
  private templateKey(sign:RoadSignDefinition){return sign.template+':'+sign.size+':'+(sign.postOffset??'')+':'+sign.gantryPosts?.join(',')+':'+((sign.postBaseY??sign.position.y??0)-(sign.position.y??0));}
  private parts(sign:RoadSignDefinition):Part[] {
    const key=this.templateKey(sign),existing=this.templates.get(key);if(existing)return existing;
    const t=signDimensions(sign.template,sign.size,sign.postOffset,sign.gantryPosts),parts:Part[]=[];
    const box=(w:number,h:number,d:number,x:number,y:number,z:number)=>parts.push({geometry:this.unitBox,matrix:new Matrix4().makeScale(w,h,d).setPosition(x,y,z),face:false});
    const postBottom=(sign.postBaseY??sign.position.y??0)-(sign.position.y??0);
    for(const x of t.posts)box(0.24,t.poleTop-postBottom,0.24,x,(t.poleTop+postBottom)/2,ROAD_SIGN_POST_Z);
    if(sign.template==='gantry'){const post=t.posts[0]!;box(post+t.width/2+.4,0.35,0.35,(post-t.width/2)/2,10.15,0);box(.5,.12,.6,post,.06,ROAD_SIGN_POST_Z);}
    if(sign.template==='highway-gantry'){
      const left=t.posts[0]!,right=t.posts[1]!,span=right-left,center=(left+right)/2;
      for(const y of [11.35,11.95])box(span+.4,.18,.3,center,y,ROAD_SIGN_POST_Z);
      for(let x=left;x<right;x+=1.5){const width=Math.min(1.5,right-x),m=new Matrix4().makeRotationZ(Math.atan2(.6,width)).scale(new Vector3(Math.hypot(width,.6),.11,.18)).setPosition(x+width/2,11.65,ROAD_SIGN_POST_Z);parts.push({geometry:this.unitBox,matrix:m,face:false});}
      for(const x of t.posts)box(.6,.12,.65,x,.06,ROAD_SIGN_POST_Z);
    }
    box(t.width,t.height,0.18,0,t.bottom+t.height/2,0);
    parts.push({geometry:new PlaneGeometry(t.width-0.08,t.height-0.08),matrix:new Matrix4().makeTranslation(0,t.bottom+t.height/2,0.101),face:true});
    this.templates.set(key,parts);return parts;
  }
  materialFor(sign:RoadSignDefinition):MeshBasicMaterial {
    const key=this.contentKey(sign),old=this.materials.get(key);if(old)return old;
    const content=resolveSignContent(sign,this.names),canvas=this.canvasFactory();
    let texture:CanvasTexture|undefined;
    if(canvas) {
      canvas.width=sign.highwayLayout?2048:sign.size==='large'?1536:sign.size==='medium'?1024:768;canvas.height=sign.highwayLayout?768:sign.size==='large'?640:sign.size==='medium'?400:216;
      const ctx=canvas.getContext('2d');if(ctx){this.paint(ctx,canvas.width,canvas.height,content);texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;this.texturesCreated++;}
    }
    const material=new MeshBasicMaterial({color:texture?0xffffff:content.color,map:texture??null,toneMapped:false});this.materials.set(key,material);return material;
  }
  private paint(ctx:CanvasRenderingContext2D,w:number,h:number,c:Content):void {
    if(c.highwayLayout){this.paintHighway(ctx,w,h,c);return;}
    ctx.fillStyle=c.color;ctx.fillRect(0,0,w,h);ctx.strokeStyle='#ffffff';ctx.lineWidth=5;ctx.strokeRect(14,14,w-28,h-28);ctx.fillStyle='#ffffff';
    const title=c.interchange,top=title?70:25;if(title){ctx.font='bold 40px "Microsoft YaHei",sans-serif';ctx.fillText(title,42,55,w-84);}
    const row=(h-top-25)/Math.max(1,c.destinations.length);
    for(let i=0;i<c.destinations.length;i++) {
      const d=c.destinations[i]!,y=top+row*i+row*0.5,x=65,arrowSize=Math.min(45,row*0.33);
      let dx=0,dy=-1;if(d.arrow==='left'){dx=-1;dy=0;}if(d.arrow==='right'){dx=1;dy=0;}if(d.arrow==='exit-right'){dx=0.7;dy=-0.7;}
      ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(x-dx*arrowSize,y-dy*arrowSize);ctx.lineTo(x+dx*arrowSize,y+dy*arrowSize);ctx.moveTo(x+dx*arrowSize-dx*24-dy*20,y+dy*arrowSize-dy*24+dx*20);ctx.lineTo(x+dx*arrowSize,y+dy*arrowSize);ctx.lineTo(x+dx*arrowSize-dx*24+dy*20,y+dy*arrowSize-dy*24-dx*20);ctx.stroke();
      ctx.font=`bold ${Math.min(68,row*(d.direction?0.35:0.5))}px "Microsoft YaHei",sans-serif`;
      let textX=140;
      if(d.routeNumber){const badgeWidth=d.routeNumber.length>3?190:135;ctx.fillStyle=d.routeNumber.startsWith('G')?'#a52b30':'#e6ce48';ctx.fillRect(135,y-43,badgeWidth,24);ctx.fillStyle='#ffffff';ctx.strokeRect(135,y-43,badgeWidth,75);ctx.font='bold 43px sans-serif';ctx.fillText(d.routeNumber,145,y+24,badgeWidth-20);textX+=badgeWidth+20;ctx.font=`bold ${Math.min(68,row*(d.direction?0.35:0.5))}px "Microsoft YaHei",sans-serif`;}
      ctx.fillText(d.name,textX,y+(d.direction?-8:20),w-textX-40);
      if(d.direction){ctx.font=`${Math.min(48,row*0.27)}px "Microsoft YaHei",sans-serif`;ctx.fillText(d.direction+(d.distanceMetres===undefined?'':'  '+d.distanceMetres+' m'),140,y+Math.min(48,row*.3),w-180);}
      else if(d.distanceMetres!==undefined){ctx.font='32px sans-serif';ctx.fillText(d.distanceMetres+' m',w-200,y+50,160);}
    }
  }
  private paintHighway(ctx:CanvasRenderingContext2D,w:number,h:number,c:Content):void {
    ctx.fillStyle=c.color;ctx.fillRect(0,0,w,h);ctx.strokeStyle='#fff';ctx.lineWidth=9;ctx.strokeRect(20,20,w-40,h-40);ctx.fillStyle='#fff';
    const write=(text:string,x:number,y:number,size:number,max:number)=>{ctx.font=`400 ${size}px "Microsoft YaHei",sans-serif`;ctx.fillText(text,x,y,max);};
    const arrow=(x:number,y:number,type:string,scale=1)=>{ctx.save();ctx.translate(x,y);ctx.rotate(highwayArrowRotation(type));ctx.scale(scale,scale);ctx.beginPath();ctx.moveTo(-20,66);ctx.lineTo(20,66);ctx.lineTo(20,-5);ctx.lineTo(54,-5);ctx.lineTo(0,-76);ctx.lineTo(-54,-5);ctx.lineTo(-20,-5);ctx.closePath();ctx.fill();ctx.restore();};
    const distance=(m:number)=>m>=1000?(m/1000).toFixed(m%1000===0?0:1)+' km':m+' m';
    if(c.type==='EXPRESSWAY_DISTANCE'){
      const row=(h-90)/c.destinations.length;
      c.destinations.forEach((d,i)=>{const y=45+i*row;if(i){ctx.beginPath();ctx.moveTo(35,y);ctx.lineTo(w-35,y);ctx.lineWidth=5;ctx.stroke();}write(d.name,75,y+row*.66,110,w-630);write(distance(d.distanceMetres??0),w-540,y+row*.66,128,460);});return;
    }
    if(c.interchange)write(c.interchange,55,105,78,w-570);
    if(c.exitNumber){ctx.strokeRect(w-490,35,435,100);write('出口 '+c.exitNumber,w-463,113,82,380);}
    if(c.type==='EXPRESSWAY_ENTRY')write('入口',55,105,78,200);
    const count=c.destinations.length,top=c.interchange||c.exitNumber||c.type==='EXPRESSWAY_ENTRY'?155:45,column=(w-80)/count;
    const laneBand=c.laneArrows?.length?120:0,bottom=h-60-laneBand;
    c.destinations.forEach((d,i)=>{
      const x=40+i*column,margin=count>2?24:42;
      if(i){ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.lineWidth=4;ctx.stroke();}
      let y=top+18;
      if(d.routeNumber){
        const badgeWidth=d.routeNumber.length>3?330:260,bx=x+margin;
        ctx.strokeRect(bx,y,badgeWidth,155);ctx.fillStyle=d.routeNumber.startsWith('G')?'#c62930':'#e7a928';ctx.fillRect(bx+4,y+4,badgeWidth-8,42);ctx.fillStyle='#fff';
        write(d.routeNumber.startsWith('G')?'国家高速':'省高速',bx+13,y+35,30,badgeWidth-26);write(d.routeNumber,bx+13,y+139,104,badgeWidth-26);
        write(d.name,bx+badgeWidth+24,y+100,72,column-badgeWidth-margin*2-24);y+=185;
      }else{write(d.name,x+margin,y+70,78,column-margin*2);y+=105;}
      const destinations=(d.direction??(d.routeNumber?d.name:'')).split(/\s*\/\s*/).filter(Boolean).slice(0,2),size=count>2?88:laneBand?100:116;
      destinations.forEach((value,row)=>write(value,x+margin,y+size+row*(size+15),size,column-margin*2));
      if(d.distanceMetres!==undefined&&laneBand===0)write(distance(d.distanceMetres),x+margin,h-75,136,column-245);
      else if(c.facilities?.length&&laneBand===0)write(c.facilities.map(f=>({parking:'P',fuel:'加油',charging:'充电',food:'餐饮',toilet:'卫生间'}[f]??f)).join('  '),x+margin,h-75,62,column-245);
      if(!laneBand)arrow(x+column-116,h-133,d.arrow);
    });
    if(c.laneArrows?.length){
      ctx.beginPath();ctx.moveTo(35,bottom);ctx.lineTo(w-35,bottom);ctx.lineWidth=4;ctx.stroke();
      c.laneArrows.forEach((a,i)=>arrow(40+(i+.5)*(w-80)/c.laneArrows!.length,h-78,a,.6));
    }
  }
  buildInstances(signs:RoadSignDefinition[]):Group {
    const root=new Group(),batches=new Map<string,{part:Part;material:MeshBasicMaterial;matrices:Matrix4[];ids:string[]}>();
    for(const sign of signs) {
      const pose=new Matrix4().compose(new Vector3(sign.position.x,sign.position.y??0,sign.position.z),new Quaternion().setFromAxisAngle(new Vector3(0,1,0),sign.heading),new Vector3(1,1,1));
      this.parts(sign).forEach((part,i)=>{const key=this.templateKey(sign)+':'+i+(part.face?':'+this.contentKey(sign):''),material=part.face?this.materialFor(sign):i===this.parts(sign).length-2?this.backs:this.metal;let batch=batches.get(key);if(!batch){batch={part,material,matrices:[],ids:[]};batches.set(key,batch);}batch.matrices.push(new Matrix4().multiplyMatrices(pose,part.matrix));batch.ids.push(sign.id);});
    }
    for(const batch of batches.values()){const mesh=new InstancedMesh(batch.part.geometry,batch.material,batch.matrices.length);batch.matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.name='Road sign instances';mesh.userData.signIds=batch.ids;mesh.castShadow=!batch.part.face;mesh.computeBoundingSphere();root.add(mesh);}return root;
  }
  /** Regional sectors release inactive board textures; template geometry remains reusable. */
  retainContents(signs:RoadSignDefinition[]):void {
    const wanted=new Set(signs.map(sign=>this.contentKey(sign)));
    for(const [key,material]of this.materials)if(!wanted.has(key)){material.map?.dispose();material.dispose();this.materials.delete(key);}
  }
  dispose(){const geometries=new Set([...this.templates.values()].flatMap(parts=>parts.map(p=>p.geometry)));geometries.add(this.unitBox);for(const g of geometries)g.dispose();for(const material of this.materials.values()){material.map?.dispose();material.dispose();}this.metal.dispose();this.backs.dispose();this.templates.clear();this.materials.clear();}
}
