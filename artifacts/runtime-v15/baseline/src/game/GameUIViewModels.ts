import type { VehicleDescriptor } from '../vehicle/VehicleCatalog';
import { isElectricConfig } from '../vehicle/config/ElectricVehiclePhysicsConfig';
import { isP2HybridConfig } from '../vehicle/config/P2HybridConfig';
import type { VehicleViewModel } from '../ui/state/GameUIState';

/** Presentation adapter: UI never receives catalog physics or Three.js objects. */
export function vehicleViewModel(vehicle: VehicleDescriptor): VehicleViewModel {
  const config = vehicle.physicsConfig;
  let power: number;
  let transmission: string;
  let powertrain: string;
  if (isP2HybridConfig(config)) {
    power = config.hybrid.systemPower / 1000;
    transmission = `${Object.keys(config.transmission.gearRatios).length}HAT`;
    powertrain = `P2 插电混动 · ${config.hybrid.battery.grossEnergyKWh ?? config.hybrid.battery.usableCapacityKWh} kWh`;
  } else if (isElectricConfig(config)) {
    power = (config.normalSystemPower ?? config.motor.maxDrivePower) / 1000;
    transmission = config.driveUnits?.some(unit => 'type' in unit.transmission && unit.transmission.type === 'TWO_SPEED') ? 'EV 两速' : '固定减速';
    powertrain = `纯电 · ${config.battery.usableCapacityKWh} kWh`;
  } else {
    power = config.engine.ratedNetPowerW !== undefined ? config.engine.ratedNetPowerW / 1000
      : Math.max(...config.engine.torqueCurve.map(point => point.rpm * point.torque * Math.PI / 30000));
    const type = config.transmission.type ?? 'MANUAL';
    transmission = type === 'CVT' ? 'CVT' : `${Object.keys(config.transmission.gearRatios).length}${type === 'MANUAL' ? 'MT' : type === 'TORQUE_CONVERTER_AT' ? 'AT' : type === 'LST' ? 'LST' : 'DCT'}`;
    powertrain = '内燃机';
  }
  return { id: vehicle.id, name: vehicle.displayName, powertrain, transmission, drive: config.drivetrainType,
    power: `${Math.round(power)} kW`, description: vehicle.description };
}
