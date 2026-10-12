import { LaneAssistMode, LANE_ASSIST_LABELS, type LaneAssistState } from '../control/LaneAssistState';

export type LaneAssistSkin = 'bmw' | 'audi' | 'tesla';
const STYLES = {
  bmw: { foreground: '#a9c5d9', background: '#102132', edge: '#39536b', font: '"Segoe UI", sans-serif' },
  audi: { foreground: '#c4ced9', background: '#111b26', edge: '#64717f', font: '"Segoe UI Light", sans-serif' },
  tesla: { foreground: '#607c8b', background: '#f4f5f2', edge: '#c7d0d3', font: '"Segoe UI", sans-serif' },
} as const;

/** Mode selection artwork; subdued styling does not claim controller engagement. */
export function drawLaneAssistSelection(c: CanvasRenderingContext2D, state: LaneAssistState | undefined,
  skin: LaneAssistSkin, x: number, y: number, scale = 1): void {
  if (!state || state.mode === LaneAssistMode.OFF && !state.notificationVisible) return;
  const style = STYLES[skin], popup = state.notificationVisible;
  c.save(); c.translate(x, y); c.scale(scale, scale);
  if (popup) {
    c.fillStyle = style.background; c.strokeStyle = style.edge; c.lineWidth = 1;
    c.beginPath(); c.roundRect(-112, -35, 224, 70, skin === 'audi' ? 3 : 9); c.fill(); c.stroke();
    c.fillStyle = style.foreground; c.font = `18px ${style.font}`;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('Lane Assist', 0, -16);
  }
  c.translate(0, popup ? 14 : 0);
  c.strokeStyle = style.foreground; c.fillStyle = style.foreground; c.lineWidth = 2;
  // A lane/steering mode symbol only; never paint fabricated road geometry.
  c.beginPath(); c.moveTo(-52, 11); c.lineTo(-48, -11); c.moveTo(-20, 11); c.lineTo(-24, -11); c.stroke();
  if (state.mode === LaneAssistMode.KEEP_ASSIST || state.mode === LaneAssistMode.CENTERING_ASSIST) {
    c.beginPath(); c.arc(-36, 0, 7, 0, Math.PI * 2); c.moveTo(-43, 0); c.lineTo(-29, 0);
    c.moveTo(-36, 0); c.lineTo(-36, 7); c.stroke();
  }
  c.font = `500 23px ${style.font}`; c.textAlign = 'left'; c.textBaseline = 'middle';
  c.fillText(LANE_ASSIST_LABELS[state.mode], -4, 0); c.restore();
}
