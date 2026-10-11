import { BufferGeometry, DataTexture, Float32BufferAttribute, Group, Mesh, MeshLambertMaterial, NearestFilter, Vector2 } from 'three';
import type { CityMapData, CityPoint } from '../city/CityMapData';

interface EarthworkSegment { a: CityPoint; b: CityPoint; halfWidth: number; tunnel: boolean; bridge:boolean; ramp:boolean }
const samplerCache=new WeakMap<CityMapData,RegionalTerrainSampler>();
export function regionalTerrainSampler(map:CityMapData):RegionalTerrainSampler {let sampler=samplerCache.get(map);if(!sampler){sampler=new RegionalTerrainSampler(map);samplerCache.set(map,sampler);}return sampler;}
const blend=(v:number)=>{v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);};
/** Shared terrain support profile and 100m spatial buckets. No whole-region contact scan. */
export class RegionalTerrainSampler {
  private readonly buckets=new Map<string,EarthworkSegment[]>();
  private readonly westCrossings:CityPoint[];
  constructor(readonly map:CityMapData) {
    this.westCrossings=map.regional!.structures.filter(s=>s.kind==='bridge'&&s.routes.includes('S37')).map(s=>s.center).sort((a,b)=>a.z-b.z);
    for(const road of map.roads) {
      if(!road.id.startsWith('regional:'))continue;
      for(let i=1;i<road.centerline.length;i++) {
        const a=road.centerline[i-1]!,b=road.centerline[i]!,s={a,b,halfWidth:road.laneCount*road.laneWidth/2+4,tunnel:road.corridorSection==='TUNNEL',bridge:road.corridorSection==='BRIDGE',ramp:road.corridorSection==='RAMP'};
        for(let x=Math.floor((Math.min(a.x,b.x)-90)/100);x<=Math.floor((Math.max(a.x,b.x)+90)/100);x++)for(let z=Math.floor((Math.min(a.z,b.z)-90)/100);z<=Math.floor((Math.max(a.z,b.z)+90)/100);z++) {
          const key=`${x},${z}`,bucket=this.buckets.get(key)??[];bucket.push(s);this.buckets.set(key,bucket);
        }
      }
    }
  }
  waterAt(x:number,z:number):boolean {
    const east=6250+z*.08+80*Math.sin(z/1300);
    const a=this.westCrossings[0],b=this.westCrossings[1],t=a&&b?(z-a.z)/(b.z-a.z):0;
    const west=a&&b?a.x+(b.x-a.x)*t+220*Math.sin(t*Math.PI*2):-3450-500*Math.sin(z/850);
    return x>4000&&Math.abs(x-east)<260 || x < -2600&&Math.abs(x-west)<42 || x>6800&&Math.abs((z+50)%900)<12;
  }
  macroHeight(x:number,z:number):number {
    const city=this.map.regional!.cityBounds;
    if(x>=city.minX&&x<=city.maxX&&z>=city.minZ&&z<=city.maxZ)return -.04;
    const north=blend((-z-2100)/2200);
    const ridge=55*Math.exp(-(((z+3250)/380)**2))+65*Math.exp(-(((z+5050)/540)**2));
    const valley=12+10*Math.sin(x/1600)**2;
    let height=north*(ridge+valley)+blend((-x-2500)/1600)*10*(.6+.4*Math.sin(z/780));
    if(this.waterAt(x,z))height=-7;
    return height-.04;
  }
  private projection(x:number,z:number,s:EarthworkSegment) {
    const dx=s.b.x-s.a.x,dz=s.b.z-s.a.z,t=Math.max(0,Math.min(1,((x-s.a.x)*dx+(z-s.a.z)*dz)/(dx*dx+dz*dz)));
    return {distance:Math.hypot(x-s.a.x-dx*t,z-s.a.z-dz*t),height:(s.a.y??0)+((s.b.y??0)-(s.a.y??0))*t};
  }
  nearRoad(x:number,z:number,margin:number):boolean {return (this.buckets.get(`${Math.floor(x/100)},${Math.floor(z/100)}`)??[]).some(s=>this.projection(x,z,s).distance<s.halfWidth+margin);}
  heightAt(x:number,z:number):number {
    let result=this.macroHeight(x,z),best=Infinity,selected:EarthworkSegment|undefined,height=0;
    for(const s of this.buckets.get(`${Math.floor(x/100)},${Math.floor(z/100)}`)??[]) {
      const q=this.projection(x,z,s),distance=q.distance-s.halfWidth;
      if(distance<best){best=distance;selected=s;height=q.height;}
    }
    if(selected&&best<65) {
      // Tunnels retain ridge cover; portals blend to the floor in short open approaches.
      if(selected.tunnel)return Math.max(result,height+10);
      // An elevated ramp keeps natural ground below it, but its approach must
      // cut through a hillside. Leaving ramps out of earthworks buried the T hubs.
      if(selected.ramp)result=Math.min(result,height-.65)*(1-blend((best-25)/40))+result*blend((best-25)/40);
      else if(selected.bridge)result=Math.min(result,height-12)*(1-blend(best/65))+result*blend(best/65);
      else {const u=blend((best-25)/65);result=(height-.04)*(1-u)+result*u;}
    }
    // A neighbouring higher deck must not raise a terrain triangle through a
    // lower road. Keep a full grid-cell margin under all open road footprints.
    for(const s of this.buckets.get(`${Math.floor(x/100)},${Math.floor(z/100)}`)??[]) {
      if(s.tunnel)continue;const q=this.projection(x,z,s),d=q.distance-s.halfWidth;
      if(d<65){const u=blend((d-25)/40),cap=q.height-(s.ramp||s.bridge ? .65 : .04);result=Math.min(result,cap*(1-u)+result*u);}
    }
    return result;
  }
}

