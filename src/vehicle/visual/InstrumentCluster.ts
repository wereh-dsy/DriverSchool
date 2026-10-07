import * as THREE from 'three';

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
  | 'jetta-twin-dial'
  | 'executive-virtual';

export interface InstrumentClusterConfig {
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

interface StyledDialOptions {
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
  context.clearRect(0, 0, FACE_SIZE, FACE_SIZE);

  // Machined bezel: dark outer shell, thin silver ring. Deliberately quiet so
  // the face reads as a traditional mechanical instrument.
  context.fillStyle = '#2a3035';
  context.beginPath();
  context.arc(center, center, center * radiusFactor + 26, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#0a0d0f';
  context.beginPath();
  context.arc(center, center, center * radiusFactor + 22, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#9aa4a9';
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
  background.addColorStop(0, '#101315');
  background.addColorStop(0.72, '#08090b');
  background.addColorStop(1, '#030404');
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
      ARC_START,
      ARC_END,
      clamp01(options.redlineFraction),
    );
    context.strokeStyle = '#d2453c';
    context.lineWidth = 11;
    context.beginPath();
    context.arc(
      center,
      center,
      tickRadius + 21,
      redStart - Math.PI / 2,
      ARC_END - Math.PI / 2,
    );
    context.stroke();
  }

