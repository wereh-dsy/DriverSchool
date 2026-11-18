import type { BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { roadEdges } from './geometry';
import {roadEdgeChains} from './RoadEdgeChain';
import {continuousRibbon} from './ContinuousRoadGeometry';
import type { CityMapData, CityRoad } from './CityMapData';
import type { RegionalTerrain } from '../regional/RegionalTerrain';
import { exportVisualGeometry, type VisualGeometryData } from './VisualStreamingData';
export function compileMidRoadVisual(key: string, roads: readonly CityRoad[], map: CityMapData, terrain: RegionalTerrain): VisualGeometryData | undefined {
  const ribbons: BufferGeometry[] = [], sector = (x: number, z: number) => `${Math.floor(x / map.sectorSize)},${Math.floor(z / map.sectorSize)}`;
  for (const road of roads) {
    const edges = roadEdges(road),chain=roadEdgeChains(map),left=chain.edge(road,edges.left),right=chain.edge(road,edges.right);let indices:number[]=[];
    const flush = () => {
      if (indices.length > 1) {
        const g = continuousRibbon(indices.map(i=>left[i]!),indices.map(i=>right[i]!),.023);
        if (g) { terrain.drapeSilhouette(g, 'mid'); ribbons.push(g); }
      }
      indices = [];
    };
    for (let i = 1; i < left.length; i++) {
      if (sector((left[i-1]!.x+right[i-1]!.x+left[i]!.x+right[i]!.x)/4,(left[i-1]!.z+right[i-1]!.z+left[i]!.z+right[i]!.z)/4) !== key) { flush(); continue; }
      if (!indices.length) indices.push(i-1);indices.push(i);
    }
    flush();
  }
  if (!ribbons.length) return undefined;
  const merged = mergeGeometries(ribbons); ribbons.forEach(g => g.dispose());
  if (!merged) return undefined;
  const result = exportVisualGeometry(merged); merged.dispose(); return result;
}
