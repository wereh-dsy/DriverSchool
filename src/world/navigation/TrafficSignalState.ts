/** Read-only, rendering-independent signal observations for navigation/HMI.
 * Query by the logical lane ID; no consumer may advance or override the clock. */
export type TrafficSignalColor = 'red' | 'amber' | 'green';
export type TrafficSignalMovement = 'straight' | 'left' | 'right';
export interface TrafficSignalMovementState {
  readonly movement: TrafficSignalMovement;
  readonly color: TrafficSignalColor;
  readonly permitted: boolean;
  readonly secondsToChange: number;
  readonly secondsToGreen: number;
}
export interface TrafficSignalLaneState {
  readonly junctionId: string;
  readonly roadId: string;
  readonly laneId: string;
  /** Driver-relative, left to right. */
  readonly approachLaneIndex: number;
  readonly movements: readonly TrafficSignalMovementState[];
}
export interface TrafficSignalJunctionState {
  readonly junctionId: string;
  readonly profile: 'standard' | 'lane-countdown';
  readonly phaseId: string;
  readonly secondsInPhase: number;
  readonly secondsRemaining: number;
  readonly cycleSeconds: number;
  readonly lanes: readonly TrafficSignalLaneState[];
}
export interface TrafficSignalProvider {
  getJunctionSignal(junctionId: string): TrafficSignalJunctionState | undefined;
  getLaneSignal(laneId: string): TrafficSignalLaneState | undefined;
}
