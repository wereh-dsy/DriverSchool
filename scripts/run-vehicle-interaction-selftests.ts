import { readFileSync } from 'node:fs';

import { runVehicleInteractionSelfTest } from '../src/vehicle/interaction/VehicleInteraction.selftest';

const sharedModules = [
  'src/vehicle/interaction/VehicleInteractionDefinition.ts',
  'src/vehicle/interaction/VehicleInteractionController.ts',
  'src/vehicle/interaction/DriverAccessController.ts',
  'src/player/DriverEntryZone.ts',
  'src/player/OnFootController.ts',
  'src/player/PlayerModeController.ts',
  'src/player/PlayerInput.ts',
  'src/audio/VehicleCabinAcoustics.ts',
];
const sharedSource = sharedModules
  .map(path => readFileSync(path, 'utf8'))
  .join('\n');
if (/\bvehicleId\s*===|a6l|executive-lwb|\baudi\b/i.test(sharedSource)) {
  throw new Error('Shared Vehicle Interaction contains a vehicle-specific branch or identifier.');
}
// The shared enter/exit flow may manage generic vehicle switching, but it must
// not know the A6L interaction geometry or calibration.
const sharedFlow = readFileSync('src/game/DrivingGame.ts', 'utf8');
if (/a6l|executive-lwb|\baudi\b/i.test(sharedFlow)) {
  throw new Error('Shared enter/exit flow contains an A6L-specific identifier.');
}

const result = runVehicleInteractionSelfTest();
console.log(JSON.stringify({
  vehicleInteraction: result,
  sharedBoundary: { files: sharedModules.length + 1, vehicleSpecificBranches: 0 },
}, null, 2));
