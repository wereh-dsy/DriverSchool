import { LDW_SOUND, playLaneDepartureWarningSound } from './LaneDepartureWarningSound';

export function runLaneDepartureWarningSoundSelfTest(): string[] {
  const checks:string[]=[], check=(v:boolean,n:string)=>{if(!v)throw new Error(n);checks.push(n);};
  const frequencies:number[]=[], starts:number[]=[], stops:number[]=[], peaks:number[]=[];
  let disconnected=0;
  const tones:{onended?:()=>void}[]=[];
  const context={currentTime:2,createOscillator:()=>{
    const tone={type:'',frequency:{setValueAtTime:(v:number)=>frequencies.push(v)},
      connect:(node:unknown)=>node,start:(t:number)=>starts.push(t),stop:(t:number)=>stops.push(t),
      disconnect:()=>disconnected++,onended:undefined as (()=>void)|undefined};
    tones.push(tone);return tone;
  },createGain:()=>({gain:{setValueAtTime:()=>{},linearRampToValueAtTime:(v:number)=>peaks.push(v)},
    connect:()=>{},disconnect:()=>disconnected++})} as unknown as AudioContext;
  playLaneDepartureWarningSound(context,{} as AudioNode);
  check(frequencies.length===6&&frequencies.every(f=>f===760||f===1140),'LDW uses its own dual-frequency voice for three pulses');
  check(starts[0]===2&&Math.abs(starts[2]!-2.18)<1e-9&&Math.abs(starts[4]!-2.36)<1e-9,'dedicated triplet rhythm');
  check(stops.every((t,i)=>Math.abs(t-starts[i]!-LDW_SOUND.durationSeconds)<1e-9),'short finite bursts with no continuous tone');
  check(Math.max(...peaks)===.18&&peaks.includes(0),'audible independent peak gain with click-free release to zero');
  tones.forEach(tone=>tone.onended?.());
  check(disconnected===12,'all one-shot audio nodes disconnect after playback');
  return checks;
}
