import type { PlacementBrushRequest } from './PlacementBrush';

/** Controls only; geometry, randomness and legality belong to the shared kernel. */
export class PlacementBrushPanel {
  readonly element=document.createElement('section');
  private timer=0;
  constructor(host:HTMLElement,changed:()=>void){
    this.element.className='ce-brush-panel';
    this.element.innerHTML=`<h3>Placement Brush</h3>
      <label>Object Type<select data-brush-type>${['streetlight','streetlight_dual','streetlight_highway','streetlight_small','tree','guardrail','traffic_sign','roadSign','trafficLight'].map(id=>`<option>${id}</option>`).join('')}</select></label>
      <label>Mode<select data-brush-mode>${['RANGE','SINGLE','LINE','AREA','REPLACE','REPAIR'].map(id=>`<option>${id}</option>`).join('')}</select></label>
      <label>Side<select data-brush-side><option>right</option><option>left</option><option>both</option></select></label>
      <label>Spacing m<input data-brush-spacing type="number" min="1" step="1" value="32"></label>
      <label>Density / m²<input data-brush-density type="number" min="0.0001" step="0.001" value="0.002"></label>
      <label>Lateral Offset m<input data-brush-lateral type="number" step="0.25" value="2"></label>
      <label>Height Offset m<input data-brush-height type="number" step="0.05" value="0"></label>
      <label>Height Mode<select data-brush-height-mode>${['ROAD_SURFACE','GROUND','ROAD_DECK','SIDEWALK','STRUCTURE_DECK','ABSOLUTE','RELATIVE'].map(id=>`<option>${id}</option>`).join('')}</select></label>
      <label>Absolute Y m<input data-brush-absolute type="number" step="0.25" value="0"></label>
      <label>Scale<input data-brush-scale type="number" min="0.05" step="0.05" value="1"></label>
      <label>Rotation Mode<select data-brush-orientation>${['ROAD_FORWARD','FACE_TRAFFIC','ROAD_BACKWARD','FACE_ROAD','FACE_INTERSECTION','NORMAL_TO_ROAD','ABSOLUTE'].map(id=>`<option>${id}</option>`).join('')}</select></label>
      <label>Yaw °<input data-brush-yaw type="number" step="5" value="0"></label>
      <label>Position Jitter m<input data-brush-jitter type="number" min="0" step="0.25" value="0"></label>
      <label>Scale Jitter<input data-brush-scale-jitter type="number" min="0" max="0.9" step="0.05" value="0"></label>
      <label>Seed<input data-brush-seed type="number" step="1" value="42"></label>
      <label>Arrangement<select data-brush-arrangement><option>ALIGNED</option><option>STAGGERED</option></select></label>
      <label>Auto Adjust<select data-brush-adjust><option>SKIP</option><option>ADJUST</option><option>STRICT</option></select></label>
      <label>Max Auto Move m<input data-brush-max-move type="number" min="0" step="0.5" value="5"></label>
      <label>Snap Mode<select data-brush-snap><option>roadside</option><option>none</option></select></label>
      <label>避开路口 m<input data-brush-avoid-junction type="number" min="0" step="1" value="20"></label>
      <label>避开匝道 m<input data-brush-avoid-ramp type="number" min="0" step="1" value="10"></label>
      <label>Signal side<select data-brush-signal-side><option>opposite-side</option><option>near-side</option></select></label>
      <label>名称 ID<input data-brush-name placeholder="roadSign registry ID"></label>
      <label>Signal Pole Height m<input data-brush-pole type="number" min="3" max="12" step="0.25" value="7.2"></label>
      <button type="button" data-brush-preview>预览刷子</button><output data-brush-report></output>
      <p class="ce-hint">刷子工具：沿道路按住左键拖出区间；AREA 拖出区域。绿=VALID，黄=ADJUSTED，红=INVALID。Alt+滚轮微调高度；Shift+滚轮微调侧移。确认后一次提交。</p>`;
    host.append(this.element);
    const schedule=()=>{window.clearTimeout(this.timer);this.timer=window.setTimeout(changed,120);};
    this.element.addEventListener('input',schedule);this.element.addEventListener('change',schedule);
    this.element.querySelector('[data-brush-preview]')!.addEventListener('click',changed);
  }
  private value(name:string){return this.element.querySelector<HTMLInputElement|HTMLSelectElement>(`[data-brush-${name}]`)!.value;}
  get mode(){return this.value('mode') as PlacementBrushRequest['mode'];}
  nudge(name:'height'|'lateral',amount:number){const input=this.element.querySelector<HTMLInputElement>(`[data-brush-${name}]`)!;input.value=(Number(input.value)+amount).toFixed(2);}
  request():PlacementBrushRequest {
    return {mode:this.mode,type:this.value('type') as PlacementBrushRequest['type'],side:this.value('side') as PlacementBrushRequest['side'],spacing:Number(this.value('spacing')),density:Number(this.value('density')),lateralOffset:Number(this.value('lateral')),heightMode:this.value('height-mode') as PlacementBrushRequest['heightMode'],height:Number(this.value('absolute')),heightOffset:Number(this.value('height')),scale:Number(this.value('scale')),orientation:this.value('orientation') as PlacementBrushRequest['orientation'],yaw:Number(this.value('yaw'))*Math.PI/180,randomPositionJitter:Number(this.value('jitter')),randomScaleJitter:Number(this.value('scale-jitter')),seed:Number(this.value('seed')),arrangement:this.value('arrangement') as PlacementBrushRequest['arrangement'],autoAdjust:this.value('adjust') as PlacementBrushRequest['autoAdjust'],maxAutoMove:Number(this.value('max-move')),snapMode:this.value('snap') as PlacementBrushRequest['snapMode'],minDistanceToIntersection:Number(this.value('avoid-junction')),minDistanceToRamp:Number(this.value('avoid-ramp')),signalSide:this.value('signal-side') as PlacementBrushRequest['signalSide'],nameId:this.value('name')||undefined,poleHeight:Number(this.value('pole'))};
  }
  report(text:string){this.element.querySelector('output')!.textContent=text;}
  dispose(){window.clearTimeout(this.timer);this.element.remove();}
}
