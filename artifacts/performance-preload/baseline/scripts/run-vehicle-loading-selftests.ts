import { runHudVehicleLoadingSelfTest } from '../src/ui/HudVehicleLoading.selftest';

console.log(JSON.stringify(await runHudVehicleLoadingSelfTest(),null,2));
