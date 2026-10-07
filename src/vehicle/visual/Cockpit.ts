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
    const design = config.body.design;

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
        if (design === 'comfort' && depth > .1) {
          const shape = new THREE.Shape();
          const w = sectionWidth / 2, d = depth / 2, r = Math.min(.055, w * .25);
          shape.moveTo(-w, -d); shape.lineTo(w, -d); shape.lineTo(w, d-r);
          shape.quadraticCurveTo(w,d,w-r,d); shape.lineTo(-w+r,d);
          shape.quadraticCurveTo(-w,d,-w,d-r); shape.closePath();
          section.geometry.dispose();
          const geometry = new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,steps:1});
          geometry.rotateX(Math.PI/2); geometry.translate(0,height/2,0);
          (section as THREE.Mesh<THREE.BufferGeometry>).geometry = geometry;
        } else if (design === 'flow' && depth > .1) {
          const vertices = section.geometry.getAttribute('position');
          for (let i=0;i<vertices.count;i++) if (vertices.getZ(i)>0) vertices.setX(i,vertices.getX(i)*.94);
          section.geometry.computeVertexNormals();
        }
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
      design === 'flow' ? .035 : design === 'comfort' ? .06 : .05,
      design === 'comfort' ? .09 : .075,
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
      [design === 'formal' ? .70 : .62, design === 'formal' ? .035 : .018, .018],
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

    const columnStart = new THREE.Vector3(0, 0, -.015).applyEuler(this.steeringWheelBase.rotation)
      .add(this.steeringWheelBase.position);
    const columnEnd = new THREE.Vector3(...(config.steeringColumnMountPosition ??
      [config.steeringWheelPosition[0], config.cabin.dashboardTopY - .08, config.dashboard.position[2] + .04]));
    const axis = columnEnd.clone().sub(columnStart);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.042, axis.length(), 12), dark);
    column.name = 'Steering column';
    column.position.copy(columnStart).add(columnEnd).multiplyScalar(.5);
    column.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().normalize());
    column.castShadow = true;
    this.add(column);

    const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.052, 0.13, 16), dark);
    shroud.name = 'Steering column shroud';
    shroud.position.copy(columnStart).addScaledVector(axis.clone().normalize(), .065);
    shroud.quaternion.copy(column.quaternion);
    this.add(shroud);

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
    if (config.body.design === 'formal') {
      const vertices = ring.geometry.getAttribute('position');
      for(let i=0;i<vertices.count;i++) if(vertices.getY(i)<-config.steeringWheelRadius*.86)
        vertices.setY(i,-config.steeringWheelRadius*.86);
      ring.geometry.computeVertexNormals();
    }
    ring.castShadow = true;
    this.steeringWheelRotationGroup.add(ring);

    const hub = new THREE.Mesh<THREE.BufferGeometry>(config.body.design === 'formal'
      ? new THREE.BoxGeometry(.15,.095,.04) : new THREE.CylinderGeometry(0.064, 0.07, 0.04, 20), dark);
    hub.name = 'Steering wheel hub';
    if (config.body.design !== 'formal') hub.rotation.x = Math.PI / 2;
    if (config.body.design === 'comfort') hub.scale.set(1.15,1,1);
    hub.position.z = 0.015;
    this.steeringWheelRotationGroup.add(hub);

    const lowerSpoke = makeBox('Steering wheel lower spoke', [0.038, 0.118, 0.025], [0, -0.069, 0], satin);
    const leftSpoke = makeBox('Steering wheel left spoke', [0.14, 0.027, 0.024], [-0.095, -0.028, 0], satin);
    leftSpoke.rotation.z = THREE.MathUtils.degToRad(18);
    const rightSpoke = makeBox('Steering wheel right spoke', [0.14, 0.027, 0.024], [0.095, -0.028, 0], satin);
    rightSpoke.rotation.z = THREE.MathUtils.degToRad(-18);
    if (config.body.design === 'comfort') {
      for (const sign of [-1,1]) {
        const spoke=makeBox('Comfort lower wheel spoke',[.031,.12,.025],[sign*.065,-.10,0],satin);
        spoke.rotation.z = sign * THREE.MathUtils.degToRad(-32);
        this.steeringWheelRotationGroup.add(spoke);
      }
      lowerSpoke.geometry.dispose();
    } else this.steeringWheelRotationGroup.add(lowerSpoke);
    if (config.body.design === 'flow') {
      leftSpoke.scale.y=.8; rightSpoke.scale.y=.8;
      leftSpoke.rotation.z=THREE.MathUtils.degToRad(9); rightSpoke.rotation.z=-THREE.MathUtils.degToRad(9);
    }
    this.steeringWheelRotationGroup.add(leftSpoke, rightSpoke);

    this.steeringWheelBase.add(this.steeringWheelRotationGroup);
    this.add(this.steeringWheelBase);
  }

  private addCentreConsole(
    config: VehicleVisualConfig,
    interior: THREE.Material,
    dark: THREE.Material,
    satin: THREE.Material,
  ): void {
    const stackTop = config.cabin.dashboardTopY + .055;
    const design = config.body.design;
    const stackWidth = design === 'flow' ? .28 : design === 'comfort' ? .40 : .34;
    const stack = makeBox('Centre stack', [stackWidth, 0.40, 0.12], [0.13, stackTop - .20, -0.43], interior);
    stack.rotation.x = THREE.MathUtils.degToRad(-5);
    this.add(stack);

    const display = makeBox('Infotainment display', [design === 'comfort' ? .29 : .25, design === 'formal' ? .12 : .10, .012],
      [0.13, design === 'flow' ? stackTop + .015 : stackTop - .13, design === 'flow' ? -.45 : -.364], dark);
    display.rotation.x = THREE.MathUtils.degToRad(-5);
    this.add(display);

    for (const x of design === 'comfort' ? [.05,.21] : [0.075, 0.185]) {
      const vent = makeBox('Centre air vent', [design === 'comfort' ? .12 : .085, .038, .014],
        [x, design === 'comfort' ? stackTop - .23 : stackTop - .038, -0.36], dark);
      vent.rotation.x = THREE.MathUtils.degToRad(-5);
      this.add(vent);
    }

    const tunnel = makeBox('Transmission tunnel', [0.36, 0.21, 1.18], [0.12, 0.32, 0.29], interior);
    tunnel.rotation.x = THREE.MathUtils.degToRad(-2);
    this.add(tunnel);

    const consoleTop = makeBox('Centre console top', [design === 'flow' ? .27 : design === 'comfort' ? .34 : .31, 0.055, 0.72], [0.12, 0.445, 0.28], dark);
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
    const beltY = config.cabin.windshieldBottomY;
    const upperRail = makeBox('Left door upper rail', [0.065, 0.065, 1.55], [leftX, beltY - .018, 0.115], softTrim);
    upperRail.rotation.x = THREE.MathUtils.degToRad(-1.5);
    this.add(upperRail);

    const doorCard = makeBox('Left door card', [0.065, 0.48, 1.35], [leftX + 0.015, 0.55, 0.27], interior);
    this.add(doorCard);

    const armRest = makeBox('Left door armrest', [0.14, 0.07, 0.54], [leftX + 0.08, 0.61, 0.27], softTrim);
    this.add(armRest);

    const handle = makeBox('Left door handle', [0.025, 0.045, 0.2], [leftX + 0.06, 0.7, -0.01], satin);
    this.add(handle);
    const rightRail = upperRail.clone(); rightRail.name = 'Right door upper rail'; rightRail.position.x = -leftX;
    const rightCard = doorCard.clone(); rightCard.name = 'Right door card'; rightCard.position.x = -doorCard.position.x;
    const rightArm = armRest.clone(); rightArm.name = 'Right door armrest'; rightArm.position.x = -armRest.position.x;
    this.add(rightRail, rightCard, rightArm);
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

    // Exterior owns the one windshield pane. Interior trim follows precisely
    // the same tapered endpoints instead of overlaying a second wider frame.
    for (const sign of [-1, 1]) {
      const from = new THREE.Vector3(sign * (config.cabin.width / 2 - .038), bottomY, bottomZ + .012);
      const to = new THREE.Vector3(sign * (config.body.roofWidth / 2 - .057), topY, topZ + .012);
      const direction = to.clone().sub(from);
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(.022, .028, direction.length(), 6), dark);
      pillar.name = sign < 0 ? 'Left A-pillar' : 'Right A-pillar';
      pillar.position.copy(from).add(to).multiplyScalar(.5);
      pillar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
      this.add(pillar);
    }
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
    frame.add(topRail, lowerRail);
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
