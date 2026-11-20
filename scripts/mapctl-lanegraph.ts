import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CityEditingKernel } from '../src/editor/CityEditingKernel';
import { LaneGraph } from '../src/world/navigation/lanegraph/LaneGraph';
import { RoadMarkingGovernance } from '../src/world/navigation/lanegraph/RoadMarkingGovernance';

export interface LaneGraphCommandContext {
  command: string;
  kernel: CityEditingKernel;
  request?: Record<string, unknown>;
  flags: Map<string, string>;
  source: string;
  output: (value: unknown) => void;
}

export function runLaneGraphCommand(ctx: LaneGraphCommandContext): boolean {
  if (ctx.command !== 'lane-graph') return false;

  const map = ctx.kernel.map;
  const graph = LaneGraph.fromMap(map);

  if (ctx.flags.has('inspect-lane')) {
    const laneId = ctx.flags.get('inspect-lane')!;
    const lane = graph.getLane(laneId);
    if (!lane) {
      ctx.output({ error: `Lane not found: ${laneId}` });
      return true;
    }
    const adjacent = graph.getAdjacentLanes(laneId);
    ctx.output({
      lane,
      adjacent,
      successors: graph.getSuccessors(laneId).map(l => l.id),
      predecessors: graph.getPredecessors(laneId).map(l => l.id),
    });
    return true;
  }

  if (ctx.flags.has('connectivity')) {
    const report = graph.validate();
    ctx.output({
      totalLanes: report.totalLanes,
      physicalLanes: report.physicalLanes,
      virtualLanes: report.virtualLanes,
      isolatedLanes: report.isolatedLanes,
      deadEnds: report.deadEnds,
      connected: report.isolatedLanes.length === 0,
    });
    return true;
  }

  if (ctx.flags.has('marking-conflicts')) {
    const conflicts = RoadMarkingGovernance.audit(map);
    ctx.output({
      mapId: map.id,
      totalConflicts: conflicts.length,
      conflicts,
    });
    return true;
  }

  // Full validation / dry-run report
  const validation = graph.validate();
  const summary = {
    command: 'lane-graph',
    source: ctx.source,
    mapId: map.id,
    dryRun: ctx.flags.has('dry-run') || !ctx.flags.has('out'),
    validation,
  };

  if (ctx.flags.has('out')) {
    const dest = resolve(ctx.flags.get('out')!);
    const exportData = {
      mapId: map.id,
      lanes: graph.getAllLanes(),
      validation,
    };
    writeFileSync(dest, JSON.stringify(exportData, null, 2), 'utf8');
    ctx.output({ ...summary, exportedTo: dest });
  } else {
    ctx.output(summary);
  }

  return true;
}
