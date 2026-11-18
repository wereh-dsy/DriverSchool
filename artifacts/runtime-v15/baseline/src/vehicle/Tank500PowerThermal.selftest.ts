import { createTank500Hi4TPhysicsConfig } from './config/tank500Hi4TPhysicsConfig';
import { P2HybridPowertrain } from './powertrain/P2HybridPowertrain';
import { HybridBattery } from './powertrain/HybridBattery';
import { ElectricMotor } from './powertrain/ElectricMotor';
import type { PowertrainUpdateContext } from './powertrain/Powertrain';
import type { ForwardGear } from './config';
import { ICEHeatState } from './powertrain/ICEHeatState';
import { P2ThermalBudget } from './powertrain/P2ThermalBudget';

export function runTank500PowerThermalSelfTest() {
  let assertions = 0; const check = (ok: boolean, m: string) => { assertions++; if (!ok) throw Error('Tank power/thermal: ' + m); };
  const dt = 1 / 120, results: Record<string, unknown> = {};
  // Fixed-ratio load dynamometer. Holding a ratio is a bench condition, not altered component output.
  function dyno(rpm: number, soc: number, seconds: number, low = false, ambient = 20, highGear: ForwardGear = 3) {
    const cfg = createTank500Hi4TPhysicsConfig(); cfg.ambientTemperature = ambient;
    cfg.transmission.automatic!.shiftStrategy.minimumTimeInGear = 1e9;
    const p = new P2HybridPowertrain(cfg), gear = low ? 2 : highGear;
    p.reset({ driveSelector: 'N', gear, ice: { engineRunning: true, engineRPM: rpm, clutchEngagement: 1 }, ev: { stateOfCharge: soc } });
    if (low) check(p.requestTransferMode('4L', 0, 1), 'low-range thermal dyno selects physical reduction');
    // reset D with the same real initial shaft/crank state; transfer selection follows ordinary gates.
    p.reset({ driveSelector: 'D', gear, ice: { engineRunning: true, engineRPM: rpm, clutchEngagement: 1 },
      ev: { stateOfCharge: soc }, hybrid: { mode: 'SPORT', transferMode: low ? '4L' : 'AWD' } });
    const ratio = cfg.transmission.gearRatios[gear]! * cfg.transmission.finalDriveRatio * p.transfer.ratio;
    const omega = rpm * Math.PI / 30 / ratio;
    const c: PowertrainUpdateContext = { dt, throttle: 1, brake: 0, vehicleSpeed: omega * cfg.wheelRadius, vehicleLateralSpeed: 0,
      drivenWheelAngularVelocity: omega, torqueLimitFactor: 1, clutchPedal: 0 };
    let peakTorque = 0, peakPower = 0, maxEngine = p.thermal!.temperatureC, maxMotor = p.motor.temperature,
      maxBattery = p.battery.temperature, motorEnergyJ = 0, minimumEngineFactor = 1, residual = 0;
    const timeline: unknown[] = [];
    for (let i = 0; i < seconds / dt; i++) {
      p.prepare(c); p.update(c); p.finishStep(c.vehicleSpeed);
      const torque = p.torqueSource.deliveredDriveTorque, power = torque * rpm * Math.PI / 30;
      peakTorque = Math.max(peakTorque, torque); peakPower = Math.max(peakPower, power);
      maxEngine = Math.max(maxEngine, p.thermal!.temperatureC); maxMotor = Math.max(maxMotor, p.motor.temperature);
      maxBattery = Math.max(maxBattery, p.battery.temperature); motorEnergyJ += Math.max(0, p.motor.deliveredDriveTorque * rpm * Math.PI / 30) * dt;
      minimumEngineFactor = Math.min(minimumEngineFactor, p.thermal!.torqueFactor);
      residual = Math.max(residual, Math.abs(p.thermalBudget.fuelEnergyResidualW));
      check(p.numericallyValid && power <= 300001 && torque <= 750.001, 'actual two-source shaft output respects separate power and torque envelopes');
      if (i % 7200 === 7199) timeline.push({ t: (i + 1) * dt, soc: p.battery.stateOfCharge, engineC: p.thermal!.temperatureC,
        motorC: p.motor.temperature, batteryC: p.battery.temperature, motorKW: p.motor.deliveredDriveTorque * rpm * Math.PI / 30 / 1000 });
    }
    return { p, data: { rpm, speedKmh: c.vehicleSpeed * 3.6, peakTorque, peakPowerKW: peakPower / 1000, motorKW: p.motor.deliveredDriveTorque * rpm * Math.PI / 30 / 1000,
      soc: p.battery.stateOfCharge, maxEngineC: maxEngine, maxMotorC: maxMotor, maxBatteryC: maxBattery,
      averageMotorKW: motorEnergyJ / seconds / 1000, minimumEngineFactor, maximumFuelEnergyResidualW: residual, timeline } };
  }
  const grid = [];
  for (const rpm of [1700, 3000, 4000, 5000, 6000]) grid.push(dyno(rpm, .75, 8).data);
  check(grid.some(s => s.peakTorque > 749) && grid.some(s => s.peakPowerKW > 299), '750 Nm and 300 kW are independently attainable in different working regions');
  check(grid.find(s => s.rpm === 1700)!.peakPowerKW < 150 && grid.find(s => s.rpm === 6000)!.peakTorque < 500, 'peak torque is not multiplied by peak-power RPM');
  results.envelope = grid;
  const soc = [];
  for (const initial of [.75, .15, .08, .03]) soc.push({ initialSOC: initial, ...dyno(4000, initial, 8).data });
  check(soc[0]!.motorKW > soc[2]!.motorKW && soc[2]!.motorKW > soc[3]!.motorKW, 'real pack reserve causes progressive electric assistance fade');
  results.soc = soc;
  const low = dyno(3500, 1, 900, true, 35), highway = dyno(3500, 1, 900, false, 35, 6);
  check(low.data.maxEngineC > highway.data.maxEngineC, 'matched-shaft 4L duty cools worse than highway at lower road speed');
  check(low.data.maximumFuelEnergyResidualW < 1 && highway.data.maximumFuelEnergyResidualW < 1, 'fuel work + coolant/friction + exhaust heat close against measured fuel LHV');
  check(low.p.fuel.getSnapshot().fuelUsedL > 0 && low.data.averageMotorKW > 0 && low.p.battery.stateOfCharge < 1, 'sustained load actually consumes fuel and pack, not a temperature-only fixture');
  results.sustainedLow = low.data; results.sustainedHighway = highway.data;
  // Matched measured fuel/crank work isolates radiator airflow from different driver/ratio loads.
  const matchedConfig = createTank500Hi4TPhysicsConfig(); matchedConfig.ambientTemperature = 35;
  const matched: { speedMps: number; temperatureC: number; heatW: number }[] = [];
  const measuredFlow = highway.p.fuel.getSnapshot().currentFuelFlowLPerHour / 3600;
  for (const speed of [3, 30]) {
    const temperature = new ICEHeatState(matchedConfig.engine.thermal!), budget = new P2ThermalBudget();
    for (let i = 0; i < 108000; i++) budget.update(dt, measuredFlow * dt, 3500 * Math.PI / 30,
      highway.p.engine.lastTorqueSample, speed, matchedConfig, temperature);
    matched.push({ speedMps: speed, temperatureC: temperature.temperatureC, heatW: budget.engineHeatW });
  }
  check(matched[0]!.temperatureC > matched[1]!.temperatureC && matched[0]!.heatW === matched[1]!.heatW, 'identical measured heat input independently verifies low-speed cooling deficit');
  results.matchedEngineCooling = matched;
  // Isolated regulated-DC dynamometer separates MOTOR thermal derate from pack SOC/temperature.
  // Input energy is supplied by the bench, not by assigning a vehicle's SOC.
  const cfg = createTank500Hi4TPhysicsConfig(), motor = new ElectricMotor(cfg.hybrid.motor, 45);
  motor.setShaftSpeed(400); let inputJ = 0, outputJ = 0, heatJ = 0, peakTemperature = motor.temperature;
  for (let i = 0; i < 120000; i++) {
    motor.requestTorque(motor.driveLimit(150000)); motor.updateState(dt, 0);
    const torque = motor.deliveredDriveTorque, mechanical = torque * 400;
    const electric = mechanical / motor.efficiency(torque) / cfg.hybrid.inverterEfficiency + (cfg.hybrid.motor.copperLossAtMaxTorque ?? 0) * (torque / 400) ** 2;
    motor.thermal!.integrate(dt, electric - mechanical, 1); peakTemperature = Math.max(peakTemperature, motor.temperature);
    inputJ += electric * dt; outputJ += mechanical * dt; heatJ += (electric - mechanical) * dt;
  }
  check(motor.availablePower < 119000 && motor.temperature > cfg.hybrid.motor.thermal!.derateStartTemperature, 'sustained hot low-airflow motor duty actually derates available power');
  check(Math.abs(inputJ - outputJ - heatJ) < .01, 'external DC motor bench electrical/mechanical/loss energy closes');
  results.motorBench = { ambientC: 45, speedMps: 1, seconds: 1000, peakTemperatureC: peakTemperature, availablePowerKW: motor.availablePower / 1000, residualJ: inputJ - outputJ - heatJ };
  const cold = new HybridBattery(cfg.hybrid, -25), hot = new HybridBattery(cfg.hybrid, 55), normal = new HybridBattery(cfg.hybrid, 20);
  check(cold.availableDischargePower < normal.availableDischargePower && cold.availableChargePower === 0, 'cold pack limits drive and inhibits below-freezing charge');
  check(hot.availableDischargePower < normal.availableDischargePower && hot.availableChargePower < normal.availableChargePower, 'high-temperature charge and discharge derate');
  results.temperatures = { coldDischargeW: cold.availableDischargePower, coldChargeW: cold.availableChargePower, hotDischargeW: hot.availableDischargePower, normalDischargeW: normal.availableDischargePower };
  return { assertions, results };
}
