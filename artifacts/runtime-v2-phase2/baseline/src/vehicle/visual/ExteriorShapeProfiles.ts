import type { VehicleVisualConfig } from './VehicleVisualConfig';

/** Metres, axle-midpoint origin. These are authored photo observations, NOT OEM specifications.
 * Each shell and canopy has its own stations; no scaled saloon/SUV template.
 * Physics wheel centres, radii and suspension travel are supplied separately. */
export interface ExteriorShapeProfile {
  readonly name: string;
  /** z, half width at shoulder, belt height, half width at belt, shoulder height */
  readonly body: readonly (readonly [number, number, number, number, number])[];
  /** z, centreline height, half width, transverse crown (includes windshield/rear glass) */
  readonly canopy: readonly (readonly [number, number, number, number])[];
  readonly roofStart: number;
  readonly roofEnd: number;
  readonly bPillar: number;
  readonly rearDivider: number;
  readonly sill: number;
  readonly wheelInches: number;
  readonly spokes: number;
  readonly head: readonly (readonly [number, number])[];
  readonly tail: readonly (readonly [number, number])[];
  readonly grille: 'school' | 'gt' | 'mazda' | 'vw' | 'nissan' | 'touareg' | 'taycan' | 'ferrari';
}

const SCHOOL: ExteriorShapeProfile = {
  name: 'Haiteng S1 original tall training saloon', sill: .23, wheelInches: 16, spokes: 6,
  body: [[-2.246,.74,.77,.66,.54],[-2.12,.85,.83,.77,.63],[-1.75,.895,.91,.84,.72],
    [-1.35,.90,.96,.85,.76],[-.92,.884,.99,.824,.79],[-.4,.881,1.0,.823,.80],
    [.3,.882,1.01,.825,.81],[.85,.891,1.02,.829,.81],[1.35,.90,1.01,.84,.79],
    [1.70,.889,.99,.83,.75],[2.1,.85,.94,.78,.66],[2.246,.76,.87,.68,.55]],
  canopy: [[-.92,.99,.78,.018],[-.65,1.27,.744,.03],[-.28,1.56,.68,.04],
    [.15,1.638,.68,.045],[.60,1.645,.675,.045],[.98,1.58,.66,.04],[1.30,1.30,.705,.025],[1.55,1.0,.78,.016]],
  roofStart: -.28, roofEnd: .98, bPillar: .31, rearDivider: 1.18,
  head: [[.37,.79],[.76,.83],[.84,.73],[.42,.71]], tail: [[.35,.84],[.82,.88],[.80,.74],[.38,.73]], grille:'school',
};
const GT: ExteriorShapeProfile = {
  name: 'GT original long-bonnet coupe', sill: .19, wheelInches: 19, spokes: 5,
  body: [[-2.269,.77,.71,.66,.49],[-2.10,.89,.79,.78,.60],[-1.7,.935,.88,.85,.70],
    [-1.32,.94,.94,.86,.74],[-.95,.92,.99,.83,.77],[-.45,.90,1.02,.82,.78],
    [.2,.902,1.03,.825,.79],[.65,.923,1.05,.83,.82],[1.05,.94,1.04,.85,.83],
    [1.32,.94,1.01,.85,.79],[1.8,.91,.97,.82,.72],[2.269,.79,.86,.68,.54]],
  canopy: [[-.82,1.0,.775,.018],[-.45,1.25,.70,.025],[-.10,1.468,.65,.03],
    [.24,1.508,.655,.04],[.62,1.48,.64,.038],[.90,1.37,.63,.028],
    [1.22,1.18,.66,.02],[1.55,1.00,.76,.012]],
  roofStart: -.10, roofEnd: .62, bPillar:.40, rearDivider:1.22,
  head:[[.41,.74],[.78,.82],[.87,.72],[.48,.67]],tail:[[.28,.86],[.82,.88],[.80,.79],[.32,.78]],grille:'gt',
};
// The three legacy automatic vehicles deliberately retain their declared game envelopes.
// CX-4's crossover body and the Sylphy generation cannot be reconciled with those
// declarations without choosing a different vehicle. See the reference-sheet conflicts.
const FLOW: ExteriorShapeProfile = {
  name:'Mazda legacy flow saloon (catalogue conflict retained)',sill:.21,wheelInches:17,spokes:10,
  body:[[-2.28,.70,.72,.61,.50],[-2.13,.82,.79,.72,.60],[-1.75,.884,.86,.80,.71],
    [-1.35,.8975,.93,.824,.76],[-.96,.88,.96,.816,.78],[-.4,.872,.97,.808,.79],
    [.2,.875,.98,.81,.80],[.78,.892,1.0,.822,.81],[1.35,.8975,.99,.82,.78],
    [1.75,.87,.95,.79,.73],[2.12,.82,.87,.73,.64],[2.28,.72,.79,.62,.53]],
  canopy:[[-.96,.96,.77,.015],[-.63,1.19,.715,.026],[-.28,1.415,.65,.035],
    [.10,1.483,.65,.04],[.42,1.49,.643,.04],[.76,1.44,.635,.034],[1.13,1.24,.69,.024],[1.48,.98,.77,.015]],
  roofStart:-.28,roofEnd:.76,bPillar:.22,rearDivider:1.12,
  head:[[.35,.80],[.76,.85],[.86,.78],[.42,.73]],tail:[[.42,.84],[.80,.90],[.84,.81],[.48,.78]],grille:'mazda',
};
const FORMAL: ExteriorShapeProfile = {
  name:'Sagitar legacy long-wheelbase saloon',sill:.20,wheelInches:16,spokes:5,
  body:[[-2.325,.75,.80,.69,.55],[-2.15,.855,.87,.78,.66],[-1.8,.892,.93,.83,.74],
    [-1.365,.90,.96,.84,.78],[-.96,.89,.975,.83,.80],[-.45,.885,.98,.826,.81],
    [.25,.885,.985,.826,.81],[.9,.894,.99,.835,.81],[1.365,.90,.98,.84,.79],
    [1.85,.88,.95,.817,.73],[2.18,.84,.90,.76,.65],[2.325,.77,.83,.69,.56]],
  canopy:[[-.96,.975,.78,.012],[-.64,1.21,.72,.024],[-.31,1.437,.67,.03],
    [.06,1.494,.674,.035],[.48,1.50,.673,.035],[.92,1.45,.66,.03],[1.25,1.22,.71,.02],[1.52,.98,.78,.012]],
  roofStart:-.31,roofEnd:.92,bPillar:.34,rearDivider:1.22,
  head:[[.36,.84],[.81,.88],[.85,.76],[.40,.75]],tail:[[.35,.86],[.82,.89],[.81,.77],[.40,.76]],grille:'vw',
};
const COMFORT: ExteriorShapeProfile = {
  name:'Sylphy legacy comfort saloon (generation unresolved)',sill:.21,wheelInches:16,spokes:7,
  body:[[-2.315,.73,.77,.65,.52],[-2.1,.84,.85,.76,.64],[-1.7,.90,.93,.83,.73],
    [-1.355,.91,.97,.844,.77],[-.97,.89,.995,.83,.80],[-.45,.885,1.0,.827,.80],
    [.2,.888,1.01,.83,.81],[.8,.902,1.02,.84,.82],[1.355,.91,1.01,.85,.79],
    [1.8,.887,.96,.82,.72],[2.12,.83,.88,.75,.62],[2.315,.74,.81,.66,.54]],
  canopy:[[-.97,.995,.79,.016],[-.62,1.25,.735,.03],[-.22,1.466,.68,.036],
    [.17,1.515,.679,.042],[.55,1.505,.674,.04],[.92,1.44,.66,.032],[1.24,1.22,.71,.024],[1.52,1.0,.79,.014]],
  roofStart:-.22,roofEnd:.92,bPillar:.25,rearDivider:1.2,
  head:[[.35,.82],[.77,.91],[.85,.81],[.44,.74]],tail:[[.34,.85],[.80,.95],[.85,.84],[.46,.77]],grille:'nissan',
};
const TOUAREG: ExteriorShapeProfile = {
  name:'Touareg CR pre-facelift SUV',sill:.215,wheelInches:19,spokes:10,
  body:[[-2.408,.84,1.04,.78,.70],[-2.25,.93,1.11,.86,.81],[-1.9,.981,1.17,.90,.90],
    [-1.4475,.9925,1.20,.91,.94],[-.98,.976,1.21,.91,.96],[-.5,.972,1.22,.907,.97],
    [.2,.974,1.23,.909,.98],[.8,.982,1.24,.914,.98],[1.4475,.9925,1.23,.92,.96],
    [1.9,.98,1.21,.91,.91],[2.3,.94,1.17,.87,.82],[2.46,.86,1.08,.79,.71]],
  canopy:[[-.98,1.21,.85,.014],[-.74,1.45,.80,.024],[-.43,1.68,.752,.03],
    [.03,1.73,.756,.035],[.6,1.74,.756,.035],[1.12,1.726,.748,.034],
    [1.57,1.67,.732,.03],[1.91,1.47,.78,.02],[2.20,1.18,.85,.012]],
  roofStart:-.43,roofEnd:1.57,bPillar:.22,rearDivider:1.18,
  head:[[.48,1.04],[.87,1.10],[.93,.95],[.51,.92]],tail:[[.37,1.03],[.85,1.10],[.90,.97],[.42,.93]],grille:'touareg',
};
const TAYCAN: ExteriorShapeProfile = {
  name:'2024 Taycan 4S saloon facelift',sill:.128,wheelInches:20,spokes:10,
  body:[[-2.42,.78,.70,.64,.48],[-2.28,.90,.79,.72,.62],[-2.03,.961,.86,.76,.70],
    [-1.7,.978,.93,.81,.77],[-1.45,.983,.96,.825,.79],[-1.13,.96,.94,.835,.78],
    [-.8,.938,.94,.84,.77],[-.3,.925,.95,.84,.77],[.25,.936,.97,.85,.79],
    [.8,.964,1.00,.87,.82],[1.18,.982,1.01,.88,.84],[1.45,.983,1.0,.873,.82],
    [1.83,.967,.95,.85,.76],[2.22,.913,.87,.79,.66],[2.543,.80,.78,.68,.50]],
  canopy:[[-1.0,.88,.77,.018],[-.67,1.08,.71,.025],[-.32,1.286,.65,.032],
    [.02,1.363,.651,.037],[.30,1.379,.65,.037],[.62,1.357,.642,.036],
    [.94,1.28,.635,.032],[1.28,1.12,.68,.022],[1.65,.94,.77,.014]],
  roofStart:-.32,roofEnd:.94,bPillar:.24,rearDivider:1.26,
  head:[[.55,.79],[.78,.86],[.85,.79],[.59,.74]],tail:[[.06,.81],[.80,.86],[.84,.82],[.08,.78]],grille:'taycan',
};
const FERRARI: ExteriorShapeProfile = {
  name:'458 Italia F142 berlinetta',sill:.115,wheelInches:20,spokes:5,
  body:[[-2.427,.69,.48,.58,.32],[-2.23,.84,.59,.70,.43],[-1.92,.94,.72,.77,.57],
    [-1.60,.962,.85,.79,.69],[-1.325,.9685,.88,.79,.73],[-1.05,.91,.79,.76,.66],
    [-.6,.87,.78,.75,.64],[-.1,.881,.80,.755,.66],[.4,.935,.88,.79,.73],
    [.9,.9685,.96,.82,.80],[1.325,.9685,.97,.83,.80],[1.7,.937,.91,.82,.72],[2.09,.80,.78,.70,.54]],
  canopy:[[-1.12,.76,.725,.014],[-.82,1.0,.66,.022],[-.48,1.17,.59,.028],
    [-.19,1.21,.60,.033],[.06,1.213,.60,.033],[.32,1.185,.59,.028],
    [.58,1.08,.61,.023],[.88,.91,.66,.018],[1.16,.85,.72,.01]],
  roofStart:-.48,roofEnd:.32,bPillar:.30,rearDivider:.76,
  head:[[.64,.55],[.78,.63],[.80,.86],[.70,.87]],tail:[[.65,.76],[.79,.76],[.79,.65],[.65,.65]],grille:'ferrari',
};

export function exteriorShapeProfile(c: VehicleVisualConfig): ExteriorShapeProfile | undefined {
  switch(c.body.design) {
    case 'flow': return FLOW;
    case 'formal': return FORMAL;
    case 'comfort': return COMFORT;
    case 'road-suv': return TOUAREG;
    case 'mid-supercar': return FERRARI;
    case 'electric-fastback': return c.body.exterior ? undefined : TAYCAN;
    case undefined: return c.body.profile === 'sport-coupe' ? GT : SCHOOL;
    default: return undefined;
  }
}
