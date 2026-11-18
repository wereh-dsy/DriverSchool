import { rebuildCityMainInterchanges } from './CityMainV3Upgrade';
import { addCityMainV3UrbanAxes,addCityMainV3Collectors } from './CityMainV3Urban';
import { assignCityMainRoadNames } from './CityMainV3Names';
import { placeCityMainV3Signs } from './CityMainV3Signs';
import { refineCityMainV3Landscape } from './CityMainV3Landscape';
export function buildCityMainV3(v2:unknown) {
  const map=rebuildCityMainInterchanges(v2);
  addCityMainV3UrbanAxes(map);addCityMainV3Collectors(map);
  assignCityMainRoadNames(map);placeCityMainV3Signs(map);refineCityMainV3Landscape(map);
  return map;
}
