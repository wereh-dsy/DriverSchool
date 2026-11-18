import data from '../src/world/regional/regional-main.json';
import { loadCityMap } from '../src/world/city/CityMapLoader';
import { buildCityRoadNetwork } from '../src/world/city/CityRoadNetwork';
import { runLogicalRoadMapPixelSelfTest } from '../src/ui/LogicalRoadMapGeometry.selftest';

const results = document.getElementById('results')!;
try {
  const graph = buildCityRoadNetwork(loadCityMap(data));
  const result = runLogicalRoadMapPixelSelfTest(() => {
    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    return canvas;
  }, graph);
  results.textContent = `PASS\n${JSON.stringify(result, null, 2)}`;
} catch (error) {
  results.textContent = `FAIL\n${String(error)}`;
  throw error;
}
