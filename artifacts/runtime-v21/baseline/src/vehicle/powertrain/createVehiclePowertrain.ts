import type { VehicleChassisConfig, VehiclePhysicsConfig } from '../config';
import { isElectricConfig } from '../config/ElectricVehiclePhysicsConfig';
import { isP2HybridConfig } from '../config/P2HybridConfig';
import { isEhsHybridConfig } from '../config/EhsHybridConfig';
import { ElectricPowertrain } from './ElectricPowertrain';
import { ICEPowertrain } from './ICEPowertrain';
import { P2HybridPowertrain } from './P2HybridPowertrain';
import { EhsHybridSystem } from './EhsHybridSystem';
import type { Powertrain } from './Powertrain';

/** Installed config/topology selects the source; presentation/vehicle IDs never do. */
export function createVehiclePowertrain(config: VehicleChassisConfig): Powertrain {
  if (isEhsHybridConfig(config)) return new EhsHybridSystem(config);
  if (isElectricConfig(config)) return new ElectricPowertrain(config);
  if (isP2HybridConfig(config)) return new P2HybridPowertrain(config);
  return new ICEPowertrain(config as VehiclePhysicsConfig);
}
