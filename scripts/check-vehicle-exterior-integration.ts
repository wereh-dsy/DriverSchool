import { writeFileSync } from 'node:fs';
import { runExecutiveExteriorSelfTest } from '../src/vehicle/visual/ExecutiveExterior.selftest';
import { runSuspensionStanceSelfTest } from '../src/vehicle/visual/SuspensionStance.selftest';
import { runVehicleLightingSelfTest } from '../src/vehicle/visual/VehicleLighting.selftest';
import { runVehicleVisualDimensionsSelfTest, runVehiclePoseConsistencySelfTest } from '../src/vehicle/visual/VehicleVisualDimensions.selftest';
import { runTeslaModel3VisualSelfTest } from '../src/vehicle/visual/TeslaModel3Visual.selftest';
import { runFerrari458VisualSelfTest } from '../src/vehicle/visual/Ferrari458Visual.selftest';
import { runVehicleExteriorSelfTest } from '../src/vehicle/visual/VehicleExterior.selftest';
import * as T from 'three';
import { VEHICLE_CATALOG } from '../src/vehicle/VehicleCatalog';
import { VehicleVisual } from '../src/vehicle/visual/VehicleVisual';
import { VehicleLighting } from '../src/vehicle/visual/VehicleLighting';
import { VehicleAssetRegistry } from '../src/vehicle/visual/VehicleAssetRegistry';
import { fitExteriorOverhangs } from '../src/vehicle/visual/ExteriorEnvelope';
import { DEFAULT_SEDAN_VISUAL_CONFIG } from '../src/vehicle/visual/VehicleVisualConfig';
import { runGolfGTIStructureSelfTest } from '../src/vehicle/visual/GolfGTI.selftest';

function envelopeOwnership() {
  const root=new T.Group(),shared=new T.BoxGeometry(.2,.2,.2),material=new T.MeshBasicMaterial();
  const middle=new T.Mesh(shared,material),front=new T.Mesh(shared,material),rear=new T.Mesh(shared,material);
  front.position.z=-2.1;rear.position.z=2.1;root.add(middle,front,rear);
  let disposed=0;shared.addEventListener('dispose',()=>disposed++);
  fitExteriorOverhangs(root,DEFAULT_SEDAN_VISUAL_CONFIG,.95,.90);
  if(middle.geometry!==shared||disposed!==0)throw Error('Envelope remap copied/disposed geometry still used inside the fixed axle region');
  if(front.geometry===shared||rear.geometry===shared)throw Error('Envelope remap mutated a shared source instead of owning the changed ends');
  const bounds=new T.Box3().setFromObject(root),half=DEFAULT_SEDAN_VISUAL_CONFIG.wheelBase/2;
  if(Math.abs(bounds.min.z+half+.95)>1e-6||Math.abs(bounds.max.z-half-.90)>1e-6)throw Error('Envelope end bounds changed');
  for(const geometry of new Set([middle.geometry,front.geometry,rear.geometry]))geometry.dispose();material.dispose();
  return {fixedGeometryReused:true,sharedSourcePreserved:true};
}

