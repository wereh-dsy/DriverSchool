import { runNavigationSelfTest } from '../src/world/navigation/Navigation.selftest';
import regional from '../src/world/regional/regional-main.json';
import type { CityMapData } from '../src/world/city/CityMapData';
import { runNavigationDisplaysSelfTest } from '../src/vehicle/visual/NavigationDisplays.selftest';
import { runMapGeometryConsistencySelfTest } from '../src/world/navigation/MapGeometryConsistency.selftest';
console.log(JSON.stringify({routing:runNavigationSelfTest(regional as CityMapData),displays:runNavigationDisplaysSelfTest(),geometry:runMapGeometryConsistencySelfTest(regional as CityMapData)},null,2));
