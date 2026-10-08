import * as THREE from 'three';
import type {
  CircuitCornerConfig,
  CircuitPoint2,
  CircuitTrackConfig,
} from './CircuitTrackConfig';
import type {
  CircuitMapMetadata,
  CircuitRoutePoint,
  CircuitSectionMetadata,
} from './types';

interface FilletCorner {
  readonly config: CircuitCornerConfig;
  readonly entry: THREE.Vector3;
  readonly exit: THREE.Vector3;
  readonly centre: THREE.Vector3;
  readonly startAngle: number;
  readonly turnAngle: number;
}

class PlanarArcCurve extends THREE.Curve<THREE.Vector3> {
  public constructor(
    private readonly centreX: number,
    private readonly centreZ: number,
    public readonly radius: number,
    private readonly startAngle: number,
    public readonly deltaAngle: number,
  ) {
    super();
  }

  public override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const angle = this.startAngle + this.deltaAngle * t;
    return target.set(
      this.centreX + Math.cos(angle) * this.radius,
      0,
      this.centreZ + Math.sin(angle) * this.radius,
    );
  }

  public override getTangent(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const angle = this.startAngle + this.deltaAngle * t;
    const direction = Math.sign(this.deltaAngle) || 1;
    return target.set(
      -Math.sin(angle) * direction,
      0,
      Math.cos(angle) * direction,
    );
  }
}

export interface CircuitTrackLayout {
  readonly curve: THREE.CurvePath<THREE.Vector3>;
  readonly lapLength: number;
  readonly mainStraightLength: number;
  readonly routeCenterline: readonly CircuitRoutePoint[];
  readonly sections: readonly CircuitSectionMetadata[];
  readonly bounds: {
    readonly minimumX: number;
    readonly maximumX: number;
    readonly minimumZ: number;
    readonly maximumZ: number;
  };
}

const toVector = (point: CircuitPoint2): THREE.Vector3 =>
  new THREE.Vector3(point.x, 0, point.z);

const signedTurn = (incoming: THREE.Vector3, outgoing: THREE.Vector3): number =>
  Math.atan2(
    incoming.x * outgoing.z - incoming.z * outgoing.x,
    incoming.x * outgoing.x + incoming.z * outgoing.z,
  );

const createFillets = (config: CircuitTrackConfig): readonly FilletCorner[] =>
  config.corners.map((corner, index, corners) => {
    const previous = toVector(corners[(index - 1 + corners.length) % corners.length]!.vertex);
    const vertex = toVector(corner.vertex);
    const next = toVector(corners[(index + 1) % corners.length]!.vertex);
    const incoming = vertex.clone().sub(previous).normalize();
    const outgoing = next.clone().sub(vertex).normalize();
    const turnAngle = signedTurn(incoming, outgoing);
    if (Math.abs(turnAngle) < THREE.MathUtils.degToRad(3)) {
      throw new Error(`Circuit corner ${corner.id} is too shallow to fillet safely`);
    }
    const tangentDistance = corner.radius * Math.tan(Math.abs(turnAngle) * 0.5);
    const incomingLength = vertex.distanceTo(previous);
    const outgoingLength = vertex.distanceTo(next);
    if (tangentDistance >= Math.min(incomingLength, outgoingLength) * 0.47) {
      throw new Error(`Circuit corner ${corner.id} radius consumes its neighbouring straight`);
    }
    const entry = vertex.clone().addScaledVector(incoming, -tangentDistance);
    const exit = vertex.clone().addScaledVector(outgoing, tangentDistance);
    const turnSign = Math.sign(turnAngle);
    const centre = entry.clone().add(new THREE.Vector3(
      -incoming.z * corner.radius * turnSign,
      0,
      incoming.x * corner.radius * turnSign,
    ));
    const startAngle = Math.atan2(entry.z - centre.z, entry.x - centre.x);
    return { config: corner, entry, exit, centre, startAngle, turnAngle };
  });

const freezeRoutePoint = (
  point: THREE.Vector3,
  tangent: THREE.Vector3,
  distance: number,
): CircuitRoutePoint => Object.freeze({
  x: point.x,
  z: point.z,
  distance,
  tangentX: tangent.x,
  tangentZ: tangent.z,
});

