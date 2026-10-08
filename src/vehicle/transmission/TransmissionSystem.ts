import type { DriveSelector, Gear, TransmissionType } from '../config';

export interface TransmissionSnapshot {
  type: TransmissionType;
  selectedMode: DriveSelector | null;
  currentPhysicalGear: Gear | null;
  manualSelectionActive?: boolean;
  manualSelectionRejectedReason?: string | null;
  cvt?: { ratio: number; targetRatio: number; targetRPM: number };
  inputRPM: number;
  outputRPM: number;
  engineLoadTorque: number;
  transmittedTorque: number;
  shiftInProgress: boolean;
  shiftState: string;
  shiftProgress: number;
  kickdown: boolean;
  selectorRejectedReason: string | null;
  parkingLocked: boolean;
  torqueConverter?: {
    pumpRPM: number; turbineRPM: number; speedRatio: number; slipRPM: number;
    torqueRatio: number; lockupEngagement: number;
  };
  dct?: {
    clutchAEngagement: number; clutchBEngagement: number;
    activeShaft: 'A' | 'B' | null; preselectedGear: Gear | null;
    shaftAGear: Gear | null; shaftBGear: Gear | null;
  };
}

/** SI units. Selector is a request, never a physical ratio or a UI string. */
export interface TransmissionContext {
  dt: number;
  engineAngularVelocity: number;
  engineRPM: number;
  engineRunning: boolean;
  engineInertia: number;
  idleRPM: number;
  stallRPM: number;
  redlineRPM: number;
  availableEngineTorque: number;
  throttle: number;
  brake: number;
  vehicleSpeed: number;
  vehicleLateralSpeed?: number;
  drivenWheelAngularVelocity: number;
  selectorRequest?: DriveSelector;
}

export interface TransmissionOutput {
  /** Load applied to Engine.integrate, not an RPM command. */
  engineLoadTorque: number;
  transmittedTorque: number;
  /** Gearbox output before final drive. */
  outputTorque: number;
  /** Final drive is configuration, so the shared integration consumes this value. */
  drivenWheelTorque: number;
  parkingLocked: boolean;
}

/** Two phases retain Engine's existing throttle -> torque -> load order. */
export interface TransmissionSystem {
  readonly type: TransmissionType;
  reset(gear?: Gear, selector?: DriveSelector): void;
  requestManualSelection?(direction: -1 | 1): void;
  returnToAuto?(): void;
  prepare(context: TransmissionContext): { throttleScale: number };
  update(context: TransmissionContext): TransmissionOutput;
  requestSelector(selector: DriveSelector, speed: number, lateralSpeed?: number, brake?: number): boolean;
  getSnapshot(): TransmissionSnapshot;
}

export const angularVelocityToRPM = (omega: number): number => omega * 60 / (2 * Math.PI);

/** Automatic actuators may unload the crank before combustion stalls. MT never uses this. */
export function limitAutomaticEngineLoad(load: number, context: TransmissionContext): number {
  if (!context.engineRunning) return 0;
  const safeRPM = Math.max(context.stallRPM + 120, context.idleRPM * 0.82);
  const safeOmega = safeRPM * 2 * Math.PI / 60;
  const maximumLoad = context.availableEngineTorque +
    Math.max(0, context.engineAngularVelocity - safeOmega) * context.engineInertia / Math.max(1e-4, context.dt);
  return Math.min(load, Math.max(0, maximumLoad));
}
