import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
} from 'three';
import type { DebugActorType } from './ScenarioDebuggerTypes';

/**
 * Creates lightweight Three.js diagnostic meshes for ScenarioDebugger actors.
 * Zero external textures/dependencies; compatible with main thread and Worker exportDebugOverlays.
 */
export class ScenarioDebuggerMeshFactory {
  // Reusable materials
  private static readonly vehiclePaint = new MeshBasicMaterial({ color: 0x2563eb });
  private static readonly vehicleGlass = new MeshBasicMaterial({ color: 0x93c5fd, opacity: 0.85, transparent: true });
  private static readonly headlight = new MeshBasicMaterial({ color: 0xfef08a });
  private static readonly taillight = new MeshBasicMaterial({ color: 0xef4444 });
  private static readonly wheelMat = new MeshBasicMaterial({ color: 0x1f2937 });

  private static readonly pedSkin = new MeshBasicMaterial({ color: 0xfbbf24 });
  private static readonly pedClothes = new MeshBasicMaterial({ color: 0x10b981 });
  private static readonly pedPants = new MeshBasicMaterial({ color: 0x1e293b });

  private static readonly coneOrange = new MeshBasicMaterial({ color: 0xf97316 });
  private static readonly coneWhite = new MeshBasicMaterial({ color: 0xf8fafc });
  private static readonly barrierMat = new MeshBasicMaterial({ color: 0x64748b });

  public static createActorMesh(
    type: DebugActorType,
    length: number,
    width: number,
    height: number,
  ): Object3D {
    const root = new Group();
    root.name = `debug_actor_${type}`;

    if (type === 'vehicle') {
      // 1. Lower body / chassis
      const bodyGeo = new BoxGeometry(width, height * 0.45, length);
      const bodyMesh = new Mesh(bodyGeo, this.vehiclePaint);
      bodyMesh.position.y = height * 0.35;
      root.add(bodyMesh);

      // 2. Cabin / Greenhouse
      const cabinGeo = new BoxGeometry(width * 0.85, height * 0.40, length * 0.52);
      const cabinMesh = new Mesh(cabinGeo, this.vehicleGlass);
      cabinMesh.position.set(0, height * 0.72, -length * 0.05);
      root.add(cabinMesh);

      // 3. Headlights (front faces -Z in vehicle local space)
      const lightGeo = new BoxGeometry(width * 0.22, height * 0.12, 0.08);
      const hlLeft = new Mesh(lightGeo, this.headlight);
      hlLeft.position.set(-width * 0.35, height * 0.42, -length * 0.505);
      const hlRight = new Mesh(lightGeo, this.headlight);
      hlRight.position.set(width * 0.35, height * 0.42, -length * 0.505);
      root.add(hlLeft, hlRight);

      // 4. Taillights (rear faces +Z)
      const tlLeft = new Mesh(lightGeo, this.taillight);
      tlLeft.position.set(-width * 0.35, height * 0.45, length * 0.505);
      const tlRight = new Mesh(lightGeo, this.taillight);
      tlRight.position.set(width * 0.35, height * 0.45, length * 0.505);
      root.add(tlLeft, tlRight);

      // 5. Wheels
      const wheelGeo = new CylinderGeometry(height * 0.22, height * 0.22, width * 0.12, 10);
      wheelGeo.rotateZ(Math.PI / 2);
      const wFL = new Mesh(wheelGeo, this.wheelMat);
      wFL.position.set(-width * 0.48, height * 0.22, -length * 0.32);
      const wFR = new Mesh(wheelGeo, this.wheelMat);
      wFR.position.set(width * 0.48, height * 0.22, -length * 0.32);
      const wRL = new Mesh(wheelGeo, this.wheelMat);
      wRL.position.set(-width * 0.48, height * 0.22, length * 0.32);
      const wRR = new Mesh(wheelGeo, this.wheelMat);
      wRR.position.set(width * 0.48, height * 0.22, length * 0.32);
      root.add(wFL, wFR, wRL, wRR);
    } else if (type === 'pedestrian') {
      // Head
      const headGeo = new BoxGeometry(0.24, 0.26, 0.24);
      const headMesh = new Mesh(headGeo, this.pedSkin);
      headMesh.position.y = height * 0.90;

      // Torso / Jacket
      const torsoGeo = new BoxGeometry(0.44, 0.58, 0.28);
      const torsoMesh = new Mesh(torsoGeo, this.pedClothes);
      torsoMesh.position.y = height * 0.58;

      // Legs / Pants
      const legGeo = new BoxGeometry(0.18, 0.70, 0.22);
      const legL = new Mesh(legGeo, this.pedPants);
      legL.position.set(-0.11, height * 0.22, 0);
      const legR = new Mesh(legGeo, this.pedPants);
      legR.position.set(0.11, height * 0.22, 0);

      root.add(headMesh, torsoMesh, legL, legR);
    } else {
      // Traffic Cone / Safety Barrier
      if (length > 1.2) {
        // Concrete Jersey barrier
        const barrierGeo = new BoxGeometry(width, height, length);
        const barrierMesh = new Mesh(barrierGeo, this.barrierMat);
        barrierMesh.position.y = height * 0.5;
        // Orange stripes
        const stripeGeo = new BoxGeometry(width * 1.02, height * 0.15, length * 0.95);
        const stripeMesh = new Mesh(stripeGeo, this.coneOrange);
        stripeMesh.position.y = height * 0.55;
        root.add(barrierMesh, stripeMesh);
      } else {
        // Traffic Cone
        const coneBaseGeo = new BoxGeometry(width, 0.06, width);
        const coneBase = new Mesh(coneBaseGeo, this.coneOrange);
        coneBase.position.y = 0.03;

        const coneBodyGeo = new ConeGeometry(width * 0.38, height * 0.92, 12);
        const coneBody = new Mesh(coneBodyGeo, this.coneOrange);
        coneBody.position.y = height * 0.49;

        const stripeGeo = new CylinderGeometry(width * 0.22, width * 0.28, height * 0.22, 12);
        const stripe = new Mesh(stripeGeo, this.coneWhite);
        stripe.position.y = height * 0.45;

        root.add(coneBase, coneBody, stripe);
      }
    }

    return root;
  }
}
