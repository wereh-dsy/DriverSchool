export const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

export const clamp01 = (value: number): number => clamp(value, 0, 1);

export const moveTowards = (current: number, target: number, maxDelta: number): number => {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
};

/** Frame-rate-independent first-order response. */
export const damp = (current: number, target: number, response: number, dt: number): number => {
  if (response <= 0 || dt <= 0) return current;
  return current + (target - current) * (1 - Math.exp(-response * dt));
};

export const rpmToRadiansPerSecond = (rpm: number): number => (rpm * Math.PI * 2) / 60;

export const radiansPerSecondToRPM = (angularVelocity: number): number =>
  (angularVelocity * 60) / (Math.PI * 2);

export const wrapAngle = (radians: number): number => {
  const wrapped = (radians + Math.PI) % (Math.PI * 2);
  return (wrapped < 0 ? wrapped + Math.PI * 2 : wrapped) - Math.PI;
};

