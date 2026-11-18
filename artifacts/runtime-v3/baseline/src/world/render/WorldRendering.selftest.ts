import { Box3, BoxGeometry, Color, Group, InstancedMesh, Matrix3, Matrix4, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, SphereGeometry, Vector3 } from 'three';
import { PrefabRegistry } from '../city/PrefabRegistry';
import { createSubject3Materials } from '../subject3/materials';
import { drain } from '../../loading/Loading';
import { WorldRenderClusters } from './WorldRenderClusters';
import { WorldLODPolicy } from './WorldLODPolicy';
import { staticTemplateSteps } from './StaticBatchBuilder';
import { WorldLODProxies } from './WorldLODProxies';
export function runWorldRenderingSelfTest() {
    let assertions = 0;
    const check = (ok: boolean, name: string) => {
        assertions++;
        if (!ok) {
            throw Error('World rendering: ' + name);
        }
    };
    const material = new MeshStandardMaterial(), geometry = new BoxGeometry(2, 2, 2), world = new WorldRenderClusters();
    const fixture = () => {
        const root = new Group();
        for (let i = 0; i < 3; i++) {
            const mesh = new Mesh(geometry.clone(), material);
            mesh.position.set(100010 + i * 3, 2, -20);
            mesh.scale.set(1, 1 + i * .2, 1);
            root.add(mesh);
        }
        return root;
    };
    const triangles = (root: Group) => {
        const values: string[] = [];
        root.updateMatrixWorld(true);
        const matrix = new Matrix4(), normalMatrix = new Matrix3(), p = new Vector3(), n = new Vector3();
        root.traverse(object => {
            if (!(object instanceof Mesh)) {
                return;
            }
            const g = object.geometry, position = g.getAttribute('position'), normal = g.getAttribute('normal'), uv = g.getAttribute('uv');
            for (let instance = 0; instance < (object instanceof InstancedMesh ? object.count : 1); instance++) {
                if (object instanceof InstancedMesh) {
                    object.getMatrixAt(instance, matrix);
                    matrix.premultiply(object.matrixWorld);
                }
                else {
                    matrix.copy(object.matrixWorld);
                }
                normalMatrix.getNormalMatrix(matrix);
                const count = g.index?.count ?? position.count;
                for (let i = 0; i < count; i += 3) {
                    const vertices: string[] = [];
                    for (let c = 0; c < 3; c++) {
                        const j = g.index?.getX(i + c) ?? i + c;
                        p.fromBufferAttribute(position, j).applyMatrix4(matrix);
                        n.fromBufferAttribute(normal, j).applyNormalMatrix(normalMatrix);
                        vertices.push([...p.toArray(), ...n.toArray(), uv?.getX(j) ?? 0, uv?.getY(j) ?? 0].map(x => (Math.abs(x) < .00005 ? 0 : x).toFixed(4)).join(','));
                    }
                    values.push(vertices.sort().join('|'));
                }
            }
        });
        return values.sort().join('\n');
    };
    const root = fixture(), expected = triangles(root);
    drain(world.prepareSteps(root));
    world.publish('owner', root);
    check(world.statistics.owners === 1, 'prepared owner publishes into the world index');
    check(triangles(root) === expected, 'world XYZ, normals, UV and triangle membership survive local batching');
    check(world.batches.statistics.sources === 3 && world.batches.statistics.batches === 1, 'compatible static meshes submit one bounded batch');
    let localMaximum = 0;
    root.traverse(o => {
        if (o instanceof Mesh) {
            for (const x of o.geometry.getAttribute('position').array) {
                localMaximum = Math.max(localMaximum, Math.abs(x));
            }
        }
    });
    check(localMaximum < 500, 'large world positions are stored in local coordinates');
    const again = fixture();
    drain(world.prepareSteps(again));
    check(world.resources.statistics.hits > 0, 'identical reloaded geometry shares its GPU buffer');
    world.publish('owner', again);
    world.unpublish('owner', root);
    check(world.statistics.owners === 1, 'late unload cannot remove a replacement owner');
    const release = (owner: Group) => owner.traverse(o => {
        if (o instanceof InstancedMesh) {
            o.dispose();
        }
        else if (o instanceof Mesh && o.userData.worldGeometryLease) {
            world.resources.release(o.geometry);
        }
    });
    release(root);
    check(world.resources.state.idleBytes === 0, 'unloading one owner cannot release another owner lease');
    release(again);
    check(world.resources.state.idleBytes > 0, 'last owner returns an immutable batch to bounded idle storage');
    const live = new Group(), signal = new Group();
    signal.userData.worldDynamic = true;
    const bulb = new Mesh(geometry.clone(), material);
    signal.add(bulb);
    live.add(signal);
    drain(world.prepareSteps(live));
    check(bulb.parent === signal, 'dynamic signal identity and update hierarchy remain live');
    const instances = new Group();
    for (let j = 0; j < 2; j++) {
        const mesh = new InstancedMesh(geometry, material, 2);
        for (let i = 0; i < 2; i++) {
            mesh.setMatrixAt(i, new Matrix4().makeTranslation(10 + j * 10 + i, 0, 0));
            mesh.setColorAt(i, new Color(i ? 'red' : 'blue'));
        }
        instances.add(mesh);
    }
    const before = triangles(instances);
    drain(world.prepareSteps(instances));
    check(triangles(instances) === before, 'instanced world transforms survive batching');
    let instanceCount = 0, colorCount = 0;
    instances.traverse(o => {
        if (o instanceof InstancedMesh) {
            instanceCount += o.count;
            colorCount += o.instanceColor?.count ?? 0;
        }
    });
    check(instanceCount === 4 && colorCount === 4, 'all instance colors and instances are retained');
    const model = new Group();
    for (let i = 0; i < 3; i++) {
        const mesh = new Mesh(geometry, material);
        mesh.position.x = i * 3;
        model.add(mesh);
    }
    const compact = drain(staticTemplateSteps(model));
    check(compact.children.length === 1 && triangles(model) === triangles(compact), 'shared prefab compaction preserves complete geometry');
    const cancelled = fixture(), cancelTriangles = triangles(cancelled), task = world.prepareSteps(cancelled);
    for (let i = 0; i < 6; i++) {
        task.next();
    }
    task.return(undefined);
    check(triangles(cancelled) === cancelTriangles, 'cancelled preparation leaves the original owner intact');
    const camera = new PerspectiveCamera(60, 1, .1, 2000);
    camera.position.set(100012, 2, 0);
    camera.lookAt(100012, 2, -20);
    camera.updateMatrixWorld();
    world.configure(camera.position, 1500, [camera]);
    world.update(again);
    check(again.visible, 'visible cluster remains available to the camera');
    camera.lookAt(100012, 2, 1000);
    camera.updateMatrixWorld();
    world.configure(camera.position, 1500, [camera]);
    world.update(again);
    check(again.visible, 'near shadow casters are preserved outside the view');
    const lod = new WorldLODPolicy();
    check(lod.select(790, 'near') === 'near' && lod.select(860, 'near') === 'mid', 'HLOD distance hysteresis prevents boundary oscillation');
    check(lod.select(1850, 'mid') === 'mid' && lod.select(1910, 'mid') === 'far', 'far proxies use the same hysteresis contract');
    const mixed = new Group(), other = material.clone();
    mixed.add(new Mesh(geometry.clone(), material), new Mesh(geometry.clone(), other));
    drain(world.prepareSteps(mixed));
    check(mixed.userData.worldClusters.length === 1, 'different compatible material draws share one spatial visibility node');
    const wide = new Group(), plane = new PlaneGeometry(2000, 10, 16, 1);
    plane.rotateX(-Math.PI / 2);
    wide.add(new Mesh(plane, material));
    const wideBefore = triangles(wide);
    drain(world.prepareSteps(wide));
    check(triangles(wide) === wideBefore && wide.userData.worldClusters.length > 1, 'large proxy meshes split spatially without changing any triangle');
    const proxies = new WorldLODProxies(), sphere = new SphereGeometry(2, 48, 32), proxy = drain(proxies.geometrySteps(sphere));
    check(proxy.getAttribute('position').count <= sphere.getAttribute('position').count && proxy.index!.count < sphere.index!.count, 'prepared model proxy reduces triangles without replacing the scene');
    sphere.computeBoundingBox();
    check(proxy.boundingBox!.equals(sphere.boundingBox!), 'proxy retains the source silhouette extrema');
    proxies.dispose();
    sphere.dispose();
    release(mixed);
    release(wide);
    other.dispose();
    const modelMaterials=createSubject3Materials(),models=new PrefabRegistry(modelMaterials);
    const office=models.buildInstances([{id:'regional:test-office',prefabId:'office',facade:'office',buildingShape:'chamfered',position:{x:20,y:4,z:20},rotation:.3,scale:{x:1,y:2,z:1}}]);
    office.updateMatrixWorld(true);const officeBounds=new Box3().setFromObject(office);
    check(officeBounds.min.y>=4-.001&&Math.abs(officeBounds.max.y-(4+models.entries.get('office')!.size[1]*2))<.001,'facade replacement keeps the original part frame and full building height');
    const lamps=models.buildInstances([{id:'regional:test-lamp',prefabId:'streetlight_dual',position:{x:50,y:3,z:40},rotation:.4}]);
    const lampPositions=(owner:Group)=>{owner.updateMatrixWorld(true);const points:string[]=[];owner.traverse(o=>{if(o instanceof InstancedMesh&&o.userData.environmentLamp)for(let i=0;i<o.count;i++){const matrix=new Matrix4();o.getMatrixAt(i,matrix);const point=new Vector3().setFromMatrixPosition(matrix).applyMatrix4(o.matrixWorld);points.push(point.toArray().map(v=>v.toFixed(4)).join(','));}});return points.sort();};
    const originalHeads=lampPositions(lamps);check(originalHeads.length===2&&originalHeads.every(p=>Math.abs(Number(p.split(',')[1])-12.65)<.001),'regional dual lamps retain two separate physical head anchors');
    drain(world.prepareSteps(lamps));check(lampPositions(lamps).join('|')===originalHeads.join('|'),'spatial instance batching preserves all lamp sampling positions');
    for(const owner of [office,lamps])owner.traverse(o=>{if(o instanceof InstancedMesh)o.dispose();});models.dispose();Object.values(modelMaterials).forEach(m=>m.dispose());
    world.dispose();
    check(world.resources.state.bytes === 0, 'shutdown releases active and idle registry buffers');
    for (const owner of [compact, live, cancelled]) {
        owner.traverse(o => {
            if (o instanceof Mesh) {
                o.geometry.dispose();
            }
        });
    }
    geometry.dispose();
    material.dispose();
    return { passed: true, assertions };
}
