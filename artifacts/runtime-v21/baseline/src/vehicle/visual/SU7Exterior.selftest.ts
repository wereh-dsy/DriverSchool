import * as T from 'three';
import {getVehicleDescriptor} from '../VehicleCatalog';
import {localWheelPositions,VEHICLE_WHEEL_IDS} from '../VehicleDimensions';
import {VehicleVisual} from './VehicleVisual';
import {VehicleAssetRegistry} from './VehicleAssetRegistry';
import {VehicleLighting} from './VehicleLighting';
import {VehicleLightingController} from '../control/VehicleLightingController';
import {VehicleInteractionController} from '../interaction/VehicleInteractionController';
import {applyVehicleInteractionVisual} from '../interaction/VehicleInteractionDefinition';

/** Geometry/material/light/access regression for the SU7 exterior only. */
export function runSU7ExteriorSelfTest(){
  let assertions=0;const assert=(ok:boolean,label:string)=>{assertions++;if(!ok)throw Error('SU7 exterior: '+label);};
  const needsDocument=typeof document==='undefined';
  if(needsDocument)Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({width:1,height:1,getContext:()=>null})}});
  const config=getVehicleDescriptor('xiaomi-su7-max-2026').visualConfig,assets=new VehicleAssetRegistry();
  const visual=new VehicleVisual(config,assets),other=new VehicleVisual(config,assets);
  let lighting:VehicleLighting|undefined;
  try{
    const mesh=(name:string)=>visual.root.getObjectByName(name) as T.Mesh<T.BufferGeometry,T.MeshStandardMaterial>;
    const paint=mesh('SU7 long sculpted bonnet').material as T.MeshPhysicalMaterial;
    const otherPaint=(other.root.getObjectByName('SU7 long sculpted bonnet') as T.Mesh<T.BufferGeometry,T.MeshPhysicalMaterial>).material;
    assert(paint!==otherPaint&&paint.color.g>paint.color.r&&paint.color.g>paint.color.b,'green paint is instance-owned');
    const original=paint.color.getHex();paint.color.set(0x111111);
    assert(otherPaint.color.getHex()===original&&config.body.color===original,'paint edits cannot pollute another instance or config');paint.color.set(original);
    assert(paint.clearcoat>.8&&paint.roughness>.2&&paint.metalness<.7,'bounded metallic/clearcoat finish');
    const atlas=mesh('SU7 nose badge').material.map!;
    assert(atlas?.name==='SU7 exterior detail atlas'&&atlas.image.width===1024&&atlas.image.height===512,'one bounded exterior atlas');
    assert(mesh('SU7 lower cooling inlet').material.map===atlas&&mesh('Left SU7 waterdrop lamp').material.map===atlas,'badge/grille/lens borrow one immutable texture');
    assert(mesh('SU7 nose badge').material!==mesh('SU7 isolated navigation display').material,'exterior detail materials isolated from cabin displays');
    for(const side of ['Left','Right']){
      const a=mesh(side+' SU7 structural A pillar');a.geometry.computeBoundingBox();
      const size=a.geometry.boundingBox!.getSize(new T.Vector3());
      assert(size.y>.35&&size.z>.60&&!!a.geometry.index,'A pillar spans cowl to roof with a closed section');
      assert(!!mesh(side+' SU7 gloss B pillar')&&!!mesh(side+' SU7 separate front wing'),'B pillar and front wing are independent panels');
    }
    const hood=mesh('SU7 long sculpted bonnet'),badge=mesh('SU7 nose badge');
    visual.root.updateMatrixWorld(true);
    assert(new T.Box3().setFromObject(hood).expandByScalar(.003).containsBox(new T.Box3().setFromObject(badge)),'front badge follows bonnet instead of floating on the bumper');
    const wind=mesh('SU7 panoramic windshield'),p=wind.geometry.getAttribute('position');
    const mid=14*21,centreZ=p.getZ(mid+10),edgeZ=p.getZ(mid+20);
    assert(edgeZ-centreZ>.025&&p.getY(mid+10)>p.getY(mid+20),'windscreen has longitudinal slope and transverse wrap');
    assert(!wind.castShadow&&wind.material.transparent,'clear windscreen does not become an opaque shadow');
    const rear=mesh('SU7 fastback rear glass'),deck=mesh('SU7 short rear deck');
    const rp=rear.geometry.getAttribute('position'),dp=deck.geometry.getAttribute('position');let rearSeamGap=0;
    for(let i=0;i<=4;i++)rearSeamGap=Math.max(rearSeamGap,
      new T.Vector3().fromBufferAttribute(rp,28*21+i*5).distanceTo(new T.Vector3().fromBufferAttribute(dp,i*4)));
    assert(rearSeamGap<1e-6,'rear glass and deck share their complete joining curve');
    const quarter=mesh('Right SU7 flowing shoulder').geometry.getAttribute('position'),bumper=mesh('SU7 rear bumper').geometry.getAttribute('position');
    let bumperSeamGap=0;
    for(let i=0;i<=2;i++)bumperSeamGap=Math.max(bumperSeamGap,
      new T.Vector3().fromBufferAttribute(quarter,quarter.count-11+i*5).distanceTo(new T.Vector3().fromBufferAttribute(bumper,i*6*29+28)));
    assert(bumperSeamGap<1e-6,'rear bumper outer boundary closes onto quarter panel');
    let deckEndGap=0;
    for(let i=0;i<=4;i++)deckEndGap=Math.max(deckEndGap,
      new T.Vector3().fromBufferAttribute(dp,24*17+i*4).distanceTo(new T.Vector3().fromBufferAttribute(bumper,12*29+i*7)));
    assert(deckEndGap<1e-6,'crowned deck rear edge closes onto bumper top without a horizontal opening');
    const halo=mesh('SU7 continuous halo tail lamp');halo.geometry.computeBoundingBox();
    assert(halo.geometry.boundingBox!.getSize(new T.Vector3()).z>.12&&!!mesh('SU7 wrapped halo lamp housing'),'halo wraps around rear quarters instead of a flat floating ellipse');
    const bounds=visual.getVisualBodyBounds(),size=bounds.getSize(new T.Vector3());
    assert(Math.abs(size.z-config.dimensions.length)<.002&&Math.abs(size.x-config.dimensions.width)<.015,'body keeps declared length/width: '+size.toArray().join(','));
    const anchors=localWheelPositions(config.dimensions),offset=config.staticBodyOffsetY??0;
    for(const id of VEHICLE_WHEEL_IDS){const a=anchors[id],v=visual.wheelPivots[id].position;
      assert(Math.abs(v.x-a.x)+Math.abs(v.z-a.z)+Math.abs(v.y-a.y+offset)<1e-8,'physical wheel anchors unchanged');}
    let rearTrimClearance=Infinity;
    const rearCards:T.Mesh[]=[];visual.root.traverse(o=>{if(o instanceof T.Mesh&&o.name==='SU7 rear door card')rearCards.push(o);});
    for(const card of rearCards){
      const a=card.geometry.getAttribute('position'),index=card.geometry.index!;let clearance=Infinity;
      for(let i=0;i<index.count;i+=3){
        const points=[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(a,index.getX(i+j)).applyMatrix4(card.matrixWorld));
        for(const p of [...points,points[0]!.clone().lerp(points[1]!,.5),points[1]!.clone().lerp(points[2]!,.5),points[2]!.clone().lerp(points[0]!,.5)]){
          const d=p.z-config.wheelBase/2,r=config.wheelRadius+config.body.wheelArchClearance;
          if(Math.abs(d)<r)clearance=Math.min(clearance,p.y-(config.wheelRadius-offset+Math.sqrt(r*r-d*d)));
        }
      }
      rearTrimClearance=Math.min(rearTrimClearance,clearance);
      assert(clearance>.005,'rear door trim stays above the wheelhouse opening, including triangle edges');
    }
    let triangles=0,invalid=0;const textures=new Set<T.Texture>();
    visual.root.traverse(o=>{if(o instanceof T.Mesh){const a=o.geometry.getAttribute('position');triangles+=(o.geometry.index?.count??a.count)/3;
      for(let i=0;i<a.count;i++)if(!Number.isFinite(a.getX(i)+a.getY(i)+a.getZ(i)))invalid++;
      for(const m of Array.isArray(o.material)?o.material:[o.material])for(const v of Object.values(m))if(v instanceof T.Texture)textures.add(v);
    }});
    assert(invalid===0&&triangles<60000&&textures.size<=7,'finite geometry stays below prior triangle budget, with one new atlas');
    const access=visual.interactionDefinition!,controller=new VehicleInteractionController();controller.configure(access);
    const pane=mesh('SU7 movable driver glass'),card=visual.root.getObjectByName('SU7 driver door card')!;
    const closed=card.getWorldPosition(new T.Vector3()),paneY=access.driverWindow.node.position.y;
    controller.openDriverDoor();for(let i=0;i<120;i++)controller.update(1/120);
    for(let i=0;i<300;i++)controller.driverWindowDown(1/120);
    applyVehicleInteractionVisual(access,controller.driverDoorOpenFraction,controller.driverWindowOpenFraction);visual.root.updateMatrixWorld(true);
    assert(card.getWorldPosition(new T.Vector3()).distanceTo(closed)>.3&&access.driverWindow.node.position.y<paneY-.4,'new frame leaves real door/window motion intact');
    controller.closeDriverDoor();for(let i=0;i<150;i++)controller.update(1/120);
    for(let i=0;i<300;i++)controller.driverWindowUp(1/120);
    applyVehicleInteractionVisual(access,controller.driverDoorOpenFraction,controller.driverWindowOpenFraction);visual.root.updateMatrixWorld(true);
    assert(card.getWorldPosition(new T.Vector3()).distanceTo(closed)<1e-8&&!!pane.parent,'door and glass return to authored frame');
    lighting=new VehicleLighting(visual);const lamps=new VehicleLightingController();
    lamps.setMainLightMode('low');lighting.applyState(lamps.state,true,1);
    const lit=mesh('Left SU7 four projector optics').material;
    assert(lit.alphaMap===atlas&&lit.emissiveMap===atlas&&lit.alphaTest>.6&&lit.emissiveIntensity>0,'existing light controller powers only masked projector pixels');
    lamps.setMainLightMode('off');lighting.applyState(lamps.state,true,1);
    assert(lit.emissiveIntensity===0,'projectors extinguish through existing controller');
    lighting.applyState({...lamps.state,positionLight:true,brakeLight:true,reverseLight:true,leftBlinkOn:true},true,1);
    assert(mesh('SU7 continuous halo tail lamp').material.emissiveIntensity>0&&mesh('Left SU7 brake arc').material.emissiveIntensity>0&&
      mesh('Left SU7 reverse optic').material.emissiveIntensity>0,'wrapped rear lights retain tail/brake/reverse state control');
    return {assertions,triangles,textures:textures.size,bodySizeMeters:size.toArray(),windscreenWrapMeters:edgeZ-centreZ,
      rearSeamGapMeters:rearSeamGap,bumperSeamGapMeters:bumperSeamGap,deckEndGapMeters:deckEndGap,rearTrimClearanceMeters:rearTrimClearance,
      paintRGB:'#'+otherPaint.color.getHexString(),detailAtlas:[1024,512],driverAccess:true,maskedProjectors:true};
  }finally{lighting?.dispose();visual.dispose();other.dispose();assets.dispose();if(needsDocument)Reflect.deleteProperty(globalThis,'document');}
}
