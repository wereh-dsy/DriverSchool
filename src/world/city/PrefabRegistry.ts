import { BufferGeometry, CanvasTexture, Color, CylinderGeometry, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, SRGBColorSpace, Vector3 } from 'three';
import { createStaticOBBCollider, type StaticCollider } from '../../vehicle/physics/CollisionSystem';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeBox } from '../subject3/geometry';
import type { Subject3Materials } from '../subject3/materials';
import { PREFAB_IDS, type CityObject, type PrefabId } from './CityMapData';

export interface CityPrefab { id: PrefabId; label: string; size: [number, number, number]; solid: boolean; template: Group }
/** Small procedural kit, using the existing city's materials and primitive geometry. */
export class PrefabRegistry {
  readonly entries = new Map<PrefabId, CityPrefab>();
  private readonly signMaterials=new Map<string,MeshBasicMaterial>();
  constructor(m: Subject3Materials) {
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
      box(root, [w, h, d], [0, h / 2, 0], m.buildingLight, true);
      box(root, [w + 0.5, 0.4, d + 0.5], [0, h + 0.2, 0], m.roof);
      // Window bands are low draw cost and readable in both top and 3D views.
      const windows:BufferGeometry[]=[];
      for (let y = 2; y < h - 1; y += 3.5) for (const side of [-1, 1]) {
        const part=box(root,[w-2,1.25,0.1],[0,y,side*(d/2+0.06)],m.glass);
        part.updateMatrix();windows.push(part.geometry.clone().applyMatrix4(part.matrix));root.remove(part);part.geometry.dispose();
      }
      const bands=mergeGeometries(windows);windows.forEach(g=>g.dispose());if(bands)root.add(new Mesh(bands,m.glass));
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
  }
  buildInstances(objects: CityObject[]): Group {
    const root = new Group(), transform = new Matrix4(), placement = new Matrix4(), q = new Quaternion(), p = new Vector3(), scale = new Vector3();
    for (const id of PREFAB_IDS) {
      const instances = objects.filter(o => o.prefabId === id);
      if (!instances.length) continue;
      const prefab = this.entries.get(id)!; prefab.template.updateMatrixWorld(true);
      prefab.template.traverse(part => {
        if (!(part instanceof Mesh)) return;
        const batches=part.userData.signLabel?[...new Set(instances.map(o=>o.label??'Ring'))].map(label=>instances.filter(o=>(o.label??'Ring')===label)):[instances];
        for(const batch of batches) {
        const mesh = new InstancedMesh(part.geometry,part.userData.signLabel?this.signMaterial(batch[0]!.label??'Ring',part.material as MeshBasicMaterial):part.material,batch.length);
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
    return root;
  }
  collider(o: CityObject): StaticCollider | null {
    const prefab = this.entries.get(o.prefabId)!;
    if (!prefab.solid) return null;
    return createStaticOBBCollider({ id: o.id, x: o.position.x, z: o.position.z,
      width: prefab.size[0] * (o.scale?.x ?? 1), length: prefab.size[2] * (o.scale?.z ?? 1), minHeight: o.position.y ?? 0, maxHeight: (o.position.y ?? 0) + prefab.size[1] * (o.scale?.y ?? 1),
      yaw: o.rotation, type: ['tree', 'streetlight', 'parked_car', 'bus_stop', 'traffic_sign'].includes(o.prefabId) ? 'obstacle' : o.prefabId === 'guardrail' ? 'guardrail' : 'building' });
  }
  private signMaterial(label:string,fallback:MeshBasicMaterial):MeshBasicMaterial {
    if(typeof document==='undefined')return fallback;
    let material=this.signMaterials.get(label);if(material)return material;
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=224;const context=canvas.getContext('2d')!;
    context.fillStyle='#ffffff';context.textAlign='center';context.font='bold 64px sans-serif';context.fillText(label,384,135,740);
    const map=new CanvasTexture(canvas);map.colorSpace=SRGBColorSpace;material=new MeshBasicMaterial({map,transparent:true});this.signMaterials.set(label,material);return material;
  }
  dispose(): void { for (const prefab of this.entries.values()) prefab.template.traverse(p => { if (p instanceof Mesh) p.geometry.dispose(); });for(const m of this.signMaterials.values()){m.map?.dispose();m.dispose();}this.signMaterials.clear(); }
}
