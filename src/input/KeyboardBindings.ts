export type KeyboardDrivingAction =
  | 'throttle'
  | 'brake'
  | 'steerLeft'
  | 'steerRight'
  | 'shiftUp'
  | 'shiftDown'
  | 'handbrake'
  | 'reverse'
  | 'neutral'
  | 'gear1'
  | 'gear2'
  | 'gear3'
  | 'gear4'
  | 'gear5'
  | 'gear6'
  | 'gear7'
  | 'toggleClutchMode'
  | 'clutchRelease'
  | 'clutchPress'
  | 'leftIndicator'
  | 'rightIndicator'
  | 'hazard'
  | 'cycleLights'
  | 'fogToggle'
  | 'highBeamFlash'
  | 'horn'
  | 'selectorPark'
  | 'selectorReverse'
  | 'selectorNeutral'
  | 'selectorDrive'
  | 'engineStart'
  | 'cruiseToggle';

export type KeyboardBindings = Record<KeyboardDrivingAction, string>;

export interface KeyboardBindingDefinition {
  readonly action: KeyboardDrivingAction;
  readonly label: string;
  readonly group: '驾驶' | '变速箱' | '离合器' | '车辆附件';
}

export const KEYBOARD_BINDING_DEFINITIONS: readonly KeyboardBindingDefinition[] = [
  { action: 'throttle', label: '油门', group: '驾驶' },
  { action: 'brake', label: '制动', group: '驾驶' },
  { action: 'steerLeft', label: '左转', group: '驾驶' },
  { action: 'steerRight', label: '右转', group: '驾驶' },
  { action: 'handbrake', label: '手刹', group: '驾驶' },
  { action: 'shiftUp', label: '升挡', group: '变速箱' },
  { action: 'shiftDown', label: '降挡', group: '变速箱' },
  { action: 'reverse', label: '倒挡', group: '变速箱' },
  { action: 'neutral', label: '空挡', group: '变速箱' },
  { action: 'gear1', label: '一挡', group: '变速箱' },
  { action: 'gear2', label: '二挡', group: '变速箱' },
  { action: 'gear3', label: '三挡', group: '变速箱' },
  { action: 'gear4', label: '四挡', group: '变速箱' },
  { action: 'gear5', label: '五挡', group: '变速箱' },
  { action: 'gear6', label: '六挡', group: '变速箱' },
  { action: 'gear7', label: '七挡', group: '变速箱' },
  { action: 'toggleClutchMode', label: '离合模式', group: '离合器' },
  { action: 'clutchRelease', label: '松离合', group: '离合器' },
  { action: 'clutchPress', label: '踩离合', group: '离合器' },
  { action: 'leftIndicator', label: '左转向灯', group: '车辆附件' },
  { action: 'rightIndicator', label: '右转向灯', group: '车辆附件' },
  { action: 'hazard', label: '双闪', group: '车辆附件' },
  { action: 'cycleLights', label: '切换灯光', group: '车辆附件' },
  { action: 'fogToggle', label: '前后雾灯', group: '车辆附件' },
  { action: 'highBeamFlash', label: '闪远光（按住）', group: '车辆附件' },
  { action: 'horn', label: '喇叭（按住）', group: '车辆附件' },
  { action: 'selectorPark', label: '自动挡 P 驻车', group: '车辆附件' },
  { action: 'selectorReverse', label: '自动挡 R 倒车', group: '车辆附件' },
  { action: 'selectorNeutral', label: '自动挡 N 空挡', group: '车辆附件' },
  { action: 'selectorDrive', label: '自动挡 D 前进', group: '车辆附件' },
  { action: 'engineStart', label: '发动机开关（点火/熄火）', group: '车辆附件' },
  { action: 'cruiseToggle', label: '定速巡航开关', group: '车辆附件' },
] as const;

export const DEFAULT_KEYBOARD_BINDINGS: Readonly<KeyboardBindings> = Object.freeze({
  throttle: 'KeyW',
  brake: 'KeyS',
  steerLeft: 'KeyA',
  steerRight: 'KeyD',
  shiftUp: 'KeyE',
  shiftDown: 'KeyQ',
  handbrake: 'Space',
  reverse: 'KeyR',
  neutral: 'KeyN',
  gear1: 'Digit1',
  gear2: 'Digit2',
  gear3: 'Digit3',
  gear4: 'Digit4',
  gear5: 'Digit5',
  gear6: 'Digit6',
  gear7: 'Digit7',
  toggleClutchMode: 'KeyM',
  clutchRelease: 'KeyZ',
  clutchPress: 'KeyX',
  leftIndicator: 'KeyJ',
  rightIndicator: 'KeyK',
  hazard: 'KeyH',
  cycleLights: 'KeyL',
  fogToggle: 'KeyF',
  highBeamFlash: 'ShiftLeft',
  horn: 'KeyO',
  selectorPark: 'KeyP',
  selectorReverse: 'BracketLeft',
  selectorNeutral: 'Backslash',
  selectorDrive: 'BracketRight',
  engineStart: 'KeyI',
  cruiseToggle: 'KeyV',
});

/** Keys owned by the game shell rather than the keyboard driving adapter. */
export const RESERVED_GAME_KEYS = new Set([
  'Escape', 'Enter', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F12',
  'Backspace', 'KeyC',
]);

export function createKeyboardBindings(
  overrides?: Partial<KeyboardBindings> | null,
): KeyboardBindings {
  const bindings = { ...DEFAULT_KEYBOARD_BINDINGS };
  if (overrides === undefined || overrides === null) return bindings;

  for (const definition of KEYBOARD_BINDING_DEFINITIONS) {
    const candidate = overrides[definition.action];
    if (
      typeof candidate !== 'string' ||
      candidate.length === 0 ||
      RESERVED_GAME_KEYS.has(candidate) ||
      candidate.startsWith('F')
    ) continue;

    const previousCode = bindings[definition.action];
    const conflictingAction = (Object.keys(bindings) as KeyboardDrivingAction[])
      .find((action) => action !== definition.action && bindings[action] === candidate);
    bindings[definition.action] = candidate;
    if (conflictingAction !== undefined) bindings[conflictingAction] = previousCode;
  }
  return bindings;
}

export function formatKeyboardCode(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return `小键盘 ${code.slice(6)}`;
  const labels: Record<string, string> = {
    Space: '空格',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    ShiftLeft: '左 Shift',
    ShiftRight: '右 Shift',
    ControlLeft: '左 Ctrl',
    ControlRight: '右 Ctrl',
    AltLeft: '左 Alt',
    AltRight: '右 Alt',
    BracketLeft: '[',
    BracketRight: ']',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backslash: '\\',
    Minus: '-',
    Equal: '=',
  };
  return labels[code] ?? code;
}
