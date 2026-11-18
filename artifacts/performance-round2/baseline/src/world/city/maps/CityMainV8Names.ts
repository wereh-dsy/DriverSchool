import type {CityMapData} from '../CityMapData';

/** Public names for retained ordinary streets, shared by signs and the atlas. */
export function completeNamesV8(map:CityMapData):void{
 const names:Record<string,string>={
  'urban-institutional':'文教路','urban-roundabout-West':'文教路','urban-roundabout-South':'春晖北路',
  'urban-rail-underpass:underpass':'城站隧道路','urban-underpass-start-approach':'城站隧道路','urban-underpass-end-approach':'城站隧道路','urban-underpass-west-link':'城站北路',
  'urban-diagonal':'文华路','v3-east-collector':'锦华南路','v4-west-market':'长庆路','v4-west-offset':'永宁路','v4-west-residential':'安平路','v4-north-residential':'星湖北街',
  'v4-university':'杏坛路','v4-east-new-district':'新城一街','v4-south-logistics-west':'南工路','v4-south-logistics-east':'港丰路',
  'v4-access-1':'文苑路','v4-access-2':'文华西街','v4-access-3':'港丰西路','v4-access-4':'货场路','v4-access-5':'货场路',
  'v4-access-15':'锦华连接路','v4-access-16':'杏坛南路','v4-access-18':'城站南路','v4-civic-collector':'宁和路',
 };
 for(const r of map.roads){
  if(r.id.startsWith('regional:')||r.roadNameId||r.travelDirection!=='two-way')continue;
  const root=r.id.replace(/-split.*$/,''),name=names[root];
  if(!name)throw new Error('V8 ordinary street needs a public name: '+r.id);
  const id='v8-name-'+root;r.roadNameId=id;delete r.displayName;
  map.roadNames![id]={primaryText:name,kind:'urban'};
 }
 // Avoid two differently suffixed “解放” corridors in the old town.
 map.roadNames!['v5-west-market-road']!.primaryText='兴安街';
 map.roadNames!['v5-west-market-road']!.secondaryText='Xingan St.';
}
