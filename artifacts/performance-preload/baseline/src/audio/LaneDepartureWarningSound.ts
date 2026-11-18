/** Dedicated dual-frequency LDW flutter, independent of generic vehicle chime profiles. */
export const LDW_SOUND = Object.freeze({ frequency: 760, overtone: 1140, peakGain: .18,
  pulses: 3, spacingSeconds: .18, durationSeconds: .12, attackSeconds: .012, releaseSeconds: .035 });

export function playLaneDepartureWarningSound(context: AudioContext, destination: AudioNode,
  volume = LDW_SOUND.peakGain): void {
  const peak = Number.isFinite(volume) ? Math.max(0, Math.min(.3, volume)) : LDW_SOUND.peakGain;
  for (let pulse = 0; pulse < LDW_SOUND.pulses; pulse++) {
    const start = context.currentTime + pulse * LDW_SOUND.spacingSeconds, end = start + LDW_SOUND.durationSeconds;
    for (let harmonic = 0; harmonic < 2; harmonic++) {
      const tone = context.createOscillator(), envelope = context.createGain();
      tone.type = 'sine'; tone.frequency.setValueAtTime(harmonic === 0 ? LDW_SOUND.frequency : LDW_SOUND.overtone, start);
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(peak * (harmonic === 0 ? 1 : .35), start + LDW_SOUND.attackSeconds);
      envelope.gain.setValueAtTime(peak * (harmonic === 0 ? 1 : .35), end - LDW_SOUND.releaseSeconds);
      envelope.gain.linearRampToValueAtTime(0, end);
      tone.connect(envelope).connect(destination); tone.start(start); tone.stop(end);
      tone.onended = () => { tone.disconnect(); envelope.disconnect(); };
    }
  }
}
