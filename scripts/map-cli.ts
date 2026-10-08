import { readFileSync, writeFileSync, renameSync, existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadCityMap } from '../src/world/city/CityMapLoader';
import { createRoad, placePreset, saveMap, validateMap, moveRoadNode, connectRoad, deleteObject, placePrefab } from '../src/world/city/MapAPI';
import { ROAD_STYLES } from '../src/world/city/RoadStyles';
import catalog from '../src/world/city/presets/catalog.json';
import { buildCityRoadNetwork } from '../src/world/city/CityRoadNetwork';
import { validatePresets } from '../src/world/city/CityToolchain.selftest';
const args = process.argv.slice(2), command = args.shift(), mapArg = args.shift();
const positionalPreset = command === 'place-preset' && args[0] && !args[0].startsWith('--') ? args.shift() : undefined;
const flags = new Map<string, string>();
const number = (name: string, fallback: number) => { const n = Number(flags.get(name) ?? fallback); if (!Number.isFinite(n)) throw new Error(`Invalid --${name}`); return n; };
const json = (text: string) => JSON.parse(text.startsWith('@') ? readFileSync(resolve(text.slice(1)), 'utf8').replace(/^\uFEFF/, '') : text);
const output = (value: unknown) => console.log(JSON.stringify(value, null, 2));
try {
  for (let i = 0; i < args.length; i++) { if (!args[i]!.startsWith('--') || args[i + 1] === undefined) throw new Error(`Expected --flag value: ${args[i]}`); flags.set(args[i]!.slice(2), args[++i]!); }
  if (command === 'list-presets') { output({ ...catalog, roadStyles: ROAD_STYLES }); }
  else if (command === 'validate-presets') output(validatePresets());
  else {
    if (!mapArg) throw new Error('Usage: pnpm map validate|summary|place-preset|add-road <map.json|city-alpha|city-main> [preset-id] [--flag value]; pnpm map list-presets|validate-presets');
    const path = resolve(mapArg === 'city-alpha' || mapArg === 'city-main' || mapArg === 'preset-showcase' ? `src/world/city/maps/${mapArg}.json` : mapArg);
    const raw = json('@' + path), report = validateMap(raw);
    if (command === 'validate') { output({ file: path, ...report }); if (!report.valid) process.exitCode = 1; }
    else {
      const map = loadCityMap(raw);
      if (command === 'summary') {
        const network = buildCityRoadNetwork(map);
        output({ id: map.id, name: map.name, schemaVersion: map.schemaVersion, version: map.version, bounds: map.bounds, sectorSize: map.sectorSize,
          counts: { roads: map.roads.length, intersections: map.intersections.length, objects: map.objects.length, links: map.roadLinks?.length, ports: map.connectionPorts?.length },
          roads: network.segments.map(r => ({ id: r.id, lanes: r.laneCount, direction: r.travelDirection, length: Math.round(r.length), elevation: [Math.min(...r.centerline.map(p => p.y ?? 0)), Math.max(...r.centerline.map(p => p.y ?? 0))] })),
          ports: map.connectionPorts, groups: [...new Set([...map.roads, ...map.intersections, ...map.objects].map(o => o.groupId).filter(Boolean))], validation: report });
      } else {
        const request = flags.has('request') ? json(flags.get('request')!) : undefined;
        if (command === 'place-preset') placePreset(map, flags.get('preset') ?? positionalPreset ?? request?.presetId ?? '', request?.parameters ?? { position: { x: number('x', 0), y: number('y', 0), z: number('z', 0) }, rotation: number('rotation', 0) * Math.PI / 180,
          mainRoadLanes: number('main-lanes', 6), crossRoadLanes: number('cross-lanes', 4), mainElevation: number('height', 8), rampLaneCount: number('ramp-lanes', 1), rampRadius: number('radius', 100), groupId: flags.get('group') });
        else if (command === 'add-road') createRoad(map, request ?? { styleId: flags.get('style') ?? 'urban_street_4', id: flags.get('id'), centerline: json(flags.get('points') ?? '[]') });
        else if (command === 'move-node') { if (!request) throw new Error('--request required: {roadId,index,point}'); moveRoadNode(map, request.roadId, request.index, request.point); }
        else if (command === 'connect-road') { if (!request) throw new Error('--request required: {from,target}'); connectRoad(map, request.from, request.target); }
        else if (command === 'delete-object') deleteObject(map, flags.get('id') ?? request?.id ?? '');
        else if (command === 'place-prefab') { if (!request) throw new Error('--request required: {prefabId,position,rotation}'); placePrefab(map, request); }
        else throw new Error(`Unknown command: ${command}`);
        const text = saveMap(map), destination = resolve(flags.get('out') ?? path), temporary = destination + '.tmp-' + process.pid;
        try { writeFileSync(temporary, text, 'utf8'); renameSync(temporary, destination); } finally { if (existsSync(temporary)) unlinkSync(temporary); }
        output({ saved: destination, validation: validateMap(map) });
      }
    }
  }
} catch (error) { output({ valid: false, error: String(error) }); process.exitCode = 1; }
