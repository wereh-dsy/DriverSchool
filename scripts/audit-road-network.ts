import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { loadCityMap } from '../src/world/city/CityMapLoader';
import { CityEditingKernel } from '../src/editor/CityEditingKernel';
import { LaneGraph } from '../src/world/navigation/lanegraph/LaneGraph';
import { LaneGraphBuilder } from '../src/world/navigation/lanegraph/LaneGraphBuilder';
import type { CityRoad, CityMap } from '../src/world/city/CityMapTypes';

export interface AuditIssue {
  category:
    | 'highway_median'
    | 'ramp_gore_connection'
    | 'service_road_connection'
    | 'lane_graph_connectivity'
    | 'prop_drivable_encroachment'
    | 'invisible_collider'
    | 'marking_geometry_mismatch';
  severity: 'error' | 'warning' | 'info';
  roadId?: string;
  intersectionId?: string;
  propId?: string;
  location?: { x: number; y: number; z: number };
  description: string;
  recommendation: string;
}

export interface MapAuditReport {
  mapName: string;
  timestamp: string;
  totalRoads: number;
  totalIntersections: number;
  totalProps: number;
  totalLanes: number;
  issues: AuditIssue[];
  summary: {
    errors: number;
    warnings: number;
    infos: number;
    byCategory: Record<string, number>;
  };
}

