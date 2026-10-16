import { BoxGeometry,CanvasTexture,CylinderGeometry,Group,InstancedMesh,LinearFilter,LinearMipmapLinearFilter,Matrix4,MeshBasicMaterial,PlaneGeometry,Quaternion,SRGBColorSpace,Vector3,type BufferGeometry } from 'three';
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
  private templateKey(sign:RoadSignDefinition){return sign.template+':'+sign.size+':'+(sign.postOffset??'')+':'+sign.gantryPosts?.join(',')+':'+((sign.postBaseY??sign.position.y??0)-(sign.position.y??0))+':'+(sign.mountHeight??'');}
  private parts(sign:RoadSignDefinition):Part[] {
    const key=this.templateKey(sign),existing=this.templates.get(key);if(existing)return existing;
    const t=signDimensions(sign.template,sign.size,sign.postOffset,sign.gantryPosts,sign.mountHeight),parts:Part[]=[];
    const box=(w:number,h:number,d:number,x:number,y:number,z:number)=>parts.push({geometry:this.unitBox,matrix:new Matrix4().makeScale(w,h,d).setPosition(x,y,z),face:false});
    const postBottom=(sign.postBaseY??sign.position.y??0)-(sign.position.y??0);
    for(const x of t.posts)box(0.24,t.poleTop-postBottom,0.24,x,(t.poleTop+postBottom)/2,ROAD_SIGN_POST_Z);
    if(sign.template==='gantry'){const post=t.posts[0]!;box(Math.abs(post)+t.width/2+.4,0.35,0.35,(post+(post>0?-t.width/2:t.width/2))/2,10.15,ROAD_SIGN_POST_Z);box(.5,.12,.6,post,postBottom+.06,ROAD_SIGN_POST_Z);}
    if(sign.template==='highway-gantry'){
      const left=t.posts[0]!,right=t.posts[1]!,span=right-left,center=(left+right)/2;
      const beam=t.bottom+t.height+.15;
      for(const y of [beam,beam+.6])box(span+.4,.18,.3,center,y,ROAD_SIGN_POST_Z);
      for(let x=left;x<right;x+=1.5){const width=Math.min(1.5,right-x),m=new Matrix4().makeRotationZ(Math.atan2(.6,width)).scale(new Vector3(Math.hypot(width,.6),.11,.18)).setPosition(x+width/2,beam+.3,ROAD_SIGN_POST_Z);parts.push({geometry:this.unitBox,matrix:m,face:false});}
      for(const x of t.posts)box(.6,.12,.65,x,.06,ROAD_SIGN_POST_Z);
    }
    if(sign.template==='ceiling')for(const x of [-t.width*.35,t.width*.35])box(.12,t.poleTop-t.bottom-t.height,.12,x,(t.poleTop+t.bottom+t.height)/2,ROAD_SIGN_POST_Z);
    if(sign.template==='speed-limit')parts.push({geometry:new CylinderGeometry(t.width/2,t.width/2,.18,32).rotateX(Math.PI/2),matrix:new Matrix4().makeTranslation(0,t.bottom+t.height/2,0),face:false});
    else box(t.width,t.height,0.18,0,t.bottom+t.height/2,0);
    parts.push({geometry:new PlaneGeometry(t.width-0.08,t.height-0.08),matrix:new Matrix4().makeTranslation(0,t.bottom+t.height/2,0.101),face:true});
    this.templates.set(key,parts);return parts;
  }
  materialFor(sign:RoadSignDefinition):MeshBasicMaterial {
    const key=this.contentKey(sign),old=this.materials.get(key);if(old)return old;
    const content=resolveSignContent(sign,this.names),canvas=this.canvasFactory();
    let texture:CanvasTexture|undefined;
    if(canvas) {
      canvas.width=sign.template==='speed-limit'?256:sign.template==='chevron'?384:sign.highwayLayout?2048:sign.size==='large'?1536:sign.size==='medium'?1024:768;canvas.height=sign.template==='speed-limit'?256:sign.template==='chevron'?192:sign.template==='ceiling'?256:sign.highwayLayout?1024:sign.size==='large'?640:sign.size==='medium'?400:216;
      const ctx=canvas.getContext('2d');if(ctx){this.paint(ctx,canvas.width,canvas.height,content);texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;texture.anisotropy=8;texture.minFilter=LinearMipmapLinearFilter;texture.magFilter=LinearFilter;this.texturesCreated++;}
    }
    const material=new MeshBasicMaterial({color:texture?0xffffff:content.color,map:texture??null,toneMapped:false,transparent:sign.type==='SPEED_LIMIT',alphaTest:sign.type==='SPEED_LIMIT'?.1:0});this.materials.set(key,material);return material;
  }
  private paint(ctx:CanvasRenderingContext2D,w:number,h:number,c:Content):void {
    if(c.type==='SPEED_LIMIT'){
      ctx.clearRect(0,0,w,h);ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(w/2,h/2,w*.48,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#d72728';ctx.lineWidth=w*.095;ctx.beginPath();ctx.arc(w/2,h/2,w*.42,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle='#16191c';ctx.font=`700 ${w*.48}px Arial,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(c.speedLimitKmh),w/2,h*.52,w*.73);return;
    }
    if(c.type==='CHEVRON'){
      ctx.fillStyle='#155aa0';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#fff';ctx.lineWidth=5;ctx.strokeRect(4,4,w-8,h-8);ctx.fillStyle='#fff';
      for(let i=0;i<3;i++){const x=26+i*112;ctx.save();if(c.chevronDirection==='left'){ctx.translate(w,0);ctx.scale(-1,1);}ctx.beginPath();ctx.moveTo(x,24);ctx.lineTo(x+49,24);ctx.lineTo(x+105,h/2);ctx.lineTo(x+49,h-24);ctx.lineTo(x,h-24);ctx.lineTo(x+56,h/2);ctx.closePath();ctx.fill();ctx.restore();}return;
    }
    if(c.template==='ceiling'){
      ctx.fillStyle=c.color;ctx.fillRect(0,0,w,h);ctx.strokeStyle='#fff';ctx.lineWidth=6;ctx.strokeRect(10,10,w-20,h-20);ctx.fillStyle='#fff';
      const column=(w-60)/c.destinations.length;
      c.destinations.forEach((d,i)=>{const x=30+i*column;this.arrow(ctx,x+55,h/2,d.arrow,.6);ctx.font=`400 ${Math.min(150,h*.55)}px "Microsoft YaHei",sans-serif`;ctx.fillText([d.routeNumber,d.direction??d.name].filter(Boolean).join(' '),x+125,h*.7,column-155);});return;
    }
    if(c.highwayLayout){this.paintHighway(ctx,w,h,c);return;}
    ctx.fillStyle=c.color;ctx.fillRect(0,0,w,h);ctx.strokeStyle='#ffffff';ctx.lineWidth=5;ctx.strokeRect(14,14,w-28,h-28);ctx.fillStyle='#ffffff';
    const title=[c.exitNumber?'出口 '+c.exitNumber:undefined,c.interchange??c.approachRoadName].filter(Boolean).join(' '),top=title||c.advanceMetres!==undefined?90:25;if(title){ctx.font='400 48px "Microsoft YaHei",sans-serif';ctx.fillText(title,42,62,w*.65);}
    if(c.advanceMetres!==undefined){ctx.font='400 43px "Microsoft YaHei",sans-serif';ctx.fillText('前方 '+this.distance(c.advanceMetres),w*.7,62,w*.26);}
    const row=(h-top-25)/Math.max(1,c.destinations.length);
    for(let i=0;i<c.destinations.length;i++) {
      const d=c.destinations[i]!,y=top+row*i+row*0.5,x=65,arrowSize=Math.min(45,row*0.33);
      let dx=0,dy=-1;if(d.arrow==='left'){dx=-1;dy=0;}if(d.arrow==='right'){dx=1;dy=0;}if(d.arrow==='exit-right'){dx=0.7;dy=-0.7;}if(d.arrow==='exit-left'){dx=-.7;dy=-.7;}
      ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(x-dx*arrowSize,y-dy*arrowSize);ctx.lineTo(x+dx*arrowSize,y+dy*arrowSize);ctx.moveTo(x+dx*arrowSize-dx*24-dy*20,y+dy*arrowSize-dy*24+dx*20);ctx.lineTo(x+dx*arrowSize,y+dy*arrowSize);ctx.lineTo(x+dx*arrowSize-dx*24+dy*20,y+dy*arrowSize-dy*24-dx*20);ctx.stroke();
      ctx.font=`400 ${Math.min(98,row*(d.direction?0.4:0.65))}px "Microsoft YaHei",sans-serif`;
      let textX=140;
      if(d.routeNumber){const badgeWidth=d.routeNumber.length>3?190:135;ctx.fillStyle=d.routeNumber.startsWith('G')?'#a52b30':'#e6ce48';ctx.fillRect(135,y-43,badgeWidth,24);ctx.fillStyle='#ffffff';ctx.strokeRect(135,y-43,badgeWidth,75);ctx.font='bold 43px sans-serif';ctx.fillText(d.routeNumber,145,y+24,badgeWidth-20);textX+=badgeWidth+20;ctx.font=`bold ${Math.min(68,row*(d.direction?0.35:0.5))}px "Microsoft YaHei",sans-serif`;}
      ctx.fillText(d.name,textX,y+(d.direction?-8:20),w-textX-40);
      if(d.direction){ctx.font=`${Math.min(48,row*0.27)}px "Microsoft YaHei",sans-serif`;ctx.fillText(d.direction+(d.distanceMetres===undefined?'':'  '+d.distanceMetres+' m'),140,y+Math.min(48,row*.3),w-180);}
      else if(d.distanceMetres!==undefined){ctx.font='32px sans-serif';ctx.fillText(d.distanceMetres+' m',w-200,y+50,160);}
    }
  }
  private distance(m:number):string{return m>=1000?(m/1000).toFixed(m%1000===0?0:1)+' km':Math.round(m)+' m';}
  private arrow(ctx:CanvasRenderingContext2D,x:number,y:number,type:string,scale=1):void {
    ctx.save();ctx.translate(x,y);ctx.rotate(highwayArrowRotation(type));ctx.scale(scale,scale);ctx.beginPath();ctx.moveTo(-20,66);ctx.lineTo(20,66);ctx.lineTo(20,-5);ctx.lineTo(54,-5);ctx.lineTo(0,-76);ctx.lineTo(-54,-5);ctx.lineTo(-20,-5);ctx.closePath();ctx.fill();ctx.restore();
  }
  private paintHighway(ctx:CanvasRenderingContext2D,w:number,h:number,c:Content):void {
    ctx.fillStyle='#007a3d';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#fff';ctx.lineWidth=12;ctx.strokeRect(24,24,w-48,h-48);ctx.fillStyle='#fff';
    const write=(text:string,x:number,y:number,size:number,max:number)=>{ctx.font=`400 ${size}px "Microsoft YaHei",sans-serif`;ctx.fillText(text,x,y,max);};
    const arrow=(x:number,y:number,type:string,scale=1)=>this.arrow(ctx,x,y,type,scale);
    if(c.type==='EXPRESSWAY_DISTANCE'){
      const row=(h-100)/c.destinations.length;
      c.destinations.forEach((d,i)=>{const y=50+i*row;if(i){ctx.beginPath();ctx.moveTo(45,y);ctx.lineTo(w-45,y);ctx.lineWidth=4;ctx.stroke();}write(d.name,85,y+row*.7,Math.min(200,row*.6),w-690);write(this.distance(d.distanceMetres??0),w-580,y+row*.7,Math.min(200,row*.6),490);});return;
    }
    const header=155,hasAdvance=c.advanceMetres!==undefined&&['EXPRESSWAY_ADVANCE','EXPRESSWAY_SERVICE'].includes(c.type);
    if(c.interchange)write(c.interchange,60,119,88,w*.42);
    else if(c.type==='EXPRESSWAY_ENTRY')write('高速公路入口',60,119,88,w*.5);
    if(hasAdvance)write(this.distance(c.advanceMetres!),w*.46,121,106,w*.22);
    if(c.exitNumber){write('出口',w-570,117,82,190);ctx.beginPath();ctx.ellipse(w-230,85,155,60,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#007a3d';write(c.exitNumber,w-350,115,88,245);ctx.fillStyle='#fff';}
    ctx.beginPath();ctx.moveTo(45,header);ctx.lineTo(w-45,header);ctx.lineWidth=5;ctx.stroke();
    const count=c.destinations.length,column=(w-100)/count,laneBand=c.laneArrows?.length?125:0,bottom=h-45-laneBand;
    c.destinations.forEach((d,i)=>{
      const x=50+i*column,margin=count>2?30:50;
      if(i){ctx.beginPath();ctx.moveTo(x,header+20);ctx.lineTo(x,bottom);ctx.lineWidth=5;ctx.stroke();}
      let y=header+20;
      if(d.routeNumber){
        const badgeWidth=Math.min(d.routeNumber.length>3?340:270,column-margin*2),bx=x+margin;
        ctx.strokeRect(bx,y,badgeWidth,140);ctx.fillStyle=d.routeNumber.startsWith('G')?'#c62828':'#f4ca24';ctx.fillRect(bx+5,y+5,badgeWidth-10,40);ctx.fillStyle=d.routeNumber.startsWith('G')?'#fff':'#111';
        write(d.routeNumber.startsWith('G')?'国家高速':'省级高速',bx+13,y+36,30,badgeWidth-26);ctx.fillStyle='#fff';write(d.routeNumber,bx+13,y+126,96,badgeWidth-26);
        const nameWidth=column-badgeWidth-margin*2-20;if(nameWidth>180)write(d.name,bx+badgeWidth+20,y+116,68,nameWidth);y+=150;
      }
      const destinations=(d.direction??d.name).split(/\s*\/\s*/).filter(Boolean).slice(0,2),hasFacilities=!!c.facilities?.length&&!laneBand&&d.arrow!=='straight',size=count>2?166:hasFacilities?180:224;
      destinations.forEach((value,row)=>write(value,x+margin,y+size+row*(size+28),size,column-margin*2));
      if(hasFacilities)write(c.facilities!.map(f=>({parking:'P',fuel:'加油',charging:'充电',food:'餐饮',toilet:'卫生间'}[f]??f)).join('  '),x+margin,bottom-185,56,column-margin*2);
      if(!laneBand)arrow(x+column/2,bottom-58,d.arrow,1.05);
    });
    if(c.laneArrows?.length){
      ctx.beginPath();ctx.moveTo(35,bottom);ctx.lineTo(w-35,bottom);ctx.lineWidth=4;ctx.stroke();
      c.laneArrows.forEach((a,i)=>arrow(50+(i+.5)*(w-100)/c.laneArrows!.length,h-82,a,.72));
    }
  }
  buildInstances(signs:RoadSignDefinition[]):Group {
    const root=new Group(),batches=new Map<BufferGeometry,Map<MeshBasicMaterial,{part:Part;material:MeshBasicMaterial;matrices:Matrix4[];ids:string[]}>>();
    for(const sign of signs) {
      const pose=new Matrix4().compose(new Vector3(sign.position.x,sign.position.y??0,sign.position.z),new Quaternion().setFromAxisAngle(new Vector3(0,1,0),sign.heading),new Vector3(1,1,1));
      const parts=this.parts(sign);
      parts.forEach((part,i)=>{
        const material=part.face?this.materialFor(sign):i===parts.length-2?this.backs:this.metal;
        let materials=batches.get(part.geometry);if(!materials){materials=new Map();batches.set(part.geometry,materials);}
        let batch=materials.get(material);if(!batch){batch={part,material,matrices:[],ids:[]};materials.set(material,batch);}
        batch.matrices.push(new Matrix4().multiplyMatrices(pose,part.matrix));batch.ids.push(sign.id);
      });
    }
    for(const materials of batches.values())for(const batch of materials.values()){const mesh=new InstancedMesh(batch.part.geometry,batch.material,batch.matrices.length);batch.matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.name='Road sign instances';mesh.userData.signIds=batch.ids;mesh.castShadow=!batch.part.face;mesh.computeBoundingSphere();root.add(mesh);}return root;
  }
  /** Regional sectors release inactive board textures; template geometry remains reusable. */
  retainContents(signs:RoadSignDefinition[]):void {
    const wanted=new Set(signs.map(sign=>this.contentKey(sign)));
    for(const [key,material]of this.materials)if(!wanted.has(key)){material.map?.dispose();material.dispose();this.materials.delete(key);}
  }
  dispose(){const geometries=new Set([...this.templates.values()].flatMap(parts=>parts.map(p=>p.geometry)));geometries.add(this.unitBox);for(const g of geometries)g.dispose();for(const material of this.materials.values()){material.map?.dispose();material.dispose();}this.metal.dispose();this.backs.dispose();this.templates.clear();this.materials.clear();}
}
