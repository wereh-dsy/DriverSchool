import { MathUtils } from 'three';
import type { TsukubaSection } from './TsukubaLayout';

export interface HeightStation { readonly distance: number; readonly height: number }

/** Shape-preserving C1 interpolation: crests cannot overshoot the authored profile. */
export class TsukubaHeightProfile {
  private readonly slopes: number[];
  public constructor(public readonly stations: readonly HeightStation[], periodic = false) {
    const n = stations.length;
    const span = (i: number): number => stations[i + 1]!.distance - stations[i]!.distance;
    const secant = (i: number): number => (stations[i + 1]!.height - stations[i]!.height) / span(i);
    const joint = (a: number, b: number): number => {
      const sa = secant(a), sb = secant(b);
      if (sa * sb <= 0) return 0;
      const w1 = 2 * span(b) + span(a), w2 = span(b) + 2 * span(a);
      return (w1 + w2) / (w1 / sa + w2 / sb);
    };
    this.slopes = stations.map((_, i) => i === 0 ? (periodic ? joint(n - 2, 0) : secant(0))
      : i === n - 1 ? (periodic ? joint(n - 2, 0) : secant(n - 2)) : joint(i - 1, i));
  }
  public at(distance: number): number {
    const nodes = this.stations;
    if (distance <= nodes[0]!.distance) return nodes[0]!.height;
    if (distance >= nodes[nodes.length - 1]!.distance) return nodes[nodes.length - 1]!.height;
    let low = 0, high = nodes.length - 1;
    while (high - low > 1) {
      const mid = (low + high) >>> 1;
      if (nodes[mid]!.distance <= distance) low = mid; else high = mid;
    }
    const a = nodes[low]!, b = nodes[high]!, span = b.distance - a.distance;
    const t = (distance - a.distance) / span, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * a.height + (t3 - 2 * t2 + t) * span * this.slopes[low]!
      + (-2 * t3 + 3 * t2) * b.height + (t3 - t2) * span * this.slopes[high]!;
  }
}

/** Official unscaled longitudinal diagram, reconstructed at a 5.3 m centreline
 * range (published GT reference). Banking angles are conservative estimates,
 * not measured survey data. See docs/TSUKUBA_TC2000.md for source limitations.
 * Tables are baked once; wheel queries use constant-time interpolation.
 */
export class TsukubaElevation {
  public readonly profile: TsukubaHeightProfile;
  private readonly heights: Float64Array;
  private readonly banks: Float64Array;
  private readonly count: number;
  public constructor(sections: readonly TsukubaSection[], public readonly length: number) {
    const s = (id: string, t: number): number => {
      const section = sections.find(section => section.id === id)!;
      return MathUtils.lerp(section.start, section.end, t);
    };
    // y values refer to the vertical positions of the official profile image.
    // Its two rows share the same vertical scale but have different baselines.
    const fromDiagram = (y: number): number => (445 - y) * 5.3 / (445 - 247);
    const nodes: HeightStation[] = [
      { distance: 0, height: fromDiagram(412) },
      { distance: s('home', 0.5), height: fromDiagram(393) },
      { distance: s('t1-entry', 0), height: fromDiagram(260) },
      { distance: s('t1-entry', 0.7), height: 5.3 },
      { distance: s('t1-exit', 1), height: fromDiagram(294) },
      { distance: s('s-entry', 1), height: fromDiagram(397) },
      { distance: s('s-bend', 0.65), height: fromDiagram(442) },
      { distance: s('s-bend', 1), height: fromDiagram(436) },
      { distance: s('hairpin-1-entry', 1), height: fromDiagram(395) },
      { distance: s('hairpin-1', 0.5), height: fromDiagram(386) },
      { distance: s('hairpin-1', 1), height: fromDiagram(398) },
      { distance: s('dunlop-approach', 1), height: 0 },
      { distance: s('dunlop', 1), height: fromDiagram(423) },
      { distance: s('80r-entry', 1), height: fromDiagram(379) },
      { distance: s('80r-exit', 1), height: fromDiagram(400) },
      { distance: s('hairpin-2-approach', 0.45), height: fromDiagram(400) },
      { distance: s('hairpin-2', 0.35), height: fromDiagram(353) },
      { distance: s('hairpin-2-exit', 1), height: fromDiagram(399) },
      { distance: s('back', 1), height: fromDiagram(399) },
      { distance: s('final-entry', 0.8), height: fromDiagram(390) },
      { distance: s('final-exit', 0.6), height: fromDiagram(425) },
      { distance: s('final-exit', 1), height: fromDiagram(420) },
      { distance: length, height: fromDiagram(412) },
    ];
    this.profile = new TsukubaHeightProfile(nodes, true);
    const bankNodes: HeightStation[] = [{ distance: 0, height: 0 }];
    const corner = (first: string, last: string, degrees: number): void => {
      const start = s(first, 0), end = s(last, 1);
      const slope = Math.tan(MathUtils.degToRad(degrees));
      bankNodes.push({ distance: start, height: 0 },
        { distance: MathUtils.lerp(start, end, 0.45), height: slope },
        { distance: MathUtils.lerp(start, end, 0.65), height: slope }, { distance: end, height: 0 });
    };
    corner('t1-entry', 't1-exit', 2.5);
    corner('hairpin-1-entry', 'hairpin-1', -5);
    corner('dunlop', 'dunlop', 2);
    corner('80r-entry', '80r-exit', -1.5);
    corner('hairpin-2', 'hairpin-2-exit', 4);
    corner('final-entry', 'final-exit', 1.5);
    // Adjacent corners can share an exact zero-bank station.
    const unique = bankNodes.filter((node, i) => i === 0 || node.distance > bankNodes[i - 1]!.distance);
    unique.push({ distance: length, height: 0 });
    const banking = new TsukubaHeightProfile(unique, true);
    this.count = Math.ceil(length / 0.5);
    this.heights = new Float64Array(this.count + 1); this.banks = new Float64Array(this.count + 1);
    for (let i = 0; i <= this.count; i++) {
      const d = length * i / this.count;
      this.heights[i] = this.profile.at(d); this.banks[i] = banking.at(d);
    }
    this.heights[this.count] = this.heights[0]!; this.banks[this.count] = this.banks[0]!;
  }
  public heightAt(distance: number): number { return this.lookup(this.heights, distance); }
  /** Positive bank lowers the right edge; negative lowers the left edge. */
  public bankAt(distance: number): number { return this.lookup(this.banks, distance); }
  public roadHeightAt(distance: number, lateral = 0): number {
    return this.heightAt(distance) - this.bankAt(distance) * lateral;
  }
  private lookup(table: Float64Array, distance: number): number {
    const index = MathUtils.euclideanModulo(distance, this.length) * this.count / this.length;
    const i = Math.min(this.count - 1, Math.floor(index)), t = index - i;
    return table[i]! + (table[i + 1]! - table[i]!) * t;
  }
}
