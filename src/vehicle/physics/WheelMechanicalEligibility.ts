import type { WheelGeometryState } from './WheelPhysicsState';

/** A wheel ray is not a chassis collision shape. Check again at the solver,
 * independently of map selection and before computing an impulse. */
export function wheelMechanicalRejectReason(g: WheelGeometryState & { readonly supportValid?: boolean;
  readonly requiredLength: number }, gap: number, dt: number, velocity: number): string | undefined {
  const axis = g.suspensionAxis, n = g.surfaceNormal;
  const projection = -(axis.x * n.x + axis.y * n.y + axis.z * n.z);
  if (g.supportValid === false) return 'rejected-support';
  if (g.rejectedThisOuterTick) return 'same-tick-rejection-latch';
  if (g.layerSwitchConfirmationState === 'pending-1-tick') return 'unconfirmed-layer-switch';
  if (!Number.isFinite(projection + gap + axis.y + n.y)) return 'non-finite-geometry';
  if (projection < .25 || -axis.y < .25 || n.y < .1) return 'invalid-suspension-projection';
  if (!Number.isFinite(g.requiredLength)) return 'non-finite-geometry';
  const travel = g.maxSuspensionLength - g.minSuspensionLength;
  const predictiveMotion = Math.min(.04, Math.abs(velocity) * dt);
  if (g.requiredLength < -.01) return 'negative-required-length';
  if (g.requiredLength > g.maxSuspensionLength + Math.max(.03, predictiveMotion)) return 'support-out-of-reach';
  if (gap < -Math.min(.18, Math.max(.05, travel * .7) + predictiveMotion)) return 'excessive-penetration';
  if (g.requiredLength < g.minSuspensionLength - Math.max(.06, travel)) return 'outside-suspension-envelope';
  return undefined;
}
