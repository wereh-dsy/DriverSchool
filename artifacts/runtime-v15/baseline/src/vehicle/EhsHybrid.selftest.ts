import { createQinPlusDmiPhysicsConfig } from './config/qinPlusDmiPhysicsConfig';
import { validateEhsHybridConfig } from './config/validateEhsHybridConfig';
import { EhsHybridSystem } from './powertrain/EhsHybridSystem';
import type { PowertrainUpdateContext } from './powertrain/Powertrain';

function assert(ok: boolean, message: string): asserts ok { if (!ok) throw new Error(message); }
const DT = 1 / 120;
function fixture(soc = .8, speed = 0) {
  const config = createQinPlusDmiPhysicsConfig(); validateEhsHybridConfig(config);
  const p = new EhsHybridSystem(config);
  p.reset({ vehicleOperational: true, driveSelector: 'D', ev: { stateOfCharge: soc } });
  const c: PowertrainUpdateContext = { dt: DT, throttle: .3, brake: 0, vehicleSpeed: speed,
    vehicleLateralSpeed: 0, drivenWheelAngularVelocity: speed / config.wheelRadius,
    torqueLimitFactor: 1, clutchPedal: 0 };
  let maxResidual = 0, minLoss = 0, maximumJump = 0, previousTorque = 0;
  const paths = new Set<string>();
  const step = (seconds: number, patch: Partial<PowertrainUpdateContext> = {}, absLimit?: number) => {
    Object.assign(c, patch);
    c.drivenWheelAngularVelocity = c.vehicleSpeed / config.wheelRadius;
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      const maxDraw = p.battery.dischargeLimit(DT), maxCharge = p.battery.chargeLimit(DT);
      p.prepare(c); const out = p.update(c);
      if (absLimit !== undefined) p.limitRegeneration(absLimit);
      p.finishStep(c.vehicleSpeed);
      const s = p.getSnapshot(); paths.add(s.ehs.state);
      maxResidual = Math.max(maxResidual, Math.abs(s.ehs.energy.residualW));
      minLoss = Math.min(minLoss, ...Object.values(s.ehs.losses));
      maximumJump = Math.max(maximumJump, Math.abs(out.drivenWheelTorque - previousTorque));
      previousTorque = out.drivenWheelTorque;
      assert(p.numericallyValid, 'finite EHS state');
      assert(s.ehs.battery.soc >= 0 && s.ehs.battery.soc <= 1, 'SOC bounds');
      assert(s.ehs.p1GenerationPowerW <= config.ehs.p1.maxRegenPower + 1, 'P1 power ceiling');
      assert(s.ehs.p3MechanicalPowerW <= config.ehs.p3.maxDrivePower + 1, 'P3 mechanical power ceiling');
      assert(s.ehs.busPowerW <= maxDraw + 1 && s.ehs.busPowerW >= -maxCharge - 1, 'single pack charge/discharge budget');
      assert(Math.abs(s.ehs.energy.residualW) < 2, `energy residual ${s.ehs.energy.residualW} W`);
      assert(Math.min(...Object.values(s.ehs.losses)) > -.1, `passive loss must not create energy: ${JSON.stringify(s.ehs.losses)}`);
      assert(s.ehs.path !== 'SERIES' || s.ehs.directClutch.torqueNm === 0, 'series must not apply crank torque to wheels');
    }
    return p.getSnapshot();
  };
  return { p, c, config, step, paths, metrics: () => ({ maxResidualW: maxResidual, minLossW: minLoss, maximumJumpNm: maximumJump }) };
}

