import * as T from 'three';
import { InstrumentCluster, type InstrumentTelemetry } from './InstrumentCluster';
import { NavigationCenterDisplay } from './NavigationCenterDisplay';
import { surfaceRounded as box, surfaceQuad } from './SurfaceVehicleGeometry';
import { cabinAmbientTarget } from './CabinLightResponse';
import type { VehicleVisualConfig } from './VehicleVisualConfig';

interface SteeringGroups { steeringWheelBase:T.Group;steeringWheelRotationGroup:T.Group;gearLever:T.Group }
export interface SU7MaxCabinState { instrument:InstrumentCluster;update(t:InstrumentTelemetry,dt:number):void }

export function buildSU7MaxCabin(root:T.Group,c:VehicleVisualConfig,steering:SteeringGroups):SU7MaxCabinState {
  const soft=new T.MeshStandardMaterial({color:0x1b242a,roughness:.93,side:T.DoubleSide});
  const leather=new T.MeshStandardMaterial({color:c.body.interiorColor,roughness:.83,side:T.DoubleSide});
  const satin=new T.MeshStandardMaterial({color:0x9aa4aa,roughness:.4,metalness:.7});
  const dark=new T.MeshStandardMaterial({color:0x10151a,roughness:.7,side:T.DoubleSide});
  root.add(box('SU7 sculpted upper dashboard',[1.71,.10,.30],[0,.84,-.73],soft,.035));
  root.add(box('SU7 upholstered lower dashboard',[1.68,.15,.15],[0,.73,-.68],leather,.04));
  root.add(box('SU7 continuous air vent',[1.56,.016,.016],[0,.807,-.566],dark,.005));
  root.add(box('SU7 cabin floor',[1.69,.025,2.65],[0,.255,.36],dark,.008));
  root.add(box('SU7 floating console',[.32,.12,1.02],[.04,.45,.31],leather,.035));
  root.add(box('SU7 wireless charging tray',[.26,.018,.31],[.04,.52,-.015],dark,.016));
  root.add(box('SU7 centre armrest',[.29,.075,.38],[.04,.53,.66],leather,.03));
  for(const x of [-.40,.40]) {
    root.add(box('SU7 front sport seat cushion',[.46,.10,.49],[x,.47,.32],leather,.045));
    const back=box('SU7 front sport seat back',[.44,.51,.10],[x,.79,.60],leather,.05);back.rotation.x=-.10;root.add(back);
    root.add(box('SU7 front head restraint',[.23,.18,.10],[x,1.12,.64],leather,.035));
    for(const sign of [-1,1])root.add(box('SU7 seat side bolster',[.06,.32,.14],[x+sign*.20,.74,.55],leather,.025));
  }
  root.add(box('SU7 rear bench cushion',[1.33,.10,.43],[0,.50,1.06],leather,.045));
  root.add(box('SU7 rear bench back',[1.31,.45,.10],[0,.78,1.37],leather,.04));
  for(const x of [-.44,0,.44])root.add(box('SU7 rear head restraint',[.20,.13,.085],[x,1.066,1.36],leather,.025));
  for(const x of [-.025,.105]) {
    const cup=new T.Mesh(new T.TorusGeometry(.044,.007,6,24),satin);cup.rotation.x=Math.PI/2;
    cup.position.set(x,.515,.28);cup.name='SU7 cup holder rim';root.add(cup);
  }
  const instrument=new InstrumentCluster(c.instrumentCluster);
  instrument.position.set(...c.instrumentClusterTransform.position);instrument.rotation.set(...c.instrumentClusterTransform.rotation);root.add(instrument);
  // Centre map has its own canvas AND material: never assign maps to trim.
  const map=new NavigationCenterDisplay(),screenMaterial=new T.MeshBasicMaterial({map:map.texture,toneMapped:false});
  const centre=new T.Group();centre.name='SU7 16.1 inch centre display';centre.position.set(.08,.965,-.51);centre.rotation.x=-.09;
  centre.add(box('SU7 centre screen surround',[.363,.225,.018],[0,0,0],dark,.013));
  const screen=new T.Mesh(new T.PlaneGeometry(.346,.125),screenMaterial);screen.name='SU7 isolated navigation display';screen.position.set(0,.014,.010);centre.add(screen);
  centre.add(box('SU7 screen lower control rail',[.337,.027,.008],[0,-.082,.011],soft,.004));root.add(centre);
  for(const x of [-.05,.015,.08,.145,.21]) root.add(box('SU7 console physical key',[.038,.008,.023],[x,.536,-.20],satin,.004));
  steering.steeringWheelBase.position.set(...c.steeringWheelPosition);steering.steeringWheelBase.rotation.set(...c.steeringWheelRotation);
  steering.steeringWheelBase.add(steering.steeringWheelRotationGroup);root.add(steering.steeringWheelBase);
  const rim=new T.Mesh(new T.TorusGeometry(.174,.017,10,48),dark);rim.name='SU7 steering wheel rim';steering.steeringWheelRotationGroup.add(rim);
  steering.steeringWheelRotationGroup.add(box('SU7 wheel hub',[.125,.084,.035],[0,-.006,.012],dark,.022));
  steering.steeringWheelRotationGroup.add(box('SU7 wheel satin lower spoke',[.035,.10,.018],[0,-.094,.007],satin,.006));
  for(const sign of [-1,1]) {
    steering.steeringWheelRotationGroup.add(box('SU7 wheel horizontal spoke',[.09,.028,.02],[sign*.104,0,.012],satin,.006));
    steering.steeringWheelRotationGroup.add(box('SU7 wheel multifunction pad',[.036,.026,.008],[sign*.093,.002,.027],dark,.005));
    root.add(box('SU7 column stalk',[.09,.017,.025],[-.40+sign*.105,.775,-.31],dark,.006));
    root.add(box('SU7 door card',[.035,.35,1.95],[sign*.847,.62,.36],leather,.025));
    root.add(box('SU7 door pull',[.025,.025,.22],[sign*.823,.76,-.02],satin,.008));
    root.add(box('SU7 door armrest',[.10,.05,.51],[sign*.798,.57,.15],soft,.022));
    const a:T.Vector3Tuple=[sign*.847,.943,-1.02],b:T.Vector3Tuple=[sign*.686,1.33,-.33];
    const direction=new T.Vector3(...b).sub(new T.Vector3(...a));
    const pillar=new T.Mesh(new T.CylinderGeometry(.018,.022,direction.length(),8),soft);pillar.name='SU7 interior A pillar';
    pillar.position.copy(new T.Vector3(...a).add(new T.Vector3(...b)).multiplyScalar(.5));
    pillar.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),direction.normalize());root.add(pillar);
  }
  root.add(surfaceQuad('SU7 rear parcel shelf',[[-.77,.91,1.38],[.77,.91,1.38],[.80,.91,1.72],[-.80,.91,1.72]],soft));
  const ambient=new T.MeshStandardMaterial({color:0x15272b,emissive:c.interiorAmbientLighting!.color,emissiveIntensity:0,toneMapped:false});
  root.add(box('SU7 ambient dash ribbon',[1.60,.003,.004],[0,.80,-.552],ambient,.001));
  for(const sign of [-1,1])root.add(box('SU7 ambient door ribbon',[.003,.003,1.80],[sign*.825,.80,.37],ambient,.001));
  return {instrument,update(t,dt){
    map.update(t,dt);
    const on=t.ignitionOn??true,lamps=!!(t.indicators?.positionLights||t.indicators?.headlights);
    ambient.emissiveIntensity=T.MathUtils.damp(ambient.emissiveIntensity,cabinAmbientTarget(c.interiorAmbientLighting!,on,lamps,t.ambientDaylight??1),4,dt);
    screenMaterial.color.setScalar(on?1:0);
  }};
}
