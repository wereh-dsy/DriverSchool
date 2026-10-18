import type {CityMapData} from './CityMapData';

/** Compact authored landforms. The same smooth profile supports mesh and contact. */
export function cityTerrainOffsetAt(forms:CityMapData['environment']['landforms'],x:number,z:number):number{
 let y=0;
 for(const f of forms??[]){const dx=(x-f.center.x)/f.radiusX,dz=(z-f.center.z)/f.radiusZ,q=dx*dx+dz*dz;if(q<1)y+=f.height*(1-q)**2;}
 return y;
}
