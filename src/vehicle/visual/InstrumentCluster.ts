import * as THREE from 'three';

export type InstrumentGear = number | 'R' | 'N' | string;

export interface InstrumentIndicatorState {
  readonly positionLights?: boolean;
  readonly headlights?: boolean;
  readonly highBeam?: boolean;
  readonly fogLights?: boolean;
  readonly leftTurn?: boolean;
  readonly rightTurn?: boolean;
  readonly parkingBrake?: boolean;
  /** Kept as a compatibility input, but not rendered until ABS is simulated. */
  readonly absWarning?: boolean;
  readonly engineWarning?: boolean;
  readonly batteryWarning?: boolean;
  /** Sports-car cruise status; the classic sedan face intentionally omits it. */
  readonly cruise?: boolean;
  /** Compatibility input for external HUDs; physical clusters do not render it. */
  readonly upshift?: boolean;
}

/**
 * Render-facing data only. Optional values let future fuel, cooling and
 * electrical simulations feed the cluster without coupling them to the
 * current longitudinal vehicle model.
 */
export interface InstrumentTelemetry {
  readonly speedKmh: number;
  readonly rpm: number;
  readonly gear: InstrumentGear;
  readonly fuelLevel?: number;
  readonly coolantTemperatureC?: number;
  readonly handbrake?: number;
  readonly upshiftRecommended?: boolean;
  /** When supplied, engine/battery lamps are forced off while the engine runs. */
  readonly engineRunning?: boolean;
  readonly indicators?: InstrumentIndicatorState;
}

export interface InstrumentClusterConfig {
  readonly maximumSpeedKmh: number;
  readonly maximumRPM: number;
  readonly redlineRPM: number;
  readonly needleResponse: number;
  /** Classic twin analogue dials or the coupe's track-focused TFT layout. */
  readonly displayStyle: 'dual-analog' | 'sport-tft';
}

const DEFAULT_CONFIG: InstrumentClusterConfig = {
  maximumSpeedKmh: 220,
  maximumRPM: 7_000,
  redlineRPM: 6_000,
  needleResponse: 13,
  displayStyle: 'dual-analog',
};

const ARC_START = -Math.PI * 0.72;
const ARC_END = Math.PI * 0.72;
const FACE_SIZE = 512;

/** Shared physical dimensions used by the cockpit and its framing self-test. */
export const INSTRUMENT_CLUSTER_LAYOUT = Object.freeze({
  faceHalfWidth: 0.226,
  faceHalfHeight: 0.112,
  faceZ: 0.052,
  digitalHalfWidth: 0.075,
  digitalHalfHeight: 0.035,
  digitalCenterY: 0.075,
  digitalZ: 0.064,
  // The warning lamps are now a row inside the centre LCD rather than a
  // separate strip perched on top of the binnacle.
  lampHalfWidth: 0.069,
  lampHalfHeight: 0.007,
  lampCenterY: 0.094,
  lampZ: 0.065,
  smallGaugeCenterX: 0.198,
  smallGaugeCenterY: 0.071,
  smallGaugeHalfWidth: 0.036,
  smallGaugeHalfHeight: 0.023,
  smallGaugeZ: 0.062,
  mainDialCenterX: 0.13,
  mainDialRadius: 0.096,
  mainDialNeedleZ: 0.052,
});

/** Important readable regions of the coupe TFT, shared with projection tests. */
export const SPORT_INSTRUMENT_CLUSTER_LAYOUT = Object.freeze({
  displayHalfWidth: 0.238,
  displayHalfHeight: 0.105,
  displayZ: 0.069,
  tachBandCenterY: 0.074,
  tachBandHalfWidth: 0.211,
  tachBandHalfHeight: 0.021,
  indicatorBandCenterY: 0.045,
  indicatorBandHalfWidth: 0.198,
  indicatorBandHalfHeight: 0.008,
  primaryCenterY: 0.021,
  primaryHalfWidth: 0.174,
  primaryHalfHeight: 0.017,
  auxiliaryCenterY: 0,
  auxiliaryCenterX: 0.174,
  auxiliaryHalfWidth: 0.057,
  auxiliaryHalfHeight: 0.019,
});

/** Physical housing dimensions used by the cockpit visibility regression. */
export const INSTRUMENT_CLUSTER_HOUSING_LAYOUT = Object.freeze({
  backSize: [0.5, 0.235, 0.055] as const,
  analogueHoodSize: [0.525, 0.045, 0.17] as const,
  analogueHoodY: 0.128,
  sportHoodSize: [0.5, 0.024, 0.08] as const,
  sportHoodY: 0.11,
  hoodZ: 0.006,
  hoodTiltRadians: THREE.MathUtils.degToRad(-8),
});

/**
 * Semantic lamp inventory for the coupe TFT.  Keeping this list explicit
 * prevents a future telemetry refactor from accidentally bringing the old
 * up/down-shift suggestion lamps back onto the physical dashboard.
 */
export const SPORT_INSTRUMENT_INDICATOR_IDS = Object.freeze([
  'left-turn',
  'right-turn',
  'headlights',
  'high-beam',
  'position-lights',
  'fog-lights',
  'parking-brake',
  'engine-warning',
  'battery-warning',
  'cruise',
] as const);

