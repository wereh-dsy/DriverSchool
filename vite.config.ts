import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { compileCityRuntimeData } from './src/world/city/CityRuntimeData';

// Deterministic validation/normalization/topology run once at build/server start,
// not on the player's main thread. Content hashing covers compiler output too.
const cityRuntime = JSON.stringify(compileCityRuntimeData(JSON.parse(readFileSync(new URL('./src/world/regional/regional-main.json', import.meta.url), 'utf8'))));
const cityRuntimeName = `assets/city-main.runtime-${createHash('sha256').update(cityRuntime).digest('hex').slice(0, 12)}.json`;
const packageVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
const physicsHash = createHash('sha256');
for (const source of ['VehicleDynamics', 'ChassisDynamics', 'SuspensionSystem', 'VehicleContactSystem', 'CollisionSystem'])
  physicsHash.update(readFileSync(new URL(`./src/vehicle/physics/${source}.ts`, import.meta.url)));
const buildVersion = `${packageVersion}+physics.${physicsHash.digest('hex').slice(0, 12)}`;

// Only the editor Reload endpoint is public. Map recipes/selftests are source,
// and small built-in maps travel in the runtime bundle. City Main is fetched on selection.
export default defineConfig({ publicDir: false, define: { __CITY_MAIN_RUNTIME_URL__: JSON.stringify(`./${cityRuntimeName}`),
  __DRIVERGAME_BUILD_VERSION__: JSON.stringify(buildVersion) }, plugins: [{
  name: 'editor-reload-map',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url?.split('?')[0] !== `/${cityRuntimeName}`) return next();
      res.setHeader('Content-Type', 'application/json'); res.end(cityRuntime);
    });
  },
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: cityRuntimeName, source: cityRuntime });
    this.emitFile({ type: 'asset', fileName: 'city-alpha.json',
      source: readFileSync(new URL('./src/world/city/maps/city-alpha.json', import.meta.url), 'utf8') });
  },
}] });
