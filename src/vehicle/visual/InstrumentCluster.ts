import * as THREE from 'three';
import { drawPrancingHorse } from './PrancingHorseBadge';
import { EXECUTIVE_INSTRUMENT_OUTLINE } from './InstrumentBinnacle';
import type { ExecutiveDisplayData } from './ExecutiveDisplayContext';
import { PROXIMITY_COLORS, type RearParkingState } from '../control/RearParkingProximity';

const rearParkingText = (state: RearParkingState | undefined): string => {
  const labels = { LEFT_CORNER: 'L corner', LEFT: 'Rear left', CENTER: 'Rear center', RIGHT: 'Rear right', RIGHT_CORNER: 'R corner' };
  return state?.nearestZone == null ? 'Rear area clear' : `${labels[state.nearestZone]} ${state.nearestDistanceM!.toFixed(1)} m`;
};
const drawRearParkingZones = (context: CanvasRenderingContext2D, state: RearParkingState | undefined, x: number, y: number, width: number): void => {
  const labels = ['LC', 'L', 'C', 'R', 'RC'], step = width / 5;
  context.save(); context.font = 'bold 16px sans-serif'; context.textAlign = 'center';
  for (let i = 0; i < 5; i++) {
    const severity = state?.zones[i]?.severity ?? 'NONE';
    context.fillStyle = PROXIMITY_COLORS[severity]; context.globalAlpha *= severity === 'NONE' ? .35 : 1;
    context.fillRect(x - width / 2 + i * step + 2, y, step - 4, 25);
    context.globalAlpha /= severity === 'NONE' ? .35 : 1;
    context.fillStyle = severity === 'NONE' ? '#8998a8' : '#10151b';
    context.fillText(labels[i]!, x - width / 2 + (i + .5) * step, y + 18);
  }
  context.restore();
};
import type { InstrumentVisualProfile } from './LuxuryVisualProfile';

export type InstrumentGear = number | 'R' | 'N' | string;

export interface InstrumentIndicatorState {
  readonly positionLights?: boolean;
  readonly headlights?: boolean;
  readonly highBeam?: boolean;
  readonly fogLights?: boolean;
  readonly frontFogLights?: boolean;
  readonly rearFogLights?: boolean;
  readonly leftTurn?: boolean;
  readonly rightTurn?: boolean;
  readonly parkingBrake?: boolean;
  readonly autoHold?: boolean;
  readonly absWarning?: boolean;
  readonly tcsActive?: boolean;
  readonly tcsOff?: boolean;
  readonly escOff?: boolean;
  readonly engineWarning?: boolean;
  readonly batteryWarning?: boolean;
  /** Active cruise state shared by all equipped vehicle faces. */
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
  readonly startStopState?: import('../powertrain/Powertrain').ICEVehicleTelemetry['startStop'];
  readonly ignitionOn?: boolean;
  /** Optional environment reading; unavailable temperature stays explicitly blank. */
  readonly outsideTemperatureC?: number;
  readonly executive?: ExecutiveDisplayData;
  readonly speedKmh: number;
  readonly rpm: number;
  readonly gear: InstrumentGear;
  readonly driveMode?: import('../config').VehicleDriveMode;
  readonly cruiseTargetSpeedKmh?: number;
  readonly fuelLevel?: number;
  readonly coolantTemperatureC?: number;
  readonly handbrake?: number;
  readonly upshiftRecommended?: boolean;
  /** When supplied, engine/battery lamps are forced off while the engine runs. */
  readonly engineRunning?: boolean;
  readonly indicators?: InstrumentIndicatorState;
}

/** Every face the physical cluster can build. Selected purely by vehicle data. */
export type InstrumentDisplayStyle =
  | 'dual-analog'
  | 'sport-tft'
  | 'cx4-tach-wing'
  | 'supercar-tach'
  | 'jetta-twin-dial'
  | 'executive-virtual'
  | 'suv-virtual';

