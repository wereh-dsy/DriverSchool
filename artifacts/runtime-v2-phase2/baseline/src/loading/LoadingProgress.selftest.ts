import {LoadingProgress,LOAD_PHASES,type LoadingSnapshot} from './LoadingProgress';
export function runLoadingProgressSelfTest(){
  let assertions=0;const check=(ok:unknown,message:string)=>{assertions++;if(!ok)throw Error('Loading progress: '+message);},snapshots:LoadingSnapshot[]=[],p=new LoadingProgress(s=>snapshots.push(s));
  p.begin();check(p.snapshot.percent===0,'new attempt starts at zero');const before=p.snapshot.percent;for(let i=0;i<20;i++)p.snapshot;check(p.snapshot.percent===before,'time and reads cannot invent completed work');
  p.update('foundation',3,4,'地图');const earned=p.snapshot.percent;p.update('foundation',3,8,'新增依赖');check(p.snapshot.percent>=earned&&p.snapshot.completed===3&&p.snapshot.total===8,'dynamic discovery preserves credit and exact counters');
  p.update('foundation',3,3,'取消不需要的依赖');p.close('foundation');check(p.snapshot.percent<100,'closing one phase cannot complete the load');
  let rejected=false;try{p.finish();}catch{rejected=true;}check(rejected,'cannot hand off with unknown phases');
  p.update('foundation',3,5,'再次发现依赖');rejected=false;try{p.close('foundation');}catch{rejected=true;}check(rejected,'new pending tasks reopen a closed phase');
  p.update('foundation',5,5,'完成');p.close('foundation');for(const[id]of LOAD_PHASES)if(id!=='foundation'){p.update(id,1,1,id);p.close(id);}
  check(p.snapshot.percent===99,'completed submissions still await explicit driving handoff');p.finish();check(p.snapshot.percent===100&&p.snapshot.status==='ready','actual handoff awards one hundred');check(p.snapshot.elapsedMs===p.snapshot.elapsedMs,'ready duration is frozen');
  check(snapshots.every((s,i)=>!i||s.percent>=snapshots[i-1]!.percent),'all progress emissions are monotonic');
  p.begin();p.update('region',1,3,'道路');p.fail('fixture');const failed=p.snapshot.elapsedMs;check(p.snapshot.status==='error','failure is visible');p.update('region',3,3,'late');check(p.snapshot.completed===1&&p.snapshot.elapsedMs===failed,'failed attempt ignores late work');
  const attempt=p.begin();check(attempt===3&&p.snapshot.percent===0&&p.snapshot.total===0,'retry has a distinct clean ledger');p.cancel();p.update('gpu',1,1,'late');check(p.snapshot.status==='cancelled'&&p.snapshot.percent<100&&p.snapshot.completed===0,'cancelled work cannot become ready');
  return{assertions};
}