export function runEhsHybridSelfTests() {
  const results: Record<string, unknown> = {};
  for (const speed of [0, 12, 25]) {
    const f = fixture(.85, speed), before = f.p.battery.remainingEnergyKWh;
    const s = f.step(8, { throttle: .22 });
    assert(s.ehs.path === 'EV' && !s.ice.engineRunning && s.ehs.p1GenerationPowerW === 0, 'EV priority');
    assert(s.ev.motorTorque > 0 && f.p.battery.remainingEnergyKWh < before, 'EV delivers physical motor work');
    results[`EV/${speed}`] = { torque: s.ev.motorTorque, ...f.metrics() };
  }
  const series = fixture(.19, 12);
  const a = series.step(20, { throttle: .22 });
  const rpm = a.ice.rpm;
  const b = series.step(10, { vehicleSpeed: 16, throttle: .165 });
  assert(a.ehs.path === 'SERIES' && b.ehs.path === 'SERIES' && a.ehs.p1GenerationPowerW > 1000, 'independent P1 generation');
  assert(Math.abs(b.ice.rpm - rpm) < 500, 'series RPM follows power, not wheel speed');
  assert(b.ice.fuel.tripFuelUsedL > 0 && b.ehs.p3MechanicalPowerW > 0, 'fuel funds series propulsion');
  results.series = { beforeRPM: rpm, afterRPM: b.ice.rpm, generationW: b.ehs.p1GenerationPowerW, ...series.metrics() };

  const transition = fixture(.30, 12); transition.p.setHybridMode('HOLD', .30);
  transition.step(15, { throttle: .35 });
  let t = transition.p.getSnapshot();
  for (let i = 0; i < 3600; i++) t = transition.step(DT, { vehicleSpeed: 12 + Math.min(18, i * DT * 1.5), throttle: .24 });
  assert(transition.paths.has('SERIES') && transition.paths.has('PARALLEL'), 'series to parallel path');
  assert(t.ehs.directClutch.torqueNm > 5 && t.ev.motorTorque > 0, `engine and P3 jointly drive front wheels: ${JSON.stringify(t.ehs)}`);
  assert(transition.metrics().maximumJumpNm < 180, 'bounded torque change during path transition');
  results.transition = { paths: [...transition.paths], clutch: t.ehs.directClutch, ...transition.metrics() };

  const direct = fixture(.35, 31); direct.p.setHybridMode('HOLD', .35);
  const d = direct.step(35, { throttle: .12 });
  assert(d.ehs.path === 'PARALLEL' && d.ehs.directClutch.engagement > .95, 'highway clutch engagement');
  assert(d.ehs.state === 'DIRECT', `direct operating label: ${d.ehs.state}`);
  results.direct = { state: d.ehs.state, engineRPM: d.ice.rpm, wheelPowerW: d.ehs.wheelPowerW, ...direct.metrics() };
  const demand = fixture(.8, 15); const high = demand.step(20, { throttle: 1 });
  assert(high.ehs.engineRequested && high.ice.engineRunning, 'deep pedal uses HEV despite high SOC');
  results.highLoad = { state: high.ehs.state, generationW: high.ehs.p1GenerationPowerW, ...demand.metrics() };

  const sustain = fixture(.18, 18); const lowSOC = sustain.p.battery.stateOfCharge;
  const sustained = sustain.step(360, { throttle: .18 });
  assert(sustained.ehs.wheelPowerW > 10000 && sustain.p.battery.stateOfCharge > lowSOC - .015, `sustained low-SOC propulsion: ${JSON.stringify(sustained.ehs)}`);
  assert(sustained.ice.fuel.tripFuelUsedL > .1, 'sustained operation consumes real fuel');
  results.sustained = { socBefore: lowSOC, socAfter: sustain.p.battery.stateOfCharge, ...sustain.metrics() };

  const charge = fixture(.30, 0); charge.p.setHybridMode('HOLD', .55);
  const storedBefore = charge.p.battery.remainingEnergyKWh;
  const cs = charge.step(60, { throttle: 0, brake: 1 });
  assert(charge.p.battery.remainingEnergyKWh > storedBefore && cs.ice.fuel.tripFuelUsedL > 0, 'P1 stationary generation charges from fuel');
  assert(cs.ehs.p3MechanicalPowerW === 0 && cs.ehs.directClutch.torqueNm === 0, 'P1 never masquerades as axle motor');
  results.generation = { energyAddedKWh: charge.p.battery.remainingEnergyKWh - storedBefore, fuelL: cs.ice.fuel.tripFuelUsedL, ...charge.metrics() };

  const regen = fixture(.6, 20);
  const rs = regen.step(5, { throttle: 0, brake: .5, totalServiceBrakeTorque: 2000, frontAxleBrakeTorque: 1300 });
  assert(rs.ev.regenerativeBrakeTorque > 100 && rs.ev.batteryPowerKw < 0, 'P3 regenerative braking');
  const beforeABS = regen.p.battery.remainingEnergyKWh;
  const abs = regen.step(1, {}, 0);
  assert(abs.ev.regenerativeBrakeTorque === 0 && abs.ev.motorTorque === 0, 'same-step ABS cancels P3 torque');
  assert(regen.p.battery.remainingEnergyKWh < beforeABS, 'ABS cancellation removes charge energy this tick');
  results.regenABS = { regenNm: rs.ev.regenerativeBrakeTorque, absNm: abs.ev.regenerativeBrakeTorque, ...regen.metrics() };
  const full = fixture(1, 20); const fs = full.step(3, { throttle: 0, brake: .6, totalServiceBrakeTorque: 3000 });
  assert(fs.ev.regenerativeBrakeTorque < 30 && fs.ev.requestedBrakeTorque === 3000, 'full pack leaves ordinary brake demand intact');
  results.fullPack = { regenNm: fs.ev.regenerativeBrakeTorque, ...full.metrics() };

  const ac = fixture(.4); ac.p.requestStop(); ac.p.requestDriveSelector('P', 0, 0, 1);
  assert(ac.p.connectCharger('AC'), 'AC connection');
  assert(!ac.p.requestStart() && !ac.p.requestDriveSelector('D', 0, 0, 1), 'charging interlock');
  const acBefore = ac.p.battery.remainingEnergyKWh;
  ac.step(120, { throttle: 0 });
  assert(ac.p.battery.remainingEnergyKWh > acBefore, 'grid energy restores SOC');
  assert(ac.p.battery.gridEnergyKWh > ac.p.battery.remainingEnergyKWh - acBefore, 'charger and battery losses');
  results.AC = { gridKWh: ac.p.battery.gridEnergyKWh, addedKWh: ac.p.battery.remainingEnergyKWh - acBefore, ...ac.metrics() };
  const thermal = fixture(.6, 18), pack = thermal.p.battery;
  const warmDischarge = pack.availableDischargePower, warmCharge = pack.availableChargePower;
  pack.thermal!.temperature = -20;
  assert(pack.availableDischargePower < warmDischarge * .2 && pack.availableChargePower === 0, 'cold derating');
  pack.thermal!.temperature = 65;
  assert(pack.availableDischargePower < warmDischarge * .2 && pack.availableChargePower < warmCharge * .2, 'hot derating');
  const hot = thermal.step(20, { throttle: .5 });
  results.thermal = { warmDischargeW: warmDischarge, hotDischargeW: hot.ev.availableDischargePower, ...thermal.metrics() };

  const continuous = fixture(.25, 24); continuous.p.setHybridMode('SPORT');
  const cont = continuous.step(600, { throttle: .55 });
  assert(cont.ehs.p3TemperatureC > 20 && cont.ehs.battery.temperatureC > 20, 'physical loss heat');
  assert(continuous.p.numericallyValid && cont.ehs.battery.soc > 0, 'continuous load stability');
  results.continuous = { batteryC: cont.ehs.battery.temperatureC, p1C: cont.ehs.p1TemperatureC,
    p3C: cont.ehs.p3TemperatureC, soc: cont.ehs.battery.soc, ...continuous.metrics() };
  const starts = fixture(.5, 12); starts.p.setHybridMode('HOLD', .65);
  starts.step(20, { throttle: .25 }); starts.p.setHybridMode('EV');
  const stopped = starts.step(20, { throttle: .15 });
  assert(!stopped.ice.engineRunning && stopped.ev.motorTorque > 0, 'engine shutdown preserves P3 drive');
  assert(starts.metrics().maximumJumpNm < 180, 'start/stop torque continuity');
  const saved = starts.p.captureState(); starts.p.reset(saved, true);
  assert(Math.abs(starts.p.battery.stateOfCharge - stopped.ehs.battery.soc) < 1e-10, 'SOC capture/recovery');
  results.startStop = starts.metrics();
  const noFuel = fixture(.19, 12); noFuel.p.setCurrentFuelL(.000001);
  const empty = noFuel.step(5, { throttle: .2 });
  assert(!empty.ice.engineRunning && empty.ehs.p1GenerationPowerW === 0 && empty.ehs.directClutch.torqueNm === 0,
    'unusable fuel remainder cannot fund engine or P1 generation');
  results.fuelBoundary = noFuel.metrics();
  return results;
}
