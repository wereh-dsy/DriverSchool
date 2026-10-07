import * as THREE from 'three';
import type { InstrumentCluster } from './InstrumentCluster';
import type { VehicleVisualConfig } from './VehicleVisualConfig';

interface BinnacleShape {
  readonly halfWidth: number;
  readonly halfHeight: number;
  readonly crown: number;
  readonly border: number;
  readonly lipZ: number;
  readonly rearDepth: number;
}

// Apertures surround the existing artwork. Shape differences belong to the
// vehicle's visual design, never to its name or its telemetry.
const SHAPES: Readonly<Record<string, BinnacleShape>> = {
  traditional: { halfWidth: .247, halfHeight: .115, crown: .008, border: .010, lipZ: .096, rearDepth: .16 },
  flow: { halfWidth: .247, halfHeight: .103, crown: .027, border: .009, lipZ: .100, rearDepth: .16 },
  formal: { halfWidth: .247, halfHeight: .109, crown: .008, border: .008, lipZ: .096, rearDepth: .15 },
  comfort: { halfWidth: .247, halfHeight: .114, crown: .011, border: .010, lipZ: .094, rearDepth: .15 },
  executive: { halfWidth: .255, halfHeight: .108, crown: .002, border: .008, lipZ: .100, rearDepth: .18 },
};

export const instrumentBinnacleShape = (config: VehicleVisualConfig): BinnacleShape =>
  SHAPES[config.body.design ?? 'traditional'] ?? SHAPES.traditional!;

/** Thin continuous visor, front lip and recess walls with an open centre. */
export function fitInstrumentBinnacle(cluster: InstrumentCluster, config: VehicleVisualConfig): void {
  const shape = instrumentBinnacleShape(config);
  const { halfWidth: w, halfHeight: h, crown, border, lipZ, rearDepth } = shape;
  const opening = [
    [-w, -h + .015], [-w, h - .023], [-w + .016, h],
    [-w * .70, h + crown * .45], [-w * .25, h + crown],
    [w * .25, h + crown], [w * .70, h + crown * .45],
    [w - .016, h], [w, h - .023], [w, -h + .015],
    [w - .016, -h], [-w + .016, -h],
  ] as const;
  const executive = config.body.design === 'executive';
  const backZ = executive ? .050 : .030;
  const hood = cluster.getObjectByName('Instrument binnacle hood') as THREE.Mesh;
  hood.removeFromParent();
  hood.geometry.dispose();
  const back = cluster.getObjectByName('Instrument binnacle back') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  back.geometry.dispose();
  back.geometry = new THREE.ExtrudeGeometry(new THREE.Shape(opening.map(([x, y]) => new THREE.Vector2(x, y))),
    { depth: .006, bevelEnabled: false, steps: 1 });
  back.position.z = backZ;
  back.material.color.setHex(0x1b2027);
  back.material.roughness = .78;

  const positions: number[] = [];
  const indices: number[] = [];
  // Four perimeter rings form a hollow casing. The roof slopes down towards
  // the cowl; only the narrow aperture lip projects towards the driver.
  for (let ring = 0; ring < 4; ring++) for (const [x, y] of opening) {
    const outerX = x + Math.sign(x) * border;
    const outerY = y + Math.sign(y) * border;
    if (ring === 0) positions.push(outerX, outerY, lipZ);
    else if (ring === 1) positions.push(x, y, lipZ - .003);
    else if (ring === 2) positions.push(outerX * .90, -h + (outerY + h) * .45 - .035, -rearDepth);
    else positions.push(x, y, backZ + .006);
  }
  const geometry = new THREE.BufferGeometry();
  const count = opening.length;
  const connect = (from: number, to: number, material: number): void => {
    const start = indices.length;
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count, a = from * count, b = to * count;
      indices.push(a + i, b + i, b + j, a + i, b + j, a + j);
    }
    geometry.addGroup(start, indices.length - start, material);
  };
  connect(0, 1, 1); // Fine aperture edge.
  connect(0, 2, 0); // Tapered outer visor / shoulders.
  connect(1, 3, 0); // Visible recess ahead of the existing instruments.
  connect(2, 3, 0); // Rear return, embedded into the upper dashboard.
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const visor = new THREE.Mesh(geometry, [
    new THREE.MeshStandardMaterial({ color: executive ? 0x20252c : 0x1b2026,
      roughness: .86, metalness: .03, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: executive ? 0x777f89 : 0x343b42,
      roughness: executive ? .42 : .82, metalness: executive ? .48 : .04, side: THREE.DoubleSide }),
  ]);
  visor.name = 'Instrument binnacle contoured visor';
  visor.castShadow = true;
  visor.receiveShadow = true;
  visor.userData.apertureLipZ = lipZ - .003;
  visor.userData.apertureBorder = border;
  cluster.add(visor);
}
