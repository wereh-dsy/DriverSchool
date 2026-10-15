import type { Powertrain } from '../powertrain/Powertrain';
import { longitudinalSlip } from './LongitudinalSlip';
import { TractionController } from './TractionController';
import { DriverAssistSystem } from './DriverAssistSystem';
import { AWDTorqueDistribution } from './AWDTorqueDistribution';
import { VehicleDynamics } from './VehicleDynamics';
import { createVehiclePhysicsConfig } from '../VehicleCatalog';
import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import { createWheelContactBuffer, WHEEL_IDS } from './WheelContact';
import { contactUsefulSlip } from './SurfaceInteraction';
import { SURFACE_PROFILES } from '../../world/SurfaceProfile';
import { implicitClutchDemand } from '../transmission/implicitClutchDemand';
import type { TransmissionContext } from '../transmission/TransmissionSystem';

export function runTractionPerformanceSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, label: string) => { assertions++; if (!ok) throw new Error(`Traction performance: ${label}`); };
  const dt = 1 / 120;
  // Both direction signs, finite rest and a differentiable parking-speed scale.
  for (let kmh = 0; kmh <= 20; kmh += .1) {
    const ground = kmh / 3.6, tread = ground + .15;
    const slip = longitudinalSlip(tread, ground);
    assert(Number.isFinite(slip) && slip > 0 && slip < .1, `ordinary contact slip at ${kmh}`);
    assert(Math.abs(slip + longitudinalSlip(-tread, -ground)) < 1e-12, 'reverse symmetry');
    const adjacent = longitudinalSlip(tread + .001, ground + .001);
    assert(Math.abs(adjacent - slip) < .001, 'no discontinuity around 0/2/5/10 km/h');
  }
  assert(longitudinalSlip(0, 0) === 0 && longitudinalSlip(20, 0) === 1, 'rest and a true stationary burnout');
  const tune = { slipThresholdMultiplier: 1.25, maximumTorqueReduction: .95, response: 8, recoveryResponse: 2 };
  for (const kmh of [0, 1, 2, 3.5, 5, 7.5, 10]) {
    const control = new TractionController();
    const ground = kmh / 3.6;
    const slip = longitudinalSlip(ground + 8, ground);
    for (let n = 0; n < 60; n++) control.update(dt, slip - .13, true, tune);
    assert(control.factor < .5, `TCS controls true wheelspin even at ${kmh} km/h`);
    let previous = control.factor;
    for (let n = 0; n < 150; n++) {
      control.update(dt, -.12, true, tune);
      assert(control.factor - previous <= 2.5 * dt + 1e-12, 'recovery rate bounded at 120 Hz');
      previous = control.factor;
    }
    assert(control.factor > .995, 'recovers fully after spin ends, no multi-second underpower tail');
  }
  const quiet = new TractionController();
  for (let n = 0; n < 600; n++) quiet.update(dt, .005 * Math.sin(n), true, tune);
  assert(quiet.factor === 1, 'hysteresis rejects useful-slip edge noise');
  let previous = 1;
  for (let n = 0; n < 240; n++) {
    const factor = quiet.update(dt, .6, true, tune);
    assert(previous - factor <= 6 * dt + 1e-12 && factor <= previous, 'continuous attack without torque chatter');
    previous = factor;
  }
  assert(quiet.factor < .1, 'sustained severe spin retains strong intervention authority');
  quiet.update(dt, -.1, false, tune);
  assert(quiet.factor === 1, 'switch OFF resets the integrator');

  const config = createVehiclePhysicsConfig('porsche-taycan-4s');
  const wheels = new VehicleDynamics<Powertrain>(config).getSnapshot().wheels;
  const spinning = { ...wheels, rearLeft: { ...wheels.rearLeft, longitudinalSpeed: 10, slipRatio: .8 } };
  const aids = new DriverAssistSystem(config); aids.reset(true);
  for (let n = 0; n < 60; n++) aids.updateTraction(dt, spinning, 1, true, true);
  assert(aids.frontTorqueFactor === 1 && aids.rearTorqueFactor < .4, 'EV independent axle authority');
  assert(aids.engineTorqueFactor > aids.rearTorqueFactor && aids.getSnapshot().tcsActive, 'one axle never masquerades as both axles losing traction');
  const iceConfig = createVehiclePhysicsConfig('executive-lwb-2t');
  const distribution = new AWDTorqueDistribution(iceConfig);
  const nominal = distribution.rearTorqueSplit;
  for (let n = 0; n < 240; n++) distribution.update(dt, 1, wheels, true, .2, 1);
  assert(distribution.rearTorqueSplit > nominal && distribution.rearTorqueSplit <= (iceConfig.awd!.maximumRearTorqueSplit ?? .5), 'ICE reuses rear traction within installed AWD limits');

  const contacts = createWheelContactBuffer();
  const dry = contactUsefulSlip(.1, contacts.frontLeft);
  for (const surfaceType of ['gravel', 'packed-snow', 'sand', 'mud'] as const) {
    const material = { ...contacts.frontLeft, surfaceType, profile: SURFACE_PROFILES[surfaceType] };
    assert(contactUsefulSlip(.1, material) > dry * 1.5, `${surfaceType}: larger useful slip comes from surface data`);
  }

  // Pure friction-coupling impulse conserves angular momentum at the gear and
  // dissipates energy. There is no source torque, tyre force, or velocity edit.
  const context = { dt, engineInertia: .3, drivenWheelInertia: 4, drivenWheelReactionTorque: 0 } as TransmissionContext;
  const torque = implicitClutchDemand(0, 100, 14, context, 10, 1);
  const engineOmega = 100 - torque * dt / .3, wheelOmega = torque * 10 * dt / 4;
  assert(engineOmega - wheelOmega * 10 > 0, 'implicit clutch cannot overshoot and reverse slip in one step');
  assert(.5 * .3 * engineOmega ** 2 + .5 * 4 * wheelOmega ** 2 < .5 * .3 * 100 ** 2, 'coupling dissipates rotational energy');
  assert(Math.abs(.3 * engineOmega + 4 * wheelOmega / 10 - .3 * 100) < 1e-10, 'gear-referred angular impulse conserved');

  // Production clutch integration must not alternate +/- capacity at 60 Hz.
  const car = new VehicleDynamics(createVehiclePhysicsConfig('ferrari-458-italia'), { driveSelector: 'D', engineRunning: true });
  const input = createNeutralVehicleInputState();
  let lastTorque = 0, signReversals = 0, zeroTo100: number | null = null, serviceDrag = 0;
  for (let n = 0; n < 1200; n++) {
    const s = car.stepFixed(dt, { ...input, throttle: 1 }, { wheelContacts: contacts });
    const torque = s.forces.clutchTorque;
    if (!s.transmission.shiftInProgress && n > 120 && torque * lastTorque < -10000) signReversals++;
    if (n > 60) serviceDrag = Math.max(serviceDrag, Math.abs(s.forces.serviceBrakeForce));
    assert(!s.recoveredFromInvalidState, 'production launch finite');
    lastTorque = torque;
    if (s.speedKmh >= 100) { zeroTo100 = (n + 1) * dt; break; }
  }
  assert(signReversals === 0, 'no artificial +/- clutch-capacity wheelspin');
  assert(serviceDrag < 1, 'full pedal has no sustained friction brake drag');
  assert(zeroTo100 !== null && zeroTo100 < 4.3, 'physical supercar standing-start class without fake LC boost');
  for (const id of WHEEL_IDS) assert(car.wheelRotation.tyres.states[id].warningState === 'NORMAL', 'no abnormal tyre pressure during launch');
  return { assertions, lowSpeedBinsKmh: [0, 2, 5, 10], signReversals, zeroTo100, serviceDrag };
}