const clamp01 = (value: number): number => THREE.MathUtils.clamp(value, 0, 1);

const finiteOr = (value: number | undefined, fallback: number): number =>
  value !== undefined && Number.isFinite(value) ? value : fallback;

export const formatInstrumentGear = (gear: InstrumentGear): string =>
  typeof gear === 'number' ? Math.round(gear).toString() : gear;

const fractionToNeedleRotation = (fraction: number): number =>
  -THREE.MathUtils.lerp(ARC_START, ARC_END, clamp01(fraction));

const fractionToSmallGaugeRotation = (fraction: number): number =>
  THREE.MathUtils.lerp(Math.PI * 0.37, -Math.PI * 0.37, clamp01(fraction));

const createCanvas = (width: number, height: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

const configureTexture = (canvas: HTMLCanvasElement): THREE.CanvasTexture => {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
};

interface DialArtworkOptions {
  readonly label: string;
  readonly unit: string;
  readonly maximum: number;
  readonly majorDivisions: number;
  readonly minorTicksPerMajor: number;
  readonly labelDivisor?: number;
  readonly redlineFraction?: number;
}

const drawDialArtwork = (options: DialArtworkOptions): HTMLCanvasElement => {
  const canvas = createCanvas(FACE_SIZE, FACE_SIZE);
  const context = canvas.getContext('2d');
  if (context === null) return canvas;

  const center = FACE_SIZE / 2;
  const tickRadius = FACE_SIZE * 0.405;
  const totalMinorTicks = options.majorDivisions * options.minorTicksPerMajor;
  context.clearRect(0, 0, FACE_SIZE, FACE_SIZE);

  const background = context.createRadialGradient(
    center,
    center * 0.9,
    FACE_SIZE * 0.08,
    center,
    center,
    center * 0.95,
  );
  background.addColorStop(0, '#17232d');
  background.addColorStop(0.72, '#071016');
  background.addColorStop(1, '#020508');
  context.fillStyle = background;
  context.beginPath();
  context.arc(center, center, center - 5, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = '#738894';
  context.lineWidth = 4;
  context.beginPath();
  context.arc(center, center, tickRadius + 31, 0, Math.PI * 2);
  context.stroke();

  if (options.redlineFraction !== undefined) {
    const redStart = THREE.MathUtils.lerp(
      ARC_START,
      ARC_END,
      clamp01(options.redlineFraction),
    );
    context.strokeStyle = '#d73731';
    context.lineWidth = 12;
    context.beginPath();
    context.arc(
      center,
      center,
      tickRadius + 9,
      redStart - Math.PI / 2,
      ARC_END - Math.PI / 2,
    );
    context.stroke();
  }

  for (let index = 0; index <= totalMinorTicks; index += 1) {
    const fraction = index / totalMinorTicks;
    const angle = THREE.MathUtils.lerp(ARC_START, ARC_END, fraction);
    const isMajor = index % options.minorTicksPerMajor === 0;
    const innerRadius = tickRadius - (isMajor ? 35 : 21);
    const outerRadius = tickRadius + 4;
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    const inRed = options.redlineFraction !== undefined && fraction >= options.redlineFraction;
    context.strokeStyle = inRed ? '#ff564e' : isMajor ? '#eef6f6' : '#9cafb4';
    context.lineWidth = isMajor ? 7 : 3;
    context.beginPath();
    context.moveTo(center + sin * innerRadius, center - cos * innerRadius);
    context.lineTo(center + sin * outerRadius, center - cos * outerRadius);
    context.stroke();

    if (!isMajor) continue;
    const labelRadius = tickRadius - 64;
    const rawValue = options.maximum * fraction;
    const displayedValue = rawValue / (options.labelDivisor ?? 1);
    context.fillStyle = inRed ? '#ff685f' : '#eaf2f1';
    context.font = '600 31px Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(
      Math.round(displayedValue).toString(),
      center + sin * labelRadius,
      center - cos * labelRadius,
    );
  }

  context.fillStyle = '#dbe8e8';
  context.font = '700 29px Arial, sans-serif';
  context.textAlign = 'center';
  context.fillText(options.label, center, center + 82);
  context.fillStyle = '#8fa5ac';
  context.font = '500 22px Arial, sans-serif';
  context.fillText(options.unit, center, center + 112);
  return canvas;
};

const makeNeedle = (
  name: string,
  length: number,
  color: THREE.ColorRepresentation,
): THREE.Group => {
  const pivot = new THREE.Group();
  pivot.name = name;

  const shape = new THREE.Shape();
  shape.moveTo(-0.005, -0.014);
  shape.lineTo(0.005, -0.014);
  shape.lineTo(0.0025, length);
  shape.lineTo(-0.0025, length);
  shape.closePath();
  const needle = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({ color, toneMapped: false }),
  );
  needle.name = `${name} blade`;
  pivot.add(needle);

  const cap = new THREE.Mesh(
    new THREE.CircleGeometry(0.0125, 20),
    new THREE.MeshBasicMaterial({ color: 0xc6d1d2, toneMapped: false }),
  );
  cap.name = `${name} cap`;
  cap.position.z = 0.001;
  pivot.add(cap);
  return pivot;
};