export function auditRoadMap(mapPath: string, mapName: string): MapAuditReport {
  const raw = readFileSync(resolve(mapPath), 'utf8').replace(/^\uFEFF/, '');
  const data: CityMap = JSON.parse(raw);
  const city = loadCityMap(data);
  const kernel = new CityEditingKernel(city);
  const issues: AuditIssue[] = [];

  const roads = city.roads || [];
  const intersections = city.intersections || [];
  const props = city.props || [];
  const colliders = (city as any).colliders || [];

  // Build LaneGraph for semantic connectivity checks
  let laneCount = 0;
  try {
    const laneGraph = LaneGraph.fromMap(data as any);
    const allLanes = laneGraph.getAllLanes();
    laneCount = allLanes.length;

    // Check LaneGraph connectivity
    for (const lane of allLanes) {
      // 1. Successor / Predecessor integrity
      for (const succId of lane.successors) {
        if (!laneGraph.getLane(succId)) {
          issues.push({
            category: 'lane_graph_connectivity',
            severity: 'error',
            roadId: lane.roadId,
            description: `车道 ${lane.id} 的后继车道 ${succId} 在 LaneGraph 中不存在`,
            recommendation: '修复路口连接或车道连续性映射',
          });
        }
      }

      // 2. Highway ramp connectivity
      const road = city.roads.find(r => r.id === lane.roadId);
      if (road && (road.roadType === 'ramp' || (road.speedLimit && road.speedLimit <= 45))) {
        if (lane.leftLaneId && lane.rightLaneId) {
          issues.push({
            category: 'lane_graph_connectivity',
            severity: 'info',
            roadId: lane.roadId,
            description: `匝道车道 ${lane.id} 左右两侧均有邻车道 (多车道匝道)`,
            recommendation: '核实匝道分流/合流几何',
          });
        }
      }
    }
  } catch (err: any) {
    issues.push({
      category: 'lane_graph_connectivity',
      severity: 'error',
      description: `LaneGraph 构建发生异常: ${err.message}`,
      recommendation: '检查原始道路几何是否自闭环或存在NaN',
    });
  }

  // 1. Check Highway / Expressway Medians & Markings
  for (const road of roads) {
    const isHighway = (road.speedLimit && road.speedLimit >= 70) || road.roadType === 'highway' || road.name?.includes('高速') || road.name?.includes('快速');
    if (isHighway) {
      // Highway should have a physical barrier or proper median separator
      if (!road.hasMedian && !road.medianWidth && road.forwardLanes > 0 && road.backwardLanes > 0) {
        issues.push({
          category: 'highway_median',
          severity: 'warning',
          roadId: road.id,
          location: road.centerline[0],
          description: `高速/快速路 ${road.name || road.id} (限速 ${road.speedLimit}km/h) 具有双向车道但未配置中央物理隔离带`,
          recommendation: '建议配置中央绿化隔离带或混凝土防撞护栏，避免逆向对撞风险',
        });
      }

      // Check speed limit sanity
      if (road.speedLimit && (road.speedLimit < 60 || road.speedLimit > 130)) {
        issues.push({
          category: 'highway_median',
          severity: 'warning',
          roadId: road.id,
          description: `高速公路 ${road.id} 限速异常 (${road.speedLimit} km/h)`,
          recommendation: '调整为标准高速限速区间 (80-120 km/h)',
        });
      }
    }

    // 2. Check Ramp vs Mainline Connections
    if (road.roadType === 'ramp') {
      if (!road.speedLimit) {
        issues.push({
          category: 'ramp_gore_connection',
          severity: 'info',
          roadId: road.id,
          description: `匝道 ${road.id} 未显式指定限速，系统将回退为默认匝道限速 (35-40 km/h)`,
          recommendation: '建议显式配置 speedLimit: 40',
        });
      }
      // Check curvature of ramp centerline
      for (let i = 1; i < road.centerline.length - 1; i++) {
        const p0 = road.centerline[i - 1]!;
        const p1 = road.centerline[i]!;
        const p2 = road.centerline[i + 1]!;
        const d1x = p1.x - p0.x, d1z = p1.z - p0.z;
        const d2x = p2.x - p1.x, d2z = p2.z - p1.z;
        const cross = d1x * d2z - d1z * d2x;
        const dot = d1x * d2x + d1z * d2z;
        const angle = Math.abs(Math.atan2(cross, dot));
        if (angle > 1.2) {
          issues.push({
            category: 'ramp_gore_connection',
            severity: 'warning',
            roadId: road.id,
            location: p1,
            description: `匝道 ${road.id} 在路点 ${i} 处曲率急剧变化 (转折角 ${(angle * 180 / Math.PI).toFixed(1)}°)，可能引起低速顿挫`,
            recommendation: '使用平滑曲线细化匝道曲率过渡',
          });
        }
      }
    }

    // 3. Road Markings vs Road Geometry Alignment
    const totalLanes = (road.forwardLanes || 1) + (road.backwardLanes || 0);
    const laneWidth = (road as any).laneWidth || 3.5;
    const expectedWidth = totalLanes * laneWidth + (road.medianWidth || 0);
    if (road.width && Math.abs(road.width - expectedWidth) > 3.0) {
      issues.push({
        category: 'marking_geometry_mismatch',
        severity: 'info',
        roadId: road.id,
        description: `道路 ${road.id} 物理宽度 (${road.width.toFixed(1)}m) 与车道总宽 (${expectedWidth.toFixed(1)}m) 存在明显边距差异`,
        recommendation: '核实是否存在加宽应急车道或路肩，确保横向控制走廊匹配',
      });
    }
  }

  // 4. Props & Colliders Encroaching on Drivable Area
  for (const prop of props) {
    if (!prop.position) continue;
    const px = prop.position.x;
    const pz = prop.position.z;
    for (const road of roads) {
      const hw = (road.width || 7) * 0.5;
      for (let i = 1; i < road.centerline.length; i++) {
        const a = road.centerline[i - 1]!;
        const b = road.centerline[i]!;
        const dx = b.x - a.x, dz = b.z - a.z;
        const lenSq = dx * dx + dz * dz;
        if (lenSq < 0.01) continue;
        const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / lenSq));
        const cx = a.x + dx * t, cz = a.z + dz * t;
        const dist = Math.hypot(px - cx, pz - cz);
        if (dist < hw - 0.4) {
          // Object inside drivable road surface!
          const propType = prop.type || prop.model || 'prop';
          const isSignalPole = propType.includes('signal') || propType.includes('pole') || propType.includes('light');
          issues.push({
            category: 'prop_drivable_encroachment',
            severity: isSignalPole ? 'error' : 'warning',
            propId: prop.id,
            roadId: road.id,
            location: { x: px, y: prop.position.y ?? 0, z: pz },
            description: `物件 ${prop.id} (${propType}) 位于道路 ${road.id} 的有效通行区域内 (距中心线 ${dist.toFixed(2)}m，半路宽 ${hw.toFixed(2)}m)`,
            recommendation: '将支撑柱/路牌移动到路肩或人行道外侧',
          });
          break;
        }
      }
    }
  }

  const byCat: Record<string, number> = {};
  let errors = 0, warnings = 0, infos = 0;
  for (const issue of issues) {
    byCat[issue.category] = (byCat[issue.category] || 0) + 1;
    if (issue.severity === 'error') errors++;
    else if (issue.severity === 'warning') warnings++;
    else infos++;
  }

  return {
    mapName,
    timestamp: new Date().toISOString(),
    totalRoads: roads.length,
    totalIntersections: intersections.length,
    totalProps: props.length,
    totalLanes: laneCount,
    issues,
    summary: {
      errors,
      warnings,
      infos,
      byCategory: byCat,
    },
  };
}

if (true) {
  console.log('Auditing road networks for ADAS V3...');
  const regionalReport = auditRoadMap('src/world/regional/regional-main.json', 'regional-main');
  console.log(`Regional Main: ${regionalReport.totalRoads} roads, ${regionalReport.totalLanes} lanes, ${regionalReport.issues.length} findings (${regionalReport.summary.errors} errors, ${regionalReport.summary.warnings} warnings, ${regionalReport.summary.infos} infos).`);

  const cityReport = auditRoadMap('src/world/city/maps/city-alpha.json', 'city-alpha');
  console.log(`City Alpha: ${cityReport.totalRoads} roads, ${cityReport.totalLanes} lanes, ${cityReport.issues.length} findings (${cityReport.summary.errors} errors, ${cityReport.summary.warnings} warnings, ${cityReport.summary.infos} infos).`);

  mkdirSync('artifacts', { recursive: true });
  writeFileSync('artifacts/road-network-audit.json', JSON.stringify({ regionalReport, cityReport }, null, 2), 'utf8');
  console.log('Saved audit report to artifacts/road-network-audit.json');
}
