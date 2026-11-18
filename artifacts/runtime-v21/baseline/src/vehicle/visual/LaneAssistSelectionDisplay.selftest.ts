import { InstrumentCluster, drawStatusLamp, type InstrumentTelemetry } from './InstrumentCluster';
import { LaneAssistMode, LaneAssistStateController } from '../control/LaneAssistState';

/** Exercise the real three instrument render paths with a recording 2D canvas. */
export function runLaneAssistSelectionDisplaySelfTest(): { assertions: number; skins: string[] } {
  let assertions = 0;
  const assert = (value: boolean, message: string) => {
    assertions++; if (!value) throw new Error(`Lane Assist instrument: ${message}`);
  };
  const texts: string[] = [], strokes: string[] = [];
  const properties: Record<string, unknown> = {};
  const context = new Proxy({} as CanvasRenderingContext2D, {
    get: (_target, key: string) => {
      if (key === 'fillText') return (text: string) => texts.push(text);
      if (key === 'stroke') return () => strokes.push(String(properties.strokeStyle));
      if (key === 'measureText') return (text: string) => ({ width: text.length * 10 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => {} });
      return properties[key] ?? (() => {});
    },
    set: (_target, key: string, value: unknown) => { properties[key] = value; return true; },
  });
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true,
    value: { createElement: () => ({ width: 1440, height: 540, getContext: () => context }) } });
  const skins = ['bmw-live', 'ev-center', 'executive-virtual'] as const;
  try {
    // Exact existing lamp artwork never emits fog text, with independent standard colours.
    texts.length = 0; strokes.length = 0;
    drawStatusLamp(context, 'FRFOG', '#72e58a', 0, 0, 24);
    drawStatusLamp(context, 'RRFOG', '#e5bc54', 0, 0, 24);
    assert(!texts.length && strokes.includes('#72e58a') && strokes.includes('#e5bc54'), 'shared fog icons are green/amber pictograms');
    for (const skin of skins) {
      const cluster = new InstrumentCluster({ displayStyle: skin });
      try {
        const selection = new LaneAssistStateController();
        const telemetry: InstrumentTelemetry = { speedKmh: 0, rpm: 0, gear: 'D', engineRunning: true,
          ignitionOn: true, driveAvailable: true, laneAssist: selection.state,
          indicators: { frontFogLights: true, rearFogLights: true } };
        cluster.update(telemetry, 2); // Pass the Audi welcome fade.
        for (const label of ['LDW', 'LKA', 'LCC', 'OFF']) {
          selection.cycleMode(); texts.length = 0;
          cluster.update(telemetry, .1);
          assert(texts.includes('Lane Assist') && texts.includes(label), `${skin}: mode popup ${label}`);
          assert(!texts.some(text => /FOG/.test(text)), `${skin}: no text fog indicator`);
          selection.update(1.61); texts.length = 0;
          cluster.update(telemetry, .1);
          assert(!texts.includes('Lane Assist'), `${skin}: popup expiry repaints stationary instrument`);
          assert(texts.includes(label) === (label !== 'OFF'), `${skin}: selected badge persists, normal OFF hides`);
        }
        selection.setMode(LaneAssistMode.KEEP_ASSIST); texts.length = 0;
        cluster.update({ ...telemetry, ignitionOn: false }, 2);
        assert(!texts.includes('Lane Assist'), `${skin}: ignition OFF cannot show selection popup`);
      } finally { cluster.dispose(); }
    }
  } finally {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else Reflect.deleteProperty(globalThis, 'document');
  }
  return { assertions, skins: [...skins] };
}