interface SmallGauge {
  readonly root: THREE.Group;
  readonly needle: THREE.Group;
}

const makeSmallGauge = (
  name: string,
  leftLabel: string,
  rightLabel: string,
  caption: string,
): SmallGauge => {
  const root = new THREE.Group();
  root.name = name;

  const canvas = createCanvas(256, 160);
  const context = canvas.getContext('2d');
  if (context !== null) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'rgba(2, 7, 10, 0.9)';
    context.fillRect(5, 15, 246, 140);
    context.strokeStyle = '#b9c9ca';
    context.lineWidth = 8;
    context.beginPath();
    context.arc(128, 128, 83, Math.PI * 1.12, Math.PI * 1.88);
    context.stroke();
    context.fillStyle = '#e4eeee';
    context.font = '700 36px Arial, sans-serif';
    context.textAlign = 'center';
    context.fillText(leftLabel, 42, 135);
    context.fillText(rightLabel, 214, 135);
    context.fillStyle = '#8fa5ac';
    context.font = '700 23px Arial, sans-serif';
    context.fillText(caption, 128, 38);
  }
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(
      INSTRUMENT_CLUSTER_LAYOUT.smallGaugeHalfWidth * 2,
      INSTRUMENT_CLUSTER_LAYOUT.smallGaugeHalfHeight * 2,
    ),
    new THREE.MeshBasicMaterial({
      map: configureTexture(canvas),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  root.add(face);

  const needle = makeNeedle(`${name} needle`, 0.021, 0xf05548);
  needle.position.set(0, -0.009, 0.002);
  root.add(needle);
  return { root, needle };
};

/**
 * Low-cost cockpit instrument cluster. It owns its meshes and redraws its
 * canvas displays only when the visible value or lamp state changes.
 */
export class InstrumentCluster extends THREE.Group {
  private readonly config: InstrumentClusterConfig;
  private readonly tachometerNeedle: THREE.Group;
  private readonly speedometerNeedle: THREE.Group;
  private readonly fuelNeedle: THREE.Group;
  private readonly temperatureNeedle: THREE.Group;
  private readonly informationCanvas = createCanvas(512, 240);
  private readonly informationTexture: THREE.CanvasTexture;
  private readonly sportDisplayCanvas: HTMLCanvasElement | null;
  private readonly sportDisplayTexture: THREE.CanvasTexture | null;

  private currentTachometerRotation = fractionToNeedleRotation(0);
  private currentSpeedometerRotation = fractionToNeedleRotation(0);
  private currentFuelRotation = fractionToSmallGaugeRotation(0.72);
  private currentTemperatureRotation = fractionToSmallGaugeRotation(0.5);
  private lastInformationKey = '';
  private lastIndicatorKey = '';

  public constructor(config: Partial<InstrumentClusterConfig> = {}) {
    super();
    this.name = 'Functional instrument cluster';
    this.config = { ...DEFAULT_CONFIG, ...config };

    const housingMaterial = new THREE.MeshStandardMaterial({
      color: 0x06090c,
      roughness: 0.72,
      metalness: 0.08,
      side: THREE.DoubleSide,
    });
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(...INSTRUMENT_CLUSTER_HOUSING_LAYOUT.backSize),
      housingMaterial,
    );
    back.name = 'Instrument binnacle back';
    back.receiveShadow = true;
    this.add(back);

    const isSportTft = this.config.displayStyle === 'sport-tft';
    // The wide TFT needs only a slim anti-glare eyebrow. Reusing the deep
    // analogue binnacle hood put a large black slab into the coupe's road
    // view even though the display itself was correctly positioned.
    const hoodSize = isSportTft
      ? INSTRUMENT_CLUSTER_HOUSING_LAYOUT.sportHoodSize
      : INSTRUMENT_CLUSTER_HOUSING_LAYOUT.analogueHoodSize;
    const hood = new THREE.Mesh(new THREE.BoxGeometry(...hoodSize), housingMaterial);
    hood.name = 'Instrument binnacle hood';
    hood.position.set(
      0,
      isSportTft
        ? INSTRUMENT_CLUSTER_HOUSING_LAYOUT.sportHoodY
        : INSTRUMENT_CLUSTER_HOUSING_LAYOUT.analogueHoodY,
      INSTRUMENT_CLUSTER_HOUSING_LAYOUT.hoodZ,
    );
    hood.rotation.x = INSTRUMENT_CLUSTER_HOUSING_LAYOUT.hoodTiltRadians;
    hood.castShadow = true;
    this.add(hood);

    const tachometer = this.makeMainDial(
      'Tachometer',
      -INSTRUMENT_CLUSTER_LAYOUT.mainDialCenterX,
      drawDialArtwork({
        label: 'RPM',
        unit: '×1000 r/min',
        maximum: this.config.maximumRPM,
        majorDivisions: 7,
        minorTicksPerMajor: 5,
        labelDivisor: 1_000,
        redlineFraction: this.config.redlineRPM / this.config.maximumRPM,
      }),
    );
    this.tachometerNeedle = tachometer.needle;

    const speedometer = this.makeMainDial(
      'Speedometer',
      INSTRUMENT_CLUSTER_LAYOUT.mainDialCenterX,
      drawDialArtwork({
        label: 'SPEED',
        unit: 'km/h',
        maximum: this.config.maximumSpeedKmh,
        majorDivisions: 11,
        minorTicksPerMajor: 2,
      }),
    );
    this.speedometerNeedle = speedometer.needle;

    const fuelGauge = makeSmallGauge('Fuel gauge', 'E', 'F', 'FUEL');
    // Put the auxiliary gauges in the upper outside shoulders of the
    // binnacle. They remain inside the cluster but no longer sit behind the
    // steering-wheel rim or compete with the main needle pivots.
    fuelGauge.root.position.set(
      -INSTRUMENT_CLUSTER_LAYOUT.smallGaugeCenterX,
      INSTRUMENT_CLUSTER_LAYOUT.smallGaugeCenterY,
      INSTRUMENT_CLUSTER_LAYOUT.smallGaugeZ,
    );
    this.fuelNeedle = fuelGauge.needle;
    this.add(fuelGauge.root);

    const temperatureGauge = makeSmallGauge('Coolant temperature gauge', 'C', 'H', 'TEMP');
    temperatureGauge.root.position.set(
      INSTRUMENT_CLUSTER_LAYOUT.smallGaugeCenterX,
      INSTRUMENT_CLUSTER_LAYOUT.smallGaugeCenterY,
      INSTRUMENT_CLUSTER_LAYOUT.smallGaugeZ,
    );
    this.temperatureNeedle = temperatureGauge.needle;
    this.add(temperatureGauge.root);

    this.informationTexture = configureTexture(this.informationCanvas);
    const informationDisplay = new THREE.Mesh(
      new THREE.PlaneGeometry(
        INSTRUMENT_CLUSTER_LAYOUT.digitalHalfWidth * 2,
        INSTRUMENT_CLUSTER_LAYOUT.digitalHalfHeight * 2,
      ),
      new THREE.MeshBasicMaterial({
        map: this.informationTexture,
        transparent: true,
        toneMapped: false,
      }),
    );
    informationDisplay.name = 'Digital speed and gear display';
    // Keep the speed and gear readout in the clear band above the wheel rim.
    // This also separates the most important information from the lower arc
    // of the two analogue dials, which can be partly framed by the wheel.
    informationDisplay.position.set(
      0,
      INSTRUMENT_CLUSTER_LAYOUT.digitalCenterY,
      INSTRUMENT_CLUSTER_LAYOUT.digitalZ,
    );
    this.add(informationDisplay);

    if (this.config.displayStyle === 'sport-tft') {
      // The coupe owns a genuinely different display rather than a recoloured
      // sedan cluster.  Keep the shared analogue hardware instantiated for a
      // small, predictable code path, but cover and hide it behind one TFT.
      this.children.slice(2).forEach((child) => {
        child.visible = false;
      });
      this.sportDisplayCanvas = createCanvas(1_024, 456);
      this.sportDisplayTexture = configureTexture(this.sportDisplayCanvas);
      const sportDisplay = new THREE.Mesh(
        new THREE.PlaneGeometry(
          SPORT_INSTRUMENT_CLUSTER_LAYOUT.displayHalfWidth * 2,
          SPORT_INSTRUMENT_CLUSTER_LAYOUT.displayHalfHeight * 2,
        ),
        new THREE.MeshBasicMaterial({
          map: this.sportDisplayTexture,
          toneMapped: false,
        }),
      );
      sportDisplay.name = 'Sports performance TFT';
      sportDisplay.position.z = SPORT_INSTRUMENT_CLUSTER_LAYOUT.displayZ;
      this.add(sportDisplay);
      this.redrawSportDisplay(0, 0, 'N', 0.72, 90, {});
    } else {
      this.sportDisplayCanvas = null;
      this.sportDisplayTexture = null;
      this.redrawInformation(0, 'N', {});
    }
    this.applyNeedleRotations();
  }

  public update(telemetry: InstrumentTelemetry, deltaTime = 1 / 60): void {
    const speedKmh = Math.abs(finiteOr(telemetry.speedKmh, 0));
    const rpm = Math.max(0, finiteOr(telemetry.rpm, 0));
    const fuelLevel = clamp01(finiteOr(telemetry.fuelLevel, 0.72));
    const temperatureC = finiteOr(telemetry.coolantTemperatureC, 90);
    const temperatureFraction = clamp01((temperatureC - 50) / 80);
    const dt = THREE.MathUtils.clamp(finiteOr(deltaTime, 1 / 60), 0, 0.1);
    const blend = 1 - Math.exp(-this.config.needleResponse * dt);

    this.currentTachometerRotation = THREE.MathUtils.lerp(
      this.currentTachometerRotation,
      fractionToNeedleRotation(rpm / this.config.maximumRPM),
      blend,
    );
    this.currentSpeedometerRotation = THREE.MathUtils.lerp(
      this.currentSpeedometerRotation,
      fractionToNeedleRotation(speedKmh / this.config.maximumSpeedKmh),
      blend,
    );
    this.currentFuelRotation = THREE.MathUtils.lerp(
      this.currentFuelRotation,
      fractionToSmallGaugeRotation(fuelLevel),
      blend,
    );
    this.currentTemperatureRotation = THREE.MathUtils.lerp(
      this.currentTemperatureRotation,
      fractionToSmallGaugeRotation(temperatureFraction),
      blend,
    );
    this.applyNeedleRotations();

    const displaySpeed = Math.round(speedKmh);
    const engineStopped = telemetry.engineRunning === false;
    const indicators: InstrumentIndicatorState = {
      ...telemetry.indicators,
      parkingBrake:
        telemetry.indicators?.parkingBrake ?? finiteOr(telemetry.handbrake, 0) > 0.05,
      engineWarning: telemetry.engineRunning === undefined
        ? telemetry.indicators?.engineWarning
        : engineStopped,
      batteryWarning: telemetry.engineRunning === undefined
        ? telemetry.indicators?.batteryWarning
        : engineStopped,
      // Shift advice stays available to the HUD/telemetry layer, but neither
      // of the two physical vehicle clusters renders a recommendation lamp.
      upshift: undefined,
    };
    const indicatorKey = [
      indicators.leftTurn,
      indicators.rightTurn,
      indicators.headlights,
      indicators.highBeam,
      indicators.positionLights,
      indicators.fogLights,
      indicators.parkingBrake,
      indicators.engineWarning,
      indicators.batteryWarning,
      indicators.cruise,
    ].map((value) => (value === true ? '1' : '0')).join('');
    const informationKey = this.config.displayStyle === 'sport-tft'
      ? [
        displaySpeed,
        telemetry.gear,
        Math.round(rpm / 25),
        Math.round(fuelLevel * 100),
        Math.round(temperatureC),
      ].join('|')
      : `${displaySpeed}|${telemetry.gear}`;
    if (
      informationKey !== this.lastInformationKey ||
      indicatorKey !== this.lastIndicatorKey
    ) {
      if (this.config.displayStyle === 'sport-tft') {
        this.redrawSportDisplay(
          displaySpeed,
          rpm,
          telemetry.gear,
          fuelLevel,
          temperatureC,
          indicators,
        );
      } else {
        this.redrawInformation(displaySpeed, telemetry.gear, indicators);
      }
    }
  }

  /** Releases the canvases, materials and small geometries owned by this cluster. */
  public dispose(): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    this.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      const meshMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of meshMaterials) {
        materials.add(material);
        const mappedMaterial = material as THREE.Material & { map?: THREE.Texture | null };
        if (mappedMaterial.map !== undefined && mappedMaterial.map !== null) {
          textures.add(mappedMaterial.map);
        }
      }
    });
    textures.forEach((texture) => texture.dispose());
    materials.forEach((material) => material.dispose());
    geometries.forEach((geometry) => geometry.dispose());
  }

  private makeMainDial(
    name: string,
    x: number,
    artwork: HTMLCanvasElement,
  ): { readonly needle: THREE.Group } {
    const face = new THREE.Mesh(
      new THREE.CircleGeometry(INSTRUMENT_CLUSTER_LAYOUT.mainDialRadius, 48),
      new THREE.MeshBasicMaterial({
        map: configureTexture(artwork),
        transparent: true,
        toneMapped: false,
      }),
    );
    face.name = `${name} face`;
    face.position.set(x, 0, 0.043);
    this.add(face);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(INSTRUMENT_CLUSTER_LAYOUT.mainDialRadius + 0.001, 0.005, 8, 48),
      new THREE.MeshStandardMaterial({
        color: 0x8f999d,
        roughness: 0.27,
        metalness: 0.68,
      }),
    );
    rim.name = `${name} rim`;
    rim.position.set(x, 0, 0.047);
    this.add(rim);

    const needle = makeNeedle(`${name} needle`, 0.072, 0xf14c43);
    needle.position.set(x, 0, 0.052);
    this.add(needle);
    return { needle };
  }

  private applyNeedleRotations(): void {
    this.tachometerNeedle.rotation.z = this.currentTachometerRotation;
    this.speedometerNeedle.rotation.z = this.currentSpeedometerRotation;
    this.fuelNeedle.rotation.z = this.currentFuelRotation;
    this.temperatureNeedle.rotation.z = this.currentTemperatureRotation;
  }

  private redrawInformation(
    speedKmh: number,
    gear: InstrumentGear,
    indicators: InstrumentIndicatorState,
  ): void {
    const context = this.informationCanvas.getContext('2d');
    if (context === null) return;
    const gearLabel = formatInstrumentGear(gear);
    this.lastInformationKey = `${speedKmh}|${gear}`;
    this.lastIndicatorKey = this.getIndicatorKey(indicators);
    context.clearRect(0, 0, this.informationCanvas.width, this.informationCanvas.height);
    context.fillStyle = '#06100e';
    context.fillRect(0, 0, this.informationCanvas.width, this.informationCanvas.height);
    context.strokeStyle = '#375f58';
    context.lineWidth = 6;
    context.strokeRect(3, 3, this.informationCanvas.width - 6, this.informationCanvas.height - 6);

    // The top row is part of the LCD itself. Only currently meaningful lamps
    // are drawn, avoiding a permanent wall of unsupported warning symbols.
    this.drawActiveIndicatorRow(context, indicators);

    context.strokeStyle = 'rgba(112, 166, 148, 0.3)';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(132, 82);
    context.lineTo(132, 220);
    context.stroke();

    context.fillStyle = '#e6be68';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = '700 94px Arial, sans-serif';
    context.fillText(gearLabel, 68, 142);
    context.fillStyle = '#6f958a';
    context.font = '600 20px Arial, sans-serif';
    context.fillText('GEAR', 68, 211);

    context.fillStyle = '#d7fff1';
    context.textAlign = 'right';
    context.textBaseline = 'middle';
    context.font = '700 102px Consolas, monospace';
    context.fillText(speedKmh.toString().padStart(3, '0'), 485, 142);
    context.fillStyle = '#78a99a';
    context.font = '600 24px Arial, sans-serif';
    context.fillText('km/h', 479, 211);
    this.informationTexture.needsUpdate = true;
  }

  /**
   * Modern GT display: the shallow arcing rev ribbon and fixed-position lamp
   * cells remain readable in peripheral vision, while gear and speed occupy
   * the unobstructed area above the steering-wheel rim. Fuel and coolant stay
   * permanently visible instead of being buried in a menu.
   */
  private redrawSportDisplay(
    speedKmh: number,
    rpm: number,
    gear: InstrumentGear,
    fuelLevel: number,
    temperatureC: number,
    indicators: InstrumentIndicatorState,
  ): void {
    const canvas = this.sportDisplayCanvas;
    const texture = this.sportDisplayTexture;
    const context = canvas?.getContext('2d') ?? null;
    if (canvas === null || texture === null || context === null) return;

    const displayRPM = Math.max(0, Math.round(rpm));
    const rpmFraction = clamp01(displayRPM / this.config.maximumRPM);
    const redlineFraction = clamp01(this.config.redlineRPM / this.config.maximumRPM);
    const gearLabel = formatInstrumentGear(gear);
    this.lastInformationKey = [
      speedKmh,
      gear,
      Math.round(displayRPM / 25),
      Math.round(fuelLevel * 100),
      Math.round(temperatureC),
    ].join('|');
    this.lastIndicatorKey = this.getIndicatorKey(indicators);

    context.clearRect(0, 0, canvas.width, canvas.height);
    const background = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    background.addColorStop(0, '#020609');
    background.addColorStop(0.48, '#07131a');
    background.addColorStop(1, '#010305');
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const roundedPanel = (
      x: number,
      y: number,
      width: number,
      height: number,
      radius: number,
    ): void => {
      const corner = Math.min(radius, width / 2, height / 2);
      context.beginPath();
      context.moveTo(x + corner, y);
      context.lineTo(x + width - corner, y);
      context.quadraticCurveTo(x + width, y, x + width, y + corner);
      context.lineTo(x + width, y + height - corner);
      context.quadraticCurveTo(x + width, y + height, x + width - corner, y + height);
      context.lineTo(x + corner, y + height);
      context.quadraticCurveTo(x, y + height, x, y + height - corner);
      context.lineTo(x, y + corner);
      context.quadraticCurveTo(x, y, x + corner, y);
      context.closePath();
    };

    // A restrained double bezel makes the face read as one wide production
    // TFT rather than several floating HUD elements.
    roundedPanel(4, 4, canvas.width - 8, canvas.height - 8, 28);
    context.strokeStyle = '#304854';
    context.lineWidth = 8;
    context.stroke();
    roundedPanel(16, 16, canvas.width - 32, canvas.height - 32, 21);
    context.strokeStyle = 'rgba(70, 213, 238, 0.18)';
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = '#63808a';
    context.textBaseline = 'middle';
    context.textAlign = 'left';
    context.font = '700 14px Arial, sans-serif';
    context.fillText('GT PERFORMANCE', 39, 29);
    context.textAlign = 'right';
    context.fillText('7-SPEED', 985, 29);

    // The slightly arcing segmented ribbon reads immediately at high RPM but
    // stays calmer than a full circular dial during ordinary road driving.
    const tachSegments = 40;
    const tachLeft = 58;
    const tachRight = canvas.width - tachLeft;
    for (let index = 0; index < tachSegments; index += 1) {
      const fraction = (index + 0.5) / tachSegments;
      const threshold = (index + 1) / tachSegments;
      const x = THREE.MathUtils.lerp(tachLeft, tachRight, fraction);
      const y = 79 - Math.sin(Math.PI * fraction) * 20;
      const slope = -20 * Math.PI * Math.cos(Math.PI * fraction) /
        (tachRight - tachLeft);
      const active = threshold <= rpmFraction;
      const inRed = threshold >= redlineFraction;
      const inAmber = threshold >= redlineFraction - 0.12;
      const major = index % 5 === 4;
      context.save();
      context.translate(x, y);
      context.rotate(Math.atan(slope));
      context.fillStyle = active
        ? inRed ? '#ff4055' : inAmber ? '#ffb43c' : '#47dff2'
        : inRed ? '#351019' : inAmber ? '#352a17' : '#10262e';
      context.shadowColor = active
        ? inRed ? '#ff4055' : inAmber ? '#ffb43c' : '#47dff2'
        : 'transparent';
      context.shadowBlur = active ? 9 : 0;
      context.fillRect(-8, -(major ? 18 : 13), 16, major ? 36 : 26);
      context.restore();
    }
    context.shadowBlur = 0;
    context.fillStyle = '#718e98';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = '650 19px Arial, sans-serif';
    for (let index = 0; index <= 8; index += 1) {
      const fraction = index / 8;
      const x = THREE.MathUtils.lerp(tachLeft, tachRight, fraction);
      const value = this.config.maximumRPM / 1_000 * fraction;
      context.fillText(Number.isInteger(value) ? value.toString() : value.toFixed(1), x, 109);
    }
    context.textAlign = 'left';
    context.fillStyle = '#46646e';
    context.font = '700 13px Arial, sans-serif';
    context.fillText('RPM ×1000', 40, 126);

    type SportLamp = readonly [
      x: number,
      label: string,
      active: boolean | undefined,
      color: string,
    ];
    const lamps: readonly SportLamp[] = [
      [80, 'POS', indicators.positionLights === true && indicators.headlights !== true && indicators.highBeam !== true, '#69e58b'],
      [164, 'LOW', indicators.headlights === true && indicators.highBeam !== true, '#69e58b'],
      [226, 'HIGH', indicators.highBeam, '#65a9ff'],
      [296, 'FOG', indicators.fogLights, '#e5bc54'],
      [366, '◀', indicators.leftTurn, '#57ef77'],
      [512, 'CRUISE', indicators.cruise, '#66e79a'],
      [658, '▶', indicators.rightTurn, '#57ef77'],
      [796, 'PARK', indicators.parkingBrake, '#ff5764'],
      [873, 'ENGINE', indicators.engineWarning, '#ffc04b'],
      [958, 'BAT', indicators.batteryWarning, '#ff5764'],
    ];
    for (const [x, label, active, color] of lamps) {
      if (active !== true) continue;
      const width = Math.max(44, label.length * 11 + 18);
      roundedPanel(x - width / 2, 115, width, 28, 8);
      context.fillStyle = `${color}1f`;
      context.fill();
      context.strokeStyle = color;
      context.lineWidth = 1.5;
      context.stroke();
      context.fillStyle = color;
      context.shadowColor = color;
      context.shadowBlur = 8;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.font = `800 ${label.length > 4 ? 14 : 17}px Arial, sans-serif`;
      context.fillText(label, x, 129);
      context.shadowBlur = 0;
    }

    // Three fixed pods ensure warning lamps never push the core values around.
    const panelTop = 149;
    const panelHeight = 157;
    const panels = [
      { x: 39, width: 286 },
      { x: 369, width: 286 },
      { x: 699, width: 286 },
    ] as const;
    for (const panel of panels) {
      roundedPanel(panel.x, panelTop, panel.width, panelHeight, 20);
      const panelGradient = context.createLinearGradient(0, panelTop, 0, panelTop + panelHeight);
      panelGradient.addColorStop(0, 'rgba(18, 39, 49, 0.86)');
      panelGradient.addColorStop(1, 'rgba(4, 11, 15, 0.88)');
      context.fillStyle = panelGradient;
      context.fill();
      context.strokeStyle = 'rgba(91, 154, 171, 0.28)';
      context.lineWidth = 2;
      context.stroke();
    }

    // RPM is deliberately compact: the ribbon carries the peripheral cue,
    // while this exact value is useful for powertrain testing.
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#7596a0';
    context.font = '750 16px Arial, sans-serif';
    context.fillText('ENGINE SPEED', 182, 163);
    context.fillStyle = rpmFraction >= redlineFraction ? '#ff5262' : '#d7edf2';
    context.font = '750 43px Consolas, monospace';
    context.fillText(displayRPM.toLocaleString('en-US'), 182, 194);
    context.fillStyle = '#52727d';
    context.font = '700 14px Arial, sans-serif';
    context.fillText('r/min', 182, 218);

    // The gear is the visual anchor and accepts every numeric label, including
    // the coupe's sixth and seventh ratios, without shrinking or clipping.
    context.fillStyle = '#5a818d';
    context.font = '800 15px Arial, sans-serif';
    context.fillText('GEAR', 512, 158);
    context.shadowColor = '#53dff2';
    context.shadowBlur = 18;
    context.fillStyle = '#f3fdff';
    context.font = '850 82px Arial, sans-serif';
    context.fillText(gearLabel, 512, 193);
    context.shadowBlur = 0;
    context.fillStyle = '#4a707b';
    context.font = '700 14px Arial, sans-serif';
    context.fillText('MANUAL', 512, 238);

    context.fillStyle = '#7596a0';
    context.font = '750 16px Arial, sans-serif';
    context.fillText('ROAD SPEED', 842, 163);
    context.fillStyle = '#f3fdff';
    context.font = '800 58px Consolas, monospace';
    context.fillText(speedKmh.toString().padStart(3, '0'), 842, 197);
    context.fillStyle = '#5c818c';
    context.font = '750 17px Arial, sans-serif';
    context.fillText('km/h', 842, 218);

    const drawStatusBar = (
      x: number,
      width: number,
      fraction: number,
      label: string,
      value: string,
      leftText: string,
      rightText: string,
      color: string,
    ): void => {
      const y = 238;
      context.textAlign = 'left';
      context.fillStyle = '#78949d';
      context.font = '750 16px Arial, sans-serif';
      context.fillText(label, x, y - 19);
      context.textAlign = 'right';
      context.fillStyle = '#d3e8ec';
      context.fillText(value, x + width, y - 19);
      roundedPanel(x, y, width, 15, 7.5);
      context.fillStyle = '#10262d';
      context.fill();
      const fillWidth = Math.max(0, width * clamp01(fraction));
      if (fillWidth > 0) {
        roundedPanel(x, y, fillWidth, 15, 7.5);
        context.fillStyle = color;
        context.shadowColor = color;
        context.shadowBlur = 7;
        context.fill();
        context.shadowBlur = 0;
      }
      context.fillStyle = '#55727b';
      context.font = '700 14px Arial, sans-serif';
      context.textAlign = 'left';
      context.fillText(leftText, x, y + 32);
      context.textAlign = 'right';
      context.fillText(rightText, x + width, y + 32);
    };
    drawStatusBar(
      39,
      286,
      fuelLevel,
      'FUEL',
      `${Math.round(fuelLevel * 100)}%`,
      'E',
      'F',
      fuelLevel < 0.14 ? '#ffb43c' : '#48deec',
    );
    const temperatureFraction = clamp01((temperatureC - 50) / 80);
    drawStatusBar(
      699,
      286,
      temperatureFraction,
      'COOLANT',
      `${Math.round(temperatureC)}°C`,
      'C',
      'H',
      temperatureC >= 110 ? '#ff5262' : '#ffb43c',
    );

    // The centre footer is intentionally informational only; it is not a
    // hidden shift suggestion and therefore never flashes at a target RPM.
    roundedPanel(401, 337, 222, 51, 15);
    context.fillStyle = 'rgba(12, 31, 39, 0.78)';
    context.fill();
    context.strokeStyle = 'rgba(77, 152, 169, 0.22)';
    context.stroke();
    context.fillStyle = indicators.cruise === true ? '#66e79a' : '#55747e';
    context.textAlign = 'center';
    context.font = '800 16px Arial, sans-serif';
    context.fillText(indicators.cruise === true ? 'CRUISE ACTIVE' : 'GT ROAD', 512, 363);

    texture.needsUpdate = true;
  }

  private getIndicatorKey(state: InstrumentIndicatorState): string {
    return [
      state.leftTurn,
      state.rightTurn,
      state.headlights,
      state.highBeam,
      state.positionLights,
      state.fogLights,
      state.parkingBrake,
      state.engineWarning,
      state.batteryWarning,
      state.cruise,
    ].map((value) => (value === true ? '1' : '0')).join('');
  }

  private drawActiveIndicatorRow(
    context: CanvasRenderingContext2D,
    state: InstrumentIndicatorState,
  ): void {
    const possibleLamps: ReadonlyArray<
      readonly [label: string, active: boolean | undefined, color: string]
    > = [
      ['◀', state.leftTurn, '#5aff71'],
      ['P', state.parkingBrake, '#ff4e4e'],
      ['LO', state.headlights === true && state.highBeam !== true, '#72e58a'],
      ['HI', state.highBeam, '#559dff'],
      ['POS', state.positionLights === true && state.headlights !== true && state.highBeam !== true, '#72e58a'],
      ['FOG', state.fogLights, '#e5bc54'],
      ['ENG', state.engineWarning, '#ffc247'],
      ['BAT', state.batteryWarning, '#ff4e4e'],
      ['▶', state.rightTurn, '#5aff71'],
    ];
    const lamps = possibleLamps.filter(([, active]) => active === true);

    context.fillStyle = '#0a1715';
    context.fillRect(10, 10, this.informationCanvas.width - 20, 62);
    if (lamps.length === 0) return;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const usableWidth = this.informationCanvas.width - 32;
    const spacing = usableWidth / lamps.length;
    lamps.forEach(([label, , color], index) => {
      context.font = `700 ${label.length >= 3 ? 28 : 36}px Arial, sans-serif`;
      context.fillStyle = color;
      context.shadowColor = color;
      context.shadowBlur = 13;
      context.fillText(label, 16 + spacing * (index + 0.5), 41);
    });
    context.shadowBlur = 0;
  }
}
