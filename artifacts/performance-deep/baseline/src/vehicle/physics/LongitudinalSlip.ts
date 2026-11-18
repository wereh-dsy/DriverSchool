/** Signed normalized contact slip with a smooth low-speed reference.
 * Finite at rest, continuous through reversal and 0–2 / 2–5 / 5–10 km/h.
 * The tread reference bounds a stationary burnout; it never disables traction. */
export function longitudinalSlip(treadSpeed: number, groundSpeed: number): number {
  return (treadSpeed - groundSpeed) / Math.max(Math.hypot(2, groundSpeed), Math.abs(treadSpeed));
}
