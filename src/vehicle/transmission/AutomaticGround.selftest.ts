import { createNeutralVehicleInputState, type VehicleInputState } from '../../input/VehicleInputState';
import { DrivingTestTrack } from '../../world/DrivingTestTrack';
import { Subject2Ground } from '../../world/subject2/Subject2Ground';
import { CircuitGround } from '../../world/circuit/CircuitGround';
import { createTest6ATVehiclePhysicsConfig, createTest7DCTVehiclePhysicsConfig } from '../config';
import { VehicleDynamics } from '../physics/VehicleDynamics';
import { VehicleContactSystem } from '../physics/VehicleContactSystem';

/** Automatic powertrains exercise the shipping four-wheel/scene adapter too. */
export function runAutomaticGroundSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string) => {
    assertions++;
    if (!ok) throw new Error(`Automatic ground acceptance: ${message}`);
  };
  const input = (overrides: Partial<VehicleInputState> = {}): VehicleInputState => ({
    ...createNeutralVehicleInputState(), ...overrides,
  });
  const dt = 1 / 120;
  const scenarios = [];
  for (const factory of [createTest6ATVehiclePhysicsConfig, createTest7DCTVehiclePhysicsConfig]) {
    const config = factory();
    for (const ground of [new DrivingTestTrack(), new Subject2Ground(), new CircuitGround()]) {
      try {
        const spawn = ground.spawnPose;
        const car = new VehicleDynamics(config, { x: spawn.position.x, z: spawn.position.z,
          yaw: spawn.yawRadians, driveSelector: 'D' });
        const contacts = new VehicleContactSystem(ground, config);
        let state = car.getSnapshot();
        let maximumSpeedStep = 0;
        for (let frame = 0; frame < 1_200; frame++) {
          const before = state.speed;
          state = contacts.step(dt, input({ throttle: frame < 720 ? 0.25 : 0, brake: frame < 720 ? 0 : 0.55,
            steering: frame >= 360 && frame < 620 ? 0.12 : 0 }), car);
          assert(state.engineRunning && Number.isFinite(state.rpm), `${config.transmission.type}/${ground.metadata.id}: engine alive`);
          assert(state.transmission.type === config.transmission.type, 'scene adapter keeps transmission type');
          assert(Object.values(state.wheels).every(w => Number.isFinite(w.longitudinalForce) && Number.isFinite(w.normalLoad) && w.normalLoad > 0), 'finite positive four-wheel contact states');
          assert(Math.abs(state.chassis.pitch) <= 0.065 && Math.abs(state.chassis.roll) <= 0.075, 'bounded automatic body attitude');
          assert(state.wheels.rearLeft.driveTorque === 0 && state.wheels.rearRight.driveTorque === 0, 'FWD automatic leaves rear axle undriven');
          if (!contacts.collision?.collided) maximumSpeedStep = Math.max(maximumSpeedStep, Math.abs(state.speed - before));
        }
        assert(maximumSpeedStep < 0.12, 'no automatic low-speed numeric discontinuity');
        assert(state.speedKmh < 0.1, 'automatic brakes overcome creep on every map');
        scenarios.push({ transmission: config.transmission.type, map: ground.metadata.id, maximumSpeedStep, stoppedRPM: state.rpm });
      } finally { ground.dispose(); }
    }
    const hill = new Subject2Ground();
    try {
      const car = new VehicleDynamics(config, { x: -43, z: -16, yaw: 0, driveSelector: 'D' });
      const contacts = new VehicleContactSystem(hill, config);
      let state = car.getSnapshot();
      for (let frame = 0; frame < 240; frame++) state = contacts.step(dt, input({ brake: 1 }), car);
      assert(state.speedKmh < 0.05 && state.engineRunning, 'D holds 10% hill under brake');
      let maximumForwardSpeed = 0;
      for (let frame = 0; frame < 840; frame++) {
        state = contacts.step(dt, input({ throttle: 0.7 }), car);
        maximumForwardSpeed = Math.max(maximumForwardSpeed, state.speed);
        assert(state.engineRunning, 'automatic uphill/contact does not stall');
      }
      // The straight test reaches the end-of-lane barrier after climbing;
      // collision can legitimately stop it, so verify successful hill travel.
      assert(state.engineRunning && maximumForwardSpeed > 1.5 && state.z < -19,
        `${config.transmission.type} hill launch from actual contact forces (peak=${maximumForwardSpeed.toFixed(2)}, z=${state.z.toFixed(2)})`);
      scenarios.push({ transmission: config.transmission.type, map: 'subject-2-hill-launch', maximumSpeedKmh: maximumForwardSpeed * 3.6, endSpeedKmh: state.speedKmh, rpm: state.rpm });
    } finally { hill.dispose(); }
  }
  return { assertions, scenarios };
}
