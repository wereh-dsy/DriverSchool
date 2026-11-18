import { BufferGeometry, Float32BufferAttribute, Group, Line, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, type Object3D, type Material } from 'three';
export interface RenderDebugPrimitive {
    id: string;
    kind: 'mesh' | 'segments' | 'line';
    positions: Float32Array;
    colors?: Float32Array;
    indices?: Uint32Array;
    matrix: number[];
    color: number;
    opacity: number;
    depthTest: boolean;
    side: number;
    order: number;
    layers: number;
}
/** Optional, small interactive diagnostics only. Static world meshes never enter this scene. */
export function exportDebugOverlays(root: Object3D): RenderDebugPrimitive[] {
    const result: RenderDebugPrimitive[] = [];
    const visit = (object: Object3D) => {
        if (!object.visible || object.userData.rendererOwned)
            return;
        if (object instanceof Mesh || object instanceof Line) {
            const geometry = object.geometry, position = geometry.getAttribute('position'), material = object.material as Material & {
                color?: {
                    getHex(): number;
                };
            };
            if (position && !Array.isArray(material)) {
                object.updateWorldMatrix(true, false);
                const index = geometry.index, start = geometry.drawRange.start, count = Math.min(geometry.drawRange.count, index?.count ?? position.count), positions = new Float32Array(position.count * 3), color = geometry.getAttribute('color');
                for (let i = 0; i < position.count; i++) {
                    positions[i * 3] = position.getX(i);
                    positions[i * 3 + 1] = position.getY(i);
                    positions[i * 3 + 2] = position.getZ(i);
                }
                const colors = color ? new Float32Array(color.array) : undefined, indices = index ? new Uint32Array(index.array.slice(start, start + count)) : undefined;
                result.push({
                    id: object.uuid, kind: object instanceof Mesh ? 'mesh' : object instanceof LineSegments ? 'segments' : 'line', positions: index ? positions : positions.slice(start * 3, (start + count) * 3), colors: index ? colors : colors?.slice(start * 3, (start + count) * 3), indices, matrix: object.matrixWorld.toArray(), color: material.color?.getHex() ?? 0xffffff, opacity: material.opacity, depthTest: material.depthTest, side: material.side, order: object.renderOrder, layers: object.layers.mask
                });
            }
        }
        for (const child of object.children)
            visit(child);
    };
    visit(root);
    return result;
}
export class RenderDebugOverlays {
    readonly root = new Group();
    private readonly objects = new Map<string, Mesh | Line>();
    apply(packets: RenderDebugPrimitive[]): void {
        if (!packets.length && !this.objects.size)
            return;
        const used = new Set<string>();
        for (const packet of packets) {
            used.add(packet.id);
            let object = this.objects.get(packet.id);
            if (!object) {
                const geometry = new BufferGeometry(), options = {
                    color: packet.color, vertexColors: !!packet.colors, opacity: packet.opacity, transparent: packet.opacity < 1, depthTest: packet.depthTest, side: packet.side as import('three').Side
                };
                object = packet.kind === 'mesh' ? new Mesh(geometry, new MeshBasicMaterial(options)) : packet.kind === 'segments' ? new LineSegments(geometry, new LineBasicMaterial(options)) : new Line(geometry, new LineBasicMaterial(options));
                object.matrixAutoUpdate = false;
                object.frustumCulled = false;
                this.objects.set(packet.id, object);
                this.root.add(object);
            }
            const geometry = object.geometry;
            for (const [name, array] of [['position', packet.positions], ['color', packet.colors]] as const)
                if (array) {
                    const attribute = geometry.getAttribute(name);
                    if (attribute?.array.length === array.length) {
                        attribute.array.set(array);
                        attribute.needsUpdate = true;
                    }
                    else
                        geometry.setAttribute(name, new Float32BufferAttribute(array, 3));
                }
            if (packet.indices)
                geometry.setIndex(Array.from(packet.indices));
            geometry.setDrawRange(0, packet.indices?.length ?? packet.positions.length / 3);
            object.matrix.fromArray(packet.matrix);
            object.layers.mask = packet.layers;
            object.renderOrder = packet.order;
            object.matrixWorldNeedsUpdate = true;
            const material = object.material as MeshBasicMaterial;
            material.color.setHex(packet.color);
            material.opacity = packet.opacity;
            material.depthTest = packet.depthTest;
        }
        for (const [id, object] of this.objects)
            if (!used.has(id)) {
                object.geometry.dispose();
                (object.material as Material).dispose();
                object.removeFromParent();
                this.objects.delete(id);
            }
    }
    dispose(): void { this.apply([]); this.root.removeFromParent(); }
}
