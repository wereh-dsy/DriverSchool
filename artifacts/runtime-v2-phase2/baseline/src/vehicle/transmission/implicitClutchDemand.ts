import type { TransmissionContext } from './TransmissionSystem';

/** Backward-Euler friction coupling of the crank and the wheel carrier.
 * Reaction is the previous physical contact/brake torque, not a grip boost.
 * Solves both inertias together so a stiff clutch cannot alternate wheel torque
 * between its positive and negative capacity on successive 120 Hz steps. */
export function implicitClutchDemand(engineTorque: number, slip: number, stiffness: number,
  context: TransmissionContext, ratio: number, efficiency: number): number {
  if (context.drivenWheelInertia === undefined || context.drivenWheelReactionTorque === undefined) return engineTorque + slip * stiffness;
  const sourceInertia = Math.max(.01, context.engineInertia);
  const wheelInertia = Math.max(.1, context.drivenWheelInertia);
  const h = Math.max(0, context.dt);
  return (engineTorque + stiffness * slip + stiffness * h * (engineTorque / sourceInertia +
    context.drivenWheelReactionTorque * ratio / wheelInertia)) /
    (1 + stiffness * h * (1 / sourceInertia + ratio * ratio * efficiency / wheelInertia));
}
