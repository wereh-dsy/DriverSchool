import type { VehicleChassisConfig } from './config/VehiclePhysicsConfig';
import type { VehicleVisualConfig } from './visual/VehicleVisualConfig';

/** Support flags only. Calibration remains with the system that consumes it. */
export interface VehicleCapabilities {
  readonly navigation: boolean;
  readonly laneDisplay: boolean;
  readonly parkingRadar: boolean;
  readonly parking360: boolean;
  readonly tpms: boolean;
  readonly acc: boolean;
  readonly lka: boolean;
  readonly lcc: boolean;
  readonly bsd: boolean;
  readonly mirrorSystem: boolean;
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
  readonly multiMotor: boolean;
  readonly evMultiSpeed: boolean;
  readonly launchControl: boolean;
}

/** Only declarations may be authored. Installed systems are always derived. */
export type VehicleFeatureDeclarations = Partial<Pick<VehicleCapabilities,
  'cruiseControl' | 'advancedInstrument' | 'driveModes' | 'abs' | 'ebd' | 'tcs' | 'esc' |
  'navigation' | 'laneDisplay' | 'parkingRadar' | 'parking360' | 'tpms'>>;

export const STRUCTURAL_CAPABILITIES = ['awd', 'mechanicalHandbrake', 'electronicParkingBrake',
  'autoHold', 'manualSelection', 'parkingCamera', 'surroundView', 'foldingMirrors', 'ambientLighting',
  'startStop', 'adaptiveDamping', 'airSuspension', 'acc', 'lka', 'lcc', 'bsd', 'mirrorSystem', 'multiMotor', 'evMultiSpeed', 'launchControl'] as const;

/** Existing config fields are the compatibility defaults, never vehicle identity. */
export function resolveVehicleCapabilities(physics: VehicleChassisConfig,
  visual?: VehicleVisualConfig,
  installedTransmission?: { readonly supportsManualSelection: boolean }): VehicleCapabilities {
  const features = physics.capabilities;
  const ev = 'battery' in physics ? physics as import('./config/ElectricVehiclePhysicsConfig').ElectricVehiclePhysicsConfig : undefined;
  return Object.freeze({
    navigation: features?.navigation ?? false,
    laneDisplay: features?.laneDisplay ?? false,
    parkingRadar: features?.parkingRadar ?? false,
    // Eight-zone proximity display, independent of surround-view cameras.
    parking360: features?.parking360 ?? false,
    tpms: features?.tpms ?? false,
    // Structural support follows installed controller calibration, never display artwork.
    acc: false, lka: physics.lateralAssist?.lka.enabled === true,
    lcc: physics.lateralAssist?.lcc.enabled === true, bsd: false,
    mirrorSystem: visual !== undefined && (visual.mirrorSystem?.left !== false || visual.mirrorSystem?.right !== false ||
      visual.mirrorSystem?.interior === 'planar' || visual.centerMirrorTransform?.reflection === 'planar' && visual.mirrorSystem?.interior !== 'static'),
    manualSelection: installedTransmission?.supportsManualSelection ?? physics.transmission?.supportsManualSelection === true,
    driveModes: features?.driveModes ?? physics.driveModes !== undefined,
    awd: physics.drivetrainType === 'AWD',
    mechanicalHandbrake: physics.parkingBrake === undefined,
    electronicParkingBrake: physics.parkingBrake !== undefined,
    autoHold: physics.autoHold !== undefined,
    startStop: 'startStop' in physics && physics.startStop !== undefined && physics.transmission !== undefined && (physics.transmission.type ?? 'MANUAL') !== 'MANUAL',
    adaptiveDamping: physics.suspension.adaptiveDamping !== undefined,
    airSuspension: physics.suspension.airSuspension !== undefined,
    multiMotor: (ev?.driveUnits?.length ?? 0) > 1,
    evMultiSpeed: ev?.driveUnits?.some(u => 'type' in u.transmission && u.transmission.type === 'TWO_SPEED') ?? false,
    launchControl: ev?.launchControl !== undefined,
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
