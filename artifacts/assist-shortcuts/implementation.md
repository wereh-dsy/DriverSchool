# 驾驶辅助快捷键与灯光交互

## 行为

- Y：OFF → LDW → LKA → LCC → OFF，每次按下只切换一次。
- 十字键上短按：松开后切换 OFF → 示宽 → 近光 → 远光。
- 十字键上长按 0.65 秒：雾灯 OFF → 前雾灯 → 前后雾灯 → OFF。保持按住不重复，松开不再切换大灯。
- 十字键下：原有双闪开关，无长按动作。
- 雾灯延续现有供电规则：从大灯 OFF 开启雾灯时启用示宽灯；关闭主灯时清除雾灯。
- 设置中的雾灯按钮、键盘 F 与手柄长按共用同一个三段循环。

## 状态与仪表

输入流程为 GamepadInput → VehicleInputState → LaneAssistStateController → InstrumentTelemetry → 各车型仪表。

LaneAssistMode 使用 OFF、WARNING_ONLY、KEEP_ASSIST、CENTERING_ASSIST 枚举；统一控制器提供 setMode，供未来车机设置使用。切换后显示 Lane Assist 和 OFF / LDW / LKA / LCC，1.6 秒后隐藏提示，保留非 OFF 的小模式标识。BMW、Tesla、Audi 使用各自配色和布局。前、后雾灯分别使用绿色、琥珀色图标，不使用雾灯文字。

本轮为模式选择交互。Y 不请求现有 LCC SET，不生成转向需求；没有新增 LKA / LCC 算法、LDW 检测、ACC 或 ADAS 感知。

## 验证

- typecheck：通过。
- 定向 selftests：579 个断言通过（输入 154、模式状态 17、灯光 356、三套仪表渲染 52）。
- 覆盖长短按互斥、长按防重复、Y 的完整循环、双闪、断连后按键同步、前后雾灯独立输出、提示到期后停车状态也能重绘，以及熄火隐藏提示。
- pnpm run build -BasicValidation：通过，已发布 playable dist。遵循此前只做相关验证的要求，跳过 full core。
- 仪表采用实际 Canvas 渲染路径的记录测试；实体手柄手感和仪表视觉布局仍由用户驾驶确认。

## 本轮修改文件

- src/input/GamepadInput.ts
- src/input/VehicleInputState.ts
- src/input/VehicleInputSystem.ts
- src/input/VehicleInputSystem.selftest.ts
- src/input/KeyboardBindings.ts
- src/game/DrivingGame.ts
- src/vehicle/control/LaneAssistState.ts
- src/vehicle/control/LaneAssistState.selftest.ts
- src/vehicle/control/VehicleLightingController.ts
- src/vehicle/visual/VehicleLighting.ts
- src/vehicle/visual/VehicleLighting.selftest.ts
- src/vehicle/visual/InstrumentCluster.ts
- src/vehicle/visual/BMW530Instruments.ts
- src/vehicle/visual/ElectricCenterDisplay.ts
- src/vehicle/visual/LaneAssistSelectionDisplay.ts
- src/vehicle/visual/LaneAssistSelectionDisplay.selftest.ts
- src/ui/ControlSettingsPanel.ts
- src/ui/Hud.ts
- scripts/run-assist-shortcut-selftests.ts
- playable dist/index.html 及构建生成的资源

## 手动检查

依次选择 BMW530、Tesla、A6L，按 Y 观察完整循环与 1.6 秒提示；短按上键检查四段灯光，长按上键检查三段雾灯及前绿后琥珀图标；持续按住确认不会重复，松开确认不会额外切换大灯；按下键确认双闪保持原有行为。