export function createCircuitTrackLayout(config: CircuitTrackConfig): CircuitTrackLayout {
  const fillets = createFillets(config);
  const curve = new THREE.CurvePath<THREE.Vector3>();
  const pendingSections: Array<Omit<CircuitSectionMetadata, 'startDistance' | 'endDistance'>> = [];

  for (let index = 0; index < fillets.length; index += 1) {
    const corner = fillets[index]!;
    const nextCorner = fillets[(index + 1) % fillets.length]!;
    const straight = new THREE.LineCurve3(corner.exit, nextCorner.entry);
    const straightLength = straight.getLength();
    curve.add(straight);
    pendingSections.push(Object.freeze({
      id: index === 0 ? 'main-straight' : `straight-${index + 1}`,
      label: index === 0 ? '起终点主直道' : `连接直道 ${index + 1}`,
      kind: 'straight',
      length: straightLength,
    }));

    const nextArc = new PlanarArcCurve(
      nextCorner.centre.x,
      nextCorner.centre.z,
      nextCorner.config.radius,
      nextCorner.startAngle,
      nextCorner.turnAngle,
    );
    const arcLength = nextCorner.config.radius * Math.abs(nextCorner.turnAngle);
    curve.add(nextArc);
    pendingSections.push(Object.freeze({
      id: nextCorner.config.id,
      label: nextCorner.config.label,
      kind: nextCorner.config.kind,
      length: arcLength,
      radius: nextCorner.config.radius,
      turnAngleRadians: nextCorner.turnAngle,
    }));
  }

  const lapLength = curve.getLength();
  let sectionDistance = 0;
  const sections = pendingSections.map((section) => {
    const startDistance = sectionDistance;
    sectionDistance += section.length;
    return Object.freeze({
      ...section,
      startDistance,
      endDistance: sectionDistance,
    });
  });

  const routeDivisions = Math.ceil(lapLength / 1.5);
  const routeCenterline = curve.getSpacedPoints(routeDivisions).map((point, index) => {
    const t = index / routeDivisions;
    return freezeRoutePoint(point, curve.getTangentAt(t).normalize(), lapLength * t);
  });
  // CurvePath's numeric endpoint can be a few ulps away from the first point.
  // Publish an exactly closed seam so replay/path consumers need no tolerance.
  const first = routeCenterline[0]!;
  routeCenterline[routeCenterline.length - 1] = Object.freeze({
    ...first,
    distance: lapLength,
  });

  const padding = config.trackWidth * 0.5 + config.barrierOffset + 26;
  const minimumX = Math.min(...routeCenterline.map((point) => point.x)) - padding;
  const maximumX = Math.max(...routeCenterline.map((point) => point.x)) + padding;
  const minimumZ = Math.min(...routeCenterline.map((point) => point.z)) - padding;
  const maximumZ = Math.max(...routeCenterline.map((point) => point.z)) + padding;
  const mainStraightLength = sections.find((section) => section.id === 'main-straight')?.length ?? 0;
  return Object.freeze({
    curve,
    lapLength,
    mainStraightLength,
    routeCenterline: Object.freeze(routeCenterline),
    sections: Object.freeze(sections),
    bounds: Object.freeze({ minimumX, maximumX, minimumZ, maximumZ }),
  });
}

export function createCircuitMapMetadata(
  config: CircuitTrackConfig,
  layout: CircuitTrackLayout,
): CircuitMapMetadata {
  return Object.freeze({
    id: 'simple-circuit',
    version: 2,
    mapId: config.mapId,
    schemaVersion: config.schemaVersion,
    displayName: '基础闭环试车赛道',
    description: '宽阔主直道、五个流畅弯与一个明显制动弯组成的基础闭环试车赛道',
    coordinateUnits: 'metres',
    closedRoute: true,
    lapLength: layout.lapLength,
    trackWidth: config.trackWidth,
    shoulderWidth: config.shoulderWidth,
    barrierOffset: config.barrierOffset,
    mainStraightLength: layout.mainStraightLength,
    routeCenterline: layout.routeCenterline,
    sections: layout.sections,
  });
}
