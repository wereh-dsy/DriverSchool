import { build } from 'esbuild';

await build({
  stdin: {
    contents: `
export { runADASV1SelfTests } from './src/vehicle/adas/ADASSystem.selftest';
export { runADASVisualizationSelfTests } from './src/vehicle/adas/visualization/ADASVisualization.selftest';
export { runVehicleInputSystemSelfTest } from './src/input/VehicleInputSystem.selftest';
export { runScenarioDebuggerSelfTests } from './src/vehicle/adas/debugger/ScenarioDebugger.selftest';
`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: '.tmp-adas-selftests.mjs',
  logLevel: 'silent',
  define: { 'import.meta.env.DEV': 'false' },
});

const { runADASV1SelfTests, runADASVisualizationSelfTests, runVehicleInputSystemSelfTest, runScenarioDebuggerSelfTests } = await import('../.tmp-adas-selftests.mjs');
const inputResult = runVehicleInputSystemSelfTest();
const adasResult = runADASV1SelfTests();
const adasVisualResult = runADASVisualizationSelfTests();
const debuggerResult = runScenarioDebuggerSelfTests();

console.log(
  JSON.stringify(
    {
      inputSelfTest: inputResult,
      scenarioDebugger: debuggerResult,
      adasVisualization: adasVisualResult,
      adas: {
        passed: adasResult.passed,
        total: adasResult.total,
        performance: adasResult.performance,
        scenarios: adasResult.scenarios.map(s => ({
          id: s.id,
          name: s.name,
          passed: s.passed,
          summary: s.summary,
        })),
      },
    },
    null,
    2,
  ),
);
