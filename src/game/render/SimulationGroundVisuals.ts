import { Mesh, Texture, type BufferGeometry, type Material } from 'three';
import type { DrivingGround } from '../../world/DrivingGround';
/** Legacy analytic training grounds author solids and meshes in one constructor.
 * Retire their loading-only visual output; only the worker keeps drawable objects. */
export function releaseSimulationVisuals(ground: DrivingGround): void {
    const geometry = new Set<BufferGeometry>(), materials = new Set<Material>(), textures = new Set<Texture>();
    ground.root.traverse(object => {
        if (object instanceof Mesh) {
            geometry.add(object.geometry);
            for (const material of Array.isArray(object.material) ? object.material : [object.material])
                materials.add(material);
        }
    });
    for (const material of materials)
        for (const value of Object.values(material))
            if (value instanceof Texture)
                textures.add(value);
    textures.forEach(texture => texture.dispose());
    geometry.forEach(item => item.dispose());
    materials.forEach(item => item.dispose());
    ground.root.clear();
}
