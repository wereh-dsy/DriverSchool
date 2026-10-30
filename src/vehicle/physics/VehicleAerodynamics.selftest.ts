import { VehicleAerodynamics } from './VehicleAerodynamics';
import { ChassisDynamics } from './ChassisDynamics';
import { VehicleDynamics } from './VehicleDynamics';
import { createVehiclePhysicsConfig } from '../VehicleCatalog';
import { centerOfMassOffsetZ } from '../VehicleDimensions';
import { WHEEL_IDS } from './WheelContact';
import type { ElectricPowertrain } from '../powertrain/ElectricPowertrain';

export function runVehicleAerodynamicsSelfTest() {
  let assertions=0;
  const assert=(ok:boolean,message:string)=>{assertions++;if(!ok)throw Error('Aerodynamics: '+message);};
  const close=(a:number,b:number,tolerance=1e-9)=>Math.abs(a-b)<tolerance;
  const c=createVehiclePhysicsConfig('xiaomi-su7-max-2026'),a={...c.aero,activeSpoiler:undefined},dt=1/120;
  const model=new VehicleAerodynamics(a);
  model.update(dt,0);assert(model.dragForce===0&&model.frontVerticalForce===0&&model.rearVerticalForce===0,'zero relative flow');
  model.update(dt,10);const drag10=model.dragForce,front10=model.frontVerticalForce,rear10=model.rearVerticalForce;
  model.update(dt,20);assert(close(model.dragForce,4*drag10)&&close(model.frontVerticalForce,4*front10)&&close(model.rearVerticalForce,4*rear10),'v squared in N on both axles');
  for(const [speed,air] of [[20,0],[20,10],[20,-10],[20,30],[-20,0],[0,20]]) {
    model.update(dt,speed!,air!);const relative=speed!-air!;
    assert(close(model.dragForce,-.5*a.airDensity*a.dragCoefficient*a.frontalArea*relative*Math.abs(relative))&&model.dragForce*relative<=0,'drag opposes relative axial air motion');
    assert(close(model.frontVerticalForce,.5*a.airDensity*a.frontalArea*relative**2*a.liftCoefficientFront),'lift uses same relative flow');
  }
  model.update(dt,20,20);assert(model.dragForce===0&&model.rearVerticalForce===0,'following air cancels flow');
  const positiveLift=new VehicleAerodynamics({...a,liftCoefficientFront:.02,liftCoefficientRear:.03});positiveLift.update(dt,30);
  assert(positiveLift.frontVerticalForce>0&&positiveLift.rearVerticalForce>0,'positive Cl means upward lift');

  const wing=new VehicleAerodynamics(c.aero),s=c.aero.activeSpoiler!;
  wing.update(dt,90/3.6);assert(wing.spoilerDeployment===0,'strict original deploy threshold');
  let maxDeploymentStep=0,maxForceStep=0;
  const advance=(speed:number)=>{
    const previous=wing.spoilerDeployment,force=wing.rearVerticalForce;
    // Keep relative flow 30 m/s while crossing actuator thresholds, isolating
    // actuator continuity from the ordinary speed-squared change in pressure.
    wing.update(dt,speed,speed-30);
    maxDeploymentStep=Math.max(maxDeploymentStep,Math.abs(wing.spoilerDeployment-previous));
    maxForceStep=Math.max(maxForceStep,Math.abs(wing.rearVerticalForce-force));
  };
  wing.update(0,25,25-30);
  advance(25.01);const first=wing.spoilerDeployment;
  assert(first>0&&first<s.responseRate*dt,'deployment is rate bounded, not a step');
  for(let i=0;i<360;i++)advance(i%2?24.99:25.01);
  assert(wing.spoilerDeployment>.999,'threshold oscillation cannot chatter the selected state');
  const raised=wing.spoilerDeployment;advance(80/3.6);
  assert(wing.spoilerDeployment>=raised,'90 to 70 km/h band holds deployment');
  advance(69.99/3.6);assert(wing.spoilerDeployment<raised,'retract threshold has smooth response');
  for(let i=0;i<360;i++)advance(i%2?70.01/3.6:69.99/3.6);
  assert(wing.spoilerDeployment<.001,'retraction holds within hysteresis band');
  assert(maxDeploymentStep<=s.responseRate*dt,'all actuator steps bounded');
  assert(maxForceStep<=.5*a.airDensity*a.frontalArea*900*Math.abs(s.rearLiftCoefficientDelta)*s.responseRate*dt+1e-6,'force continuity at constant pressure');
  const sixty=new VehicleAerodynamics(c.aero),oneTwenty=new VehicleAerodynamics(c.aero);
  for(let i=0;i<60;i++)sixty.update(1/60,40);
  for(let i=0;i<120;i++)oneTwenty.update(dt,40);
  assert(close(sixty.spoilerDeployment,oneTwenty.spoilerDeployment),'exponential actuator is timestep consistent');
  wing.reset();assert(wing.spoilerDeployment===0&&wing.dragForce===0,'respawn clears state');

  // Analytic airborne force/moment test: no tyre support, no contact constraints.
  // Isolate the existing sprung solver; actual SU7 unsprung equilibrium is
  // checked separately by steady wheel-reaction measurements.
  const airborne=structuredClone(c);airborne.suspension.unsprungMass=undefined;airborne.tires.verticalCompliance=undefined;
  const car=new VehicleDynamics<ElectricPowertrain>(airborne,{driveSelector:'N'});
  const frame=structuredClone(car.suspension.getVerticalSnapshot());
  for(const id of WHEEL_IDS){const corner=frame.wheels[id] as {grounded:boolean;supportValid?:boolean};corner.grounded=false;corner.supportValid=false;}
  const motion=new ChassisDynamics(airborne),f=-300,r=-600,cg=centerOfMassOffsetZ(airborne);
  motion.beginStep(1);motion.integrate(dt,0,0,0,frame,car.getSnapshot().wheels,f,r);motion.finishStep(dt);
  const torque=(airborne.wheelBase/2+cg)*f-(airborne.wheelBase/2-cg)*r;
  assert(close(motion.acceleration,-airborne.gravity+(f+r)/airborne.mass),'vertical force injected exactly once');
  assert(close(motion.pitchTorque,torque)&&motion.pitch>0,'rear/front axle moment arms and pitch sign');
  assert(motion.roll===0,'symmetric axle forces produce no roll torque');
  return {assertions,maxDeploymentStep,maxForceStepN:maxForceStep,airbornePitchTorqueNm:motion.pitchTorque};
}
