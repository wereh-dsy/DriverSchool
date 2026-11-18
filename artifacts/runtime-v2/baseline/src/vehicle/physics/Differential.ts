export interface DifferentialSnapshot {
  readonly type: 'open' | 'lsd';
  readonly axle: 'front' | 'rear';
  readonly carrierAngularVelocity: number;
  readonly leftAngularVelocity: number;
  readonly rightAngularVelocity: number;
  readonly inputTorque: number;
  readonly leftTorque: number;
  readonly rightTorque: number;
  readonly lockingTorque?: number;
}

export interface Differential {
  readonly axle: 'front' | 'rear';
  readonly carrierAngularVelocity: number;
  readonly leftTorque: number;
  readonly rightTorque: number;
  updateSpeeds(left: number, right: number): number;
  distributeTorque(afterFinalDriveTorque: number, dt?: number): void;
  reset(): void;
  getSnapshot(): DifferentialSnapshot;
}
