import { Box3, BufferAttribute, BufferGeometry, InterleavedBuffer, InterleavedBufferAttribute, Matrix3, Matrix4, Sphere, Vector3 } from 'three';

export interface StaticGeometryPart { geometry: BufferGeometry; transform: Matrix4 }
export function geometryBufferBytes(geometry: BufferGeometry): number {
  const arrays=new Set<unknown>();let bytes=0;
  for(const attribute of [...Object.values(geometry.attributes),...geometry.index?[geometry.index]:[]]){
    if(!arrays.has(attribute.array)){arrays.add(attribute.array);bytes+=attribute.array.byteLength;}
  }
  return bytes;
}
export function canPackGeometry(geometry: BufferGeometry): boolean {
  const count=geometry.index?.count??geometry.getAttribute('position')?.count??0;
  return count>0 && geometry.drawRange.start===0 && geometry.drawRange.count>=count && Object.values(geometry.attributes).every(a =>
    !('isInterleavedBufferAttribute' in a) && !('isInstancedBufferAttribute' in a) && !a.normalized && a.array instanceof Float32Array);
}

/** Exact vertex identity includes UV seams, normals, colours and tangent W.
 * Position stays compact for depth/shadow passes; other attributes interleave. */
export function* packStaticGeometrySteps(parts: readonly StaticGeometryPart[], origin = new Vector3()): Generator<void, BufferGeometry> {
  const layout = Object.entries(parts[0]!.geometry.attributes).sort(([a], [b]) => a.localeCompare(b)).map(([name, a]) => ({ name, size: a.itemSize, offset: 0 }));
  let stride = 0;
  for (const attribute of layout) { attribute.offset = stride; stride += attribute.size; }
  const positionOffset = layout.find(a => a.name === 'position')!.offset;
  const capacity = parts.reduce((sum, p) => sum + p.geometry.getAttribute('position').count, 0);
  const indexCount = parts.reduce((sum, p) => sum + (p.geometry.index?.count ?? p.geometry.getAttribute('position').count), 0);
  const values = new Float32Array(capacity * stride), words = new Uint32Array(values.buffer);
  const scratch = new Float32Array(stride), scratchWords = new Uint32Array(scratch.buffer);
  const links = new Int32Array(capacity), heads = new Map<number, number>(), indices = new Uint32Array(indexCount);
  const bounds = new Box3(), vector = new Vector3();
  let unique = 0, indexAt = 0;
  for (const part of parts) {
    const geometry = part.geometry, count = geometry.getAttribute('position').count;
    const remap = new Int32Array(count); remap.fill(-1);
    const transform = part.transform.clone();
    transform.elements[12]! -= origin.x; transform.elements[13]! -= origin.y; transform.elements[14]! -= origin.z;
    const normal = new Matrix3().getNormalMatrix(transform), reverse = transform.determinant() < 0;
    const total = geometry.index?.count ?? count;
    for (let start = 0; start < total; start += 384) {
      for (let i = start; i < Math.min(total, start + 384); i++) {
        const offset = reverse ? i % 3 === 1 ? i + 1 : i % 3 === 2 ? i - 1 : i : i;
        const vertex = geometry.index?.getX(offset) ?? offset;
        let mapped = remap[vertex]!;
        if (mapped < 0) {
          for (const attribute of layout) {
            const source = geometry.getAttribute(attribute.name), at = attribute.offset;
            for (let c = 0; c < attribute.size; c++) scratch[at + c] = source.array[vertex * attribute.size + c]!;
            if (attribute.name === 'position' || attribute.name === 'normal' || attribute.name === 'tangent') {
              vector.fromArray(scratch, at);
              if (attribute.name === 'position') vector.applyMatrix4(transform);
              else if (attribute.name === 'normal') vector.applyNormalMatrix(normal);
              else vector.transformDirection(transform);
              scratch[at] = vector.x; scratch[at + 1] = vector.y; scratch[at + 2] = vector.z;
              if (attribute.name === 'tangent' && reverse) scratch[at + 3]! *= -1;
            }
          }
          let hash = 2166136261;
          for (let c = 0; c < stride; c++) hash = Math.imul(hash ^ scratchWords[c]!, 16777619);
          const head = heads.get(hash) ?? -1;
          mapped = head;
          while (mapped >= 0) {
            let equal = true;
            for (let c = 0; c < stride; c++) if (words[mapped * stride + c] !== scratchWords[c]) { equal = false; break; }
            if (equal) break;
            mapped = links[mapped]!;
          }
          if (mapped < 0) {
            mapped = unique++; words.set(scratchWords, mapped * stride); links[mapped] = head; heads.set(hash, mapped);
            bounds.expandByPoint(vector.fromArray(scratch, positionOffset));
          }
          remap[vertex] = mapped;
        }
        indices[indexAt++] = mapped;
      }
      yield;
    }
  }
  const positions = new Float32Array(unique*3), auxiliaryStride=stride-3;
  const auxiliary = new Float32Array(unique*auxiliaryStride);
  const result = new BufferGeometry();
  if (unique !== indexCount) result.setIndex(new BufferAttribute(unique <= 65536 ? new Uint16Array(indices) : indices, 1));
  if (parts.length === 1) for (const group of parts[0]!.geometry.groups) result.addGroup(group.start, group.count, group.materialIndex);
  result.boundingBox = bounds;
  const center = bounds.getCenter(new Vector3());
  let radiusSquared = 0;
  for (let start = 0; start < unique; start += 512) {
    for (let i = start; i < Math.min(unique, start + 512); i++) {
      const at=i*stride;let auxiliaryOffset=i*auxiliaryStride;
      for(const attribute of layout){
        if(attribute.name==='position')for(let c=0;c<3;c++)positions[i*3+c]=values[at+attribute.offset+c]!;
        else for(let c=0;c<attribute.size;c++)auxiliary[auxiliaryOffset++]=values[at+attribute.offset+c]!;
      }
      radiusSquared = Math.max(radiusSquared, vector.fromArray(values, at+positionOffset).distanceToSquared(center));
    }
    yield;
  }
  result.setAttribute('position',new BufferAttribute(positions,3));
  if(auxiliaryStride){const data=new InterleavedBuffer(auxiliary,auxiliaryStride);let offset=0;
    for(const attribute of layout)if(attribute.name!=='position'){result.setAttribute(attribute.name,new InterleavedBufferAttribute(data,attribute.size,offset));offset+=attribute.size;}}
  result.boundingSphere = new Sphere(center, Math.sqrt(radiusSquared));
  return result;
}
