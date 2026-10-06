import { DEFAULT_VEHICLE_PHYSICS_CONFIG, SPORTS_COUPE_PHYSICS_CONFIG } from '../config';
import { damp } from './math';
import { SteeringSystem } from './SteeringSystem';

export function runSteeringReturnSelfTest(): Record<string, number | boolean> {
  const assert = (condition: boolean, message: string): void => {
    if (!condition) throw new Error(`Steering return self-test: ${message}`);
  };
  const config = DEFAULT_VEHICLE_PHYSICS_CONFIG.steering;
  const release = (speed: number, grip = 1, initial = 0.75): SteeringSystem => {
    const rack = new SteeringSystem(config); rack.steeringInput = initial;
    for (let step = 0; step < 120; step += 1) rack.update(1 / 120, 0, speed, grip);
    return rack;
  };
  const parked = release(0); const parkingSpeed = release(10 / 3.6);
  const normalSpeed = release(40 / 3.6); const highSpeed = release(100 / 3.6);
  assert(parked.steeringInput > parkingSpeed.steeringInput && parkingSpeed.steeringInput > normalSpeed.steeringInput,
    'speed must smoothly strengthen neutral-input self-centering');
  assert(parked.steeringInput > 0.3, 'parked wheel returns too quickly for fine parking control');
  assert(highSpeed.steeringInput <= normalSpeed.steeringInput && highSpeed.steeringInput > 0,
    'high-speed centering must stay bounded and never overshoot zero');
  const grass = release(10, 0.55); const split = release(10, 0.775); const asphalt = release(10);
  assert(grass.steeringInput > split.steeringInput && split.steeringInput > asphalt.steeringInput,
    'surface influence must be mild but ordered');
  assert(grass.steeringInput / asphalt.steeringInput < 1.3, 'grass must not remove the wheel centering tendency');
  const active = new SteeringSystem(config);
  const activeGrass = new SteeringSystem(config);
  let originalInput = 0; let originalAngle = 0;
  for (let step = 0; step < 360; step += 1) {
    const command = step < 100 ? 0.7 : step < 200 ? -0.55 : 0.025;
    active.update(1 / 120, command, 18, 1); activeGrass.update(1 / 120, command, 18, 0.55);
    originalInput = damp(originalInput, command, config.steeringResponse, 1 / 120);
    const target = originalInput * config.maxRoadWheelAngle / (1 + config.highSpeedSteeringReduction * 18 * 18);
    originalAngle = damp(originalAngle, target, config.steeringDamping, 1 / 120);
    assert(Math.abs(active.steeringInput - originalInput) < 1e-12 && Math.abs(active.steeringAngle - originalAngle) < 1e-12,
      'active driver input or existing high-speed road-wheel reduction changed');
    assert(active.steeringInput === activeGrass.steeringInput, 'self-centering is fighting active player input');
  }
  const centred = new SteeringSystem(config); centred.steeringInput = 0.015;
  centred.update(1 / 120, 0, 10);
  const far = new SteeringSystem(config); far.steeringInput = 0.75; far.update(1 / 120, 0, 10);
  assert(centred.selfCenteringRate < far.selfCenteringRate * 0.5, 'return should soften close to centre');
  for (const initial of [-1, -0.1, 0.1, 1]) {
    const rack = new SteeringSystem(config); rack.steeringInput = initial;
    for (let step = 0; step < 1_200; step += 1) {
      rack.update(1 / 120, 0, 22);
      assert(Math.sign(rack.steeringInput) === Math.sign(initial) && Number.isFinite(rack.steeringAngle),
        'neutral-input return oscillated, crossed zero or became non-finite');
    }
  }
  const reverse = release(-10); assert(reverse.steeringInput === asphalt.steeringInput, 'reverse speed should use the same centering magnitude');
  const gt = new SteeringSystem(SPORTS_COUPE_PHYSICS_CONFIG.steering); gt.steeringInput = 0.75;
  for (let step = 0; step < 120; step += 1) gt.update(1 / 120, 0, 10);
  assert(gt.steeringInput < asphalt.steeringInput, 'GT should retain its more direct rack return character');
  return { parkedAfterOneSecond: parked.steeringInput, tenKmhAfterOneSecond: parkingSpeed.steeringInput,
    fortyKmhAfterOneSecond: normalSpeed.steeringInput, highSpeedAfterOneSecond: highSpeed.steeringInput,
    grassAfterOneSecond: grass.steeringInput, activeSteeringUnchanged: true, noCentreOscillation: true };
}
