import type { ScenarioDebugger } from './ScenarioDebugger';
import { ScenarioDebuggerPanelView } from './ScenarioDebuggerPanelView';

/**
 * Standalone F10 floating window wrapping the shared ScenarioDebuggerPanelView.
 * Keeps independent lifecycle from Driving Lab HUD and Navigation HUD.
 */
export class ScenarioDebuggerHUD {
  private readonly root: HTMLDivElement | null = null;
  private readonly bodyWrap: HTMLDivElement | null = null;
  private readonly panelView: ScenarioDebuggerPanelView | null = null;
  private readonly foldBtn: HTMLButtonElement | null = null;
  private readonly cleanupFns: Array<() => void> = [];
  private _isOpen = false;
  private folded = false;

  public get isOpen(): boolean {
    return this._isOpen;
  }

  public constructor(
    debuggerInstance: ScenarioDebugger,
    host?: HTMLElement,
  ) {
    if (typeof document === 'undefined') return;

    const root = document.createElement('div');
    root.id = 'scenario-debugger-hud';
    root.style.cssText = `
      position: fixed;
      top: 52px;
      right: 18px;
      width: 470px;
      max-width: calc(100vw - 36px);
      max-height: calc(100vh - 76px);
      background: rgba(15, 23, 42, 0.94);
      backdrop-filter: blur(8px);
      color: #f1f5f9;
      font: 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Microsoft YaHei", sans-serif;
      border: 1px solid #334155;
      border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.55);
      z-index: 10000;
      display: none;
      flex-direction: column;
      overflow: hidden;
      user-select: none;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 9px 14px;
      background: rgba(30, 41, 59, 0.9);
      border-bottom: 1px solid #334155;
      cursor: move;
    `;
    const title = document.createElement('div');
    title.innerHTML = '<strong>⚡ ADAS 场景调试器</strong> <span style="font-size:11px;color:#94a3b8;">(F10 独立开关)</span>';

    const headerRight = document.createElement('div');
    headerRight.style.cssText = 'display:flex;align-items:center;gap:6px;';

    const foldBtn = document.createElement('button');
    foldBtn.type = 'button';
    foldBtn.textContent = '▾';
    foldBtn.title = '折叠 / 展开';
    foldBtn.style.cssText = 'background:transparent;border:none;color:#cbd5e1;font-size:14px;cursor:pointer;padding:2px 6px;';
    foldBtn.onclick = (e) => {
      e.stopPropagation();
      this.folded = !this.folded;
      if (this.bodyWrap) this.bodyWrap.style.display = this.folded ? 'none' : 'block';
      foldBtn.textContent = this.folded ? '▸' : '▾';
    };

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '✕';
    closeBtn.title = '关闭 (F10)';
    closeBtn.style.cssText = 'background:transparent;border:none;color:#94a3b8;font-size:15px;cursor:pointer;line-height:1;padding:2px 6px;';
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      this.hide();
    };

    headerRight.append(foldBtn, closeBtn);
    header.append(title, headerRight);
    root.appendChild(header);

    const bodyWrap = document.createElement('div');
    bodyWrap.style.cssText = 'padding:10px 12px;overflow-y:auto;max-height:calc(100vh - 128px);';
    const panelView = new ScenarioDebuggerPanelView(debuggerInstance);
    bodyWrap.appendChild(panelView.element);
    root.appendChild(bodyWrap);

    for (const evt of ['keydown', 'keyup', 'pointerdown']) {
      const stop = (e: Event) => e.stopPropagation();
      root.addEventListener(evt, stop);
      this.cleanupFns.push(() => root.removeEventListener(evt, stop));
    }

    // Draggable header
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    const onPointerDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'BUTTON') return;
      dragging = true;
      const rect = root.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      root.style.right = 'auto';
      root.style.left = `${startLeft}px`;
      root.style.top = `${startTop}px`;
      e.stopPropagation();
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const nx = Math.max(8, Math.min(window.innerWidth - 120, startLeft + (e.clientX - startX)));
      const ny = Math.max(8, Math.min(window.innerHeight - 48, startTop + (e.clientY - startY)));
      root.style.left = `${nx}px`;
      root.style.top = `${ny}px`;
    };
    const onPointerUp = () => { dragging = false; };
    header.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    this.cleanupFns.push(() => {
      header.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    });

    const container = host || document.body;
    container?.appendChild(root);

    this.root = root;
    this.bodyWrap = bodyWrap;
    this.panelView = panelView;
    this.foldBtn = foldBtn;
  }

  public toggle(): void {
    if (this._isOpen) this.hide();
    else this.show();
  }

  public show(): void {
    if (!this.root) return;
    this._isOpen = true;
    this.root.style.display = 'flex';
    if (this.folded && this.bodyWrap && this.foldBtn) {
      this.folded = false;
      this.bodyWrap.style.display = 'block';
      this.foldBtn.textContent = '▾';
    }
    this.panelView?.setRefreshActive(true);
  }

  public hide(): void {
    if (!this.root) return;
    this._isOpen = false;
    this.root.style.display = 'none';
    this.panelView?.setRefreshActive(false);
  }

  public refreshTable(): void {
    this.panelView?.refresh();
  }

  public dispose(): void {
    this._isOpen = false;
    for (const fn of this.cleanupFns) fn();
    this.cleanupFns.length = 0;
    this.panelView?.dispose();
    this.root?.remove();
  }
}
