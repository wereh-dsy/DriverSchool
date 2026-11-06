import * as T from 'three';
import { vehiclePaint, vehicleGlass } from './VehicleMaterials';
import { surfaceGrid, surfaceLoft, surfaceQuad, surfaceRounded } from './SurfaceVehicleGeometry';
import { gtiMaterial } from './GolfGTISurfaces';
import { gtiExteriorTexture,gtiJoin,gtiRibbon } from './GolfGTIExteriorDetails';
import {gtiWindshieldPoint,gtiSidePoint,gtiWindowFrame,gtiWindowRing,gtiBodySideWidth,gtiBeltY,gtiFrontPoint,gtiRearPoint,gtiRoofPoint,gtiRearGlassPoint} from './GolfGTIBodyShape';
import type { VehicleVisualConfig, Vector3Tuple as P } from './VehicleVisualConfig';
import type { VehicleAssetRegistry } from './VehicleAssetRegistry';

export {gtiWindshieldPoint,gtiSidePoint,gtiWindowFrame} from './GolfGTIBodyShape';

export function buildGolfGTIExterior(root: T.Group, c: VehicleVisualConfig, assets?: VehicleAssetRegistry): void {
  const paint = vehiclePaint(c.body.color, { metalness: .25, side: T.DoubleSide });
  const trim = new T.MeshStandardMaterial({ color: c.body.trimColor, roughness: .55, side: T.DoubleSide });
  const glass = vehicleGlass(c.windowGlass!.color, c.windowGlass!.windowOpacity);
  const side = gtiMaterial('side', c, assets), front = gtiMaterial('front', c, assets), rear = gtiMaterial('rear', c, assets), badge = gtiMaterial('badge', c, assets);
  side.roughness = rear.roughness = .32; side.metalness = rear.metalness = .25;
  rear.color.setHex(c.body.color);
  const h = c.vehicleLength / 2, w = c.vehicleWidth / 2;
  const doorFront=c.driverAccess?.doorFrontZ??-.80,doorRear=c.driverAccess?.doorRearZ??.29;
  const hinge=new T.Group(),door=new T.Group();hinge.name='Driver door hinge';hinge.position.set(-.818,.875,doorFront);
  door.name='Driver door';hinge.add(door);root.add(hinge);
  const onDoor=(part:T.Object3D)=>{part.position.sub(hinge.position);door.add(part);};
  const jambs:T.Mesh[]=[];
  const belt = gtiBeltY;
  const archY = (z: number) => {
    const dy = c.body.wheelArchCenterY ?? c.wheelRadius, r = c.wheelRadius + c.body.wheelArchClearance;
    const distance = Math.min(Math.abs(z + c.wheelBase / 2), Math.abs(z - c.wheelBase / 2));
    return distance < r ? dy + Math.sqrt(r * r - distance * distance) : c.body.groundClearance;
  };
  for (const sign of [-1, 1]) {
    const label = sign < 0 ? 'Left' : 'Right';
    const ranges=sign<0?[[-h,doorFront,false],[doorFront,doorRear,true],[doorRear,h,false]] as const:[[-h,h,false]] as const;
    for(const [z0,z1,moving] of ranges) {
    const flank = surfaceGrid(label + ' GTI '+(moving?'hinged front door skin':'arch-cut door and fender skin'), Math.ceil((z1-z0)/.027),22,(u,v)=>{
      const z = T.MathUtils.lerp(z0, z1, u), top = belt(z), bottom = archY(z);
      const y = T.MathUtils.lerp(bottom, top, v);
      const x=sign*gtiBodySideWidth(c,z,y);
      const frontRound=(gtiFrontPoint(c,x,y)[2]+h)*(1-T.MathUtils.smoothstep(z,-h,-h+.38));
      const rearRound=(h-gtiRearPoint(c,x,y)[2])*T.MathUtils.smoothstep(z,h-.38,h);
      return [x,y,z+frontRound-rearRound];
    }, side);
    // Atlas U runs along the car, V runs down the doors independently of arch cuts.
    const p = flank.geometry.getAttribute('position'), uv = flank.geometry.getAttribute('uv');
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getZ(i) + h) / (2 * h), (p.getY(i) - .135) / .74);
    moving?onDoor(flank):root.add(flank);
    }
    root.add(gtiWindowFrame(c, sign, paint));
    const panel=(name:string,zy:number[][],mat:T.Material)=>surfaceGrid(label+' '+name,6,3,(u,v)=>{
      const a=zy[0]!,b=zy[1]!,d=zy[3]!,e=zy[2]!;
      return gtiSidePoint(c,sign,T.MathUtils.lerp(T.MathUtils.lerp(a[0]!,b[0]!,v),T.MathUtils.lerp(d[0]!,e[0]!,v),u),T.MathUtils.lerp(T.MathUtils.lerp(a[1]!,b[1]!,v),T.MathUtils.lerp(d[1]!,e[1]!,v),u));
    },mat);
    const pane=panel('GTI front door glass', [[-.79,.945],[-.13,1.323],[.25,1.345],[.27,.945]],sign<0?glass.clone():glass);
    if(sign<0) {
      const mount=new T.Group();mount.name='Driver window glass mount';mount.userData.driverWindowBeltHeight=.945-hinge.position.y;
      pane.position.sub(hinge.position);mount.add(pane);door.add(mount);
      const returns:T.Mesh[]=[];
      for(const z of [doorFront,doorRear])returns.push(surfaceQuad('GTI painted door return',[[-gtiBodySideWidth(c,z,.28),.28,z],gtiSidePoint(c,-1,z,.935),[-.755,.935,z],[-.755,.28,z]],paint));
      const outer=[[doorFront,.925],[-.155,1.350],[.282,1.367],[doorRear,.940]],inner=[[doorFront+.035,.952],[-.13,1.323],[.255,1.343],[doorRear-.025,.952]];
      returns.push(gtiWindowRing(c,-1,outer as [number,number][],inner as [number,number][],paint,'GTI moving window frame'));
      onDoor(gtiJoin('GTI framed driver door edge returns',returns,paint));
      jambs.push(surfaceQuad('GTI fixed driver threshold',[[-gtiBodySideWidth(c,doorFront,.265),.265,doorFront],[-.755,.265,doorFront],[-.755,.265,doorRear],[-gtiBodySideWidth(c,doorRear,.265),.265,doorRear]],trim));
      for(const z of [doorFront,doorRear])jambs.push(surfaceQuad('GTI fixed door jamb',[[-gtiBodySideWidth(c,z,.265),.265,z],[-.755,.265,z],[-.755,.935,z],gtiSidePoint(c,-1,z,.935)],trim));
    } else root.add(pane);
    root.add(panel('GTI rear door glass', [[.32,.945],[.30,1.345],[1.02,1.309],[1.34,.973]], glass));
    root.add(panel('GTI quarter glass', [[1.38,.974],[1.06,1.307],[1.25,1.280],[1.69,.986]], glass));
    root.add(panel('GTI B pillar', [[.265, .932], [.245, 1.367], [.31, 1.367], [.33, .932]], trim));
    root.add(panel('GTI rear window divider', [[1.34,.956],[1.015,1.329],[1.06,1.327],[1.385,.957]], trim));
  }
  root.add(surfaceGrid('GTI crowned short bonnet', 16, 24, (u, v) => {
    const z=T.MathUtils.lerp(-h,c.cabin.windshieldBottomZ,u),x=(v*2-1)*gtiBodySideWidth(c,z,belt(z));
    const crease=.014*Math.exp(-(((Math.abs(v*2-1)-.66)/.09)**2))*Math.sin(u*Math.PI);
    return [x,belt(z)+.035*(1-u)*Math.sin(v*Math.PI)+crease,z+(gtiFrontPoint(c,x,belt(z))[2]+h)*(1-u)**3];
  }, paint));
  root.add(surfaceGrid('GTI continuous roof',24,24,(u,v)=>gtiRoofPoint(c,u,v),paint));
  const windshield = glass.clone(); windshield.opacity = c.windowGlass!.windshieldOpacity;
  root.add(surfaceGrid('GTI curved windshield', 12, 24, (u, v) => gtiWindshieldPoint(c, u, v), windshield));
  root.add(surfaceGrid('GTI windshield roof header closure', 2, 24, (u,v) => {
    const p=gtiWindshieldPoint(c,1,v),q=gtiRoofPoint(c,0,v);return [T.MathUtils.lerp(p[0],q[0],u),T.MathUtils.lerp(p[1],q[1],u),T.MathUtils.lerp(p[2],q[2],u)];
  },paint));
  root.add(surfaceGrid('GTI tailgate glass',10,18,(u,v)=>gtiRearGlassPoint(c,u,v),glass));
  root.add(surfaceLoft('GTI short roof spoiler', [
    ...[1.43,1.62].map((at,j)=>{const half=j?.688:.678,upper=Array.from({length:13},(_,i)=>{const nx=i/6-1;return [nx*half,1.306+.044*(1-nx*nx)**.8-j*.008] as const;});return {at,ring:[...upper,...upper.map(([x,y])=>[x,y-.014] as const).reverse()]};}),
  ], trim));
  root.add(surfaceGrid('GTI tailgate shoulder closure',8,12,(u,v)=>{const p=gtiRearGlassPoint(c,1,v),x=(v*2-1)*gtiBodySideWidth(c,h,belt(h)),q=gtiRearPoint(c,x,belt(h));return [T.MathUtils.lerp(p[0],q[0],u),T.MathUtils.lerp(p[1],q[1],u),T.MathUtils.lerp(p[2],q[2],u)];},paint));
  const frontPoint=(x:number,y:number):P=>gtiFrontPoint(c,x,y);
  const rearPoint=(x:number,y:number,offset=0):P=>gtiRearPoint(c,x,y,offset);
  const nosePaint=paint.clone();nosePaint.map=gtiExteriorTexture('nose',c,assets);
  front.map=gtiExteriorTexture('grille',c,assets);rear.map=gtiExteriorTexture('rear',c,assets);
  const nose=surfaceGrid('GTI sculpted front bumper and optic surround',20,40,(u,v)=>{
    const top=belt(-h)+.035*Math.sin(v*Math.PI),y=T.MathUtils.lerp(.17,top,u),width=gtiBodySideWidth(c,-h,y);
    return frontPoint((v*2-1)*width,y);
  },nosePaint);
  const noseUV=nose.geometry.getAttribute('uv');for(let i=0;i<noseUV.count;i++)noseUV.setXY(i,1-noseUV.getX(i),1-noseUV.getY(i));root.add(nose);
  const hatch=surfaceGrid('GTI sculpted hatch and rear bumper',24,40,(u,v)=>{
    const y=T.MathUtils.lerp(.17,belt(h),u),nx=v*2-1,width=gtiBodySideWidth(c,h,y);
    return rearPoint(nx*width,y);
  },rear);
  const hatchUV=hatch.geometry.getAttribute('uv');for(let i=0;i<hatchUV.count;i++)hatchUV.setY(i,1-hatchUV.getY(i));root.add(hatch);
  const grille=(name:string,width:number,bottom:(x:number)=>number,top:(x:number)=>number,cell:[number,number],corner=0)=>{
    const part=surfaceGrid(name,8,32,(u,v)=>{const x=(v*2-1)*(width-corner*(1-Math.sin(Math.PI*u))**4),y=T.MathUtils.lerp(bottom(x),top(x),u),p=frontPoint(x,y);return [x,y,p[2]-.006];},front);
    const uv=part.geometry.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,1-uv.getX(i),cell[0]+(1-uv.getY(i))*cell[1]);return part;
  };
  const diffuser=surfaceGrid('GTI rear dark diffuser',6,32,(u,v)=>{const x=(v*2-1)*.76,y=T.MathUtils.lerp(.17+.012*Math.abs(v*2-1),.29,u);return rearPoint(x,y,.003);},front);
  const diffuserUV=diffuser.geometry.getAttribute('uv');for(let i=0;i<diffuserUV.count;i++)diffuserUV.setY(i,diffuserUV.getY(i)*.16);
  root.add(gtiJoin('GTI honeycomb grille and rear diffuser atlas',[
    grille('GTI narrow red upper grille',.38,()=>.752,()=>.803,[.82,.18]),
    grille('GTI broad honeycomb intake',.755,x=>.245+.035*Math.abs(x/.755)**4,x=>.558-.035*Math.abs(x/.755)**6,[.20,.60],.055),diffuser],front));
  for (const [isFront,centerY,diameter] of [[true,.795,.115],[false,.897,.105]] as const) {
    const emblem=surfaceGrid('GTI VW surface emblem',6,12,(u,v)=>{
      const x=(v-.5)*diameter,y=centerY+(u-.5)*diameter,p=isFront?frontPoint(x,y):rearPoint(x,y);
      return [x,y,p[2]+(isFront?-.007:.007)];
    },badge);
    const uv=emblem.geometry.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,isFront?1-uv.getX(i):uv.getX(i),1-uv.getY(i));
    root.add(emblem);
  }
  const optic = new T.MeshStandardMaterial({ color: 0x20282e, roughness: .25, side: T.DoubleSide });
  const masked=(kind:'head-mask'|'fog-mask')=>{const mask=gtiExteriorTexture(kind,c,assets);return new T.MeshStandardMaterial({color:0x182028,alphaMap:mask,emissiveMap:mask,alphaTest:.08,side:T.DoubleSide});};
  const headMaterial=masked('head-mask'),fogMaterial=masked('fog-mask');
  const output=(m:T.Mesh,key:string,mask=false)=>{m.userData.lightingKey=key;if(mask)m.userData.textureMaskedLight=true;root.add(m);};
  const lamp = (name: string, key: string, size: P, pos: P, mat = optic) => {
    const m = surfaceRounded(name, size, pos, mat, .012);if(pos[2]>0)m.rotation.y=Math.atan(.57*pos[0]*Math.abs(pos[0])/w**3);
    m.userData.lightingKey = key; root.add(m);
  };
  const exhaustMaterial=new T.MeshStandardMaterial({color:0x949b9f,metalness:.8,roughness:.32,side:T.DoubleSide});
  for (const sign of [-1, 1]) {
    const label = sign < 0 ? 'Left' : 'Right', signal = sign < 0 ? 'left' : 'right';
    const head=surfaceGrid(label+' GTI low high module',3,18,(u,v)=>{const x=sign*T.MathUtils.lerp(.365,.800,v),y=T.MathUtils.lerp(.741-.020*Math.sin(v*Math.PI),.807-.008*v,u),p=frontPoint(x,y);return [x,y,p[2]-.010];},headMaterial);
    head.userData.vehicleBodyPart='headlamp';output(head,'head',true);
    const guide:P[]=[],indicator:P[]=[];
    for(let i=0;i<=24;i++){const x=sign*T.MathUtils.lerp(.055,.800,i/24),y=.788+.006*Math.max(0,(Math.abs(x)-.37)/.43),p=frontPoint(x,y);guide.push([x,y,p[2]-.012]);if(Math.abs(x)>.38)indicator.push([x,y-.014,p[2]-.013]);}
    output(gtiRibbon(label+' GTI LED eyebrow and grille bar',guide,.007,optic),'position');
    output(gtiRibbon(label+' GTI front amber',indicator,.006,optic),signal);
    output(surfaceGrid(label+' GTI five cell X fog',2,12,(u,v)=>{const x=sign*T.MathUtils.lerp(.5375,.7225,v),y=T.MathUtils.lerp(.3755,.5005,u),p=frontPoint(x,y);return [x,y,p[2]-.010];},fogMaterial),'fogFront',true);
    const tail:P[]=[[sign*.39,.896],[sign*.59,.885],[sign*.77,.900],[sign*.79,.853],[sign*.61,.848],[sign*.44,.860]].map(([x,y])=>rearPoint(x!,y!,.004));
    output(gtiRibbon(label+' GTI tail outline',tail,.010,optic),'tail');
    output(gtiRibbon(label+' GTI brake',[[sign*.43,.872],[sign*.63,.865],[sign*.77,.878]].map(([x,y])=>rearPoint(x!,y!,.005)),.018,optic),'brake');
    output(gtiRibbon(label+' GTI rear amber',[[sign*.44,.836],[sign*.76,.840]].map(([x,y])=>rearPoint(x!,y!,.005)),.009,optic),signal);
    lamp(label+' GTI reverse','reverse',[.11,.014,.003],rearPoint(sign*.49,.811,.005));
    // Hollow physical dual outlets, no fake four-pipe R treatment.
    const exhaust = new T.Mesh(new T.CylinderGeometry(.034, .034, .10, 16, 1, true),
      exhaustMaterial);
    exhaust.rotation.x = Math.PI / 2; exhaust.position.set(sign * .63, .232, rearPoint(sign*.63,.232)[2]+.02); exhaust.name = 'GTI dual exhaust outlet'; root.add(exhaust);
  }
  lamp('GTI rear fog', 'fogRear', [.11, .024, .004],rearPoint(-.48,.25,.005));
  lamp('GTI high mounted brake','brake',[.23,.014,.004],[0,1.331,1.616]);
  const underfloor=gtiJoin('GTI underfloor',[surfaceGrid('GTI floor datum',2,16,(u,v)=>{const x=(v*2-1)*.65;return [x,.135,T.MathUtils.lerp(frontPoint(x,.17)[2]+.012,rearPoint(x,.17)[2]-.012,u)];},trim),...jambs],trim);
  // Stance/clearance validation locates the physical body datum via this category.
  underfloor.userData.vehicleBodyPart = 'main-shell';
  root.add(underfloor);
  root.traverse(o => { if (o instanceof T.Mesh && !o.userData.vehicleBodyPart) o.userData.vehicleBodyPart = 'body'; });
}
