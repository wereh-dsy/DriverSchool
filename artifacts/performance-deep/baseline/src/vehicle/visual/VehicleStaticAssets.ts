import { buildMaybachS680Exterior, buildMaybachS680Wheels } from './MaybachS680Exterior';
import { buildTank500Exterior, buildTank500Wheels } from './Tank500Exterior';
import * as THREE from 'three';
import { buildJeskoAttackExterior, buildJeskoAttackWheels } from './JeskoAttackExterior';
import { localWheelPositions, VEHICLE_WHEEL_IDS, type VehicleWheelId } from '../VehicleDimensions';
import type { VehicleVisualConfig } from './VehicleVisualConfig';
import type { VehicleAssetRegistry } from './VehicleAssetRegistry';
import { buildVehicleExterior } from './VehicleExterior';
import { buildTeslaModel3Exterior } from './TeslaModel3Exterior';
import { buildSU7MaxExterior, buildSU7MaxWheels } from './SU7MaxExterior';
import { buildBMW530Exterior } from './BMW530Exterior';
import { buildMercedesE300LExterior } from './MercedesE300LExterior';
import { buildTeslaModel3Wheels } from './TeslaModel3Wheels';
import { buildBMW530Wheels } from './BMW530Wheels';
import { buildMercedesE300LWheels } from './MercedesE300LWheels';
import { buildExecutiveWheels } from './ExecutiveWheels';
import { buildGolfGTIWheels } from './GolfGTIWheels';
import { exteriorShapeProfile } from './ExteriorShapeProfiles';
import { buildRefinedWheels } from './RefinedVehicleExterior';
import { fitExteriorOverhangs } from './ExteriorEnvelope';
export function buildVehicleStaticExterior(root: THREE.Group, config: VehicleVisualConfig, assets?: VehicleAssetRegistry): void {
  if (config.body.design === 'tank-500') buildTank500Exterior(root, config);
  else if (config.body.design === 'maybach-z223') buildMaybachS680Exterior(root, config);
  else if (config.body.design === 'jesko-attack') buildJeskoAttackExterior(root, config);
  else if (config.body.exterior === 'xiaomi-su7') buildSU7MaxExterior(root, config);
  else if (config.body.exterior === 'tesla-model-3') buildTeslaModel3Exterior(root, config);
  else if (config.body.design === 'bmw-g38') buildBMW530Exterior(root, config);
  else if (config.body.design === 'mercedes-v214') buildMercedesE300LExterior(root, config);
  else buildVehicleExterior(root, config, assets);
  // OEM bumper datums where available; unverified overhangs keep the declared
  // symmetric game envelope. Wheel centres are not part of this operation.
  if (config.body.exterior === 'tesla-model-3') fitExteriorOverhangs(root, config, .868, .977);
  else if (config.body.design === 'golf-gti') fitExteriorOverhangs(root, config, .869, .768);
  else if (config.body.design === 'bmw-g38' || config.body.design === 'mercedes-v214') {
    const overhang = (config.dimensions.length - config.wheelBase) / 2;
    fitExteriorOverhangs(root, config, overhang, overhang);
  }
}
export function prepareVehicleExterior(config: VehicleVisualConfig, assets: VehicleAssetRegistry): void {
  assets.prepareSection(config, 'exterior', root => buildVehicleStaticExterior(root, config, assets));
}
export function buildVehicleStaticWheels(root: THREE.Group, config: VehicleVisualConfig): { pivots: Record<VehicleWheelId, THREE.Group>; wheels: THREE.Mesh[] } {
    if (config.body.design === 'tank-500') return buildTank500Wheels(root, config);
    if (config.body.design === 'maybach-z223') return buildMaybachS680Wheels(root, config);
    if (config.body.design === 'jesko-attack') return buildJeskoAttackWheels(root, config);
    if (config.body.exterior === 'xiaomi-su7') return buildSU7MaxWheels(root,config);
    const wheelPivots = {} as Record<VehicleWheelId, THREE.Group>, wheelMeshes: THREE.Mesh[] = [];
    if (exteriorShapeProfile(config)) return buildRefinedWheels(root, config);
    if (config.body.exterior === 'tesla-model-3') {
      const { pivots, wheels } = buildTeslaModel3Wheels(root, config);
      Object.assign(wheelPivots, pivots); wheelMeshes.push(...wheels);
      return { pivots, wheels };
    }
    if (config.body.design === 'executive') {
      const fascia = root.getObjectByName('Executive single-frame textured grille and intakes') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
      const { pivots, wheels } = buildExecutiveWheels(root, config, fascia.material.map!);
      Object.assign(wheelPivots, pivots); wheelMeshes.push(...wheels);
      return { pivots, wheels };
    }
    if (config.body.design === 'golf-gti') {
      const { pivots, wheels } = buildGolfGTIWheels(root, config);
      Object.assign(wheelPivots, pivots); wheelMeshes.push(...wheels);
      return { pivots, wheels };
    }
    if (config.body.design === 'bmw-g38') {
      const grille = root.getObjectByName('Left inset kidney dark backing') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
      const { pivots, wheels } = buildBMW530Wheels(root, config, grille.material.map!);
      Object.assign(wheelPivots, pivots); wheelMeshes.push(...wheels);
      return { pivots, wheels };
    }
    if (config.body.design === 'mercedes-v214') {
      // The wheel faces borrow the already built exterior detail atlas.
      const grille = root.getObjectByName('Traditional grille dark backing') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
      const { pivots, wheels } = buildMercedesE300LWheels(root, config, grille.material.map!);
      Object.assign(wheelPivots, pivots); wheelMeshes.push(...wheels);
      return { pivots, wheels };
    }
    const sport = config.body.profile === 'sport-coupe';
    const design = config.body.design;
    const rimFraction = design === 'road-suv' ? .64 : design === 'flow' ? .65 : design === 'formal' ? .61 : design === 'comfort' ? .58 : sport ? .64 : .59;
    const tyreMaterial = new THREE.MeshStandardMaterial({
      color: 0x111214,
      roughness: 0.88,
      metalness: 0.02,
    });
    const rimMaterial = new THREE.MeshStandardMaterial({
      color: sport ? 0x565d64 : 0x9da4a8,
      roughness: sport ? 0.24 : 0.31,
      metalness: 0.78,
    });
    const brakeMaterial = new THREE.MeshStandardMaterial({
      color: 0x5f6264,
      roughness: 0.48,
      metalness: 0.66,
    });
    const tyreGeometry = new THREE.CylinderGeometry(
      config.wheelRadius,
      config.wheelRadius,
      config.dimensions.wheelWidth,
      24,
    );
    tyreGeometry.rotateZ(Math.PI / 2);
    const rimGeometry = new THREE.CylinderGeometry(
      config.wheelRadius * rimFraction,
      config.wheelRadius * rimFraction,
      config.dimensions.wheelWidth * 0.94,
      sport ? 20 : 16,
      1,
      true,
    );
    rimGeometry.rotateZ(Math.PI / 2);
    const brakeDiscGeometry = new THREE.CylinderGeometry(
      config.wheelRadius * 0.43,
      config.wheelRadius * 0.43,
      config.dimensions.wheelWidth * 0.89,
      20,
    );
    brakeDiscGeometry.rotateZ(Math.PI / 2);
    const hubGeometry = new THREE.CylinderGeometry(
      config.wheelRadius * 0.105,
      config.wheelRadius * 0.105,
      config.dimensions.wheelWidth * 0.98,
      12,
    );
    hubGeometry.rotateZ(Math.PI / 2);
    const rimLipGeometry = new THREE.TorusGeometry(
      config.wheelRadius * (rimFraction - .07),
      0.012,
      6,
      sport ? 20 : 16,
    );
    rimLipGeometry.rotateY(Math.PI / 2);
    const spokeGeometry = new THREE.BoxGeometry(
      config.dimensions.wheelWidth * 0.96,
      design === 'comfort' ? .045 : design === 'flow' ? .019 : sport ? .024 : .028,
      config.wheelRadius * (sport ? 0.42 : 0.38),
    );
    spokeGeometry.translate(0, 0, config.wheelRadius * (sport ? 0.27 : 0.25));

    const frontPivots: THREE.Group[] = [];
    const wheelPositions = localWheelPositions(config.dimensions);

    VEHICLE_WHEEL_IDS.forEach((id, index) => {
      const position = wheelPositions[id];
      const pivot = new THREE.Group();
      pivot.name = `${id} ${index < 2 ? 'steering pivot' : 'suspension mount'}`;
      pivot.userData.wheelId = id;
      pivot.position.set(position.x, position.y - (config.staticBodyOffsetY ?? 0), position.z);
      wheelPivots[id] = pivot;

      const wheel = new THREE.Mesh(tyreGeometry, tyreMaterial);
      wheel.name = 'Tyre';
      const width = index < 2 ? config.dimensions.frontWheelWidth : config.dimensions.rearWheelWidth;
      wheel.scale.x = (width ?? config.dimensions.wheelWidth) / config.dimensions.wheelWidth;
      wheel.castShadow = true;
      wheel.receiveShadow = true;
      const rim = new THREE.Mesh(rimGeometry, rimMaterial);
      rim.name = sport ? 'Sports open wheel rim barrel' : 'Sedan open wheel rim barrel';
      const brakeDisc = new THREE.Mesh(brakeDiscGeometry, brakeMaterial);
      brakeDisc.name = 'Ventilated brake disc';
      const hub = new THREE.Mesh(hubGeometry, rimMaterial);
      hub.name = 'Wheel hub';
      wheel.add(brakeDisc, rim, hub);

      const lipOffset = config.dimensions.wheelWidth * 0.47;
      for (const faceX of [-lipOffset, lipOffset]) {
        const lip = new THREE.Mesh(rimLipGeometry, rimMaterial);
        lip.name = 'Wheel rim lip';
        lip.position.x = faceX;
        wheel.add(lip);
      }

      const spokeCount = design === 'flow' ? 10 : design === 'formal' ? 5 : design === 'comfort' ? 7 : sport ? 5 : 6;
      for (let spokeIndex = 0; spokeIndex < spokeCount; spokeIndex += 1) {
        const spoke = new THREE.Mesh(spokeGeometry, rimMaterial);
        spoke.name = sport ? 'Sports wheel spoke' : 'Sedan wheel spoke';
        spoke.rotation.x = design === 'flow'
          ? Math.floor(spokeIndex / 2) / 5 * Math.PI * 2 + (spokeIndex % 2 === 0 ? -.08 : .08)
          : spokeIndex / spokeCount * Math.PI * 2;
        wheel.add(spoke);
      }
      pivot.add(wheel);
      root.add(pivot);
      wheelMeshes.push(wheel);

      if (index < 2) frontPivots.push(pivot);
    });

    return { pivots: wheelPivots, wheels: wheelMeshes };
  }

