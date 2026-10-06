export interface InputVector2 {
  x: number;
  y: number;
}

export function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(maximum, Math.max(minimum, value));
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/** Apply a rescaled deadzone and power curve while preserving the full range. */
export function applyAxisDeadzone(
  value: number,
  deadzone: number,
  exponent = 1,
): number {
  const axis = clamp(value, -1, 1);
  const safeDeadzone = clamp(deadzone, 0, 0.95);
  const magnitude = Math.abs(axis);
  if (magnitude <= safeDeadzone) return 0;
  const normalized = (magnitude - safeDeadzone) / (1 - safeDeadzone);
  const curved = Math.pow(normalized, Math.max(0.01, exponent));
  return Math.sign(axis) * curved;
}

/** Apply one deadzone to a complete stick so diagonal direction is retained. */
export function applyRadialDeadzone(
  x: number,
  y: number,
  deadzone: number,
  exponent = 1,
): InputVector2 {
  const safeX = clamp(x, -1, 1);
  const safeY = clamp(y, -1, 1);
  const magnitude = Math.hypot(safeX, safeY);
  const safeDeadzone = clamp(deadzone, 0, 0.95);
  if (magnitude <= safeDeadzone || magnitude <= Number.EPSILON) {
    return { x: 0, y: 0 };
  }

  const normalizedMagnitude = clamp01(
    (Math.min(1, magnitude) - safeDeadzone) / (1 - safeDeadzone),
  );
  const curvedMagnitude = Math.pow(normalizedMagnitude, Math.max(0.01, exponent));
  return {
    x: (safeX / magnitude) * curvedMagnitude,
    y: (safeY / magnitude) * curvedMagnitude,
  };
}

/** Clamp the standard [0, 1] trigger range and rescale its deadzone once. */
export function normalizeTrigger(
  value: number,
  deadzone: number,
): number {
  const trigger = clamp01(value);
  const safeDeadzone = clamp(deadzone, 0, 0.95);
  if (trigger <= safeDeadzone) return 0;
  return (trigger - safeDeadzone) / (1 - safeDeadzone);
}

/** Trigger-specific [0, 1] deadzone and response curve. */
export function applyTriggerCurve(
  value: number,
  deadzone: number,
  exponent = 1,
): number {
  const normalized = normalizeTrigger(value, deadzone);
  if (normalized === 0) return 0;
  return Math.pow(
    normalized,
    Math.max(0.01, exponent),
  );
}
