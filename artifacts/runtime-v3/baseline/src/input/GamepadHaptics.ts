import type { HapticPulse, RumbleIntensity } from '../vehicle/feedback/VehicleFeedbackSystem';

interface RumbleActuator {
  readonly type?: string;
  readonly effects?: readonly string[];
  playEffect(type: 'dual-rumble', parameters: {
    duration: number; startDelay: number; weakMagnitude: number; strongMagnitude: number;
  }): unknown;
  reset?(): unknown;
}
export interface GamepadHapticsOptions {
  /** The input adapter remains authoritative about which connected pad is selected. */
  getGamepad: () => Gamepad | null;
  enabled?: boolean;
  overallStrength?: number;
  /** Continuous commands are bounded to 20–40 Hz, independently of 120-Hz physics. */
  updateFrequency?: number;
}
interface ActivePulse { pulse: HapticPulse; remaining: number; emitted: boolean }

/** The only place that calls the browser actuator API; failures never affect driving. */
export class GamepadHaptics {
  private enabled: boolean;
  private readonly overallStrength: number;
  private readonly interval: number;
  private readonly pulses: ActivePulse[] = [];
  private actuator: RumbleActuator | null = null;
  private connectionKey: string | null = null;
  private blockedConnection: string | null = null;
  private epoch = 0;
  private elapsed = 1;
  private playing = false;

  constructor(private readonly options: GamepadHapticsOptions) {
    this.enabled = options.enabled ?? true;
    this.overallStrength = safeUnit(options.overallStrength ?? 1);
    this.interval = 1 / clamp(finite(options.updateFrequency, 30), 20, 40);
  }

  get isSupported(): boolean { return this.actuator !== null && this.blockedConnection !== this.connectionKey; }
  get isEnabled(): boolean { return this.enabled; }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  pushPulse(pulse: HapticPulse): void {
    if (!this.enabled) return;
    const normalized: HapticPulse = { kind: pulse.kind, weak: safeUnit(pulse.weak),
      strong: safeUnit(pulse.strong), durationMs: clamp(finite(pulse.durationMs, 60), 25, 250) };
    const existing = this.pulses.find(active => active.pulse.kind === pulse.kind);
    if (existing !== undefined) {
      existing.pulse = { ...normalized, weak: Math.max(existing.pulse.weak, normalized.weak),
        strong: Math.max(existing.pulse.strong, normalized.strong) };
      existing.remaining = Math.max(existing.remaining, normalized.durationMs / 1_000);
      existing.emitted = false;
    } else {
      this.pulses.push({ pulse: normalized, remaining: normalized.durationMs / 1_000, emitted: false });
    }
  }

  /** Call once per rendered frame, not once per physics tick. */
  update(dt: number, continuous: RumbleIntensity): void {
    const step = clamp(finite(dt), 0, 0.1);
    this.elapsed += step;
    for (let index = this.pulses.length - 1; index >= 0; index -= 1) {
      const pulse = this.pulses[index]!;
      // A short physics event must reach the actuator once even when its
      // first rendered frame takes longer than the pulse's nominal duration.
      if (pulse.emitted) pulse.remaining -= step;
      if (pulse.remaining <= 0) this.pulses.splice(index, 1);
    }
    if (!this.enabled) return;
    let gamepad: Gamepad | null;
    try { gamepad = this.options.getGamepad(); } catch { gamepad = null; }
    const nextKey = gamepad?.connected && gamepad.mapping === 'standard' ? `${gamepad.index}:${gamepad.id}` : null;
    if (nextKey !== this.connectionKey) {
      if (this.actuator !== null) this.silentlyReset(this.actuator);
      this.actuator = null; this.playing = false;
      // A fresh event on the first input frame may precede the first rendered
      // haptics poll. Keep that event, but never replay a previous pad's queue.
      if (this.connectionKey !== null || nextKey === null) this.pulses.length = 0;
      this.connectionKey = nextKey; this.blockedConnection = null; this.epoch += 1;
      this.elapsed = 1;
    }
    if (nextKey === null || gamepad === null || this.blockedConnection === nextKey) {
      this.pulses.length = 0;
      return;
    }
    this.actuator = standardActuator(gamepad);
    if (this.actuator === null) { this.blockedConnection = nextKey; this.pulses.length = 0; return; }
    let weak = safeUnit(continuous.weak);
    let strong = safeUnit(continuous.strong);
    let duration = this.interval * 1.7;
    for (const active of this.pulses) {
      weak = Math.max(weak, active.pulse.weak); strong = Math.max(strong, active.pulse.strong);
      duration = Math.max(duration, active.remaining);
    }
    weak *= this.overallStrength; strong *= this.overallStrength;
    if (weak < 0.003 && strong < 0.003) {
      if (this.playing) this.silentlyReset(this.actuator);
      this.playing = false;
      return;
    }
    if (this.elapsed < this.interval) return;
    this.elapsed = 0;
    const epoch = this.epoch;
    try {
      const effect = this.actuator.playEffect('dual-rumble', {
        duration: clamp(duration * 1_000, 25, 250), startDelay: 0,
        weakMagnitude: weak, strongMagnitude: strong,
      });
      this.pulses.forEach(active => { active.emitted = true; });
      this.playing = true;
      Promise.resolve(effect).catch(() => {
        if (this.epoch === epoch) {
          this.blockedConnection = this.connectionKey;
          this.stop();
        }
      });
    } catch {
      this.blockedConnection = nextKey;
      this.stop();
    }
  }

  /** Pause/settings, disconnect and vibration OFF all stop outstanding rumble. */
  stop(): void {
    if (this.actuator !== null) this.silentlyReset(this.actuator);
    this.actuator = null; this.pulses.length = 0; this.playing = false;
    this.elapsed = 1;
    this.epoch += 1;
  }

  dispose(): void { this.stop(); this.enabled = false; this.connectionKey = null; this.epoch += 1; }

  private silentlyReset(actuator: RumbleActuator): void {
    try { Promise.resolve(actuator.reset?.()).catch(() => undefined); } catch { /* Unsupported or disconnected: silent. */ }
  }
}

function standardActuator(gamepad: Gamepad): RumbleActuator | null {
  const actuator = (gamepad as unknown as { vibrationActuator?: RumbleActuator }).vibrationActuator;
  if (actuator === undefined || actuator === null || typeof actuator.playEffect !== 'function') return null;
  const supported = actuator.effects === undefined ? actuator.type === 'dual-rumble'
    : actuator.effects.includes('dual-rumble');
  return supported ? actuator : null;
}
const finite = (value: number | undefined, fallback = 0): number =>
  value !== undefined && Number.isFinite(value) ? value : fallback;
const clamp = (value: number, minimum: number, maximum: number): number => Math.min(maximum, Math.max(minimum, value));
const safeUnit = (value: number): number => clamp(finite(value), 0, 1);
