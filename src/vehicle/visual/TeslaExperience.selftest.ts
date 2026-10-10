import { VehicleLightingController } from '../control/VehicleLightingController';
import { LocalVehicleProximity } from '../control/LocalVehicleProximity';
import { createStaticOBBCollider } from '../physics/CollisionSystem';
import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import { getVehicleDescriptor, createVehiclePhysicsConfig } from '../VehicleCatalog';
import { VehicleVisual } from './VehicleVisual';
import { VehicleLighting } from './VehicleLighting';
import { ElectricCenterDisplay, ELECTRIC_DISPLAY_LAYOUT } from './ElectricCenterDisplay';
import { ElectricDisplayContext } from './ElectricDisplayContext';
import { calculateElectricAudioMix, TurnSignalClickTracker } from '../../audio/ElectricAudioMix';
import { LocalRoadMap, AdaptiveMapZoom } from '../../ui/LocalRoadMap';
import { ElectricPowertrain } from '../powertrain/ElectricPowertrain';
import { VehicleDynamics } from '../physics/VehicleDynamics';
import type { RoadNetworkData } from '../../world/navigation/RoadNetwork';
import type { InstrumentTelemetry } from './InstrumentCluster';
import type { Mesh, MeshStandardMaterial } from 'three';

export function runTeslaExperienceSelfTest() {
  let assertions = 0;
  const assert = (value: boolean, message: string) => { assertions++; if (!value) throw new Error(`Tesla experience: ${message}`); };
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const stub = (context: unknown = null) => ({ width: 1024, height: 640, getContext: () => context });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => stub() } });
  const visual = new VehicleVisual(getVehicleDescriptor('tesla-model-3-rwd').visualConfig), lighting = new VehicleLighting(visual);
  try {
    const controller = new VehicleLightingController(), input = createNeutralVehicleInputState(), clicks = new TurnSignalClickTracker();
    for (const signal of ['left','right','hazard'] as const) {
      controller.reset(); clicks.reset(); input.leftIndicator = signal === 'left'; input.rightIndicator = signal === 'right'; input.hazard = signal === 'hazard';
      controller.update(0, input, { ignitionOn: true, actualGear: 'D', steeringWheelAngle: 0 });
      input.leftIndicator = input.rightIndicator = input.hazard = false; input.brake = .2;
      let lastOn: boolean | null = null, edges = 0;
      for (let i=0;i<120;i++) {
        const state = controller.update(1/120,input,{ ignitionOn:true,actualGear:'D',steeringWheelAngle:0 });
        lighting.applyState(state, true, 1/120);
        const on = state.leftBlinkOn || state.rightBlinkOn, edge = clicks.update(state);
        assert((edge !== null) === (lastOn === null || on !== lastOn), `${signal}: click has exactly the controller phase edges`); if (edge) edges++; lastOn = on;
        for (const side of ['Left','Right'] as const) {
          const blink = side === 'Left' ? state.leftBlinkOn : state.rightBlinkOn;
          for (const part of ['front turn signal','rear turn signal','mirror amber repeater']) {
            const lamp = visual.root.getObjectByName(`${side} ${part}`) as Mesh;
            assert((lamp.material as MeshStandardMaterial).emissiveIntensity > 0 === blink, `${signal}: ${side} ${part} shares phase`);
          }
        }
        assert((visual.root.getObjectByName('Left brake lamp') as Mesh<Mesh['geometry'], MeshStandardMaterial>).material.emissiveIntensity > 0, 'braking cannot erase amber turn output');
      }
      assert(edges === 3, `${signal}: one second contains one shared on/off/on click sequence`);
    }
    const head = visual.root.getObjectByName('Left low/high headlamp') as Mesh;
    const rear = visual.root.getObjectByName('Left rear turn signal') as Mesh;
    assert(head.position.z < -visual.config.dimensions.length/2 && rear.position.z > visual.config.dimensions.length/2, 'Tesla optics are outside closed body fascias');
    assert((rear.material as MeshStandardMaterial).emissive.getHex() === 0xffa321, 'independent amber rear indicator');
    const stand = calculateElectricAudioMix(0,0,{vehicleSpeed:0,driving:true}), idleTorque = calculateElectricAudioMix(0,360,{vehicleSpeed:0,driving:true});
    assert(stand.motor === 0 && stand.pedestrian === 0 && idleTorque.motor === 0, 'no motor/ICE idle at rest');
    const coast = calculateElectricAudioMix(3000,0,{vehicleSpeed:12}), load = calculateElectricAudioMix(3000,300,{vehicleSpeed:12});
    assert(load.motor > coast.motor, 'acceleration/load increases motor gain');
    assert(calculateElectricAudioMix(10000,300,{vehicleSpeed:35}).frequency > load.frequency, 'actual motor RPM raises pitch');
    const regen = calculateElectricAudioMix(3000,-100,{vehicleSpeed:12,regenerativePowerKw:20});
    assert(regen.motor > 0 && regen.harmonic > coast.harmonic && Number.isFinite(regen.frequency), 'regen has a valid subtle alternate harmonic');
    const fast = calculateElectricAudioMix(14000,250,{vehicleSpeed:50});
    assert(fast.road + fast.wind > fast.motor, 'road/wind dominate at highway speed');
    assert(calculateElectricAudioMix(500,50,{vehicleSpeed:-2,driving:true}).pedestrian > 0 && fast.pedestrian === 0, 'pedestrian hum only low-speed travel including reverse');
    const pose = { x:0,z:0,y:0,yaw:0,width:1.85,length:4.72 }, sensor = new LocalVehicleProximity();
    const object = (x:number,z:number) => createStaticOBBCollider({ id:`${x},${z}`, x:x*Math.cos(pose.yaw)+z*Math.sin(pose.yaw), z:-x*Math.sin(pose.yaw)+z*Math.cos(pose.yaw), yaw:pose.yaw,width:.2,length:.2 });
    for (const yaw of [0,Math.PI/2,Math.PI]) {
      pose.yaw = yaw; sensor.update(pose,true,[object(-1.2,-2.65)]);
      assert(sensor.state.nearestZone === 'FRONT_LEFT' && sensor.state.nearestDistanceM! < .4, 'front-left surface creates the corresponding critical region at every yaw');
      sensor.update(pose,true,[object(1.2,2.65)]);
      assert(sensor.state.nearestZone === 'REAR_RIGHT', 'rear-right surface maps to rear-right rather than only rear');
    }
    pose.yaw = 0; sensor.update(pose,true,[]);
    assert(sensor.state.zones.every(z => z.distanceM === null), 'no obstacle creates no false proximity bands');
    const simple: RoadNetworkData = { mapId:'fixture',bounds:{minimumX:-1200,maximumX:1200,minimumZ:-1200,maximumZ:1200},
      segments:[{ id:'main',centerline:[{x:0,z:-1000},{x:0,z:1000}],width:8,length:2000,laneWidth:4,laneCountPerDirection:1,travelDirection:'two-way',speedLimit:100 }],intersections:[] };
    const complex: RoadNetworkData = { ...simple,intersections:[{id:'junction',center:{x:0,z:0},halfExtentX:12,halfExtentZ:12,
      arms:Array.from({length:4},(_,i)=>({segmentId:'main',outward:{x:i,z:0},approachYawRadians:i*Math.PI/2,approachLaneCount:1}))}] };
    const map = new LocalRoadMap(); map.setNetwork(simple); const plain = map.nearby(0,0).complexity;
    map.setNetwork(complex); assert(map.nearby(0,0).complexity > plain + 5, 'junction branch metadata increases local complexity');
    const zoom = new AdaptiveMapZoom(); for(let i=0;i<200;i++) zoom.update(.1,30,plain,'D');
    assert(zoom.targetMetres === 500 && zoom.viewMetres > 490, 'stable high speed/simple road widens scale');
    const before = zoom.viewMetres; zoom.update(.1,30,8,'D');
    assert(zoom.viewMetres < before && zoom.viewMetres > zoom.targetMetres, 'zoom transition interpolates rather than jumps');
    for(let i=0;i<100;i++) zoom.update(.1,30,i%2?4.2:3.8,'D');
    assert(zoom.targetMetres === 200, 'small complexity fluctuations do not oscillate the scale class');
    zoom.update(.1,0,8,'R'); assert(zoom.targetMetres === 90, 'reverse retains a close situational map');
    const texts: { text:string;x:number;y:number }[] = [], arcs: number[] = [], rectangles: number[][] = [];
    const ctx = new Proxy({} as CanvasRenderingContext2D, { get: (_target,key) => {
      if(key==='fillText') return (text:string,x:number,y:number) => texts.push({text,x,y});
      if(key==='ellipse') return (...a:number[]) => arcs.push(a[5]!);
      if(key==='fillRect') return (...a:number[]) => rectangles.push(a);
      return () => {};
    }, set: () => true });
    Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>stub(ctx)}});
    map.setNetwork(simple); const rect={x:338,y:0,width:686,height:640};
    map.draw(ctx,rect,0,0,0,90); const count=map.rasterizations;
    map.draw(ctx,rect,1,1,.2,92); assert(count > 0 && map.rasterizations === count, 'moving marker/zoom reuses static road raster tiles');
    assert(ELECTRIC_DISPLAY_LAYOUT.splitX/1024 > .32 && ELECTRIC_DISPLAY_LAYOUT.splitX/1024 < .35 && ELECTRIC_DISPLAY_LAYOUT.map.x === 338, 'fixed 33/67 layout');
    const display = new ElectricDisplayContext(), config=createVehiclePhysicsConfig('tesla-model-3-rwd');
    const car = new VehicleDynamics<ElectricPowertrain>(config,{speed:12,driveSelector:'D'},new ElectricPowertrain(config));
    const snapshot=car.getSnapshot(); const face=new ElectricCenterDisplay(); const canvas=stub(ctx) as unknown as HTMLCanvasElement;
    let scans=0; const query=()=>{scans++;return [object(1.2,2.65), object(.4,-10)];};
    for(const gear of ['P','R','N','D']) {
      display.update(.1,pose,gear,12,simple,query); texts.length=0; arcs.length=0;
      const telemetry: InstrumentTelemetry={speedKmh:43,rpm:0,gear,ev:snapshot.powertrain.ev,driveAvailable:true,ignitionOn:true,
        electricDisplay:display.data,indicators:{leftTurn:true,rightTurn:gear==='R'}};
      face.update(canvas,telemetry,.1);
      assert(display.data.parking === (gear==='P'||gear==='R') && display.data.reverse === (gear==='R'), `${gear}: correct parking/environment content`);
      assert(texts.some(t=>t.text==='43'&&t.x<338)&&texts.some(t=>t.text===gear&&t.x<338), `${gear}: actual speed/PRND on left`);
      assert(texts.some(t=>t.text==='MAP'&&t.x>338) && display.data.map.available, `${gear}: real road map persists on right`);
      assert(texts.some(t=>t.text.includes('80%')&&t.text.includes('320 km'))&&texts.some(t=>t.text==='POWER 0 kW'), `${gear}: SOC/range/power read actual powertrain snapshot`);
      assert(texts.some(t=>t.text==='←') && texts.some(t=>t.text==='→') === (gear==='R'), `${gear}: display arrows use resolved common blink state`);
      if(gear==='P'||gear==='R') assert(arcs.length>0 && texts.filter(t=>/^\d+\.\d+ m$/.test(t.text)).length===1, 'curved proximity bands plus only nearest numeric distance');
      else assert(display.data.lanes.length===2 && display.data.obstacles.length===1 && arcs.length===0,'D/N share real lane and forward-obstacle geometry and omit parking bands');
      if (gear==='P'||gear==='R') assert(arcs.some(angle=>Math.abs(angle-(Math.PI/4-.31))<1e-8),'rear-right detection draws the rear-right curved band');
    }
    const prior=scans; display.update(.001,pose,'D',12,simple,query); assert(scans===prior,'sensor/world queries are display-rate, not each physics step');
    display.update(.1,pose,'P',0,simple,()=>[]); arcs.length=0; face.update(canvas,{speedKmh:0,rpm:0,gear:'P',ignitionOn:true,driveAvailable:true,electricDisplay:display.data,ev:snapshot.powertrain.ev},.1);
    assert(arcs.length===0,'clear scene draws no invented sensor bands');
    display.update(.1,pose,'P',0,simple,()=>[object(-1.2,-2.65)]); arcs.length=0;
    face.update(canvas,{speedKmh:0,rpm:0,gear:'P',ignitionOn:true,driveAvailable:true,electricDisplay:display.data,ev:snapshot.powertrain.ev},.1);
    assert(arcs.some(angle=>Math.abs(angle-(-3*Math.PI/4-.31))<1e-8),'front-left detection draws the front-left curved band');
    map.dispose(); display.dispose();
    return { passed:true, assertions, layout:'33/67', lightingModes:3, parkingZones:8, cachedRoadTiles:count };
  } finally { lighting.dispose(); visual.dispose(); if(original) Object.defineProperty(globalThis,'document',original); else Reflect.deleteProperty(globalThis,'document'); }
}