  const totalMinorTicks = options.majorDivisions * options.minorTicksPerMajor;
  for (let index = 0; index <= totalMinorTicks; index += 1) {
    const fraction = index / totalMinorTicks;
    const angle = THREE.MathUtils.lerp(ARC_START, ARC_END, fraction);
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
    context.lineWidth = isMajor ? 6 : 2.5;
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
    } else if (this.config.displayStyle === 'cx4-tach-wing') {
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
    const layout = CX4_INSTRUMENT_CLUSTER_LAYOUT;
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
    tachFace.name = '6AT central tachometer face';
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
      0xe9edec,
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
    leftWing.name = '6AT gear wing';
    leftWing.position.set(-layout.wingCenterX, 0, layout.wingZ);
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
    rightWing.name = '6AT fuel and temperature wing';
    rightWing.position.set(layout.wingCenterX, 0, layout.wingZ);
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
      indicators.frontFogLights, indicators.rearFogLights,
      indicators.parkingBrake,
      indicators.engineWarning,
      indicators.batteryWarning,
      indicators.cruise,
      indicators.absWarning, indicators.tcsActive, indicators.tcsOff, indicators.escOff,
    ].map((value) => (value === true ? '1' : '0')).join('');
    if (this.config.displayStyle === 'executive-virtual') {
      const key = [displaySpeed, Math.round(rpm / 25), telemetry.gear, telemetry.driveMode,
        Math.round(fuelLevel * 100), Math.round(temperatureC), telemetry.cruiseTargetSpeedKmh, indicatorKey].join('|');
      if (key !== this.executiveKey) {
        this.redrawExecutiveFace(telemetry, indicators, speedKmh, rpm, fuelLevel, temperatureC);
        this.executiveKey = key;
      }
      return;
    }
    if (this.config.displayStyle === 'cx4-tach-wing') {
      const gearSelector = parseGearSelector(telemetry.gear);
      const cx4Key = [
        displaySpeed,
        telemetry.gear,
        Math.round(fuelLevel * 100),
        Math.round(temperatureC),
      ].join('|');
      if (cx4Key !== this.cx4Key || indicatorKey !== this.lastIndicatorKey) {
        this.redrawCx4Face(
          displaySpeed,
          gearSelector,
          telemetry.gear,
          fuelLevel,
          temperatureC,
          indicators,
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
    const common = { label: '', unit: '', minorTicksPerMajor: 5,
      majorTickColor: '#e4e8ed', minorTickColor: '#727c87', labelColor: '#cfd5dc' };
    this.executiveTachArtwork = drawStyledDialArtwork({ ...common, maximum: this.config.maximumRPM,
      majorDivisions: 7, labelDivisor: 1000, redlineFraction: this.config.redlineRPM / this.config.maximumRPM });
    this.executiveSpeedArtwork = drawStyledDialArtwork({ ...common, maximum: this.config.maximumSpeedKmh,
      majorDivisions: 7, minorTicksPerMajor: 4 });
    const display = new THREE.Mesh(new THREE.PlaneGeometry(.49, .2042),
      new THREE.MeshBasicMaterial({ map: this.executiveTexture, toneMapped: false }));
    display.name = 'Executive Virtual Cockpit twin dials and central road display';
    display.position.z = .070;
    this.add(display);
    this.redrawExecutiveFace({ speedKmh: 0, rpm: 0, gear: 'P', driveMode: 'NORMAL' }, {}, 0, 0, .72, 90);
  }

  private redrawExecutiveFace(telemetry: InstrumentTelemetry, indicators: InstrumentIndicatorState,
    speed: number, rpm: number, fuel: number, temperature: number): void {
    const context = this.executiveCanvas?.getContext('2d');
    if (context == null || this.executiveTachArtwork === null || this.executiveSpeedArtwork === null) return;
    const mode = telemetry.driveMode ?? 'NORMAL';
    const accent = mode === 'ECO' ? '#81bd9d' : mode === 'SPORT' ? '#e46666' : '#e0e4e9';
    context.fillStyle = '#070a0e'; context.fillRect(0, 0, 1440, 600);
    context.drawImage(this.executiveTachArtwork, 145, 95, 400, 400);
    context.drawImage(this.executiveSpeedArtwork, 895, 95, 400, 400);
    // Existing lamp artwork and states, in a fixed top warning band.
    drawStatusLampRows(context, indicators, [
      { x: 230, y: 12, width: 980, height: 32, labels: ['◀', 'POS', 'LO', 'HI', 'FRFOG', 'RRFOG', '▶'] },
      { x: 400, y: 49, width: 640, height: 30, labels: ['P', 'ENG', 'BAT', 'ABS', 'SKID', 'TCS OFF', 'CRUISE'] },
    ]);
    const text = (value: string, x: number, y: number, size: number, color = '#e3e7ec'): void => {
      context.fillStyle = color; context.font = `500 ${size}px "Segoe UI", sans-serif`;
      context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(value, x, y);
    };
    // Short digital needles avoid the centres containing primary readouts.
    const needle = (x: number, fraction: number): void => {
      const angle = THREE.MathUtils.lerp(ARC_START, ARC_END, clamp01(fraction));
      context.strokeStyle = '#ec6a64'; context.lineWidth = 5;
      context.beginPath(); context.moveTo(x + Math.sin(angle) * 115, 295 - Math.cos(angle) * 115);
      context.lineTo(x + Math.sin(angle) * 162, 295 - Math.cos(angle) * 162); context.stroke();
    };
    needle(345, rpm / this.config.maximumRPM); needle(1095, speed / this.config.maximumSpeedKmh);
    text(formatInstrumentGear(telemetry.gear), 345, 270, 62);
    text(mode, 345, 336, 28, accent);
    context.fillStyle = accent; context.fillRect(305, 358, 80, 3);
    text('1/min x 1000', 345, 425, 19, '#8e98a5');
    text(String(Math.round(speed)), 1095, 270, 74);
    text('km/h', 1095, 337, 24, '#9ca5b0');
    // Wide central area is independent of dial artwork and can host future navigation.
    context.fillStyle = '#10161e'; drawBeveledPanel(context, 565, 110, 310, 366, 8); context.fill();
    text(indicators.cruise ? 'CRUISE ACTIVE' : 'DRIVING INFORMATION', 720, 144, 20);
    text(indicators.cruise && telemetry.cruiseTargetSpeedKmh !== undefined
      ? `SET ${Math.round(telemetry.cruiseTargetSpeedKmh)} km/h` : 'CRUISE STANDBY', 720, 178, 21, '#9faab6');
    // Static road illustration only: no implied lane sensing or new driver assistance.
    context.strokeStyle = '#75808d'; context.lineWidth = 3;
    for (const sign of [-1, 1]) {
      context.beginPath(); context.moveTo(720 + sign * 95, 446); context.lineTo(720 + sign * 28, 230); context.stroke();
    }
    context.setLineDash([16, 18]); context.strokeStyle = '#3c4654';
    for (const sign of [-1, 1]) {
      context.beginPath(); context.moveTo(720 + sign * 48, 440); context.lineTo(720 + sign * 14, 232); context.stroke();
    }
    context.setLineDash([]);
    context.fillStyle = '#bdc5cf'; drawBeveledPanel(context, 699, 343, 42, 77, 10); context.fill();
    context.fillStyle = '#26323f'; drawBeveledPanel(context, 705, 358, 30, 22, 4); context.fill();
    const bar = (x: number, fraction: number, label: string, bottom: string, top: string): void => {
      context.fillStyle = '#26313d'; context.fillRect(x - 5, 157, 10, 254);
      context.fillStyle = '#c3cbd4'; context.fillRect(x - 5, 411 - 254 * fraction, 10, 254 * fraction);
      text(top, x, 134, 18, '#9ba5af'); text(bottom, x, 438, 18, '#9ba5af'); text(label, x, 478, 18);
    };
    bar(100, clamp01((temperature - 50) / 80), 'TEMP', '50', '130');
    bar(1340, fuel, 'FUEL', 'E', 'F');
    context.strokeStyle = '#323b46'; context.lineWidth = 1;
    context.beginPath(); context.moveTo(72, 520); context.lineTo(1368, 520); context.stroke();
    text('AWD', 180, 555, 21, '#a3acb6');
    text(telemetry.engineRunning === false ? 'IGNITION ON / ENGINE OFF' : 'EXECUTIVE  |  2.0 TURBO', 720, 555, 22, '#a3acb6');
    text(`${Math.round(temperature)} C`, 1260, 555, 21, '#a3acb6');
    this.executiveTexture!.needsUpdate = true;
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
      this.cx4TachNeedle.rotation.z = this.currentTachometerRotation;
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
    ].join('|');
    this.lastIndicatorKey = this.getIndicatorKey(indicators);

    const tachContext = this.cx4TachCanvas.getContext('2d');
    if (tachContext !== null) {
      const artwork = drawStyledDialArtwork({
        label: 'RPM',
        unit: 'x1000 r/min',
        maximum: this.config.maximumRPM,
        majorDivisions: 8,
        minorTicksPerMajor: 4,
        labelDivisor: 1_000,
        redlineFraction: this.config.redlineRPM / this.config.maximumRPM,
        majorTickColor: '#eef2f0',
        minorTickColor: '#a3abae',
        labelColor: '#e6ebe8',
        embeddedSpeedKmh: speedKmh,
      });
      tachContext.clearRect(0, 0, this.cx4TachCanvas.width, this.cx4TachCanvas.height);
      tachContext.drawImage(artwork, 0, 0);
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
    }
    const rightContext = this.cx4RightCanvas?.getContext('2d') ?? null;
    const rightArtwork = drawCx4RightWing(fuelLevel, temperatureC, indicators);
    if (rightContext !== null && this.cx4RightCanvas !== null) {
      rightContext.clearRect(0, 0, this.cx4RightCanvas.width, this.cx4RightCanvas.height);
      rightContext.drawImage(rightArtwork, 0, 0);
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
