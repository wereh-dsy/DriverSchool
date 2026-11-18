import { jeskoWindshieldPoint, jeskoWindshieldGeometry, jeskoCanopyRail } from './JeskoCanopy';
import { jeskoSurfaceTile, ensureJeskoSurfaceUV } from './JeskoCabinTextures';
import { ExteriorDetailAtlas } from './ExteriorDetailAtlas';
import { tyreDetailTexture } from './TyreDetailTexture';
import * as T from 'three';
import { localWheelPositions, VEHICLE_WHEEL_IDS, type VehicleWheelId } from '../VehicleDimensions';
import type { VehicleVisualConfig } from './VehicleVisualConfig';

/** Instance-local paint/carbon/glass; no mutable material is exported/shared. */
export function buildJeskoAttackExterior(root: T.Group, c: VehicleVisualConfig): void {
  const paint = new T.MeshPhysicalMaterial({ color: c.body.color, metalness: .48, roughness: .23, clearcoat: .9 });
  const carbon = new T.MeshStandardMaterial({ color: 0x69747a, map: jeskoSurfaceTile(true), metalness: .12, roughness: .40 });
  const black = new T.MeshStandardMaterial({ color: 0x05080a, roughness: .85 });
  const glass = new T.MeshPhysicalMaterial({ color: 0x66888f, transparent: true, opacity: .26,
    roughness: .08, metalness: .08, side: T.DoubleSide, depthWrite: false });
  const silver = new T.MeshStandardMaterial({ color: 0x919ca3, metalness: .9, roughness: .27 });
  const led = new T.MeshStandardMaterial({ color: 0xeaffff, emissive: 0xd7f4ff, emissiveIntensity: .7 });
  const red = new T.MeshStandardMaterial({ color: 0xb81522, emissive: 0xff1824, emissiveIntensity: .5 });
  const mesh = (name: string, geometry: T.BufferGeometry, material: T.Material, x=0,y=0,z=0, parent: T.Object3D=root) => {
    if(material===carbon)ensureJeskoSurfaceUV(geometry,true);
    const m = new T.Mesh(geometry, material); m.name=name; m.position.set(x,y,z);
    m.castShadow=material!==glass; m.receiveShadow=true; parent.add(m); return m;
  };
  const box = (name:string,w:number,h:number,d:number,x:number,y:number,z:number,mat:T.Material=carbon,parent:T.Object3D=root) =>
    mesh(name,new T.BoxGeometry(w,h,d),mat,x,y,z,parent);
  const quad = (name:string,points:number[][],mat:T.Material,parent:T.Object3D=root) => {
    const g = new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points.flat(),3));
    g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();return mesh(name,g,mat,0,0,0,parent);
  };
  // Continuous closed body loft. Arch openings follow the same wheel datum,
  // including a clearance allowance; central floor stays between the tyres.
  const stations = [
    [-2.30,.76,.43],[-2.13,.91,.50],[-1.78,.99,.67],[-1.35,1.005,.77],
    [-.95,.97,.68],[-.60,.96,.63],[.15,.98,.64],[.72,1.01,.73],
    [1.35,1.005,.79],[1.77,.99,.75],[2.16,.94,.69],[2.30,.87,.64],
  ];
  const positions:number[]=[], indices:number[]=[],doorIndices:number[]=[];
  const access=c.driverAccess!,hinge=new T.Group(),door=new T.Group();
  hinge.name='Driver door hinge';hinge.position.set(-.80,.62,access.doorFrontZ);
  door.name='Driver door';hinge.add(door);root.add(hinge);
  // Additional stations resolve smooth circular arches instead of bridging openings.
  const zs = new Set([...stations.map(s=>s[0]!),access.doorFrontZ,access.doorRearZ,-1.04,.70]);
  for(const axle of [-1.35,1.35])for(let i=0;i<=24;i++)zs.add(axle-.425+i*.85/24);
  for(let z=-2.3;z<2.3;z+=.10)zs.add(z);
  const sorted=[...zs].sort((a,b)=>a-b);
  for(const z of sorted) {
    let a=stations[0]!,b=a;
    for(let i=1;i<stations.length;i++){b=stations[i]!;if(z<=b[0]!)break;a=b;}
    const t=a===b?0:(z-a[0]!)/(b[0]!-a[0]!);
    const w=T.MathUtils.lerp(a[1]!,b[1]!,t), top=T.MathUtils.lerp(a[2]!,b[2]!,t);
    const dist=Math.min(Math.abs(z+1.35),Math.abs(z-1.35));
    const arch=dist<.425?.36+Math.sqrt(.425**2-dist**2):.15;
    const innerArch=dist<.425?w*.64:w*.97;
    const high=Math.max(top,arch+.025);
    const centre=z<-.95?Math.min(top,.60+Math.max(0,z+1.35)*.20):top;
    const ring=[[0,.09],[w*.64,.09],[innerArch,Math.max(.19,arch)],[w,Math.max(high-.06,arch)],
      [w*.92,high-.010],[w*.76,high],[w*.36,centre+.008],[0,centre],[-w*.36,centre+.008],[-w*.76,high],[-w*.92,high-.010],[-w,Math.max(high-.06,arch)],[-innerArch,Math.max(.19,arch)],[-w*.64,.105]];
    // Keep lower floor inside the tyre's inboard face near each axle.
    for(const [x,y] of ring)positions.push(x!,y!,z);
  }
  const n=14;
  for(let j=0;j<sorted.length-1;j++)for(let i=0;i<n;i++) {
    // Open the cockpit above the monocoque floor rather than putting a body
    // deck through the occupants and the steering column.
    const midpoint=(sorted[j]!+sorted[j+1]!)*.5;
    if((i>=5&&i<=8)&&midpoint>-1.04&&midpoint<.70)continue;
    const a=j*n+i,b=j*n+(i+1)%n;const target=midpoint>access.doorFrontZ&&midpoint<access.doorRearZ&&(i>=9&&i<=11)?doorIndices:indices;
    target.push(a,b,b+n,a,b+n,a+n);
  }
  for(let i=1;i<n-1;i++)indices.push(0,i+1,i);
  const shell=new T.BufferGeometry();shell.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  shell.setIndex(indices);shell.computeVertexNormals();
  mesh('Jesko continuous widebody arch shell',shell,paint).userData.vehicleBodyPart='main-shell';
  const doorGeometry=shell.clone();doorGeometry.setIndex(doorIndices);doorGeometry.computeVertexNormals();
  doorGeometry.translate(-hinge.position.x,-hinge.position.y,-hinge.position.z);
  mesh('Driver door outer skin',doorGeometry,paint,0,0,0,door);
  // A dark inner return closes the thickness of the moving carbon door.
  const inner=box('Jesko driver door carbon return',.025,.38,1.47,-.755,.435,-.155,carbon);
  inner.position.sub(hinge.position);door.add(inner);
  const splitter=new T.Shape([new T.Vector2(-.94,-.20),new T.Vector2(-.79,-.28),new T.Vector2(.79,-.28),
    new T.Vector2(.94,-.20),new T.Vector2(.96,.17),new T.Vector2(.77,.20),new T.Vector2(-.77,.20),new T.Vector2(-.96,.17)]);
  const splitterGeometry=new T.ExtrudeGeometry(splitter,{depth:.020,bevelEnabled:false});splitterGeometry.rotateX(Math.PI/2);
  mesh('Jesko shaped front splitter',splitterGeometry,carbon,0,.115,-2.02);
  box('Jesko rear diffuser floor',1.70,.025,.65,0,.15,1.94);
  box('Jesko front central intake',1.18,.15,.025,0,.32,-2.292,black);
  for(const side of [-1,1]) {
    const x=side*.79;
    const housing=box('Jesko swept headlight housing',.33,.045,.25,x,.565,-1.99,black);housing.rotation.y=side*-.24;
    const circuit=(m:T.Mesh,key:string)=>{m.userData.lightingKey=key;m.userData.refinedOptics=true;};
    for(const offset of [-.065,0,.065])circuit(box('Jesko triple blade DRL',.24,.012,.018,x,.591,-1.99+offset,led),'position');
    circuit(box('Jesko projector lens',.16,.025,.02,x,.56,-2.075,led),'head');
    circuit(box('Jesko front indicator',.17,.012,.018,x,.54,-2.078,led),side<0?'left':'right');
    circuit(box('Jesko rear light blade',.53,.025,.025,side*.59,.655,2.298,red),'tail');
    circuit(box('Jesko brake light blade',.45,.014,.025,side*.59,.629,2.298,red),'brake');
    circuit(box('Jesko rear indicator',.19,.014,.025,side*.80,.602,2.298,led),side<0?'left':'right');
    circuit(box('Jesko reversing lamp',.09,.025,.025,side*.29,.44,2.298,led),'reverse');
    const sill=box('Jesko carbon sill winglet',.085,.08,1.8,side*.955,.17,.05);sill.rotation.z=side*-.08;
    box('Jesko deep side engine intake',.025,.25,.30,side*.995,.52,.77,black);
    const lip=box('Jesko intake leading blade',.035,.29,.045,side*.972,.53,.62);lip.rotation.z=side*-.16;
    const canard=box('Jesko front dive plane',.15,.018,.28,side*.94,.36,-1.95);canard.rotation.x=-.15;
    box('Jesko hood extraction vent',.21,.014,.35,side*.37,.637,-1.22,black);
    // Slim canopy pillars, transparent side glazing and inset roof.
    const points=[[side*.73,.72,-.91],[side*.55,1.165,-.39],[side*.57,1.17,.41],[side*.73,.74,.60]];
    if(side<0){
      const mount=new T.Group();mount.name='Driver window glass mount';door.add(mount);
      const localPlane=new T.Plane(new T.Vector3(0,1,0),-(.741-hinge.position.y)),clip=localPlane.clone();
      const movingGlass=glass.clone();movingGlass.clippingPlanes=[clip];
      const pane=quad('Driver window glass',points.map(p=>[p[0]!-hinge.position.x,p[1]!-hinge.position.y,p[2]!-hinge.position.z]),movingGlass,mount);
      pane.renderOrder=2;
      mount.userData.driverWindowClipPlane=clip;mount.userData.driverWindowClipPlaneLocal=localPlane;
    }else quad('Jesko side canopy glass',points,glass);
    const pane=(side<0?door:root).getObjectByName(side<0?'Driver window glass':'Jesko side canopy glass') as T.Mesh;
    const sidePositions:number[]=[],sideIndices:number[]=[];
    for(let j=0;j<=12;j++){
      const v=j/12,front=jeskoWindshieldPoint(side,v),back=new T.Vector3(side*T.MathUtils.lerp(.73,.57,v),T.MathUtils.lerp(.74,1.17,v),T.MathUtils.lerp(.60,.41,v));
      for(const p of [front,back]){if(side<0)p.sub(hinge.position);sidePositions.push(...p.toArray());}
      if(j<12){const a=j*2;sideIndices.push(a,a+1,a+3,a,a+3,a+2);}
    }
    pane.geometry.dispose();pane.geometry=new T.BufferGeometry();pane.geometry.setAttribute('position',new T.Float32BufferAttribute(sidePositions,3));pane.geometry.setIndex(sideIndices);pane.geometry.computeVertexNormals();
    box('Jesko roof side rail',.045,.035,.84,side*.565,1.18,.02,carbon);
    root.add(jeskoCanopyRail('Jesko thin A pillar',t=>jeskoWindshieldPoint(side,t),.018,paint));
    root.add(jeskoCanopyRail('Jesko bonded A pillar seal',t=>jeskoWindshieldPoint(side*.972,t).add(new T.Vector3(0,0,.001)),.006,black));
    const from=new T.Vector3(side*.57,1.17,.43),to=new T.Vector3(side*.73,.74,.60);
    const direction=to.clone().sub(from);
    const rearPillar=mesh('Jesko rear canopy buttress',new T.CylinderGeometry(.024,.035,direction.length(),6),paint);
    rearPillar.position.copy(from).add(to).multiplyScalar(.5);
    rearPillar.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),direction.normalize());
  }
  mesh('Jesko wraparound windshield',jeskoWindshieldGeometry(),glass);
  root.add(jeskoCanopyRail('Jesko curved upper windshield bond',t=>jeskoWindshieldPoint(t*2-1,1),.018,carbon,32));
  root.add(jeskoCanopyRail('Jesko curved cowl seal',t=>jeskoWindshieldPoint(t*2-1,0),.012,black,32));
  // A curved cowl apron closes the swept glass edge onto the existing dash.
  const apron:number[]=[],apronIndices:number[]=[];
  for(let i=0;i<=32;i++){
    const p=jeskoWindshieldPoint(i/16-1,0);apron.push(p.x,p.y-.008,p.z,p.x,.695,-1.065);
    if(i<32){const a=i*2;apronIndices.push(a,a+1,a+3,a,a+3,a+2);}
  }
  const apronGeometry=new T.BufferGeometry();apronGeometry.setAttribute('position',new T.Float32BufferAttribute(apron,3));apronGeometry.setIndex(apronIndices);apronGeometry.computeVertexNormals();
  mesh('Jesko swept windshield cowl apron',apronGeometry,carbon);
  quad('Jesko rear engine glass',[[-.57,1.17,.43],[.57,1.17,.43],[.66,.77,1.05],[-.66,.77,1.05]],glass);
  box('Jesko removable carbon roof',1.12,.035,.81,0,1.192,.015,carbon);
  box('Jesko rear engine cover spine',.17,.04,.84,0,.80,1.37,carbon);
  quad('Jesko rear upper fascia',[[-.87,.54,2.30],[.87,.54,2.30],[.87,.64,2.30],[-.87,.64,2.30]],paint);
  box('Jesko open rear grille backing',1.66,.175,.012,0,.4475,2.286,black);
  quad('Jesko rising diffuser ramp',[[-.83,.11,1.76],[.83,.11,1.76],[.83,.36,2.308],[-.83,.36,2.308]],carbon);
  for(const side of [-1,1])box('Jesko outer nose intake',.21,.12,.016,side*.73,.34,-2.302,black);
  for(let i=0;i<7;i++) {
    const x=(i-3)*.225;
    const fin=quad('Jesko diffuser vertical strake',[[x,.10,1.77],[x,.15,2.308],[x,.39,2.308],[x,.16,1.77]],carbon);
    // Both faces of a thin carbon fin are visible through the open rear outlet.
    if(fin.material instanceof T.MeshStandardMaterial)fin.material.side=T.DoubleSide;
  }
  const exhaust=mesh('Jesko central Inconel exhaust',new T.CylinderGeometry(.065,.065,.12,16,1,true),silver,0,.43,2.245);
  exhaust.rotation.x=Math.PI/2;
  const wing=new T.Group();wing.name='Jesko active rear wing';wing.position.set(0,1.010,1.88);root.add(wing);
  box('Jesko twin profile wing mainplane',1.94,.035,.36,0,0,0,carbon,wing);
  box('Jesko twin profile wing flap',1.94,.025,.13,0,.035,.23,carbon,wing);
  for(const side of [-1,1]) {
    box('Jesko wing endplate',.025,.22,.61,side*.972,.015,.075,carbon,wing);
    const p=box('Jesko swan neck wing pylon',.035,.31,.10,side*.37,.89,1.84);p.rotation.x=-.15;
  }
  const atlas=new ExteriorDetailAtlas();
  const regions=new Map<string,ReturnType<ExteriorDetailAtlas['polygon']>>();
  root.traverse(o=>{
    if(!(o instanceof T.Mesh)||!/intake|grille backing|extraction vent|headlight housing/.test(o.name))return;
    const kind=o.name.includes('headlight')?'headlamp':o.name.includes('vent')?'cooling vent':'intake';
    let region=regions.get(kind);
    if(!region){region=atlas.polygon(kind,[[0,0],[1,0],[1,1],[0,1]],new T.Color(0x11171b),kind==='intake'?'ferrari':undefined);regions.set(kind,region);}
    o.material=atlas.material(black);atlas.uv(o.geometry,region);
  });
  const flaps=new T.Group();flaps.name='Jesko active front flaps';flaps.position.set(0,.125,-1.98);root.add(flaps);
  for(const side of [-1,1])box('Jesko front underbody flap',.44,.018,.22,side*.54,0,0,carbon,flaps);
}

