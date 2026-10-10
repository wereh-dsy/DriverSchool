import * as THREE from 'three';
import { VEHICLE_CATALOG } from '../VehicleCatalog';
import { VehicleVisual } from './VehicleVisual';
import { frontDoorSkinAnchor, frontWindowAnchors } from './VehicleExterior';
import { MirrorAdjustmentController } from '../../camera/MirrorAdjustmentController';
import { MirrorSystem } from '../../camera/MirrorSystem';
import { VEHICLE_RENDER_LAYERS } from './VehicleRenderLayers';

/** Small solid-clearance check, not appearance/handling optimisation. */
export function runVehicleStructureSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string) => { assertions++; if (!ok) throw new Error(`Vehicle structure: ${message}`); };
  const needsDocument = typeof document === 'undefined';
  if (needsDocument) Object.defineProperty(globalThis, 'document', {
    configurable: true, value: { createElement: () => ({ width: 1, height: 1, getContext: () => null }) },
  });
  try {
    for (const car of VEHICLE_CATALOG) {
      const visual = new VehicleVisual(car.visualConfig);
      try {
        visual.root.updateMatrixWorld(true);
        const config = car.visualConfig;
        if (config.instrumentCluster.displayStyle === 'ev-center') {
          assert(visual.root.getObjectByName('Electric centre touchscreen') !== undefined &&
            visual.root.getObjectByName('Instrument binnacle back') === undefined, `${car.id}: EV cabin has centre screen without binnacle`);
          continue; // The dedicated Tesla structure test covers its independent layout.
        }
        const column = visual.root.getObjectByName('Steering column') as THREE.Mesh<THREE.CylinderGeometry>;
        assert(column !== undefined, `${car.id}: column exists`);
        const ends = [-1, 1].map(sign => new THREE.Vector3(0, sign * column.geometry.parameters.height / 2, 0).applyMatrix4(column.matrixWorld));
        assert(Math.min(...ends.map(p => p.distanceTo(new THREE.Vector3(...config.steeringWheelPosition)))) < .03,
          `${car.id}: column joins hub`);
        assert(Math.min(...ends.map(p => p.distanceTo(new THREE.Vector3(...config.steeringColumnMountPosition!)))) < 1e-8,
          `${car.id}: column reaches dashboard anchor`);
        const rim = visual.root.getObjectByName('Steering wheel rim') as THREE.Mesh<THREE.TorusGeometry>;
        const diameter = (rim.geometry.parameters.radius + rim.geometry.parameters.tube) * 2;
        assert(diameter >= .35 && diameter <= .39, `${car.id}: ordinary 350–390 mm wheel diameter`);
        assert(rim.geometry.parameters.arc === Math.PI * 2, `${car.id}: closed wheel rim`);
        const columnDirection = new THREE.Vector3(...config.steeringColumnMountPosition!)
          .sub(new THREE.Vector3(...config.steeringWheelPosition)).normalize();
        const wheelAxis = new THREE.Vector3(0, 0, -1).applyEuler(visual.cockpitRoot.steeringWheelBase.rotation);
        assert(columnDirection.dot(wheelAxis) > .999, `${car.id}: column follows the wheel axis`);
        const points = rim.geometry.getAttribute('position');
        const solids: THREE.Mesh[] = [];
        const cabinObstructions: THREE.Mesh[] = [];
        visual.root.traverse(o => { if (o instanceof THREE.Mesh && /Dashboard|Instrument binnacle|Centre stack/.test(o.name)) solids.push(o); });
        // Include exterior-category geometry: the old body deck filled the
        // cabin even though it was not owned by Cockpit or named Dashboard.
        visual.root.traverse(o => {
          if (o instanceof THREE.Mesh && !visual.cockpitRoot.steeringWheelBase.getObjectById(o.id)) cabinObstructions.push(o);
        });
        const eye = new THREE.Vector3(...config.driverEyePosition);
        const clearanceRay = new THREE.Raycaster();
        clearanceRay.layers.enableAll();
        if (config.body.profile !== 'sport-coupe') {
          const cluster = visual.cockpitRoot.instrumentCluster;
          const visor = cluster.getObjectByName('Instrument binnacle contoured visor') as THREE.Mesh;
          assert(cluster.getObjectByName('Instrument binnacle hood') === undefined && visor !== undefined,
            `${car.id}: thick cuboid hood is replaced by an open contoured visor`);
          assert(!(visor.geometry instanceof THREE.BoxGeometry) && visor.userData.apertureBorder <= .010,
            `${car.id}: visor has a fine aperture edge, not a solid transverse beam`);
          const back = cluster.getObjectByName('Instrument binnacle back') as THREE.Mesh;
          back.geometry.computeBoundingBox();
          assert(back.geometry.boundingBox!.getSize(new THREE.Vector3()).z <= .007,
            `${car.id}: instruments sit on a thin recessed backing`);
          // Legacy cabins keep their existing full-band check. The reference
          // cabins permit peripheral bands to sit under the hood; requiring
          // the whole canvas to be exposed forces an unrealistically tall pod.
          for (const x of visual.cockpitRoot.layout.driverView ? [] :
            config.body.design === 'executive' ? [-.17, 0, .17] : [-.19, 0, .19]) {
            const target = new THREE.Vector3(x, config.body.design === 'executive' ? .090 : .094, config.body.design === 'executive' ? .071 : .080)
              .applyMatrix4(cluster.matrixWorld);
            clearanceRay.set(eye, target.clone().sub(eye).normalize());
            clearanceRay.far = eye.distanceTo(target) - .002;
            assert(clearanceRay.intersectObjects(cabinObstructions, false).length === 0,
              `${car.id}: visor leaves the upper instrument band readable`);
          }
          // Samples just above the visor across the driver-side road aperture.
          for (const x of [-.32, 0, .32]) {
            const target = visual.root.localToWorld(new THREE.Vector3(config.driverEyePosition[0] + x,
              config.driverEyePosition[1] - .06, config.cabin.windshieldBottomZ - 2));
            clearanceRay.set(eye, target.clone().sub(eye).normalize());
            clearanceRay.far = eye.distanceTo(target);
            assert(clearanceRay.intersectObjects(solids, false).length === 0,
              `${car.id}: upper dash and visor do not block the forward road view`);
          }
        }
        for (const angle of [0, Math.PI * .25, Math.PI * .5, Math.PI, -Math.PI * .5]) {
          visual.setSteeringWheelAngle(angle);
          visual.root.updateMatrixWorld(true);
          for (const solid of solids) {
            solid.geometry.computeBoundingBox();
            const inverse = solid.matrixWorld.clone().invert();
            const box = solid.geometry.boundingBox!.clone().expandByScalar(-.002);
            let hits = 0;
            for (let i = 0; i < points.count; i += 4) {
              const p = new THREE.Vector3().fromBufferAttribute(points, i).applyMatrix4(rim.matrixWorld).applyMatrix4(inverse);
              if (box.containsPoint(p)) hits++;
            }
            assert(hits === 0, `${car.id}: wheel rim penetrates ${solid.name}`);
          }
          for (let step = 0; step < 24; step++) {
            const theta = step / 24 * Math.PI * 2;
            const target = new THREE.Vector3(Math.cos(theta) * rim.geometry.parameters.radius,
              Math.sin(theta) * rim.geometry.parameters.radius, 0).applyMatrix4(rim.matrixWorld);
            clearanceRay.set(eye, target.clone().sub(eye).normalize());
            clearanceRay.far = eye.distanceTo(target) - .002;
            assert(clearanceRay.intersectObjects(cabinObstructions, false).length === 0,
              `${car.id}: full wheel rim must be visible through the actual vehicle hierarchy`);
          }
        }
        visual.setSteeringWheelAngle(0);
        visual.root.updateMatrixWorld(true);
        const floor = visual.root.getObjectByName('Cabin floor') as THREE.Mesh<THREE.BoxGeometry>;
        assert(floor !== undefined && floor.geometry.parameters.height <= .03,
          `${car.id}: floor is a thin surface at the bottom of the cabin`);
        const floorY = new THREE.Box3().setFromObject(floor).max.y;
        const consoleRight = config.gearLeverPosition[0] +
          (new THREE.Box3().setFromObject(visual.root.getObjectByName('Transmission tunnel')!).getSize(new THREE.Vector3()).x) * .5;
        for (const x of [config.driverEyePosition[0], (consoleRight + config.cabin.width * .5 - .04) * .5]) {
          clearanceRay.set(new THREE.Vector3(x, floorY + .20, .12), new THREE.Vector3(0, 0, -1));
          clearanceRay.far = .12 - (config.cabin.windshieldBottomZ + .04);
          assert(clearanceRay.intersectObjects(cabinObstructions, false).length === 0,
            `${car.id}: driver/passenger footwell must remain an open cavity`);
        }
        const footwellTarget = new THREE.Vector3(config.driverEyePosition[0], floorY + .004,
          config.steeringWheelPosition[2] - .10);
        clearanceRay.set(eye, footwellTarget.clone().sub(eye).normalize());
        clearanceRay.far = eye.distanceTo(footwellTarget) - .002;
        assert(clearanceRay.intersectObjects(cabinObstructions, false).length === 0,
          `${car.id}: DriverEye can see the open footwell below the wheel`);
        // Envelope acceptance uses both seat positions and actual surfaces,
        // not mesh-count snapshots or the colour of a cover plane.
        const a = visual.cockpitRoot.layout;
        if (a.driverView) {
          const cluster = visual.cockpitRoot.instrumentCluster;
          const hood = new THREE.Box3().setFromObject(cluster.getObjectByName('Instrument binnacle contoured visor')!);
          const backing = new THREE.Box3().setFromObject(cluster.getObjectByName('Instrument binnacle back')!);
          const executive = config.body.design === 'executive';
          const rise = hood.max.y - a.dashboardUpperRear[1];
          assert(rise >= .025 && rise <= (executive ? .065 : .085),
            `${car.id}: instrument hood is only a local rise above the main dashboard`);
          assert((hood.max.y - backing.min.y) / diameter <= .65,
            `${car.id}: instrument physical height stays proportionate to the wheel`);
          assert(a.windshieldLowerBoundary[1] > a.windshieldBase[1] &&
            a.windshieldLowerBoundary[1] < eye.y - .20,
            `${car.id}: cowl raises the lower sightline without closing the road aperture`);
          // The wheel may cover artwork at the bottom; the new pedestal may
          // not fill the lower opening. Check the dash without the wheel so
          // this cannot force the cluster upward for full-canvas visibility.
          for (const x of [-.10, 0, .10]) {
            const target = new THREE.Vector3(x, -.060, a.instrumentPlane).applyMatrix4(cluster.matrixWorld);
            clearanceRay.set(eye, target.clone().sub(eye).normalize());
            clearanceRay.far = eye.distanceTo(target) - .004;
            assert(clearanceRay.intersectObjects(solids, false).length === 0,
              `${car.id}: local dashboard pedestal stays below the display opening`);
          }
        }
        const upper = visual.root.getObjectByName('Dashboard upper surface') as THREE.Mesh;
        const shallowExecutive = config.body.design === 'executive';
        assert(a.instrumentRecessDepth >= (shallowExecutive ? .015 : .035) && a.passengerDashDepth > .12,
          `${car.id}: instrument recess and passenger upper have real depth`);
        if (shallowExecutive) assert(a.instrumentRecessDepth <= .028,
          `${car.id}: executive instruments use a shallow wrap rather than a deep well`);
        if (shallowExecutive) {
          const cluster = visual.cockpitRoot.instrumentCluster;
          const display = cluster.getObjectByName('Executive Virtual Cockpit twin dials and central road display')!;
          const backing = cluster.getObjectByName('Instrument binnacle back') as THREE.Mesh;
          backing.geometry.computeBoundingBox();
          assert(a.instrumentPlane === display.position.z &&
            backing.geometry.boundingBox!.max.z + backing.position.z < display.position.z - .001,
            `${car.id}: shallow backing stays behind the actual display plane`);
        }
        for (const x of [-config.cabin.width * .40, 0, config.cabin.width * .40]) {
          clearanceRay.set(new THREE.Vector3(x, config.cabin.roofY, a.dashboardUpperRear[2] - .11),
            new THREE.Vector3(0, -1, 0));
          clearanceRay.far = config.cabin.roofY - floorY;
          assert(clearanceRay.intersectObject(upper, false).length > 0,
            `${car.id}: transverse dashboard covers driver, centre and passenger`);
        }
        const envelope = cabinObstructions.filter(mesh => visual.cockpitRoot.getObjectById(mesh.id));
        for (const x of [config.driverEyePosition[0], -config.driverEyePosition[0]]) {
          const seatEye = new THREE.Vector3(x, eye.y, eye.z);
          for (const target of [new THREE.Vector3(x, floorY - .10, config.cabin.windshieldBottomZ - .20),
            new THREE.Vector3(x, config.body.hoodTopY, config.cabin.windshieldBottomZ - .08)]) {
            clearanceRay.set(seatEye, target.clone().sub(seatEye).normalize());
            clearanceRay.far = seatEye.distanceTo(target);
            assert(clearanceRay.intersectObjects(envelope, false).length > 0,
              `${car.id}: cabin closes ground/engine-bay and near-hood sightlines from both seats`);
          }
          clearanceRay.set(new THREE.Vector3(x, floorY + .10, .12), new THREE.Vector3(0, -1, 0));
          clearanceRay.far = .15;
          assert(clearanceRay.intersectObject(floor, false).length > 0,
            `${car.id}: each footwell has a real floor`);
        }
        for (const sign of [-1, 1]) {
          const junction = visual.root.getObjectByName(sign < 0 ? 'Left dashboard door junction' : 'Right dashboard door junction')!;
          const bounds = new THREE.Box3().setFromObject(junction);
          const rail = visual.root.getObjectByName(sign < 0 ? 'Left door upper rail' : 'Right door upper rail')!;
          assert(bounds.intersectsBox(new THREE.Box3().setFromObject(rail)),
            `${car.id}: dashboard end joins the door upper, with no air gap`);
        }
        const fascia = visual.root.getObjectByName('Centre stack fascia') as THREE.Mesh;
        const fasciaVertices = fascia.geometry.getAttribute('position');
        assert(Array.from({ length: fasciaVertices.count }, (_, i) =>
          Math.abs(fasciaVertices.getY(i) - a.centerConsoleHeight) < .001 &&
          Math.abs(fasciaVertices.getZ(i) - a.centerConsoleFront[2]) < .001).some(Boolean),
        `${car.id}: stack surface lands on the console front`);
        assert(visual.root.getObjectByName('Passenger glovebox undertray') !== undefined &&
          visual.root.getObjectByName('Windshield cowl shelf') !== undefined &&
          visual.root.getObjectByName('Transmission tunnel rear return') !== undefined,
        `${car.id}: passenger lower, cowl and floor-supported console are complete`);
        assert(eye.z > config.steeringWheelPosition[2] && config.steeringWheelPosition[2] >
          config.instrumentClusterTransform.position[2] && config.instrumentClusterTransform.position[2] >
          config.cabin.windshieldBottomZ, `${car.id}: eye / wheel / cluster / windshield order`);
        const ray = new THREE.Raycaster();
        ray.layers.set(VEHICLE_RENDER_LAYERS.INTERIOR);
        const obstructions: THREE.Object3D[] = [...solids, visual.cockpitRoot.steeringWheelBase, column];
        // Main speed/RPM and central/gear readouts must remain visible. Lower
        // artwork and peripheral status bands may be partly behind wheel/hood
        // in the two corrected cabins. This is clearance, not visual acceptance.
        const readouts = config.instrumentCluster.displayStyle === 'executive-virtual'
          ? [[0, .025], [-.128, .025], [-.128, -.025], [.128, .025], [.128, -.02]]
          : config.instrumentCluster.displayStyle === 'suv-virtual'
            ? [[0, .04], [-.14, 0], [.14, 0], [-.10, -.01]]
            : [[0, .025], [-.13, 0], [.13, 0], [-.19, .07], [.19, .07]];
        for (const [x, y] of readouts) {
          const target = new THREE.Vector3(x, y, a.instrumentPlane).applyMatrix4(visual.cockpitRoot.instrumentCluster.matrixWorld);
          ray.set(eye, target.clone().sub(eye).normalize());
          ray.far = eye.distanceTo(target) - .004;
          assert(ray.intersectObjects(obstructions, true).length === 0, `${car.id}: cockpit blocks instrument readout ${x}/${y}`);
        }
        ray.far = Infinity;
        assert(visual.root.getObjectByName('Front windshield glass') === undefined, `${car.id}: no duplicate windshield pane`);
        for (const side of ['left', 'right'] as const) {
          const optical = side === 'left' ? config.leftMirrorTransform : config.rightMirrorTransform;
          assert(optical.mountPosition !== undefined && optical.mountPosition[1] < optical.position[1], `${car.id}/${side}: low door mounting point`);
          const housing = visual.root.getObjectByName(`${side} mirror housing`)!;
          const bounds = new THREE.Box3().setFromObject(housing);
          const inward = side === 'left' ? -bounds.max.x : bounds.min.x;
          assert(inward > config.cabin.width / 2 + .03, `${car.id}/${side}: housing stays outside glass`);
          assert(visual.root.getObjectByName(`${side} door mirror sail mount`) !== undefined &&
            visual.root.getObjectByName(`${side} mirror stalk`) !== undefined, `${car.id}/${side}: connected mount/stalk/housing`);
          const sail = visual.root.getObjectByName(`${side} door mirror sail mount`)!;
          const doorEdge = frontDoorSkinAnchor(config, sail.position.z);
          assert(Math.abs(Math.abs(sail.position.x) - doorEdge.x) < .005 &&
            Math.abs(sail.position.y - doorEdge.y - .06) < 1e-8, `${car.id}/${side}: sail attaches to door skin`);
          const opening = frontWindowAnchors(config);
          assert(Math.abs(sail.position.z - opening.frontBottomZ) < .04,
            `${car.id}/${side}: mirror is at the door triangle, not midway up the A-pillar`);
        }
        const camera = new THREE.PerspectiveCamera(62, 16 / 9, .025, 2500);
        camera.position.copy(eye);
        visual.root.add(camera);
        const mirrors = new MirrorSystem({ capabilities: { maxTextureSize: 4096 } } as THREE.WebGLRenderer,
          new THREE.Scene(), { driverCamera: camera, vehicleRoot: visual.root, autoBindSurfaces: false,
            mirrors: {
              left: { surface: visual.mirrorSurfaces.left, size: config.leftMirrorTransform.size },
              right: { surface: visual.mirrorSurfaces.right, size: config.rightMirrorTransform.size },
            } });
        const adjustment = new MirrorAdjustmentController(visual.mirrorSurfaces, { storage: null });
        try {
          for (const side of ['left', 'right'] as const) {
            const housing = visual.root.getObjectByName(`${side} mirror housing`) as THREE.Mesh<THREE.BoxGeometry>;
            const glass = visual.getMirrorSurface(side);
            const size = side === 'left' ? config.leftMirrorTransform.size : config.rightMirrorTransform.size;
            for (const yaw of [-10, 0, 10]) for (const pitch of [-7, 0, 7]) {
              adjustment.reset(side);
              adjustment.nudge(side, THREE.MathUtils.degToRad(yaw), THREE.MathUtils.degToRad(pitch));
              mirrors.update();
              const view = mirrors.getView(side);
              assert(view.valid && view.worldNormal.dot(visual.getMirrorWorldTransform(side).normal) > .999999,
                `${car.id}/${side}: reflection follows the actual adjusted glass`);
              assert(mirrors.getTexture(side) === view.texture, `${car.id}/${side}: preview shares the reflection target`);
              const inverse = housing.matrixWorld.clone().invert();
              for (const x of [-size[0] * .5, size[0] * .5]) for (const y of [-size[1] * .5, size[1] * .5]) {
                const p = new THREE.Vector3(x, y, 0).applyMatrix4(glass.matrixWorld).applyMatrix4(inverse);
                assert(Math.abs(p.x) < housing.geometry.parameters.width * .5 &&
                  Math.abs(p.y) < housing.geometry.parameters.height * .5 &&
                  p.z > -housing.geometry.parameters.depth * .5 + .002,
                  `${car.id}/${side}: adjustable glass clears housing sides/back`);
              }
            }
          }
        } finally { mirrors.dispose(); camera.removeFromParent(); }
      } finally { visual.dispose(); }
    }
  } finally { if (needsDocument) Reflect.deleteProperty(globalThis, 'document'); }
  return { assertions, vehicles: VEHICLE_CATALOG.length };
}
