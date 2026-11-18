export type DifferentialConfig = { type: 'open' } | {
  type: 'lsd';
  /** Nm of clutch preload and dimensionless torque-dependent locking. */
  preload: number;
  lockStrength: number;
  torqueBiasRatio: number;
  /** rad/s -> normalized locking demand. */
  speedDifferenceSensitivity: number;
  response: number;
};

export interface ElectronicDifferentialConfig {
  slipThreshold: number;
  speedDifferenceThreshold: number;
  maximumBrakeTorque: number;
  response: number;
}

export interface ParkingBrakeConfig {
  axle: 'front' | 'rear';
  /** Total axle torque, Nm. */
  maximumTorque: number;
  /** Actuator travel per second. */
  applyRate: number;
  releaseRate: number;
  maximumStaticApplySpeed: number;
  emergencyBrakeDemand: number;
  emergencyResponse: number;
  autoApplyOnIgnitionOff: boolean;
  autoApplyInPark: boolean;
  autoReleaseOnDrive: boolean;
  releaseThrottle: number;
}

export interface AutoHoldConfig {
  enabledByDefault: boolean;
  maximumCaptureSpeed: number;
  captureBrake: number;
  minimumHoldPressure: number;
  releaseThrottle: number;
  releaseThrottleHysteresis: number;
  releaseDelay: number;
  applyRate: number;
  releaseRate: number;
}

export function createRoadParkingBrakeConfig(maximumTorque: number): ParkingBrakeConfig {
  return { axle: 'rear', maximumTorque, applyRate: 2, releaseRate: 4,
    maximumStaticApplySpeed: .5, emergencyBrakeDemand: .65, emergencyResponse: 5,
    autoApplyOnIgnitionOff: true, autoApplyInPark: true,
    autoReleaseOnDrive: true, releaseThrottle: .16 };
}

export function createRoadAutoHoldConfig(): AutoHoldConfig {
  return { enabledByDefault: true, maximumCaptureSpeed: .06, captureBrake: .25,
    minimumHoldPressure: .55, releaseThrottle: .16, releaseThrottleHysteresis: .04,
    releaseDelay: .08, applyRate: 8, releaseRate: 4 };
}
