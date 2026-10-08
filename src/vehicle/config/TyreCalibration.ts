import type { TireConfig } from './VehiclePhysicsConfig';

export type TyreProfile = 'ECO_TOURING' | 'COMFORT_TOURING' | 'PREMIUM_TOURING' | 'SUV_ROAD' | 'SPORT_TOURING' | 'PERFORMANCE';
// Fill the existing tyre model at config creation; no runtime profile object.
const profiles: Record<TyreProfile, Partial<TireConfig>> = {
  ECO_TOURING: { longitudinalGrip: .96, lateralGrip: .97, rollingResistance: .0105,
    corneringStiffnessFront: 72000, corneringStiffnessRear: 75000, peakSlipRatio: .12, peakSlipAngle: .15, gripFalloff: .28,
    wetLongitudinalGripRetention: .94, wetLateralGripRetention: .93 },
  COMFORT_TOURING: { longitudinalGrip: .98, lateralGrip: .99, rollingResistance: .012,
    corneringStiffnessFront: 74000, corneringStiffnessRear: 77000, peakSlipRatio: .12, peakSlipAngle: .145, gripFalloff: .28,
    wetLongitudinalGripRetention: .96, wetLateralGripRetention: .95 },
  PREMIUM_TOURING: { longitudinalGrip: 1.03, lateralGrip: 1.04, rollingResistance: .0115, wheelInertia: 1.65,
    corneringStiffnessFront: 103000, corneringStiffnessRear: 108000, peakSlipRatio: .105, peakSlipAngle: .131, gripFalloff: .30,
    wetLongitudinalGripRetention: .98, wetLateralGripRetention: .97 },
  SUV_ROAD: { longitudinalGrip: .98, lateralGrip: .99, rollingResistance: .013, wheelInertia: 2.25, loadSensitivity: .07,
    corneringStiffnessFront: 102000, corneringStiffnessRear: 106000, peakSlipRatio: .11, peakSlipAngle: .14, gripFalloff: .35,
    wetLongitudinalGripRetention: .95, wetLateralGripRetention: .94 },
  SPORT_TOURING: { longitudinalGrip: 1, lateralGrip: 1.02, rollingResistance: .0115,
    corneringStiffnessFront: 82000, corneringStiffnessRear: 84000, peakSlipRatio: .105, peakSlipAngle: .131, gripFalloff: .33,
    wetLongitudinalGripRetention: .95, wetLateralGripRetention: .94 },
  PERFORMANCE: { longitudinalGrip: 1.06, lateralGrip: 1.12, rollingResistance: .013,
    corneringStiffnessFront: 96000, corneringStiffnessRear: 101000, peakSlipRatio: .095, peakSlipAngle: .12, gripFalloff: .30,
    wetLongitudinalGripRetention: .90, wetLateralGripRetention: .88 },
};
export function calibrateTyres(base: TireConfig, profile: TyreProfile): TireConfig {
  const tyre = { ...base, ...profiles[profile] };
  tyre.gripCoefficient = tyre.longitudinalGrip;
  return tyre;
}
