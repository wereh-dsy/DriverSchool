import type { CircuitTrackConfig } from './CircuitTrackConfig';
import type { CircuitSectionMetadata } from './types';

const smoothstep = (value: number): number => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

/** Gradually opens the outside before turn-in, then closes beyond the exit. */
export function cornerEnvelope(section: CircuitSectionMetadata, distance: number, lapLength: number): number {
  const relative = ((distance - section.startDistance + 35 + lapLength) % lapLength) - 35;
  return smoothstep((relative + 35) / 35) * smoothstep((section.length + 40 - relative) / 40);
}

export function circuitBarrierDistance(
  config: CircuitTrackConfig, sections: readonly CircuitSectionMetadata[],
  distance: number, side: number, lapLength: number,
): number {
  let setback = 0;
  for (const section of sections) {
    if (!section.turnAngleRadians || side !== -Math.sign(section.turnAngleRadians)) continue;
    const extra = section.kind === 'braking' ? config.brakingOuterSetback : config.flowingOuterSetback;
    setback = Math.max(setback, extra * cornerEnvelope(section, distance, lapLength));
  }
  return config.trackWidth * 0.5 + config.barrierOffset + setback;
}

export function circuitRunoffWidth(
  config: CircuitTrackConfig, section: CircuitSectionMetadata, distance: number, lapLength: number,
): number {
  return config.brakingRunoffWidth * cornerEnvelope(section, distance, lapLength);
}
