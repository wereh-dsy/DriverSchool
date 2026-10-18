import * as T from 'three';
import { InstrumentCluster, type InstrumentTelemetry } from './InstrumentCluster';
import {
  beam, grid, label, loft, mercedesAPillarRing, mercedesFrontWindowCorners, mercedesRearWindowCorners,
  mercedesRoofHeight, mercedesSideGlassX, mercedesWindshieldPoint, mesh, path, polygon, rounded,
  starEmblem, sweep, upholstered,
} from './MercedesE300LGeometry';
import { MercedesE300LCenterDisplay } from './MercedesE300LCenterDisplay';
import { createMercedesInteriorTextures } from './MercedesE300LInteriorTextures';
import { cabinAmbientTarget } from './CabinLightResponse';
import type { VehicleAssetRegistry } from './VehicleAssetRegistry';
import type { VehicleVisualConfig, Vector3Tuple as P } from './VehicleVisualConfig';

interface SteeringGroups { steeringWheelBase: T.Group; steeringWheelRotationGroup: T.Group; gearLever: T.Group }
export interface MercedesE300LCabinState {
  instrument: InstrumentCluster;
  update(t: InstrumentTelemetry, dt: number): void;
  click(raycaster: T.Raycaster): boolean;
  cyclePage(): void;
}

/** Glass band and fascia datums taken from the reference interior. */
const BAND = { left: -.135, right: .780, bottom: .700, top: .862 } as const;
const DASH_FACE_Z = -.660;
const VENT_Y = .883;
const CLIMATE_Y = .670;

/**
 * Independent Mercedes-Benz E-Class cabin, authored from the V214 reference
 * interior: black upper pad, light trim band with open-pore veneer, full-width
 * vent slot, low MBUX Superscreen with a climate key row, twin-dial cluster,
 * tan stitched seats and a black headliner. Fine detail lives in a handful of
 * shared textures instead of extra meshes.
 */
