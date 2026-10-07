import * as THREE from 'three';

import {
  InstrumentCluster,
  INSTRUMENT_CLUSTER_HOUSING_LAYOUT,
  type InstrumentTelemetry,
} from './InstrumentCluster';
import type { VehicleVisualConfig, Vector3Tuple } from './VehicleVisualConfig';
import { frontDoorSkinAnchor, frontWindowAnchors } from './VehicleExterior';
import { fitInstrumentBinnacle, instrumentBinnacleShape } from './InstrumentBinnacle';

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

/** Closed low-poly sections: continuous surfaces without overlapping box slabs. */
const makeSectionShell = (
  name: string,
  sections: readonly { x: number; profile: readonly (readonly [y: number, z: number])[] }[],
  material: THREE.Material,
  axis: 'x' | 'z' = 'x',
): THREE.Mesh => {
  const positions: number[] = [];
  const indices: number[] = [];
  const count = sections[0]!.profile.length;
  for (const section of sections) {
    for (const [y, z] of section.profile) {
      positions.push(...(axis === 'x' ? [section.x, y, z] : [z, y, section.x]));
    }
  }
  for (let section = 0; section < sections.length - 1; section++) {
    const a = section * count, b = a + count;
    for (let i = 0; i < count; i++) {
      const next = (i + 1) % count;
      indices.push(a + i, b + i, b + next, a + i, b + next, a + next);
    }
  }
  const end = (sections.length - 1) * count;
  for (let i = 1; i < count - 1; i++) {
    indices.push(0, i, i + 1, end, end + i + 1, end + i);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
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
  private readonly consoleWidth: number;
  private readonly floorY: number;

  public constructor(public readonly config: VehicleVisualConfig) {
    super();
    this.name = 'Cockpit';
    this.steeringWheelLockRadians = THREE.MathUtils.degToRad(config.steeringWheelLockDegrees);
    this.consoleWidth = config.body.design === 'flow' ? .28 : config.body.design === 'executive' ? .34 : config.body.design === 'comfort' ? .38
      : config.body.profile === 'sport-coupe' ? .30 : .34;
    this.floorY = config.body.sillY - .10;

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

    this.addDashboard(config, interior, dark, softTrim, satin);
    this.instrumentCluster = this.addInstrumentCluster(config);
    this.addSteeringAssembly(config, dark, satin);
    this.addCentreConsole(config, interior, dark, satin);
    this.addFootwells(config, dark);
    this.addDoors(config, interior, softTrim, satin);
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
    satin: THREE.Material,
  ): void {
    const width = config.dashboard.dimensions[0];
    const top = config.cabin.dashboardTopY;
    const rearZ = config.dashboard.position[2] + config.dashboard.dimensions[2] * .5;
    const cowlZ = config.cabin.windshieldBottomZ + .025;
    const design = config.body.design;
    const transform = config.instrumentClusterTransform;
    const scale = transform.scale ?? 1;
    const sport = config.body.profile === 'sport-coupe';
    const shape = instrumentBinnacleShape(config);
    const halfPod = (sport ? INSTRUMENT_CLUSTER_HOUSING_LAYOUT.analogueHoodSize[0] * .5
      : shape.halfWidth + shape.border) * scale + .008;
    const clusterBottom = new THREE.Vector3(0, -(sport ? INSTRUMENT_CLUSTER_HOUSING_LAYOUT.backSize[1] * .5
      : shape.halfHeight + shape.border), -.028)
      .multiplyScalar(scale).applyEuler(new THREE.Euler(...transform.rotation))
      .add(new THREE.Vector3(...transform.position));
    const profile = (mountY: number): readonly (readonly [number, number])[] => [
      [top, cowlZ], [mountY, rearZ - .035], [mountY - .015, rearZ],
      [mountY - .033, rearZ - .012], [mountY - .018, rearZ - .045], [top - .028, cowlZ],
    ];
    // The raised driver section physically supports the cluster; the shoulders
    // descend into the centre/passenger fascia instead of leaving an empty slot.
    const driverX = transform.position[0];
    const sections = sport ? [
      { x: -width * .5, profile: profile(top - .025) },
      { x: driverX - halfPod - .065, profile: profile(top - .025) },
      { x: driverX - halfPod, profile: profile(clusterBottom.y) },
      { x: driverX + halfPod, profile: profile(clusterBottom.y) },
      { x: driverX + halfPod + .065, profile: profile(top - .025) },
      { x: width * .5, profile: profile(top - .025) },
    ] : [
      { x: -width * .5, profile: profile(top - .025) },
      { x: driverX - halfPod - .06, profile: profile(top - .025) },
      { x: driverX - halfPod, profile: profile(THREE.MathUtils.lerp(top - .025, clusterBottom.y, .55)) },
      { x: driverX - halfPod * .72, profile: profile(clusterBottom.y) },
      { x: driverX + halfPod * .72, profile: profile(clusterBottom.y) },
      { x: driverX + halfPod, profile: profile(THREE.MathUtils.lerp(top - .025, clusterBottom.y, .55)) },
      { x: driverX + halfPod + .06, profile: profile(top - .025) },
      { x: width * .5, profile: profile(top - .025) },
    ];
    const upperMaterial = sport ? interior : new THREE.MeshStandardMaterial({
      color: design === 'executive' ? 0x343840 : design === 'comfort' ? 0x45423e : 0x30343a,
      roughness: .90, metalness: .02, side: THREE.DoubleSide,
    });
    this.add(makeSectionShell('Dashboard upper surface', sections, upperMaterial));

    const columnMount = config.steeringColumnMountPosition ??
      [driverX, top - .08, config.dashboard.position[2] + .04];
    const kneeZ = columnMount[2];
    const kneeTopY = THREE.MathUtils.lerp(top, clusterBottom.y,
      THREE.MathUtils.clamp((kneeZ - cowlZ) / (rearZ - .035 - cowlZ), 0, 1)) - .028;
    const kneeBottomY = this.floorY + .29;
    const kneeWidth = halfPod * 2;
    // A thin, forward-set knee panel receives the column at its rear surface.
    // The leg/foot volume behind and below it remains open.
    this.add(makeBox('Dashboard driver knee panel', [kneeWidth, kneeTopY - kneeBottomY, .024],
      [driverX, (kneeTopY + kneeBottomY) * .5, kneeZ - .012], interior));
    const returnProfile = [
      [clusterBottom.y - .033, rearZ - .012], [kneeTopY, kneeZ],
      [kneeTopY - .018, kneeZ], [clusterBottom.y - .051, rearZ - .012],
    ] as const;
    // Leave a real opening around the column/shroud rather than passing a
    // continuous return panel through the steering assembly.
    for (const [left, right] of [[driverX - kneeWidth * .5, driverX - .075],
      [driverX + .075, driverX + kneeWidth * .5]] as const) {
      this.add(makeSectionShell('Dashboard driver lower return', [
        { x: left, profile: returnProfile }, { x: right, profile: returnProfile },
      ], interior));
    }

    const passengerLeft = config.gearLeverPosition[0] + this.consoleWidth * .5;
    const passengerRight = width * .5;
    const passengerWidth = passengerRight - passengerLeft;
    const passengerX = (passengerLeft + passengerRight) * .5;
    const passengerTop = top - .053;
    const passengerBottom = this.floorY + .28;
    this.add(makeBox('Dashboard passenger lower panel', [passengerWidth, passengerTop - passengerBottom, .024],
      [passengerX, (passengerTop + passengerBottom) * .5, rearZ - .015], interior));
    const accent = makeBox('Passenger dashboard accent',
      [Math.min(design === 'formal' ? .62 : .54, passengerWidth - .04), design === 'formal' ? .024 : .012, .008],
      [passengerX, top - .10, rearZ - .004], softTrim);
    this.add(accent);
    const demister = makeBox('Demister vent', [width * .65, .008, .035],
      [0, top + .002, cowlZ + .04], dark);
    this.add(demister);
    if (design === 'executive') {
      const fascia = new THREE.MeshStandardMaterial({ color: 0x474c54, roughness: .66, metalness: .12,
        side: THREE.DoubleSide });
      // The instrument casing supplies the driver-side border. Two adjoining
      // ribbons carry its horizontal layering into the centre and door ends.
      for (const [left, right] of [[-width * .5, driverX - halfPod],
        [driverX + halfPod, width * .5]] as const) {
        const profile = [[top - .017, rearZ - .018], [top - .033, rearZ + .004],
          [top - .083, rearZ + .004], [top - .083, rearZ - .008]] as const;
        this.add(makeSectionShell('Executive layered dashboard fascia',
          [{ x: left, profile }, { x: right, profile }], fascia));
        this.add(makeBox('Executive satin fascia edge', [right - left, .006, .008],
          [(left + right) * .5, top - .075, rearZ + .008], satin));
      }
      this.add(makeBox('Executive passenger horizontal vent', [passengerWidth - .05, .026, .008],
        [passengerX, top - .049, rearZ + .010], dark));
      for (const sign of [-1, 1]) {
        const profile = [[top, cowlZ], [config.cabin.windshieldBottomY - .027, cowlZ + .05],
          [top - .009, rearZ], [top - .027, rearZ],
          [config.cabin.windshieldBottomY - .045, cowlZ + .05], [top - .018, cowlZ]] as const;
        const edge = sign * width * .5;
        this.add(makeSectionShell('Executive dashboard door return',
          [{ x: edge - .008, profile }, { x: edge + .008, profile }], upperMaterial));
      }
    }
  }

  private addInstrumentCluster(config: VehicleVisualConfig): InstrumentCluster {
    const cluster = new InstrumentCluster(config.instrumentCluster);
    if (config.body.profile !== 'sport-coupe') {
      fitInstrumentBinnacle(cluster, config);
    } else {
    const casing = new THREE.MeshStandardMaterial({
      color: config.body.interiorColor, roughness: .86, side: THREE.DoubleSide,
    });
    const halfWidth = INSTRUMENT_CLUSTER_HOUSING_LAYOUT.backSize[0] * .5;
    const halfHeight = INSTRUMENT_CLUSTER_HOUSING_LAYOUT.backSize[1] * .5;
    const isSport = config.instrumentCluster.displayStyle === 'sport-tft';
    const rearDepth = isSport ? .12 : .19;
    const profile = [
      [isSport ? .095 : .11, -.03], [.04, -rearDepth],
      [-halfHeight - .055, -rearDepth], [-halfHeight, -.028],
    ] as const;
    cluster.add(makeSectionShell('Instrument binnacle rear enclosure', [
      { x: -halfWidth, profile }, { x: halfWidth, profile },
    ], casing));
    for (const sign of [-1, 1]) {
      cluster.add(makeBox('Instrument binnacle side wall', [.014, halfHeight * 2, .105],
        [sign * (halfWidth + .007), 0, -.003], casing));
    }
    cluster.add(makeBox('Instrument binnacle lower lip', [halfWidth * 2 + .028, .014, .105],
      [0, -halfHeight - .007, -.003], casing));
    }
    // Artwork, needles and telemetry remain owned by the existing cluster.
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

    const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.056, 0.16, 12), dark);
    shroud.name = 'Steering column shroud';
    shroud.position.copy(columnStart).addScaledVector(axis.clone().normalize(), .105);
    shroud.quaternion.copy(column.quaternion);
    this.add(shroud);

    this.steeringWheelRotationGroup.name = 'Animated steering wheel';
    const executive = config.body.design === 'executive';
    const wheelMaterial = executive ? new THREE.MeshStandardMaterial({ color: 0x272c33,
      roughness: .80, metalness: .03 }) : dark;
    const ring = new THREE.Mesh(
      // 32 mm grip diameter is ordinary for a road car and leaves a little
      // more visual air around the dials without shrinking the wheel itself.
      new THREE.TorusGeometry(
        config.steeringWheelRadius,
        config.steeringWheelRimTubeRadius,
        10,
        48,
      ),
      wheelMaterial,
    );
    ring.name = 'Steering wheel rim';
    ring.castShadow = true;
    this.steeringWheelRotationGroup.add(ring);

    let hubGeometry: THREE.BufferGeometry;
    if (executive) {
      const outline = new THREE.Shape([
        new THREE.Vector2(-.060, -.044), new THREE.Vector2(.060, -.044),
        new THREE.Vector2(.078, -.025), new THREE.Vector2(.078, .024),
        new THREE.Vector2(.060, .043), new THREE.Vector2(-.060, .043),
        new THREE.Vector2(-.078, .024), new THREE.Vector2(-.078, -.025),
      ]);
      hubGeometry = new THREE.ExtrudeGeometry(outline, { depth: .030, steps: 1,
        bevelEnabled: true, bevelSize: .003, bevelThickness: .002, bevelSegments: 1 });
      hubGeometry.translate(0, 0, -.015);
    } else {
      hubGeometry = config.body.design === 'formal' ? new THREE.BoxGeometry(.15, .095, .04)
        : new THREE.CylinderGeometry(.064, .07, .04, 20);
    }
    const hub = new THREE.Mesh(hubGeometry, wheelMaterial);
    hub.name = 'Steering wheel hub';
    if (config.body.design !== 'formal' && config.body.design !== 'executive') hub.rotation.x = Math.PI / 2;
    if (config.body.design === 'comfort') hub.scale.set(1.15,1,1);
    hub.position.z = 0.015;
    this.steeringWheelRotationGroup.add(hub);

    const design = config.body.design;
    const spoke = (name: string, angle: number, width: number): void => {
      const inner = .04, outer = config.steeringWheelRadius;
      const center = (inner + outer) * .5;
      let mesh: THREE.Mesh;
      if (executive) {
        const length = outer - inner;
        const outline = new THREE.Shape([
          new THREE.Vector2(-width * .5, -length * .5), new THREE.Vector2(width * .5, -length * .5),
          new THREE.Vector2(width * .30, length * .5), new THREE.Vector2(-width * .30, length * .5),
        ]);
        const geometry = new THREE.ExtrudeGeometry(outline, { depth: .023, steps: 1,
          bevelEnabled: false });
        geometry.translate(0, 0, -.0115);
        mesh = new THREE.Mesh(geometry, satin);
        mesh.name = name;
        mesh.position.set(Math.cos(angle) * center, Math.sin(angle) * center, 0);
        mesh.castShadow = true;
      } else {
        mesh = makeBox(name, [width, outer - inner, .025],
          [Math.cos(angle) * center, Math.sin(angle) * center, 0], satin);
      }
      mesh.rotation.z = angle - Math.PI * .5;
      this.steeringWheelRotationGroup.add(mesh);
    };
    const sweep = executive ? .05 : design === 'flow' ? .10 : design === 'formal' ? 0 : .18;
    spoke('Steering wheel left spoke', Math.PI + sweep, design === 'flow' ? .024 : .032);
    spoke('Steering wheel right spoke', -sweep, design === 'flow' ? .024 : .032);
    if (design === 'comfort') {
      spoke('Comfort left lower wheel spoke', -Math.PI * .5 - .38, .028);
      spoke('Comfort right lower wheel spoke', -Math.PI * .5 + .38, .028);
    } else {
      spoke('Steering wheel lower spoke', -Math.PI * .5,
        config.body.profile === 'sport-coupe' ? .045 : .035);
    }

    this.steeringWheelBase.add(this.steeringWheelRotationGroup);
    this.add(this.steeringWheelBase);
  }

  private addCentreConsole(
    config: VehicleVisualConfig,
    interior: THREE.Material,
    dark: THREE.Material,
    satin: THREE.Material,
  ): void {
    const design = config.body.design;
    const stackWidth = this.consoleWidth;
    const stackX = config.gearLeverPosition[0];
    const topY = config.cabin.dashboardTopY - .04;
    const consoleY = config.gearLeverPosition[1] - .025;
    const topZ = config.dashboard.position[2] + config.dashboard.dimensions[2] * .5;
    const bottomZ = -.10;
    const stackProfile = [
      [topY, topZ], [consoleY, bottomZ], [this.floorY, bottomZ],
      [this.floorY, topZ - .095], [topY, topZ - .095],
    ] as const;
    // Local side cheeks and a thin sloping fascia, not a solid centre block.
    for (const sign of [-1, 1]) {
      const edge = stackX + sign * stackWidth * .5;
      this.add(makeSectionShell('Centre stack side panel', [
        { x: edge - .008, profile: stackProfile }, { x: edge + .008, profile: stackProfile },
      ], interior));
    }
    const fasciaProfile = [[topY, topZ], [consoleY, bottomZ],
      [consoleY, bottomZ - .018], [topY, topZ - .018]] as const;
    this.add(makeSectionShell('Centre stack fascia', [
      { x: stackX - stackWidth * .5, profile: fasciaProfile },
      { x: stackX + stackWidth * .5, profile: fasciaProfile },
    ], interior));

    // Mount all controls on the same sloped fascia, with a small surface offset.
    const face = new THREE.Group();
    face.name = 'Centre stack controls';
    face.position.set(stackX, (topY + consoleY) * .5, (topZ + bottomZ) * .5);
    face.rotation.x = Math.atan2(topZ - bottomZ, topY - consoleY);
    const faceHeight = Math.hypot(topY - consoleY, topZ - bottomZ);
    if (design === 'executive') {
      const w = stackWidth * .5 - .012, h = faceHeight * .5 - .012, corner = .016;
      const outline = new THREE.Shape([
        new THREE.Vector2(-w + corner, -h), new THREE.Vector2(w - corner, -h),
        new THREE.Vector2(w, -h + corner), new THREE.Vector2(w, h - corner),
        new THREE.Vector2(w - corner, h), new THREE.Vector2(-w + corner, h),
        new THREE.Vector2(-w, h - corner), new THREE.Vector2(-w, -h + corner),
      ]);
      const panel = new THREE.Mesh(new THREE.ExtrudeGeometry(outline, { depth: .002, steps: 1,
        bevelEnabled: true, bevelSize: .002, bevelThickness: .001, bevelSegments: 1 }),
      new THREE.MeshStandardMaterial({ color: 0x424a54, roughness: .52, metalness: .22 }));
      panel.name = 'Executive centre control surround';
      face.add(panel);
    }
    face.add(makeBox('Infotainment display', [stackWidth - .055, design === 'formal' ? .10 : .085, .008],
      [0, -.018, .005], dark));
    for (const sign of [-1, 1]) {
      face.add(makeBox('Centre air vent', [(stackWidth - .065) * .5, .033, .008],
        [sign * stackWidth * .24, faceHeight * .5 - .037, .005], dark));
    }
    if (design === 'executive') {
      face.add(makeBox('Executive lower climate glass', [stackWidth - .055, .075, .008],
        [0, -.12, .006], dark));
      for (const y of [-.12, -.018]) {
        face.add(makeBox('Executive glass satin lower border', [stackWidth - .055, .004, .008],
          [0, y - .041, .008], satin));
      }
    }
    this.add(face);

    const tunnel = new THREE.Group();
    tunnel.name = 'Transmission tunnel';
    for (const sign of [-1, 1]) {
      tunnel.add(makeBox('Transmission tunnel side panel', [.016, consoleY - this.floorY, .94],
        [stackX + sign * (stackWidth * .5 - .008), (consoleY + this.floorY) * .5, bottomZ + .47], interior));
    }
    this.add(tunnel);
    const consoleMaterial = design === 'executive' ? new THREE.MeshStandardMaterial({
      color: 0x2c323a, roughness: .54, metalness: .15 }) : dark;
    const consoleTop = makeBox('Centre console top', [stackWidth - .02, .012, .92],
      [stackX, consoleY + .006, bottomZ + .47], consoleMaterial);
    this.add(consoleTop);
    if (design === 'executive') for (const sign of [-1, 1]) {
      this.add(makeBox('Executive console satin boundary', [.006, .006, .92],
        [stackX + sign * (stackWidth * .5 - .015), consoleY + .015, bottomZ + .47], satin));
    }

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

  private addFootwells(config: VehicleVisualConfig, material: THREE.Material): void {
    const frontZ = config.cabin.windshieldBottomZ;
    const rearZ = .72;
    const halfWidth = config.cabin.width * .5 - .04;
    this.add(makeBox('Cabin floor', [halfWidth * 2, .022, rearZ - frontZ],
      [0, this.floorY - .011, (frontZ + rearZ) * .5], material));
    const profile = [[this.floorY + .14, frontZ], [this.floorY, frontZ + .19],
      [this.floorY - .016, frontZ + .19], [this.floorY + .124, frontZ]] as const;
    const consoleX = config.gearLeverPosition[0];
    for (const [name, left, right] of [
      ['Driver footwell toe board', -halfWidth, consoleX - this.consoleWidth * .5],
      ['Passenger footwell toe board', consoleX + this.consoleWidth * .5, halfWidth],
    ] as const) {
      this.add(makeSectionShell(name, [{ x: left, profile }, { x: right, profile }], material));
    }
  }

  private addDoors(
    config: VehicleVisualConfig,
    interior: THREE.Material,
    softTrim: THREE.Material,
    satin: THREE.Material,
  ): void {
    const opening = frontWindowAnchors(config);
    const frontZ = opening.frontBottomZ;
    const rearZ = config.body.profile === 'sport-coupe' ? .64 : opening.rearZ;
    const length = rearZ - frontZ;
    for (const sign of [-1, 1]) {
      const label = sign < 0 ? 'Left' : 'Right';
      const sections = [frontZ, (frontZ + rearZ) * .5, rearZ].map(z => {
        const skin = frontDoorSkinAnchor(config, z);
        // Top joins the side-window beltline; bottom stays within the door skin.
        const outerX = opening.bottomHalfWidth - .012;
        const lowerX = skin.x - .025;
        return { x: z, profile: [
          [skin.y - .006, sign * outerX],
          [skin.y - .045, sign * (outerX - .028)],
          [config.body.sillY + .09, sign * (lowerX - .022)],
          [config.body.sillY + .09, sign * lowerX],
        ] as const };
      });
      // This shell's longitudinal axis is Z, rather than the dashboard's X.
      const card = makeSectionShell(label + ' door card', sections, interior, 'z');
      this.add(card);

      const railProfile = [
        [opening.frontBottomY - .027, sign * (opening.bottomHalfWidth - .004)],
        [opening.frontBottomY - .046, sign * (opening.bottomHalfWidth - .055)],
        [sections[0]!.profile[0][0] - .02, sign * (opening.bottomHalfWidth - .055)],
        [sections[0]!.profile[0][0] - .02, sign * (opening.bottomHalfWidth - .004)],
      ] as const;
      const rail = makeSectionShell(label + ' door upper rail', [
        { x: frontZ, profile: railProfile },
        { x: rearZ, profile: railProfile.map(([y, x], i) => [y + (i < 2
          ? opening.rearBottomY - opening.frontBottomY
          : frontDoorSkinAnchor(config, rearZ).y - frontDoorSkinAnchor(config, frontZ).y), x] as const) },
      ], softTrim, 'z');
      this.add(rail);
      const x = sign * (opening.bottomHalfWidth - .07);
      const armY = config.body.sillY + .28;
      this.add(makeBox(label + ' door armrest', [.12, .055, length * .5],
        [x, armY, (frontZ + rearZ) * .5], softTrim));
      this.add(makeBox(label + ' door handle', [.018, .033, .15],
        [sign * (opening.bottomHalfWidth - .043), armY + .09, frontZ + length * .56], satin));
    }
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
    const frameWidth = config.cabin.width - .05;

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
    const topRail = makeBox('Windshield header', [config.body.roofWidth - .06, .045, .045], [0, glassHeight / 2, .005], dark);
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

    const roofFrontZ = topZ + .025;
    const roofRearZ = config.body.design === undefined
      ? config.body.profile === 'sport-coupe' ? .69 : .84
      : config.body.roofCenterZ + config.body.roofLength * .5;
    const headliner = makeBox(
      'Cabin headliner',
      [config.body.roofWidth - .10, .022, roofRearZ - roofFrontZ],
      [0, config.cabin.roofY - .064, (roofRearZ + roofFrontZ) * .5],
      headlinerMaterial,
    );
    this.add(headliner);
  }
}
