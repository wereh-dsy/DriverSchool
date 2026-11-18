import { BufferGeometry, CanvasTexture, Color, CylinderGeometry, DataTexture, Float32BufferAttribute, Group, InstancedMesh, LinearFilter, LinearMipmapLinearFilter, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Quaternion, RepeatWrapping, RingGeometry, SRGBColorSpace, Vector3 } from 'three';
import { createStaticOBBCollider, type StaticCollider } from '../../vehicle/physics/CollisionSystem';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeBox } from '../subject3/geometry';
import type { Subject3Materials } from '../subject3/materials';
import { PREFAB_IDS, type CityFacade, type CityObject, type PrefabId } from './CityMapData';
import {cityBuildingGeometry,cityFacadeHeightBand} from './CityBuildingGeometry';
import { cityLandmarkTemplate } from './CityLandmarkGeometry';

export interface CityPrefab { id: PrefabId; label: string; size: [number, number, number]; solid: boolean; template: Group }
/** Small procedural kit, using the existing city's materials and primitive geometry. */
export class PrefabRegistry {
  readonly entries = new Map<PrefabId, CityPrefab>();
  private readonly signMaterials=new Map<string,MeshBasicMaterial>();
  private readonly facadeMaterials=new Map<CityFacade,MeshStandardMaterial>();
  private readonly ownedMaterials:MeshStandardMaterial[]=[];
  private readonly buildingGeometries=new Map<string,BufferGeometry>();
  private readonly cityStaticTemplates=new Map<PrefabId,Group>();
  private readonly landmarkTemplates=new Map<string,Group>();
  private readonly landmarkMaterials:Subject3Materials;
  constructor(m: Subject3Materials) {
    this.landmarkMaterials=m;
    const buildings: [PrefabId, string, number, number, number][] = [
      ['residential_low', '住宅 · 低层', 20, 9, 16], ['residential_mid', '住宅 · 中层', 26, 23, 20],
      ['office', '办公楼', 26, 38, 22], ['commercial', '商业盒子', 42, 9, 30],
      ['industrial', '工业厂房', 46, 11, 30], ['school', '学校', 42, 14, 18], ['garage', '简易车库', 22, 5, 16],
    ];
    const register = (id: PrefabId, label: string, size: [number, number, number], solid: boolean, template: Group) => this.entries.set(id, { id, label, size, solid, template });
    const box = (root: Group, size: [number, number, number], p: [number, number, number], material = m.buildingLight, tint = false) => {
      const mesh = makeBox('prefab part', size, p, material, true); mesh.userData.tint = tint; root.add(mesh); return mesh;
    };
    for (const [id, label, w, h, d] of buildings) {
      const root = new Group();
      box(root, [w, h, d], [0, h / 2, 0], m.buildingLight, true).userData.facadeBody = true;
      box(root, [w + 0.5, 0.4, d + 0.5], [0, h + 0.2, 0], m.roof).userData.buildingRoof=true;
      // Window bands are low draw cost and readable in both top and 3D views.
      const windows:BufferGeometry[]=[];
      for (let y = 2; y < h - 1; y += 3.5) for (const side of [-1, 1]) {
        const part=box(root,[w-2,1.25,0.1],[0,y,side*(d/2+0.06)],m.glass);
        part.updateMatrix();windows.push(part.geometry.clone().applyMatrix4(part.matrix));root.remove(part);part.geometry.dispose();
      }
      const bands=mergeGeometries(windows);windows.forEach(g=>g.dispose());if(bands){const mesh=new Mesh(bands,m.glass);mesh.userData.windowBands=true;root.add(mesh);}
      register(id, label, [w, h + 0.4, d], true, root);
    }
    {
      const root = new Group(); box(root, [30, 0.02, 24], [0, 0.025, 0], m.asphalt);
      for (let i = 0; i <= 9; i++) box(root, [0.1, 0.01, 5], [-13.5 + i * 3, 0.043, 7], m.whitePaint);
      register('parking', '停车区域', [30, 0, 24], false, root);
    }
    {
      const root = new Group(), trunk = new Mesh(new CylinderGeometry(0.18, 0.24, 2.6, 7), m.trunk), crown = new Mesh(new CylinderGeometry(0.3, 2.1, 4.8, 7), m.foliage);
      trunk.position.y = 1.3; crown.position.y = 4.4; crown.userData.tint = true; root.add(trunk, crown);
      register('tree', '树', [0.5, 6.8, 0.5], true, root);
    }
    {
      const root = new Group(), pole = new Mesh(new CylinderGeometry(0.07, 0.11, 7.4, 8), m.darkMetal); pole.position.y = 3.7; root.add(pole);
      box(root, [0.14, 0.12, 1.5], [0, 7.25, -0.7], m.darkMetal);
      box(root, [0.36, 0.16, 0.72], [0, 7.16, -1.35], m.lampHead).userData.environmentLamp = true;
      register('streetlight', '路灯', [0.24, 7.5, 0.24], true, root);
    }
    for(const [id,label,height,reach] of [
      ['streetlight_dual','大道双臂灯',10,3.6],['streetlight_highway','快速路灯',12,3],['streetlight_small','旧城 / 公园灯',5,1],
    ] as const) {
      const root=new Group(),pole=new Mesh(new CylinderGeometry(.09,.15,height,7),m.darkMetal);pole.position.y=height/2;root.add(pole);
      for(const side of id==='streetlight_dual'?[-1,1]:[1]) {
        box(root,[.16,.14,reach],[0,height-.25,-side*reach/2],m.darkMetal);
        box(root,[.5,.17,1],[0,height-.35,-side*reach],m.lampHead).userData.environmentLamp=true;
      }
      register(id,label,[.3,height,.3],true,root);
    }
    {
      // Opaque low-poly water: one shared material, no reflection pass or simulation.
      const root=new Group(),material=new MeshStandardMaterial({color:'#48878b',roughness:.32,metalness:.12});this.ownedMaterials.push(material);
      const surface=new Mesh(new CylinderGeometry(10,10,.04,24),material);surface.position.y=.02;root.add(surface);
      register('water','湖面 / 平底水盆',[20,.04,20],false,root);
      const stream=new Group();box(stream,[12,.04,20],[0,.02,0],material);register('waterway','城市河道',[12,.04,20],false,stream);
    }
    {
      const root=new Group();box(root,[10,.08,40],[0,.04,0],m.wall,true);
      for(const track of [-2.4,2.4])for(const side of [-1,1])box(root,[.085,.14,40],[track+side*.7175,.17,0],m.metal);
      const sleepers:BufferGeometry[]=[];
      for(let z=-19.6;z<20;z+=.8)for(const x of [-2.4,2.4]){const part=box(root,[2.5,.1,.22],[x,.1,z],m.darkMetal);part.updateMatrix();sleepers.push(part.geometry.clone().applyMatrix4(part.matrix));root.remove(part);part.geometry.dispose();}
      const merged=mergeGeometries(sleepers);sleepers.forEach(g=>g.dispose());if(merged)root.add(new Mesh(merged,m.darkMetal));
      register('railway_track','双线铁路',[10,.25,40],false,root);
    }
    {
      const root=new Group();box(root,[8,.6,20],[0,.3,0],m.wall);box(root,[8.5,.16,20],[0,4.6,0],m.roof);
      for(const z of [-7,7])box(root,[.18,4.2,.18],[0,2.6,z],m.metal);
      register('station_platform','站台 / 雨棚',[8.5,4.8,20],true,root);
    }
    {
      const root=new Group(),stands=new Mesh(new CylinderGeometry(1,1,1,48,1,true),m.wall);
      stands.scale.set(66,12,46);stands.position.y=6;root.add(stands);
      const canopy=new Mesh(new RingGeometry(.77,1,48),m.roof);canopy.rotation.x=-Math.PI/2;canopy.scale.set(66,46,1);canopy.position.y=12;root.add(canopy);
      box(root,[94,.04,56],[0,.02,0],m.grass);for(const z of [-25,25])box(root,[90,.02,.15],[0,.05,z],m.whitePaint);
      register('stadium','简化椭圆体育场',[132,12.1,92],true,root);
    }
    {
      const root=new Group();box(root,[100,.035,60],[0,.02,0],m.grass,true);
      for(const z of [-27,27])box(root,[94,.01,.15],[0,.045,z],m.whitePaint);
      for(const x of [-47,0,47])box(root,[.15,.01,54],[x,.045,0],m.whitePaint);
      register('sports_field','校园运动场',[100,.05,60],false,root);
    }
    {
      const root = new Group(); box(root, [0.08, 2.8, 0.08], [0, 1.4, 0], m.metal);
      box(root, [1.5, 0.7, 0.12], [0, 2.5, 0], m.signBlue, true);
      box(root, [1.1, 0.08, 0.02], [0, 2.5, -0.075], m.signWhite);
      register('traffic_sign', '交通标牌', [0.16, 2.85, 0.16], true, root);
    }
    {
      const root = new Group();
      for (const x of [-2.8, 2.8]) box(root, [0.1, 2.6, 0.1], [x, 1.3, 0.9], m.darkMetal);
      box(root, [6.4, 0.16, 2.6], [0, 2.7, 0], m.shelterRoof, true);
      box(root, [5.8, 1.8, 0.08], [0, 1.3, 1], m.glass);
      box(root, [5, 0.2, 0.5], [0, 0.6, 0.6], m.buildingWarm);
      register('bus_stop', '公交候车亭', [6.4, 2.8, 2.6], true, root);
    }
    {
      const root = new Group(); box(root, [10, 0.4, 0.15], [0, 0.85, 0], m.metal);
      for (const x of [-4, 0, 4]) box(root, [0.12, 1.1, 0.12], [x, 0.55, 0], m.darkMetal);
      register('guardrail', '护栏', [10, 1.1, 0.2], true, root);
    }
    {
      const root=new Group();box(root,[20,2.9,0.22],[0,1.9,0],m.buildingCool,true);
      for(const x of [-9.8,0,9.8])box(root,[0.14,3.5,0.3],[x,1.75,0],m.metal);
      register('noise_barrier','隔音墙',[20,3.5,0.3],true,root);
    }
    for(const [id,label,w,d,material] of [['green_strip','绿带 / 公园',20,8,m.grass],['hardscape','养护硬质场地',40,30,m.wall]] as const) {
      const root=new Group();box(root,[w,0.04,d],[0,0.02,0],material,true);register(id,label,[w,0.04,d],false,root);
    }
    {
      const root=new Group(),geometry=new BufferGeometry();
      geometry.setAttribute('position',new Float32BufferAttribute([-10,0,-5,10,0,-5,-10,3,-3,10,3,-3,-10,0,5,10,0,5],3));
      geometry.setIndex([0,2,1,1,2,3,2,4,3,3,4,5,0,4,2,1,3,5]);geometry.computeVertexNormals();
      const mesh=new Mesh(geometry,m.grass);mesh.userData.tint=true;root.add(mesh);register('embankment','边坡植被',[20,3,10],false,root);
    }
    {
      const root=new Group();for(const x of [-2.3,2.3])box(root,[0.15,5.3,0.15],[x,2.65,0],m.metal);
      box(root,[5.8,1.9,0.18],[0,4.4,0],m.signBlue,true);
      const face=new Mesh(new PlaneGeometry(5.4,1.6),m.signWhite);face.position.set(0,4.4,-0.101);face.rotation.y=Math.PI;face.userData.signLabel=true;root.add(face);
      register('guide_sign','快速路导向牌',[5.8,5.4,0.2],true,root);
    }
    {
      const root = new Group(); box(root, [1.8, 0.85, 4.3], [0, 0.65, 0], m.buildingCool, true);
      box(root, [1.55, 0.65, 2.1], [0, 1.35, -0.15], m.glassDark);
      for (const x of [-0.85, 0.85]) for (const z of [-1.35, 1.35]) box(root, [0.18, 0.55, 0.55], [x, 0.3, z], m.darkMetal);
      register('parked_car', '停放车辆占位', [1.8, 1.7, 4.3], true, root);
    }
    // Compile a tiny immutable kit once. Sector instances still own only their
    // matrices; authored props and Regional templates remain independent.
    for(const id of ['tree','streetlight','streetlight_dual','streetlight_highway','streetlight_small'] as const) {
      const template=this.entries.get(id)!.template,root=new Group(),groups=new Map<string,Mesh[]>();template.updateMatrixWorld(true);
      template.traverse(part=>{if(part instanceof Mesh){const key=id==='tree'?'tree':`${(part.material as MeshStandardMaterial).uuid}:${!!part.userData.environmentLamp}`;const parts=groups.get(key)??[];parts.push(part);groups.set(key,parts);}});
      for(const parts of groups.values()) {
        const origin=id==='tree'?new Vector3():parts.reduce((p,part)=>p.add(part.position),new Vector3()).multiplyScalar(1/parts.length);
        const geometries=parts.map(part=>{
          const geometry=part.geometry.clone().applyMatrix4(part.matrixWorld).translate(-origin.x,-origin.y,-origin.z);
          if(id==='tree'){const colors=new Float32Array(geometry.getAttribute('position').count*3),color=(part.material as MeshStandardMaterial).color;for(let i=0;i<colors.length;i+=3){colors[i]=color.r;colors[i+1]=color.g;colors[i+2]=color.b;}geometry.setAttribute('color',new Float32BufferAttribute(colors,3));}
          return geometry;
        });
        const geometry=mergeGeometries(geometries)!;geometries.forEach(g=>g.dispose());
        const material=id==='tree'?new MeshStandardMaterial({vertexColors:true,roughness:.96}):parts[0]!.material;
        if(id==='tree')this.ownedMaterials.push(material as MeshStandardMaterial);
        const mesh=new Mesh(geometry,material);mesh.position.copy(origin);mesh.userData.tint=id==='tree';mesh.userData.environmentLamp=parts[0]!.userData.environmentLamp;root.add(mesh);
      }
      this.cityStaticTemplates.set(id,root);
    }
  }
  buildInstances(objects: CityObject[]): Group {
    const root = new Group(), transform = new Matrix4(), placement = new Matrix4(), q = new Quaternion(), p = new Vector3(), scale = new Vector3();
    const byPrefab=new Map<PrefabId,CityObject[]>();for(const o of objects){const list=byPrefab.get(o.prefabId)??[];list.push(o);byPrefab.set(o.prefabId,list);}
    for (const id of PREFAB_IDS) {
      const instances = byPrefab.get(id);
      if (!instances?.length) continue;
      const prefab = this.entries.get(id)!,variants=new Map<CityObject['landmarkModel'],CityObject[]>();
      for(const o of instances){const key=o.landmarkModel,list=variants.get(key)??[];list.push(o);variants.set(key,list);}
      for(const [landmark,instances]of variants){
      let template=instances.every(o=>!o.id.startsWith('regional:'))?this.cityStaticTemplates.get(id)??prefab.template:prefab.template;
      if(landmark){const band=cityFacadeHeightBand(instances[0]!.scale?.y??1),key=id+':'+landmark+':'+band;let specific=this.landmarkTemplates.get(key);if(!specific){specific=cityLandmarkTemplate(landmark,prefab.size,this.landmarkMaterials,band);this.landmarkTemplates.set(key,specific);}template=specific;}
      template.updateMatrixWorld(true);
      template.traverse(part => {
        if (!(part instanceof Mesh)) return;
        const batchKey=(o:CityObject)=>part.userData.signLabel?o.label??'Ring':!o.facade?'legacy':part.userData.facadeBody?`${o.facade}:${o.buildingShape??'box'}:${cityFacadeHeightBand(o.scale?.y??1)}`:part.userData.buildingRoof?o.buildingShape??'box':o.facade;
        const batches=new Map<string,CityObject[]>();for(const o of instances){const key=batchKey(o),list=batches.get(key)??[];list.push(o);batches.set(key,list);}
        for(const batch of batches.values()) {
        const facade=batch[0]!.facade;if(facade&&part.userData.windowBands)continue;
        let labelAspect=4;
        if(part.userData.landmarkLabel){part.geometry.computeBoundingBox();const b=part.geometry.boundingBox!,s=batch[0]!.scale;labelAspect=(b.max.x-b.min.x)*(s?.x??1)/((b.max.y-b.min.y)*(s?.y??1));}
        const material=facade&&(part.userData.facadeBody||part.userData.landmarkFacade)?this.facadeMaterial(facade):part.userData.signLabel?this.signMaterial(batch[0]!.label??'Ring',part.material as MeshBasicMaterial,part.userData.landmarkLabel===true,labelAspect):part.material;
        let geometry=part.geometry;
        if(facade&&(part.userData.facadeBody||part.userData.buildingRoof)) {
          const shape=batch[0]!.buildingShape??'box',band=part.userData.buildingRoof?1:cityFacadeHeightBand(batch[0]!.scale?.y??1),key=`${id}:${shape}:${band}:${part.userData.buildingRoof?'roof':'body'}`;
          geometry=this.buildingGeometries.get(key)!;
          if(!geometry){const [w,h,d]=prefab.size;geometry=cityBuildingGeometry(part.userData.buildingRoof?w+.5:w,part.userData.buildingRoof?.4:h-.4,part.userData.buildingRoof?d+.5:d,shape,band,part.userData.buildingRoof===true);this.buildingGeometries.set(key,geometry);}
        }
        const mesh = new InstancedMesh(geometry,material,batch.length);
        mesh.name = `${id} instances`; mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.userData.cityObjectIds = batch.map(o => o.id);
        mesh.userData.environmentLamp = part.userData.environmentLamp;
        batch.forEach((o, i) => {
          p.set(o.position.x, o.position.y ?? 0, o.position.z); q.setFromAxisAngle(new Vector3(0, 1, 0), o.rotation);
          scale.set(o.scale?.x ?? 1, o.scale?.y ?? 1, o.scale?.z ?? 1);
          placement.compose(p, q, scale); transform.multiplyMatrices(placement, part.matrixWorld); mesh.setMatrixAt(i, transform);
          if (part.userData.tint) mesh.setColorAt(i, new Color(o.color ?? '#ffffff'));
        });
        mesh.computeBoundingSphere(); root.add(mesh);
        }
      });
      }
    }
    return root;
  }
  collider(o: CityObject): StaticCollider | null {
    const prefab = this.entries.get(o.prefabId)!;
    if (!prefab.solid) return null;
    return createStaticOBBCollider({ id: o.id, x: o.position.x, z: o.position.z,
      width: prefab.size[0] * (o.scale?.x ?? 1) * (o.buildingShape==='slab'?.62:1), length: prefab.size[2] * (o.scale?.z ?? 1), minHeight: o.position.y ?? 0, maxHeight: (o.position.y ?? 0) + prefab.size[1] * (o.scale?.y ?? 1),
      yaw: o.rotation, type: ['tree', 'streetlight', 'streetlight_dual', 'streetlight_highway', 'streetlight_small', 'parked_car', 'bus_stop', 'traffic_sign'].includes(o.prefabId) ? 'obstacle' : o.prefabId === 'guardrail' ? 'guardrail' : 'building' });
  }
  private facadeMaterial(profile:CityFacade):MeshStandardMaterial {
    let material=this.facadeMaterials.get(profile);if(material)return material;
    const palette:Record<CityFacade,[number[],number[]]>={
      residential:[[207,205,190],[86,110,119]],office:[[151,171,180],[61,91,110]],
      'old-town':[[191,166,139],[85,91,90]],industrial:[[185,193,189],[105,125,128]],campus:[[211,201,178],[83,111,119]],
    };
    const [wall,glass]=palette[profile],size=profile==='office'?512:256,pixels=new Uint8Array(size*size*4),cell=profile==='office'?32:16;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
      const window=profile==='industrial'?y%32<9&&x%32>3:x%cell>cell*.2&&x%cell<cell*.75&&y%cell>cell*.25&&y%cell<cell*.82;
      const frame=profile==='office'&&(x%cell<2||y%cell<2),c=window?glass:wall,i=(y*size+x)*4,shade=frame?-15:window?((Math.floor(x/cell)+Math.floor(y/cell)*3)%5)*3:(Math.floor(y/32)%2)*3;
      pixels[i]=c[0]!+shade;pixels[i+1]=c[1]!+shade;pixels[i+2]=c[2]!+shade;pixels[i+3]=255;
    }
    const map=new DataTexture(pixels,size,size);map.colorSpace=SRGBColorSpace;map.wrapS=map.wrapT=RepeatWrapping;map.generateMipmaps=true;map.minFilter=LinearMipmapLinearFilter;map.magFilter=LinearFilter;map.needsUpdate=true;
    material=new MeshStandardMaterial({map,roughnessMap:map,roughness:profile==='office'?.68:.94});material.userData.cityFacade=profile;this.facadeMaterials.set(profile,material);return material;
  }
  private signMaterial(label:string,fallback:MeshBasicMaterial,landmark=false,aspect=4):MeshBasicMaterial {
    if(typeof document==='undefined')return fallback;
    const key=(landmark?'landmark:'+aspect.toFixed(2)+':':'')+label;let material=this.signMaterials.get(key);if(material)return material;
    const canvas=document.createElement('canvas');canvas.width=landmark?2048:768;canvas.height=landmark?Math.max(48,Math.min(512,Math.round(2048/aspect))):224;const context=canvas.getContext('2d')!;
    context.fillStyle='#ffffff';context.textAlign='center';context.font=landmark?`600 ${canvas.height*.72}px "Microsoft YaHei",sans-serif`:'bold 64px sans-serif';if(landmark)context.textBaseline='middle';context.fillText(label,canvas.width/2,landmark?canvas.height*.52:135,canvas.width-28);
    const map=new CanvasTexture(canvas);map.colorSpace=SRGBColorSpace;material=new MeshBasicMaterial({map,transparent:true,toneMapped:!landmark});this.signMaterials.set(key,material);return material;
  }
  dispose(): void { for (const prefab of this.entries.values()) prefab.template.traverse(p => { if (p instanceof Mesh) p.geometry.dispose(); });for(const root of this.cityStaticTemplates.values())root.traverse(p=>{if(p instanceof Mesh)p.geometry.dispose();});this.cityStaticTemplates.clear();for(const root of this.landmarkTemplates.values())root.traverse(p=>{if(p instanceof Mesh)p.geometry.dispose();});this.landmarkTemplates.clear();for(const g of this.buildingGeometries.values())g.dispose();this.buildingGeometries.clear();for(const m of this.signMaterials.values()){m.map?.dispose();m.dispose();}this.signMaterials.clear();for(const m of this.facadeMaterials.values()){m.map?.dispose();m.dispose();}this.facadeMaterials.clear();this.ownedMaterials.forEach(m=>m.dispose()); }
}
