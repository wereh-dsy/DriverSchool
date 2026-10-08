import type { VehicleChassisConfig } from './config/VehiclePhysicsConfig';
import type { VehicleVisualConfig } from './visual/VehicleVisualConfig';

/** Support flags only. Calibration remains with the system that consumes it. */
export interface VehicleCapabilities {
  readonly manualSelection: boolean;
  readonly driveModes: boolean;
  readonly awd: boolean;
  readonly mechanicalHandbrake: boolean;
  readonly electronicParkingBrake: boolean;
  readonly autoHold: boolean;
  readonly cruiseControl: boolean;
  readonly parkingCamera: boolean;
  readonly surroundView: boolean;
  readonly foldingMirrors: boolean;
  readonly ambientLighting: boolean;
  readonly advancedInstrument: boolean;
  readonly abs: boolean;
  readonly ebd: boolean;
  readonly tcs: boolean;
  readonly esc: boolean;
  readonly startStop: boolean;
  readonly adaptiveDamping: boolean;
  readonly airSuspension: boolean;
}

/** Only declarations may be authored. Installed systems are always derived. */
export type VehicleFeatureDeclarations = Partial<Pick<VehicleCapabilities,
  'cruiseControl' | 'advancedInstrument' | 'driveModes' | 'abs' | 'ebd' | 'tcs' | 'esc'>>;

export const STRUCTURAL_CAPABILITIES = ['awd', 'mechanicalHandbrake', 'electronicParkingBrake',
  'autoHold', 'manualSelection', 'parkingCamera', 'surroundView', 'foldingMirrors', 'ambientLighting',
  'startStop', 'adaptiveDamping', 'airSuspension'] as const;

/** Existing config fields are the compatibility defaults, never vehicle identity. */
export function resolveVehicleCapabilities(physics: VehicleChassisConfig,
  visual?: VehicleVisualConfig,
  installedTransmission?: { readonly supportsManualSelection: boolean }): VehicleCapabilities {
  const features = physics.capabilities;
  return Object.freeze({
    manualSelection: installedTransmission?.supportsManualSelection ?? physics.transmission?.supportsManualSelection === true,
    driveModes: features?.driveModes ?? physics.driveModes !== undefined,
    awd: physics.drivetrainType === 'AWD',
    mechanicalHandbrake: physics.parkingBrake === undefined,
    electronicParkingBrake: physics.parkingBrake !== undefined,
    autoHold: physics.autoHold !== undefined,
    startStop: 'startStop' in physics && physics.startStop !== undefined && physics.transmission !== undefined && (physics.transmission.type ?? 'MANUAL') !== 'MANUAL',
    adaptiveDamping: physics.suspension.adaptiveDamping !== undefined,
    airSuspension: physics.suspension.airSuspension !== undefined,
    cruiseControl: features?.cruiseControl ?? false,
    parkingCamera: visual?.parkingCamera !== undefined,
    surroundView: visual?.parkingCamera?.surroundView === true,
    foldingMirrors: visual?.automaticMirrorFold !== undefined,
    ambientLighting: visual?.interiorAmbientLighting !== undefined,
    advancedInstrument: features?.advancedInstrument ?? visual?.instrumentCluster.featureClass === 'advanced',
    // Installed aids can be switched off by settings independently of support.
    abs: features?.abs ?? true, ebd: features?.ebd ?? true,
    tcs: features?.tcs ?? true, esc: features?.esc ?? true,
  });
}
