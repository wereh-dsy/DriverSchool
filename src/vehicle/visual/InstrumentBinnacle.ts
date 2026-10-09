import * as THREE from 'three';
import type { InstrumentCluster } from './InstrumentCluster';
import type { VehicleVisualConfig } from './VehicleVisualConfig';
import type { CockpitStructuralAnchors } from './CockpitLayout';

interface BinnacleShape {
  readonly halfWidth: number;
  readonly halfHeight: number;
  readonly crown: number;
  readonly border: number;
}

// Apertures surround the existing artwork. Shape differences belong to the
// vehicle's visual design, never to its name or its telemetry.
const SHAPES: Readonly<Record<string, BinnacleShape>> = {
  'mid-supercar': { halfWidth: .247, halfHeight: .106, crown: .021, border: .007 },
  traditional: { halfWidth: .247, halfHeight: .115, crown: .008, border: .010 },
  flow: { halfWidth: .247, halfHeight: .103, crown: .027, border: .009 },
  formal: { halfWidth: .247, halfHeight: .109, crown: .008, border: .008 },
  comfort: { halfWidth: .247, halfHeight: .114, crown: .011, border: .010 },
  executive: { halfWidth: .255, halfHeight: .108, crown: .002, border: .008 },
  'road-suv': { halfWidth: .250, halfHeight: .118, crown: .010, border: .010 },
  sport: { halfWidth: .250, halfHeight: .115, crown: .004, border: .008 },
};

export const instrumentBinnacleShape = (config: VehicleVisualConfig): BinnacleShape =>
  SHAPES[config.body.design === 'mid-supercar' ? 'mid-supercar' : config.body.profile === 'sport-coupe' ? 'sport' : config.body.design ?? 'traditional'] ?? SHAPES.traditional!;

export function instrumentBinnacleOpening(config: VehicleVisualConfig): readonly (readonly [number, number])[] {
  const { halfWidth: w, halfHeight: h, crown } = instrumentBinnacleShape(config);
  return config.body.design === 'executive' ? EXECUTIVE_INSTRUMENT_OUTLINE : [
    [-w, -h + .015], [-w, h - .023], [-w + .016, h],
    [-w * .70, h + crown * .45], [-w * .25, h + crown],
    [w * .25, h + crown], [w * .70, h + crown * .45],
    [w - .016, h], [w, h - .023], [w, -h + .015],
    [w - .016, -h], [-w + .016, -h],
  ] as const;
}

