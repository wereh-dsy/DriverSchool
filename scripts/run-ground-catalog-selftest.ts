import { prepareDrivingGround } from '../src/world/DrivingGroundCatalog';
import { compileCityRuntimeData } from '../src/world/city/CityRuntimeData';
import regionalMain from '../src/world/regional/regional-main.json';
import { runDrivingGroundCatalogSelfTest } from '../src/world/DrivingGroundCatalog.selftest';

await prepareDrivingGround('city-main', compileCityRuntimeData(regionalMain));

console.log(JSON.stringify(runDrivingGroundCatalogSelfTest(), null, 2));
