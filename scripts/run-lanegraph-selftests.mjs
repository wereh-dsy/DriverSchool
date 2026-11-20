import { build } from 'esbuild';

await build({
  stdin: {
    contents: "export { runLaneGraphSelfTest } from './src/world/navigation/lanegraph/LaneGraph.selftest';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: '.tmp-lanegraph-selftests.mjs',
  logLevel: 'silent',
  define: { 'import.meta.env.DEV': 'false' },
});

const { runLaneGraphSelfTest } = await import('../.tmp-lanegraph-selftests.mjs');
const result = runLaneGraphSelfTest();
console.log(result);
