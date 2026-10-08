export interface LapPosition {
  readonly x: number;
  readonly z: number;
  readonly y?: number;
}

/** Finite timing line perpendicular to the normalized race direction. */
export interface LapGate {
  readonly center: LapPosition;
  readonly forward: { readonly x: number; readonly z: number };
  readonly halfWidth: number;
  readonly heightTolerance: number;
}

export interface LapCourseDefinition {
  readonly trackId: string;
  readonly startFinish: LapGate;
  readonly checkpoints: readonly LapGate[];
}
