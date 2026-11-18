import * as THREE from 'three';

/** Compact vector silhouette shared by the steering badge and yellow tach face. */
const outline = [
  [58, 4], [62, 12], [69, 15], [70, 22], [62, 23], [59, 19], [55, 29],
  [64, 36], [75, 31], [81, 34], [78, 39], [65, 44], [60, 42],
  [64, 49], [79, 45], [84, 49], [80, 54], [63, 57], [56, 52],
  [53, 62], [58, 73], [56, 89], [64, 94], [63, 98], [52, 97], [49, 77],
  [43, 70], [42, 83], [34, 93], [36, 98], [28, 98], [27, 92], [35, 79],
  [32, 63], [23, 58], [18, 47], [12, 50], [14, 59], [8, 54], [7, 43],
  [15, 35], [23, 40], [26, 52], [33, 48], [36, 40], [43, 33], [48, 23],
  [48, 15], [53, 12], [53, 5], [58, 12],
] as const;

export function drawPrancingHorse(context: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  context.save(); context.translate(x - size * .5, y - size * .5); context.scale(size / 100, size / 100);
  context.fillStyle = '#121619'; context.beginPath();
  outline.forEach(([px, py], i) => i ? context.lineTo(px, py) : context.moveTo(px, py));
  context.closePath(); context.fill(); context.restore();
}

export function createPrancingHorseBadge(): THREE.Group {
  const root = new THREE.Group(); root.name = 'Ferrari steering wheel badge';
  const disk = new THREE.Mesh(new THREE.CircleGeometry(.024, 40),
    new THREE.MeshStandardMaterial({ color: 0xf0ce30, roughness: .40, metalness: .18 }));
  disk.name = 'Ferrari yellow badge ground'; root.add(disk);
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2((x - 50) * .00036, (50 - y) * .00036)));
  const horse = new THREE.Mesh(new THREE.ShapeGeometry(shape),
    new THREE.MeshStandardMaterial({ color: 0x101317, roughness: .36 }));
  horse.name = 'Ferrari black prancing horse'; horse.position.z = .0007; root.add(horse);
  const border = new THREE.Mesh(new THREE.TorusGeometry(.024, .0011, 6, 40),
    new THREE.MeshStandardMaterial({ color: 0x909397, metalness: .7, roughness: .3 }));
  border.position.z = .0005; root.add(border);
  return root;
}
