import type { BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createStripGeometry } from '../subject3/geometry';
import { roadEdges, roadPoints } from './geometry';
import type { CityMapData, CityRoad } from './CityMapData';
import type { RegionalTerrain } from '../regional/RegionalTerrain';
import { exportVisualGeometry, type VisualGeometryData } from './VisualStreamingData';
export function compileMidRoadVisual(key: string, roads: readonly CityRoad[], map: CityMapData, terrain: RegionalTerrain): VisualGeometryData | undefined {
  const ribbons: BufferGeometry[] = [], sector = (x: number, z: number) => `${Math.floor(x / map.sectorSize)},${Math.floor(z / map.sectorSize)}`;
  for (const road of roads) {
    if (road.laneCount < 2) continue;
    const points = roadPoints(road), edges = roadEdges(road); let section: typeof points = [];
    const flush = () => {
      if (section.length > 1) {
        const g = createStripGeometry(section, () => 0, { innerOffset: edges.left, outerOffset: edges.right, yOffset: .023, maximumSpacing: 50 });
        if (g) { terrain.drapeSilhouette(g, 'mid'); ribbons.push(g); }
      }
      section = [];
    };
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!, b = points[i]!;
      if (sector((a.x + b.x) / 2, (a.z + b.z) / 2) !== key) { flush(); continue; }
      if (!section.length) section.push(a); section.push(b);
    }
    flush();
  }
  if (!ribbons.length) return undefined;
  const merged = mergeGeometries(ribbons); ribbons.forEach(g => g.dispose());
  if (!merged) return undefined;
  const result = exportVisualGeometry(merged); merged.dispose(); return result;
}
