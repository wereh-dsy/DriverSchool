import * as T from 'three';
import type { VehicleVisualConfig } from './VehicleVisualConfig';
import type { InstrumentCluster, InstrumentTelemetry } from './InstrumentCluster';
import { JeskoAttackInstruments } from './JeskoAttackInstruments';
import { atlasPlane, ensureJeskoSurfaceUV, jeskoDetailAtlas, jeskoSurfaceTile } from './JeskoCabinTextures';
import { jeskoLoft, jeskoRoundedShape } from './JeskoCabinGeometry';

/** Reference-led moulded dash, carbon centre spine and wheel-mounted cluster.
 * Fine weave, embroidery, vent cores and key legends are textures, not meshes. */
export function addJeskoAttackCabin(root:T.Group,config:VehicleVisualConfig,cluster:InstrumentCluster){
  const weave=jeskoSurfaceTile(true),grain=jeskoSurfaceTile(false),atlas=jeskoDetailAtlas();
  const carbon=new T.MeshPhysicalMaterial({color:0x30373c,map:weave,roughness:.43,metalness:0,clearcoat:.25,clearcoatRoughness:.30,envMapIntensity:.25,side:T.DoubleSide});
  const pad=new T.MeshStandardMaterial({color:0x51575c,map:grain,bumpMap:grain,bumpScale:.00016,roughness:.98,side:T.DoubleSide});
  const dark=new T.MeshStandardMaterial({color:0x11171c,roughness:.76});
  const metal=new T.MeshStandardMaterial({color:0x9ca8b0,roughness:.24,metalness:.94});
  const white=new T.MeshStandardMaterial({color:0xb7bfc4,roughness:.80});
  const detail=new T.MeshStandardMaterial({map:atlas,transparent:true,alphaTest:.05,roughness:.75,metalness:.1,depthWrite:true});
  const used=new Set<T.Material>(),replaced=new Set<T.Material>();
  const mesh=(name:string,geometry:T.BufferGeometry,material:T.Material,parent:T.Object3D=root)=>{
    const m=new T.Mesh(geometry,material);m.name=name;m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
  };
  const box=(name:string,size:[number,number,number],position:[number,number,number],material:T.Material=carbon,parent:T.Object3D=root)=>{
    const m=mesh(name,new T.BoxGeometry(...size),material,parent);m.position.set(...position);ensureJeskoSurfaceUV(m.geometry,true);return m;
  };
  root.traverse(o=>{
    if(!(o instanceof T.Mesh))return;
    const soft=/headliner|A-pillar|Windshield header|door card|armrest/.test(o.name);
    const woven=/door upper rail|inner sill|footwell|Cabin floor|Transmission tunnel|Windshield cowl shelf/.test(o.name);
    if(soft||woven){for(const m of Array.isArray(o.material)?o.material:[o.material])replaced.add(m);ensureJeskoSurfaceUV(o.geometry,o.geometry.type==='BoxGeometry');o.material=soft?pad:carbon;}
  });
  // The generic cowl reached through the sculpted pads. Terminate it at their
  // common front edge instead; no overlaid/copanar dashboard surfaces.
  const cowl=root.getObjectByName('Windshield cowl shelf') as T.Mesh;
  cowl.geometry.dispose();cowl.geometry=new T.BoxGeometry(1.452,.025,.036);
  cowl.position.set(0,.6875,-1.063);ensureJeskoSurfaceUV(cowl.geometry,true);
  // Two broad Alcantara lobes share the cowl datum and roll down into the fascia.
  for(const [label,stations] of [
    ['driver',[[-.72,.625],[-.61,.670],[-.45,.685],[-.25,.682],[-.08,.650]]],
    ['passenger',[[.20,.656],[.29,.680],[.46,.680],[.61,.664],[.72,.625]]],
  ] as const){
    const rings=stations.map(([x,top])=>{
      const profile=[[-1.045,.699],[-.91,top+.010],[-.77,top],[-.681,top-.013],[-.642,top-.045],
        [-.653,top-.115],[-.694,top-.190],[-.762,top-.204],[-1.045,.649]];
      const curve=new T.CatmullRomCurve3(profile.map(([z,y])=>new T.Vector3(x,y!,z!)),true,'centripetal');return curve.getPoints(20).slice(0,-1);
    });
    root.add(jeskoLoft(`Jesko continuous ${label} Alcantara dashboard`,rings,pad));
  }
  // A single rising carbon spine joins the centre vent, portrait screen and tunnel.
  const spineStations=[[-1.04,.707,.065],[-.90,.736,.092],[-.80,.752,.107],[-.69,.701,.124],[-.52,.532,.125],
    [-.30,.441,.113],[.07,.433,.107],[.36,.418,.109],[.63,.411,.116],[.78,.386,.132]];
  const spineRings=spineStations.map(([z,y,w])=>[
    [-w!*.80,y!],[w!*.80,y!],[w!,y!-.020],[w!,.16],[-w!,.16],[-w!,y!-.020],
  ].map(([x,yy])=>new T.Vector3(.06+x!,yy!,z!)));
  root.add(jeskoLoft('Jesko continuous carbon centre spine',spineRings,carbon));
  const vent=(name:string,position:[number,number,number],width:number,height:number)=>{
    const group=new T.Group();group.name=name;group.position.set(...position);group.rotation.x=-.10;root.add(group);
    const podRings=[[-.095,.77,-.020],[-.042,1.03,0],[-.014,1.02,0]].map(([z,scale,dy])=>
      Array.from({length:16},(_,n)=>{
        const a=n/16*Math.PI*2;
        return new T.Vector3(Math.cos(a)*width*.52*scale!,Math.sin(a)*height*.55*scale!+dy!,z!);
      }));
    group.add(jeskoLoft(name+' carbon duct body',podRings,carbon));
    const outline=jeskoRoundedShape(width,height,height*.36);
    const hole=jeskoRoundedShape(width-.007,height-.007,height*.32);outline.holes.push(new T.Path(hole.getPoints(5).reverse()));
    const rim=mesh(`${name} polished rim`,new T.ExtrudeGeometry(outline,{depth:.016,steps:1,curveSegments:4,bevelEnabled:true,bevelSize:.001,bevelThickness:.0007,bevelSegments:1}),metal,group);rim.position.z=-.014;
    const g=new T.ShapeGeometry(jeskoRoundedShape(width-.006,height-.006,height*.32),4),p=g.getAttribute('position'),uv=g.getAttribute('uv');
    for(let n=0;n<p.count;n++)uv.setXY(n,(p.getX(n)/(width-.006)+.5)*.5,1-(.5-p.getY(n)/(height-.006))*.25);
    const face=mesh(`${name} honeycomb core`,g,new T.MeshStandardMaterial({map:atlas,roughness:.43,metalness:.65}),group);face.position.z=.001;
  };
  vent('Jesko centre oval vent',[.06,.777,-.710],.115,.069);
  vent('Jesko left oval vent',[-.605,.640,-.612],.103,.057);
  vent('Jesko right oval vent',[.635,.625,-.612],.103,.057);
  // Project the stitched badge onto the actual curved passenger pad.
  const embroidery=atlasPlane(.300,.146,detail,[512,0,512,256],[16,8]);
  embroidery.name='Jesko passenger embroidered panel';embroidery.position.set(.431,.560,0);
  const fascia=root.getObjectByName('Jesko continuous passenger Alcantara dashboard')!;
  fascia.updateMatrixWorld(true);const decalRay=new T.Raycaster(),ep=embroidery.geometry.getAttribute('position');
  for(let n=0;n<ep.count;n++){
    decalRay.set(new T.Vector3(ep.getX(n)+.431,ep.getY(n)+.560,-.35),new T.Vector3(0,0,-1));
    const hit=decalRay.intersectObject(fascia,false)[0];
    if(hit)ep.setZ(n,hit.point.z+.0008);
  }
  ep.needsUpdate=true;embroidery.geometry.computeVertexNormals();root.add(embroidery);
  const portrait=new JeskoAttackInstruments(true);portrait.position.set(.06,.626,-.604);portrait.rotation.set(-.80,-.025,0);root.add(portrait);
  // Locate the actual SmartCluster inside the upper steering rim, not on the dash.
  const wheel=root.getObjectByName('Animated steering wheel')!,base=root.getObjectByName('Steering assembly')!;
  // Preserve the configured rest pose when mounting to the rotating wheel.
  const screenOffset=cluster.position.clone().sub(base.position).applyQuaternion(base.quaternion.clone().invert());
  cluster.removeFromParent();wheel.add(cluster);cluster.position.copy(screenOffset);cluster.rotation.set(0,0,0);cluster.scale.setScalar(1);
  const supportRings=[
    [new T.Vector3(-.062,.060,.026),new T.Vector3(.062,.060,.026),new T.Vector3(.062,.148,.026),new T.Vector3(-.062,.148,.026)],
    [new T.Vector3(-.046,.020,-.065),new T.Vector3(.046,.020,-.065),new T.Vector3(.057,.121,-.065),new T.Vector3(-.057,.121,-.065)],
  ];
  wheel.add(jeskoLoft('Jesko continuous carbon steering-column shroud',supportRings,carbon));
  // Keep the rim's existing triangle budget, shaping both its flattened ends.
  const rim=wheel.getObjectByName('Steering wheel rim') as T.Mesh;replaced.add(rim.material as T.Material);
  const rp=rim.geometry.getAttribute('position');
  for(let n=0;n<rp.count;n++){const y=rp.getY(n);if(y>.145)rp.setY(n,.145+(y-.145)*.55);if(y<-.108)rp.setY(n,-.108+(y+.108)*.34);}
  rp.needsUpdate=true;rim.geometry.computeVertexNormals();rim.geometry.computeBoundingSphere();
  const rimGrain=jeskoSurfaceTile(false);rimGrain.repeat.set(1,1);
  const pixels=(rimGrain.image as {data:Uint8Array;width:number;height:number}).data;
  for(let y=0;y<128;y++)for(let x=31;x<=32;x++){const p=(y*128+x)*4;pixels[p]=pixels[p+1]=pixels[p+2]=210;}
  rimGrain.needsUpdate=true;
  const rimPad=new T.MeshStandardMaterial({color:0x6b7379,map:rimGrain,roughness:.98});rim.material=[rimPad,carbon];rim.geometry.clearGroups();
  const idx=rim.geometry.getIndex()!;let range=0,current=-1;
  for(let n=0;n<idx.count;n+=3){const y=(rp.getY(idx.getX(n))+rp.getY(idx.getX(n+1))+rp.getY(idx.getX(n+2)))/3,material=y<-.080?1:0;
    if(material!==current){if(n>range)rim.geometry.addGroup(range,n-range,current);range=n;current=material;}}
  rim.geometry.addGroup(range,idx.count-range,current);
  const lower=wheel.getObjectByName('Steering wheel lower spoke') as T.Mesh;
  if(lower){lower.removeFromParent();lower.geometry.dispose();replaced.add(lower.material as T.Material);}
  for(const side of [-1,1]){
    const spoke=wheel.getObjectByName(side<0?'Steering wheel left spoke':'Steering wheel right spoke') as T.Mesh;
    const points=[[.048,-.046],[.158,-.027],[.162,.022],[.061,.027]].map(([x,y])=>new T.Vector2(side*x!,y!));
    const shape=new T.Shape(side<0?points.reverse():points);spoke.geometry.dispose();
    spoke.geometry=new T.ExtrudeGeometry(shape,{depth:.016,steps:1,bevelEnabled:true,bevelSize:.001,bevelThickness:.001,bevelSegments:1});
    replaced.add(spoke.material as T.Material);spoke.material=dark;spoke.position.set(0,0,0);spoke.rotation.set(0,0,0);
    const paddle=base.getObjectByName(side<0?'Fixed downshift paddle':'Fixed upshift paddle') as T.Mesh;
    replaced.add(paddle.material as T.Material);paddle.material=metal;paddle.scale.set(.73,.65,.8);paddle.position.set(side*.150,.020,-.046);
    const legend=atlasPlane(.016,.023,detail,[side<0?768:512,896,256,128]);legend.name='Jesko paddle legend';legend.position.set(0,.058,.0065);paddle.add(legend);
  }
  const accent=wheel.getObjectByName('Sport mode switch accent') as T.Mesh;
  if(accent){accent.removeFromParent();accent.geometry.dispose();replaced.add(accent.material as T.Material);}
  const hub=wheel.getObjectByName('Steering wheel hub') as T.Mesh;replaced.add(hub.material as T.Material);hub.material=dark;hub.scale.set(.93,1,.93);
  const hubRing=mesh('Jesko hub polished perimeter',new T.TorusGeometry(.060,.0015,5,40),metal,wheel);hubRing.position.z=.037;
  const shield=atlasPlane(.040,.042,detail,[320,256,384,256]);shield.name='Jesko embossed steering shield';shield.position.set(0,.004,.038);wheel.add(shield);
  const nameplate=atlasPlane(.110,.015,detail,[512,512,512,128]);nameplate.name='Jesko lower rim nameplate';nameplate.position.set(0,-.121,.018);wheel.add(nameplate);
  const selector=root.getObjectByName('LST compact selector panel')!;selector.position.set(...config.gearLeverPosition);
  const plate=atlasPlane(.100,.235,detail,[0,512,512,512]);plate.name='Jesko polished selector deck';plate.rotation.x=-Math.PI/2;plate.position.set(0,.004,0);selector.add(plate);
  const boot=mesh('Jesko selector leather boot',new T.ConeGeometry(.034,.040,16),pad,selector);boot.position.y=.023;
  const stalk=mesh('Jesko polished selector stem',new T.CylinderGeometry(.010,.012,.073,12),metal,selector);stalk.position.y=.074;
  const knob=mesh('Jesko compact selector grip',new T.CylinderGeometry(.025,.024,.043,20),dark,selector);knob.position.y=.127;
  const cap=mesh('Jesko selector polished cap',new T.CylinderGeometry(.024,.025,.004,20),metal,selector);cap.position.y=.150;
  for(const z of [.36,.53]){
    const cup=mesh('Jesko recessed cup well',new T.CylinderGeometry(.042,.038,.011,24),dark);cup.position.set(.06,.423,z);
    const lip=mesh('Jesko cup well metal lip',new T.TorusGeometry(.042,.0016,4,24),metal);lip.rotation.x=Math.PI/2;lip.position.set(.06,.429,z);
  }
  for(const [label,x] of [['driver',-.37],['passenger',.37]] as const){
    const shell=box(`Jesko ${label} carbon bucket shell`,[.43,.52,.045],[x,.59,.49]);shell.rotation.x=.15;
    box(`Jesko ${label} bucket cushion`,[.34,.065,.44],[x,.285,.27],pad);
    const back=box(`Jesko ${label} Alcantara back pad`,[.29,.41,.05],[x,.57,.446],pad);back.rotation.x=.15;
    box(`Jesko ${label} integrated headrest`,[.24,.17,.075],[x,.91,.55],pad);
    for(const side of [-1,1]){box(`Jesko ${label} white seat bolster`,[.050,.17,.46],[x+side*.20,.35,.29],white).rotation.z=side*-.15;
      box(`Jesko ${label} white shoulder wing`,[.065,.18,.12],[x+side*.18,.73,.46],white);}
  }
  box('Jesko carbon engine bulkhead',[1.43,.69,.025],[0,.48,.72]);
  root.traverse(o=>{if(o instanceof T.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])used.add(m);});
  replaced.forEach(m=>{if(!used.has(m))m.dispose();});
  // Local task lighting: no transverse dashboard ribbon or decorative RGB loop.
  const guide=new T.MeshStandardMaterial({color:0xb9bd9e,emissive:0xa1ae60,emissiveIntensity:0,roughness:.65});
  const marker=new T.MeshStandardMaterial({color:0xc5c1ad,emissive:0xffe4b0,emissiveIntensity:0,roughness:.75});
  for(const side of [-1,1]){
    box('Jesko recessed selector guide',[.0015,.0015,.145],[.06+side*.078,.437,.08],guide);
    const pull=box('Jesko door pull locator',[.002,.0015,.10],[side*.663,.517,-.19],marker);
    if(side<0)pull.name='Jesko driver door pull locator';
  }
  box('Jesko centre vent locator',[.024,.0012,.0018],[.06,.741,-.690],marker);
  const footLights=[-1,1].map(side=>{
    const light=new T.PointLight(0xffe5bd,0,.48,2);light.name='Jesko shielded footwell task light';
    light.position.set(side*.37,.38,-.58);root.add(light);return light;
  });
  let illumination=0;
  return {update:(t:InstrumentTelemetry,dt:number)=>{
    portrait.update(t,dt);
    const powered=t.ignitionOn??t.engineRunning??false;
    const lamps=t.indicators?.headlights||t.indicators?.positionLights;
    const daylight=T.MathUtils.clamp(t.ambientDaylight??1,0,1);
    const target=powered?(lamps?T.MathUtils.lerp(1,.10,daylight):.04):0;
    illumination=T.MathUtils.damp(illumination,target,5,Math.max(0,dt));
    guide.emissiveIntensity=illumination*.42;marker.emissiveIntensity=illumination*.30;
    footLights.forEach(l=>{l.intensity=illumination*.022;});
  }};
}
