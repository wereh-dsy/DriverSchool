import type { CityMapData } from './CityMapData';

/** Shared namespace for elements, links, ports and preset groups. Deterministic suffixes. */
export class CityMapIds {
  private readonly used = new Set<string>();
  constructor(map?: CityMapData) {
    if (map) for (const list of [map.roads, map.intersections, map.objects, map.roadLinks ?? [], map.connectionPorts ?? []]) {
      for (const item of list) { this.used.add(item.id); if ('groupId' in item && item.groupId) this.used.add(item.groupId); }
    }
  }
  allocate(baseName: string): string {
    if (!baseName || typeof baseName !== 'string') throw new Error('id.invalid: nonempty baseName required');
    let id = baseName, suffix = 2;
    while (this.used.has(id)) id = `${baseName}-${suffix++}`;
    this.used.add(id); return id;
  }
  explicit(id: string): string {
    if (!id || this.used.has(id)) throw new Error(`id.duplicate: ${id}`);
    this.used.add(id); return id;
  }
}
