import type { CityMapData } from '../world/city/CityMapData';
/** Atomic multi-object edits, including connections; bounded to 64 operations. */
export class CityEditorHistory {
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private transactions: { before: CityMapData; after: CityMapData; label: string }[] = [];
  private undone: { before: CityMapData; after: CityMapData; label: string }[] = [];
  /** Kernel maps are immutable snapshots sharing untouched objects. No whole-map serialization. */
  recordTransaction(before: CityMapData, after: CityMapData, label: string): void {
    if (before === after) return;
    this.transactions.push({ before, after, label });
    if (this.transactions.length > 64) this.transactions.shift();
    this.undone.length = 0;
  }
  record(before: CityMapData, after: CityMapData): void {
    const snapshot = JSON.stringify(before);
    if (snapshot === JSON.stringify(after)) return;
    this.undoStack.push(snapshot); if (this.undoStack.length > 64) this.undoStack.shift(); this.redoStack.length = 0;
  }
  undo(current: CityMapData): CityMapData | null {
    const transaction = this.transactions.pop();
    if (transaction) { this.undone.push(transaction); return transaction.before; }
    const snapshot = this.undoStack.pop(); if (!snapshot) return null;
    this.redoStack.push(JSON.stringify(current)); return JSON.parse(snapshot) as CityMapData;
  }
  redo(current: CityMapData): CityMapData | null {
    const transaction = this.undone.pop();
    if (transaction) { this.transactions.push(transaction); return transaction.after; }
    const snapshot = this.redoStack.pop(); if (!snapshot) return null;
    this.undoStack.push(JSON.stringify(current)); return JSON.parse(snapshot) as CityMapData;
  }
  get canUndo(): boolean { return this.transactions.length > 0 || this.undoStack.length > 0; }
  get canRedo(): boolean { return this.undone.length > 0 || this.redoStack.length > 0; }
}