export interface InstrumentClusterConfig {
  readonly featureClass?: 'standard' | 'advanced';
  readonly visualProfile?: InstrumentVisualProfile;
  readonly maximumSpeedKmh: number;
  readonly maximumRPM: number;
  readonly redlineRPM: number;
  readonly needleResponse: number;
  /**
   * Classic twin analogue dials, the coupe's track-focused TFT, the 6AT
   * central-tachometer face with information wings, or the 7DCT traditional
   * twin-dial face with a centre monochrome display.
   */
  readonly displayStyle: InstrumentDisplayStyle;
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
 * 6AT face: one dominant central tachometer flanked by two information wings.
 * The centre dial stays clear of both wings horizontally, and every element is
 * contained by the shared 0.5 x 0.235 m binnacle back.
 *
 * Measured against the real cockpit rig, the steering-wheel rim crosses this
 * face at about local y = -0.01. The embedded digital speed is therefore drawn
 * in the band above the needle hub; anything lower is hidden from the driver.
 */
export const CX4_INSTRUMENT_CLUSTER_LAYOUT = Object.freeze({
  tachCenterX: 0,
  tachRadius: 0.098,
  tachFaceZ: 0.074,
  tachNeedleLength: 0.062,
  tachNeedleZ: 0.078,
  wingCenterX: 0.183,
  wingHalfWidth: 0.055,
  wingHalfHeight: 0.095,
  wingZ: 0.072,
});

export const SUPERCAR_INSTRUMENT_CLUSTER_LAYOUT = Object.freeze({
  ...CX4_INSTRUMENT_CLUSTER_LAYOUT, tachRadius: .104, tachNeedleLength: .083,
  wingCenterX: .178, wingHalfWidth: .065, wingHalfHeight: .067,
});

/**
 * 7DCT face: traditional Jetta-style twin mechanical dials with a monochrome
 * centre display between them. Dial and display rectangles are disjoint.
 */
export const JETTA_INSTRUMENT_CLUSTER_LAYOUT = Object.freeze({
  tachCenterX: -0.133,
  speedoCenterX: 0.133,
  dialRadius: 0.082,
  dialFaceZ: 0.070,
  dialNeedleLength: 0.055,
  dialNeedleZ: 0.074,
  /** Centre display rectangle, in cluster-local metres. */
  displayCenterY: 0,
  displayHalfWidth: 0.048,
  displayHalfHeight: 0.076,
  displayZ: 0.076,
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

/**
 * SUV virtual cockpit face: two large round dials around a central information
 * column, sharing the ordinary binnacle aperture. Every coordinate below is
 * expressed in face canvas pixels. The central lower band is raised into the
 * visible field above the existing steering wheel without changing the cabin.
 */
export const SUV_INSTRUMENT_CLUSTER_LAYOUT = Object.freeze({
  canvasWidth: 1290,
  canvasHeight: 600,
  /** Uniform pixels per metre, so both dials stay perfectly circular. */
  pixelsPerMetre: 2609,
  apertureHalfWidth: .247,
  apertureHalfHeight: .115,
  tachCenterX: 284,
  speedoCenterX: 1006,
  dialCenterY: 295,
  dialRadius: 218,
  dialRingRadius: 224,
  needleLength: 214,
  leftDialRegion: Object.freeze({ x: 54, y: 65, width: 460, height: 460 }),
  centerRegion: Object.freeze({ x: 520, y: 65, width: 250, height: 320 }),
  centerPageRegion: Object.freeze({ x: 528, y: 144, width: 234, height: 200 }),
  rightDialRegion: Object.freeze({ x: 776, y: 65, width: 460, height: 460 }),
  assistRegion: Object.freeze({ x: 528, y: 348, width: 234, height: 36 }),
  coolantRegion: Object.freeze({ x: 174, y: 433, width: 240, height: 48 }),
  fuelRegion: Object.freeze({ x: 886, y: 433, width: 240, height: 48 }),
});

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
 * Colour substitution for one dial face, used by a face that owns its own
 * palette instead of an executive visual profile. Drawing geometry, radii and
 * the needle sweep stay identical, so every existing face is unaffected.
 */
interface DialColorTheme {
  readonly bezelOuter: string;
  readonly bezelInner: string;
  readonly bezelEdge: string;
  readonly faceCenter: string;
  readonly faceMiddle: string;
  readonly faceEdge: string;
  readonly ringColor: string;
  readonly redline: string;
}

interface StyledDialOptions {
  readonly arcStart?: number;
  readonly arcEnd?: number;
  readonly visualProfile?: InstrumentVisualProfile;
  /** Optional colour substitution for a face built without a visual profile. */
  readonly colors?: DialColorTheme;
  readonly label: string;
  readonly unit: string;
  readonly maximum: number;
  readonly majorDivisions: number;
  readonly minorTicksPerMajor: number;
  readonly labelDivisor?: number;
  readonly redlineFraction?: number;
  readonly majorTickColor: string;
  readonly minorTickColor: string;
  readonly labelColor: string;
  /** Embedded digital speed, used only by the 6AT centre tachometer. */
  readonly embeddedSpeedKmh?: number;
}

const drawBeveledPanel = (
  context: CanvasRenderingContext2D,
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

/**
 * Shared circular dial for the 6AT and 7DCT faces. It reuses the existing
 * arc geometry (and therefore the existing needle sweep) so both new faces
 * stay consistent with the two original analogue clusters.
 */
const drawStyledDialArtwork = (options: StyledDialOptions): HTMLCanvasElement => {
  const canvas = createCanvas(FACE_SIZE, FACE_SIZE);
  const context = canvas.getContext('2d');
  if (context === null) return canvas;
  const center = FACE_SIZE / 2;
  const tickRadius = FACE_SIZE * 0.405;
  const radiusFactor = 0.947;
  const theme = options.colors;
  const arcStart = options.arcStart ?? ARC_START, arcEnd = options.arcEnd ?? ARC_END;
  context.clearRect(0, 0, FACE_SIZE, FACE_SIZE);

  // Machined bezel: dark outer shell, thin silver ring. Deliberately quiet so
  // the face reads as a traditional mechanical instrument.
  context.fillStyle = theme?.bezelOuter ?? '#2a3035';
  context.beginPath();
  context.arc(center, center, center * radiusFactor + 26, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = theme?.bezelInner ?? '#0a0d0f';
  context.beginPath();
  context.arc(center, center, center * radiusFactor + 22, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = theme?.bezelEdge ?? '#9aa4a9';
  context.lineWidth = 3;
  context.beginPath();
  context.arc(center, center, center * radiusFactor + 14, 0, Math.PI * 2);
  context.stroke();

  const background = context.createRadialGradient(
    center,
    center * 0.9,
    FACE_SIZE * 0.08,
    center,
    center,
    center * 0.95,
  );
  background.addColorStop(0, theme?.faceCenter ?? '#101315');
  background.addColorStop(0.72, theme?.faceMiddle ?? '#08090b');
  background.addColorStop(1, theme?.faceEdge ?? '#030404');
  if (options.visualProfile) {
    background.addColorStop(.25, '#17202a');
    background.addColorStop(.85, '#080e15');
  }
  context.save();
  context.beginPath();
  context.arc(center, center, center - 4, 0, Math.PI * 2);
  context.clip();
  context.fillStyle = background;
  context.fillRect(0, 0, FACE_SIZE, FACE_SIZE);
  context.restore();

  // A solid band reads as a redline zone; tinting single ticks alone does not.
  if (options.redlineFraction !== undefined) {
    const redStart = THREE.MathUtils.lerp(
      arcStart,
      arcEnd,
      clamp01(options.redlineFraction),
    );
    context.strokeStyle = theme?.redline ?? '#d2453c';
    context.lineWidth = options.visualProfile?.redlineWidth ?? 11;
    context.beginPath();
    context.arc(
      center,
      center,
      tickRadius + 21,
      redStart - Math.PI / 2,
      arcEnd - Math.PI / 2,
    );
    context.stroke();
  }

  const totalMinorTicks = options.majorDivisions * options.minorTicksPerMajor;
  for (let index = 0; index <= totalMinorTicks; index += 1) {
    const fraction = index / totalMinorTicks;
    const angle = THREE.MathUtils.lerp(arcStart, arcEnd, fraction);
    const isMajor = index % options.minorTicksPerMajor === 0;
    const innerRadius = tickRadius - (isMajor ? 34 : 20);
    const outerRadius = tickRadius + 3;
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    const inRed = options.redlineFraction !== undefined &&
      fraction >= options.redlineFraction;
    context.strokeStyle = inRed
      ? '#e8534a'
      : isMajor ? options.majorTickColor : options.minorTickColor;
    context.lineWidth = options.visualProfile ? (isMajor ? 3.8 : 1.6) : isMajor ? 6 : 2.5;
    context.beginPath();
    context.moveTo(center + sin * innerRadius, center - cos * innerRadius);
    context.lineTo(center + sin * outerRadius, center - cos * outerRadius);
    context.stroke();

    if (!isMajor) continue;
    const labelRadius = tickRadius - 95;
    const rawValue = options.maximum * fraction;
    const displayedValue = rawValue / (options.labelDivisor ?? 1);
    context.fillStyle = inRed ? '#f07068' : options.labelColor;
    context.font = '600 26px Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(
      Math.round(displayedValue).toString(),
      center + sin * labelRadius,
      center - cos * labelRadius,
    );
  }

  if (options.visualProfile || theme) {
    const ringColor = theme?.ringColor ?? options.visualProfile!.ringColor;
    context.save();
    for (const [radius, width, alpha] of [[247, 1, .35], [240, 2, .78], [234, 1, .18]] as const) {
      context.globalAlpha = alpha; context.strokeStyle = ringColor;
      context.lineWidth = width; context.shadowColor = ringColor; context.shadowBlur = radius === 240 ? 5 : 0;
      context.beginPath(); context.arc(center, center, radius, 0, Math.PI * 2); context.stroke();
    }
    context.restore();
  }
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  if (options.embeddedSpeedKmh !== undefined) {
    // 6AT only: an integrated digital speed. It sits in the narrow band above
    // the needle hub because the steering-wheel rim crosses this face at about
    // local y = -0.01, so anything lower is hidden from the driver's eye.
    context.fillStyle = '#dfe6e6';
    context.font = '700 46px Consolas, monospace';
    context.fillText(
      Math.round(options.embeddedSpeedKmh).toString().padStart(3, '0'),
      center,
      center - 100,
    );
    context.fillStyle = '#8f999e';
    context.font = '600 21px Arial, sans-serif';
    context.fillText('km/h', center, center - 66);
    context.fillStyle = '#7f898e';
    context.font = '700 20px Arial, sans-serif';
    context.fillText(options.unit, center, center + 150);
  } else {
    context.fillStyle = '#c8cfd2';
    context.font = '700 26px Arial, sans-serif';
    context.fillText(options.label, center, center + 88);
    context.fillStyle = '#8a9296';
    context.font = '500 21px Arial, sans-serif';
    context.fillText(options.unit, center, center + 118);
  }
  return canvas;
};

const drawWingBody = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  topColor: string,
  bottomColor: string,
): void => {
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, topColor);
  gradient.addColorStop(1, bottomColor);
  context.fillStyle = gradient;
  drawBeveledPanel(context, 8, 8, width - 16, height - 16, 26);
  context.fill();
  context.strokeStyle = 'rgba(150, 160, 165, 0.22)';
  context.lineWidth = 3;
  context.stroke();
};

const drawRoundedBar = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  fraction: number,
  fillColor: string,
): void => {
  const radius = height / 2;
  drawBeveledPanel(context, x, y, width, height, radius);
  context.fillStyle = '#1a1e21';
  context.fill();
  const fillWidth = width * clamp01(fraction);
  if (fillWidth > height * 0.5) {
    drawBeveledPanel(context, x, y, fillWidth, height, radius);
    context.fillStyle = fillColor;
    context.fill();
  }
};

type StatusLamp = readonly [label: string, active: boolean | undefined, color: string];

/**
 * One fixed lamp row of one cluster face. Slots are allocated from this table
 * only, never from the currently active subset, and a `null` label is a
 * reserved empty cell that keeps the mirrored columns aligned.
 */
interface StatusLampRow {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly labels: readonly (string | null)[];
}

/**
 * The physical status-lamp set shared by every cluster face. Conditions and
 * colours are the ones the classic sedan LCD already used, so a lamp means the
 * same thing on all four faces; only the presentation differs.
 */
const instrumentStatusLamps = (
  state: InstrumentIndicatorState,
): readonly StatusLamp[] => [
  ['◀', state.leftTurn, '#5aff71'],
  ['P', state.parkingBrake, '#ff4e4e'],
  ['LO', state.headlights === true && state.highBeam !== true, '#72e58a'],
  ['HI', state.highBeam, '#559dff'],
  ['POS', state.positionLights, '#72e58a'],
  ['FRFOG', state.frontFogLights ?? state.fogLights, '#72e58a'],
  ['RRFOG', state.rearFogLights ?? state.fogLights, '#e5bc54'],
  ['ENG', state.engineWarning, '#ffc247'],
  ['BAT', state.batteryWarning, '#ff4e4e'],
  ['ABS', state.absWarning, '#ffc247'],
  ['SKID', state.tcsActive, '#ffc247'],
  ['TCS OFF', state.tcsOff || state.escOff, '#ffc247'],
  ['CRUISE', state.cruise, '#72e58a'],
  ['▶', state.rightTurn, '#5aff71'],
];

const STATUS_LAMP_STROKE = '#0a1715';
const assistOffLabel = (state: InstrumentIndicatorState): string =>
  state.escOff ? (state.tcsOff ? 'TCS/ESC OFF' : 'ESC OFF') : 'TCS OFF';

const drawStatusLamp = (
  context: CanvasRenderingContext2D,
  label: string,
  color: string,
  x: number,
  y: number,
  fontSize: number,
): void => {
  context.save(); context.translate(x,y); context.scale(fontSize/24,fontSize/24);
  context.strokeStyle=color; context.fillStyle=color; context.lineWidth=1.9;
  context.lineJoin='round'; context.lineCap='round'; context.shadowColor=color; context.shadowBlur=4;
  const path = (points: readonly (readonly [number,number])[], close=false): void => {
    context.beginPath(); context.moveTo(...points[0]!); points.slice(1).forEach(p=>context.lineTo(...p));
    if(close) context.closePath(); context.stroke();
  };
  const bulb = (rear=false, dipped=false, fog=false): void => {
    context.save(); if(rear) context.scale(-1,1);
    context.beginPath(); context.moveTo(0,-8); context.bezierCurveTo(12,-7,12,7,0,8); context.closePath(); context.stroke();
    for(const y of [-6,0,6]) path([[-13,y+(dipped?4:0)],[-4,y]]);
    if(fog) { context.beginPath(); context.moveTo(-8,-10); context.bezierCurveTo(-4,-5,-12,0,-8,5);
      context.bezierCurveTo(-4,8,-9,10,-8,12); context.stroke(); }
    context.restore();
  };
  if(label==='◀' || label==='▶') {
    context.save(); if(label==='▶') context.scale(-1,1);
    path([[-12,0],[-2,-9],[-2,-4],[11,-4],[11,4],[-2,4],[-2,9]],true); context.fill(); context.restore();
  } else if(label==='HI' || label==='HIGH') bulb();
  else if(label==='LO' || label==='LOW') bulb(false,true);
  else if(label==='FRFOG') bulb(false,true,true);
  else if(label==='RRFOG') bulb(true,false,true);
  else if(label==='FOG') {
    context.save(); context.translate(-7,0); context.scale(.6,.6); context.strokeStyle='#72e58a'; bulb(false,true,true); context.restore();
    context.save(); context.translate(7,0); context.scale(.6,.6); context.strokeStyle='#e5bc54'; bulb(true,false,true); context.restore();
  } else if(label==='POS') {
    for(const sign of [-1,1]) { context.save(); context.scale(sign*.6,.8); context.translate(8,0); bulb(); context.restore(); }
  } else if(label==='ENG' || label==='ENGINE') {
    path([[-12,-5],[-6,-5],[-6,-9],[4,-9],[4,-5],[9,-5],[12,-1],[12,6],[8,6],[5,10],[-6,10],[-6,5],[-12,5]],true);
    path([[-1,-9],[-1,-12],[5,-12]]); path([[-15,-4],[-15,5]]);
  } else if(label==='BAT') {
    context.strokeRect(-12,-7,24,16); context.strokeRect(-9,-10,5,3); context.strokeRect(4,-10,5,3);
    path([[-8,1],[-3,1]]); path([[4,1],[9,1]]); path([[6.5,-1.5],[6.5,3.5]]);
  } else if(label==='CRUISE') {
    context.beginPath(); context.arc(0,1,10,Math.PI*.9,Math.PI*2.1); context.stroke();
    for(const angle of [Math.PI,Math.PI*1.25,Math.PI*1.5,Math.PI*1.75,Math.PI*2])
      path([[Math.cos(angle)*8,1+Math.sin(angle)*8],[Math.cos(angle)*6,1+Math.sin(angle)*6]]);
    path([[0,1],[5,-4]]); path([[-4,8],[10,8],[7,5]]); path([[10,8],[7,11]]);
  } else if(label==='SKID' || label==='TCS OFF' || label==='ESC OFF' || label==='TCS/ESC OFF') {
    path([[-8,1],[-7,-8],[-4,-12],[4,-12],[7,-8],[8,1]],true); path([[-5,-7],[5,-7]]);
    for(const side of [-1,1]) { context.beginPath(); context.moveTo(side*5,3);
      context.bezierCurveTo(side*9,5,side*1,7,side*5,9); context.stroke(); }
    if(label!=='SKID') { context.font='bold 6px Arial'; context.textAlign='center';
      context.fillText(label,0,15); }
  } else if(label==='P' || label==='PARK' || label==='ABS') {
    context.beginPath(); context.arc(0,0,9,0,Math.PI*2); context.stroke();
    context.beginPath(); context.arc(0,0,13,Math.PI*.77,Math.PI*1.23); context.stroke();
    context.beginPath(); context.arc(0,0,13,-Math.PI*.23,Math.PI*.23); context.stroke();
    context.font=`bold ${label==='ABS'?8:14}px Arial`; context.textAlign='center'; context.textBaseline='middle';
    context.fillText(label==='ABS'?'ABS':'P',0,.5);
  }
  context.restore();
};

/**
 * Compact status lamp panel for the narrower 6AT wings and 7DCT centre display.
 * Allocate slots from the authored label list, never the active subset, so the
 * cell of every lamp is fixed. Switching a lamp changes brightness only; no
 * active-count reflow. A `null` label reserves an empty cell.
 */
const drawCompactStatusLamps = (
  context: CanvasRenderingContext2D,
  state: InstrumentIndicatorState,
  x: number,
  y: number,
  width: number,
  height: number,
  labels?: readonly (string | null)[],
): void => {
  context.save();
  context.fillStyle = STATUS_LAMP_STROKE;
  drawBeveledPanel(context, x, y, width, height, 9);
  context.fill();

  const inventory = instrumentStatusLamps(state);
  const lamps: readonly (StatusLamp | null)[] = labels === undefined
    ? inventory
    : labels.map(label => label === null
      ? null
      : inventory.find(lamp => lamp[0] === label) ?? null);
  const columns = Math.min(7,lamps.length), rows = Math.ceil(lamps.length/columns);
  const rowHeight = height / rows;
  const fontSize = Math.min(26,rowHeight*.8,width/columns*.72);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  lamps.forEach((lamp,index) => {
    if(lamp===null || lamp[1]!==true) return;
    const [label,,color] = lamp;
    drawStatusLamp(context,label === 'TCS OFF' ? assistOffLabel(state) : label,color,x+width/columns*(index%columns+.5),
      y+rowHeight*(Math.floor(index/columns)+.5),fontSize);
  });
  context.shadowBlur = 0;
  context.restore();
};

/**
 * Fixed lamp layout tables. Every face draws whole rows from one of these, so a
 * category keeps one region and no lamp can move when another one lights up.
 *
 * Twin-dial centre LCD (512 x 240) shared by the driving-school 5MT and the CVT
 * sedan: seven equal cells per row. The turn lamps own the two outer cells of
 * the upper row and therefore share one horizontal line, mirrored about the
 * cluster centre, with the lighting group between them. The lower row carries
 * the vehicle-status group on the left and the driver-assist group on the
 * right. Both rows stay above the speed/gear readout.
 */
const CENTRE_LCD_LAMP_ROWS: readonly StatusLampRow[] = [
  { x: 16, y: 10, width: 480, height: 30,
    labels: ['◀', 'POS', 'LO', 'HI', 'FRFOG', 'RRFOG', '▶'] },
  { x: 16, y: 42, width: 480, height: 30,
    labels: ['P', 'ENG', 'BAT', 'ABS', 'SKID', 'TCS OFF', 'CRUISE'] },
];

/**
 * 6AT wings (240 x 400 each, mirrored about the central tachometer). Both wings
 * use the same two bands and the same four cell centres, so the outer cells of
 * the upper band are exact mirrors: the left turn lamp sits at the outer left
 * and the right turn lamp at the outer right, on the same height. The upper
 * band holds the lighting group, the lower band the vehicle-status and
 * driver-assist groups; the two reserved cells face the central dial so it
 * keeps its full visual weight.
 */
const CX4_LEFT_LAMP_ROWS: readonly StatusLampRow[] = [
  { x: 20, y: 14, width: 200, height: 26,
    labels: ['◀', 'POS', 'LO', 'HI'] },
  { x: 20, y: 268, width: 200, height: 26,
    labels: ['P', 'ENG', 'BAT', null] },
];
const CX4_RIGHT_LAMP_ROWS: readonly StatusLampRow[] = [
  // Canvas x grows away from the tachometer here, so this row mirrors the left
  // upper band read right to left.
  { x: 20, y: 14, width: 200, height: 26,
    labels: [null, 'RRFOG', 'FRFOG', '▶'] },
  { x: 20, y: 268, width: 200, height: 26,
    labels: ['CRUISE', 'TCS OFF', 'SKID', 'ABS'] },
];

/**
 * 7DCT centre display (240 x 400): the same two-row, seven-cell arrangement as
 * the twin-dial LCD, tightened to the narrower screen and kept clear of the
 * gear and speed readouts below it.
 */
const JETTA_CENTRE_LAMP_ROWS: readonly StatusLampRow[] = [
  { x: 18, y: 22, width: 204, height: 22,
    labels: ['◀', 'POS', 'LO', 'HI', 'FRFOG', 'RRFOG', '▶'] },
  { x: 18, y: 46, width: 204, height: 22,
    labels: ['P', 'ENG', 'BAT', 'ABS', 'SKID', 'TCS OFF', 'CRUISE'] },
];

/** Draws one face's complete, fixed lamp layout. */
const drawStatusLampRows = (
  context: CanvasRenderingContext2D,
  state: InstrumentIndicatorState,
  rows: readonly StatusLampRow[],
): void => {
  for (const row of rows) {
    drawCompactStatusLamps(context, state, row.x, row.y, row.width, row.height, row.labels);
  }
};

const drawCx4LeftWing = (
  gearSelector: string,
  physicalGear: number | null,
  maximumForwardGear: number,
  indicators: InstrumentIndicatorState,
): HTMLCanvasElement => {
  const width = 240;
  const height = 400;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  if (context === null) return canvas;
  context.clearRect(0, 0, width, height);
  drawWingBody(context, width, height, '#15181b', '#08090a');
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  context.fillStyle = '#828b90';
  context.font = '700 19px Arial, sans-serif';
  context.fillText('GEAR', width / 2, 54);

  // In D the large glyph is the engaged ratio, so this wing never shows a
  // bare "D" while the driver wants to know which ratio is actually in use.
  const inDrive = gearSelector === 'D';
  const primaryLabel = inDrive && physicalGear !== null
    ? physicalGear.toString()
    : gearSelector;
  context.fillStyle = '#f0f3f0';
  context.font = '700 100px Arial, sans-serif';
  context.fillText(primaryLabel, width / 2, 116);

  context.strokeStyle = 'rgba(150, 160, 165, 0.18)';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(40, 180);
  context.lineTo(width - 40, 180);
  context.stroke();

  if (inDrive && physicalGear !== null) {
    const count = Math.max(maximumForwardGear, physicalGear);
    const spanWidth = width - 56;
    const cell = spanWidth / count;
    for (let gear = 1; gear <= count; gear += 1) {
      const x = 28 + cell * (gear - 0.5);
      if (gear === physicalGear) {
        drawBeveledPanel(context, x - cell * 0.4, 206, cell * 0.8, 38, 7);
        context.fillStyle = '#eef2ef';
        context.fill();
        context.fillStyle = '#111416';
        context.font = '700 26px Arial, sans-serif';
      } else {
        context.fillStyle = '#5b6367';
        context.font = '600 22px Arial, sans-serif';
      }
      context.fillText(gear.toString(), x, 225);
    }
  }

  // Reuses the sedan's lamp conditions and colours in the fixed 6AT bands.
  drawStatusLampRows(context, indicators, CX4_LEFT_LAMP_ROWS);

  context.fillStyle = '#6d7579';
  context.font = '700 17px Arial, sans-serif';
  context.fillText('SELECTOR', width / 2, 330);
  context.fillStyle = '#9aa3a7';
  context.font = '700 22px Arial, sans-serif';
  context.fillText('P   R   N   D', width / 2, 362);
  return canvas;
};

const drawCx4RightWing = (
  fuelLevel: number,
  temperatureC: number,
  indicators: InstrumentIndicatorState = {},
): HTMLCanvasElement => {
  const width = 240;
  const height = 400;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  if (context === null) return canvas;
  context.clearRect(0, 0, width, height);
  drawWingBody(context, width, height, '#15181b', '#08090a');
  // Mirrors the left wing's bands so both turn lamps share one height.
  drawStatusLampRows(context, indicators, CX4_RIGHT_LAMP_ROWS);
  const barX = 30;
  const barWidth = width - 60;

  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillStyle = '#828b90';
  context.font = '700 19px Arial, sans-serif';
  context.fillText('FUEL', barX, 62);
  context.textAlign = 'right';
  context.fillStyle = fuelLevel < 0.14 ? '#f0b45a' : '#dfe6e6';
  context.font = '700 22px Arial, sans-serif';
  context.fillText(`${Math.round(fuelLevel * 100)}%`, barX + barWidth, 62);
  drawRoundedBar(context, barX, 84, barWidth, 17, fuelLevel, '#e8ece9');
  context.fillStyle = '#6d7579';
  context.font = '700 17px Arial, sans-serif';
  context.textAlign = 'left';
  context.fillText('E', barX, 120);
  context.textAlign = 'right';
  context.fillText('F', barX + barWidth, 120);

  const temperatureFraction = clamp01((temperatureC - 50) / 80);
  context.textAlign = 'left';
  context.fillStyle = '#828b90';
  context.font = '700 19px Arial, sans-serif';
  context.fillText('TEMP', barX, 192);
  context.textAlign = 'right';
  context.fillStyle = temperatureC >= 110 ? '#ef6a5f' : '#dfe6e6';
  context.font = '700 22px Arial, sans-serif';
  context.fillText(`${Math.round(temperatureC)}\u00B0C`, barX + barWidth, 192);
  drawRoundedBar(context, barX, 214, barWidth, 17, temperatureFraction, '#e8ece9');
  context.fillStyle = '#6d7579';
  context.font = '700 17px Arial, sans-serif';
  context.textAlign = 'left';
  context.fillText('C', barX, 250);
  context.textAlign = 'right';
  context.fillText('H', barX + barWidth, 250);
  return canvas;
};

const drawJettaCentreDisplay = (
  speedKmh: number,
  gearSelector: string,
  physicalGear: number | null,
  fuelLevel: number,
  indicators: InstrumentIndicatorState,
): HTMLCanvasElement => {
  const width = 240;
  const height = 400;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  if (context === null) return canvas;
  context.clearRect(0, 0, width, height);
  const background = context.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, '#0a0d0e');
  background.addColorStop(1, '#050607');
  context.fillStyle = background;
  drawBeveledPanel(context, 6, 6, width - 12, height - 12, 20);
  context.fill();
  context.strokeStyle = 'rgba(150, 160, 165, 0.2)';
  context.lineWidth = 2.5;
  context.stroke();

  // Fixed two-row lamp layout. It reuses the sedan's lamp conditions and
  // colours, so lights, turn signals, parking brake and engine/battery warnings
  // read the same as on the manual car; only the arrangement is new.
  drawStatusLampRows(context, indicators, JETTA_CENTRE_LAMP_ROWS);

  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#6f787c';
  context.font = '700 17px Arial, sans-serif';
  context.fillText(gearSelector === 'D' && physicalGear !== null
    ? `GEAR  D${physicalGear}`
    : `GEAR  ${gearSelector}`, width / 2, 86);

  // The preselected DCT ratio is the signature readout, so it owns the largest
  // type on the face and is never shrunk to fit a secondary row.
  context.fillStyle = '#f1f4f1';
  if (gearSelector === 'D' && physicalGear !== null) {
    context.font = '700 66px Arial, sans-serif';
    context.fillText(`D${physicalGear}`, width / 2, 142);
  } else {
    context.font = '700 88px Arial, sans-serif';
    context.fillText(gearSelector, width / 2, 146);
  }

  const separator = (y: number): void => {
    context.strokeStyle = 'rgba(150, 160, 165, 0.16)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(30, y);
    context.lineTo(width - 30, y);
    context.stroke();
  };
  separator(186);

  context.fillStyle = '#6f787c';
  context.font = '700 16px Arial, sans-serif';
  context.fillText('SELECTOR', width / 2, 212);
  context.fillStyle = '#9aa3a7';
  context.font = '700 21px Arial, sans-serif';
  context.fillText('P   R   N   D', width / 2, 244);

  separator(280);

  context.fillStyle = '#f1f4f1';
  context.font = '700 54px Consolas, monospace';
  context.fillText(Math.round(speedKmh).toString().padStart(3, '0'), width / 2, 314);
  context.fillStyle = '#6f787c';
  context.font = '700 16px Arial, sans-serif';
  context.fillText('km/h', width / 2, 344);

  context.textAlign = 'left';
  context.fillStyle = '#6f787c';
  context.font = '700 15px Arial, sans-serif';
  context.fillText('FUEL', 30, 372);
  context.textAlign = 'right';
  context.fillStyle = fuelLevel < 0.14 ? '#f0b45a' : '#dfe6e6';
  context.fillText(`${Math.round(fuelLevel * 100)}%`, width - 30, 372);
  drawRoundedBar(context, 30, 382, width - 60, 10, fuelLevel, '#e8ece9');
  return canvas;
};

/** Backlit blue-violet accents on a nearly black production-car face. */
const SUV_ACCENT = '#394395';
const SUV_ACCENT_BRIGHT = '#939bed';
const SUV_TEXT = '#e4e7ee';
const SUV_TEXT_DIM = '#818792';
const SUV_TEXT_SOFT = '#b9bec9';
const SUV_GAUGE_COLORS = { hot: '#d84a43', normal: '#bdc3ce', low: '#d5a453' } as const;
const SUV_MODE_LABELS: Readonly<Record<string, string>> = { ECO: 'Eco', NORMAL: 'Normal', SPORT: 'Sport' };
const SUV_DIAL_ARC = { start: -Math.PI * .75, end: Math.PI * .75 } as const;
const SUV_SPEED_MARKS = Object.freeze([0, 20, 40, 60, 100, 140, 180, 220, 280]);

/** Display scales only: leave vehicle and powertrain calibration untouched. */
export const getSuvInstrumentScales = (config: Pick<InstrumentClusterConfig, 'maximumRPM' | 'maximumSpeedKmh'>) => ({
  rpm: Math.max(8000, Math.ceil(finiteOr(config.maximumRPM, 8000) / 1000) * 1000),
  speed: Math.max(280, Math.ceil(finiteOr(config.maximumSpeedKmh, 280) / 20) * 20),
});

/** The reference's expanded low-speed scale; ticks and pointer share this mapping. */
export const suvSpeedFraction = (speedKmh: number, maximum: number): number => {
  const value = clamp01(finiteOr(speedKmh, 0) / maximum) * 280;
  for (let i = 1; i < SUV_SPEED_MARKS.length; i++) {
    const low = SUV_SPEED_MARKS[i - 1]!, high = SUV_SPEED_MARKS[i]!;
    if (value <= high) return (i - 1 + (value - low) / (high - low)) / 8;
  }
  return 1;
};
const suvAngle = (fraction: number): number =>
  THREE.MathUtils.lerp(SUV_DIAL_ARC.start, SUV_DIAL_ARC.end, clamp01(fraction));

/** Cached scale artwork: open arcs, dense short ticks, and no filled bezel or side gauge. */
const drawSuvDial = (maximum: number, tach: boolean, redlineRPM = maximum): HTMLCanvasElement => {
  const layout = SUV_INSTRUMENT_CLUSTER_LAYOUT;
  const canvas = createCanvas(460, 460), context = canvas.getContext('2d');
  if (context === null) return canvas;
  const center = 230, ring = layout.dialRingRadius, tickRadius = layout.dialRadius - 4;
  const paint = context.createLinearGradient(0, 0, 460, 460);
  paint.addColorStop(0, '#283876'); paint.addColorStop(.55, '#424599'); paint.addColorStop(1, '#353c82');
  context.strokeStyle = paint; context.lineWidth = 4;
  context.shadowColor = SUV_ACCENT; context.shadowBlur = 3;
  context.beginPath(); context.arc(center, center, ring, suvAngle(0) - Math.PI / 2, suvAngle(1) - Math.PI / 2);
  context.stroke(); context.shadowBlur = 0;
  const divisions = tach ? maximum / 1000 : 8, density = 10;
  for (let i = 0; i <= divisions * density; i++) {
    const fraction = i / (divisions * density), angle = suvAngle(fraction);
    const major = i % density === 0, half = i % density === 5;
    const inner = tickRadius - (major ? 13 : half ? 7 : 3);
    const red = tach && fraction * maximum >= redlineRPM;
    context.strokeStyle = red && (major || half) ? '#a33337' : major ? '#c6cad3' : '#747982';
    context.lineWidth = major ? 2.3 : 1.3;
    context.beginPath();
    context.moveTo(center + Math.sin(angle) * inner, center - Math.cos(angle) * inner);
    context.lineTo(center + Math.sin(angle) * tickRadius, center - Math.cos(angle) * tickRadius);
    context.stroke();
    if (!major) continue;
    const value = tach ? i / density : Math.round(SUV_SPEED_MARKS[i / density]! * maximum / 280);
    context.fillStyle = SUV_TEXT;
    context.font = `italic 500 ${tach ? 34 : 31}px "Segoe UI", Arial, sans-serif`;
    context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText(String(value), center + Math.sin(angle) * 177, center - Math.cos(angle) * 177);
  }
  if (tach) {
    suvText(context, 'rpm', center - 100, center + 84, 15, SUV_TEXT_SOFT);
    suvText(context, '× 1000', center - 100, center + 102, 14, SUV_TEXT_SOFT);
  }
  return canvas;
};
/** Slim outlined pictograms for the SUV status row, drawn at a stable size. */
const suvPictogram = (
  context: CanvasRenderingContext2D,
  kind: 'temp' | 'fuel' | 'clock' | 'compass' | 'media' | 'lanes' | 'cruise' | 'range',
  x: number,
  y: number,
  size: number,
  color: string,
): void => {
  context.save();
  context.translate(x, y); context.scale(size / 24, size / 24);
  context.strokeStyle = color; context.fillStyle = color;
  context.lineWidth = 1.9; context.lineJoin = 'round'; context.lineCap = 'round';
  const path = (points: readonly (readonly [number, number])[], close = false): void => {
    context.beginPath(); context.moveTo(points[0]![0], points[0]![1]);
    points.slice(1).forEach(p => context.lineTo(p[0], p[1]));
    if (close) context.closePath();
    context.stroke();
  };
  if (kind === 'temp') {
    path([[-2, 1], [-2, -9], [2, -9], [2, 1]]);
    context.beginPath(); context.arc(0, 3, 3, -Math.PI / 4, Math.PI * 1.25); context.stroke();
    path([[0, -6], [0, 3]]); path([[3, -5], [6, -5]]); path([[3, -1], [6, -1]]);
    for (const yWave of [8, 12]) path([[-10, yWave], [-6, yWave - 2], [-2, yWave], [2, yWave - 2], [6, yWave], [10, yWave - 2]]);
  } else if (kind === 'fuel') {
    path([[-4, -9], [4, -9], [4, 7], [-4, 7]], true);
    path([[-4, -5], [-1.6, -5], [-1.6, -1], [-4, -1]]);
    context.beginPath(); context.moveTo(5, -3); context.lineTo(8, -3); context.lineTo(8, 5);
    context.quadraticCurveTo(10, 9, 11, 5); context.lineTo(11, -6); context.lineTo(8, -10); context.stroke();
  } else if (kind === 'range') {
    path([[-9, -4], [7, -4], [7, 4], [-9, 4]], true);
    path([[7, -2], [10, -2], [10, 2], [7, 2]]);
    context.fillRect(-7, -2.4, 4, 4.8); context.fillRect(-2, -2.4, 4, 4.8);
  } else if (kind === 'clock') {
    context.beginPath(); context.arc(0, 0, 8.6, 0, Math.PI * 2); context.stroke();
    path([[0, 0], [0, -5]]); path([[0, 0], [4, 1.4]]);
  } else if (kind === 'compass') {
    path([[0, -9], [5.4, 7], [0, 3.4], [-5.4, 7]], true);
  } else if (kind === 'media') {
    path([[-9, -4], [-9, 5], [9, 5], [9, -4], [-9, -4]]);
    path([[-4, 5], [-4, -1.6], [5, -3.4], [5, 5]]);
    context.beginPath(); context.arc(-6, 5.6, 2.2, 0, Math.PI * 2); context.fill();
    context.beginPath(); context.arc(3, 5.6, 2.2, 0, Math.PI * 2); context.fill();
  } else if (kind === 'lanes') {
    path([[-8, 8], [-2.4, -8]]); path([[8, 8], [2.4, -8]]);
    for (let i = -1; i <= 1; i++) path([[i * 3.4, 6], [i * 1.4, 2]]);
  } else {
    context.beginPath(); context.arc(0, 1, 8, Math.PI * .92, Math.PI * 2.08); context.stroke();
    path([[0, 1], [4.4, -3.4]]);
    for (const a of [Math.PI, Math.PI * 1.25, Math.PI * 1.5, Math.PI * 1.75, Math.PI * 2]) {
      path([[Math.cos(a) * 6.6, 1 + Math.sin(a) * 6.6], [Math.cos(a) * 4.8, 1 + Math.sin(a) * 4.8]]);
    }
  }
  context.restore();
};

const suvText = (
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
  color: string = SUV_TEXT,
  weight: 400 | 500 | 600 | 700 = 500,
  align: CanvasTextAlign = 'center',
): void => {
  context.fillStyle = color;
  context.font = `${weight} ${size}px "Segoe UI", "Microsoft YaHei", Arial, sans-serif`;
  context.textAlign = align; context.textBaseline = 'middle';
  context.fillText(value, x, y);
};

const suvDriveTime = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}`
    : `${minutes}:${String(total % 60).padStart(2, '0')}`;
};

interface SuvFaceOptions {
  readonly canvas: HTMLCanvasElement;
  readonly tachArtwork: HTMLCanvasElement;
  readonly speedArtwork: HTMLCanvasElement;
  readonly maximumRPM: number;
  readonly maximumSpeedKmh: number;
  readonly speedKmh: number;
  readonly rpm: number;
  readonly gear: InstrumentGear;
  readonly driveMode: string;
  readonly cruiseActive: boolean;
  readonly cruiseTargetKmh: number | null;
  readonly fuelLevel: number;
  readonly fuelRangeKm: number | null;
  readonly temperatureC: number;
  readonly indicators: InstrumentIndicatorState;
  readonly data: ExecutiveDisplayData | undefined;
  readonly lanePoints: ExecutiveDisplayData['lanes'];
  readonly laneMarkings: readonly ('solid' | 'dashed')[];
  readonly laneOpacity: number;
  readonly backlight: number;
  readonly wake: number;
  readonly pageTime: number;
}

/** Paint directly into the installed texture canvas; no per-refresh canvas allocation. */
const drawSuvVirtualFace = (options: SuvFaceOptions): void => {
  const layout = SUV_INSTRUMENT_CLUSTER_LAYOUT, context = options.canvas.getContext('2d');
  if (context === null) return;
  context.fillStyle = '#030405'; context.fillRect(0, 0, options.canvas.width, options.canvas.height);
  context.save();
  context.globalAlpha = options.backlight * THREE.MathUtils.smoothstep(options.wake, .10, .40);
  context.drawImage(options.tachArtwork, layout.tachCenterX - 230, layout.dialCenterY - 230);
  context.drawImage(options.speedArtwork, layout.speedoCenterX - 230, layout.dialCenterY - 230);
  const needle = (x: number, fraction: number): void => {
    context.save(); context.translate(x, layout.dialCenterY); context.rotate(suvAngle(fraction));
    const paint = context.createLinearGradient(0, 0, 0, -layout.needleLength);
    paint.addColorStop(0, 'rgba(80,91,171,0)'); paint.addColorStop(.35, '#626fbb');
    paint.addColorStop(1, SUV_ACCENT_BRIGHT);
    context.strokeStyle = paint; context.lineWidth = 3; context.lineCap = 'round';
    context.shadowColor = SUV_ACCENT; context.shadowBlur = 3;
    context.beginPath(); context.moveTo(0, -12); context.lineTo(0, -layout.needleLength); context.stroke();
    context.restore();
  };
  needle(layout.tachCenterX, options.rpm / options.maximumRPM);
  needle(layout.speedoCenterX, suvSpeedFraction(options.speedKmh, options.maximumSpeedKmh));
  const gearLabel = formatInstrumentGear(options.gear);
  suvText(context, gearLabel, layout.tachCenterX, 405, gearLabel.length > 1 ? 30 : 35);
  suvText(context, 'km/h', layout.speedoCenterX, 376, 16, SUV_TEXT_SOFT);
  suvText(context, String(Math.round(options.speedKmh)), layout.speedoCenterX, 405, 36);
  drawSuvBottomGauges(context, options);
  drawSuvCentre(context, options);
  // Lamps own fixed slots, above page content and within the same ignition fade.
  drawSuvLamps(context, options);
  context.restore();
};

const drawSuvBottomGauges = (context: CanvasRenderingContext2D, options: SuvFaceOptions): void => {
  const layout = SUV_INSTRUMENT_CLUSTER_LAYOUT;
  const scale = (x: number, y: number, width: number, fraction: number, color: string): void => {
    context.strokeStyle = '#343841'; context.lineWidth = 2;
    context.beginPath(); context.moveTo(x, y); context.lineTo(x + width, y); context.stroke();
    context.strokeStyle = color; context.lineWidth = 3;
    const marker = x + clamp01(fraction) * width;
    context.beginPath(); context.moveTo(marker - 4, y); context.lineTo(marker + 4, y); context.stroke();
  };
  const coolant = layout.coolantRegion, fuel = layout.fuelRegion;
  const hot = options.temperatureC >= 115, low = options.data?.trip.fuel.lowFuel ?? options.fuelLevel < .14;
  scale(coolant.x, coolant.y + 5, coolant.width, (options.temperatureC - 50) / 80, hot ? SUV_GAUGE_COLORS.hot : SUV_TEXT_SOFT);
  context.fillStyle = '#943139'; context.fillRect(coolant.x + coolant.width - 26, coolant.y + 3, 26, 3);
  suvPictogram(context, 'temp', coolant.x + 12, coolant.y + 30, 25, hot ? SUV_GAUGE_COLORS.hot : SUV_TEXT_SOFT);
  suvText(context, String(Math.round(options.temperatureC)), coolant.x + 76, coolant.y + 30, 21);
  suvText(context, '°C', coolant.x + 103, coolant.y + 30, 17, SUV_TEXT_DIM, 500, 'left');
  scale(fuel.x, fuel.y + 5, fuel.width, options.fuelLevel, low ? SUV_GAUGE_COLORS.low : SUV_TEXT_SOFT);
  context.fillStyle = '#943139'; context.fillRect(fuel.x, fuel.y + 3, 18, 3);
  suvPictogram(context, 'fuel', fuel.x + 220, fuel.y + 30, 25, low ? SUV_GAUGE_COLORS.low : SUV_TEXT_SOFT);
  const range = options.fuelRangeKm !== null && Number.isFinite(options.fuelRangeKm)
    ? `${Math.max(0, Math.round(options.fuelRangeKm))} km` : '-- km';
  suvText(context, range, fuel.x + 140, fuel.y + 30, 21);
};

/** Each lamp retains its position when other lamps switch on or off. */
export const SUV_INSTRUMENT_LAMP_SLOTS = Object.freeze([
  ['◀', 464, 50, 24], ['▶', 826, 50, 24],
  ['POS', 556, 124, 20], ['LO', 600, 124, 20], ['HI', 644, 124, 20],
  ['FRFOG', 688, 124, 20], ['RRFOG', 732, 124, 20],
  ['P', 32, 472, 28], ['ENG', 1258, 472, 27], ['BAT', 32, 520, 23],
  ['ABS', 1258, 520, 23], ['SKID', 1258, 566, 23], ['TCS OFF', 32, 566, 22],
] as const);

const drawSuvLamps = (context: CanvasRenderingContext2D, options: SuvFaceOptions): void => {
  const inventory = instrumentStatusLamps(options.indicators);
  for (const [label, x, y, size] of SUV_INSTRUMENT_LAMP_SLOTS) {
    const lamp = inventory.find(item => item[0] === label);
    if (lamp?.[1]) drawStatusLamp(context, label === 'TCS OFF' ? assistOffLabel(options.indicators) : label, lamp[2], x, y, size);
  }
  if (options.temperatureC >= 115) suvPictogram(context, 'temp', 32, 370, 24, SUV_GAUGE_COLORS.hot);
};

/** Every dynamic central element is clipped to a disjoint, narrow authored region. */
const drawSuvCentre = (context: CanvasRenderingContext2D, options: SuvFaceOptions): void => {
  const layout = SUV_INSTRUMENT_CLUSTER_LAYOUT, region = layout.centerRegion;
  const centerX = region.x + region.width / 2;
  context.save(); context.beginPath(); context.rect(region.x, region.y, region.width, region.height); context.clip();
  // No heading is supplied by telemetry: show an unavailable compass, not a fictional bearing.
  suvPictogram(context, 'compass', 542, 86, 17, SUV_TEXT_SOFT);
  suvText(context, '--', 566, 86, 16, SUV_TEXT_DIM);
  suvText(context, options.data?.localTime ?? '--:--', 642, 86, 23);
  suvPictogram(context, 'lanes', 716, 86, 22, SUV_TEXT_SOFT);
  const ratio = parsePhysicalGear(options.gear);
  if (ratio !== null && ratio > 0) suvText(context, String(ratio), 753, 86, 19, SUV_ACCENT_BRIGHT);

  const page = layout.centerPageRegion, low = options.data?.trip.fuel.lowFuel ?? options.fuelLevel < .14;
  context.save(); context.beginPath(); context.rect(page.x, page.y, page.width, page.height); context.clip();
  context.globalAlpha *= THREE.MathUtils.smoothstep(options.pageTime, 0, .18);
  const overlay = options.data?.overlay;
  if (low) {
    drawSuvCar(context, centerX, 190);
    suvPictogram(context, 'fuel', centerX, 240, 31, SUV_GAUGE_COLORS.low);
    suvText(context, 'Please refuel.', centerX, 282, 24);
    suvText(context, options.fuelRangeKm === null ? 'Range -- km' : `Range ${Math.max(0, Math.round(options.fuelRangeKm))} km`,
      centerX, 319, 23);
  } else if (overlay !== null && overlay !== undefined && overlay.alpha > 0 && overlay.title !== 'CRUISE CONTROL') {
    // Mode notifications replace the page, never overlay either gauge.
    suvText(context, 'Drive mode', centerX, 212, 21, SUV_TEXT_DIM);
    suvText(context, SUV_MODE_LABELS[overlay.value] ?? overlay.value, centerX, 270, 32);
  } else if (options.data?.page === 'TRIP') {
    drawSuvTripPage(context, centerX, options);
  } else if (options.data?.page === 'MAP') {
    // The existing page-cycle slot becomes a compact information menu on this face only.
    suvText(context, 'Driving data', centerX, 170, 23);
    const rows = ['Avg. consumption', 'Driving time', 'Trip distance', 'Range'];
    rows.forEach((label, i) => suvText(context, label, centerX, 210 + i * 35, 20, i === 0 ? SUV_TEXT : SUV_TEXT_DIM));
    suvText(context, '›', page.x + 22, 210, 27, SUV_ACCENT_BRIGHT);
  } else if (options.data?.page === 'PARKING') {
    suvText(context, 'Parking assist', centerX, 170, 22, SUV_TEXT_SOFT);
    drawSuvCar(context, centerX, 234);
    drawRearParkingZones(context, options.data.rearParking, centerX, 283, page.width - 16);
    const nearest = options.data.rearParking?.zones.find(zone => zone.zone === options.data?.rearParking?.nearestZone);
    suvText(context, rearParkingText(options.data.rearParking), centerX, 337, 18, PROXIMITY_COLORS[nearest?.severity ?? 'NONE']);
  } else {
    suvText(context, SUV_MODE_LABELS[options.driveMode] ?? options.driveMode, centerX, 159, 17, SUV_TEXT_DIM);
    if (parseGearSelector(options.gear) === 'D') {
      drawSuvDrivingRoad(context, options);
    } else {
      suvText(context, 'Ready', centerX, 250, 24, SUV_TEXT_SOFT);
    }
  }
  context.restore();
  drawSuvAssist(context, options);
  context.restore();
};

const drawSuvTripPage = (context: CanvasRenderingContext2D, x: number, options: SuvFaceOptions): void => {
  const trip = options.data?.trip;
  suvText(context, 'Driving data', x, 163, 22, SUV_TEXT_SOFT);
  const rows: readonly (readonly [string, string])[] = [
    ['Trip distance', trip?.distanceKm === undefined ? '-- km' : `${Math.max(0, trip.distanceKm).toFixed(1)} km`],
    ['Avg. consumption', trip?.averageConsumptionLPer100km == null ? '-- L/100km' : `${trip.averageConsumptionLPer100km.toFixed(1)} L/100km`],
    ['Driving time', suvDriveTime(trip?.seconds ?? 0)],
  ];
  rows.forEach(([label, value], i) => {
    suvText(context, label, x, 199 + i * 57, 17, SUV_TEXT_DIM);
    suvText(context, value, x, 224 + i * 57, 23);
  });
};

/** Driving lanes occupy the main center page; no standalone car or trip block. */
const drawSuvDrivingRoad = (context: CanvasRenderingContext2D, options: SuvFaceOptions): void => {
  const r = SUV_INSTRUMENT_CLUSTER_LAYOUT.centerPageRegion, x = r.x + r.width / 2;
  const project = (p: { x: number; forward: number }) => {
    const f = Math.max(0, p.forward);
    return { x: x + p.x * 46 / (1 + f / 10), y: 334 - 180 * f / (f + 12) };
  };
  const live = options.lanePoints.length >= 2 && options.laneOpacity > .005;
  const surface = context.createLinearGradient(0, 182, 0, 334);
  surface.addColorStop(0, 'rgba(98,110,143,0)');
  surface.addColorStop(1, 'rgba(98,110,143,.22)');
  context.fillStyle = surface;
  context.beginPath(); context.moveTo(x - 18, 182); context.lineTo(x + 18, 182);
  context.lineTo(x + 86, 334); context.lineTo(x - 86, 334); context.closePath(); context.fill();
  // Neutral road context remains dim while live boundaries fade away off-road.
  context.strokeStyle = '#3e4656'; context.lineWidth = 1.6;
  for (const side of [-1, 1]) {
    context.beginPath(); context.moveTo(x + side * 18, 182); context.lineTo(x + side * 86, 334); context.stroke();
  }
  if (live) {
    context.save(); context.globalAlpha *= options.laneOpacity;
    context.strokeStyle = '#bdc6d8'; context.lineWidth = 2.4; context.lineJoin = 'round';
    options.lanePoints.forEach((line, i) => {
      context.setLineDash(options.laneMarkings[i] === 'dashed' ? [9, 12] : []);
      context.beginPath();
      line.forEach((p, j) => {
        const point = project(p);
        if (j === 0) context.moveTo(point.x, point.y); else context.lineTo(point.x, point.y);
      });
      context.stroke();
    });
    context.restore();
  }
};

/** The bottom center is reserved for the small cruise status readout. */
const drawSuvAssist = (context: CanvasRenderingContext2D, options: SuvFaceOptions): void => {
  const r = SUV_INSTRUMENT_CLUSTER_LAYOUT.assistRegion, x = r.x + r.width / 2;
  context.save(); context.beginPath(); context.rect(r.x, r.y, r.width, r.height); context.clip();
  if (options.cruiseActive && options.cruiseTargetKmh !== null) {
    suvPictogram(context, 'cruise', x - 52, 376, 18, '#9da8cc');
    suvText(context, `${Math.round(options.cruiseTargetKmh)} km/h`, x + 12, 376, 18, SUV_TEXT_SOFT);
  }
  context.restore();
};
/** One compact top-down car pictogram, shared by the parking and driving pages. */
const drawSuvCar = (context: CanvasRenderingContext2D, x: number, y: number): void => {
  context.save(); context.translate(x, y);
  context.shadowColor = '#05070c'; context.shadowBlur = 6;
  const paint = context.createLinearGradient(-16, 0, 16, 0);
  paint.addColorStop(0, '#7b8aa0'); paint.addColorStop(.45, '#ccd5e0'); paint.addColorStop(1, '#8b9aae');
  context.fillStyle = paint; context.strokeStyle = '#dde4ec'; context.lineWidth = .8;
  context.beginPath();
  context.moveTo(-10, -27); context.quadraticCurveTo(0, -31, 10, -27);
  context.lineTo(14, -16); context.lineTo(15, 19); context.quadraticCurveTo(14, 28, 7, 28);
  context.lineTo(-7, 28); context.quadraticCurveTo(-14, 28, -15, 19); context.lineTo(-14, -16);
  context.closePath(); context.fill(); context.stroke();
  context.shadowBlur = 0;
  context.fillStyle = '#232c3c';
  context.beginPath(); context.moveTo(-10, -15); context.lineTo(10, -15);
  context.lineTo(8, -5); context.lineTo(-8, -5); context.closePath(); context.fill();
  drawBeveledPanel(context, -8, 9, 16, 9, 2); context.fill();
  context.strokeStyle = '#6b7c90'; context.lineWidth = .7;
  for (const side of [-1, 1]) {
    context.beginPath(); context.moveTo(side * 11, -2); context.lineTo(side * 11, 17); context.stroke();
  }
  context.fillStyle = '#e6edf2';
  context.fillRect(-11, -23, 6, 2); context.fillRect(5, -23, 6, 2);
  context.restore();
};

/** Reads the numeric ratio from labels such as "6" or "D3". */
const parsePhysicalGear = (gear: InstrumentGear): number | null => {
  if (typeof gear === 'number') {
    return Number.isFinite(gear) ? Math.round(gear) : null;
  }
  const match = /(\d+)/.exec(gear);
  return match === null ? null : Number.parseInt(match[1]!, 10);
};

/** Reads the P/R/N/D selector from labels such as "D3", "N" or "R". */
const parseGearSelector = (gear: InstrumentGear): string => {
  if (typeof gear === 'number') return gear > 0 ? 'D' : 'N';
  const match = /^[PRND]/i.exec(gear);
  return match === null ? gear : match[0].toUpperCase();
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

  // 6AT face: one central tachometer plus two canvas information wings.
  private readonly cx4TachCanvas = createCanvas(FACE_SIZE, FACE_SIZE);
  private cx4TachTexture: THREE.CanvasTexture | null = null;
  private cx4TachNeedle: THREE.Group | null = null;
  private cx4LeftCanvas: HTMLCanvasElement | null = null;
  private cx4LeftTexture: THREE.CanvasTexture | null = null;
  private cx4RightCanvas: HTMLCanvasElement | null = null;
  private cx4RightTexture: THREE.CanvasTexture | null = null;
  private cx4Key = '';
  /** Widest ratio observed from telemetry; drives the 6AT gear ladder. */
  private cx4MaximumForwardGear = 1;

  // 7DCT face: twin mechanical dials plus a monochrome centre display.
  private readonly jettaTachCanvas = createCanvas(FACE_SIZE, FACE_SIZE);
  private readonly jettaSpeedCanvas = createCanvas(FACE_SIZE, FACE_SIZE);
  private jettaTachNeedle: THREE.Group | null = null;
  private jettaSpeedNeedle: THREE.Group | null = null;
  private jettaCentreCanvas: HTMLCanvasElement | null = null;
  private jettaCentreTexture: THREE.CanvasTexture | null = null;
  private jettaCentreKey = '';

  private currentTachometerRotation = fractionToNeedleRotation(0);
  private currentSpeedometerRotation = fractionToNeedleRotation(0);
  private currentFuelRotation = fractionToSmallGaugeRotation(0.72);
  private currentTemperatureRotation = fractionToSmallGaugeRotation(0.5);
  private executiveCanvas: HTMLCanvasElement | null = null;
  private executiveTexture: THREE.CanvasTexture | null = null;
  private executiveTachArtwork: HTMLCanvasElement | null = null;
  private executiveSpeedArtwork: HTMLCanvasElement | null = null;
  private executiveKey = '';
  private executiveBacklight = 0;
  private executiveWakeTime = 0;
  private executiveWasOn = false;
  private executiveOffTime = 1;
  private executiveOffBrightness = 0;
  private executivePageKey = '';
  private executivePageTime = 0;
  private executiveLaneOpacity = 0;
  private executiveLanePoints: ExecutiveDisplayData['lanes'] = [];
  private executiveLaneMarkings: NonNullable<ExecutiveDisplayData['laneMarkings']> = [];
  // SUV cockpit face: two large dials and one information column.
  private readonly suvScales: ReturnType<typeof getSuvInstrumentScales>;
  private suvCanvas: HTMLCanvasElement | null = null;
  private suvTexture: THREE.CanvasTexture | null = null;
  private suvTachArtwork: HTMLCanvasElement | null = null;
  private suvSpeedArtwork: HTMLCanvasElement | null = null;
  private suvKey = '';
  private suvPageKey = '';
  private suvBacklight = 1;
  private suvWakeTime = 0;
  private suvWasOn = true;
  private suvOffTime = 1;
  private suvOffBrightness = 0;
  private suvPageTime = 0;
  private suvLaneOpacity = 0;
  private suvLanePoints: ExecutiveDisplayData['lanes'] = [];
  private suvLaneMarkings: readonly ('solid' | 'dashed')[] = [];
  private lastInformationKey = '';
  private lastIndicatorKey = '';

  public constructor(config: Partial<InstrumentClusterConfig> = {}) {
    super();
    this.name = 'Functional instrument cluster';
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.suvScales = getSuvInstrumentScales(this.config);

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

    // Only the wide all-digital TFT drops the deep analogue binnacle hood. The
    // 6AT and 7DCT faces are traditional instrument layouts and keep it.
    const isWideTft = this.config.displayStyle === 'sport-tft';
    const hoodSize = isWideTft
      ? INSTRUMENT_CLUSTER_HOUSING_LAYOUT.sportHoodSize
      : INSTRUMENT_CLUSTER_HOUSING_LAYOUT.analogueHoodSize;
    const hood = new THREE.Mesh(new THREE.BoxGeometry(...hoodSize), housingMaterial);
    hood.name = 'Instrument binnacle hood';
    hood.position.set(
      0,
      isWideTft
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

    if (this.config.displayStyle === 'executive-virtual') {
      this.children.slice(2).forEach(child => { child.visible = false; });
      this.sportDisplayCanvas = null;
      this.sportDisplayTexture = null;
      this.buildExecutiveFace();
    } else if (this.config.displayStyle === 'suv-virtual') {
      // SUV face: the shared analogue hardware stays instantiated but hidden,
      // so this is a different layout rather than a recoloured twin-dial pod.
      this.children.slice(2).forEach((child) => {
        child.visible = false;
      });
      this.sportDisplayCanvas = null;
      this.sportDisplayTexture = null;
      this.buildSuvFace();
    } else if (this.config.displayStyle === 'sport-tft') {
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
    } else if ((this.config.displayStyle === 'cx4-tach-wing' || this.config.displayStyle === 'supercar-tach')) {
      // 6AT: one dominant central tachometer with two information wings. The
      // shared analogue hardware stays instantiated but hidden, so this face
      // is a different layout rather than a recoloured twin-dial cluster.
      this.children.slice(2).forEach((child) => {
        child.visible = false;
      });
      this.sportDisplayCanvas = null;
      this.sportDisplayTexture = null;
      this.buildCx4Face();
    } else if (this.config.displayStyle === 'jetta-twin-dial') {
      // 7DCT: traditional twin mechanical dials around a monochrome centre
      // display. Distinct from both the 6AT face and the coupe TFT.
      this.children.slice(2).forEach((child) => {
        child.visible = false;
      });
      this.sportDisplayCanvas = null;
      this.sportDisplayTexture = null;
      this.buildJettaFace();
      this.buildTwinDialFace();
    } else {
      this.sportDisplayCanvas = null;
      this.sportDisplayTexture = null;
      this.redrawInformation(0, 'N', {});
    }
    this.applyNeedleRotations();
  }

  /**
   * 6AT face: central tachometer with an embedded digital speed, flanked by a
   * gear/trip wing and a fuel/temperature wing.
   */
  private buildCx4Face(): void {
    const supercar = this.config.displayStyle === 'supercar-tach';
    const layout = supercar ? SUPERCAR_INSTRUMENT_CLUSTER_LAYOUT : CX4_INSTRUMENT_CLUSTER_LAYOUT;
    this.cx4TachTexture = configureTexture(this.cx4TachCanvas);
    const tachFace = new THREE.Mesh(
      new THREE.CircleGeometry(layout.tachRadius, 64),
      new THREE.MeshBasicMaterial({
        map: this.cx4TachTexture,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    tachFace.name = supercar ? 'Supercar central tachometer face' : '6AT central tachometer face';
    tachFace.position.set(layout.tachCenterX, 0, layout.tachFaceZ);
    this.add(tachFace);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(layout.tachRadius + 0.001, 0.005, 8, 48),
      new THREE.MeshStandardMaterial({
        color: 0x9aa4a9,
        roughness: 0.3,
        metalness: 0.62,
      }),
    );
    rim.name = '6AT central tachometer bezel';
    rim.position.set(layout.tachCenterX, 0, layout.tachFaceZ + 0.004);
    this.add(rim);

    this.cx4TachNeedle = makeNeedle(
      '6AT tachometer needle',
      layout.tachNeedleLength,
      supercar ? 0xef3029 : 0xe9edec,
    );
    this.cx4TachNeedle.position.set(
      layout.tachCenterX,
      0,
      layout.tachNeedleZ,
    );
    this.add(this.cx4TachNeedle);

    this.cx4LeftCanvas = drawCx4LeftWing('N', null, 1, {});
    this.cx4LeftTexture = configureTexture(this.cx4LeftCanvas);
    const leftWing = new THREE.Mesh(
      new THREE.PlaneGeometry(layout.wingHalfWidth * 2, layout.wingHalfHeight * 2),
      new THREE.MeshBasicMaterial({
        map: this.cx4LeftTexture,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    leftWing.name = supercar ? 'Supercar left information screen' : '6AT gear wing';
    leftWing.position.set(-layout.wingCenterX, supercar ? -.023 : 0, layout.wingZ);
    this.add(leftWing);

    this.cx4RightCanvas = drawCx4RightWing(0.72, 90);
    this.cx4RightTexture = configureTexture(this.cx4RightCanvas);
    const rightWing = new THREE.Mesh(
      new THREE.PlaneGeometry(layout.wingHalfWidth * 2, layout.wingHalfHeight * 2),
      new THREE.MeshBasicMaterial({
        map: this.cx4RightTexture,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    rightWing.name = supercar ? 'Supercar right information screen' : '6AT fuel and temperature wing';
    rightWing.position.set(layout.wingCenterX, supercar ? -.023 : 0, layout.wingZ);
    this.add(rightWing);

    this.currentTachometerRotation = fractionToNeedleRotation(0);
    this.cx4Key = '';
    this.redrawCx4Face(0, 'N', 'N', 0.72, 90, {});
  }

  /**
   * 7DCT face: twin mechanical dials plus a monochrome centre display.
   */
  private buildJettaFace(): void {
    const layout = JETTA_INSTRUMENT_CLUSTER_LAYOUT;
    // Both dial faces are static artwork: they are painted once and the same
    // texture objects are attached to the meshes, so a face never renders blank.
    this.paintJettaFace(this.jettaTachCanvas, {
      label: 'RPM',
      unit: 'x1000 r/min',
      maximum: this.config.maximumRPM,
      majorDivisions: 8,
      minorTicksPerMajor: 4,
      labelDivisor: 1_000,
      redlineFraction: this.config.redlineRPM / this.config.maximumRPM,
      majorTickColor: '#e8ecea',
      minorTickColor: '#98a1a5',
      labelColor: '#e2e7e4',
    });
    this.paintJettaFace(this.jettaSpeedCanvas, {
      label: 'km/h',
      unit: 'SPEED',
      maximum: this.config.maximumSpeedKmh,
      majorDivisions: 8,
      minorTicksPerMajor: 1,
      majorTickColor: '#e8ecea',
      minorTickColor: '#98a1a5',
      labelColor: '#e2e7e4',
    });
    const tachTexture = configureTexture(this.jettaTachCanvas);
    const speedTexture = configureTexture(this.jettaSpeedCanvas);
    const faceGeometry = () => new THREE.CircleGeometry(layout.dialRadius, 64);
    const faceMaterial = (map: THREE.CanvasTexture): THREE.MeshBasicMaterial =>
      new THREE.MeshBasicMaterial({
        map,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      });

    const tachFace = new THREE.Mesh(faceGeometry(), faceMaterial(tachTexture));
    tachFace.name = '7DCT tachometer face';
    tachFace.position.set(layout.tachCenterX, 0, layout.dialFaceZ);
    this.add(tachFace);

    const speedFace = new THREE.Mesh(faceGeometry(), faceMaterial(speedTexture));
    speedFace.name = '7DCT speedometer face';
    speedFace.position.set(layout.speedoCenterX, 0, layout.dialFaceZ);
    this.add(speedFace);

    const rimMaterial = new THREE.MeshStandardMaterial({
      color: 0x9aa4a9,
      roughness: 0.3,
      metalness: 0.62,
    });
    const rimGeometry = new THREE.TorusGeometry(
      layout.dialRadius + 0.001,
      0.005,
      8,
      48,
    );
    for (const [name, centerX] of [
      ['7DCT tachometer bezel', layout.tachCenterX],
      ['7DCT speedometer bezel', layout.speedoCenterX],
    ] as const) {
      const rim = new THREE.Mesh(rimGeometry, rimMaterial);
      rim.name = name;
      rim.position.set(centerX, 0, layout.dialFaceZ + 0.004);
      this.add(rim);
    }

    // Both needles take the restrained red-orange of a traditional German
    // cluster, which is what separates this face from the 6AT light-grey one.
    this.jettaTachNeedle = makeNeedle(
      '7DCT tachometer needle',
      layout.dialNeedleLength,
      0xe2645a,
    );
    this.jettaTachNeedle.position.set(layout.tachCenterX, 0, layout.dialNeedleZ);
    this.add(this.jettaTachNeedle);

    this.jettaSpeedNeedle = makeNeedle(
      '7DCT speedometer needle',
      layout.dialNeedleLength,
      0xe2645a,
    );
    this.jettaSpeedNeedle.position.set(layout.speedoCenterX, 0, layout.dialNeedleZ);
    this.add(this.jettaSpeedNeedle);

    this.currentTachometerRotation = fractionToNeedleRotation(0);
    this.currentSpeedometerRotation = fractionToNeedleRotation(0);
  }

  /** Monochrome centre information display for the 7DCT face. */
  private buildTwinDialFace(): void {
    const layout = JETTA_INSTRUMENT_CLUSTER_LAYOUT;
    this.jettaCentreCanvas = drawJettaCentreDisplay(0, 'N', null, 0.72, {});
    this.jettaCentreTexture = configureTexture(this.jettaCentreCanvas);
    const display = new THREE.Mesh(
      new THREE.PlaneGeometry(
        layout.displayHalfWidth * 2,
        layout.displayHalfHeight * 2,
      ),
      new THREE.MeshBasicMaterial({
        map: this.jettaCentreTexture,
        toneMapped: false,
      }),
    );
    display.name = '7DCT centre information display';
    display.position.set(0, layout.displayCenterY, layout.displayZ);
    this.add(display);
    this.jettaCentreKey = '';
    this.redrawJettaFace(0, 'N', 'N', null, 0.72, 90, {}, this.getIndicatorKey({}));
  }

  public update(telemetry: InstrumentTelemetry, deltaTime = 1 / 60): void {
    const speedKmh = Math.abs(finiteOr(telemetry.speedKmh, 0));
    const rpm = Math.max(0, finiteOr(telemetry.rpm, 0));
    const fuelLevel = clamp01(finiteOr(telemetry.fuelLevel, 0.72));
    const temperatureC = finiteOr(telemetry.coolantTemperatureC, 90);
    const temperatureFraction = clamp01((temperatureC - 50) / 80);
    const dt = THREE.MathUtils.clamp(finiteOr(deltaTime, 1 / 60), 0, 0.1);
    const blend = 1 - Math.exp(-this.config.needleResponse * dt);
    const rpmMaximum = this.config.displayStyle === 'suv-virtual' ? this.suvScales.rpm : this.config.maximumRPM;
    const speedMaximum = this.config.displayStyle === 'suv-virtual' ? this.suvScales.speed : this.config.maximumSpeedKmh;

    this.currentTachometerRotation = THREE.MathUtils.lerp(
      this.currentTachometerRotation,
      fractionToNeedleRotation(rpm / rpmMaximum),
      blend,
    );
    this.currentSpeedometerRotation = THREE.MathUtils.lerp(
      this.currentSpeedometerRotation,
      fractionToNeedleRotation(speedKmh / speedMaximum),
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
    const automaticStop = telemetry.startStopState?.state === 'AUTO_STOPPED' || telemetry.startStopState?.state === 'RESTARTING';
    const engineStopped = telemetry.engineRunning === false && !automaticStop;
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
      indicators.frontFogLights, indicators.rearFogLights,
      indicators.parkingBrake,
      indicators.engineWarning,
      indicators.batteryWarning,
      indicators.cruise,
      indicators.absWarning, indicators.tcsActive, indicators.tcsOff, indicators.escOff,
    ].map((value) => (value === true ? '1' : '0')).join('');
    if (this.config.displayStyle === 'executive-virtual') {
      const on = telemetry.ignitionOn ?? telemetry.engineRunning ?? true;
      if (on && !this.executiveWasOn) this.executiveWakeTime = 0;
      if (!on && this.executiveWasOn) { this.executiveOffTime = 0; this.executiveOffBrightness = this.executiveBacklight; }
      this.executiveWasOn = on;
      if (on) {
        this.executiveWakeTime += dt;
        const brightness = indicators.positionLights || indicators.headlights
          ? this.config.visualProfile?.nightBrightness ?? 1 : 1;
        this.executiveBacklight = THREE.MathUtils.damp(this.executiveBacklight, brightness, 10, dt);
      } else {
        this.executiveOffTime += dt;
        // Visual shutdown overlaps the unchanged crank coast-down. The real RPM
        // still drives both needles; no fabricated sweep or engine timing changes.
        this.executiveBacklight = this.executiveOffBrightness * (1 - THREE.MathUtils.smoothstep(this.executiveOffTime, .08, .90));
      }
      const page = telemetry.executive?.page ?? 'DRIVING';
      const overlay = page === 'PARKING' || page === 'TRIP' ? null : telemetry.executive?.overlay;
      const pageKey = `${page}|${overlay?.title ?? ''}|${overlay?.value ?? ''}`;
      if (pageKey !== this.executivePageKey) { this.executivePageKey = pageKey; this.executivePageTime = 0; }
      this.executivePageTime += dt;
      const lanes = telemetry.executive?.lanes;
      const hasLanes = page === 'DRIVING' && (lanes?.length ?? 0) >= 2 && lanes!.every(line => line.length > 1);
      if (hasLanes) {
        this.executiveLanePoints = lanes!;
        this.executiveLaneMarkings = telemetry.executive?.laneMarkings ?? [];
      }
      this.executiveLaneOpacity = THREE.MathUtils.damp(this.executiveLaneOpacity, hasLanes ? 1 : 0,
        this.config.visualProfile?.laneFadeResponse ?? 5, dt);
      const smoothRPM = clamp01((-this.currentTachometerRotation - ARC_START) / (ARC_END - ARC_START)) * this.config.maximumRPM;
      const smoothSpeed = clamp01((-this.currentSpeedometerRotation - ARC_START) / (ARC_END - ARC_START)) * this.config.maximumSpeedKmh;
      const key = [displaySpeed, Math.round(smoothRPM / 5), Math.round(smoothSpeed), telemetry.gear, telemetry.driveMode,
        Math.round(fuelLevel * 100), Math.round(temperatureC), telemetry.cruiseTargetSpeedKmh, indicatorKey,
        telemetry.executive?.version, Math.round(this.executiveBacklight * 100), Math.round(this.executiveLaneOpacity * 100),
        telemetry.outsideTemperatureC,
        Math.min(66, Math.floor(this.executiveWakeTime * 60)), Math.min(12, Math.floor(this.executivePageTime * 60))].join('|');
      if (key !== this.executiveKey) {
        this.redrawExecutiveFace(telemetry, indicators, smoothSpeed, smoothRPM, fuelLevel, temperatureC);
        this.executiveKey = key;
      }
      return;
    }
    if (this.config.displayStyle === 'suv-virtual') {
      const on = telemetry.ignitionOn ?? telemetry.engineRunning ?? true;
      if (on && !this.suvWasOn) { this.suvWakeTime = 0; this.suvPageTime = 0; }
      if (!on && this.suvWasOn) { this.suvOffTime = 0; this.suvOffBrightness = this.suvBacklight; }
      this.suvWasOn = on;
      if (on) {
        this.suvWakeTime += dt;
        this.suvBacklight = THREE.MathUtils.damp(this.suvBacklight, 1, 10, dt);
      } else {
        this.suvOffTime += dt;
        // Visual shutdown only; the real RPM still drives both needles.
        this.suvBacklight = this.suvOffBrightness * (1 - THREE.MathUtils.smoothstep(this.suvOffTime, .08, .90));
      }
      const page = telemetry.executive?.page ?? 'DRIVING';
      if (`${page}` !== this.suvPageKey) { this.suvPageKey = page; this.suvPageTime = 0; }
      this.suvPageTime += dt;
      const lanes = telemetry.executive?.lanes;
      const hasLanes = (page === 'DRIVING' || page === 'CRUISE') && (lanes?.length ?? 0) >= 2 && lanes!.every(line => line.length > 1);
      if (hasLanes) {
        this.suvLanePoints = lanes!;
        this.suvLaneMarkings = telemetry.executive?.laneMarkings ?? [];
      }
      this.suvLaneOpacity = THREE.MathUtils.damp(this.suvLaneOpacity, hasLanes ? 1 : 0, 5, dt);
      const smoothRPM = clamp01((-this.currentTachometerRotation - ARC_START) / (ARC_END - ARC_START)) * this.suvScales.rpm;
      const smoothSpeed = clamp01((-this.currentSpeedometerRotation - ARC_START) / (ARC_END - ARC_START)) * this.suvScales.speed;
      const key = [on, !on && this.suvOffTime >= .90, displaySpeed, Math.round(smoothRPM / 5), Math.round(smoothSpeed), telemetry.gear, telemetry.driveMode,
        Math.round(fuelLevel * 100), Math.round(temperatureC), telemetry.cruiseTargetSpeedKmh, indicatorKey,
        telemetry.executive?.version, Math.round(this.suvBacklight * 100), Math.round(this.suvLaneOpacity * 100),
        // Force the final shutdown frame even after brightness quantization.
        Math.min(66, Math.floor(this.suvWakeTime * 60)), Math.min(12, Math.floor(this.suvPageTime * 60))].join('|');
      if (key !== this.suvKey) {
        this.redrawSuvFace(telemetry, indicators, smoothSpeed, smoothRPM, fuelLevel, temperatureC);
        this.suvKey = key;
      }
      return;
    }
    if ((this.config.displayStyle === 'cx4-tach-wing' || this.config.displayStyle === 'supercar-tach')) {
      const gearSelector = parseGearSelector(telemetry.gear);
      const cx4Key = [
        displaySpeed,
        telemetry.gear,
        Math.round(fuelLevel * 100),
        Math.round(temperatureC),
        telemetry.driveMode ?? '',
      ].join('|');
      if (cx4Key !== this.cx4Key || indicatorKey !== this.lastIndicatorKey) {
        this.redrawCx4Face(
          displaySpeed,
          gearSelector,
          telemetry.gear,
          fuelLevel,
          temperatureC,
          indicators,
          telemetry.driveMode,
        );
      }
      return;
    }
    if (this.config.displayStyle === 'jetta-twin-dial') {
      this.redrawJettaFace(
        displaySpeed,
        parseGearSelector(telemetry.gear),
        telemetry.gear,
        parsePhysicalGear(telemetry.gear),
        fuelLevel,
        temperatureC,
        indicators,
        indicatorKey,
      );
      return;
    }

    const informationKey = this.config.displayStyle === 'sport-tft'
      ? [
        displaySpeed,
        telemetry.gear,
        Math.round(rpm / 25),
        Math.round(fuelLevel * 100),
        Math.round(temperatureC),
        telemetry.driveMode ?? '',
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

  private buildExecutiveFace(): void {
    this.executiveCanvas = createCanvas(1440, 600);
    this.executiveTexture = configureTexture(this.executiveCanvas);
    const common = { label: '', unit: '', minorTicksPerMajor: 5, visualProfile: this.config.visualProfile,
      majorTickColor: '#e4e8ed', minorTickColor: '#727c87', labelColor: '#cfd5dc' };
    this.executiveTachArtwork = drawStyledDialArtwork({ ...common, maximum: this.config.maximumRPM,
      majorDivisions: 7, labelDivisor: 1000, redlineFraction: this.config.redlineRPM / this.config.maximumRPM });
    this.executiveSpeedArtwork = drawStyledDialArtwork({ ...common, maximum: this.config.maximumSpeedKmh,
      majorDivisions: 7, minorTicksPerMajor: 4 });
    const geometry = new THREE.ShapeGeometry(new THREE.Shape(EXECUTIVE_INSTRUMENT_OUTLINE.map(([x, y]) => new THREE.Vector2(x * .982, y * .982))));
    const position = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
    for (let i = 0; i < position.count; i++) uv.setXY(i, .5 + position.getX(i) / .524, .5 + position.getY(i) / .224);
    const display = new THREE.Mesh(geometry,
      new THREE.MeshBasicMaterial({ map: this.executiveTexture, toneMapped: false }));
    display.name = 'Executive Virtual Cockpit twin dials and central road display';
    display.position.z = .070;
    this.add(display);
    this.redrawExecutiveFace({ speedKmh: 0, rpm: 0, gear: 'P', driveMode: 'NORMAL' }, {}, 0, 0, .72, 90);
  }

  /**
   * Touareg-like face: one full-aperture canvas carrying two large round dials
   * and the central information column, laid out at a uniform pixels-per-metre
   * scale so the dials stay circular behind the ordinary SUV binnacle.
   */
  private buildSuvFace(): void {
    const layout = SUV_INSTRUMENT_CLUSTER_LAYOUT;
    this.suvCanvas = createCanvas(layout.canvasWidth, layout.canvasHeight);
    this.suvTexture = configureTexture(this.suvCanvas);
    const scales = this.suvScales;
    this.suvTachArtwork = drawSuvDial(scales.rpm, true, this.config.redlineRPM);
    this.suvSpeedArtwork = drawSuvDial(scales.speed, false);
    const display = new THREE.Mesh(
      // The plane slightly overfills the binnacle aperture, so the face is
      // continuous behind the visor lip at every seating position.
      new THREE.PlaneGeometry(layout.apertureHalfWidth * 2.02, layout.apertureHalfHeight * 2.04),
      new THREE.MeshBasicMaterial({ map: this.suvTexture, toneMapped: false }),
    );
    display.name = 'SUV virtual cockpit twin dials and central information column';
    display.position.z = .070;
    this.add(display);
    this.suvKey = '';
    this.suvPageTime = 1;
    this.redrawSuvFace({ speedKmh: 0, rpm: 0, gear: 'P', driveMode: 'NORMAL' }, {}, 0, 0, .72, 90);
  }

  /** Repaints the SUV face; called only when a visible value or lamp changed. */
  private redrawSuvFace(telemetry: InstrumentTelemetry, indicators: InstrumentIndicatorState,
    speed: number, rpm: number, fuel: number, temperature: number): void {
    const canvas = this.suvCanvas;
    if (canvas === null || this.suvTexture === null || this.suvTachArtwork === null || this.suvSpeedArtwork === null) return;
    // A document stub without a 2D context (headless layout tests) draws nothing.
    if (canvas.getContext('2d') === null) return;
    const data = telemetry.executive;
    const cruiseTarget = telemetry.cruiseTargetSpeedKmh;
    const cruiseActive = indicators.cruise === true && cruiseTarget !== undefined && Number.isFinite(cruiseTarget);
    const scales = this.suvScales;
    drawSuvVirtualFace({
      canvas, maximumRPM: scales.rpm, maximumSpeedKmh: scales.speed,
      tachArtwork: this.suvTachArtwork, speedArtwork: this.suvSpeedArtwork,
      speedKmh: speed, rpm, gear: telemetry.gear, driveMode: telemetry.driveMode ?? 'NORMAL',
      cruiseActive, cruiseTargetKmh: cruiseActive ? cruiseTarget! : null,
      fuelLevel: fuel, fuelRangeKm: data?.trip.fuel.estimatedRangeKm ?? null,
      temperatureC: temperature, indicators, data,
      lanePoints: this.suvLanePoints, laneMarkings: this.suvLaneMarkings,
      laneOpacity: this.suvLaneOpacity, backlight: this.suvBacklight,
      wake: this.suvWakeTime, pageTime: this.suvPageTime,
    });
    this.suvTexture.needsUpdate = true;
  }

  private redrawExecutiveFace(telemetry: InstrumentTelemetry, indicators: InstrumentIndicatorState,
    speed: number, rpm: number, fuel: number, temperature: number): void {
    const context = this.executiveCanvas?.getContext('2d');
    if (context == null || this.executiveTachArtwork === null || this.executiveSpeedArtwork === null) return;
    const mode = telemetry.driveMode ?? 'NORMAL';
    const accent = mode === 'ECO' ? '#81bd9d' : mode === 'SPORT' ? '#e46666' : '#e0e4e9';
    context.clearRect(0, 0, 1440, 600);
    context.fillStyle = '#030507'; context.fillRect(0, 0, 1440, 600);
    context.save(); context.globalAlpha = this.executiveBacklight;
    const backlight = context.createLinearGradient(0, 35, 0, 540);
    backlight.addColorStop(0, '#101720'); backlight.addColorStop(.5, '#080d13'); backlight.addColorStop(1, '#05080c');
    context.fillStyle = backlight; context.fillRect(0, 0, 1440, 600);
    const text = (value: string, x: number, y: number, size: number, color = '#e3e7ec'): void => {
      context.fillStyle = color;
      context.font = `${size >= 50 ? 600 : 500} ${size}px "Segoe UI", sans-serif`;
      context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(value, x, y);
    };
    context.save();
    context.globalAlpha *= THREE.MathUtils.smoothstep(this.executiveWakeTime, .12, .42);
    context.drawImage(this.executiveTachArtwork, 145, 95, 400, 400);
    context.drawImage(this.executiveSpeedArtwork, 895, 95, 400, 400);
    for (const x of [345, 1095]) {
      const halo = context.createRadialGradient(x, 295, 188, x, 295, 212);
      halo.addColorStop(0, 'rgba(150,175,200,0)'); halo.addColorStop(.38, `rgba(150,175,200,${this.config.visualProfile?.ringGlow ?? .075})`); halo.addColorStop(1, 'rgba(150,175,200,0)');
      context.fillStyle = halo; context.beginPath(); context.arc(x, 295, 212, 0, Math.PI * 2); context.fill();
    }
    // Existing damped RPM/speed values remain live throughout the brief welcome.
    const needle = (x: number, fraction: number): void => {
      const angle = THREE.MathUtils.lerp(ARC_START, ARC_END, clamp01(fraction));
      context.save(); context.strokeStyle = '#e96c65'; context.lineWidth = this.config.visualProfile?.needleWidth ?? 4.5;
      context.shadowColor = '#b45c57'; context.shadowBlur = 3;
      context.beginPath(); context.moveTo(x + Math.sin(angle) * 115, 295 - Math.cos(angle) * 115);
      context.lineTo(x + Math.sin(angle) * 162, 295 - Math.cos(angle) * 162); context.stroke(); context.restore();
    };
    needle(345, rpm / this.config.maximumRPM); needle(1095, speed / this.config.maximumSpeedKmh);
    text(formatInstrumentGear(telemetry.gear), 345, 270, 62);
    text(mode, 345, 336, 27, accent);
    context.fillStyle = accent; context.fillRect(313, 358, 64, 2);
    text('×1000 rpm', 345, 410, 19, '#8e98a5');
    text(String(Math.round(speed)), 1095, 270, 74);
    text('km/h', 1095, 337, 23, '#9ca5b0');
    const arcGauge = (x: number, left: boolean, fraction: number, label: string, low: string, high: string): void => {
      const start = (left ? 145 : -35) * Math.PI / 180, end = (left ? 215 : 35) * Math.PI / 180;
      const radius = 229;
      context.lineWidth = 3; context.strokeStyle = '#303a45'; context.beginPath(); context.arc(x, 295, radius, start, end); context.stroke();
      context.save(); context.strokeStyle = left && fuel < .1 ? '#d6aa66' : '#a4b0bb';
      context.shadowColor = context.strokeStyle; context.shadowBlur = 3;
      context.beginPath(); context.arc(x, 295, radius, start, start + (end - start) * clamp01(fraction)); context.stroke(); context.restore();
      context.strokeStyle = '#798593'; context.lineWidth = 1.5;
      for (let i = 0; i <= 8; i++) {
        const angle = start + (end - start) * i / 8;
        context.beginPath(); context.moveTo(x + Math.cos(angle) * (radius + 8), 295 + Math.sin(angle) * (radius + 8));
        context.lineTo(x + Math.cos(angle) * (radius + (i % 4 === 0 ? 20 : 14)), 295 + Math.sin(angle) * (radius + (i % 4 === 0 ? 20 : 14))); context.stroke();
      }
      for (const [value, angle] of [[low, start], [high, end]] as const) text(value,
        x + Math.cos(angle) * (radius + 42), 295 + Math.sin(angle) * (radius + 42), 17, '#a0a9b2');
      text(label, x + (left ? -170 : 170), 112, 17, '#87929e');
    };
    arcGauge(345, true, fuel, 'Fuel', 'E', 'F');
    arcGauge(1095, false, clamp01((temperature - 50) / 80), 'Temp', '50', '130');
    this.drawExecutiveLamps(context, indicators, telemetry.executive?.trip.fuel.lowFuel ?? fuel < .1);
    context.strokeStyle = '#26313d'; context.lineWidth = 1;
    context.beginPath(); context.moveTo(180, 503); context.lineTo(540, 503); context.moveTo(900, 503); context.lineTo(1260, 503); context.stroke();
    text('AWD', 345, 523, 19, '#8f9aa7');
    text(`${Math.round(temperature)} °C`, 1095, 523, 19, '#8f9aa7');
    context.restore();
    this.drawExecutiveCentre(context, telemetry, indicators, accent, text);
    // A narrow, low-contrast wake reflection; no bloom or saturated light band.
    const sweep = (this.executiveWakeTime - .15) / .55;
    if (sweep > 0 && sweep < 1) {
      const x = sweep * 1640 - 100;
      const sheen = context.createLinearGradient(x - 100, 0, x + 100, 0);
      sheen.addColorStop(0, 'rgba(190,210,225,0)'); sheen.addColorStop(.5, 'rgba(190,210,225,.035)'); sheen.addColorStop(1, 'rgba(190,210,225,0)');
      context.fillStyle = sheen; context.fillRect(x - 100, 35, 200, 510);
    }
    context.restore();
    this.executiveTexture!.needsUpdate = true;
  }

  /** Fixed, background-free positions; common icon artwork and real conditions. */
  private drawExecutiveLamps(context: CanvasRenderingContext2D, indicators: InstrumentIndicatorState, lowFuel: boolean): void {
    const inventory = instrumentStatusLamps(indicators);
    const slots: readonly (readonly [string, number, number, number])[] = [
      ['◀', 345, 73, 32], ['▶', 1095, 73, 32],
      ['POS', 600, 73, 26], ['LO', 660, 73, 26], ['HI', 720, 73, 26],
      ['FRFOG', 780, 73, 26], ['RRFOG', 840, 73, 26],
      ['P', 287, 450, 26], ['ENG', 345, 450, 26], ['BAT', 403, 450, 26],
      ['ABS', 1037, 450, 26], ['SKID', 1095, 450, 26], ['TCS OFF', 1153, 450, 26],
      ['CRUISE', 720, 490, 24],
    ];
    context.save(); context.globalAlpha *= .9;
    for (const [label, x, y, size] of slots) {
      const lamp = inventory.find(item => item[0] === label);
      if (lamp?.[1] === true) drawStatusLamp(context, label === 'TCS OFF' ? assistOffLabel(indicators) : label, lamp[2], x, y, size);
    }
    // The existing low-fuel condition already colours the auxiliary arc.
    // Its small pump marker has a permanent slot beside that same gauge.
    if (lowFuel) {
      context.save(); context.translate(182, 457); context.strokeStyle = '#d6aa66'; context.lineWidth = 1.8;
      context.lineCap = 'round'; context.lineJoin = 'round'; context.shadowColor = '#d6aa66'; context.shadowBlur = 3;
      context.strokeRect(-8, -10, 13, 20); context.strokeRect(-5, -7, 7, 6);
      context.beginPath(); context.moveTo(-11, 11); context.lineTo(8, 11); context.moveTo(5, -3);
      context.lineTo(10, -3); context.lineTo(10, 7); context.quadraticCurveTo(15, 12, 15, 5);
      context.lineTo(15, -6); context.lineTo(10, -11); context.stroke(); context.restore();
    }
    context.restore();
  }

  private drawExecutiveCentre(context: CanvasRenderingContext2D, telemetry: InstrumentTelemetry,
    indicators: InstrumentIndicatorState, accent: string,
    text: (value: string, x: number, y: number, size: number, color?: string) => void): void {
    const data = telemetry.executive;
    const panel = context.createLinearGradient(0, 115, 0, 468);
    panel.addColorStop(0, '#121c27'); panel.addColorStop(1, '#0a1017');
    context.fillStyle = panel; drawBeveledPanel(context, 565, 115, 310, 353, 14); context.fill();
    context.strokeStyle = '#263443'; context.lineWidth = 1; context.stroke();
    context.save(); context.beginPath(); context.rect(576, 124, 288, 337); context.clip();
    const wake = this.executiveWakeTime;
    const welcomeAlpha = THREE.MathUtils.smoothstep(wake, .08, .22) * (1 - THREE.MathUtils.smoothstep(wake, .52, .72));
    if (welcomeAlpha > 0) {
      context.save(); context.globalAlpha *= welcomeAlpha;
      const silver = context.createLinearGradient(0, 230, 0, 285);
      silver.addColorStop(0, '#e2e8ef'); silver.addColorStop(1, '#8995a3');
      context.strokeStyle = silver; context.lineWidth = 3;
      context.shadowColor = '#8d9ba8'; context.shadowBlur = 3;
      for (const x of [666, 702, 738, 774]) {
        context.beginPath(); context.ellipse(x, 258, 26, 26, 0, 0, Math.PI * 2); context.stroke();
      }
      context.shadowBlur = 0; text('Audi', 720, 313, 29, '#bcc6d1'); text('Welcome', 720, 351, 21, '#8795a5');
      context.restore();
    }
    context.globalAlpha *= THREE.MathUtils.smoothstep(wake, .66, 1.06) * THREE.MathUtils.smoothstep(this.executivePageTime, 0, .18);
    text(data?.localTime ?? '--:--', 639, 143, 22, '#c0cbd5');
    const outside = telemetry.outsideTemperatureC;
    text(outside !== undefined && Number.isFinite(outside) ? `${Math.round(outside)} °C` : '-- °C', 802, 143, 22, '#a4b3c0');
    if (data?.page === 'TRIP' && data.localDate) text(data.localDate, 720, 165, 16, '#748390');
    const fuel = data?.trip.fuel;
    const averageConsumption = data?.trip.averageConsumptionLPer100km;
    text(averageConsumption == null ? '-- L/100km' : `${averageConsumption.toFixed(1)} L/100km`, 644, 440, 18, '#99aab9');
    text(fuel ? `${fuel.estimatedRangeKm.toFixed(0)} km` : '-- km', 798, 440, 20, '#bcc8d3');
    context.strokeStyle = '#273644'; context.lineWidth = 1;
    context.beginPath(); context.moveTo(586, 177); context.lineTo(854, 177); context.moveTo(586, 418); context.lineTo(854, 418); context.stroke();
    context.save(); context.beginPath(); context.rect(576, 180, 288, 234); context.clip();
    if (data?.page === 'TRIP') {
      const trip = data.trip;
      const rows = [
        ['Avg speed', trip.averageSpeed === null ? '--' : `${trip.averageSpeed.toFixed(0)} km/h`],
        ['Drive time', `${Math.floor(trip.seconds / 60)}:${String(Math.floor(trip.seconds % 60)).padStart(2, '0')}`],
        ['Avg fuel', trip.averageConsumptionLPer100km == null ? '--' : `${trip.averageConsumptionLPer100km.toFixed(1)} L/100km`],
        ['Trip / ODO', `${(trip.distanceKm ?? 0).toFixed(1)} / ${(trip.odometerKm ?? 0).toFixed(1)} km`],
      ];
      rows.forEach(([label, value], i) => {
        text(label!, 720, 199 + i * 52, 18, '#8998a8'); text(value!, 720, 223 + i * 52, 29);
      });
    } else if (data?.page === 'PARKING') {
      text('Rear parking', 720, 212, 23);
      this.drawExecutiveCar(context, 720, 302);
      drawRearParkingZones(context, data.rearParking, 720, 342, 240);
      const nearest = data.rearParking?.zones.find(zone => zone.zone === data.rearParking?.nearestZone);
      text(rearParkingText(data.rearParking), 720, 387, 21, PROXIMITY_COLORS[nearest?.severity ?? 'NONE']);
    } else if (data?.overlay) {
      context.globalAlpha *= data.overlay.alpha;
      const modeOverlay = data.overlay.title === 'DRIVE SELECT';
      if (modeOverlay) {
        text('Drive mode', 720, 225, 23, '#9eacbb'); text(data.overlay.value, 720, 287, 39, accent);
        context.fillStyle = accent; context.fillRect(690, 328, 60, 2);
      } else {
        drawStatusLamp(context, 'CRUISE', '#95b6ae', 720, 219, 21);
        text(data.overlay.value.match(/\d+/)?.[0] ?? '--', 720, 282, 62);
        text('km/h', 720, 327, 22, '#9eacbb');
      }
    } else if (data?.page === 'MAP') {
      if (!data.roads.length) text('No road data', 720, 246, 21, '#6e7e90');
      context.strokeStyle = '#8393a4'; context.lineWidth = 3; context.lineJoin = 'round'; context.lineCap = 'round';
      for (const line of data.roads) {
        context.beginPath(); line.forEach((p, i) => { const x = 720 + p.x * 1.9, y = 330 - p.forward * 1.9;
          if (i === 0) context.moveTo(x, y); else context.lineTo(x, y); }); context.stroke();
      }
      this.drawExecutiveCar(context, 720, 330);
    } else {
      if (indicators.cruise) {
        drawStatusLamp(context, 'CRUISE', '#95b6ae', 664, 201, 18);
        text(`${Math.round(telemetry.cruiseTargetSpeedKmh ?? 0)} km/h`, 733, 201, 21, '#becbd8');
      }
      this.drawExecutiveRoad(context, data);
    }
    context.restore();
    context.restore();
  }

  private drawExecutiveRoad(context: CanvasRenderingContext2D, data: ExecutiveDisplayData | undefined): void {
    const project = (p: { x: number; forward: number }): { x: number; y: number } => ({
      x: 720 + p.x * 42 / (1 + Math.max(0, p.forward) / 12),
      y: 427 - Math.max(0, p.forward) * 15 / (1 + Math.max(0, p.forward) / 24),
    });
    const polygon = (left: { x: number; forward: number }[], right: { x: number; forward: number }[]): void => {
      context.beginPath();
      [...left, ...right.slice().reverse()].forEach((p, i) => { const q = project(p); if (i === 0) context.moveTo(q.x, q.y); else context.lineTo(q.x, q.y); });
      context.closePath(); context.fill();
    };
    // A weak unmarked surface remains when authored lane data is unavailable.
    const road = context.createLinearGradient(0, 200, 0, 427);
    road.addColorStop(0, 'rgba(58,76,91,0)'); road.addColorStop(.4, 'rgba(58,76,91,.05)'); road.addColorStop(1, 'rgba(70,89,105,.2)');
    context.fillStyle = road;
    polygon([{ x: -3.4, forward: 0 }, { x: -3.4, forward: 42 }], [{ x: 3.4, forward: 0 }, { x: 3.4, forward: 42 }]);
    const lanes = this.executiveLanePoints;
    if (lanes.length >= 2 && this.executiveLaneOpacity > .005) {
      context.save(); context.globalAlpha *= this.executiveLaneOpacity;
      const surface = context.createLinearGradient(0, 200, 0, 427);
      surface.addColorStop(0, 'rgba(120,143,162,0)'); surface.addColorStop(1, 'rgba(120,143,162,.12)');
      context.fillStyle = surface; polygon(lanes[0]!, lanes[1]!);
      context.lineCap = 'round'; context.lineJoin = 'round';
      lanes.forEach((line, boundary) => {
        const dashed = this.executiveLaneMarkings[boundary] === 'dashed';
        for (let i = 1; i < line.length; i++) {
          const a = line[i - 1]!, b = line[i]!;
          const length = Math.hypot(b.x - a.x, b.forward - a.forward);
          if (length < .001) continue;
          // Cut dashes in road metres before projection. Screen-space dashed
          // strokes would have identical gaps near the car and at the horizon.
          const da = a.distanceAlong ?? a.forward, db = b.distanceAlong ?? b.forward;
          const parts = dashed ? Math.max(1, Math.ceil(length / .35)) : 1;
          for (let j = 0; j < parts; j++) {
            const t0 = j / parts, t1 = (j + 1) / parts;
            const distance = da + (db - da) * (t0 + t1) * .5;
            if (dashed && ((distance % 9 + 9) % 9) >= 3.5) continue;
            const p0 = { x: a.x + (b.x - a.x) * t0, forward: a.forward + (b.forward - a.forward) * t0 };
            const p1 = { x: a.x + (b.x - a.x) * t1, forward: a.forward + (b.forward - a.forward) * t1 };
            const pa = project(p0), pb = project(p1);
            const near = 1 / (1 + Math.max(0, (p0.forward + p1.forward) * .5) / 13);
            context.strokeStyle = `rgba(190,205,217,${.14 + near * .7})`; context.lineWidth = .65 + near * 2.1;
            context.beginPath(); context.moveTo(pa.x, pa.y); context.lineTo(pb.x, pb.y); context.stroke();
          }
        }
      });
      context.restore();
    }
    for (const obstacle of data?.obstacles ?? []) {
      const p = project(obstacle), scale = 1 / (1 + obstacle.forward / 12), near = obstacle.distance < 3;
      const w = Math.max(10, obstacle.width * 31 * scale), h = Math.max(9, obstacle.length * 13 * scale);
      context.fillStyle = near ? 'rgba(194,158,102,.16)' : 'rgba(156,175,190,.1)';
      context.strokeStyle = near ? '#c6a575' : '#8499aa'; context.lineWidth = near ? 1.7 : 1.2;
      drawBeveledPanel(context, p.x - w / 2, p.y - h / 2, w, h, 3); context.fill(); context.stroke();
      if (near) { context.beginPath(); context.moveTo(p.x - w / 2, p.y + h / 2 + 4); context.lineTo(p.x + w / 2, p.y + h / 2 + 4); context.stroke(); }
    }
    this.drawExecutiveCar(context, 720, 382);
  }

  private drawExecutiveCar(context: CanvasRenderingContext2D, x: number, y: number): void {
    context.save(); context.translate(x, y);
    context.shadowColor = '#0a1018'; context.shadowBlur = 5;
    const paint = context.createLinearGradient(-16, 0, 16, 0);
    paint.addColorStop(0, '#708492'); paint.addColorStop(.45, '#c7d1d8'); paint.addColorStop(1, '#8195a5');
    context.fillStyle = paint; context.strokeStyle = '#d0d9df'; context.lineWidth = .8;
    context.beginPath(); context.moveTo(-10, -28); context.quadraticCurveTo(0, -32, 10, -28);
    context.lineTo(14, -17); context.lineTo(15, 20); context.quadraticCurveTo(14, 29, 7, 29);
    context.lineTo(-7, 29); context.quadraticCurveTo(-14, 29, -15, 20); context.lineTo(-14, -17); context.closePath(); context.fill(); context.stroke();
    context.shadowBlur = 0; context.fillStyle = '#263746';
    context.beginPath(); context.moveTo(-10, -16); context.lineTo(10, -16); context.lineTo(8, -6); context.lineTo(-8, -6); context.closePath(); context.fill();
    drawBeveledPanel(context, -8, 10, 16, 9, 2); context.fill();
    context.strokeStyle = '#5d707f'; context.lineWidth = .7;
    for (const side of [-1, 1]) { context.beginPath(); context.moveTo(side * 11, -3); context.lineTo(side * 11, 18); context.stroke(); }
    context.fillStyle = '#dce6e9'; context.fillRect(-11, -24, 6, 2); context.fillRect(5, -24, 6, 2);
    context.fillStyle = '#a87877'; context.fillRect(-11, 24, 6, 1.5); context.fillRect(5, 24, 6, 1.5);
    context.restore();
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
    // The two new faces drive their own pivots from the same two tracked
    // angles, so the needle animation and response rate stay shared.
    if (this.cx4TachNeedle !== null) {
      const fraction = clamp01((-this.currentTachometerRotation - ARC_START) / (ARC_END - ARC_START));
      this.cx4TachNeedle.rotation.z = this.config.displayStyle === 'supercar-tach'
        ? -Math.PI - fraction * Math.PI * 1.5 : this.currentTachometerRotation;
    }
    if (this.jettaTachNeedle !== null) {
      this.jettaTachNeedle.rotation.z = this.currentTachometerRotation;
    }
    if (this.jettaSpeedNeedle !== null) {
      this.jettaSpeedNeedle.rotation.z = this.currentSpeedometerRotation;
    }
  }

  /** Redraws the 6AT wings and the embedded speed on its central tachometer. */
  private redrawCx4Face(
    speedKmh: number,
    gearSelector: string,
    gear: InstrumentGear,
    fuelLevel: number,
    temperatureC: number,
    indicators: InstrumentIndicatorState,
    driveMode?: import('../config').VehicleDriveMode,
  ): void {
    const physicalGear = parsePhysicalGear(gear);
    const gearLabel = typeof gear === 'number' ? gear.toString() : gear;
    if (physicalGear !== null) {
      this.cx4MaximumForwardGear = Math.max(
        this.cx4MaximumForwardGear,
        physicalGear,
      );
    }
    this.cx4Key = [
      speedKmh,
      gearLabel,
      Math.round(fuelLevel * 100),
      Math.round(temperatureC),
      driveMode ?? '',
    ].join('|');
    this.lastIndicatorKey = this.getIndicatorKey(indicators);

    const tachContext = this.cx4TachCanvas.getContext('2d');
    if (tachContext !== null) {
      const artwork = drawStyledDialArtwork({
        label: 'RPM',
        unit: 'x1000 r/min',
        maximum: this.config.maximumRPM,
        arcStart: this.config.displayStyle === 'supercar-tach' ? Math.PI : undefined,
        arcEnd: this.config.displayStyle === 'supercar-tach' ? Math.PI * 2.5 : undefined,
        majorDivisions: this.config.displayStyle === 'supercar-tach' ? 10 : 8,
        minorTicksPerMajor: 4,
        colors: this.config.displayStyle === 'supercar-tach' ? { bezelOuter: '#22252b', bezelInner: '#111317',
          bezelEdge: '#87888a', faceCenter: '#f3d445', faceMiddle: '#dfb527', faceEdge: '#b49220',
          ringColor: '#292924', redline: '#c82e27' } : undefined,
        labelDivisor: 1_000,
        redlineFraction: this.config.redlineRPM / this.config.maximumRPM,
        majorTickColor: this.config.displayStyle === 'supercar-tach' ? '#161a1d' : '#eef2f0',
        minorTickColor: this.config.displayStyle === 'supercar-tach' ? '#403c25' : '#a3abae',
        labelColor: this.config.displayStyle === 'supercar-tach' ? '#111518' : '#e6ebe8',
        embeddedSpeedKmh: this.config.displayStyle === 'supercar-tach' ? undefined : speedKmh,
      });
      tachContext.clearRect(0, 0, this.cx4TachCanvas.width, this.cx4TachCanvas.height);
      tachContext.drawImage(artwork, 0, 0);
      if (this.config.displayStyle === 'supercar-tach') {
        // Yellow reference face: dominant tach with a lower-right gear window.
        tachContext.fillStyle = '#dbb82a'; tachContext.fillRect(205, 315, 160, 94);
        drawPrancingHorse(tachContext, 211, 261, 60);
        tachContext.fillStyle = '#171a1d'; tachContext.font = '700 23px Arial, sans-serif';
        tachContext.fillText('RPM', 335, 270); tachContext.font = '600 18px Arial, sans-serif';
        tachContext.fillText('x 1000', 335, 293);
        tachContext.fillStyle = '#212630'; drawBeveledPanel(tachContext, 317, 318, 109, 109, 14); tachContext.fill();
        tachContext.strokeStyle = '#b7b9bc'; tachContext.lineWidth = 3; tachContext.stroke();
        tachContext.fillStyle = '#f16b45'; tachContext.font = '700 72px Arial, sans-serif';
        tachContext.fillText(physicalGear?.toString() ?? gearSelector, 371, 374);
      }
      if (this.cx4TachTexture !== null) this.cx4TachTexture.needsUpdate = true;
    }

    const leftArtwork = drawCx4LeftWing(
      gearSelector,
      physicalGear,
      this.cx4MaximumForwardGear,
      indicators,
    );
    const leftContext = this.cx4LeftCanvas?.getContext('2d') ?? null;
    if (leftContext !== null && this.cx4LeftCanvas !== null) {
      leftContext.clearRect(0, 0, this.cx4LeftCanvas.width, this.cx4LeftCanvas.height);
      leftContext.drawImage(leftArtwork, 0, 0);
      if (this.config.displayStyle === 'supercar-tach') {
        leftContext.clearRect(0, 0, 240, 400); leftContext.fillStyle = '#111c2d'; leftContext.fillRect(0, 0, 240, 400);
        leftContext.fillStyle = '#d13f28'; leftContext.fillRect(0, 0, 240, 48);
        leftContext.fillStyle = '#fff3c2'; leftContext.font = '700 25px Arial, sans-serif'; leftContext.textAlign = 'center';
        leftContext.fillText(driveMode ?? 'SPORT', 120, 33);
        leftContext.strokeStyle = '#819bac'; leftContext.lineWidth = 3;
        drawBeveledPanel(leftContext, 93, 92, 54, 114, 15); leftContext.stroke();
        for (const x of [82, 157]) { leftContext.strokeRect(x, 110, 7, 24); leftContext.strokeRect(x, 177, 7, 24); }
        leftContext.fillStyle = '#9cbbce'; leftContext.font = '700 22px Arial, sans-serif';
        leftContext.fillText(`COOLANT ${Math.round(temperatureC)} C`, 120, 249);
        drawRoundedBar(leftContext, 18, 274, 112, 18, fuelLevel, '#eaa440');
        leftContext.fillStyle = '#eef2f2'; leftContext.font = '700 28px Arial, sans-serif';
        leftContext.fillText(`${speedKmh} km/h`, 167, 290);
        drawCompactStatusLamps(leftContext, indicators, 6, 322, 228, 68);
      }
    }
    const rightContext = this.cx4RightCanvas?.getContext('2d') ?? null;
    const rightArtwork = drawCx4RightWing(fuelLevel, temperatureC, indicators);
    if (rightContext !== null && this.cx4RightCanvas !== null) {
      rightContext.clearRect(0, 0, this.cx4RightCanvas.width, this.cx4RightCanvas.height);
      rightContext.drawImage(rightArtwork, 0, 0);
      if (this.config.displayStyle === 'supercar-tach') {
        rightContext.clearRect(0, 0, 240, 400); rightContext.fillStyle = '#111c2d'; rightContext.fillRect(0, 0, 240, 400);
        rightContext.save(); rightContext.translate(120, 188); rightContext.scale(1, 400 / 240 * SUPERCAR_INSTRUMENT_CLUSTER_LAYOUT.wingHalfWidth / SUPERCAR_INSTRUMENT_CLUSTER_LAYOUT.wingHalfHeight);
        rightContext.strokeStyle = '#d8e7f5'; rightContext.fillStyle = '#d8e7f5'; rightContext.lineWidth = 2;
        for (let i = 0; i <= 12; i++) {
          const angle = (-225 + i * 22.5) * Math.PI / 180;
          rightContext.beginPath(); rightContext.moveTo(Math.cos(angle) * 87, Math.sin(angle) * 87);
          rightContext.lineTo(Math.cos(angle) * 99, Math.sin(angle) * 99); rightContext.stroke();
          rightContext.font = '700 15px Arial, sans-serif'; rightContext.textAlign = 'center';
          rightContext.fillText(String(i * 30), Math.cos(angle) * 72, Math.sin(angle) * 72 + 5);
        }
        const angle = (-225 + clamp01(speedKmh / 360) * 270) * Math.PI / 180;
        rightContext.strokeStyle = '#f87d56'; rightContext.lineWidth = 4; rightContext.beginPath();
        rightContext.moveTo(0, 0); rightContext.lineTo(Math.cos(angle) * 86, Math.sin(angle) * 86); rightContext.stroke();
        rightContext.restore(); rightContext.textAlign = 'center'; rightContext.fillStyle = '#e1ecf6';
        rightContext.font = '700 23px Arial, sans-serif'; rightContext.fillText('km/h', 120, 161);
        rightContext.fillStyle = '#253c58'; rightContext.fillRect(0, 342, 240, 58);
        rightContext.fillStyle = '#f1d44c'; rightContext.font = '700 24px Arial, sans-serif';
        rightContext.fillText(`${Math.round(fuelLevel * 100)}% FUEL`, 120, 378);
      }
    }
    if (this.cx4LeftTexture !== null) this.cx4LeftTexture.needsUpdate = true;
    if (this.cx4RightTexture !== null) this.cx4RightTexture.needsUpdate = true;
  }

  /**
   * Paints one 7DCT dial face. The dials are static artwork, so this only runs
   * when the authored range changes; the needle carries the live value.
   */
  private paintJettaFace(target: HTMLCanvasElement, options: StyledDialOptions): void {
    const context = target.getContext('2d');
    if (context === null) return;
    context.clearRect(0, 0, target.width, target.height);
    context.drawImage(drawStyledDialArtwork(options), 0, 0);
  }

  /** Redraws the monochrome 7DCT centre display when its content changes. */
  private redrawJettaFace(
    speedKmh: number,
    gearSelector: string,
    gear: InstrumentGear,
    physicalGear: number | null,
    fuelLevel: number,
    temperatureC: number,
    indicators: InstrumentIndicatorState,
    indicatorKey: string,
  ): void {
    const centreKey = [
      speedKmh,
      gearSelector,
      gear,
      Math.round(fuelLevel * 100),
      Math.round(temperatureC),
    ].join('|');
    // Record the lamp state before the content guard can return, otherwise a
    // lamp-only change (for example the parking brake) would never repaint.
    const lampsChanged = indicatorKey !== this.lastIndicatorKey;
    if (this.jettaCentreKey === centreKey && !lampsChanged) return;
    this.jettaCentreKey = centreKey;
    this.lastIndicatorKey = indicatorKey;
    const centreCanvas = drawJettaCentreDisplay(
      speedKmh,
      gearSelector,
      physicalGear,
      fuelLevel,
      indicators,
    );
    const centreContext = this.jettaCentreCanvas?.getContext('2d') ?? null;
    if (centreContext !== null && this.jettaCentreCanvas !== null) {
      centreContext.clearRect(0, 0, this.jettaCentreCanvas.width, this.jettaCentreCanvas.height);
      centreContext.drawImage(centreCanvas, 0, 0);
    }
    if (this.jettaCentreTexture !== null) this.jettaCentreTexture.needsUpdate = true;
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
      [422, 'ABS', indicators.absWarning, '#ffc247'],
      [600, 'SKID', indicators.tcsActive, '#ffc247'],
      [722, assistOffLabel(indicators), indicators.tcsOff || indicators.escOff, '#ffc247'],
    ];
    for (const [x, label, active, color] of lamps) {
      if (active !== true) continue;
      const width = label.endsWith('OFF') ? 80 : Math.max(44, label.length * 11 + 18);
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
      drawStatusLamp(context, label, color, x, 129, label.length > 4 ? 14 : 17);
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
      state.frontFogLights, state.rearFogLights,
      state.parkingBrake,
      state.engineWarning,
      state.batteryWarning,
      state.cruise,
      state.absWarning, state.tcsActive, state.tcsOff, state.escOff,
    ].map((value) => (value === true ? '1' : '0')).join('');
  }

  private drawActiveIndicatorRow(
    context: CanvasRenderingContext2D,
    state: InstrumentIndicatorState,
  ): void {
    // Two fixed rows inside the centre LCD: lighting and the mirrored turn
    // lamps above, vehicle status and driver assist below.
    drawStatusLampRows(context, state, CENTRE_LCD_LAMP_ROWS);
  }
}
