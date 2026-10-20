export interface DriverProfile {
  throttleAggressiveness: number;
  brakeAggressiveness: number;
  steeringAggressiveness: number;
  accelerationPreference: number;
  corneringAggressiveness: number;
  drivingSmoothness: number;
  absInterventionFrequency: number;
  tcsInterventionFrequency: number;
  escInterventionFrequency: number;
  /** Eligible driving seconds; the only field not normalized to [0,1]. */
  sampleDuration: number;
  confidence: number;
}
export const DRIVER_PROFILE_METRICS = ['throttleAggressiveness', 'brakeAggressiveness',
  'steeringAggressiveness', 'accelerationPreference', 'corneringAggressiveness', 'drivingSmoothness',
  'absInterventionFrequency', 'tcsInterventionFrequency', 'escInterventionFrequency'] as const;
export function createNeutralDriverProfile(): DriverProfile {
  return { throttleAggressiveness: .5, brakeAggressiveness: .5, steeringAggressiveness: .5,
    accelerationPreference: .5, corneringAggressiveness: .5, drivingSmoothness: .5,
    absInterventionFrequency: 0, tcsInterventionFrequency: 0, escInterventionFrequency: 0,
    sampleDuration: 0, confidence: 0 };
}
