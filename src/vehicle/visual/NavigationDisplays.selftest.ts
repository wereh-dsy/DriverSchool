import { VEHICLE_CATALOG, createVehiclePhysicsConfig } from '../VehicleCatalog';
import { VehicleDynamics } from '../physics/VehicleDynamics';
import type { Powertrain } from '../powertrain/Powertrain';
import { VehicleVisual } from './VehicleVisual';
import { VehicleAssetRegistry } from './VehicleAssetRegistry';
import { SharedVehicleData } from '../SharedVehicleData';
import { DrivingSceneDisplayContext } from './DrivingSceneDisplayContext';
import { ElectricDisplayContext } from './ElectricDisplayContext';
import { ExecutiveDisplayContext } from './ExecutiveDisplayContext';
import { NavigationController } from '../../world/navigation/NavigationController';
import type { RoadNetworkData, RoadSegmentData } from '../../world/navigation/RoadNetwork';
import type { InstrumentTelemetry } from './InstrumentCluster';

export function runNavigationDisplaysSelfTest() {
  let assertions=0;const assert=(ok:unknown,message:string)=>{assertions++;if(!ok)throw new Error(`Navigation displays: ${message}`);};
  const original=Object.getOwnPropertyDescriptor(globalThis,'document'),texts:string[]=[];
  const makeCanvas=()=>{const values:Record<string,unknown>={};const ctx=new Proxy({} as CanvasRenderingContext2D,{get:(_t,key:string)=>key==='fillText'?(value:string)=>texts.push(value):key==='measureText'?(value:string)=>({width:value.length*12}):key.startsWith('create')?()=>({addColorStop:()=>{}}):values[key]??(()=>{}),set:(_t,key:string,value)=>{values[key]=value;return true;}});return {width:1,height:1,getContext:()=>ctx};};
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:makeCanvas}});
  try {
    const a:RoadSegmentData={id:'a',name:'出发道路',nameId:'a',centerline:[{x:0,y:0,z:0},{x:0,y:0,z:-200}],width:8,length:200,laneCountPerDirection:1,laneWidth:4,travelDirection:'forward',speedLimit:60,roadType:'urban'};
    const b:RoadSegmentData={...a,id:'b',name:'目的地道路',nameId:'b',centerline:[{x:0,y:0,z:-200},{x:200,y:0,z:-200}]};
    const network:RoadNetworkData={mapId:'test',bounds:{minimumX:-50,maximumX:250,minimumZ:-250,maximumZ:50},segments:[a,b],intersections:[],routing:{connections:[{fromRoadId:'a',fromEnd:'end',toRoadId:'b',toEnd:'start'}],places:[]}};
    const equipped=VEHICLE_CATALOG.filter(d=>d.capabilities.navigation);
    for(const descriptor of equipped) {
      const assets=new VehicleAssetRegistry(),visual=new VehicleVisual(descriptor.visualConfig,assets);
      const shared=new SharedVehicleData({lanes:true,navigation:true,proximity:true,tpms:true});
      const navigation=new NavigationController();navigation.configure(network);navigation.update(0,{x:0,y:0,z:-20,yaw:0},0);
      shared.navigation.guidance=navigation.state;shared.navigation.map.navigationState=navigation.state;
      navigation.start({roadId:'b',along:150,point:{x:150,y:0,z:-200},label:'目的地道路'});shared.navigation.route=navigation.state.route!.points;
      const pose={x:0,y:0,z:-20,yaw:0,width:1.8,length:4.8};shared.update(.2,pose,'D',15,true,network,()=>[]);
      const snapshot=new VehicleDynamics<Powertrain>(createVehiclePhysicsConfig(descriptor.id)).getSnapshot();
      const scene=new DrivingSceneDisplayContext({lanes:true,proximity:true},shared);scene.update(.2,pose,'D',15,true,network,()=>[]);
      const electric=new ElectricDisplayContext(shared);electric.update(.2,pose,'D',15,network,()=>[]);
      const executive=snapshot.fuel?new ExecutiveDisplayContext(snapshot.fuel,shared):undefined;
      executive?.update(.2,pose,'D','NORMAL',false,null,snapshot.fuel!,network,[],true);
      const telemetry:InstrumentTelemetry={speedKmh:54,rpm:1800,gear:'D',ignitionOn:true,engineRunning:true,sharedVehicle:shared,drivingScene:scene.data,electricDisplay:electric.data,executive:executive?.data,ev:snapshot.powertrain.ev,trip:snapshot.trip,tyres:shared.tyres,fuelLevel:.8,coolantTemperatureC:90};
      const offset=texts.length;visual.updateInstruments(telemetry,1.2);visual.updateInstruments(telemetry,1.2);
      const guidance=texts.slice(offset).filter(text=>text.includes('右转进入'));
      assert(guidance.length>0,`${descriptor.id}: real route reaches the physical display`);
      if(descriptor.visualConfig.instrumentCluster.displayStyle!=='ev-center')assert(guidance.length>=2,`${descriptor.id}: center screen and instruments both show guidance`);
      const before=texts.length;navigation.state.nextRoad='更新后的下一道路';navigation.state.version++;
      visual.updateInstruments(telemetry,.2);assert(texts.slice(before).includes('更新后的下一道路'),`${descriptor.id}: route version invalidates a stationary display`);
      visual.dispose();shared.dispose();assets.dispose();
    }
    return {assertions,equippedDisplays:equipped.length};
  } finally {if(original)Object.defineProperty(globalThis,'document',original);else Reflect.deleteProperty(globalThis,'document');}
}
