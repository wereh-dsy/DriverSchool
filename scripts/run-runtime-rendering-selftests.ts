import { runAdaptiveMirrorSelfTest } from '../src/camera/AdaptiveMirrorRendering.selftest';
import { runVisualStreamingSelfTest } from '../src/world/city/VisualStreaming.selftest';
console.log(JSON.stringify({ mirrors: runAdaptiveMirrorSelfTest(), streaming: runVisualStreamingSelfTest() }, null, 2));
