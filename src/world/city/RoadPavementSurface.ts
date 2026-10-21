import type { CityPoint } from './CityMapData';

export interface PavementMask { contains(x:number,z:number):boolean; heightAt(x:number,z:number):number }
/** Exact plane of one existing pavement triangle; no independent end-cap plane. */
export function roadPavementTriangle(a:CityPoint,b:CityPoint,c:CityPoint,length:number,masks:readonly PavementMask[]=[]) {
  const ux=b.x-a.x,uz=b.z-a.z,vx=c.x-a.x,vz=c.z-a.z,den=ux*vz-uz*vx;
  const gx=(((b.y??0)-(a.y??0))*vz-((c.y??0)-(a.y??0))*uz)/den,gz=(ux*((c.y??0)-(a.y??0))-vx*((b.y??0)-(a.y??0)))/den;
  const heightAt=(x:number,z:number)=>(a.y??0)+gx*(x-a.x)+gz*(z-a.z);
  return {gx,gz,length,heightAt,extensionAt:(_x:number,_z:number)=>0,contains:(extra:number)=>(x:number,z:number)=>{
    const u=((x-a.x)*vz-(z-a.z)*vx)/den,v=(ux*(z-a.z)-uz*(x-a.x))/den;
    const tolerance=extra/Math.max(.1,Math.min(Math.hypot(ux,uz),Math.hypot(vx,vz)));
    if(u< -tolerance-1e-7||v< -tolerance-1e-7||u+v>1+tolerance+1e-7)return false;
    for(const mask of masks)if(mask.contains(x,z)&&Math.abs(mask.heightAt(x,z)-heightAt(x,z))<=.5)return false;
    return true;
  }};
}
/** Physical road capsule, shared by runtime contact and offline seam inspection. */
export function roadPavementSurface(a:CityPoint,c:CityPoint,edges:{left:number;right:number},
  cutStart=false,cutEnd=false,masks:readonly PavementMask[]=[]) {
  const dx=c.x-a.x,dz=c.z-a.z,squared=dx*dx+dz*dz,length=Math.sqrt(squared),dy=(c.y??0)-(a.y??0);
  const along=(x:number,z:number)=>((x-a.x)*dx+(z-a.z)*dz)/squared;
  const heightAt=(x:number,z:number)=>(a.y??0)+dy*Math.max(0,Math.min(1,along(x,z)));
  return {gx:dy*dx/squared,gz:dy*dz/squared,length,
    extensionAt:(x:number,z:number)=>Math.max(0,-along(x,z),along(x,z)-1)*length,
    heightAt,
    contains:(extra:number)=>(x:number,z:number)=>{
      const u=along(x,z);if(cutStart&&u<0||cutEnd&&u>1)return false;
      for(const mask of masks)if(mask.contains(x,z)&&Math.abs(mask.heightAt(x,z)-heightAt(x,z))<=.5)return false;
      const t=Math.max(0,Math.min(1,u)),offset=(-(x-a.x)*dz+(z-a.z)*dx)/length;
      const radius=(offset<0?-edges.left:edges.right)+extra;
      return (x-a.x-dx*t)**2+(z-a.z-dz*t)**2<=radius*radius;
    }};
}
