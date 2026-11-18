import type {CityMapData} from '../src/world/city/CityMapData';
import {round2Selection} from './road-geometry-round2-data';
export const ROUND4_CASES=[
 {id:'underground',roadId:'urban-rail-underpass:underpass',focus:{x:-1460,y:-7.5,z:-1264.4444444444443},eye:{x:-1430,y:-5.85,z:-1262.57},target:{x:-1530,y:-5.85,z:-1262.57},radius:150},
 {id:'cutting',roadId:'urban-underpass-end-approach',focus:{x:-1560,y:-5.5,z:-1264.4444444444443},eye:{x:-1530,y:-2.4,z:-1260},target:{x:-1660,y:-2.4,z:-1264.44},radius:180},
 {id:'island',junctionId:'urban-junction-80',focus:{x:780,y:0,z:764},eye:{x:817,y:42,z:809},target:{x:780,y:0,z:764},radius:100},
 {id:'divided',junctionId:'urban-junction',focus:{x:-1149.86,y:0,z:-150},eye:{x:-1090,y:65,z:-85},target:{x:-1149.86,y:0,z:-150},radius:160},
 {id:'merge',roadId:'regional:qingling:S-to-E-right:deceleration',focus:{x:2111,y:24,z:-2986},eye:{x:2155,y:53,z:-2925},target:{x:2111,y:24,z:-2986},radius:210},
 {id:'bridge',roadId:'ew-wb-split',focus:{x:0,y:8,z:-162.95},eye:{x:35,y:3,z:-112},target:{x:0,y:7.4,z:-162.95},radius:150},
 {id:'terrain',roadId:'v4-south-logistics-west',focus:{x:-1738.8533,y:-.2364,z:1956.8523},eye:{x:-1715,y:12,z:1982},target:{x:-1738.8533,y:0,z:1956.8523},radius:130},
] as const;
export function round4Selection(map:CityMapData){return round2Selection(map);}