export function buildJeskoAttackWheels(root:T.Group,c:VehicleVisualConfig):{pivots:Record<VehicleWheelId,T.Group>;wheels:T.Mesh[]} {
  const pivots={} as Record<VehicleWheelId,T.Group>,wheels:T.Mesh[]=[];
  const alloy=new T.MeshStandardMaterial({color:0x626d72,metalness:.88,roughness:.24});
  const carbon=new T.MeshStandardMaterial({color:0x22282b,metalness:.4,roughness:.6});
  const caliper=new T.MeshStandardMaterial({color:0xb4d52c,metalness:.45,roughness:.3});
  const positions=localWheelPositions(c.dimensions);
  for(const id of VEHICLE_WHEEL_IDS) {
    const front=id.startsWith('front'),side=id.endsWith('Left')?-1:1;
    const width=(front?c.dimensions.frontWheelWidth:c.dimensions.rearWheelWidth)!,rim=front?.254:.2667;
    const pivot=new T.Group();pivot.name=`Jesko ${id} wheel pivot`;pivot.userData.wheelId=id;
    const p=positions[id];pivot.position.set(p.x,p.y-(c.staticBodyOffsetY??0),p.z);root.add(pivot);pivots[id]=pivot;
    const r=c.wheelRadius;
    const profile=[[rim-.008,-width/2],[rim+.015,-width/2],[r-.012,-width*.40],[r,-width*.28],
      [r,width*.28],[r-.012,width*.40],[rim+.015,width/2],[rim-.008,width/2],[rim-.008,-width/2]];
    const tyreGeo=new T.LatheGeometry(profile.map(p=>new T.Vector2(p[0]!,p[1]!)),48);tyreGeo.rotateZ(Math.PI/2);
    const tyre=new T.Mesh(tyreGeo,new T.MeshStandardMaterial({map:tyreDetailTexture(width,0x101214),roughness:.88}));tyre.name=`Jesko ${id} Cup tyre`;tyre.castShadow=true;pivot.add(tyre);wheels.push(tyre);
    const discGeo=new T.CylinderGeometry(front?.205:.1975,front?.205:.1975,.025,36);discGeo.rotateZ(Math.PI/2);
    const disc=new T.Mesh(discGeo,carbon);disc.name='Jesko carbon ceramic brake disc';disc.position.x=side*width*.34;tyre.add(disc);
    const lipGeo=new T.TorusGeometry(rim,.012,8,40);lipGeo.rotateY(Math.PI/2);
    const lip=new T.Mesh(lipGeo,alloy);lip.position.x=side*(width*.5-.012);tyre.add(lip);
    for(let j=0;j<7;j++) {
      const spoke=new T.Mesh(new T.BoxGeometry(.018,.035,rim*.91),alloy);
      const a=j/7*Math.PI*2;spoke.position.set(side*width*.5,Math.sin(a)*rim*.5,Math.cos(a)*rim*.5);
      spoke.rotation.x=-a;spoke.name='Jesko seven spoke forged wheel';tyre.add(spoke);
    }
    const hubGeo=new T.CylinderGeometry(.034,.034,.025,12);hubGeo.rotateZ(Math.PI/2);
    const hub=new T.Mesh(hubGeo,alloy);hub.position.x=side*(width*.5-.01);hub.name='Jesko center lock';tyre.add(hub);
    const brake=new T.Mesh(new T.BoxGeometry(.045,.14,.065),caliper);brake.position.set(side*width*.35,0,.16);
    brake.name='Jesko fixed brake caliper';pivot.add(brake);
  }
  return {pivots,wheels};
}
