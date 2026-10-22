/** Field order is shared by typed storage, exporter and tests. SI units, YXZ attitude. */
export const FRAME_DOUBLE_FIELDS = ['step', 'time', 'worldPositionX', 'worldPositionY', 'worldPositionZ'] as const;
export const FRAME_FLOAT_FIELDS = [
  'velocityX', 'velocityY', 'velocityZ', 'speed', 'signedSpeed', 'chassisY',
  'verticalVelocity', 'verticalAcceleration', 'yaw', 'pitch', 'roll', 'yawRate', 'pitchRate', 'rollRate',
  'totalVerticalForce', 'pitchTorque', 'rollTorque', 'throttle', 'brake', 'steering', 'clutch',
  'engineRPM', 'planarForwardX', 'planarForwardZ', 'longitudinalDriveForce',
] as const;
export const FRAME_INT_FIELDS = ['groundedMask', 'microstepCount', 'selector', 'gear', 'safetyInterventions', 'nonFiniteRecovery'] as const;
export const WHEEL_FLOAT_FIELDS = [
  'wheelCenterX', 'wheelCenterY', 'wheelCenterZ', 'attachmentX', 'attachmentY', 'attachmentZ',
  'suspensionLength', 'compression', 'compressionVelocity', 'requiredLength', 'penetration',
  'surfaceHeight', 'surfaceNormalX', 'surfaceNormalY', 'surfaceNormalZ',
  'springForce', 'damperForce', 'bumpStopForce', 'ARBForce', 'mechanicalLimitImpulse',
  'Fz', 'Fx', 'Fy', 'angularVelocity', 'slipRatio', 'slipAngle',
  'tyreCompression', 'tyreCompressionVelocity', 'effectiveRadius',
  'unsprungPosition', 'unsprungVelocity', 'unsprungAcceleration', 'tyreNormalForce', 'unsprungMass',
] as const;
export const WHEEL_INT_FIELDS = ['grounded', 'surface', 'road', 'segment', 'surfaceType'] as const;
export const BLACK_BOX_SETTINGS = Object.freeze({ physicsHz: 120, preSteps: 600, postSteps: 180,
  frameCapacity: 960, eventCapacity: 1024, dictionaryCapacity: 16384, maxEventsPerStep: 24,
  maxCandidatesPerQuery: 32, maxDetailQueriesPerStep: 24 });

export interface BlackBoxMetadata {
  mapId: string; mapName: string; mapVersion: string | number; mapContentVersion?: string | null;
  vehicleId: string; vehicleConfigVersion: number; buildVersion: string;
  vehicleConfigHash?: string;
}
export type BlackBoxStatus = 'OFF' | 'ARMED' | 'CAPTURING POST-EVENT' | 'FROZEN' | 'SAVED' | 'ERROR';
export interface BlackBoxEvent { step: number; time: number; sequence: number; type: string; detail: unknown }