export function buildMercedesE300LCabin(root: T.Group, c: VehicleVisualConfig, steering: SteeringGroups,
  assets?: VehicleAssetRegistry): MercedesE300LCabinState {
  const textures = createMercedesInteriorTextures(assets);
  const dashboardSoft = new T.MeshStandardMaterial({ color: 0x20232a, roughness: .97, side: T.DoubleSide });
  // Warm light leather banding above the screen and on the lower dash.
  const lightTrim = new T.MeshStandardMaterial({ color: 0x9e9384, roughness: .92, side: T.DoubleSide });
  const seatLeather = new T.MeshStandardMaterial({ map: textures.seatLeather, roughness: .84, side: T.DoubleSide });
  const doorLeather = new T.MeshStandardMaterial({ map: textures.doorLeather, roughness: .86, side: T.DoubleSide });
  const seatInset = new T.MeshStandardMaterial({ map: textures.seatLeather, roughness: .88,
    color: 0xd8bb95, side: T.DoubleSide });
  const carpet = new T.MeshStandardMaterial({ color: 0x121316, roughness: 1, side: T.DoubleSide });
  const trim = new T.MeshStandardMaterial({ color: 0x0d1014, roughness: .62, side: T.DoubleSide });
  const piano = new T.MeshPhysicalMaterial({ color: 0x080b0f, metalness: .18, roughness: .16,
    clearcoat: .95, clearcoatRoughness: .10, side: T.DoubleSide });
  const satin = new T.MeshStandardMaterial({ color: 0xb4bcc3, roughness: .30, metalness: .86, side: T.DoubleSide });
  const wood = new T.MeshPhysicalMaterial({ map: textures.wood, roughness: .42, metalness: .06,
    clearcoat: .40, clearcoatRoughness: .36, side: T.DoubleSide });
  // Reference car: black headliner, pillars and sun visors.
  const headliner = new T.MeshStandardMaterial({ color: 0x191b1f, roughness: 1, side: T.DoubleSide });
  const screenGlass = new T.MeshPhysicalMaterial({ color: 0x05070a, roughness: .09, metalness: .22,
    clearcoat: 1, clearcoatRoughness: .05, envMapIntensity: .10 });
  const steeringLeather = new T.MeshStandardMaterial({ color: 0x181a1e, roughness: .90, side: T.DoubleSide });
  textures.ventSlot.wrapS = T.RepeatWrapping; textures.ventSlot.repeat.set(5, 1);
  const ventSlotMaterial = new T.MeshStandardMaterial({ map: textures.ventSlot, roughness: .48,
    metalness: .40, side: T.DoubleSide });
  const climateMaterial = new T.MeshStandardMaterial({ map: textures.climateBar, roughness: .40,
    metalness: .35, side: T.DoubleSide });
  const turbineMaterial = new T.MeshStandardMaterial({ map: textures.turbineVent, roughness: .46,
    metalness: .52, side: T.DoubleSide });
  const seatSwitchMaterial = new T.MeshStandardMaterial({ map: textures.seatControls, roughness: .34,
    metalness: .72, side: T.DoubleSide });

  const ambientProfile = c.interiorAmbientLighting!;
  const ambient = new T.MeshStandardMaterial({ color: 0x2a2f3a, emissive: ambientProfile.color,
    emissiveIntensity: 0, toneMapped: false, roughness: .55, side: T.DoubleSide });
  const spills: T.PointLight[] = [];
  const textMaterials: T.MeshBasicMaterial[] = [];

  const floorY = c.body.sillY - .10;
  const driverX = c.driverEyePosition[0];

  // ---- Cabin floor, firewall and footwells --------------------------------
  root.add(loft('Mercedes carpeted cabin floor', [
    { z: -.960, points: [[-.826, floorY], [.826, floorY], [.826, floorY - .026], [-.826, floorY - .026]] },
    { z: .520, points: [[-.822, floorY], [.822, floorY], [.822, floorY - .026], [-.822, floorY - .026]] },
    { z: 1.820, points: [[-.792, floorY + .050], [.792, floorY + .050], [.792, floorY + .014], [-.792, floorY + .014]] },
  ], carpet));
  root.add(polygon('Mercedes angled firewall closure', [[-.828, floorY, -.960], [.828, floorY, -.960],
    [.828, .862, -.872], [-.828, .862, -.872]], carpet));
  for (const [name, x] of [['Driver', driverX], ['Passenger', -driverX]] as const)
    root.add(rounded(name + ' carpet mat', [.410, .012, .600], [x, floorY + .007, -.240], carpet));
  for (const sign of [-1, 1]) root.add(polygon((sign < 0 ? 'Driver' : 'Passenger') + ' footwell side closure',
    [[sign * .812, floorY, -.962], [sign * .812, .612, -.884], [sign * .806, .530, -.470], [sign * .806, floorY, -.470]],
    dashboardSoft));

  // ---- Dashboard: black pad, light band, veneer, vent slot, screen face ---
  // One closed cross-section: a thick black pad on top, a thin fascia below.
  const dashProfile = (x: number): P[] => {
    const bow = .010 * Math.exp(-((x / .62) ** 4));
    return [
      [x, .950, -.930 + bow], [x, .944, -.680], [x, .905, -.664],
      [x, .700, DASH_FACE_Z - bow * .4], [x, .660, -.682], [x, .612, -.706],
      [x, .566, -.742], [x, .556, -.930],
    ];
  };
  const stations = [-.818, -.700, -.560, driverX - .090, driverX + .090, -.230, -.040, .150, .340,
    .470, .620, .720, .818].sort((a, b) => a - b);
  root.add(sweep('Mercedes continuous folded dashboard', stations.map(dashProfile), dashboardSoft));
  const bandRing = (x: number, y0: number, y1: number, z: number, depth = .010): P[] => [
    [x, y0, z], [x, y1, z], [x, y1, z + depth], [x, y0, z + depth],
  ];
  root.add(sweep('Mercedes light leather instrument band',
    stations.map(x => bandRing(x, .893, .916, DASH_FACE_Z - .004, .012)), lightTrim));
  root.add(sweep('Mercedes open-pore veneer strip',
    stations.map(x => bandRing(x, .900, .910, DASH_FACE_Z - .002, .008)), wood));
  root.add(sweep('Mercedes satin band upper seam',
    stations.map(x => bandRing(x, .916, .920, DASH_FACE_Z + .002, .006)), satin));
  root.add(sweep('Mercedes vent slot satin lip',
    stations.map(x => bandRing(x, .873, .876, DASH_FACE_Z + .002, .006)), satin));
  // Full-width horizontal vent slot under the pad, exactly as in the reference.
  const ventSlot = mesh('Mercedes full width vent slot', new T.PlaneGeometry(1.46, .014), ventSlotMaterial);
  ventSlot.position.set(0, VENT_Y, DASH_FACE_Z + .012); root.add(ventSlot);
  // Round turbine vents at both ends of the fascia.
  for (const sign of [-1, 1]) {
    const vent = new T.Group(); vent.name = sign < 0 ? 'Left turbine dash vent' : 'Right turbine dash vent';
    vent.position.set(sign * .700, .866, DASH_FACE_Z + .014);
    vent.rotation.y = -sign * .12;
    vent.add(mesh('Turbine vent face', new T.CircleGeometry(.058, 32), turbineMaterial));
    const ring = mesh('Turbine vent satin ring', new T.TorusGeometry(.060, .0055, 8, 36), satin);
    ring.position.z = .002; vent.add(ring);
    root.add(vent);
  }

  // ---- 12.3-inch free-standing instrument panel ---------------------------
  const instrument = new InstrumentCluster(c.instrumentCluster, assets);
  instrument.position.set(...c.instrumentClusterTransform.position);
  instrument.rotation.set(...c.instrumentClusterTransform.rotation);
  instrument.scale.setScalar(c.instrumentClusterTransform.scale ?? 1);
  root.add(instrument);

  // ---- MBUX Superscreen band: 14.4-inch centre + 12.3-inch passenger ------
  const centerDisplay = new MercedesE300LCenterDisplay('Mercedes-Benz E 300 L');
  const superscreen = new T.Group(); superscreen.name = 'Mercedes MBUX Superscreen assembly';
  const bandCentreX = (BAND.left + BAND.right) / 2;
  superscreen.position.set(bandCentreX, (BAND.bottom + BAND.top) / 2, DASH_FACE_Z + .004);
  superscreen.rotation.set(0, -.012, 0);
  const bandWidth = BAND.right - BAND.left, bandHeight = BAND.top - BAND.bottom;
  superscreen.add(rounded('Mercedes Superscreen back housing', [bandWidth + .026, bandHeight + .022, .032],
    [0, 0, -.020], trim, .014));
  superscreen.add(rounded('Mercedes black glass panel', [bandWidth, bandHeight, .012], [0, 0, -.002],
    screenGlass, .012));
  superscreen.add(path('Mercedes glass panel satin edge', [
    [-bandWidth / 2 + .012, -bandHeight / 2, .004], [bandWidth / 2 - .012, -bandHeight / 2, .004],
    [bandWidth / 2, -bandHeight / 2 + .014, .004], [bandWidth / 2, bandHeight / 2 - .014, .004],
    [bandWidth / 2 - .012, bandHeight / 2, .004], [-bandWidth / 2 + .012, bandHeight / 2, .004],
    [-bandWidth / 2, bandHeight / 2 - .014, .004], [-bandWidth / 2, -bandHeight / 2 + .014, .004],
  ], .0018, satin, true));
  const screenMaterial = new T.MeshPhysicalMaterial({ color: 0xffffff, map: centerDisplay.texture,
    emissive: 0xffffff, emissiveMap: centerDisplay.texture, emissiveIntensity: 1, toneMapped: false,
    roughness: .18, metalness: 0, clearcoat: .20, clearcoatRoughness: .18, envMapIntensity: .06 });
  const centerScreen = mesh('Mercedes 14.4 inch centre touchscreen',
    new T.PlaneGeometry(.440, .138), screenMaterial);
  centerScreen.position.set(.0675 - bandCentreX, 0, .006); superscreen.add(centerScreen);
  const passengerMaterial = new T.MeshPhysicalMaterial({ color: 0xffffff, map: centerDisplay.passengerTexture,
    emissive: 0xffffff, emissiveMap: centerDisplay.passengerTexture, emissiveIntensity: 1, toneMapped: false,
    roughness: .18, metalness: 0, clearcoat: .20, clearcoatRoughness: .18, envMapIntensity: .06 });
  const passengerScreen = mesh('Mercedes 12.3 inch passenger display',
    new T.PlaneGeometry(.300, .132), passengerMaterial);
  passengerScreen.position.set(.625 - bandCentreX, 0, .006); superscreen.add(passengerScreen);
  root.add(superscreen);
  // Chrome strip and the physical climate key row directly under the glass.
  root.add(sweep('Mercedes chrome strip under glass',
    stations.map(x => bandRing(x, .688, .696, DASH_FACE_Z, .008)), satin));
  const climateBar = mesh('Mercedes climate control key row', new T.PlaneGeometry(.560, .030), climateMaterial);
  climateBar.position.set(.148, CLIMATE_Y, DASH_FACE_Z + .012);
  root.add(climateBar);

  // ---- Steering wheel: three-spoke luxury rim with the star hub ----------
  const base = steering.steeringWheelBase, wheel = steering.steeringWheelRotationGroup;
  base.position.set(...c.steeringWheelPosition); base.rotation.set(...c.steeringWheelRotation);
  base.name = 'Mercedes steering wheel base'; wheel.name = 'Mercedes steering rotation';
  base.add(wheel); root.add(base);
  root.add(beam('Mercedes steering column', c.steeringColumnMountPosition!, c.steeringWheelPosition, .031, trim));
  root.add(upholstered('Mercedes steering column shroud', [.118, .086, .172],
    [driverX, c.steeringWheelPosition[1] - .070, -.470], dashboardSoft, .42));
  const rim = mesh('Mercedes leather steering rim',
    new T.TorusGeometry(c.steeringWheelRadius, c.steeringWheelRimTubeRadius, 20, 96), steeringLeather);
  {
    const points = rim.geometry.getAttribute('position');
    for (let i = 0; i < points.count; i++) {
      const x = points.getX(i), y = points.getY(i), radius = Math.hypot(x, y);
      const grip = Math.exp(-(((Math.abs(y) - .028) / .042) ** 2)) * Math.min(1, Math.abs(x) / c.steeringWheelRadius);
      const scaled = c.steeringWheelRadius + (radius - c.steeringWheelRadius) * (1 + .12 * grip);
      points.setX(i, x * scaled / Math.max(1e-5, radius));
      const shapedY = y * scaled / Math.max(1e-5, radius);
      points.setY(i, shapedY < -.104 ? -.104 + (shapedY + .104) * .82 : shapedY);
      points.setZ(i, points.getZ(i) * .96 + .0016 * grip);
    }
    rim.geometry.computeVertexNormals();
  }
  wheel.add(rim);
  // Two split horizontal spokes with a bright insert, plus the vertical lower spoke.
  for (const sign of [-1, 1]) {
    const outline: P[] = [[sign * .048, .012, 0], [sign * .104, .020, 0], [sign * .156, .014, 0],
      [sign * .159, -.030, 0], [sign * .110, -.032, 0], [sign * .052, -.031, 0]];
    const rings = [[-.015, .93], [0, 1], [.023, .985], [.027, .925]].map(([z, scale]) => outline.map(
      ([x, y]) => [sign * .103 + (x! - sign * .103) * scale!, -.009 + (y! + .009) * scale!, z!] as P));
    wheel.add(sweep('Mercedes tapered horizontal steering spoke', rings, steeringLeather));
    const insert: P[] = [[sign * .058, -.019, 0], [sign * .130, -.020, 0],
      [sign * .130, -.010, 0], [sign * .058, -.009, 0]];
    wheel.add(sweep('Mercedes spoke satin insert',
      [insert, insert.map(([x, y, z]) => [x!, y!, z! + .006] as P)], satin));
    wheel.add(rounded('Mercedes steering control surface', [.070, .028, .006],
      [sign * .112, -.004, .029], piano, .004));
    wheel.add(rounded('Mercedes touch control pad', [.050, .018, .003],
      [sign * .112, -.003, .034], trim, .002));
  }
  const lowerSpoke: P[] = [[-.030, -.032, 0], [.030, -.032, 0], [.020, -.150, 0], [-.020, -.150, 0]];
  wheel.add(sweep('Mercedes tapered lower steering spoke',
    [lowerSpoke, lowerSpoke.map(([x, y, z]) => [x! * .93, y!, z! + .019] as P)], steeringLeather));
  wheel.add(path('Mercedes lower spoke satin outline', [[-.021, -.062, .022], [-.016, -.140, .022],
    [.016, -.140, .022], [.021, -.062, .022]], .0013, satin));
  wheel.add(upholstered('Mercedes padded airbag hub', [.122, .112, .058], [0, .010, .016], steeringLeather, .58));
  const hubStar = starEmblem('Steering wheel star badge', .0225, satin,
    new T.MeshStandardMaterial({ color: 0x0f1419, roughness: .32, metalness: .55 }));
  hubStar.position.set(0, .012, .046); wheel.add(hubStar);
  // Column-mounted PRND stalk on the right.
  const selector = steering.gearLever;
  selector.name = 'Mercedes column gear selector';
  selector.position.set(driverX + .215, c.steeringWheelPosition[1] - .028, -.352);
  selector.rotation.set(-.30, .16, .34);
  selector.add(beam('Mercedes selector stalk', [0, 0, 0], [0, -.010, -.128], .0085, trim));
  selector.add(upholstered('Mercedes selector tip', [.026, .024, .058], [0, -.014, -.150], piano, .50));
  const selectorLegend = label('Mercedes selector legend', 'R N D', .030, .010, [0, -.008, -.182]);
  textMaterials.push(selectorLegend.material as T.MeshBasicMaterial); selector.add(selectorLegend);
  root.add(selector);
  for (const [name, x, w, h, z] of [['Accelerator', driverX + .128, .050, .135, -.700],
    ['Brake', driverX - .058, .118, .075, -.712], ['Dead pedal', driverX - .252, .080, .165, -.748]] as const) {
    const pedal = rounded('Mercedes ' + name + ' pedal', [w, h, .018], [x, floorY + .152, z], satin);
    pedal.rotation.x = -.36; root.add(pedal);
  }

  // ---- Centre console: gloss black deck, touchpad and padded armrest -----
  root.add(loft('Mercedes descending centre console', [
    { z: -.620, points: [[-.162, floorY], [-.162, .620], [-.138, .664], [.138, .664], [.162, .620], [.162, floorY]] },
    { z: -.400, points: [[-.158, floorY], [-.158, .552], [-.136, .600], [.136, .600], [.158, .552], [.158, floorY]] },
    { z: -.120, points: [[-.156, floorY], [-.156, .528], [-.134, .572], [.134, .572], [.156, .528], [.156, floorY]] },
    { z: .380, points: [[-.154, floorY], [-.154, .528], [-.132, .572], [.132, .572], [.154, .528], [.154, floorY]] },
    { z: .780, points: [[-.148, floorY], [-.148, .540], [-.126, .588], [.126, .588], [.148, .540], [.148, floorY]] },
    { z: 1.020, points: [[-.128, floorY], [-.128, .412], [-.110, .468], [.110, .468], [.128, .412], [.128, floorY]] },
    { z: 1.560, points: [[-.098, floorY], [-.098, .300], [-.086, .330], [.086, .330], [.098, .300], [.098, floorY]] },
  ], dashboardSoft));
  // Gloss-black deck with long satin inlays, as on the reference console.
  root.add(rounded('Mercedes piano console deck', [.262, .012, .660], [0, .578, .180], piano, .004));
  for (const x of [-.062, .062])
    root.add(path('Mercedes console satin inlay', [[x, .586, -.130], [x, .586, .470]], .0022, satin));
  root.add(rounded('Mercedes haptic touchpad', [.150, .006, .118], [0, .586, -.020], screenGlass, .006));
  root.add(rounded('Mercedes console volume roller', [.026, .020, .020], [.116, .588, .104], satin, .005));
  root.add(upholstered('Mercedes leather front armrest', [.268, .080, .330], [0, .618, .690], seatLeather, .34));
  root.add(rounded('Mercedes armrest satin latch', [.052, .008, .026], [0, .660, .846], satin, .004));
  root.add(rounded('Mercedes rear console air vent', [.196, .062, .026], [0, .606, 1.566], trim, .008));
  for (let i = 0; i < 3; i++) root.add(rounded('Mercedes rear vent vane', [.176, .006, .006],
    [0, .624, 1.556 - i * .014], satin, .002));

  // ---- Front seats: tan leather with vertical pleats --------------------
  for (const [name, x] of [['Driver', driverX], ['Passenger', -driverX]] as const) {
    root.add(upholstered(name + ' seat base shell', [.436, .112, .500], [x, .352, .360], trim, .38));
    root.add(upholstered(name + ' leather seat cushion', [.442, .140, .512], [x, .446, .340], seatLeather, .50));
    root.add(upholstered(name + ' seat cushion insert', [.286, .020, .372], [x, .512, .312], seatInset, .34));
    const back = upholstered(name + ' shaped leather seat back', [.432, .548, .146], [x, .796, .664], seatLeather, .52);
    back.rotation.x = .11; root.add(back);
    const insert = upholstered(name + ' seat back insert', [.282, .386, .020], [x, .812, .588], seatInset, .40);
    insert.rotation.x = .11; root.add(insert);
    const shell = upholstered(name + ' seat back shell', [.386, .424, .026], [x, .766, .744], trim, .44);
    shell.rotation.x = .11; root.add(shell);
    for (const side of [-1, 1]) {
      root.add(beam(name + ' headrest support', [x + side * .064, 1.046, .716], [x + side * .064, 1.122, .722], .006, trim));
      root.add(upholstered(name + ' headrest side bolster', [.052, .104, .104],
        [x + side * .092, 1.086, .688], seatLeather, .48));
    }
    root.add(upholstered(name + ' comfort headrest', [.238, .152, .122], [x, 1.168, .726], seatLeather, .50));
    root.add(rounded(name + ' seatbelt buckle', [.028, .050, .036], [x + (x < 0 ? .228 : -.228), .462, .500], trim));
    root.add(polygon(name + ' seatbelt webbing', [[x - (x < 0 ? .196 : -.196), 1.040, .740],
      [x - (x < 0 ? .222 : -.222), 1.040, .740], [x + (x < 0 ? .020 : -.020), .450, .560],
      [x + (x < 0 ? .046 : -.046), .450, .560]], carpet));
  }

  // ---- Long-wheelbase rear compartment -----------------------------------
  root.add(upholstered('Rear continuous three-seat cushion base', [1.452, .160, .500], [0, .382, 1.268], trim, .38));
  root.add(upholstered('Rear continuous three-seat cushion', [1.462, .148, .516], [0, .472, 1.258], seatLeather, .44));
  root.add(upholstered('Rear bench lumbar transition', [1.452, .132, .164], [0, .554, 1.500], seatLeather, .45));
  const rearBack = upholstered('Rear continuous three-seat back', [1.462, .520, .156], [0, .810, 1.552], seatLeather, .40);
  rearBack.rotation.x = -.11; root.add(rearBack);
  for (const [name, x, width] of [['Left', -.472, .350], ['Centre', 0, .270], ['Right', .472, .350]] as const) {
    root.add(upholstered('Rear ' + name + ' cushion insert', [width, .016, .362], [x, .544, 1.232], seatInset, .32));
    const insert = upholstered('Rear ' + name + ' back insert', [width, .368, .020], [x, .816, 1.474], seatInset, .35);
    insert.rotation.x = -.11; root.add(insert);
    for (const side of [-1, 1]) root.add(beam('Rear ' + name + ' headrest stem',
      [x + side * .050, 1.052, 1.572], [x + side * .050, 1.116, 1.582], .005, trim));
    root.add(upholstered('Rear ' + name + ' comfort headrest',
      [name === 'Centre' ? .188 : .252, .142, .116], [x, 1.172, 1.588], seatLeather, .50));
  }
  root.add(loft('Rear upholstered parcel shelf', [
    { z: 1.640, points: [[-.792, .968], [.792, .968], [.792, .934], [-.792, .934]] },
    { z: 1.892, points: [[-.824, .954], [.824, .954], [.824, .922], [-.824, .922]] },
  ], dashboardSoft));
  root.add(polygon('Rear cabin upholstered trunk boundary', [[-.792, floorY + .048, 1.744],
    [.792, floorY + .048, 1.744], [.792, .950, 1.744], [-.792, .950, 1.744]], carpet));

  // ---- Doors: tan insert, veneer band, Burmester grille, seat switches ----
  for (const sign of [-1, 1]) {
    const side = sign < 0 ? 'Left' : 'Right';
    for (const [name, z0, z1] of [['front', -.902, .428], ['long rear', .482, 1.556]] as const) {
      const mid = (z0 + z1) / 2, length = z1 - z0;
      const section: [number, number][] = [[.858, floorY], [.858, .950], [.828, .950], [.802, .902],
        [.788, .790], [.784, .650], [.792, .480], [.808, .310], [.818, floorY]];
      root.add(loft(side + ' ' + name + ' closed door trim surface', [
        { z: z0, points: section.map(([x, y]) => [sign * x, y] as [number, number]) },
        { z: z1, points: section.map(([x, y]) => [sign * x, y] as [number, number]) },
      ], dashboardSoft));
      root.add(grid(side + ' ' + name + ' leather door insert', 12, 6, (u, v) =>
        [sign * (.780 + .010 * (v - .5) ** 2), .590 + v * .190, z0 + .130 + u * (length - .260)], doorLeather));
      root.add(rounded(side + ' ' + name + ' open-pore wood door band', [.012, .034, length * .86],
        [sign * .790, .806, mid], wood, .003));
      root.add(upholstered(side + ' ' + name + ' armrest', [.092, .068, length * .60],
        [sign * .756, .548, mid + .014], doorLeather, .38));
      root.add(beam(side + ' ' + name + ' satin door release', [sign * .778, .768, z0 + .230],
        [sign * .778, .768, z0 + .348], .005, satin));
      // Burmester grille: painted perforation on a recessed surround.
      root.add(rounded(side + ' ' + name + ' Burmester speaker surround', [.012, .120, .190],
        [sign * .788, .646, name === 'front' ? -.540 : 1.080], satin, .010));
      root.add(polygon(side + ' ' + name + ' Burmester speaker grille',
        [[sign * .795, .586, (name === 'front' ? -.618 : 1.002)], [sign * .795, .586, (name === 'front' ? -.462 : 1.158)],
          [sign * .795, .706, (name === 'front' ? -.462 : 1.158)], [sign * .795, .706, (name === 'front' ? -.618 : 1.002)]],
        turbineMaterial));
      if (name === 'front') {
        // Door-mounted seat switch panel, as on the reference door card.
        root.add(rounded(side + ' ' + name + ' seat switch surround', [.010, .046, .060],
          [sign * .786, .742, z0 + .150], satin, .006));
        const panel = mesh(side + ' front seat switch panel', new T.PlaneGeometry(.050, .040),
          seatSwitchMaterial);
        panel.position.set(sign * .793, .742, z0 + .150); panel.rotation.y = -sign * Math.PI / 2;
        root.add(panel);
      }
      root.add(path(side + ' ' + name + ' ambient door ribbon', name === 'front' ?
        [[sign * .792, .828, -.860], [sign * .786, .828, -.400], [sign * .784, .828, .060], [sign * .784, .828, z1 - .040]] :
        [[sign * .786, .830, z0 + .040], [sign * .786, .830, mid], [sign * .786, .830, z1 - .040]], .0018, ambient));
      root.add(path(side + ' ' + name + ' upper belt seal', [[sign * .846, .950, z0], [sign * .846, .950, z1]], .006, trim));
    }
    root.add(sweep(side + ' sculpted A pillar interior trim',
      Array.from({ length: 29 }, (_, j) => mercedesAPillarRing(sign, j / 28, true)), headliner));
    const front = mercedesFrontWindowCorners(sign);
    root.add(sweep(side + ' front window lower inner frame', Array.from({ length: 25 }, (_, j) => {
      const t = j / 24, from = front[0]!, to = front[3]!;
      const x = T.MathUtils.lerp(Math.abs(from[0]), Math.abs(to[0]), t);
      const y = T.MathUtils.lerp(from[1], to[1], t), z = T.MathUtils.lerp(from[2], to[2], t);
      return [[sign * (x + .002), y + .004, z], [sign * (x - .016), y + .004, z],
        [sign * (x - .018), y - .018, z], [sign * (x + .002), y - .018, z]] as P[];
    }), trim));
    const rear = mercedesRearWindowCorners(sign);
    root.add(sweep(side + ' rear door window inner frame', Array.from({ length: 25 }, (_, j) => {
      const t = j / 24, from = rear[0]!, to = rear[1]!;
      const x = T.MathUtils.lerp(Math.abs(from[0]), Math.abs(to[0]), t);
      const y = T.MathUtils.lerp(from[1], to[1], t), z = T.MathUtils.lerp(from[2], to[2], t);
      return [[sign * (x + .002), y + .004, z], [sign * (x - .018), y + .004, z],
        [sign * (x - .020), y - .020, z], [sign * (x + .002), y - .020, z]] as P[];
    }), trim));
    root.add(loft(side + ' front door mirror sail closure', [
      { z: -.930, points: [[sign * .846, .856], [sign * .846, .950], [sign * .804, .940], [sign * .794, .856]] },
      { z: -.762, points: [[sign * .846, .856], [sign * .846, 1.018], [sign * .814, 1.008], [sign * .794, .856]] },
    ], dashboardSoft));
    root.add(loft(side + ' B pillar interior trim', [
      { z: .412, points: [[sign * .818, .290], [sign * .840, .946], [sign * .686, 1.436], [sign * .662, 1.430],
        [sign * .808, .944], [sign * .794, .290]] },
      { z: .478, points: [[sign * .818, .290], [sign * .840, .946], [sign * .686, 1.436], [sign * .662, 1.430],
        [sign * .808, .944], [sign * .794, .290]] },
    ], headliner));
    root.add(grid(side + ' C pillar interior sail', 20, 8, (u, v) => {
      const y = T.MathUtils.lerp(1.424, .950, u);
      const x = T.MathUtils.lerp(mercedesSideGlassX(y) - .016, T.MathUtils.lerp(.688, .834, u) - .008, v);
      return [sign * x, y, T.MathUtils.lerp(1.036 + .406 * u ** .55, 1.040 + .880 * u, v) - .005];
    }, headliner));
    root.add(path(side + ' inner roof side rail', [
      [sign * .690, mercedesRoofHeight(-.320, .690) - .032, -.320],
      [sign * .694, mercedesRoofHeight(.360, .694) - .032, .360],
      [sign * .690, mercedesRoofHeight(1.048, .690) - .032, 1.048]], .011, headliner));
  }
  root.add(grid('Mercedes complete curved headliner', 28, 24, (u, v) => {
    const z = T.MathUtils.lerp(-.322, 1.122, u), x = (v * 2 - 1) * .694;
    return [x, mercedesRoofHeight(z, x) - .020, z];
  }, headliner));
  const windshieldHeader = sweep('Mercedes windshield roof header', Array.from({ length: 33 }, (_, j) => {
    const [x, y, z] = mercedesWindshieldPoint(1, j / 32);
    return [[x! * 1.03, y! + .001, z! - .016], [x! * 1.03, y! + .001, z! + .020],
      [x! * 1.03, y! - .030, z! + .030], [x! * 1.03, y! - .032, z! - .016]] as P[];
  }), headliner);
  windshieldHeader.position.y = -.042; root.add(windshieldHeader);
  root.add(beam('Mercedes rear glass roof header', [-.694, 1.386, 1.126], [.694, 1.386, 1.126], .014, headliner));
  for (const sign of [-1, 1]) root.add(upholstered((sign < 0 ? 'Driver' : 'Passenger') + ' stowed sun visor',
    [.288, .018, .136], [sign * .400, 1.402, -.256], headliner, .30));
  root.add(upholstered('Mercedes overhead console', [.164, .020, .108], [0, 1.398, -.166], dashboardSoft, .38));
  root.add(rounded('Mercedes reading lamp lens', [.086, .003, .040], [0, 1.388, -.180], trim, .001));

  // Real interior mirror: the reflective plane is created by the vehicle visual.
  const interiorMirror = c.centerMirrorTransform!;
  root.add(beam('Mercedes interior mirror windshield stem', [0, 1.352, -.418], interiorMirror.position, .008, trim));
  root.add(rounded('Mercedes centre mirror housing', [interiorMirror.size[0] + .014, interiorMirror.size[1] + .014,
    interiorMirror.housingDepth], [interiorMirror.position[0], interiorMirror.position[1],
    interiorMirror.position[2] - .010], trim, .010));

  // ---- Ambient spill lights ----------------------------------------------
  for (const [name, x] of [['driver', driverX], ['passenger', -driverX]] as const) {
    const light = new T.PointLight(ambientProfile.color, 0, .78, 2);
    light.name = 'Mercedes ' + name + ' footwell illumination';
    light.position.set(x, .44, -.560); light.userData.maximum = ambientProfile.footwellIntensity;
    root.add(light); spills.push(light);
  }
  const consoleSpill = new T.PointLight(ambientProfile.color, 0, 1.15, 2);
  consoleSpill.name = 'Mercedes console and fascia spill';
  consoleSpill.position.set(.10, .70, -.260);
  consoleSpill.userData.maximum = ambientProfile.dashboardFillIntensity ?? 0;
  root.add(consoleSpill); spills.push(consoleSpill);

  root.traverse(object => { if (object instanceof T.Mesh) object.userData.vehicleInteriorPart = 'mercedes-cabin'; });

  let ambientLevel = 0;
  return {
    instrument,
    click(raycaster) {
      const hits = raycaster.intersectObjects([centerScreen, passengerScreen], false);
      const hit = hits[0];
      if (!hit || hit.object !== centerScreen || !hit.uv) return false;
      return centerDisplay.click(hit.uv);
    },
    cyclePage() { centerDisplay.cyclePage(); },
    update(t, dt) {
      const on = t.ignitionOn ?? t.engineRunning ?? true;
      const lampsOn = !!(t.indicators?.positionLights || t.indicators?.headlights || t.indicators?.highBeam);
      const daylight = t.ambientDaylight ?? 1;
      ambientLevel = T.MathUtils.damp(ambientLevel,
        cabinAmbientTarget(ambientProfile, on, lampsOn, daylight), ambientProfile.fadeResponse, dt);
      ambient.emissiveIntensity = ambientLevel;
      for (const light of spills)
        light.intensity = (light.userData.maximum as number) * ambientLevel / ambientProfile.nightIntensity;
      const brightness = on ? .66 + .34 * Math.min(1, Math.max(0, daylight)) : 0;
      for (const material of textMaterials) material.opacity = on ? .60 + .24 * daylight : 0;
      screenMaterial.emissiveIntensity = brightness;
      screenMaterial.color.setScalar(on ? .06 : 0);
      passengerMaterial.emissiveIntensity = brightness * .92;
      passengerMaterial.color.setScalar(on ? .06 : 0);
      centerDisplay.update(t, dt, { on, readings: t.vehicleStatus });
    },
  };
}

/** Opaque cabin boundaries used by the closure ray test. */
export const MERCEDES_CABIN_CLOSURE_RAYS: readonly P[] = [[0, -1, 0], [0, 1, 0], [-1, -1, 0],
  [1, -.4, 0], [-1, .8, -.78], [1, .8, -.78], [0, -.40, -1], [0, -.27, 1], [-.65, -.60, 1], [.65, -.30, 1]];
export const MERCEDES_CABIN_BELT_X = mercedesSideGlassX(.950);
export const MERCEDES_REAR_COMPARTMENT_Z = 1.744;
