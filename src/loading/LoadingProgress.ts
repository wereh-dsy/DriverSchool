export const LOAD_PHASES = [
  ['foundation','基础初始化',12],['vehicle','车辆与基础系统',13],
  ['region','出生区域加载',30],['gpu','GPU 资源准备',30],['screen','首屏与驾驶就绪',15],
] as const;
export type LoadPhase = typeof LOAD_PHASES[number][0];
export interface LoadingSnapshot {
  phase: string; resource: string; percent: number; completed: number; total: number;
  elapsedMs: number; status: 'idle'|'running'|'ready'|'error'|'cancelled'; attempt: number;
}
/** Task receipts drive the bar. Elapsed time never advances it. Discovery can
 * append work; completed credit never retreats, and only an explicit handoff
 * can award 100%. Each retry starts a separately identified attempt. */
export class LoadingProgress {
  private phases = new Map<LoadPhase,{done:number;total:number;closed:boolean;resource:string}>();
  private percent=0;
  private started=0;
  private ended:number|undefined;
  private status:LoadingSnapshot['status']='idle';
  private attempt=0;
  constructor(private readonly changed:(snapshot:LoadingSnapshot)=>void){}
  begin():number {
    this.phases.clear();for(const [id]of LOAD_PHASES)this.phases.set(id,{done:0,total:0,closed:false,resource:''});
    this.percent=0;this.started=performance.now();this.ended=undefined;this.status='running';this.attempt++;this.emit();return this.attempt;
  }
  update(id:LoadPhase,done:number,total:number,resource:string):void {
    if(this.status!=='running')return;
    if(!Number.isFinite(done)||!Number.isFinite(total)||done<0||total<done)throw Error('Invalid loading task receipt');
    const phase=this.phases.get(id)!;
    if(phase.done===done&&phase.total===total&&phase.resource===resource)return;
    phase.done=done;phase.total=total;phase.resource=resource;if(done<total)phase.closed=false;this.emit();
  }
  close(id:LoadPhase):void {
    if(this.status!=='running')return;const phase=this.phases.get(id)!;
    if(phase.done!==phase.total)throw Error('Loading phase still has pending work: '+id);
    if(!phase.closed){phase.closed=true;this.emit();}
  }
  finish():void {
    if(this.status!=='running')return;
    if([...this.phases.values()].some(p=>!p.closed||p.done!==p.total))throw Error('Cannot open driving with unfinished loading tasks');
    this.status='ready';this.ended=performance.now();this.percent=100;this.emit();
  }
  fail(message:string):void {if(this.status==='running'){this.status='error';this.ended=performance.now();this.emit(message);}}
  cancel():void {if(this.status==='running'){this.status='cancelled';this.ended=performance.now();this.emit();}}
  get snapshot():LoadingSnapshot {
    let completed=0,total=0,credit=0,phase='驾驶就绪',resource='首屏资源已准备完成';
    for(const [id,,weight]of LOAD_PHASES){const p=this.phases.get(id);if(!p)continue;completed+=p.done;total+=p.total;credit+=weight*(p.closed?1:p.total?Math.min(.97,p.done/p.total):0);}
    if(this.status==='running'){this.percent=Math.max(this.percent,Math.min(99,Math.floor(credit)));for(const[id,label]of LOAD_PHASES){const p=this.phases.get(id)!;if(!p.closed){phase=label;resource=p.resource||'正在发现所需资源';break;}}}
    return{phase,resource,percent:this.percent,completed,total,elapsedMs:this.started?(this.ended??performance.now())-this.started:0,status:this.status,attempt:this.attempt};
  }
  private emit(error?:string):void {const snapshot=this.snapshot;if(error)snapshot.resource=error;this.changed(snapshot);}
}
