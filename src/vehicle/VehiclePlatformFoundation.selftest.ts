import * as T from 'three';
import { getVehicleDescriptor } from './VehicleCatalog';
import { SharedVehicleData } from './SharedVehicleData';
import { VehicleLoadingLifecycle } from './VehicleLoadingLifecycle';
import { VehicleAssetRegistry } from './visual/VehicleAssetRegistry';
import { VehicleVisual } from './visual/VehicleVisual';
import { DrivingSceneDisplayContext } from './visual/DrivingSceneDisplayContext';
import { ElectricDisplayContext } from './visual/ElectricDisplayContext';
import { createStaticOBBCollider } from './physics/CollisionSystem';
import { buildCityRoadNetwork } from '../world/city/CityRoadNetwork';
import { newCityMap } from '../world/city/CityMapData';

export async function runVehiclePlatformFoundationSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string) => { assertions++; if (!ok) throw new Error(`Vehicle platform foundation: ${message}`); };
  const document = Object.getOwnPropertyDescriptor(globalThis,'document');
  const context = new Proxy({} as CanvasRenderingContext2D,{get:(_,key)=>
    key === 'createLinearGradient' || key === 'createRadialGradient' ? () => ({addColorStop:()=>{}}) : () => {},set:()=>true});
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({width:0,height:0,getContext:()=>context})}});
  const assets = new VehicleAssetRegistry();
  try {
    for (const id of ['bmw-530li-g38','executive-lwb-2t','tesla-model-3-rwd'] as const) {
      const descriptor = getVehicleDescriptor(id), config = descriptor.visualConfig;
      assert(descriptor.capabilities.navigation && descriptor.capabilities.laneDisplay && descriptor.capabilities.parking360 && descriptor.capabilities.tpms,'migrated features');
      assert(!descriptor.capabilities.acc && !descriptor.capabilities.bsd,'uninstalled controllers stay unavailable');
      assert(descriptor.capabilities.lka === (descriptor.physicsConfig.lateralAssist?.lka.enabled === true) &&
        descriptor.capabilities.lcc === (descriptor.physicsConfig.lateralAssist?.lcc.enabled === true), 'lateral support follows installed calibration');
      const before = JSON.stringify(descriptor.physicsConfig);
      const raw = new VehicleVisual(config), a = new VehicleVisual(config,assets), b = new VehicleVisual(config,assets);
      try {
        const summary = (visual: VehicleVisual) => {
          let meshes = 0, vertices = 0;
          visual.root.traverse(o=>{if(o instanceof T.Mesh){meshes++;vertices+=o.geometry.getAttribute('position').count;}});
          const bounds = visual.getVisualBodyBounds();
          return JSON.stringify({meshes,vertices,bounds});
        };
        assert(summary(raw) === summary(a) && summary(a) === summary(b),`${id}: cached instances retain geometry and bounds`);
        const wheelA = a.wheelPivots.frontLeft.children[0] as T.Mesh, wheelB = b.wheelPivots.frontLeft.children[0] as T.Mesh;
        assert(wheelA.geometry === wheelB.geometry && assets.owns(wheelA.geometry),`${id}: immutable geometry is shared`);
        assert(wheelA.material !== wheelB.material,`${id}: mutable materials are isolated`);
        a.setWheelRotationAngles({frontLeft:1,frontRight:2,rearLeft:3,rearRight:4});
        assert(wheelB.rotation.x === 0 && (a.wheelPivots.rearRight.children[0] as T.Mesh).rotation.x === -4,`${id}: wheel bindings stay independent and ordered`);
        let disposals = 0; wheelA.geometry.addEventListener('dispose',()=>disposals++);
        let guarded = false; try { assets.dispose(); } catch { guarded = true; }
        assert(guarded,'live resource disposal is guarded');
        a.dispose(); a.dispose(); assert(disposals === 0,`${id}: instance disposal preserves shared geometry`);
        assert(JSON.stringify(descriptor.physicsConfig) === before,`${id}: physics calibration is untouched`);
      } finally { raw.dispose(); a.dispose(); b.dispose(); }
    }
    const shared = new SharedVehicleData({lanes:true,navigation:true,proximity:true,tpms:true});
    const bmw = new DrivingSceneDisplayContext({lanes:true,proximity:true},shared), ev = new ElectricDisplayContext(shared);
    const map = newCityMap(); map.id = 'platform-fixture';
    map.bounds = { minX:-50, maxX:50, minZ:-100, maxZ:100 };
    map.roads = [{id:'road',type:'urban_2lane',centerline:[{x:0,y:0,z:90},{x:0,y:0,z:-90}],laneWidth:3.5,laneCount:2,travelDirection:'two-way',speedLimit:60}];
    const network = buildCityRoadNetwork(map);
    const pose = {x:1.75,z:0,yaw:0,y:0,width:1.85,length:4.8};
    const obstacle = createStaticOBBCollider({id:'front',x:pose.x,z:-3.5,width:.5,length:.5});
    let queries = 0; const query = () => { queries++;return [obstacle]; };
    shared.updateLaneObservation(0,pose,20,network,false);
    shared.update(0,pose,'D',1,true,network,query);
    bmw.update(0,pose,'D',1,true,network,query); ev.update(0,pose,'D',1,network,query);
    assert(queries === 1 && bmw.data.lanes === ev.data.lanes && bmw.data.map === ev.data.map,'all skins borrow one observation/map');
    assert(shared.lane.currentLane === 1 && shared.lane.leftLane === 0 && shared.lane.rightLane === null && shared.lane.curvature === 0,'lane topology and straight-road curvature');
    assert(shared.navigation.speedLimit === 60 && shared.navigation.roadName === null && shared.navigation.route === null,'existing metadata only');
    assert(shared.parking.active && shared.parking.zones[1]!.distanceM !== null,'eight-zone proximity shares the observation');
    shared.update(.001,pose,'D',3,true,network,query);
    assert(!shared.parking.active,'crossing the parking threshold clears immediately');
    shared.setTyreStatus(0,{pressure:245,valid:true,warning:true});
    shared.setTyreStatus(1,{pressure:NaN,valid:true,warning:true});
    assert(shared.tyres[0].pressure === 245 && shared.tyres[0].warning && !shared.tyres[1].valid,'TPMS validity and warnings');
    bmw.dispose(); ev.dispose(); assert(shared.navigation.map.available,'borrowers do not dispose platform data');
    shared.updateLaneObservation(0,pose,20,undefined,false);
    shared.update(0,pose,'D',3,true,undefined,query);
    assert(!shared.navigation.currentRoad && !shared.lane.lanes.length,'map changes invalidate environment data immediately');
    shared.dispose();
    const phases: string[] = [], loader = new VehicleLoadingLifecycle(phase=>phases.push(phase));
    loader.mark('Static asset prepare');
    let done: (()=>void) | undefined;
    loader.enqueue('Visual warmup',()=>new Promise<void>(resolve=>{done=resolve;}));
    loader.enqueue('Dynamic state init',()=>{phases.push('initialized');});
    loader.advance(); loader.advance(); assert(!phases.includes('initialized'),'pending async warmup holds subsequent stages');
    done!(); await Promise.resolve(); loader.advance(); loader.advance();
    assert(loader.ready && phases.includes('initialized'),'ready follows completed stages');
    loader.dispose();
    return {assertions,migratedVehicles:3};
  } finally {
    assets.dispose();
    if(document) Object.defineProperty(globalThis,'document',document); else Reflect.deleteProperty(globalThis,'document');
  }
}
