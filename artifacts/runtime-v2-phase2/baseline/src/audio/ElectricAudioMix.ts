import type { VehicleLightingState } from '../vehicle/control/VehicleLightingController';
import type { CabinAcousticState } from './VehicleCabinAcoustics';

/** Per-vehicle synthesis calibration, not an OEM recording or a physics motor map. */
export interface ElectricVoiceProfile {
  rearBaseHz:number;rearSweepHz:number;frontBaseHz:number;frontSweepHz:number;
  motorLevel:number;frontLevel:number;regenPitchScale:number;regenLevel:number;
  pedestrianBaseHz:number;pedestrianSweepHz:number;pedestrianLevel:number;
  cabinAttenuation:number;roadLevel:number;windLevel:number;
  rearWave:OscillatorType;frontWave:OscillatorType;
}

export interface ElectricAudioOptions {
  /** Adds only the P2 electric layer; combustion owns the road/engine buses. */
  hybridLayer?: boolean;
  vehicleSpeed?: number; roadRoughness?: number; cockpit?: boolean;
  maximumTorque?: number; maximumRPM?: number; regenerativePowerKw?: number;
  operational?: boolean; driving?: boolean;
  presence?: number;
  voice?: ElectricVoiceProfile;frontMotorRPM?:number;driveMode?:string;
  cabinAcoustics?:CabinAcousticState;
  driverAccess?:{readonly doorOpen:number;readonly windowOpen:number};
}
const unit = (n: number): number => Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
export function calculateElectricAudioMix(rpm: number, torque: number, options: ElectricAudioOptions = {}) {
  const speed = Math.abs(options.vehicleSpeed ?? 0), rotation = unit(Math.abs(rpm) / (options.maximumRPM ?? 14500));
  const load = unit(Math.abs(torque) / (options.maximumTorque ?? 360));
  const moving = unit(speed / 1.2), cabin = options.cockpit !== false ? .65 : 1;
  const regen = (options.regenerativePowerKw ?? 0) > .05;
  const voice=options.voice;
  if(voice){
    const cabin=options.cockpit!==false,acoustics=cabin?options.cabinAcoustics:undefined;
    const isolation=cabin?voice.cabinAttenuation*(acoustics?.engineScale??1):1;
    const frontRotation=unit(Math.abs(options.frontMotorRPM??0)/(options.maximumRPM??22000));
    const powered=options.operational!==false,motion=unit(speed/1.5),sport=options.driveMode==='SPORT'?1.12:1;
    const frequency=voice.rearBaseHz+rotation*voice.rearSweepHz*(regen?voice.regenPitchScale:1);
    return {frequency,harmonicFrequency:voice.frontBaseHz+frontRotation*voice.frontSweepHz,
      pedestrianFrequency:voice.pedestrianBaseHz+unit(speed/8)*voice.pedestrianSweepHz,
      motor:powered?motion*(.05+load*.95)*voice.motorLevel*isolation*sport*(regen?voice.regenLevel:1):0,
      harmonic:voice.frontLevel*unit(frontRotation*12)*(.15+load*.85),
      pedestrian:powered&&options.driving&&speed>.15?unit(speed/.8)*(1-unit(speed/8))*voice.pedestrianLevel*(cabin?.28:1):0,
      road:unit(speed/42)**1.8*(.55+unit(options.roadRoughness??.12))*voice.roadLevel*(cabin?.52*(acoustics?.roadScale??1):1),
      wind:unit(speed/50)**1.9*voice.windLevel*(cabin?.38*(acoustics?.windScale??1):1),
      cabinLowpassHz:cabin?acoustics?.lowpassHz??2400:20000,speed};
  }
  const frequency=180+rotation*(regen?1250:1450);
  return { frequency,harmonicFrequency:frequency*1.51,pedestrianFrequency:135,
    motor: options.operational !== false ? moving * (.002 + load * .030) * cabin * (1 - unit(speed / 60) * .55) * (options.presence ?? 1) : 0,
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
