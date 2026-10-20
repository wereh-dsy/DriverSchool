/** Conservative diagnostic thresholds only. Never consumed by vehicle physics. */
export const BlackBoxTriggerThresholds = Object.freeze({
  verticalVelocityDelta: 5, // m/s per 120 Hz step
  angularVelocityDelta: 2.5, // rad/s per step
  mechanicalImpulse: 6000, // N s per wheel per fixed step
  contactRecoveryDistance: .5, // m, existing emergency geometric recovery only
  surfaceHeightDelta: .12, // fallback for external contacts without suspension geometry
  normalDot: .6, // ~53 degrees
  supportReturnSteps: 18,
  supportReturnHeightDelta: .2,
  severeCollisionSpeed: 8, // m/s inward
  severeCollisionAttitude: .45, // rad
  fullBumpTolerance: .001,
  automaticCooldownSteps: 600,
});
