import type { CityPoint } from '../city/CityMapData';

/** Logical highway information shared by rendering, routing and map consumers. */
export interface HighwayRoute {
  id: string;
  number: string;
  name: string;
  type: 'national' | 'provincial' | 'connector';
  role?: 'trunk' | 'orbital' | 'connector' | 'branch';
  termini?: { start: string; end: string };
  direction: { forward: string; reverse: string };
  roadIds: string[];
}
export interface HighwayExit {
  id: string;
  highway: string;
  exitNumber: string;
  name: string;
  destinations: string[];
  position: CityPoint;
  roadIds: string[];
}
export interface HighwayJunction {
  /** Logical reserved interfaces; these create no drivable road or graph edge. */
  reservedConnections?: {id:string;direction:string;enabled:false;position:CityPoint}[];
  kind: 'interchange' | 'continuation';
  id: string;
  name: string;
  connectedRoutes: string[];
  directions: Record<string, HighwayRoute['direction']>;
  position: CityPoint;
  roadIds: string[];
}
export interface HighwayService {
  id: string;
  highway: string;
  name: string;
  facilities: ('parking' | 'fuel' | 'charging' | 'food' | 'toilet')[];
  position: CityPoint;
  roadIds: string[];
}
export interface HighwaySystem {
  version: 1;
  routes: HighwayRoute[];
  exits: HighwayExit[];
  junctions: HighwayJunction[];
  services: HighwayService[];
}
