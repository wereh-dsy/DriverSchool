import { newCityMap, type CityIntersection, type CityMapData, type CityRoad } from '../../city/CityMapData';
import { LaneGraph } from './LaneGraph';
import { RoadMarkingGovernance } from './RoadMarkingGovernance';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

export function runLaneGraphSelfTest(): { passed: boolean; assertions: number } {
  let assertions = 0;
  const check = (c: boolean, msg: string) => {
    assert(c, msg);
    assertions++;
  };

  // Mock map with 2 connected roads and an intersection
  const roadA: CityRoad = {
    id: 'road_A',
    laneCount: 4,
    laneWidth: 3.5,
    travelDirection: 'two-way',
    speedLimit: 60,
    centerline: [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 100 },
    ],
    roadClass: 'arterial',
  };

  const roadB: CityRoad = {
    id: 'road_B',
    laneCount: 4,
    laneWidth: 3.5,
    travelDirection: 'two-way',
    speedLimit: 60,
    centerline: [
      { x: 20, y: 0, z: 120 },
      { x: 120, y: 0, z: 120 },
    ],
    roadClass: 'arterial',
  };

  const intersection: CityIntersection = {
    id: 'int_1',
    type: 'cross_4lane',
    position: { x: 0, y: 0, z: 110 },
    rotation: 0,
    connections: [
      { roadId: 'road_A', end: 'end', port: 'south' },
      { roadId: 'road_B', end: 'start', port: 'east' },
    ],
    signalized: true,
  };

  const mockMap: CityMapData = {
    ...newCityMap(),
    id: 'test_city_map',
    name: 'Test City Map',
    bounds: { minX: -50, maxX: 150, minZ: -50, maxZ: 150 },
    roads: [roadA, roadB],
    intersections: [intersection],
  };

  // Test 1: LaneGraph creation and physical lane extraction
  const graph = LaneGraph.fromMap(mockMap);
  const lanes = graph.getAllLanes();
  check(lanes.length >= 8, 'extracts at least 8 lanes (4 per road) plus virtual connectors');

  const lane0 = graph.getLane('road_A:lane:0')!;
  check(lane0 !== undefined, 'road_A:lane:0 exists');
  check(lane0.width === 3.5, 'lane width is 3.5m');
  check(lane0.direction === 'reverse', 'lane 0 is reverse on two-way road');
  check(lane0.speedLimitKmh === 60, 'speed limit is 60 km/h');

  const lane2 = graph.getLane('road_A:lane:2')!;
  check(lane2 !== undefined, 'road_A:lane:2 exists');
  check(lane2.direction === 'forward', 'lane 2 is forward on two-way road');
  check(lane2.leftBoundary.type === 'double-yellow', 'inner boundary of two-way undivided road is double yellow');
  check(!lane2.laneChangeLeft, 'cannot legally change lane left over double yellow');

  const lane3 = graph.getLane('road_A:lane:3')!;
  check(lane3 !== undefined, 'road_A:lane:3 exists');
  check(lane2.rightLaneId === 'road_A:lane:3', 'lane 2 adjacent right lane is lane 3');
  check(lane2.laneChangeRight, 'can change lane right over broken white line');
  check(lane3.rightBoundary.type === 'solid-white', 'outer road edge is solid white');
  check(!lane3.laneChangeRight, 'cannot change right over solid white outer edge');

  // Test 2: Virtual junction connector lanes
  const vLanes = lanes.filter(l => l.isVirtual);
  check(vLanes.length > 0, 'generates virtual junction connector lanes');
  const rightTurn = vLanes.find(l => l.turnDirection === 'right');
  check(rightTurn !== undefined, 'identifies right turn virtual connector');
  check(rightTurn!.stopLine !== undefined, 'virtual connector has stop line at approach');
  check(rightTurn!.stopLine?.intersectionId === 'int_1', 'stop line belongs to intersection int_1');
  check(rightTurn!.trafficSignalId === 'signal:int_1', 'traffic signal associated with virtual lane');

  // Test 3: Curvature and heading properties
  check(rightTurn!.centerline.length >= 4, 'virtual curve sampled smoothly');
  const maxK = rightTurn!.curvatureProfile.maxCurvature;
  check(maxK > 0, 'right turn has non-zero curvature');

  // Test 4: Spatial queries
  const nearest = graph.findNearestLane(-1.75, 50, 0, 10);
  check(nearest !== undefined, 'findNearestLane finds lane near vehicle');
  check(nearest?.lane.id === 'road_A:lane:2', 'vehicle at x=-1.75 matches forward inner lane');
  check(Math.abs(nearest?.d ?? 99) < 0.5, 'lateral offset d close to zero');

  // Test 5: Route planning across lanes
  const route = graph.findRoute('road_A:lane:2', 'road_B:lane:2');
  check(route !== undefined && route.length >= 2, 'finds multi-lane route from road A through junction to road B');

  // Test 6: Validation report
  const report = graph.validate();
  check(report.totalLanes > 0, 'report has totalLanes');
  check(report.physicalLanes === 8, 'report has 8 physical lanes');

  // Test 7: RoadMarkingGovernance
  const canChangeBroken = RoadMarkingGovernance.canChangeLane('broken-white', false, false);
  const canChangeSolid = RoadMarkingGovernance.canChangeLane('solid-white', false, false);
  const canChangeDoubleYellow = RoadMarkingGovernance.canChangeLane('double-yellow', false, true);
  check(canChangeBroken === true, 'lane change permitted across broken-white');
  check(canChangeSolid === false, 'lane change forbidden across solid-white');
  check(canChangeDoubleYellow === false, 'lane change forbidden across double-yellow');

  return { passed: true, assertions };
}
