import type { Scene } from 'three';
import type { DrivingGround } from '../../world/DrivingGround';
import { TrajectoryPredictor, type TrajectoryGeometry, type TrajectoryState } from './TrajectoryPredictor';
import { TrajectoryPredictionView } from './TrajectoryPredictionView';

/** Optional presentation feature. Never writes vehicle state or requests controls. */
export class TrajectoryPrediction {
  private readonly predictor = new TrajectoryPredictor();
  private readonly view: TrajectoryPredictionView;
  private elapsed = Infinity;

  public constructor(scene: Scene) { this.view = new TrajectoryPredictionView(scene); }

  public update(dt: number, state: Readonly<TrajectoryState>, geometry: TrajectoryGeometry,
    ground: Pick<DrivingGround, 'getRoadHeightAt'>, active: boolean): void {
    if (!active) { this.view.hide(); this.elapsed = Infinity; return; }
    this.elapsed += dt;
    if (this.elapsed < 0.05) return;
    this.elapsed = 0;
    this.view.update(this.predictor.predict(state, geometry), ground, geometry);
  }

  public dispose(): void { this.view.dispose(); }
}