function cachedExteriors() {
  const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
  const context=new Proxy({} as Record<string,unknown>,{get:(target,key)=>key==='measureText'?()=>({width:0}):key in target?target[String(key)]:()=>context,
    set:(target,key,value)=>{target[String(key)]=value;return true;}});
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({width:1,height:1,getContext:()=>context})}});
  let checked=0;
  let golfStructure:ReturnType<typeof runGolfGTIStructureSelfTest>|undefined;
  try {for(const descriptor of VEHICLE_CATALOG) {
    const assets=new VehicleAssetRegistry(),config={...descriptor.visualConfig,assetCache:true};
    VehicleVisual.prepareAssets(config,assets);
    const a=new VehicleVisual(config,assets),b=new VehicleVisual(config,assets);
    if(config.body.design==='golf-gti'){
      a.setWorldPose(0,config.staticBodyOffsetY??0,0,0);
      golfStructure=runGolfGTIStructureSelfTest(a);
    }
    let first:T.Mesh|undefined;
    a.exteriorRoot.traverse(o=>{if(!first&&o instanceof T.Mesh&&assets.owns(o.geometry))first=o;});
    const second=b.exteriorRoot.getObjectByName(first!.name) as T.Mesh;
    if(first!.geometry!==second.geometry || first!.material===second.material)throw Error(`${descriptor.id}: cached geometry/material ownership`);
    const geometries=new Map<T.BufferGeometry,number[]>();
    const geometryDisposals=new Map<T.BufferGeometry,number>();
    const textures=new Map<T.Texture,number>();
    a.exteriorRoot.traverse(o=>{if(o instanceof T.Mesh&&assets.owns(o.geometry))geometries.set(o.geometry,Array.from(o.geometry.getAttribute('position').array));});
    for(const geometry of geometries.keys()){geometryDisposals.set(geometry,0);geometry.addEventListener('dispose',()=>geometryDisposals.set(geometry,geometryDisposals.get(geometry)!+1));}
    a.exteriorRoot.traverse(o=>{if(o instanceof T.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])for(const value of Object.values(m)){
      if(value instanceof T.Texture&&assets.owns(value)&&!textures.has(value)){
        textures.set(value,0);value.addEventListener('dispose',()=>textures.set(value,textures.get(value)!+1));
      }
    }});
    b.exteriorRoot.traverse(o=>{if(o instanceof T.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])for(const value of Object.values(m)){
      if(value instanceof T.Texture&&assets.owns(value)&&!textures.has(value))throw Error(`${descriptor.id}: static texture was duplicated for a cached instance`);
    }});
    const lightsA=new VehicleLighting(a),lightsB=new VehicleLighting(b);
    lightsA.setMode('position');
    a.exteriorRoot.traverse(o=>{
      if(o instanceof T.Mesh&&o.userData.textureMaskedLight){
        const material=o.material as T.MeshStandardMaterial;
        if(!material.alphaMap||material.alphaTest<=0||material.emissiveIntensity<=0)throw Error(`${descriptor.id}: textured lamp lost its optical mask or controlled emission`);
      }
    });
    lightsA.setMode('off');
    a.exteriorRoot.traverse(o=>{if(o instanceof T.Mesh&&o.userData.textureMaskedLight&&(o.material as T.MeshStandardMaterial).emissiveIntensity!==0)
      throw Error(`${descriptor.id}: textured lamp remained lit after OFF`);});
    lightsA.setMode('position');
    if(lightsB.lightMode!=='off')throw Error(`${descriptor.id}: lighting state leaked between instances`);
    for(const [g,saved]of geometries){const values=g.getAttribute('position').array;if(saved.some((v,i)=>v!==values[i]))throw Error(`${descriptor.id}: lighting mutated registry geometry`);}
    let disposed=0;first!.geometry.addEventListener('dispose',()=>disposed++);
    lightsA.dispose();lightsB.dispose();a.dispose();b.dispose();
    if(disposed!==0)throw Error(`${descriptor.id}: borrowed geometry disposed by instance`);
    if([...geometryDisposals.values()].some(count=>count!==0))throw Error(`${descriptor.id}: instance/light controller disposed cached exterior geometry`);
    if([...textures.values()].some(count=>count!==0))throw Error(`${descriptor.id}: instance disposed a shared texture`);
    assets.dispose();if(Number(disposed)!==1)throw Error(`${descriptor.id}: registry did not dispose geometry once`);
    if([...textures.values()].some(count=>count!==1))throw Error(`${descriptor.id}: registry did not dispose shared textures once`);
    if([...geometryDisposals.values()].some(count=>count!==1))throw Error(`${descriptor.id}: registry did not dispose every cached geometry once`);
    checked++;
  }}finally {if(previous)Object.defineProperty(globalThis,'document',previous);else Reflect.deleteProperty(globalThis,'document');}
  return {vehicles:checked,golfStructure};
}

// Geometry/lighting/physical attachment checks only; no driving or map suite.
const results: Record<string,unknown> = {}, errors: Record<string,string> = {};
for(const [name,check] of Object.entries({executive:runExecutiveExteriorSelfTest,stance:runSuspensionStanceSelfTest,
  lighting:runVehicleLightingSelfTest,dimensions:runVehicleVisualDimensionsSelfTest,pose:runVehiclePoseConsistencySelfTest,
  tesla:runTeslaModel3VisualSelfTest,ferrari:runFerrari458VisualSelfTest,exterior:runVehicleExteriorSelfTest,cachedExteriors,envelopeOwnership})) {
  try {results[name]=check();console.log(`${name}: PASS`);}
  catch(error) {errors[name]=String(error);console.error(`${name}: ${error}`);}
}
writeFileSync('artifacts/vehicle-exterior-refinement/integration-results.json',JSON.stringify({results,errors},null,2)+'\n');
if(Object.keys(errors).length)process.exitCode=1;
