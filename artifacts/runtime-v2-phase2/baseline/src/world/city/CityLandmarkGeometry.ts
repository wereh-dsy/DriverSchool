import { BoxGeometry, CircleGeometry, CylinderGeometry, ExtrudeGeometry, Group, Mesh, RingGeometry, Shape, SphereGeometry, type BufferGeometry, type Material } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CityObject } from './CityMapData';
import type { Subject3Materials } from '../subject3/materials';
import { cityBuildingGeometry } from './CityBuildingGeometry';

/** Small semantic landmark kit. Every volume stays inside the existing prefab
 * envelope; columns, roof ribs and glazing merge by shared material once. */
export function cityLandmarkTemplate(kind:NonNullable<CityObject['landmarkModel']>,size:[number,number,number],m:Subject3Materials,heightBand=1):Group {
  const [w,h,d]=size,root=new Group(),parts:Mesh[]=[];
  const part=(geometry:BufferGeometry,material:Material,x=0,y=0,z=0)=>{const mesh=new Mesh(geometry,material);mesh.position.set(x,y,z);parts.push(mesh);return mesh;};
  const box=(a:number,b:number,c:number,x:number,y:number,z:number,material:Material=m.buildingLight)=>part(new BoxGeometry(a,b,c),material,x,y,z);
  const label=(width:number,height:number,y:number,z=d/2-.015)=>{
    box(width*1.04,height*1.15,.12,0,y,z-.08,m.signBlue);
    const mesh=part(new BoxGeometry(width,height,.015),m.signWhite,0,y,z);mesh.userData.signLabel=true;mesh.userData.landmarkLabel=true;
  };
  const windows=(front:number,y:number,height:number,width=w*.86)=>{
    box(width,height,.08,0,y,front,m.glassDark);
    for(let x=-width/2;x<=width/2;x+=Math.max(1.5,w/14))box(.12,height+.1,.12,x,y,front+.01,m.metal);
  };
  const barrel=(width:number,length:number,x:number,base:number,rise:number)=>{
    const roof=new Shape();
    for(let i=0;i<=16;i++){const t=Math.PI-i*Math.PI/16,px=Math.cos(t)*width/2,py=base+Math.sin(t)*rise;i?roof.lineTo(px,py):roof.moveTo(px,py);}
    for(let i=16;i>=0;i--){const t=Math.PI-i*Math.PI/16;roof.lineTo(Math.cos(t)*(width/2-.22),base+Math.sin(t)*Math.max(.1,rise-.22));}roof.closePath();
    const geometry=new ExtrudeGeometry(roof,{depth:length,bevelEnabled:false,curveSegments:1});geometry.translate(x,0,-length/2);part(geometry,m.roof);
  };
  if(kind==='station') {
    box(w*.96,h*.67,d*.96,0,h*.335,0,m.buildingWarm);barrel(w,d,0,h*.66,h*.34);
    windows(d/2-.02,h*.36,h*.42,w*.84);
    box(w*.8,.22,d*.16,0,h*.45,d*.40,m.roof);
    label(w*.25,h*.12,h*.665);
    const clock=part(new CircleGeometry(Math.min(w*.035,h*.08),24),m.signWhite,0,h*.86,d/2-.012);
    box(.11,h*.07,.025,0,clock.position.y+h*.025,d/2-.001,m.darkMetal);box(w*.025,.10,.025,w*.01,clock.position.y,d/2-.001,m.darkMetal);
  } else if(kind==='government'||kind==='university') {
    const body=cityBuildingGeometry(w*.98,h*.78,d*.96,'courtyard',1);body.translate(0,h*.39,0);part(body,m.buildingLight);
    const roof=cityBuildingGeometry(w,.22,d,'courtyard',1,true);roof.translate(0,h*.79,0);part(roof,m.roof);
    for(const wing of [-1,1])for(const floor of [.2,.4,.6])box(w*.22,h*.095,.07,wing*w*.365,h*floor,d*.485,m.glassDark);
    for(const x of [-.22,-.11,0,.11,.22])part(new CylinderGeometry(.27,.34,h*.62,8),m.buildingWarm,w*x,h*.31,d*.39);
    box(w*.58,.4,d*.30,0,h*.65,d*.34,m.buildingWarm);
    if(kind==='government') {
      const triangle=new Shape();triangle.moveTo(-w*.3,0);triangle.lineTo(w*.3,0);triangle.lineTo(0,h*.20);triangle.closePath();
      const g=new ExtrudeGeometry(triangle,{depth:d*.22,bevelEnabled:false});g.translate(0,h*.70,d*.27);part(g,m.buildingWarm);
      label(w*.48,h*.10,h*.67);
      box(.1,h*.08,.1,0,h*.96,0,m.metal);
    } else {
      // Broad library, central clock and a real entrance arcade read as campus.
      box(w*.18,h*.20,d*.40,0,h*.88,0,m.buildingWarm);
      part(new CircleGeometry(h*.075,24),m.signWhite,0,h*.88,d*.205);
      box(.09,h*.08,.03,0,h*.9,d*.21,m.darkMetal);box(w*.025,.09,.03,w*.012,h*.88,d*.21,m.darkMetal);
      label(w*.57,h*.11,h*.65);
    }
  } else if(kind==='museum') {
    const profile=new Shape();profile.moveTo(-w/2,0);profile.lineTo(w/2,0);profile.lineTo(w/2,h*.65);profile.lineTo(w*.12,h*.98);profile.lineTo(-w/2,h*.78);profile.closePath();
    const g=new ExtrudeGeometry(profile,{depth:d*.96,bevelEnabled:false});g.translate(0,0,-d*.48);part(g,m.buildingWarm);
    windows(d*.485,h*.36,h*.30,w*.72);label(w*.57,h*.12,h*.64,d*.49);
    for(const x of [-.44,.44])box(w*.045,h*.72,.25,w*x,h*.36,d*.485,m.wall);
  } else if(kind==='exhibition') {
    box(w*.98,h*.70,d*.96,0,h*.35,0,m.buildingLight);
    for(const x of [-1,0,1])barrel(w/3,d,x*w/3,h*.70,h*.28);
    windows(d/2-.02,h*.38,h*.44,w*.92);
    box(w*.88,.22,d*.17,0,h*.48,d*.405,m.roof);label(w*.58,h*.10,h*.665);
  } else if(kind==='tower') {
    const body=cityBuildingGeometry(w,h,d,'chamfered',heightBand),p=body.getAttribute('position');
    for(let i=0;i<p.count;i++){const y=p.getY(i)+h/2,t=y/h;p.setXYZ(i,p.getX(i)*(1-.2*t),y*(1-.08*(p.getX(i)/w+.5)),p.getZ(i)*(1-.16*t));}body.computeVertexNormals();part(body,m.glassDark).userData.landmarkFacade=true;
    for(const x of [-.33,-.11,.11,.33])box(w*.018,h*.88,.12,w*x,h*.44,d*.43,m.metal);
    box(w*.05,h*.92,.14,0,h*.46,d*.465,m.wall);
    label(w*.62,h*.05,h*.08,d*.496);
  } else if(kind==='stadium') {
    const wall=new CylinderGeometry(1,1,1,48,1,true);wall.scale(w/2,h*.8,d/2);part(wall,m.wall,0,h*.4,0);
    const canopy=new RingGeometry(.73,1,48);canopy.rotateX(-Math.PI/2);canopy.scale(w/2,1,d/2);part(canopy,m.roof,0,h*.94,0);
    for(let i=0;i<16;i++){const t=i*Math.PI/8;box(.22,h*.9,.22,Math.cos(t)*w*.46,h*.45,Math.sin(t)*d*.46,m.metal);}
    box(w*.69,.05,d*.60,0,.05,0,m.grass);
    for(const z of [-.27,.27])box(w*.67,.02,.14,0,.09,d*z,m.whitePaint);
    for(const x of [-.335,0,.335])box(.14,.02,d*.54,w*x,.09,0,m.whitePaint);
    const center=new RingGeometry(5,5.14,32);center.rotateX(-Math.PI/2);part(center,m.whitePaint,0,.09,0);
    label(w*.26,h*.11,h*.6,d/2+.055);
  } else {
    const shell=new SphereGeometry(1,32,12,0,Math.PI*2,0,Math.PI/2);shell.scale(w/2,h*.48,d/2);part(shell,m.roof,0,h*.50,0);
    const wall=new CylinderGeometry(1,1,1,32);wall.scale(w*.49,h*.50,d*.49);part(wall,m.buildingLight,0,h*.25,0);
    windows(d/2-.08,h*.24,h*.28,w*.70);label(w*.53,h*.1,h*.45,d/2-.02);
  }
  const batches=new Map<string,Mesh[]>();
  for(const mesh of parts){mesh.updateMatrix();const key=(mesh.material as Material).uuid+':'+!!mesh.userData.signLabel+':'+!!mesh.userData.landmarkFacade,group=batches.get(key)??[];group.push(mesh);batches.set(key,group);}
  for(const group of batches.values()) {
    const geometries=group.map(mesh=>{const g=mesh.geometry.clone().applyMatrix4(mesh.matrix);if(!g.index)return g;const flat=g.toNonIndexed();g.dispose();return flat;}),geometry=mergeGeometries(geometries)!;geometries.forEach(g=>g.dispose());
    const mesh=new Mesh(geometry,group[0]!.material);mesh.userData.signLabel=group[0]!.userData.signLabel;mesh.userData.landmarkLabel=group[0]!.userData.landmarkLabel;mesh.userData.landmarkFacade=group[0]!.userData.landmarkFacade;root.add(mesh);
  }
  parts.forEach(mesh=>mesh.geometry.dispose());return root;
}