/** Independent 500m chunks, rebuilt only when their distance tier changes. */
export class RegionalTerrain {
  private readonly land=new MeshLambertMaterial({vertexColors:true});
  private readonly water=new MeshLambertMaterial({color:0x507d87,transparent:true,opacity:.92});
  readonly farLand:MeshLambertMaterial;
  readonly farRoad:MeshLambertMaterial;
  private readonly farWater:MeshLambertMaterial;
  private readonly mask:DataTexture;
  private readonly maskData:Uint8Array;
  private readonly origin:Vector2;
  private readonly maskSize:Vector2;
  readonly sampler:RegionalTerrainSampler;
  constructor(readonly map:CityMapData){
    this.sampler=regionalTerrainSampler(map);
    const b=map.regional!.terrainBounds,size=map.sectorSize;
    this.origin=new Vector2(Math.floor(b.minX/size),Math.floor(b.minZ/size));
    this.maskSize=new Vector2(Math.ceil(b.maxX/size)-this.origin.x,Math.ceil(b.maxZ/size)-this.origin.y);
    this.maskData=new Uint8Array(this.maskSize.x*this.maskSize.y*4);this.mask=new DataTexture(this.maskData,this.maskSize.x,this.maskSize.y);this.mask.magFilter=this.mask.minFilter=NearestFilter;this.mask.needsUpdate=true;
    this.farLand=this.land.clone();this.farWater=this.water.clone();
    for(const material of [this.farLand,this.farWater]) {
      material.customProgramCacheKey=()=> 'regional-sector-mask-v1';
      material.onBeforeCompile=shader=>{
        shader.uniforms.regionalMask={value:this.mask};shader.uniforms.regionalOrigin={value:this.origin};shader.uniforms.regionalMaskSize={value:this.maskSize};shader.uniforms.regionalSectorSize={value:size};
        shader.vertexShader='varying vec2 regionalXZ;\n'+shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nregionalXZ=(modelMatrix*vec4(transformed,1.0)).xz;');
        shader.fragmentShader='varying vec2 regionalXZ;uniform sampler2D regionalMask;uniform vec2 regionalOrigin;uniform vec2 regionalMaskSize;uniform float regionalSectorSize;\n'+shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nvec2 regionalUV=(floor(regionalXZ/regionalSectorSize)-regionalOrigin+0.5)/regionalMaskSize;if(texture2D(regionalMask,regionalUV).r>0.5)discard;');
      };
    }
    this.farRoad=this.farLand.clone();this.farRoad.onBeforeCompile=this.farLand.onBeforeCompile;this.farRoad.customProgramCacheKey=this.farLand.customProgramCacheKey;this.farRoad.polygonOffset=true;this.farRoad.polygonOffsetFactor=-1;this.farRoad.polygonOffsetUnits=-1;
  }
  setActive(key:string,active:boolean):void {const [x,z]=key.split(',').map(Number),index=((z!-this.origin.y)*this.maskSize.x+x!-this.origin.x)*4;if(index<0||index>=this.maskData.length)return;this.maskData[index]=active?255:0;this.mask.needsUpdate=true;}
  /** Coarse road ribbons follow their tier's rendered ground, retaining higher bridge decks. */
  drapeSilhouette(geometry:BufferGeometry,tier:'mid'|'far'):void {
    const positions=geometry.getAttribute('position'),size=this.map.sectorSize,step=size/(tier==='mid'?8:3),bounds=this.map.regional!.terrainBounds;
    for(let i=0;i<positions.count;i++){
      const x=positions.getX(i),z=positions.getZ(i),sx=Math.floor(x/size)*size,sz=Math.floor(z/size)*size;
      const gx=sx+Math.floor((x-sx)/step)*step,gz=sz+Math.floor((z-sz)/step)*step;
      const a=Math.max(bounds.minX,gx),b=Math.max(bounds.minZ,gz),c=Math.min(bounds.maxX,gx+step),d=Math.min(bounds.maxZ,gz+step);
      const u=(x-a)/(c-a),v=(z-b)/(d-b),h00=this.sampler.heightAt(a,b),h01=this.sampler.heightAt(a,d),h11=this.sampler.heightAt(c,d),h10=this.sampler.heightAt(c,b);
      const h=u<=v?h00*(1-v)+h01*(v-u)+h11*u:h00*(1-u)+h11*v+h10*(u-v);
      positions.setY(i,Math.max(positions.getY(i),h+.04));
    }
    positions.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingSphere();
  }
  build(key:string,tier:'near'|'mid'|'far'):Group {
    const [sx,sz]=key.split(',').map(Number),size=this.map.sectorSize,x=sx!*size,z=sz!*size;
    const steps=tier==='near'?40:tier==='mid'?8:3,step=size/steps,positions:number[]=[],colors:number[]=[],water:number[]=[];
    const vertex=(px:number,pz:number)=>{
      const h=this.sampler.heightAt(px,pz);positions.push(px,h,pz);
      const field=(Math.floor(px/210)+Math.floor(pz/170))%3;
      const color=pz<-2400?[.29,.39,.24]:pz>2500?[.43,.44,.33]:px>3900?field===0?[.58,.59,.34]:field===1?[.46,.55,.29]:[.62,.56,.35]:[.37,.46,.29];colors.push(...color);
    };
    for(let i=0;i<steps;i++)for(let j=0;j<steps;j++){
      const bounds=this.map.regional!.terrainBounds,a=Math.max(bounds.minX,x+i*step),b=Math.max(bounds.minZ,z+j*step),a1=Math.min(bounds.maxX,x+(i+1)*step),b1=Math.min(bounds.maxZ,z+(j+1)*step);
      if(a1<=a||b1<=b)continue;
      // Existing city's flat mesh owns city terrain and authored open cuts.
      const city=this.map.regional!.cityBounds;
      if(a>=city.minX&&a1<=city.maxX&&b>=city.minZ&&b1<=city.maxZ)continue;
      const triangle=(ax:number,az:number,bx:number,bz:number,cx:number,cz:number)=>{vertex(ax,az);vertex(bx,bz);vertex(cx,cz);};
      triangle(a,b,a,b1,a1,b1);triangle(a,b,a1,b1,a1,b);
      if(this.sampler.waterAt((a+a1)/2,(b+b1)/2))water.push(a,-1,b,a,-1,b1,a1,-1,b1,a,-1,b,a1,-1,b1,a1,-1,b);
    }
    const root=new Group();root.name=`Regional terrain ${key} ${tier}`;
    const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('color',new Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
    const mesh=new Mesh(geometry,tier==='far'?this.farLand:this.land);mesh.receiveShadow=true;root.add(mesh);
    if(water.length){const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(water,3));g.computeVertexNormals();root.add(new Mesh(g,tier==='far'?this.farWater:this.water));}
    return root;
  }
  dispose(){this.land.dispose();this.water.dispose();this.farLand.dispose();this.farRoad.dispose();this.farWater.dispose();this.mask.dispose();}
}
