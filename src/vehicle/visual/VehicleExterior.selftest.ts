import * as THREE from 'three';

import { buildVehicleExterior } from './VehicleExterior';
import { VEHICLE_RENDER_LAYERS } from './VehicleRenderLayers';
import {
  DEFAULT_SEDAN_VISUAL_CONFIG,
  SPORTS_COUPE_VISUAL_CONFIG,
  type VehicleVisualConfig,
} from './VehicleVisualConfig';

export interface VehicleExteriorProfileSelfTestResult {
  readonly profile: string;
  readonly meshCount: number;
  readonly nonBoxMeshCount: number;
  readonly glassCount: number;
  readonly pillarCount: number;
  readonly wheelArchCount: number;
  readonly lampCount: number;
  readonly bumperCount: number;
  readonly shellVertexCount: number;
  readonly renderedWidth: number;
  readonly renderedLength: number;
  readonly renderedHeight: number;
  readonly rooflineY: number;
}

export interface VehicleExteriorSelfTestResult {
  readonly sedan: VehicleExteriorProfileSelfTestResult;
  readonly sportsCoupe: VehicleExteriorProfileSelfTestResult;
}

const assert: (condition: boolean, message: string) => asserts condition = (
  condition,
  message,
) => {
  if (!condition) throw new Error(`Vehicle exterior self-test failed: ${message}`);
};

const testProfile = (config: VehicleVisualConfig): VehicleExteriorProfileSelfTestResult => {
  const root = new THREE.Group();
  buildVehicleExterior(root, config);
  root.updateMatrixWorld(true);

  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });
  const named = (fragment: string): THREE.Mesh[] => meshes.filter((mesh) =>
    mesh.name.toLowerCase().includes(fragment.toLowerCase()));
  const categorized = (category: string): THREE.Mesh[] => meshes.filter((mesh) =>
    mesh.userData.vehicleBodyPart === category);
  const shell = categorized('main-shell')[0];
  assert(shell !== undefined, `${config.body.profile} is missing its main body shell`);
  assert(
    !(shell.geometry instanceof THREE.BoxGeometry),
    `${config.body.profile} body shell regressed to BoxGeometry`,
  );
  assert(
    (shell.geometry.getAttribute('position')?.count ?? 0) >= 42,
    `${config.body.profile} body shell needs enough longitudinal sections`,
  );
  assert(meshes.length >= 30, `${config.body.profile} exterior is missing modeled parts`);
  assert(categorized('glass').length === 6, `${config.body.profile} needs windshield, rear glass and four side panes`);
  assert(categorized('pillar').length >= 6, `${config.body.profile} needs A/B/C pillars`);
  assert(categorized('wheel-arch').length === 4, `${config.body.profile} needs four wheel-arch flares`);
  assert(
    categorized('headlamp').length === 2 && categorized('tail-lamp').length === 2,
    `${config.body.profile} needs front and rear lamp pairs`,
  );
  assert(categorized('bumper').length === 2, `${config.body.profile} needs two bumper fascias`);
  assert(named('hood').length + named('bonnet').length >= 1, `${config.body.profile} needs a bonnet`);
  assert(named('roof outer shell').length === 1, `${config.body.profile} needs a shaped roof`);
  assert(categorized('front-fender').length === 2, `${config.body.profile} needs both front fenders`);
  assert(categorized('rear-quarter').length === 2, `${config.body.profile} needs both rear quarter/tail corners`);
  assert(categorized('sill').length === 2, `${config.body.profile} needs both side sills`);
  assert(meshes.every((mesh) => mesh.layers.mask === 1 << VEHICLE_RENDER_LAYERS.EXTERIOR),
    `${config.body.profile} exterior meshes must remain available to real mirror cameras`);

  if (config.body.profile === 'sedan') {
    assert(named('boot lid').length === 1, 'sedan needs a distinct boot lid');
    assert(named('door shut line').length === 4, 'sedan needs visible four-door panel breaks');
    assert(named('chrome framed grille').length === 1, 'sedan grille identity is missing');
    assert(categorized('door').length === 4, 'sedan needs four actual shaped door skins');
    assert(named('rear door side window').length === 2, 'sedan needs visible rear door glass');
  } else {
    assert(named('power-dome bonnet').length === 1, 'sports coupe needs its power-dome bonnet');
    assert(named('fastback roof').length === 1, 'sports coupe needs a fastback roof');
    assert(categorized('intake').length === 2, 'sports coupe needs brake intakes');
    assert(named('diffuser').length === 1, 'sports coupe needs a rear diffuser');
    assert(categorized('exhaust').length === 2, 'sports coupe needs twin exhaust outlets');
  }

  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  assert(
    Math.abs(size.x - config.collisionDimensions.width) < 0.015
      && Math.abs(size.z - config.collisionDimensions.length) < 0.015
      && Math.abs(bounds.max.y - config.collisionDimensions.height) < 0.015,
    `${config.body.profile} authored collision envelope must follow its visible exterior`,
  );
  assert(
    size.x <= config.vehicleWidth + 0.04,
    `${config.body.profile} render body exceeds configured width (${size.x.toFixed(3)} m)`,
  );
  assert(
    size.z <= config.vehicleLength + 0.2,
    `${config.body.profile} render body exceeds configured length (${size.z.toFixed(3)} m)`,
  );
  assert(
    bounds.min.y >= 0.1 && bounds.max.y <= config.cabin.roofY + 0.1,
    `${config.body.profile} render height escaped the configured body envelope`,
  );

  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  for (const mesh of meshes) {
    geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      materials.add(material);
    }
  }
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());

  return {
    profile: config.body.profile,
    meshCount: meshes.length,
    nonBoxMeshCount: meshes.filter((mesh) => !(mesh.geometry instanceof THREE.BoxGeometry)).length,
    glassCount: categorized('glass').length,
    pillarCount: categorized('pillar').length,
    wheelArchCount: categorized('wheel-arch').length,
    lampCount: categorized('headlamp').length + categorized('tail-lamp').length,
    bumperCount: categorized('bumper').length,
    shellVertexCount: shell.geometry.getAttribute('position')?.count ?? 0,
    renderedWidth: size.x,
    renderedLength: size.z,
    renderedHeight: size.y,
    rooflineY: bounds.max.y,
  };
};

export function runVehicleExteriorSelfTest(): VehicleExteriorSelfTestResult {
  const sedan = testProfile(DEFAULT_SEDAN_VISUAL_CONFIG);
  const sportsCoupe = testProfile(SPORTS_COUPE_VISUAL_CONFIG);
  assert(
    sedan.rooflineY > sportsCoupe.rooflineY + 0.1,
    'sedan and sports coupe silhouettes are not distinct enough in height',
  );
  return { sedan, sportsCoupe };
}
