export type WorldLOD = 'near' | 'mid' | 'far';
/** Common prepared-representation contract, with spatial hysteresis. */
export class WorldLODPolicy {
    readonly near = 750;
    readonly mid = 1800;
    readonly hysteresis = 100;
    select(distance: number, previous?: WorldLOD): WorldLOD {
        if (distance <= this.near || previous === 'near' && distance <= this.near + this.hysteresis) {
            return 'near';
        }
        if (distance <= this.mid || previous === 'mid' && distance <= this.mid + this.hysteresis) {
            return 'mid';
        }
        return 'far';
    }
}
