import * as T from 'three';
import { InstrumentCluster, type InstrumentTelemetry } from './InstrumentCluster';
import { GolfGTICenterDisplay, gtiScreenMaterial } from './GolfGTIDisplays';
import { gtiMaterial } from './GolfGTISurfaces';
import { GTI_CENTER_SCREEN, gtiCenterDisplayMount } from './GolfGTIDashboard';
import { gtiUpperDashboard,gtiTrimShelf,gtiVentBand,gtiLowerDashboard,gtiConsoleShell,gtiStorageSurfaces } from './GolfGTICockpitGeometry';
import { createGolfGTISteeringMaterials, GTI_STEERING_ATLAS, mapGolfGTISteeringAtlas } from './GolfGTISteeringTextures';
import { gtiWindowFrame } from './GolfGTIExterior';
import { surfaceGrid, surfaceLoft, surfaceQuad, surfaceRounded, surfaceMesh } from './SurfaceVehicleGeometry';
import { cabinAmbientTarget } from './CabinLightResponse';
import type { VehicleAssetRegistry } from './VehicleAssetRegistry';
import type { VehicleVisualConfig } from './VehicleVisualConfig';

interface Steering { steeringWheelBase: T.Group; steeringWheelRotationGroup: T.Group; gearLever: T.Group }
export interface GolfGTICabinState {
  instrument: InstrumentCluster; center: GolfGTICenterDisplay;
  update(t: InstrumentTelemetry, dt: number): void; click(raycaster: T.Raycaster): boolean; cyclePage(): void;
}

