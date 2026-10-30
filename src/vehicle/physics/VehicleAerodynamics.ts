import type { AeroConfig } from '../config/VehiclePhysicsConfig';

const smooth=(x:number):number=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};

/** Axial quasi-steady aerodynamics, SI units. No tyre-grip scaling or pose edits.
 * Air velocity is projected along body forward, positive as vehicle speed.
 * Lift forces act vertically at axle centres, matching ChassisDynamics.
 */
export class VehicleAerodynamics {
  public dragForce=0;
  public frontVerticalForce=0;
  public rearVerticalForce=0;
  public spoilerDeployment=0;
  private raised=false;
  private airbrake=0;
  public constructor(private readonly config:AeroConfig) {}
  public reset():void {
    this.dragForce=this.frontVerticalForce=this.rearVerticalForce=this.spoilerDeployment=0;
    this.raised=false;
    this.airbrake=0;
  }
  public update(dt:number,speed:number,airLongitudinalVelocity=0,brake=0,lateralAcceleration=0):void {
    const c=this.config,s=c.activeSpoiler;
    const active=c.activeAero;
    if(active) {
      const relative=speed-airLongitudinalVelocity, velocity=Math.abs(relative);
      const speedTarget=smooth((Math.abs(speed)-active.deployStartSpeed)/(active.deployFullSpeed-active.deployStartSpeed));
      const dynamicTarget=Math.max(speedTarget,Math.min(1,Math.abs(lateralAcceleration)/8)*smooth(Math.abs(speed)/35),
        Math.max(0,Math.min(1,brake))*smooth(Math.abs(speed)/25));
      const response=-Math.expm1(-active.responseRate*dt);
      this.spoilerDeployment+=(dynamicTarget-this.spoilerDeployment)*response;
      this.airbrake+=(Math.max(0,Math.min(1,brake))*speedTarget-this.airbrake)*response;
      let lower=active.curve[0]!,upper=lower;
      for(let i=1;i<active.curve.length;i++) {
        upper=active.curve[i]!;
        if(velocity<=upper.speed)break;
        lower=upper;
      }
      const t=upper.speed===lower.speed?0:smooth((velocity-lower.speed)/(upper.speed-lower.speed));
      const front=lower.frontCl+(upper.frontCl-lower.frontCl)*t;
      const rear=lower.rearCl+(upper.rearCl-lower.rearCl)*t;
      const cd=lower.cd+(upper.cd-lower.cd)*t+active.brakingDragDelta*this.airbrake;
      const qA=.5*c.airDensity*c.frontalArea*relative*relative;
      const deployed=active.stowedLiftFraction+(1-active.stowedLiftFraction)*this.spoilerDeployment;
      const uncapped=qA*Math.max(0,-front-rear)*deployed;
      const cap=uncapped>active.maximumDownforceN?active.maximumDownforceN/uncapped:1;
      this.frontVerticalForce=qA*front*deployed*cap;
      this.rearVerticalForce=qA*rear*deployed*cap;
      this.dragForce=-.5*c.airDensity*c.frontalArea*cd*relative*Math.abs(relative);
      return;
    }
    if(s) {
      // Ground speed selects the actuator; relative air speed sets the forces.
      if(Math.abs(speed)>s.deploySpeed)this.raised=true;
      else if(Math.abs(speed)<s.retractSpeed)this.raised=false;
      this.spoilerDeployment+=(Number(this.raised)-this.spoilerDeployment)*(-Math.expm1(-s.responseRate*dt));
    }
    const relative=speed-airLongitudinalVelocity;
    const cd=s?c.dragCoefficient+s.dragCoefficientDelta*this.spoilerDeployment:c.dragCoefficient;
    const rearCl=s?c.liftCoefficientRear+s.rearLiftCoefficientDelta*this.spoilerDeployment:c.liftCoefficientRear;
    // Preserve legacy arithmetic for vehicles with no active aero / still air.
    this.dragForce=-.5*c.airDensity*cd*c.frontalArea*relative*Math.abs(relative);
    const qA=.5*c.airDensity*c.frontalArea*relative*relative;
    this.frontVerticalForce=qA*c.liftCoefficientFront;
    this.rearVerticalForce=qA*rearCl;
  }
}
