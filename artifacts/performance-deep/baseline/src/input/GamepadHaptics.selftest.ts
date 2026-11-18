import { GamepadHaptics } from './GamepadHaptics';

interface MockCommand { readonly weakMagnitude: number; readonly strongMagnitude: number; readonly duration: number }
export async function runGamepadHapticsSelfTest(): Promise<Record<string, number | boolean>> {
  let assertions = 0;
  const assert = (condition: boolean, message: string): void => {
    assertions += 1;
    if (!condition) throw new Error(`Gamepad haptics self-test: ${message}`);
  };
  const commands: MockCommand[] = []; let resets = 0;
  const actuator = { type: 'dual-rumble', effects: ['dual-rumble'],
    playEffect: (_type: string, parameters: MockCommand): Promise<string> => {
      commands.push({ ...parameters }); return Promise.resolve('complete');
    }, reset: (): Promise<string> => { resets += 1; return Promise.resolve('complete'); } };
  let selected: Gamepad | null = { index: 0, id: 'Xbox standard test', connected: true,
    mapping: 'standard', vibrationActuator: actuator } as unknown as Gamepad;
  const haptics = new GamepadHaptics({ getGamepad: () => selected });
  haptics.pushPulse({ kind: 'stall', weak: 0.3, strong: 0.55, durationMs: 170 });
  haptics.update(1 / 120, { weak: 0.045, strong: 0 });
  assert(commands[0]?.strongMagnitude === 0.55, 'first connected frame lost its newly queued event');
  for (let frame = 0; frame < 120; frame += 1) haptics.update(1 / 120, { weak: 0.045, strong: 0 });
  assert(commands.length >= 25 && commands.length <= 40, '120-Hz callers must be limited to 20–40 Hz actuator commands');
  assert(commands.every(command => command.duration >= 25 && command.duration <= 250), 'unbounded command duration');
  const frequencyCommands = commands.length;
  haptics.pushPulse({ kind: 'collision', weak: 0.35, strong: 0.85, durationMs: 150 });
  for (let frame = 0; frame < 12; frame += 1) haptics.update(1 / 120, { weak: 0.045, strong: 0 });
  assert(commands.slice(frequencyCommands).every(command => command.strongMagnitude === 0.85),
    'continuous weak idle commands overwrote a stronger outstanding collision pulse');
  haptics.setEnabled(false); const beforeDisabled = commands.length;
  for (let frame = 0; frame < 24; frame += 1) haptics.update(1 / 120, { weak: 1, strong: 1 });
  assert(commands.length === beforeDisabled && resets > 0, 'vibration OFF must immediately stop and refuse new output');
  haptics.setEnabled(true); haptics.update(0.04, { weak: 0.03, strong: 0 });
  selected = null; haptics.update(0.04, { weak: 1, strong: 1 });
  const afterDisconnect = commands.length;
  assert(!haptics.isSupported && resets >= 2, 'disconnect must stop the previous actuator');
  haptics.pushPulse({ kind: 'collision', weak: 1, strong: 1, durationMs: 150 });
  for (let frame = 0; frame < 24; frame += 1) haptics.update(1 / 120, { weak: 1, strong: 1 });
  assert(commands.length === afterDisconnect, 'disconnected pad still received commands');
  selected = { index: 0, id: 'Xbox standard test', connected: true, mapping: 'standard', vibrationActuator: actuator } as unknown as Gamepad;
  haptics.update(0.04, { weak: 0.04, strong: 0 });
  assert(commands.at(-1)?.strongMagnitude === 0 && commands.at(-1)?.weakMagnitude === 0.04,
    'hot-plug reconnect must resume quiet continuous output without an old event');

  let failures = 0;
  const unsupported = new GamepadHaptics({ getGamepad: () => ({ index: 1, id: 'No actuator', connected: true,
    mapping: 'standard' } as unknown as Gamepad) });
  for (let frame = 0; frame < 120; frame += 1) unsupported.update(1 / 120, { weak: 1, strong: 1 });
  assert(!unsupported.isSupported, 'missing actuator capability should silently disable rumble');
  const rejecting = new GamepadHaptics({ getGamepad: () => ({ index: 2, id: 'Rejected actuator', connected: true,
    mapping: 'standard', vibrationActuator: { type: 'dual-rumble', playEffect: (): Promise<never> => {
      failures += 1; return Promise.reject(new Error('unsupported hardware'));
    }, reset: (): Promise<never> => Promise.reject(new Error('device removed')) } } as unknown as Gamepad) });
  rejecting.update(0.04, { weak: 0.1, strong: 0.2 }); await Promise.resolve(); await Promise.resolve();
  for (let frame = 0; frame < 120; frame += 1) rejecting.update(1 / 120, { weak: 1, strong: 1 });
  assert(failures === 1 && !rejecting.isSupported, 'rejected actuator promise must be caught and stop retry spam');
  const wrongEffect = new GamepadHaptics({ getGamepad: () => ({ index: 3, id: 'Non dual-rumble', connected: true,
    mapping: 'standard', vibrationActuator: { effects: ['trigger-rumble'], playEffect: (): void => { failures += 1; } }
  } as unknown as Gamepad) });
  wrongEffect.update(0.04, { weak: 1, strong: 1 });
  assert(!wrongEffect.isSupported && failures === 1, 'non dual-rumble capabilities must not be invoked');
  const slowCommands: MockCommand[] = [];
  const slowFrame = new GamepadHaptics({ getGamepad: () => ({ index: 4, id: 'Slow frame', connected: true,
    mapping: 'standard', vibrationActuator: { type: 'dual-rumble',
      playEffect: (_type: string, command: MockCommand): void => { slowCommands.push(command); } } } as unknown as Gamepad) });
  slowFrame.pushPulse({ kind: 'jolt', weak: 0.12, strong: 0.035, durationMs: 65 });
  slowFrame.update(0.1, { weak: 0, strong: 0 });
  assert(slowCommands.length === 1 && slowCommands[0]!.weakMagnitude === 0.12 && slowCommands[0]!.duration >= 65,
    'a 65-ms jolt must not be discarded before its first 100-ms rendered frame');
  let lateReject: ((reason: Error) => void) | null = null; let lateCommands = 0;
  const lateEffect = new Promise((_resolve, reject) => { lateReject = reject; });
  const lateFailure = new GamepadHaptics({ getGamepad: () => ({ index: 5, id: 'Late promise', connected: true,
    mapping: 'standard', vibrationActuator: { type: 'dual-rumble', playEffect: (): Promise<unknown> => {
      lateCommands += 1; return lateCommands === 1 ? lateEffect : Promise.resolve('complete');
    } } } as unknown as Gamepad) });
  lateFailure.update(0.04, { weak: 0.05, strong: 0 });
  lateFailure.setEnabled(false); lateFailure.setEnabled(true); lateFailure.update(0.04, { weak: 0.05, strong: 0 });
  (lateReject as unknown as (reason: Error) => void)(new Error('old disabled request'));
  await Promise.resolve(); await Promise.resolve();
  assert(lateFailure.isSupported, 'a stale rejected promise must not disable a newly enabled haptics session');
  haptics.dispose(); unsupported.dispose(); rejecting.dispose(); wrongEffect.dispose(); slowFrame.dispose(); lateFailure.dispose();
  await Promise.resolve();
  return { assertions, continuousCommandsPerSecond: frequencyCommands, failedActuatorAttempts: failures,
    capabilityDetectionPassed: true, mergedPulsePriorityPassed: true, disconnectStopsOutput: true, errorsRemainSilent: true };
}