/** Front-seat priority: structural shells with surface detail, independent of other skins. */
export function buildGolfGTICabin(root: T.Group, c: VehicleVisualConfig, steering: Steering, assets?: VehicleAssetRegistry): GolfGTICabinState {
  const soft = gtiMaterial('soft', c, assets), leather = gtiMaterial('leather', c, assets), tartan = gtiMaterial('tartan', c, assets);
  const fascia = gtiMaterial('fascia', c, assets), controls = gtiMaterial('controls', c, assets), badge = gtiMaterial('badge', c, assets);
  const displayTrim = gtiMaterial('display-trim', assets ?? c, assets), consoleDeck = gtiMaterial('console-deck', c, assets);
  const technical=gtiMaterial('technical',c,assets),lower=gtiMaterial('lower',c,assets),rubber=gtiMaterial('rubber',c,assets),lightPanel=gtiMaterial('light-controls',c,assets);
  const carpet = new T.MeshStandardMaterial({ color: 0x15191c, roughness: 1, side: T.DoubleSide });
  const piano = gtiMaterial('display-trim',assets ?? c,assets);
  const satin = new T.MeshStandardMaterial({ color: 0xa0a5a9, metalness: .65, roughness: .43, side: T.DoubleSide });
  satin.envMap=piano.envMap;satin.envMapIntensity=.55;satin.roughnessMap=technical.roughnessMap;satin.roughness=.72;satin.normalMap=technical.normalMap;satin.normalScale.setScalar(.1);
  const headliner = new T.MeshStandardMaterial({ color: 0x383b3f, roughness: .98, side: T.DoubleSide });
  const profile = c.interiorAmbientLighting!;
  const ambient = new T.MeshStandardMaterial({ color: 0x39252a, emissive: profile.color, emissiveIntensity: 0, roughness: .8, side: T.DoubleSide });
  // Capture final immutable geometry, supply an instance material. Keys are deterministic per config.
  const add = (build: () => T.Mesh, key: string, mat: T.Material, parent = root) => {
    const mesh = assets ? assets.mesh(c, 'gti-cabin/' + key, build, mat) : build(); parent.add(mesh); return mesh;
  };
  const width = c.cabin.width / 2, floor = .20;
  add(()=>gtiUpperDashboard(width,soft),'dash',soft);
  add(()=>gtiTrimShelf(width-.01,technical),'trim-shelf',technical);
  add(()=>gtiVentBand(width-.01,fascia),'fascia',fascia);
  add(()=>gtiLowerDashboard(width-.01,lower),'lower-dash',lower);
  const lightControls=add(()=>surfaceRounded('GTI inset light control panel',[.112,.079,.009],[-.695,.844,-.555],lightPanel,.012),'light-panel',lightPanel);
  lightControls.rotation.set(-.10,.15,0);
  add(() => surfaceQuad('GTI footwell firewall', [[-.82, floor, -.88], [.82, floor, -.88], [.79, .86, -.91], [-.79, .86, -.91]], carpet), 'firewall', carpet);
  add(() => surfaceQuad('GTI continuous carpet floor', [[-.83,floor,-.90],[.83,floor,-.90],[.83,floor,1.69],[-.83,floor,1.69]], carpet), 'floor', carpet);
  for (const sign of [-1, 1]) {
    const label = sign < 0 ? 'Left' : 'Right';
    add(() => surfaceLoft(label + ' GTI shaped door card', [-.85, .2, 1.5, 1.70].map(z => ({ at: z,
      ring: [[sign * .803,.875],[sign * .772,.843],[sign * .760,.69],[sign * .715,.59],
        [sign * .772,.37],[sign * .846,.33],[sign * .850,.76]] as [number,number][] })), leather), 'door' + sign, leather);
    add(() => surfaceRounded(label + ' GTI door armrest', [.10,.045,.58], [sign * .736,.625,.20], soft, .015), 'armrest' + sign, soft);
    add(() => gtiWindowFrame(c, sign, headliner, .018), 'frame' + sign, headliner);
    add(() => surfaceQuad(label + ' GTI B pillar liner', [
      [sign*.782,.86,.27],[sign*.65,1.378,.25],[sign*.65,1.378,.32],[sign*.782,.86,.34]], headliner), 'bpillar' + sign, headliner);
    add(() => surfaceQuad(label + ' GTI door ambient surface', [
      [sign*.764,.828,-.78],[sign*.764,.831,-.78],[sign*.764,.831,.93],[sign*.764,.828,.93]], ambient), 'doorambient' + sign, ambient);
  }
  add(() => surfaceGrid('GTI continuous dark headliner', 14, 16, (u, v) => [
    (v * 2 - 1) * .666, 1.385 + .026 * Math.sin(v * Math.PI) + .013 * Math.sin(u * Math.PI), T.MathUtils.lerp(-.47,1.23,u)], headliner), 'roof', headliner);
  add(() => surfaceRounded('GTI center mirror housing', [.226,.085,.023], [0,1.255,-.445], piano,.018), 'mirror', piano);
  const instrument = new InstrumentCluster(c.instrumentCluster, assets); instrument.position.set(...c.instrumentClusterTransform.position);
  instrument.rotation.set(...c.instrumentClusterTransform.rotation); root.add(instrument);
  const center = new GolfGTICenterDisplay(), displayGroup = new T.Group(); displayGroup.name = 'GTI integrated center screen';
  displayGroup.position.set(...GTI_CENTER_SCREEN.position); displayGroup.rotation.set(...GTI_CENTER_SCREEN.rotation);
  add(() => gtiCenterDisplayMount(piano), 'screen-pedestal', piano);
  add(() => surfaceRounded('GTI centre display recessed housing', [.327,.205,.031], [0,0,-.012], displayTrim,.012), 'centerhousing', displayTrim, displayGroup);
  const screen = new T.Mesh(new T.PlaneGeometry(.305,.179), gtiScreenMaterial(center.texture));
  screen.name = 'GTI map car TPMS parking touchscreen'; screen.position.z = .007; screen.castShadow = false; screen.receiveShadow = false;
  displayGroup.add(screen); root.add(displayGroup);
  add(()=>surfaceRounded('GTI small assist climate hazard island',[.079,.054,.008],[.17,.707,-.449],controls,.008),'controls',controls);
  add(()=>gtiConsoleShell(soft),'console',soft);
  add(()=>gtiStorageSurfaces(rubber),'rubber-trays',rubber);
  const deck=add(()=>surfaceRounded('GTI console piano control deck',[.115,.300,.007],[.025,.497,.151],consoleDeck,.013),'deck',consoleDeck);
  deck.rotation.x=-Math.PI/2+.065;
  add(() => surfaceRounded('GTI padded armrest', [.27,.071,.30], [.075,.553,.65], leather,.026), 'consolearmrest', leather);
  const gear = steering.gearLever; gear.name = 'GTI DSG selector'; gear.position.set(...c.gearLeverPosition); gear.rotation.set(...c.gearLeverRotation);
  add(() => surfaceRounded('GTI compact shift by wire selector', [.045,.039,.050], [0,.022,0], consoleDeck,.011), 'selector', consoleDeck, gear); root.add(gear);
  const base = steering.steeringWheelBase; base.position.set(...c.steeringWheelPosition); base.rotation.set(...c.steeringWheelRotation);
  root.add(base); base.add(steering.steeringWheelRotationGroup); const wheel = steering.steeringWheelRotationGroup;
  const columnStart = new T.Vector3(0, 0, -.015).applyEuler(base.rotation).add(base.position);
  const columnEnd = new T.Vector3(...c.steeringColumnMountPosition!);
  const columnAxis = columnEnd.clone().sub(columnStart);
  add(() => {
    const column = new T.Mesh(new T.CylinderGeometry(.03, .042, columnAxis.length(), 12), piano);
    column.name = 'GTI steering column';
    column.position.copy(columnStart).add(columnEnd).multiplyScalar(.5);
    column.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), columnAxis.clone().normalize());
    column.castShadow = true;
    return column;
  }, 'column', piano);
  const wheelMaterials = createGolfGTISteeringMaterials(c,assets);
  wheelMaterials.controls.envMap=piano.envMap;wheelMaterials.controls.envMapIntensity=.30;
  add(() => {
    const g = new T.TorusGeometry(c.steeringWheelRadius, c.steeringWheelRimTubeRadius, 10, 56), p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const x=p.getX(i),y=p.getY(i),r=Math.hypot(x,y),grip=1+.15*Math.exp(-((y/c.steeringWheelRadius/.30)**4));
      const radius=c.steeringWheelRadius+(r-c.steeringWheelRadius)*grip;
      p.setXYZ(i,x*radius/r,y*radius/r,p.getZ(i)*grip);
      if(p.getY(i)<-.132)p.setY(i,-.132+(p.getY(i)+.132)*.35);
    }
    g.computeVertexNormals(); const m = new T.Mesh(g, wheelMaterials.rim); m.name = 'GTI flat bottom leather wheel rim'; return m;
  }, 'wheel', wheelMaterials.rim, wheel);
  add(() => {
    const p: number[] = [], idx: number[] = [], uv: number[] = [];
    for (const sign of [-1,1]) { const n = p.length / 3;
      p.push(sign*.033,.033,0,sign*.151,.050,0,sign*.148,-.037,0,sign*.05,-.064,0); idx.push(n,n+1,n+2,n,n+2,n+3); uv.push(0,0,1,0,1,1,0,1); }
    const n = p.length / 3; p.push(-.044,-.037,0,.044,-.037,0,.029,-.145,0,-.029,-.145,0); idx.push(n,n+1,n+2,n,n+2,n+3); uv.push(0,0,1,0,1,1,0,1);
    return surfaceMesh('GTI satin three spoke wheel structure',p,idx,uv,satin);
  }, 'spokes', satin, wheel);
  add(() => {
    const p:number[]=[],idx:number[]=[],uv:number[]=[];
    const quad=(corners:readonly (readonly [number,number,number])[],cell:readonly [number,number,number,number]) => {
      const n=p.length/3;p.push(...corners.flat());idx.push(n,n+1,n+2,n,n+2,n+3);
      // Preserve lettering on the left wing instead of mirroring its text with the geometry.
      uv.push(cell[0],cell[1]+cell[3],cell[0]+cell[2],cell[1]+cell[3],cell[0]+cell[2],cell[1],cell[0],cell[1]);
    };
    quad([[-.142,.036,.007],[-.068,.025,.010],[-.065,-.048,.010],[-.138,-.028,.007]],GTI_STEERING_ATLAS.left);
    quad([[.068,.025,.010],[.142,.036,.007],[.138,-.028,.007],[.065,-.048,.010]],GTI_STEERING_ATLAS.right);
    quad([[-.033,-.104,.006],[.033,-.104,.006],[.026,-.144,.006],[-.026,-.144,.006]],GTI_STEERING_ATLAS.lower);
    return surfaceMesh('GTI wheel button and lower badge surface atlas',p,idx,uv,wheelMaterials.controls);
  },'wheel-atlas',wheelMaterials.controls,wheel);
  add(() => {
    const m=surfaceRounded('GTI airbag hub',[.139,.104,.036],[0,0,.021],wheelMaterials.hub,.03);
    mapGolfGTISteeringAtlas(m.geometry,GTI_STEERING_ATLAS.hub);return m;
  }, 'hub', wheelMaterials.hub, wheel);
  const emblem = new T.Mesh(new T.PlaneGeometry(.054,.054),badge); emblem.position.z = .041; emblem.name = 'GTI wheel VW decal'; wheel.add(emblem);
  for (const [label,x] of [['Driver',-.37],['Passenger',.39]] as const) {
    add(() => surfaceRounded(label+' GTI sport seat cushion', [.43,.49,.12], [x,.405,.47], leather,.05), 'cushion'+label, leather).rotation.x = -Math.PI/2;
    // Cushion is horizontal; a broad inset decal carries the characteristic check cloth.
    add(() => surfaceQuad(label+' GTI check cushion surface', [[x-.135,.47,.26],[x+.135,.47,.26],[x+.135,.47,.64],[x-.135,.47,.64]],tartan),'clothbase'+label,tartan);
    add(() => surfaceRounded(label+' GTI bolstered seat back', [.44,.55,.135], [x,.79,.74], leather,.065), 'back'+label, leather).rotation.x = .12;
    add(() => surfaceRounded(label+' GTI check back surface', [.275,.41,.006], [x,.79,.666],tartan,.03), 'clothback'+label, tartan).rotation.x = .12;
    add(() => surfaceRounded(label+' GTI headrest', [.24,.16,.115], [x,1.10,.78],leather,.035), 'headrest'+label,leather);
  }
  add(() => surfaceRounded('GTI simple rear bench', [1.30,.37,.10], [0,.69,1.43],leather,.03),'rearbench',leather);
  add(() => surfaceQuad('GTI rear cabin closure', [[-.78,floor,1.72],[.78,floor,1.72],[.78,.89,1.91],[-.78,.89,1.91]],carpet),'rearclosure',carpet);
  add(() => surfaceQuad('GTI dashboard ambient line', [[-.76,.748,-.448],[.76,.748,-.448],[.76,.750,-.448],[-.76,.750,-.448]],ambient),'dashambient',ambient);
  const fill = new T.PointLight(profile.color,0,.85,2); fill.name = 'GTI restrained console spill'; fill.position.set(.05,.43,-.12); root.add(fill);
  const reflectiveMaterials=[piano,displayTrim,consoleDeck,controls,lightPanel,satin,wheelMaterials.controls];
  let level = 0;
  return { instrument, center,
    update(t,dt) {
      center.update(t,dt);
      const target = cabinAmbientTarget(profile, t.ignitionOn ?? t.engineRunning ?? true,
        !!(t.indicators?.positionLights || t.indicators?.headlights || t.indicators?.highBeam), t.ambientDaylight);
      level = T.MathUtils.damp(level,target,profile.fadeResponse,dt); ambient.emissiveIntensity = level;
      wheelMaterials.controls.emissiveIntensity = level / profile.nightIntensity * .18;
      fill.intensity = profile.footwellIntensity * level / profile.nightIntensity;
      (screen.material as T.MeshPhysicalMaterial).emissiveIntensity = .72 + .23 * T.MathUtils.clamp(t.ambientDaylight ?? 1,0,1);
      const reflectionLevel=.08+.57*T.MathUtils.clamp(t.ambientDaylight??1,0,1);
      for(const material of reflectiveMaterials) material.envMapIntensity=reflectionLevel;
    },
    click(raycaster) { const hit = raycaster.intersectObject(screen,false)[0]; return hit?.uv ? center.click(hit.uv) : false; },
    cyclePage() { center.cyclePage(); },
  };
}
