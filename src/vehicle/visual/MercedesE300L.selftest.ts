import * as T from 'three';
import { createVehiclePhysicsConfig, getNextVehicleId, getVehicleDescriptor, isVehicleId } from '../VehicleCatalog';
import { localWheelPositions, VEHICLE_WHEEL_IDS } from '../VehicleDimensions';
import { validateVehiclePlatformConfig } from '../config/validateVehiclePlatformConfig';
import { VehicleVisual } from './VehicleVisual';
import { VehicleLighting } from './VehicleLighting';
import { VehicleLightingController } from '../control/VehicleLightingController';
import { VehicleDynamics } from '../physics/VehicleDynamics';
import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import { computePlanarMirrorView, createPlanarMirrorViewComputation } from '../../camera/MirrorMath';
import { MERCEDES_CABIN_CLOSURE_RAYS } from './MercedesE300LCabin';

/**
 * Acceptance checks for the E 300 L only: catalog registration, powertrain
 * topology, the 9AT, cockpit/display construction, lighting and basic pace.
 */
export function runMercedesE300LSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string): void => {
    assertions++;
    if (!ok) throw new Error('Mercedes-Benz E 300 L: ' + message);
  };
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const canvases: { texts: string[]; width: number; height: number }[] = [];
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => {
    const texts: string[] = [];
    const context = new Proxy<Record<string, unknown>>({}, {
      get(target, key: string) {
        if (key in target) return target[key];
        if (key === 'fillText') return (value: string) => texts.push(value);
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => undefined });
        if (key === 'measureText') return (value: string) => ({ width: value.length * 11 });
        return (...args: unknown[]) => assert(args.every(v => typeof v !== 'number' || Number.isFinite(v)),
          'finite canvas ' + key);
      },
      set(target, key: string, value) { target[key] = value; return true; },
    });
    const canvas = { texts, width: 0, height: 0, getContext: () => context };
    canvases.push(canvas); return canvas;
  } } });

  let visual: VehicleVisual | undefined, lights: VehicleLighting | undefined;
  try {
    const descriptor = getVehicleDescriptor('mercedes-e300l-v214');
    const physics = createVehiclePhysicsConfig('mercedes-e300l-v214');
    const config = descriptor.visualConfig;
    validateVehiclePlatformConfig(physics, config);
    assert(isVehicleId(descriptor.id) && getNextVehicleId('volkswagen-golf-gti') === descriptor.id,
      'catalog registration and cycle order');
    assert(physics.length === 5.092 && physics.width === 1.880 && physics.height === 1.493 &&
      physics.wheelBase === 3.094, 'shared V214 dimensions');
    assert(physics.frontTrackWidth === 1.622 && physics.rearTrackWidth === 1.604,
      'distinct front/rear track widths');
    assert(config.collisionDimensions.length === config.dimensions.length &&
      config.collisionDimensions.width === config.dimensions.width &&
      config.collisionDimensions.height === config.dimensions.height &&
      config.dimensions.wheelBase === physics.wheelBase &&
      config.dimensions.frontTrackWidth === physics.frontTrackWidth &&
      config.dimensions.rearTrackWidth === physics.rearTrackWidth,
      'one geometry datum for body, collision, wheels and cockpit');
    assert(config.dimensions.frontWheelWidth === .245 && config.dimensions.rearWheelWidth === .275,
      'wider rear tyre section');
    assert(physics.mass === 1950 && physics.frontWeightBias === .52 && physics.yawInertia > 4000,
      'executive mass and polar inertia');
    assert(physics.drivetrainType === 'RWD' && physics.drivetrainLayout === 'RWD' &&
      physics.frontTorqueSplit === 0 && physics.rearTorqueSplit === 1 && physics.awd === undefined,
      'front-engine rear-wheel drive with no front drive torque');
    assert(physics.engine.displacementL === 2 && physics.engine.cylinderCount === 4 &&
      physics.engine.turbo?.enabled === true, '2.0T inline four');
    const peakTorque = Math.max(...physics.engine.torqueCurve.map(point => point.torque));
    const peakPowerKW = Math.max(...physics.engine.torqueCurve.map(point =>
      point.torque * point.rpm * Math.PI / 30000));
    assert(peakTorque === 400 && peakPowerKW > 182 && peakPowerKW < 196,
      `190 kW / 400 Nm class curve (${peakPowerKW.toFixed(1)} kW)`);
    assert(!('battery' in physics) && !('driveUnits' in physics),
      'no simulated 48 V battery, ISG or electric drive unit');
    assert(Object.keys(physics.transmission.gearRatios).length === 9 &&
      physics.transmission.type === 'TORQUE_CONVERTER_AT', 'nine physical automatic ratios');
    const gearbox = new VehicleDynamics(createVehiclePhysicsConfig(descriptor.id)).gearbox;
    assert(gearbox.getMaximumForwardGear() === 9 && gearbox.getForwardGears().length === 9,
      'shared gearbox exposes all nine steps');
    assert(physics.suspension.kinematics?.front.topology === 'MULTI_LINK' &&
      physics.suspension.kinematics.rear.topology === 'MULTI_LINK',
      'multi-link front and rear suspension');
    assert(physics.suspension.adaptiveDamping !== undefined && physics.suspension.airSuspension === undefined,
      'adaptive damping without a new air suspension');
    assert(descriptor.capabilities.electronicParkingBrake && descriptor.capabilities.autoHold &&
      descriptor.capabilities.cruiseControl && descriptor.capabilities.manualSelection &&
      descriptor.capabilities.tpms && descriptor.capabilities.adaptiveDamping,
      'existing runtime functions only');
    assert(descriptor.capabilities.acc === false && descriptor.capabilities.lcc === true,
      'no fabricated ACC; lane centring uses the existing controller');
    assert(physics.driveModes!.ECO!.shiftStrategy!.map![1]!.upshiftRPM! <
      physics.driveModes!.NORMAL!.shiftStrategy!.map![1]!.upshiftRPM! &&
      physics.driveModes!.NORMAL!.shiftStrategy!.map![1]!.upshiftRPM! <
      physics.driveModes!.SPORT!.shiftStrategy!.map![1]!.upshiftRPM!, 'drive-mode shift ordering');
    assert(physics.driveModeOrder === undefined &&
      Object.keys(physics.driveModes!).sort().join() === 'ECO,NORMAL,SPORT', 'existing three drive modes only');
    physics.engine.torqueCurve[0]!.torque = 1;
    assert(createVehiclePhysicsConfig(descriptor.id).engine.torqueCurve[0]!.torque !== 1,
      'spawn config does not share mutable state');

    // Front wheels must never receive drive torque; the rear axle does.
    const neutral = createNeutralVehicleInputState();
    const drive = new VehicleDynamics(createVehiclePhysicsConfig(descriptor.id),
      { gear: 1, driveSelector: 'D' });
    let driven = drive.getSnapshot();
    for (let i = 0; i < 240; i++) driven = drive.stepFixed(1 / 120, { ...neutral, throttle: .6 });
    assert(driven.wheels.frontLeft.driveTorque === 0 && driven.wheels.frontRight.driveTorque === 0,
      'front axle carries no drive torque');
    assert(Math.abs(driven.wheels.rearLeft.driveTorque) + Math.abs(driven.wheels.rearRight.driveTorque) > 100,
      'rear axle is driven');
    // 60 % pedal for two seconds: a real launch, ahead of the 530Li in the same test.
    assert(driven.speed > 2.4, 'part-throttle launch actually moves the car');
    assert(driven.speed > 2.4 && driven.transmission.type === 'TORQUE_CONVERTER_AT',
      'torque-converter automatic propels the car');
    // 100 km/h must sit at a tall-gear cruise speed, not 3000 rpm.
    const ninth = physics.transmission.gearRatios[9]! * physics.transmission.finalDriveRatio;
    const hundredAtNinth = 100 / 3.6 / physics.wheelRadius * ninth * 60 / (2 * Math.PI);
    assert(hundredAtNinth > 1200 && hundredAtNinth < 1900, '100 km/h in ninth sits at 1200-1900 rpm');

    // Drive-mode cycle keeps working through the shared API.
    const cycler = new VehicleDynamics(createVehiclePhysicsConfig(descriptor.id));
    const seen = new Set<string>();
    for (let i = 0; i < 3; i++) { cycler.cycleDriveMode(); seen.add(cycler.getSnapshot().driveMode!); }
    assert(seen.size === 3 && cycler.getSnapshot().driveMode === 'NORMAL', 'three modes cycle back to NORMAL');

    visual = new VehicleVisual(config);
    lights = new VehicleLighting(visual);
    visual.root.updateMatrixWorld(true);
    const bounds = visual.getVisualBodyBounds(), size = bounds.getSize(new T.Vector3());
    assert(size.x < config.dimensions.width + .025 && size.z < config.dimensions.length + .03 &&
      bounds.max.y < config.dimensions.height + .006,
      `body inside its authored envelope: ${size.toArray().join(',')} top=${bounds.max.y}`);
    const anchors = localWheelPositions(config.dimensions);
    for (const id of VEHICLE_WHEEL_IDS) {
      const anchor = anchors[id], pivot = visual.wheelPivots[id];
      assert(pivot.position.distanceTo(new T.Vector3(anchor.x, anchor.y - (config.staticBodyOffsetY ?? 0),
        anchor.z)) < 1e-10, id + ' visual wheel uses the shared anchor');
      const tyre = pivot.children[0] as T.Mesh;
      tyre.geometry.computeBoundingBox();
      const front = id === 'frontLeft' || id === 'frontRight';
      const width = tyre.geometry.boundingBox!.getSize(new T.Vector3()).x;
      assert(Math.abs(width - (front ? .245 : .275)) < 1e-6, id + ' tyre width matches its axle');
    }
    const required = ['Traditional chrome grille frame', 'Bonnet standing star', 'Standing star emblem',
      'Grille star emblem', 'Boot lid star emblem', 'Left tail star light guide 0', 'Right tail star light guide 2',
      'Crowned long bonnet', 'Panoramic glass roof panel', 'Tapered acoustic windshield', 'Sloping rear screen',
      'Mercedes continuous folded dashboard', 'Mercedes MBUX Superscreen assembly',
      'Mercedes 14.4 inch centre touchscreen', 'Mercedes 12.3 inch passenger display',
      'Mercedes-Benz digital instrument panel',
      'Driver shaped leather seat back', 'Rear continuous three-seat back', 'Rear Centre comfort headrest',
      'Rear Left comfort headrest', 'Rear Right comfort headrest', 'Rear upholstered parcel shelf',
      'Mercedes complete curved headliner', 'Mercedes overhead console', 'Mercedes centre mirror housing',
      'Mercedes column gear selector', 'Mercedes leather steering rim', 'Mercedes tapered lower steering spoke',
      'Left front Burmester speaker grille', 'Left long rear Burmester speaker grille', 'Mercedes Brake pedal',
      // Reference-cabin furniture: layered fascia, vent slot, climate keys, vents.
      'Mercedes light leather instrument band', 'Mercedes open-pore veneer strip',
      'Mercedes full width vent slot', 'Mercedes climate control key row',
      'Left turbine dash vent', 'Right turbine dash vent', 'Mercedes piano console deck',
      'Left front seat switch panel', 'Right front seat switch panel'];
    for (const name of required) assert(visual.root.getObjectByName(name) !== undefined, 'component exists: ' + name);
    assert(!visual.root.getObjectByName('Simplified cabin seats') && !visual.root.getObjectByName('Gear lever shaft'),
      'independent full cabin instead of the generic shell');
    let vertices = 0, meshes = 0;
    const materials = new Set<T.Material>();
    visual.root.traverse(object => {
      if (!(object instanceof T.Mesh)) return;
      meshes++;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      const points = object.geometry.getAttribute('position');
      if (points) {
        vertices += points.count;
        for (let i = 0; i < points.count; i++) assert(Number.isFinite(points.getX(i)) &&
          Number.isFinite(points.getY(i)) && Number.isFinite(points.getZ(i)), 'finite vertex in ' + object.name);
      }
    });
    assert(materials.size < 90 && meshes < 520 && meshes > 60,
      `bounded budget: ${materials.size} materials, ${meshes} meshes`);

    const ray = new T.Raycaster(); ray.layers.enableAll();
    const doorInterior = visual.interactionDefinition?.driverDoor.doorNode.children
      .filter(object => object.userData.vehicleInteractionInterior === true) ?? [];
    for (const direction of MERCEDES_CABIN_CLOSURE_RAYS) {
      ray.set(new T.Vector3(...config.driverEyePosition), new T.Vector3(...direction).normalize());
      const hits = [
        ...ray.intersectObjects(visual.cockpitRoot.children, true),
        ...ray.intersectObjects(doorInterior, true),
      ];
      const hit = hits.find(entry =>
        entry.object instanceof T.Mesh && !((entry.object as T.Mesh).material instanceof T.MeshBasicMaterial));
      assert(!!hit && hit.distance < 3, 'closed interior ray ' + direction.join(','));
    }
    for (const side of ['left', 'right'] as const) {
      const mirror = visual.getMirrorWorldTransform(side);
      const view = computePlanarMirrorView({ eye: new T.Vector3(...config.driverEyePosition),
        center: mirror.position, right: new T.Vector3(1, 0, 0).applyQuaternion(mirror.quaternion),
        up: new T.Vector3(0, 1, 0).applyQuaternion(mirror.quaternion), normal: mirror.normal,
        size: mirror.size, near: .05, far: 100 }, createPlanarMirrorViewComputation());
      assert(view.valid, side + ' exterior mirror uses the real planar aperture');
    }
    assert(visual.centerMirrorSurface !== null, 'interior mirror keeps its real reflective plane');

    const controller = new VehicleLightingController();
    controller.setMainLightMode('high');
    const state = controller.update(0, { ...neutral, hazard: true, brake: .5 },
      { ignitionOn: true, actualGear: 'R', steeringWheelAngle: 0 });
    lights.applyState(state, true);
    for (const key of ['head', 'position', 'tail', 'brake', 'reverse', 'left', 'right']) {
      const modules: T.Mesh[] = [];
      visual.exteriorRoot.traverse(object => {
        if (object instanceof T.Mesh && object.userData.lightingOutput === key) modules.push(object);
      });
      assert(modules.length > 0 && modules.every(module =>
        (module.material as T.MeshStandardMaterial).emissiveIntensity > 0), 'lighting output ' + key);
    }
    controller.update(.6, neutral, { ignitionOn: true, actualGear: 'N', steeringWheelAngle: 0 });
    lights.applyState(controller.state, true);
    const stars = visual.root.getObjectByName('Left tail star light guide 0') as T.Mesh;
    assert(stars.userData.lightingOutput === 'tail' &&
      (stars.material as T.MeshStandardMaterial).emissiveIntensity > 0,
      'star tail motif is driven by the shared tail-lamp output');
    const repeater = visual.root.getObjectByName('left mirror amber repeater') as T.Mesh;
    assert(repeater.parent?.name === 'left mirror assembly' &&
      (repeater.material as T.MeshStandardMaterial).emissiveIntensity === 0, 'mirror repeater stays in its housing');

    // Instrument telemetry is live, never a fixed picture.
    visual.updateInstruments({ ignitionOn: true, engineRunning: true, speedKmh: 96, rpm: 2320, gear: 'D7',
      driveMode: 'SPORT', fuelLevel: .43, coolantTemperatureC: 94, cruiseTargetSpeedKmh: 110,
      ambientDaylight: .03, indicators: { headlights: true, cruise: true, autoHold: true, leftTurn: true } }, 1);
    const faceTexts = new Set(canvases.filter(canvas => canvas.width === 1080 && canvas.height === 604)
      .flatMap(canvas => canvas.texts));
    assert(faceTexts.has('96') && faceTexts.has('7') && faceTexts.has('SPORT') &&
      faceTexts.has('43 %') && faceTexts.has('94 °C'),
      'instrument face renders live speed, gear, mode, fuel and temperature');
    const centreTexts = new Set(canvases.filter(canvas => canvas.width === 960 && canvas.height === 400)
      .flatMap(canvas => canvas.texts));
    assert(centreTexts.size > 0, 'centre screen draws from shared telemetry');
    visual.cockpitRoot.cycleCenterDisplayPage();
    visual.updateInstruments({ ignitionOn: true, engineRunning: true, speedKmh: 54, rpm: 1500, gear: 'D5',
      driveMode: 'ECO', fuelLevel: .6, ambientDaylight: 1, indicators: {} }, 1);
    assert(visual.cockpitRoot.cycleCenterDisplayPage(), 'centre screen page cycle is owned by the cabin');

    // Straight-line pace through the ordinary powertrain path. The shared
    // simplified chain runs every car slower than its real counterpart, so the
    // band is expressed against the platform rather than the brochure figure.
    const run = new VehicleDynamics(createVehiclePhysicsConfig(descriptor.id), { driveSelector: 'D', gear: 1 });
    let zeroTo100 = 0, snapshot = run.getSnapshot(), topSpeedKmh = 0;
    for (let step = 0; step < 9600; step++) {
      snapshot = run.stepFixed(1 / 120, { ...neutral, throttle: 1 });
      assert(Number.isFinite(snapshot.speed) && Number.isFinite(snapshot.rpm), 'finite 120 Hz powertrain');
      if (!zeroTo100 && snapshot.speed * 3.6 >= 100) zeroTo100 = (step + 1) / 120;
      topSpeedKmh = Math.max(topSpeedKmh, snapshot.speed * 3.6);
    }
    assert(zeroTo100 > 7.2 && zeroTo100 < 8.9, `0-100 km/h in the platform-consistent band (${zeroTo100.toFixed(2)} s)`);
    assert(topSpeedKmh > 235 && topSpeedKmh < 285,
      `top speed reached through normal gearing (${topSpeedKmh.toFixed(0)} km/h)`);
    assert(snapshot.transmission.manualSelectionActive === false && typeof snapshot.gear === 'number',
      'automatic schedule selected the gears itself');
    const selector = new VehicleDynamics(createVehiclePhysicsConfig(descriptor.id), { driveSelector: 'P' });
    for (const mode of ['R', 'N', 'D', 'P'] as const) {
      assert(selector.requestDriveSelector(mode, 1), 'brake-gated ' + mode + ' selector request');
      for (let i = 0; i < 45; i++) selector.stepFixed(1 / 120, { ...neutral, brake: 1 });
      assert(selector.getSnapshot().transmission.selectedMode === mode, 'actual ' + mode + ' selector');
    }
    return { assertions, meshes, vertices, materials: materials.size, zeroTo100Seconds: zeroTo100,
      topSpeedKmh, closureRays: MERCEDES_CABIN_CLOSURE_RAYS.length };
  } finally {
    lights?.dispose(); visual?.dispose();
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
}