/** Thin continuous visor, front lip and recess walls with an open centre. */
export function fitInstrumentBinnacle(cluster: InstrumentCluster, config: VehicleVisualConfig, anchors: CockpitStructuralAnchors): void {
  const { halfWidth: w, halfHeight: h, border } = instrumentBinnacleShape(config);
  const lipZ = anchors.recessLip;
  const opening = instrumentBinnacleOpening(config);
  const integration = anchors.driverView?.integration;
  const executive = config.body.design === 'executive';
  const backZ = executive ? .060 : .030;
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
  const transform = config.instrumentClusterTransform;
  const scale = transform.scale ?? 1;
  const toDashboard = new THREE.Matrix4().compose(new THREE.Vector3(...transform.position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...transform.rotation)), new THREE.Vector3(scale, scale, scale));
  const inverse = toDashboard.clone().invert();
  // Keep the recess roof above the artwork before descending to the cowl.
  // A direct lip-to-cowl slope would cut diagonally across the upper readouts.
  for (let ring = 0; ring < 5; ring++) for (const [x, y] of opening) {
    const outerX = x + Math.sign(x) * border;
    const outerY = y + Math.sign(y) * border;
    if (ring === 0) positions.push(outerX, outerY, lipZ);
    else if (ring === 1) positions.push(x, y, lipZ - .003);
    else if (ring === 2) {
      // The outer roof and sides terminate on the actual transverse cowl,
      // making the hood a local rise of the dash instead of a freestanding pod.
      const p = new THREE.Vector3(transform.position[0] + outerX * scale,
        anchors.dashboardUpperFront[1] + (y > 0 ? .002 : -.023), anchors.dashboardUpperFront[2]).applyMatrix4(inverse);
      positions.push(p.x, p.y, p.z);
    }
    else if (ring === 3) positions.push(x, y, backZ + .006);
    else positions.push(outerX, outerY, backZ - .020);
  }
  if (integration) {
    // Reshape the existing canopy into a rolled brow and a flared root. The
    // aperture and artwork remain unchanged; this is not a second outer pod.
    for (const [x, y] of opening) {
      const upper = THREE.MathUtils.smoothstep(y, h * .20, h * .80);
      positions.push(x + Math.sign(x) * border, y + Math.sign(y) * border +
        upper * integration.browThickness / scale, lipZ + upper * integration.browProjection / scale);
    }
    for (const [x, y] of opening) {
      const upper = THREE.MathUtils.smoothstep(y, 0, h * .85);
      const p = new THREE.Vector3(x + Math.sign(x) * border, y + Math.sign(y) * border, backZ - .020)
        .applyMatrix4(toDashboard);
      const frontY = new THREE.Vector3(x, y + Math.sign(y) * border, lipZ).applyMatrix4(toDashboard).y;
      p.x += Math.sign(x) * .020 * Math.pow(Math.abs(x) / w, 2);
      p.y = THREE.MathUtils.lerp(p.y, Math.max(anchors.dashboardUpperRear[1] + integration.shoulderRise,
        frontY - integration.browRearDrop), upper);
      p.z = transform.position[2] - .025;
      p.applyMatrix4(inverse);
      positions.push(p.x, p.y, p.z);
    }
    if (executive) for (const [x, y] of opening) {
      const upper = THREE.MathUtils.smoothstep(y, h * .20, h * .80);
      // The small projected nose has a front face and a dark underside, not
      // just a sloping perimeter strip. It shelters the display's upper edge.
      positions.push(x, y + upper * .001 / scale,
        lipZ - .003 + upper * integration.browProjection / scale);
    }
  }
  const geometry = new THREE.BufferGeometry();
  const count = opening.length;
  const connect = (from: number, to: number, material: number, upperOnly = false): void => {
    const start = indices.length;
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count, a = from * count, b = to * count;
      if (upperOnly && Math.max(opening[i]![1], opening[j]![1]) <= h * .20) continue;
      indices.push(a + i, b + i, b + j, a + i, b + j, a + j);
    }
    geometry.addGroup(start, indices.length - start, material);
  };
  connect(0, 1, 1); // Fine aperture edge.
  if (integration) {
    connect(0, 5, 0); // Thin rolled brow above the lip.
    connect(5, 6, 0); // Roof and cheeks flare into the local dash rise.
    connect(6, 2, 0); // Root returns to the existing transverse upper pad.
    if (executive) {
      connect(5, 7, 0, true); // Thin front edge of the projecting brow.
      connect(7, 1, 2, true); // Underside above the shallow display opening.
    }
  } else {
    connect(0, 4, 0); // Roof above the recessed artwork.
    connect(4, 2, 0); // Outer visor descends into the cowl behind the display.
  }
  connect(1, 3, integration ? 2 : 0); // Dark inner recess, distinct from the dash skin.
  connect(2, 3, integration ? 2 : 0); // Rear return, embedded into the upper dashboard.
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const visor = new THREE.Mesh(geometry, [
    new THREE.MeshStandardMaterial({ color: integration ? (executive ? 0x343840 : 0x30343a) : executive ? 0x20252c : 0x1b2026,
      roughness: .86, metalness: .03, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: executive ? 0x777f89 : 0x343b42,
      roughness: executive ? .42 : .82, metalness: executive ? .48 : .04, side: THREE.DoubleSide }),
    ...(integration ? [new THREE.MeshStandardMaterial({ color: 0x1b2026,
      roughness: .86, side: THREE.DoubleSide })] : []),
  ]);
  visor.name = 'Instrument binnacle contoured visor';
  visor.castShadow = true;
  visor.receiveShadow = true;
  visor.userData.apertureLipZ = lipZ - .003;
  visor.userData.apertureBorder = border;
  cluster.add(visor);
}

/** Lobed aperture hugs the two dials; centre is recessed between their shoulders. */
export const EXECUTIVE_INSTRUMENT_OUTLINE: readonly (readonly [number, number])[] = [
  [-.253,-.047],[-.255,.020],[-.241,.069],[-.213,.098],[-.159,.113],[-.104,.108],
  [-.054,.100],[.054,.100],[.104,.108],[.159,.113],[.213,.098],[.241,.069],
  [.255,.020],[.253,-.047],[.224,-.080],[.169,-.106],[.103,-.094],[.054,-.081],
  [-.054,-.081],[-.103,-.094],[-.169,-.106],[-.224,-.080],
];
