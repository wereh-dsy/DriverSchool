import type { NavigationState } from '../world/navigation/NavigationController';
import { navigationDistance, navigationTime } from '../world/navigation/RoutePlanner';

export function activeNavigation(state:NavigationState|undefined):state is NavigationState {
  return !!state?.route&&['navigating','rerouting','arrived'].includes(state.status);
}
/** Shared presentation only, clipped to each skin's existing information region. */
export function drawNavigationBanner(c:CanvasRenderingContext2D,state:NavigationState|undefined,
  rect:{x:number;y:number;width:number;height:number},compact=false):void {
  if(!activeNavigation(state))return;
  c.save();c.beginPath();c.rect(rect.x,rect.y,rect.width,rect.height);c.clip();
  c.fillStyle='rgba(9,20,29,.94)';c.fillRect(rect.x,rect.y,rect.width,rect.height);
  const size=Math.max(12,Math.min(compact?23:29,rect.height/(compact?3.3:3.5)));
  c.font=`500 ${size}px "Segoe UI", "Microsoft YaHei", sans-serif`;c.textBaseline='middle';c.textAlign='left';c.fillStyle='#f0f5f7';
  const first=state.status==='arrived'?'● 已到达目的地':state.status==='rerouting'?state.instruction:`${state.symbol} ${navigationDistance(state.maneuverDistance)} ${state.instruction}`;
  c.fillText(first,rect.x+12,rect.y+rect.height*.27,rect.width-24);
  c.fillStyle='#99d3f7';c.font=`400 ${size*.83}px "Segoe UI", "Microsoft YaHei", sans-serif`;
  c.fillText(state.nextRoad,rect.x+12,rect.y+rect.height*.56,rect.width-24);
  if(!compact){c.fillStyle='#b5c2cb';c.font=`400 ${size*.69}px sans-serif`;c.fillText(`${navigationDistance(state.remainingDistance)} · 预计 ${navigationTime(state.remainingSeconds)}`,rect.x+12,rect.y+rect.height*.84,rect.width-24);}
  c.restore();
}
