import * as THREE from 'three';
import type { Subject3BuildContext } from './BuildContext';
import type { Subject3Point2 } from './Subject3GroundConfig';

// Cache belongs to one map construction, not to disposed/reloaded maps.
const caches = new WeakMap<Subject3BuildContext, Map<string, THREE.Material>>();
const labelMaterial = (
  context: Subject3BuildContext, text: string, background: string,
  width: number, height: number, style: 'board' | 'speed' | 'stop',
): THREE.Material => {
  if (typeof document === 'undefined') return context.materials.signWhite;
  let cache = caches.get(context);
  if (!cache) { cache = new Map(); caches.set(context, cache); }
  const key = [text, background, width, height, style].join('|');
  const existing = cache.get(key);
  if (existing) return existing;
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = Math.round(768 * height / width);
  const drawing = canvas.getContext('2d');
  if (!drawing) return context.materials.signWhite;
  const w = canvas.width, h = canvas.height;
  drawing.fillStyle = background;
  drawing.fillRect(0, 0, w, h);
  drawing.strokeStyle = style === 'speed' ? '#bb302a' : '#ffffff';
  drawing.lineWidth = style === 'speed' ? 45 : 10;
  if (style === 'speed') {
    drawing.beginPath();
    drawing.arc(w / 2, h / 2, Math.min(w, h) * 0.43, 0, Math.PI * 2);
    drawing.stroke();
  } else if (style === 'stop') {
    drawing.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const angle = (i + 0.5) * Math.PI / 4;
      const x = w / 2 + Math.cos(angle) * w * 0.43;
      const y = h / 2 + Math.sin(angle) * h * 0.43;
      if (i === 0) drawing.moveTo(x, y); else drawing.lineTo(x, y);
    }
    drawing.closePath();
    drawing.stroke();
  } else drawing.strokeRect(8, 8, w - 16, h - 16);
  drawing.fillStyle = style === 'speed' || background === '#e6b439' ? '#15232a' : '#ffffff';
  drawing.textAlign = 'center';
  drawing.textBaseline = 'middle';
  const rows = text.split('\n');
  const initial = Math.min(h * 0.55 / rows.length, 160);
  let font = initial;
  drawing.font = `700 ${font}px "Microsoft YaHei", "Segoe UI", sans-serif`;
  const widest = Math.max(...rows.map((row) => drawing.measureText(row).width));
  if (widest > w * 0.82) font *= w * 0.82 / widest;
  drawing.font = `700 ${font}px "Microsoft YaHei", "Segoe UI", sans-serif`;
  rows.forEach((row, i) => drawing.fillText(row, w / 2, h / 2 + (i - (rows.length - 1) / 2) * font * 1.2));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  cache.set(key, material);
  return material;
};

/** The readable face is local +Z; yaw should face the approaching driver. */
export const addLabelBoard = (
  parent: THREE.Group, context: Subject3BuildContext, name: string,
  text: string, background: string, fallback: THREE.Material,
  position: Subject3Point2, yawRadians: number,
  size: readonly [number, number] = [2.6, 0.95], poleHeight = 2.05,
  style: 'board' | 'speed' | 'stop' = 'board',
): THREE.Group => {
  const group = new THREE.Group();
  group.name = name;
  group.userData.subject3SignText = text;
  group.position.set(position.x, context.heightAt(position.x, position.z), position.z);
  group.rotation.y = yawRadians;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, poleHeight, 8), context.materials.darkMetal);
  pole.position.y = poleHeight / 2;
  pole.castShadow = context.shadows;
  const back = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], 0.06), fallback);
  back.position.y = poleHeight + size[1] * 0.35;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]),
    labelMaterial(context, text, background, size[0], size[1], style));
  face.position.set(0, back.position.y, 0.032);
  group.add(pole, back, face);
  parent.add(group);
  return group;
};
