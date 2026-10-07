import type { CityMapData } from '../world/city/CityMapData';
/** Atomic multi-object edits, including connections; bounded to 64 operations. */
export class CityEditorHistory {
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  record(before: CityMapData, after: CityMapData): void {
    const snapshot = JSON.stringify(before);
    if (snapshot === JSON.stringify(after)) return;
    this.undoStack.push(snapshot); if (this.undoStack.length > 64) this.undoStack.shift(); this.redoStack.length = 0;
  }
  undo(current: CityMapData): CityMapData | null {
    const snapshot = this.undoStack.pop(); if (!snapshot) return null;
    this.redoStack.push(JSON.stringify(current)); return JSON.parse(snapshot) as CityMapData;
  }
  redo(current: CityMapData): CityMapData | null {
    const snapshot = this.redoStack.pop(); if (!snapshot) return null;
    this.undoStack.push(JSON.stringify(current)); return JSON.parse(snapshot) as CityMapData;
  }
  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
}
