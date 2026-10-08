import type { LapCourseDefinition, LapGate } from '../../game/lap/LapCourseDefinition';
import type { CircuitTrackConfig } from './CircuitTrackConfig';
import type { CircuitTrackLayout } from './TrackLayout';
import { CIRCUIT_START_LINE_DISTANCE } from './StartFinishArea';

export function createCircuitLapCourse(config: CircuitTrackConfig, layout: CircuitTrackLayout): LapCourseDefinition {
  const gateAt = (distance: number): LapGate => {
    const t = distance / layout.lapLength;
    const point = layout.curve.getPointAt(t);
    const tangent = layout.curve.getTangentAt(t).normalize();
    return Object.freeze({ center: Object.freeze({ x: point.x, y: 0, z: point.z }),
      forward: Object.freeze({ x: tangent.x, z: tangent.z }),
      halfWidth: config.trackWidth * 0.5, heightTolerance: 2 });
  };
  return Object.freeze({ trackId: 'simple-circuit', startFinish: gateAt(CIRCUIT_START_LINE_DISTANCE),
    checkpoints: Object.freeze([0.22, 0.44, 0.66, 0.88].map(fraction => gateAt(layout.lapLength * fraction))) });
}
