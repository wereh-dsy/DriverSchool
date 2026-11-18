import * as T from 'three';
import { InstrumentCluster, type InstrumentTelemetry } from './InstrumentCluster';
import { loft, mesh, roofHeight, sideGlassX } from './BMW530Geometry';
import * as geometry from './BMW530Geometry';
import type { VehicleAssetRegistry } from './VehicleAssetRegistry';
import { bmwWindshieldPoint, bmwAPillarRing, bmwFrontWindowCorners } from './BMW530FrontFrame';
import { cabinAmbientTarget } from './CabinLightResponse';
import { BMW530CenterDisplay } from './BMW530CenterDisplay';
import type { VehicleVisualConfig, Vector3Tuple as P } from './VehicleVisualConfig';

interface SteeringGroups { steeringWheelBase: T.Group; steeringWheelRotationGroup: T.Group; gearLever: T.Group }
export interface BMW530CabinState {
  instrument: InstrumentCluster;
  update(t: InstrumentTelemetry, dt: number): void;
  click(raycaster: T.Raycaster): boolean;
  cyclePage(): void;
}

export function buildBMW530Cabin(root: T.Group, c: VehicleVisualConfig, steering: SteeringGroups, assets?: VehicleAssetRegistry): BMW530CabinState {
  let resourceIndex = 0;
  const cached = <A extends unknown[]>(build: (...args: A) => T.Mesh, materialIndex?: number) => (...args: A): T.Mesh => {
    const key = `cabin/${resourceIndex++}`;
    return assets && c.assetCache ? assets.mesh(c, key, () => build(...args),
      materialIndex === undefined ? undefined : args[materialIndex] as T.Material) : build(...args);
  };
  // Immutable completed geometries and text textures are reusable. Loft/steering
  // rim geometry is authored with later vertex edits and keeps instance ownership.
  const beam = cached(geometry.beam, 4), grid = cached(geometry.grid, 4), label = cached(geometry.label);
  const path = cached(geometry.path, 3), polygon = cached(geometry.polygon, 2), rounded = cached(geometry.rounded, 3);
  const upholstered = cached(geometry.upholstered, 3), sweep = cached(geometry.sweep, 2), steeringBadge = cached(geometry.steeringBadge);
  const soft = new T.MeshStandardMaterial({ color: 0x25282c, roughness: .93, side: T.DoubleSide });
  const leather = new T.MeshStandardMaterial({ color: c.body.interiorColor, roughness: .8, side: T.DoubleSide });
  const inset = new T.MeshStandardMaterial({ color: 0x3c322c, roughness: .89, side: T.DoubleSide });
  const carpet = new T.MeshStandardMaterial({ color: 0x141619, roughness: 1, side: T.DoubleSide });
  const plastic = new T.MeshStandardMaterial({ color: 0x101316, roughness: .68, side: T.DoubleSide });
  const piano = new T.MeshPhysicalMaterial({ color: 0x101316, metalness: .12, roughness: .28, clearcoat: .7, side: T.DoubleSide });
  const satin = new T.MeshStandardMaterial({ color: 0x8e959a, roughness: .48, metalness: .65, side: T.DoubleSide });
  const wood = new T.MeshStandardMaterial({ color: 0x38312b, roughness: .52, side: T.DoubleSide });
  const dashSoft = new T.MeshStandardMaterial({color:0x292a2c,roughness:.99,metalness:0,side:T.DoubleSide});
  const steeringLeather = new T.MeshStandardMaterial({color:0x202225,roughness:.87,metalness:0,side:T.DoubleSide});
  const frontWood = new T.MeshPhysicalMaterial({color:0x40372e,roughness:.34,metalness:.06,clearcoat:.38,clearcoatRoughness:.3,side:T.DoubleSide});
  const displayTrim = new T.MeshPhysicalMaterial({color:0x0b1018,roughness:.34,metalness:.12,clearcoat:.25,clearcoatRoughness:.3});
  const headliner = new T.MeshStandardMaterial({ color: 0x595751, roughness: 1, side: T.DoubleSide });
  const profile = c.interiorAmbientLighting!;
  const ambient = new T.MeshStandardMaterial({ color: 0x3a322a, emissive: profile.color, emissiveIntensity: 0,
    toneMapped: false, roughness: .58, side: T.DoubleSide });
  const frontAmbient = ambient.clone();
  const texts: T.MeshBasicMaterial[] = [];
  const text = (name: string, value: string, width: number, height: number, pos: P, rot: P = [0, 0, 0]) => {
    const l = label(name, value, width, height, pos, rot); texts.push(l.material as T.MeshBasicMaterial); root.add(l); return l;
  };
  const strip = (name: string, points: P[]) => root.add(path(name, points, .0013, name.includes('long rear')?ambient:frontAmbient));
  const panel = (name: string, points: P[], mat = leather) => root.add(polygon(name, points, mat));
  const floorY = c.body.sillY - .10;
  root.add(loft('BMW carpeted cabin floor', [
    { z: -.97, points: [[-.83, floorY], [.83, floorY], [.83, floorY - .026], [-.83, floorY - .026]] },
    { z: .5, points: [[-.827, floorY], [.827, floorY], [.827, floorY - .026], [-.827, floorY - .026]] },
    { z: 1.79, points: [[-.795, floorY + .055], [.795, floorY + .055], [.795, floorY + .018], [-.795, floorY + .018]] },
  ], carpet));
  panel('BMW angled firewall and footwell closure', [[-.833, floorY, -.97], [.833, floorY, -.97],
    [.833, .82, -.88], [-.833, .82, -.88]], carpet);
  for (const [name, x] of [['Driver', -.40], ['Passenger', .40]] as const)
    root.add(rounded(name + ' carpet mat', [.40, .012, .60], [x, floorY + .007, -.25], carpet));
  for (const sign of [-1, 1]) panel((sign < 0 ? 'Driver' : 'Passenger') + ' footwell outer kick panel',
    [[sign * .815, floorY, -.972], [sign * .815, .615, -.891], [sign * .809, .54, -.475], [sign * .809, floorY, -.475]], soft);

  // The raised upper pad includes one thin brow over both displays. The recess,
  // rolled fascia and knee panel sit at distinct depths rather than on one plane.
  const frontFaceZ = (x: number) => -.589 + .082 * Math.exp(-(((x + .4) / .34) ** 6)) + .077 * Math.exp(-(((x - .10) / .29) ** 6));
  const displayEnvelope = (x: number) => T.MathUtils.smoothstep(x, -.75, -.63) * (1 - T.MathUtils.smoothstep(x, .31, .43));
  const dashSections = Array.from({ length: 65 }, (_, j) => {
    const x = T.MathUtils.lerp(-.835, .835, j / 64), raised = displayEnvelope(x), front = frontFaceZ(x);
    const browZ = -.665 + .005 * Math.exp(-(((x + .4) / .32) ** 6));
    const profileYZ = [[-.955,.906],[-.925,.923],[-.832,.925 + .018 * raised],
      [-.760,.926 + .105 * raised],[-.711,.916 + .146 * raised],
      [browZ,.892 + .172 * raised],[browZ + .006,.866 + .184 * raised],
      [-.695,.834 + .025 * raised],[front,.827],[front + .020,.782],
      [front + .018,.730],[front - .012,.661],[front - .060,.536],[-.90,.515]];
    return { z: x, points: profileYZ.map(([z,y]) => [-z!,y!] as [number,number]) };
  });
  const dashboard = loft('BMW continuous sculpted dashboard shell', dashSections, dashSoft);
  dashboard.geometry.rotateY(Math.PI / 2); root.add(dashboard);
  const fascia = loft('BMW shaped passenger and driver fascia', Array.from({length:49},(_,j) => {
    const x = T.MathUtils.lerp(-.825,.825,j/48), z = frontFaceZ(x) + .025;
    return {z:x,points:[[-z,.762],[-z,.809],[-z+.015,.809],[-z+.018,.762]] as [number,number][]};
  }),frontWood); fascia.geometry.rotateY(Math.PI/2); root.add(fascia);
  strip('Dashboard ambient line', Array.from({length:17},(_,j) => {
    const x = T.MathUtils.lerp(-.825,.825,j/16); return [x,.812,frontFaceZ(x)+.027] as P;
  }));
  // A single line under the display ledge ties the screens into the dashboard
  // without adding a second lighting system or wrapping the console.
  strip('BMW centre display lower ambient edge', [[-.672,.821,-.580],[.346,.821,-.580]]);
  const cowl = sweep('BMW closed windshield lower cowl', Array.from({length:33},(_,j) => {
    const [x,y,z] = bmwWindshieldPoint(0,j/32);
    return [[x,y-.014,z-.026],[x,y+.003,z-.008],[x,y-.007,z+.034],
      [x,y-.032,z+.036],[x,y-.040,z-.026]] as P[];
  }),dashSoft); root.add(cowl);
  root.add(loft('BMW continuous recessed display backing', [
    {z:-.704,points:[[-.698,.853],[-.695,1.012],[-.656,1.040],[.332,1.040],[.369,1.013],[.369,.853]]},
    {z:-.653,points:[[-.692,.846],[-.687,1.014],[-.649,1.038],[.331,1.038],[.363,1.013],[.363,.846]]},
  ],displayTrim));
  root.add(loft('BMW continuous display lower ledge', [
    {z:-.673,points:[[-.691,.817],[-.691,.842],[.365,.842],[.365,.817]]},
    {z:-.578,points:[[-.685,.817],[-.685,.835],[.357,.835],[.357,.817]]},
  ],dashSoft));
  const instrument = new InstrumentCluster(c.instrumentCluster, assets);
  instrument.position.set(...c.instrumentClusterTransform.position); instrument.rotation.set(...c.instrumentClusterTransform.rotation); root.add(instrument);
  // Same top datum, bezel finish and recessed backing as the driver display.
  const screenGroup = new T.Group(); screenGroup.name = 'BMW integrated centre display';
  screenGroup.position.set(.089,.936,-.618); screenGroup.rotation.set(-.16,-.09,0);
  screenGroup.add(rounded('BMW centre screen back housing',[.430,.195,.035],[0,0,-.010],plastic,.008));
  screenGroup.add(rounded('BMW centre screen bezel',[.424,.189,.013],[0,0,.004],displayTrim,.006));
  const centerDisplay = new BMW530CenterDisplay(c.name.replace(/ G38 LCI$/, ''));
  const screenTexture = centerDisplay.texture;
  const screenMaterial = new T.MeshPhysicalMaterial({color:0x0d141c,map:screenTexture,emissive:0xffffff,emissiveMap:screenTexture,
    emissiveIntensity:1,toneMapped:false,roughness:.23,metalness:0,specularIntensity:.3,clearcoat:.2,clearcoatRoughness:.25,envMapIntensity:.1});
  const screen = mesh('BMW live iDrive vehicle information',new T.PlaneGeometry(.408,.16575),screenMaterial);
  screen.position.z = .011; screenGroup.add(screen); root.add(screenGroup);
  // One understated slot remains only at the existing rear console; no front vent ornaments.
  const vent = (name: string,w: number,pos: P) => {
    root.add(rounded(name,[w,.021,.014],pos,plastic,.002));
    root.add(rounded(name+' single vane',[w-.02,.002,.004],[pos[0],pos[1],pos[2]+.008],soft,.001));
  };
  // One gently descending console, followed by a covered storage deck and low controls.
  root.add(loft('BMW flowing dashboard to centre tunnel', [
    { z: -.525, points: [[-.153, floorY], [-.153, .66], [-.127, .728], [.127, .728], [.153, .66], [.153, floorY]] },
    { z: -.39, points: [[-.15, floorY], [-.15, .50], [-.13, .585], [.13, .585], [.15, .50], [.15, floorY]] },
    { z: -.20, points: [[-.15, floorY], [-.15, .43], [-.13, .522], [.13, .522], [.15, .43], [.15, floorY]] },
    { z: .48, points: [[-.15, floorY], [-.15, .43], [-.13, .522], [.13, .522], [.15, .43], [.15, floorY]] },
    { z: .80, points: [[-.146, floorY], [-.146, .46], [-.12, .551], [.12, .551], [.146, .46], [.146, floorY]] },
    { z: .97, points: [[-.13, floorY], [-.13, .38], [-.11, .441], [.11, .441], [.13, .38], [.13, floorY]] },
    { z: 1.40, points: [[-.095, floorY], [-.095, .29], [-.08, .32], [.08, .32], [.095, .29], [.095, floorY]] },
  ], soft));
  root.add(rounded('BMW closed storage and cupholder cover', [.256, .009, .24], [0, .527, -.065], wood, .003));
  root.add(rounded('BMW piano black console control deck', [.258, .012, .37], [0, .526, .247], piano, .004));
  const selector = steering.gearLever; selector.name = 'BMW compact electronic selector';
  selector.position.set(...c.gearLeverPosition); selector.rotation.set(...c.gearLeverRotation);
  selector.add(upholstered('BMW short selector grip', [.037, .051, .062], [0, .021, 0], piano, .42));
  const legend = label('BMW selector Park button', 'P', .014, .012, [0, .038, .028]); texts.push(legend.material as T.MeshBasicMaterial); selector.add(legend); root.add(selector);
  text('BMW selector PRND legend', 'R N D', .033, .011, [-.077, .535, .26], [-Math.PI / 2, 0, 0]);
  root.add(upholstered('BMW leather front armrest', [.272, .076, .32], [0, .573, .659], leather, .35));
  for (const sign of [-1, 1]) strip('BMW console ambient edge', [[sign * .144, .501, -.16], [sign * .147, .501, .19], [sign * .146, .509, .49]]);
  vent('BMW rear console discreet air slot', .16, [0, .443, .981]);

  // Large continuous upholstered forms replace a stack of box-like bolsters and seams.
  for (const [name, x] of [['Driver', -.40], ['Passenger', .40]] as const) {
    root.add(upholstered(name + ' seat base shell', [.418, .108, .49], [x, .354, .36], plastic, .38));
    root.add(upholstered(name + ' leather seat cushion', [.425, .135, .50], [x, .445, .335], leather, .50));
    root.add(upholstered(name + ' seat cushion insert', [.275, .019, .365], [x, .509, .31], inset, .35));
    const back = upholstered(name + ' shaped leather seat back', [.416, .539, .142], [x, .793, .657], leather, .52); back.rotation.x = .10; root.add(back);
    const backInsert = upholstered(name + ' seat back insert', [.273, .379, .018], [x, .81, .582], inset, .40); backInsert.rotation.x = .10; root.add(backInsert);
    const shell = upholstered(name + ' rear seat shell', [.372, .414, .025], [x, .764, .733], soft, .44); shell.rotation.x = .10; root.add(shell);
    for (const side of [-1, 1]) root.add(beam(name + ' headrest support', [x + side * .062, 1.04, .711], [x + side * .062, 1.117, .716], .006, plastic));
    root.add(upholstered(name + ' comfort headrest', [.233, .15, .118], [x, 1.163, .72], leather, .50));
    root.add(rounded(name + ' seatbelt buckle', [.026, .047, .035], [x + (x < 0 ? .224 : -.224), .457, .50], plastic));
  }
  root.add(upholstered('Rear continuous three-seat bench base', [1.43, .159, .49], [0, .383, 1.261], plastic, .38));
  root.add(upholstered('Rear continuous three-seat cushion', [1.44, .146, .51], [0, .472, 1.253], leather, .44));
  root.add(upholstered('Rear bench continuous lumbar transition', [1.43, .13, .16], [0, .552, 1.491], leather, .45));
  const rearBack = upholstered('Rear continuous three-seat back', [1.44, .51, .153], [0, .806, 1.54], leather, .40); rearBack.rotation.x = -.10; root.add(rearBack);
  for (const [name, x, width] of [['Left', -.46, .34], ['Centre', 0, .26], ['Right', .46, .34]] as const) {
    root.add(upholstered('Rear ' + name + ' cushion insert', [width, .015, .356], [x, .543, 1.228], inset, .32));
    const insert = upholstered('Rear ' + name + ' back insert', [width, .36, .018], [x, .813, 1.464], inset, .35); insert.rotation.x = -.10; root.add(insert);
    for (const s of [-1, 1]) root.add(beam('Rear ' + name + ' headrest stem', [x + s * .048, 1.045, 1.558], [x + s * .048, 1.108, 1.568], .005, plastic));
    root.add(upholstered('Rear ' + name + ' comfort headrest', [name === 'Centre' ? .185 : .248, .139, .113], [x, 1.166, 1.574], leather, .50));
  }
  root.add(loft('Rear upholstered parcel shelf', [{ z: 1.62, points: [[-.795, .96], [.795, .96], [.795, .927], [-.795, .927]] },
    { z: 1.894, points: [[-.827, .947], [.827, .947], [.827, .917], [-.827, .917]] }], soft));
  panel('Rear cabin upholstered trunk boundary', [[-.795, floorY + .05, 1.739], [.795, floorY + .05, 1.739], [.795, .945, 1.739], [-.795, .945, 1.739]], carpet);

  // Door cross-sections close the entire aperture and share the exterior belt datum.
  for (const sign of [-1, 1]) {
    const side = sign < 0 ? 'Left' : 'Right';
    for (const [name, z0, z1] of [['front', -.895, .422], ['long rear', .475, 1.54]] as const) {
      const mid = (z0 + z1) / 2, length = z1 - z0;
      const section: [number, number][] = [[.846, floorY], [.846, .946], [.820, .946], [.797, .90], [.783, .79], [.779, .65], [.788, .48], [.803, .31], [.812, floorY]];
      root.add(loft(side + ' ' + name + ' closed door trim surface', [{ z: z0, points: section.map(([x,y]) => [sign*x,y] as [number,number]) },
        { z: z1, points: section.map(([x,y]) => [sign*x,y] as [number,number]) }], soft));
      root.add(grid(side + ' ' + name + ' leather door insert', 12, 6, (u, v) =>
        [sign * (.776 + .009 * (v - .5) ** 2), .58 + v * .18, z0 + .12 + u * (length - .24)], leather));
      if (name === 'front') root.add(loft(side + ' front wood door trim', Array.from({length:21},(_,j) => {
        const z = T.MathUtils.lerp(frontFaceZ(sign*.825)+.025,z1-.025,j/20), x = .773+.052*Math.exp(-(((z+.565)/.15)**2));
        return {z,points:[[sign*x,.767],[sign*x,.809],[sign*(x+.012),.809],[sign*(x+.012),.767]]};
      }),frontWood));
      else root.add(rounded(side + ' ' + name + ' wood door trim', [.012, .031, length * .88], [sign * .784, .803, mid], wood, .003));
      root.add(upholstered(side + ' ' + name + ' armrest', [.089, .066, length * .61], [sign * .753, .539, mid + .016], leather, .39));
      root.add(beam(side + ' ' + name + ' satin door release', [sign * .774, .763, z0 + .22], [sign * .774, .763, z0 + .333], .005, satin));
      root.add(rounded(side + ' ' + name + ' window control surface', [.029, .004, name === 'front' && sign < 0 ? .093 : .031],
        [sign * .733, .573, mid - .13], piano, .001));
      strip(side + ' ' + name + ' ambient door trim', name === 'front' ?
        [[sign*.825,.812,frontFaceZ(sign*.825)+.027],[sign*.785,.812,-.40],[sign*.773,.812,.04],[sign*.773,.812,z1-.035]] :
        [[sign * .778, .821, z0 + .035], [sign * .778, .821, mid], [sign * .778, .821, z1 - .035]]);
      root.add(path(side + ' ' + name + ' upper belt seal', [[sign * .842, .947, z0], [sign * .842, .947, z1]], .006, plastic));
    }
    root.add(sweep(side + ' sculpted A pillar interior trim', Array.from({length:29},(_,j)=>bmwAPillarRing(sign,j/28,true)),headliner));
    const windowCorners = bmwFrontWindowCorners(sign);
    const bottomStart = windowCorners[0]!, bottomEnd = windowCorners[3]!;
    root.add(sweep(side + ' front window lower inner frame',Array.from({length:25},(_,j)=>{
      const t = j/24, x = T.MathUtils.lerp(Math.abs(bottomStart[0]),Math.abs(bottomEnd[0]),t);
      const y = T.MathUtils.lerp(bottomStart[1],bottomEnd[1],t), z = T.MathUtils.lerp(bottomStart[2],bottomEnd[2],t);
      return [[sign*(x+.002),y+.004,z],[sign*(x-.016),y+.004,z],
        [sign*(x-.018),y-.018,z],[sign*(x+.002),y-.018,z]] as P[];
    }),plastic));
    const topStart = windowCorners[1]!, topEnd = windowCorners[2]!;
    root.add(sweep(side + ' front window upper inner frame',Array.from({length:25},(_,j)=>{
      const t = j/24, x = T.MathUtils.lerp(Math.abs(topStart[0]),Math.abs(topEnd[0]),t);
      const y = T.MathUtils.lerp(topStart[1],topEnd[1],t), z = T.MathUtils.lerp(topStart[2],topEnd[2],t);
      return [[sign*(x+.011),y+.012,z],[sign*(x-.022),y+.012,z],[sign*(x-.024),y-.014,z],[sign*(x+.005),y-.014,z]] as P[];
    }),headliner));
    root.add(loft(side + ' front door mirror sail closure', [
      { z: -.917, points: [[sign*.844,.853],[sign*.844,.947],[sign*.801,.938],[sign*.791,.853]] },
      { z: -.752, points: [[sign*.844,.853],[sign*.844,1.015],[sign*.812,1.005],[sign*.791,.853]] },
    ], soft));
    root.add(loft(side + ' B pillar interior trim', [
      { z: .407, points: [[sign * .813, .29], [sign * .836, .942], [sign * .68, 1.435], [sign * .656, 1.43], [sign * .804, .94], [sign * .789, .29]] },
      { z: .474, points: [[sign * .813, .29], [sign * .836, .942], [sign * .68, 1.435], [sign * .656, 1.43], [sign * .804, .94], [sign * .789, .29]] },
    ], headliner));
    root.add(grid(side + ' C pillar interior sail', 20, 8, (u, v) => {
      const y = T.MathUtils.lerp(1.432, .946, u);
      const x = T.MathUtils.lerp(sideGlassX(y) - .014, T.MathUtils.lerp(.682, .83, u) - .006, v);
      return [sign * x, y, T.MathUtils.lerp(1.015 + .515 * u ** .55, 1.03 + .86 * u, v) - .005];
    }, headliner));
    root.add(path(side + ' inner roof side rail', [[sign * .681, 1.418, -.30], [sign * .683, 1.448, .36], [sign * .681, 1.396, 1.025]], .013, headliner));
    for (const [name, z, x, endZ] of [['Front', .46, sign * .785, .47], ['Rear outer', 1.57, sign * .771, 1.23]] as const) {
      panel(side + ' ' + name + ' seatbelt webbing', [[x, 1.065, z], [x - sign * .025, 1.065, z], [sign * .626, .464, endZ], [sign * .65, .464, endZ]], carpet);
    }
  }
  root.add(grid('BMW complete curved headliner', 28, 24, (u, v) => {
    const z = T.MathUtils.lerp(-.31, 1.03, u), x = (v * 2 - 1) * .689; return [x, roofHeight(z, x) - .024, z];
  }, headliner));
  root.add(sweep('BMW windshield roof header',Array.from({length:33},(_,j)=>{
    const [x,y,z] = bmwWindshieldPoint(1,j/32);
    return [[x*1.03,y+.001,z-.018],[x*1.03,y+.001,z+.018],
      [x*1.03,y-.030,z+.028],[x*1.03,y-.032,z-.018]] as P[];
  }),headliner));
  root.add(beam('BMW rear glass roof header', [-.688, 1.414, 1.029], [.688, 1.414, 1.029], .016, headliner));
  for (const sign of [-1, 1]) root.add(upholstered((sign < 0 ? 'Driver' : 'Passenger') + ' stowed sun visor', [.285, .017, .132], [sign * .397, 1.412, -.25], headliner, .30));
  root.add(upholstered('BMW discreet overhead console', [.16, .019, .106], [0, 1.424, -.16], soft, .38));
  root.add(rounded('BMW unlit reading lamp lens', [.083, .003, .038], [0, 1.413, -.174], plastic, .001));
  const center = c.centerMirrorTransform!;
  root.add(beam('BMW interior mirror windshield stem', [0, 1.357, -.421], center.position, .008, plastic));
  const frame = upholstered('BMW centre mirror housing', [center.size[0] + .012, center.size[1] + .012, center.housingDepth], center.position, plastic, .32);
  frame.rotation.set(...center.rotation); root.add(frame);
  if (center.reflection === 'dark') {
    const glass = mesh('BMW dark static centre mirror glass', new T.PlaneGeometry(...center.size),
      new T.MeshStandardMaterial({ color: 0x1b2227, roughness: .38, metalness: .15 }));
    glass.position.copy(frame.position); glass.rotation.copy(frame.rotation);
    glass.position.add(new T.Vector3(0, 0, center.housingDepth / 2 + .001).applyEuler(glass.rotation)); root.add(glass);
  }

  const base = steering.steeringWheelBase, wheel = steering.steeringWheelRotationGroup;
  base.position.set(...c.steeringWheelPosition); base.rotation.set(...c.steeringWheelRotation);
  base.name = 'BMW steering wheel base'; wheel.name = 'BMW steering rotation'; base.add(wheel); root.add(base);
  root.add(beam('BMW steering column',c.steeringColumnMountPosition!,c.steeringWheelPosition,.030,plastic));
  root.add(upholstered('BMW steering column shroud',[.119,.085,.169],[-.40,.704,-.477],soft,.42));
  const rim = mesh('BMW leather steering rim',new T.TorusGeometry(c.steeringWheelRadius,c.steeringWheelRimTubeRadius,20,96),steeringLeather);
  // A slightly oval grip section and restrained lower flattening keep a road-car silhouette.
  const rimPoints = rim.geometry.getAttribute('position');
  for (let i=0;i<rimPoints.count;i++) {
    const x = rimPoints.getX(i), y = rimPoints.getY(i), radius = Math.hypot(x,y);
    const grip = Math.exp(-(((Math.abs(y)-.024)/.04)**2))*Math.min(1,Math.abs(x)/c.steeringWheelRadius);
    const r = c.steeringWheelRadius+(radius-c.steeringWheelRadius)*(1+.13*grip);
    rimPoints.setX(i,x*r/radius);
    const shapedY=y*r/radius; rimPoints.setY(i,shapedY < -.11 ? -.11+(shapedY+.11)*.80 : shapedY);
    rimPoints.setZ(i,rimPoints.getZ(i)*.95+.0015*grip);
  }
  rim.geometry.computeVertexNormals(); wheel.add(rim);
  for (const sign of [-1,1]) {
    const shape: P[] = [[sign*.050,.008,0],[sign*.108,.014,0],[sign*.153,.012,0],
      [sign*.156,-.025,0],[sign*.113,-.027,0],[sign*.056,-.028,0]];
    const rings = [[-.014,.94],[0,1],[.024,.98],[.027,.93]].map(([z,scale])=>shape.map(([x,y])=>
      [sign*.103+(x-sign*.103)*scale!, -.007+(y+.007)*scale!,z!] as P));
    wheel.add(sweep('BMW tapered horizontal steering spoke',rings,steeringLeather));
    const controls = upholstered('BMW inset steering control surface',[.069,.026,.005],[sign*.113,-.004,.029],piano,.42);
    wheel.add(controls);
    wheel.add(path('BMW spoke satin underline',[[sign*.066,-.024,.028],[sign*.119,-.025,.028],[sign*.149,-.022,.028]],.0013,satin));
  }
  const lower: P[] = [[-.031,-.030,0],[.031,-.030,0],[.021,-.147,0],[-.021,-.147,0]];
  wheel.add(sweep('BMW tapered lower steering spoke',[lower,lower.map(([x,y,z])=>[x*.93,y,z+.020] as P)],steeringLeather));
  wheel.add(path('BMW lower spoke satin outline',[[-.024,-.063,.023],[-.018,-.137,.023],[.018,-.137,.023],[.024,-.063,.023]],.0015,satin));
  wheel.add(upholstered('BMW compact padded airbag hub',[.118,.105,.056],[0,.008,.018],steeringLeather,.55));
  const badge = steeringBadge(.0195); badge.position.set(0,.009,.047); wheel.add(badge);
  for (const [name, x, w, h, z] of [['Accelerator', -.286, .048, .13, -.68], ['Brake', -.465, .113, .072, -.69], ['Dead pedal', -.666, .077, .16, -.73]] as const) {
    const pedal = rounded('BMW ' + name + ' pedal', [w, h, .018], [x, floorY + .15, z], plastic); pedal.rotation.x = -.38; root.add(pedal);
  }
  const spills: T.PointLight[] = [];
  for (const [name, x] of [['driver', -.39], ['passenger', .40]] as const) {
    const light = new T.PointLight(profile.color, 0, .75, 2); light.name = 'BMW ' + name + ' footwell illumination';
    light.position.set(x, .44, -.56); light.userData.maximum = profile.footwellIntensity; root.add(light); spills.push(light);
  }
  const consoleSpill = new T.PointLight(profile.color, 0, 1.1, 2);
  consoleSpill.name = 'BMW soft console trim spill'; consoleSpill.position.set(0, .66, -.30);
  consoleSpill.userData.maximum = profile.dashboardFillIntensity ?? 0; root.add(consoleSpill); spills.push(consoleSpill);
  root.traverse(o => { if (o instanceof T.Mesh) o.userData.vehicleInteriorPart = 'bmw-cabin'; });
  let level = 0;
  return { instrument,
    click(raycaster) {
      const hit = raycaster.intersectObject(root,true)[0];
      return hit?.object === screen && !!hit.uv && centerDisplay.click(hit.uv);
    },
    cyclePage() { centerDisplay.selectPage(centerDisplay.page==='map'?'status':'map'); },
    update(t, dt) {
    const on = t.ignitionOn ?? t.engineRunning ?? true;
    const lampsOn = !!(t.indicators?.positionLights || t.indicators?.headlights || t.indicators?.highBeam);
    const daylight = t.ambientDaylight ?? 1;
    level = T.MathUtils.damp(level, cabinAmbientTarget(profile, on, lampsOn, daylight), profile.fadeResponse, dt);
    ambient.emissiveIntensity = level;
    frontAmbient.emissiveIntensity = level*1.18;
    for (const light of spills) light.intensity = (light.userData.maximum as number) * level / profile.nightIntensity;
    const brightness = on ? .70 + .30 * Math.min(1, Math.max(0, daylight)) : 0;
    for (const material of texts) material.opacity = on ? .62 + .22 * daylight : 0;
    screenMaterial.emissiveIntensity = brightness; screenMaterial.color.setScalar(on ? .055 : 0);
    screenMaterial.envMapIntensity = on ? .1 : 0;
    centerDisplay.update(t,dt,t.vehicleStatus);
  } };
}

/** Opaque cabin boundaries used by the closure ray test. */
export const BMW_CABIN_CLOSURE_RAYS: readonly P[] = [[0, -1, 0], [0, 1, 0], [-1, -1, 0], [1, -.4, 0],
  [-1, .8, -.78], [1, .8, -.78], [0, -.40, -1], [0, -.27, 1], [-.65, -.60, 1], [.65, -.30, 1]];
export const BMW_CABIN_BELT_X = sideGlassX(.948);


