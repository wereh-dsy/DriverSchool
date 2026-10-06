import * as THREE from 'three';

import {
  InstrumentCluster,
  type InstrumentTelemetry,
} from './InstrumentCluster';
import type { VehicleVisualConfig, Vector3Tuple } from './VehicleVisualConfig';

const setPosition = (object: THREE.Object3D, value: Vector3Tuple): void => {
  object.position.set(value[0], value[1], value[2]);
};

const makeBox = (
  name: string,
  size: Vector3Tuple,
  position: Vector3Tuple,
  material: THREE.Material,
): THREE.Mesh<THREE.BoxGeometry, THREE.Material> => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.name = name;
  setPosition(mesh, position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

/**
 * Programmatic cockpit shell.  Geometry remains intentionally inexpensive,
 * but is assembled as real layered parts rather than a single interior box.
 */
export class Cockpit extends THREE.Group {
  public readonly steeringWheelRotationGroup = new THREE.Group();
  public readonly steeringWheelBase = new THREE.Group();
  public readonly gearLever = new THREE.Group();
  public readonly instrumentCluster: InstrumentCluster;

  private readonly steeringWheelLockRadians: number;

  public constructor(public readonly config: VehicleVisualConfig) {
    super();
    this.name = 'Cockpit';
    this.steeringWheelLockRadians = THREE.MathUtils.degToRad(config.steeringWheelLockDegrees);

    const interior = new THREE.MeshStandardMaterial({
      color: config.body.interiorColor,
      roughness: 0.86,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x0b0d10,
      roughness: 0.74,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    const softTrim = new THREE.MeshStandardMaterial({
      color: 0x34383d,
      roughness: 0.94,
      side: THREE.DoubleSide,
    });
    const satin = new THREE.MeshStandardMaterial({
      color: 0x858b90,
      roughness: 0.36,
      metalness: 0.52,
    });
    const headliner = new THREE.MeshStandardMaterial({
      color: 0x8f918d,
      roughness: 1,
      metalness: 0,
      emissive: 0x171817,
      emissiveIntensity: 0.32,
      side: THREE.DoubleSide,
    });

    this.addDashboard(config, interior, dark, softTrim);
    this.instrumentCluster = this.addInstrumentCluster(config);
    this.addSteeringAssembly(config, dark, satin);
    this.addCentreConsole(config, interior, dark, satin);
    this.addDriverDoor(config, interior, softTrim, satin);
    this.addWindshieldFrame(config, dark, headliner);
  }

  /** Positive input means steer right; the wheel turns clockwise for the driver. */
  public setSteeringInput(normalizedInput: number): void {
    const input = THREE.MathUtils.clamp(normalizedInput, -1, 1);
    this.setSteeringWheelAngle(-input * this.steeringWheelLockRadians * 0.5);
  }

  /** Positive local angle is counter-clockwise as viewed from the driver. */
  public setSteeringWheelAngle(angleRadians: number): void {
    this.steeringWheelRotationGroup.rotation.z = Number.isFinite(angleRadians)
      ? angleRadians
      : 0;
  }

  /** Alias used by game loops that update normalized steering every frame. */
  public updateSteering(normalizedInput: number): void {
    this.setSteeringInput(normalizedInput);
  }

  /** Updates every cockpit instrument from one render-facing state object. */
  public updateInstruments(telemetry: InstrumentTelemetry, deltaTime = 1 / 60): void {
    this.instrumentCluster.update(telemetry, deltaTime);
  }

  private addDashboard(
    config: VehicleVisualConfig,
    interior: THREE.Material,
    dark: THREE.Material,
    softTrim: THREE.Material,
  ): void {
    const width = config.dashboard.dimensions[0];
    const dashboardTop = config.cabin.dashboardTopY;

    // Leave a real opening around the driver's binnacle. A single dashboard
    // box intersects the cluster face and hides its lower half even when the
    // camera is aimed correctly.
    const apertureLeft = config.instrumentClusterTransform.position[0] - 0.3;
    const apertureRight = config.instrumentClusterTransform.position[0] + 0.3;
    const addSplitSurface = (
      name: string,
      fullWidth: number,
      height: number,
      depth: number,
      y: number,
      z: number,
      material: THREE.Material,
      tiltRadians: number,
    ): void => {
      const leftEdge = -fullWidth / 2;
      const rightEdge = fullWidth / 2;
      const sections = [
        [leftEdge, Math.max(leftEdge, apertureLeft)],
        [Math.min(rightEdge, apertureRight), rightEdge],
      ] as const;
      for (const [sectionLeft, sectionRight] of sections) {
        const sectionWidth = sectionRight - sectionLeft;
        if (sectionWidth <= 0.015) continue;
        const section = makeBox(
          name,
          [sectionWidth, height, depth],
          [(sectionLeft + sectionRight) / 2, y, z],
          material,
        );
        section.rotation.x = tiltRadians;
        this.add(section);
      }
    };

    addSplitSurface(
      'Dashboard upper shelf',
      width,
      config.dashboard.dimensions[1],
      config.dashboard.dimensions[2],
      config.dashboard.position[1],
      config.dashboard.position[2],
      softTrim,
      config.dashboard.tiltRadians,
    );

    addSplitSurface(
      'Dashboard leading brow',
      width - 0.06,
      0.05,
      0.075,
      dashboardTop - 0.055,
      -0.38,
      interior,
      THREE.MathUtils.degToRad(-10),
    );

    const lower = makeBox(
      'Dashboard lower fascia',
      [width - 0.08, 0.26, 0.11],
      [0, dashboardTop - 0.2, -0.48],
      interior,
    );
    lower.rotation.x = THREE.MathUtils.degToRad(4);
    this.add(lower);

    const passengerAccent = makeBox(
      'Passenger dashboard accent',
      [0.62, 0.018, 0.018],
      [0.42, dashboardTop - 0.12, -0.41],
      dark,
    );
    this.add(passengerAccent);

    const demister = makeBox(
      'Demister vent',
      [0.92, 0.012, 0.055],
      [0.08, dashboardTop + 0.013, -0.67],
      dark,
    );
    demister.rotation.x = THREE.MathUtils.degToRad(-5);
    this.add(demister);
  }

  private addInstrumentCluster(config: VehicleVisualConfig): InstrumentCluster {
    const cluster = new InstrumentCluster(config.instrumentCluster);
    // Keep the complete dial sweep inside the lower edge of the driver's FOV
    // and aim the face toward the driver's eyes.
    setPosition(cluster, config.instrumentClusterTransform.position);
    cluster.rotation.set(...config.instrumentClusterTransform.rotation);
    cluster.scale.setScalar(config.instrumentClusterTransform.scale ?? 1);
    this.add(cluster);
    return cluster;
  }

  private addSteeringAssembly(
    config: VehicleVisualConfig,
    dark: THREE.Material,
    satin: THREE.Material,
  ): void {
    this.steeringWheelBase.name = 'Steering assembly';
    setPosition(this.steeringWheelBase, config.steeringWheelPosition);
    this.steeringWheelBase.rotation.set(...config.steeringWheelRotation);

    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.047, 0.28, 14), dark);
    column.name = 'Steering column';
    column.rotation.x = Math.PI / 2;
    column.position.z = -0.145;
    column.castShadow = true;
    this.steeringWheelBase.add(column);

    const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.052, 0.13, 16), dark);
    shroud.name = 'Steering column shroud';
    shroud.rotation.x = Math.PI / 2;
    shroud.position.z = -0.07;
    this.steeringWheelBase.add(shroud);

    this.steeringWheelRotationGroup.name = 'Animated steering wheel';
    const ring = new THREE.Mesh(
      // 32 mm grip diameter is ordinary for a road car and leaves a little
      // more visual air around the dials without shrinking the wheel itself.
      new THREE.TorusGeometry(
        config.steeringWheelRadius,
        config.steeringWheelRimTubeRadius,
        10,
        48,
      ),
      dark,
    );
    ring.name = 'Steering wheel rim';
    ring.castShadow = true;
    this.steeringWheelRotationGroup.add(ring);

    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.07, 0.04, 20), dark);
    hub.name = 'Steering wheel hub';
    hub.rotation.x = Math.PI / 2;
    hub.position.z = 0.015;
    this.steeringWheelRotationGroup.add(hub);

    const lowerSpoke = makeBox('Steering wheel lower spoke', [0.038, 0.118, 0.025], [0, -0.069, 0], satin);
    const leftSpoke = makeBox('Steering wheel left spoke', [0.14, 0.027, 0.024], [-0.095, -0.028, 0], satin);
    leftSpoke.rotation.z = THREE.MathUtils.degToRad(18);
    const rightSpoke = makeBox('Steering wheel right spoke', [0.14, 0.027, 0.024], [0.095, -0.028, 0], satin);
    rightSpoke.rotation.z = THREE.MathUtils.degToRad(-18);
    this.steeringWheelRotationGroup.add(lowerSpoke, leftSpoke, rightSpoke);

    this.steeringWheelBase.add(this.steeringWheelRotationGroup);
    this.add(this.steeringWheelBase);
  }

  private addCentreConsole(
    config: VehicleVisualConfig,
    interior: THREE.Material,
    dark: THREE.Material,
    satin: THREE.Material,
  ): void {
    const stack = makeBox('Centre stack', [0.34, 0.49, 0.14], [0.13, 0.65, -0.4], interior);
    stack.rotation.x = THREE.MathUtils.degToRad(-5);
    this.add(stack);

    const display = makeBox('Infotainment display', [0.25, 0.13, 0.012], [0.13, 0.78, -0.321], dark);
    display.rotation.x = THREE.MathUtils.degToRad(-5);
    this.add(display);

    for (const x of [0.075, 0.185]) {
      const vent = makeBox('Centre air vent', [0.085, 0.055, 0.014], [x, 0.875, -0.327], dark);
      vent.rotation.x = THREE.MathUtils.degToRad(-5);
      this.add(vent);
    }

    const tunnel = makeBox('Transmission tunnel', [0.36, 0.21, 1.18], [0.12, 0.32, 0.29], interior);
    tunnel.rotation.x = THREE.MathUtils.degToRad(-2);
    this.add(tunnel);

    const consoleTop = makeBox('Centre console top', [0.31, 0.055, 0.72], [0.12, 0.445, 0.28], dark);
    this.add(consoleTop);

    this.gearLever.name = 'Gear lever';
    setPosition(this.gearLever, config.gearLeverPosition);
    this.gearLever.rotation.set(...config.gearLeverRotation);

    const boot = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.085, 16), dark);
    boot.name = 'Gear lever gaiter';
    boot.position.y = 0.025;
    this.gearLever.add(boot);

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.14, 10), satin);
    shaft.name = 'Gear lever shaft';
    shaft.position.y = 0.1;
    this.gearLever.add(shaft);

    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 10), dark);
    knob.name = 'Gear knob';
    knob.scale.set(0.9, 1.15, 0.95);
    knob.position.y = 0.185;
    this.gearLever.add(knob);
    this.add(this.gearLever);
  }

  private addDriverDoor(
    config: VehicleVisualConfig,
    interior: THREE.Material,
    softTrim: THREE.Material,
    satin: THREE.Material,
  ): void {
    const leftX = -config.cabin.width / 2 - 0.025;
    const upperRail = makeBox('Left door upper rail', [0.09, 0.11, 1.36], [leftX, 0.82, 0.25], softTrim);
    upperRail.rotation.x = THREE.MathUtils.degToRad(-1.5);
    this.add(upperRail);

    const doorCard = makeBox('Left door card', [0.065, 0.48, 1.35], [leftX + 0.015, 0.55, 0.27], interior);
    this.add(doorCard);

    const armRest = makeBox('Left door armrest', [0.14, 0.07, 0.54], [leftX + 0.08, 0.61, 0.27], softTrim);
    this.add(armRest);

    const handle = makeBox('Left door handle', [0.025, 0.045, 0.2], [leftX + 0.06, 0.7, -0.01], satin);
    this.add(handle);
  }

  private addWindshieldFrame(
    config: VehicleVisualConfig,
    dark: THREE.Material,
    headlinerMaterial: THREE.Material,
  ): void {
    const bottomY = config.cabin.windshieldBottomY;
    const topY = config.cabin.windshieldTopY;
    const bottomZ = config.cabin.windshieldBottomZ;
    const topZ = config.cabin.windshieldTopZ;
    const deltaY = topY - bottomY;
    const deltaZ = topZ - bottomZ;
    const glassHeight = Math.hypot(deltaY, deltaZ);
    const tilt = Math.atan2(deltaZ, deltaY);
    const frameWidth = config.cabin.width + 0.02;

    const frame = new THREE.Group();
    frame.name = 'Windshield and A-pillars';
    frame.position.set(0, (bottomY + topY) / 2, (bottomZ + topZ) / 2);
    frame.rotation.x = tilt;

    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xa8d5df,
      transparent: true,
      opacity: 0.085,
      roughness: 0.06,
      metalness: 0,
      transmission: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(frameWidth - 0.13, glassHeight - 0.07), glassMaterial);
    glass.name = 'Front windshield glass';
    glass.renderOrder = 2;
    frame.add(glass);

    const pillarLength = glassHeight + 0.12;
    const leftPillar = makeBox('Left A-pillar', [0.07, pillarLength, 0.065], [-frameWidth / 2, 0, 0.005], dark);
    leftPillar.rotation.z = THREE.MathUtils.degToRad(-4);
    const rightPillar = makeBox('Right A-pillar', [0.07, pillarLength, 0.065], [frameWidth / 2, 0, 0.005], dark);
    rightPillar.rotation.z = THREE.MathUtils.degToRad(4);
    const topRail = makeBox('Windshield header', [frameWidth + 0.03, 0.075, 0.07], [0, glassHeight / 2, 0.005], dark);
    // Keep the lower seal visible without turning it into a thick horizontal
    // bar across the driver's road view. It sits mostly below the glass edge,
    // as a real bonded windscreen frame does.
    const lowerRail = makeBox(
      'Windshield lower frame',
      [frameWidth + 0.02, 0.045, 0.05],
      [0, -glassHeight / 2 - 0.012, 0.005],
      dark,
    );
    frame.add(leftPillar, rightPillar, topRail, lowerRail);
    this.add(frame);

    const headliner = makeBox(
      'Cabin headliner',
      [config.cabin.width - 0.13, 0.028, 1.34],
      [0, config.cabin.roofY - 0.048, 0.3],
      headlinerMaterial,
    );
    this.add(headliner);
  }
}
