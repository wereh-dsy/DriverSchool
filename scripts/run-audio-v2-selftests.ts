import { runVehicleAudioV2SelfTest } from '../src/audio/VehicleAudioV2.selftest';
import { runWeatherAudioMixSelfTest } from '../src/audio/WeatherAudioMix.selftest';
import { runLaneDepartureWarningSoundSelfTest } from '../src/audio/LaneDepartureWarningSound.selftest';
import { runExecutivePolishSelfTest } from '../src/vehicle/physics/ExecutivePolish.selftest';

async function main(): Promise<void> {
  const audioV2 = await runVehicleAudioV2SelfTest();
  const weather = runWeatherAudioMixSelfTest();
  const ldw = runLaneDepartureWarningSoundSelfTest();
  const execPolish = runExecutivePolishSelfTest();
  console.log(JSON.stringify({
    status: 'PASS',
    audioV2,
    weather,
    ldw,
    execPolishAssertions: execPolish.assertions,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
