import { mkdirSync, writeFileSync } from 'node:fs';
import { runLateralAssistControllerSelfTest } from '../src/vehicle/control/LateralAssistController.selftest';
import { runLateralAssistDrivingSelfTest, type Scenario } from '../src/vehicle/control/LateralAssistDriving.selftest';
import { runLaneDepartureWarningSelfTest } from '../src/vehicle/control/LaneDepartureWarningController.selftest';
import { runLaneDepartureWarningSoundSelfTest } from '../src/audio/LaneDepartureWarningSound.selftest';

const baseline=process.argv.includes('--baseline');
const scenarios: Scenario[]=['straight100','straight120','straightSmall','curve100','curve120','lkaEarly120','lkaLeft','lkaRight','override120'];
const result={controllers:runLateralAssistControllerSelfTest(),ldw:runLaneDepartureWarningSelfTest(),ldwSound:runLaneDepartureWarningSoundSelfTest(),driving:runLateralAssistDrivingSelfTest({scenarios,
  diagnosticsOnly:baseline||process.argv.includes('--diagnostic'),recordSamples:process.argv.includes('--diagnostic')})};
mkdirSync('artifacts/adas-controller-tuning',{recursive:true});
writeFileSync(`artifacts/adas-controller-tuning/${baseline?'before':'after'}.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({controllerChecks:result.controllers.length,ldwChecks:result.ldw.length,audioChecks:result.ldwSound.length,
  drivingScenarios:result.driving.length,metrics:result.driving.map(({vehicle,scenario,settledRms,minimumClearance,huntingCrossings})=>
    ({vehicle,scenario,settledRms,minimumClearance,huntingCrossings}))},null,2));
