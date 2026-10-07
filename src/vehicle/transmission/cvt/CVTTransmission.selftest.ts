import { createNeutralVehicleInputState } from '../../../input/VehicleInputState';
import { createCVTSedanPhysicsConfig } from '../../config';
import { VehicleDynamics } from '../../physics/VehicleDynamics';

export function runCVTSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, text: string) => { assertions++; if (!ok) throw new Error(`CVT: ${text}`); };
  const results = [];
  const config = createCVTSedanPhysicsConfig();
  const input = createNeutralVehicleInputState();
  for (const throttle of [.2, 1]) {
    const car = new VehicleDynamics(config);
    car.setDriverAssistOptions({ absEnabled: true, ebdEnabled: true, tractionControlEnabled: true });
    assert(!car.requestDriveSelector('D', 0), 'brake interlock');
    assert(car.requestDriveSelector('D', 1), 'select drive');
    let last = car.getSnapshot();
    for (let i = 0; i < 1200; i++) {
      const s = car.stepFixed(1/120, { ...input, throttle });
      const ratio = s.transmission.cvt!.ratio;
      assert(Number.isFinite(s.speed) && s.engineRunning && Number.isFinite(s.rpm), 'finite, running engine');
      assert(ratio >= config.transmission.cvt!.minimumRatio && ratio <= config.transmission.cvt!.maximumRatio, 'bounded variator');
      assert(Math.abs(ratio - last.transmission.cvt!.ratio) <= config.transmission.cvt!.ratioChangeRate / 120 + 1e-8, 'continuous ratio slew');
      assert(s.transmission.currentPhysicalGear === null && !s.transmission.shiftInProgress, 'no simulated gears or shift events');
      last = s;
    }
    assert(last.speed > 3 && last.transmission.cvt!.ratio < config.transmission.cvt!.maximumRatio, 'launch and continuous acceleration');
    results.push({ throttle, speedKmh: last.speedKmh, rpm: last.rpm, ratio: last.transmission.cvt!.ratio });
  }
  assert(results[1]!.rpm > results[0]!.rpm + 1500, 'load-dependent RPM target');
  const reverse = new VehicleDynamics(config);
  assert(reverse.requestDriveSelector('R', 1), 'reverse selection');
  let r = reverse.getSnapshot();
  for (let i = 0; i < 240; i++) r = reverse.stepFixed(1/120, { ...input, throttle: .2 });
  assert(r.speed < -.3 && r.wheels.frontLeft.driveTorque < 0, 'reverse sign and front drive');
  assert(!reverse.requestDriveSelector('P', 1), 'moving park rejection');
  reverse.reset();
  assert(reverse.getSnapshot().transmission.parkingLocked, 'park constraint');
  assert(reverse.requestDriveSelector('N', 1), 'neutral selection');
  const n = reverse.stepFixed(1/120, { ...input, throttle: .8 });
  assert(n.wheels.frontLeft.driveTorque === 0 && n.transmission.engineLoadTorque === 0, 'neutral disconnect');
  return { assertions, scenarios: results, reverseSpeedKmh: r.speedKmh };
}
