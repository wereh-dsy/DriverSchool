import { runMercedesE300LSelfTest } from '../src/vehicle/visual/MercedesE300L.selftest';
import { runVehicleCatalogSelfTest } from '../src/vehicle/VehicleCatalog.selftest';

console.log(JSON.stringify({ mercedes: runMercedesE300LSelfTest(), catalog: runVehicleCatalogSelfTest() }, null, 2));
