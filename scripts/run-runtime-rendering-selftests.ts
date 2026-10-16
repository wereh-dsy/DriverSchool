import { runAdaptiveMirrorSelfTest } from '../src/camera/AdaptiveMirrorRendering.selftest';
import { runVisualStreamingSelfTest } from '../src/world/city/VisualStreaming.selftest';
import { runVisualStreamingLifecycleSelfTest } from '../src/world/city/VisualStreamingLifecycle.selftest';
console.log(JSON.stringify({ mirrors: runAdaptiveMirrorSelfTest(), streaming: runVisualStreamingSelfTest(), lifecycle: await runVisualStreamingLifecycleSelfTest() }, null, 2));
