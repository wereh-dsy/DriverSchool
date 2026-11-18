import * as T from 'three';

export interface DoorSideSplitOptions {
  /** Full authored side extent. */
  readonly fullFrontZ: number;
  readonly fullRearZ: number;
  /** Driver-door shut lines. */
  readonly doorFrontZ: number;
  readonly doorRearZ: number;
  /** Door lower edge; the body remains below it. */
  readonly sillY: number;
  readonly bottomY: (z: number) => number;
  readonly topY: (z: number) => number;
  readonly point: (z: number, y: number) => readonly [x: number, y: number, z: number];
  readonly material: T.Material;
  readonly fullBodyName: string;
  readonly assignUV?: (geometry: T.BufferGeometry) => void;
}

export interface DoorSideSplitResult {
  readonly hingePosition: T.Vector3;
  /** Geometry is in vehicle-local coordinates; caller offsets it by the hinge. */
  readonly doorMesh: T.Mesh;
}

/**
 * Splits a sculpted side-body grid into front, rear, below-door and hinged-door
 * patches using one shared point function. Exact shut-line stations keep the
 * seams closed while the door rotates.
 */
export function splitSideBodyForDoor(
  bodyRoot: T.Object3D,
  options: DoorSideSplitOptions,
): DoorSideSplitResult {
  const { point, material } = options;
  // Shared row stations: row 0..2 covers bottom..sill, row 2..12 covers
  // sill..belt. Every patch reuses the same row indices, so shut-line vertices
  // are identical and the door cannot open a hairline gap.
  const rows = 12;
  const sillRow = 2;
  const yAt = (row: number, z: number): number => row <= sillRow
    ? T.MathUtils.lerp(options.bottomY(z), options.sillY, row / sillRow)
    : T.MathUtils.lerp(options.sillY, options.topY(z), (row - sillRow) / (rows - sillRow));
  const buildGrid = (
    name: string,
    z0: number,
    z1: number,
    rowStart: number,
    rowEnd: number,
  ): T.Mesh => {
    const length = Math.abs(z1 - z0);
    const cols = Math.max(2, Math.ceil(length / 0.02));
    const positions: number[] = [];
    const indices: number[] = [];
    const rowCount = rowEnd - rowStart;
    for (let row = rowStart; row <= rowEnd; row += 1) {
      for (let col = 0; col <= cols; col += 1) {
        const z = T.MathUtils.lerp(z0, z1, col / cols);
        const [x, py, pz] = point(z, yAt(row, z));
        positions.push(x, py, pz);
      }
    }
    for (let row = 0; row < rowCount; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const a = row * (cols + 1) + col;
        const b = a + 1;
        const d = a + cols + 1;
        const e = d + 1;
        indices.push(a, b, e, a, e, d);
      }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    options.assignUV?.(geometry);
    const mesh = new T.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  bodyRoot.add(
    buildGrid(options.fullBodyName, options.fullFrontZ, options.doorFrontZ, 0, rows),
    buildGrid(`${options.fullBodyName} rear`, options.doorRearZ, options.fullRearZ, 0, rows),
    buildGrid(`${options.fullBodyName} below driver door`, options.doorFrontZ, options.doorRearZ,
      0, sillRow),
  );

  const doorMesh = buildGrid('Driver door outer skin', options.doorFrontZ, options.doorRearZ,
    sillRow, rows);
  const hingeX = options.point(options.doorFrontZ, options.topY(options.doorFrontZ))[0];
  const hingeY = options.topY(options.doorFrontZ);
  return { hingePosition: new T.Vector3(hingeX, hingeY, options.doorFrontZ), doorMesh };
}
