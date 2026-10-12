import type { CityPoint } from '../city/CityMapData';

export interface RegionalRoute {
  number?: string;
  id: string; name: string; lanes: number; speed: number; terrain: string;
  roadIds: string[]; centerline: CityPoint[]; connectedRoutes: string[];
}
export interface RegionalStructure {
  id: string; name: string; kind: 'interchange' | 'bridge' | 'tunnel' | 'service';
  center: CityPoint; roadIds: string[]; radius: number; routes: string[];
  form: string; reference: string;
}
export interface RegionalData {
  highways?: import('./HighwayData').HighwaySystem;
  version: 1;
  terrainBounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  cityBounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  routes: RegionalRoute[]; structures: RegionalStructure[];
  exits: { id: string; name: string; route: string; roadIds: string[] }[];
}
