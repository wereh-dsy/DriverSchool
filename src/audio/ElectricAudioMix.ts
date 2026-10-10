import type { VehicleLightingState } from '../vehicle/control/VehicleLightingController';

export interface ElectricAudioOptions {
  vehicleSpeed?: number; roadRoughness?: number; cockpit?: boolean;
  maximumTorque?: number; maximumRPM?: number; regenerativePowerKw?: number;
  operational?: boolean; driving?: boolean;
}
const unit = (n: number): number => Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
export function calculateElectricAudioMix(rpm: number, torque: number, options: ElectricAudioOptions = {}) {
  const speed = Math.abs(options.vehicleSpeed ?? 0), rotation = unit(Math.abs(rpm) / (options.maximumRPM ?? 14500));
  const load = unit(Math.abs(torque) / (options.maximumTorque ?? 360));
  const moving = unit(speed / 1.2), cabin = options.cockpit !== false ? .65 : 1;
  const regen = (options.regenerativePowerKw ?? 0) > .05;
  return { frequency: 180 + rotation * (regen ? 1250 : 1450),
    motor: options.operational !== false ? moving * (.002 + load * .030) * cabin * (1 - unit(speed / 60) * .55) : 0,
    harmonic: regen ? .28 : .12,
    pedestrian: options.operational !== false && options.driving && speed > .15 ? unit(speed / .8) * (1 - unit(speed / 8)) * .008 : 0,
    road: unit(speed / 42) ** 2 * (.011 + unit(options.roadRoughness ?? .12) * .021) * cabin,
    wind: unit(speed / 50) ** 1.7 * .020 * cabin, speed: Number.isFinite(speed) ? speed : 0 };
}

/** Emits at most one click for each observed common controller phase edge. */
export class TurnSignalClickTracker {
  private previous: boolean | null = null;
  public reset(): void { this.previous = null; }
  public update(state: Pick<VehicleLightingState, 'hazard' | 'leftTurnSignal' | 'rightTurnSignal' | 'leftBlinkOn' | 'rightBlinkOn'>): 'on' | 'off' | null {
    if (!(state.hazard || state.leftTurnSignal || state.rightTurnSignal)) { this.reset(); return null; }
    const on = state.leftBlinkOn || state.rightBlinkOn;
    if (on === this.previous) return null;
    const first = this.previous === null; this.previous = on;
    return first && !on ? null : on ? 'on' : 'off';
  }
}
