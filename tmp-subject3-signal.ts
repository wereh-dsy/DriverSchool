import { Subject3Ground } from './src/world/subject3/Subject3Ground';

const ground = new Subject3Ground({ shadows: false });
const first = ground.getTrafficSignalSnapshot();
console.log('first', first.cycleSeconds, first.state.phase, first.northSouth, first.eastWest);
ground.update(first.cycleSeconds * 0.25);
const quarter = ground.getTrafficSignalSnapshot();
console.log('quarter', quarter.state.phase, quarter.state.secondsInPhase, quarter.northSouth, quarter.eastWest);
ground.update(10);
console.log('plus10', ground.getTrafficSignalSnapshot().state.phase);
ground.dispose();
